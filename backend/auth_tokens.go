package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"log"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
)

func newAuthSecret() (string, []byte) {
	var raw [32]byte
	rand.Read(raw[:])
	digest := sha256.Sum256(raw[:])
	return base64.RawURLEncoding.EncodeToString(raw[:]), digest[:]
}

func authSecretDigest(secret string) []byte {
	if len(secret) != base64.RawURLEncoding.EncodedLen(32) {
		return nil
	}
	raw, err := base64.RawURLEncoding.Strict().DecodeString(secret)
	if err != nil || len(raw) != 32 {
		return nil
	}
	digest := sha256.Sum256(raw)
	return digest[:]
}

func (app *application) resendVerification(w http.ResponseWriter, r *http.Request) {
	app.requestAuthCode(w, r, "verify")
}

func (app *application) forgotPassword(w http.ResponseWriter, r *http.Request) {
	app.requestAuthCode(w, r, "reset")
}

func (app *application) requestAuthCode(w http.ResponseWriter, r *http.Request, purpose string) {
	var input struct {
		Email string `json:"email"`
	}
	if !readJSON(w, r, &input) {
		return
	}
	email := strings.ToLower(strings.TrimSpace(input.Email))
	if !validEmail(email) {
		fail(w, http.StatusBadRequest, "invalid_email")
		return
	}
	if !app.allowAuth(w, r, "request-"+purpose, email, 15, 3) {
		return
	}
	if app.queueAuthMail(w, authMailJob{email: email, purpose: purpose}) {
		respond(w, http.StatusAccepted, map[string]string{"status": "accepted"})
	}
}

func (app *application) verifyEmail(w http.ResponseWriter, r *http.Request) {
	app.redeemAuthCode(w, r, "verify")
}

func (app *application) resetPassword(w http.ResponseWriter, r *http.Request) {
	app.redeemAuthCode(w, r, "reset")
}

func (app *application) redeemAuthCode(w http.ResponseWriter, r *http.Request, purpose string) {
	var input struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if !readJSON(w, r, &input) {
		return
	}
	if !app.allowAuth(w, r, "redeem-"+purpose, "", 30, 0) {
		return
	}
	if !validPassword(input.Password) {
		fail(w, http.StatusBadRequest, "invalid_password")
		return
	}
	digest := authSecretDigest(strings.TrimSpace(input.Token))
	if digest == nil {
		fail(w, http.StatusBadRequest, "invalid_or_expired_token")
		return
	}
	ctx := r.Context()
	var userID string
	err := app.db.QueryRow(ctx, `SELECT user_id::text FROM auth_tokens
		WHERE token_hash=$1 AND purpose=$2 AND expires_at>now()`, digest, purpose).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, http.StatusBadRequest, "invalid_or_expired_token")
		return
	}
	if err != nil {
		databaseError(w, "find auth token", err)
		return
	}
	var salt [16]byte
	rand.Read(salt[:])
	hash, ok := app.passwordHash(w, input.Password, salt[:])
	if !ok {
		return
	}
	email, err := app.useAuthToken(ctx, userID, digest, purpose, hash, salt[:])
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, http.StatusBadRequest, "invalid_or_expired_token")
		return
	}
	if err != nil {
		databaseError(w, "redeem auth token", err)
		return
	}
	if purpose == "reset" {
		select {
		case app.authMailJobs <- authMailJob{email: email, purpose: "password-changed"}:
		default:
			log.Print("auth mail queue is full: password change notification skipped")
		}
	}
	app.setSessionCookie(w, "", -1)
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusNoContent)
}

func (app *application) useAuthToken(ctx context.Context, userID string, digest []byte, purpose string, hash, salt []byte) (string, error) {
	tx, err := app.db.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)
	var email string
	err = tx.QueryRow(ctx, `SELECT email FROM users WHERE id=$1::text::uuid AND
		(email_verified_at IS NULL)=($2='verify') FOR NO KEY UPDATE`, userID, purpose).Scan(&email)
	if err != nil {
		return "", err
	}
	var used []byte
	err = tx.QueryRow(ctx, `DELETE FROM auth_tokens WHERE token_hash=$1 AND user_id=$2::text::uuid
		AND purpose=$3 AND expires_at>clock_timestamp() RETURNING token_hash`, digest, userID, purpose).Scan(&used)
	if err != nil {
		return "", err
	}
	if _, err := tx.Exec(ctx, `UPDATE users SET password_hash=$2,password_salt=$3,
		email_verified_at=COALESCE(email_verified_at,now()) WHERE id=$1::text::uuid`, userID, hash, salt); err != nil {
		return "", err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM auth_tokens WHERE user_id=$1::text::uuid`, userID); err != nil {
		return "", err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM sessions WHERE user_id=$1::text::uuid`, userID); err != nil {
		return "", err
	}
	return email, tx.Commit(ctx)
}
