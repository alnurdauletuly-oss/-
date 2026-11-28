package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestCalendarInput(t *testing.T) {
	if !validDate("2024-02-29") || validDate("2026-02-29") || validDate("0000-01-01") {
		t.Fatal("calendar date validation is incorrect")
	}
	if !validClock("08:30") || !validClock("23:59:59") || validClock("24:00") || validClock("8:30") {
		t.Fatal("clock validation is incorrect")
	}
}

type apiRequest func(method, path, body string, cookie *http.Cookie, version string, expected int) *httptest.ResponseRecorder

func testAPI(t *testing.T) (apiRequest, func(string) *http.Cookie) {
	t.Helper()
	request, login, _, _ := testAPIWithMail(t)
	return request, login
}

func testAPIWithMail(t *testing.T) (apiRequest, func(string) *http.Cookie, func(string, string) authMessage, *pgxpool.Pool) {
	t.Helper()
	url := os.Getenv("JOSPAT_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("JOSPAT_TEST_DATABASE_URL is unset")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	t.Cleanup(cancel)
	root, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(root.Close)
	var random [8]byte
	rand.Read(random[:])
	name := "jospat_test_" + hex.EncodeToString(random[:])
	if _, err := root.Exec(ctx, "CREATE SCHEMA "+name); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if _, err := root.Exec(cleanup, "DROP SCHEMA "+name+" CASCADE"); err != nil {
			t.Error(err)
		}
	})
	config, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	config.ConnConfig.RuntimeParams["search_path"] = name
	db, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	if err := migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	if err := migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	app := &application{db: db, secureCookies: true, passwordSlots: make(chan struct{}, 4), authMailJobs: make(chan authMailJob, 64)}
	mailbox := make(chan authMessage, 16)
	mailCtx, stopMail := context.WithCancel(ctx)
	mailStopped := make(chan struct{})
	go func() {
		defer close(mailStopped)
		app.deliverAuthMail(mailCtx, func(ctx context.Context, message authMessage) error {
			select {
			case mailbox <- message:
				return nil
			case <-ctx.Done():
				return ctx.Err()
			}
		})
	}()
	t.Cleanup(func() { stopMail(); <-mailStopped })
	receive := func(email, purpose string) authMessage {
		t.Helper()
		receiveCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		defer cancel()
		select {
		case message := <-mailbox:
			if message.email != email || message.purpose != purpose {
				t.Fatalf("unexpected mail recipient or purpose: %s %s", message.email, message.purpose)
			}
			return message
		case <-receiveCtx.Done():
			t.Fatalf("no %s message for %s", purpose, email)
			return authMessage{}
		}
	}
	handler := app.routes()
	request := func(method, path, body string, cookie *http.Cookie, version string, expected int) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(method, path, strings.NewReader(body)).WithContext(ctx)
		req.Header.Set("Content-Type", "application/json")
		if cookie != nil {
			req.AddCookie(cookie)
		}
		if version != "" {
			req.Header.Set("If-Match", version)
		}
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, req)
		if res.Code != expected {
			t.Fatalf("%s %s: expected %d, got %d: %s", method, path, expected, res.Code, res.Body)
		}
		return res
	}
	login := func(email string) *http.Cookie {
		t.Helper()
		body := `{"email":"` + email + `","password":"a long test passphrase"}`
		request("POST", "/api/auth/register", body, nil, "", 201)
		verification := receive(email, "verify")
		request("POST", "/api/auth/verify-email", `{"token":"`+verification.token+`","password":"a long test passphrase"}`, nil, "", 204)
		res := request("POST", "/api/auth/login", body, nil, "", 200)
		cookies := res.Result().Cookies()
		if len(cookies) != 1 || !cookies[0].HttpOnly || !cookies[0].Secure || cookies[0].Path != "/" {
			t.Fatal("login did not issue a protected session cookie")
		}
		return cookies[0]
	}
	return request, login, receive, db
}

func TestAccountAndCalendar(t *testing.T) {
	request, login := testAPI(t)
	request("GET", "/api/events", "", nil, "", 401)
	owner, other := login("owner@example.test"), login("other@example.test")
	request("GET", "/api/auth/me", "", owner, "", 200)
	request("POST", "/api/auth/login", `{"email":"owner@example.test","password":"a different passphrase"}`, nil, "", 401)
	body := `{"id":"event-first","name":"Встреча","date":"2026-11-28","time":"15:30"}`
	created := request("POST", "/api/events", body, owner, "", 201)
	var event calendarEvent
	if err := json.Unmarshal(created.Body.Bytes(), &event); err != nil || event.ID != "event-first" || event.Time != "15:30" || event.Version != 1 {
		t.Fatalf("unexpected event response: %s (%v)", created.Body, err)
	}
	request("POST", "/api/events", body, owner, "", 409)
	list := request("GET", "/api/events?from=2026-11-28&to=2026-11-28", "", owner, "", 200)
	if !strings.Contains(list.Body.String(), "event-first") {
		t.Fatalf("calendar date filter lost the event: %s", list.Body)
	}
	list = request("GET", "/api/events", "", other, "", 200)
	if strings.TrimSpace(list.Body.String()) != "[]" {
		t.Fatalf("another user's calendar contains the event: %s", list.Body)
	}
	request("PUT", "/api/events/event-first", body, other, `"1"`, 404)
	request("DELETE", "/api/events/event-first", "", other, `"1"`, 404)
	request("PUT", "/api/events/event-first", body, owner, "", 428)
	request("PUT", "/api/events/event-first", body, owner, `"1"`, 200)
	request("DELETE", "/api/events/event-first", "", owner, `"1"`, 412)
	request("DELETE", "/api/events/event-first", "", owner, `"2"`, 204)
	request("POST", "/api/auth/logout", "", owner, "", 204)
	request("GET", "/api/auth/me", "", owner, "", 401)
}
