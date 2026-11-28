package main

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"io"
	"log"
	"mime"
	"net"
	"net/http"
	"net/netip"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed schema.sql
var schema string

type application struct {
	db             *pgxpool.Pool
	secureCookies  bool
	passwordSlots  chan struct{}
	trustedProxies []netip.Prefix
	authMailJobs   chan authMailJob
}

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return errors.New("DATABASE_URL is required")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	startup, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	db, err := pgxpool.New(startup, databaseURL)
	if err != nil {
		return errors.New("invalid DATABASE_URL")
	}
	defer db.Close()
	if err := db.Ping(startup); err != nil {
		return errors.New("could not connect to PostgreSQL")
	}
	if len(os.Args) == 2 && os.Args[1] == "migrate" {
		return migrate(startup, db)
	}
	if len(os.Args) != 1 {
		return errors.New("usage: jospat [migrate]")
	}
	addr := os.Getenv("JOSPAT_ADDR")
	if addr == "" {
		addr = "127.0.0.1:8080"
	}
	secureCookies := os.Getenv("JOSPAT_INSECURE_DEV") != "1"
	if !secureCookies {
		host, _, err := net.SplitHostPort(addr)
		if err != nil || net.ParseIP(host) == nil || !net.ParseIP(host).IsLoopback() {
			return errors.New("insecure development cookies require a loopback address")
		}
	}
	proxies, err := parseTrustedProxies(os.Getenv("JOSPAT_TRUSTED_PROXIES"))
	if err != nil {
		return err
	}
	sender, err := authMailSender(secureCookies)
	if err != nil {
		return err
	}
	app := &application{db: db, secureCookies: secureCookies, passwordSlots: make(chan struct{}, 4),
		trustedProxies: proxies, authMailJobs: make(chan authMailJob, 64)}
	go app.deliverAuthMail(ctx, sender)
	go app.cleanupAuth(ctx)
	server := &http.Server{Addr: addr, Handler: app.routes(), ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout: 10 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: time.Minute}
	stopped := make(chan struct{})
	go func() {
		defer close(stopped)
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if server.Shutdown(shutdown) != nil {
			_ = server.Close()
		}
	}()
	log.Printf("JOSPAT API listening on %s", addr)
	err = server.ListenAndServe()
	if errors.Is(err, http.ErrServerClosed) {
		<-stopped
		return nil
	}
	return err
}

func migrate(ctx context.Context, db *pgxpool.Pool) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(1257153058)`); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, schema); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (app *application) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", app.health)
	mux.HandleFunc("POST /api/auth/register", app.register)
	mux.HandleFunc("POST /api/auth/login", app.login)
	mux.HandleFunc("POST /api/auth/verify-email", app.verifyEmail)
	mux.HandleFunc("POST /api/auth/resend-verification", app.resendVerification)
	mux.HandleFunc("POST /api/auth/forgot-password", app.forgotPassword)
	mux.HandleFunc("POST /api/auth/reset-password", app.resetPassword)
	mux.HandleFunc("POST /api/auth/logout", app.logout)
	mux.HandleFunc("GET /api/auth/me", app.authenticated(app.me))
	mux.HandleFunc("GET /api/events", app.authenticated(app.listEvents))
	mux.HandleFunc("POST /api/events", app.authenticated(app.createEvent))
	mux.HandleFunc("PUT /api/events/{id}", app.authenticated(app.updateEvent))
	mux.HandleFunc("DELETE /api/events/{id}", app.authenticated(app.deleteEvent))
	mux.HandleFunc("GET /api/tasks", app.authenticated(app.listTasks))
	mux.HandleFunc("POST /api/tasks", app.authenticated(app.createTask))
	mux.HandleFunc("PUT /api/tasks/{id}", app.authenticated(app.editTask))
	mux.HandleFunc("PATCH /api/tasks/{id}", app.authenticated(app.renameTask))
	mux.HandleFunc("DELETE /api/tasks/{id}", app.authenticated(app.deleteTask))
	mux.HandleFunc("POST /api/tasks/{id}/move", app.authenticated(app.moveTask))
	mux.HandleFunc("PUT /api/tasks/{id}/done", app.authenticated(app.setTaskDone))
	mux.HandleFunc("PUT /api/tasks/{id}/featured", app.authenticated(app.setTaskFeatured))
	mux.HandleFunc("POST /api/tasks/copy-today", app.authenticated(app.copyTodayTasks))
	mux.HandleFunc("PUT /api/task-order", app.authenticated(app.setTaskOrder))
	mux.HandleFunc("POST /api/import/jospat", app.authenticated(app.importBackup))
	guard := http.NewCrossOriginProtection()
	guard.SetDenyHandler(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		fail(w, http.StatusForbidden, "cross_origin_request")
	}))
	return guard.Handler(mux)
}

func (app *application) health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := app.db.Ping(ctx); err != nil {
		fail(w, http.StatusServiceUnavailable, "database_unavailable")
		return
	}
	respond(w, http.StatusOK, map[string]string{"status": "ok"})
}

func readJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	return readJSONBody(w, r, dst, 16<<10, true)
}

func readJSONBody(w http.ResponseWriter, r *http.Request, dst any, limit int64, strict bool) bool {
	mediaType, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if mediaType != "application/json" {
		fail(w, http.StatusUnsupportedMediaType, "expected_json")
		return false
	}
	if r.ContentLength > limit {
		fail(w, http.StatusRequestEntityTooLarge, "json_too_large")
		return false
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, limit))
	if strict {
		decoder.DisallowUnknownFields()
	}
	err := decoder.Decode(dst)
	if err == nil {
		err = decoder.Decode(new(json.RawMessage))
		if err == io.EOF {
			return true
		}
	}
	var oversized *http.MaxBytesError
	if errors.As(err, &oversized) {
		fail(w, http.StatusRequestEntityTooLarge, "json_too_large")
	} else {
		fail(w, http.StatusBadRequest, "invalid_json")
	}
	return false
}

func respond(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func fail(w http.ResponseWriter, status int, code string) {
	respond(w, status, map[string]string{"error": code})
}

func databaseError(w http.ResponseWriter, operation string, err error) {
	log.Printf("%s: %T", operation, err)
	fail(w, http.StatusInternalServerError, "internal_error")
}
