package main

import (
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"errors"
	"net/http"
	"net/mail"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
)

const sessionAge = 7 * 24 * time.Hour

type credentials struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type user struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}

func (app *application) credentials(w http.ResponseWriter, r *http.Request) (credentials, bool) {
	var data credentials
	if !readJSON(w, r, &data) {
		return data, false
	}
	data.Email = strings.ToLower(strings.TrimSpace(data.Email))
	if !validEmail(data.Email) || !validPassword(data.Password) {
		fail(w, http.StatusBadRequest, "invalid_credentials_format")
		return data, false
	}
	return data, true
}

func validEmail(email string) bool {
	if email == "" || len(email) > 254 {
		return false
	}
	address, err := mail.ParseAddress(email)
	return err == nil && address.Address == email && !strings.ContainsAny(email, "\r\n")
}

func validPassword(password string) bool {
	return len(password) <= 512 && utf8.RuneCountInString(password) >= 12
}

func (app *application) passwordHash(w http.ResponseWriter, password string, salt []byte) ([]byte, bool) {
	select {
	case app.passwordSlots <- struct{}{}:
		defer func() { <-app.passwordSlots }()
	default:
		w.Header().Set("Retry-After", "1")
		fail(w, http.StatusTooManyRequests, "try_again")
		return nil, false
	}
	hash, err := pbkdf2.Key(sha256.New, password, salt, 600000, 32)
	if err != nil {
		fail(w, http.StatusInternalServerError, "internal_error")
		return nil, false
	}
	return hash, true
}

func (app *application) register(w http.ResponseWriter, r *http.Request) {
	data, ok := app.credentials(w, r)
	if !ok {
		return
	}
	if !app.allowAuth(w, r, "register", data.Email, 10, 3) {
		return
	}
	salt := make([]byte, 16)
	rand.Read(salt)
	hash, ok := app.passwordHash(w, data.Password, salt)
	if !ok {
		return
	}
	account := user{Email: data.Email}
	err := app.db.QueryRow(r.Context(), `INSERT INTO users (email, password_hash, password_salt)
		VALUES ($1,$2,$3) ON CONFLICT (email) DO NOTHING RETURNING id::text`, data.Email, hash, salt).Scan(&account.ID)
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, http.StatusConflict, "email_already_registered")
		return
	}
	if err != nil {
		databaseError(w, "create user", err)
		return
	}
	if !app.queueAuthMail(w, authMailJob{email: account.Email, purpose: "verify"}) {
		return
	}
	respond(w, http.StatusCreated, account)
}

func (app *application) login(w http.ResponseWriter, r *http.Request) {
	data, ok := app.credentials(w, r)
	if !ok {
		return
	}
	if !app.allowAuth(w, r, "login", data.Email, 25, 5) {
		return
	}
	account := user{Email: data.Email}
	var salt, expected []byte
	var verified bool
	err := app.db.QueryRow(r.Context(), `SELECT id::text,password_salt,password_hash,email_verified_at IS NOT NULL FROM users WHERE email=$1`,
		data.Email).Scan(&account.ID, &salt, &expected, &verified)
	if errors.Is(err, pgx.ErrNoRows) {
		salt, expected = make([]byte, 16), make([]byte, 32)
	} else if err != nil {
		databaseError(w, "read user", err)
		return
	}
	hash, ok := app.passwordHash(w, data.Password, salt)
	if !ok {
		return
	}
	if subtle.ConstantTimeCompare(hash, expected) != 1 || account.ID == "" {
		fail(w, http.StatusUnauthorized, "invalid_credentials")
		return
	}
	if !verified {
		fail(w, http.StatusForbidden, "email_not_verified")
		return
	}
	token, digest := newAuthSecret()
	previous := app.sessionDigest(r)
	tag, err := app.db.Exec(r.Context(), `WITH eligible AS (
		SELECT id FROM users WHERE id=$3::text::uuid AND password_hash=$5 AND email_verified_at IS NOT NULL FOR NO KEY UPDATE
	), revoked AS (DELETE FROM sessions WHERE token_hash=$1 AND EXISTS(SELECT 1 FROM eligible))
	INSERT INTO sessions (token_hash,user_id,expires_at) SELECT $2,id,$4 FROM eligible`,
		previous, digest, account.ID, time.Now().Add(sessionAge), expected)
	if err != nil {
		databaseError(w, "create session", err)
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, http.StatusUnauthorized, "invalid_credentials")
		return
	}
	app.setSessionCookie(w, token, int(sessionAge/time.Second))
	respond(w, http.StatusOK, account)
}

func (app *application) cookieName() string {
	if app.secureCookies {
		return "__Host-jospat-session"
	}
	return "jospat-session-dev"
}

func (app *application) setSessionCookie(w http.ResponseWriter, token string, maxAge int) {
	http.SetCookie(w, &http.Cookie{Name: app.cookieName(), Value: token, Path: "/", Secure: app.secureCookies,
		HttpOnly: true, SameSite: http.SameSiteLaxMode, MaxAge: maxAge})
}

func (app *application) sessionDigest(r *http.Request) []byte {
	cookie, err := r.Cookie(app.cookieName())
	if err != nil {
		return nil
	}
	return authSecretDigest(cookie.Value)
}

func (app *application) authenticated(next func(http.ResponseWriter, *http.Request, user)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		digest := app.sessionDigest(r)
		if digest == nil {
			fail(w, http.StatusUnauthorized, "authentication_required")
			return
		}
		var account user
		err := app.db.QueryRow(r.Context(), `SELECT u.id::text,u.email FROM sessions s JOIN users u ON u.id=s.user_id
			WHERE s.token_hash=$1 AND s.expires_at>now() AND u.email_verified_at IS NOT NULL`, digest).Scan(&account.ID, &account.Email)
		if errors.Is(err, pgx.ErrNoRows) {
			fail(w, http.StatusUnauthorized, "authentication_required")
			return
		}
		if err != nil {
			databaseError(w, "read session", err)
			return
		}
		next(w, r, account)
	}
}

func (app *application) me(w http.ResponseWriter, _ *http.Request, account user) {
	respond(w, http.StatusOK, account)
}

func (app *application) logout(w http.ResponseWriter, r *http.Request) {
	if digest := app.sessionDigest(r); digest != nil {
		if _, err := app.db.Exec(r.Context(), `DELETE FROM sessions WHERE token_hash=$1`, digest); err != nil {
			databaseError(w, "delete session", err)
			return
		}
	}
	app.setSessionCookie(w, "", -1)
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusNoContent)
}
