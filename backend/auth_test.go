package main

import (
	"context"
	"crypto/sha256"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestEmailVerificationAndPasswordReset(t *testing.T) {
	request, _, receive, db := testAPIWithMail(t)
	const email = "auth-lifecycle@example.test"
	const original = `{"email":"` + email + `","password":"original signup passphrase"}`
	const oldVerified = `{"email":"` + email + `","password":"verified old passphrase"}`
	const updated = `{"email":"` + email + `","password":"new secure passphrase"}`
	const address = `{"email":"` + email + `"}`
	request("POST", "/api/auth/register", original, nil, "", 201)
	blocked := request("POST", "/api/auth/login", original, nil, "", 403)
	if !strings.Contains(blocked.Body.String(), "email_not_verified") || len(blocked.Result().Cookies()) != 0 {
		t.Fatal("unverified account received a session")
	}
	first := receive(email, "verify")
	request("POST", "/api/auth/resend-verification", address, nil, "", 202)
	resent := receive(email, "verify")
	if first.token == resent.token {
		t.Fatal("resend should issue an independent token")
	}
	request("POST", "/api/auth/reset-password", `{"token":"`+first.token+`","password":"verified old passphrase"}`, nil, "", 400)
	verifyBody := `{"token":"` + first.token + `","password":"verified old passphrase"}`
	request("POST", "/api/auth/verify-email", verifyBody, nil, "", 204)
	request("POST", "/api/auth/verify-email", verifyBody, nil, "", 400)
	request("POST", "/api/auth/verify-email", `{"token":"`+resent.token+`","password":"verified old passphrase"}`, nil, "", 400)
	firstSession := request("POST", "/api/auth/login", oldVerified, nil, "", 200).Result().Cookies()[0]
	secondSession := request("POST", "/api/auth/login", oldVerified, nil, "", 200).Result().Cookies()[0]

	unknown := request("POST", "/api/auth/forgot-password", `{"email":"unregistered@example.test"}`, nil, "", 202)
	known := request("POST", "/api/auth/forgot-password", address, nil, "", 202)
	if known.Body.String() != unknown.Body.String() {
		t.Fatal("reset replies disclose whether an account exists")
	}
	expired := receive(email, "reset")
	if _, err := db.Exec(context.Background(), `UPDATE auth_tokens SET expires_at=now()-interval '1 second' WHERE token_hash=$1`,
		authSecretDigest(expired.token)); err != nil {
		t.Fatal(err)
	}
	request("POST", "/api/auth/reset-password", `{"token":"`+expired.token+`","password":"new secure passphrase"}`, nil, "", 400)
	request("POST", "/api/auth/forgot-password", address, nil, "", 202)
	reset := receive(email, "reset")
	resetBody := `{"token":"` + reset.token + `","password":"new secure passphrase"}`
	request("POST", "/api/auth/reset-password", resetBody, firstSession, "", 204)
	receive(email, "password-changed")
	request("POST", "/api/auth/reset-password", resetBody, nil, "", 400)
	request("GET", "/api/auth/me", "", firstSession, "", 401)
	request("GET", "/api/auth/me", "", secondSession, "", 401)
	request("POST", "/api/auth/login", oldVerified, nil, "", 401)
	request("POST", "/api/auth/login", updated, nil, "", 200)
}

func TestLoginRateLimits(t *testing.T) {
	request, _, _, db := testAPIWithMail(t)
	const body = `{"email":"ratelimit@example.test","password":"wrong test passphrase"}`
	for range 5 {
		request("POST", "/api/auth/login", body, nil, "", 401)
	}
	blocked := request("POST", "/api/auth/login", body, nil, "", 429)
	if blocked.Header().Get("Retry-After") == "" {
		t.Fatal("rate limit response must include retry time")
	}
	// The IP limit is independent of the email counter and is checked first.
	ipKey := sha256.Sum256([]byte("login:ip:192.0.2.1"))
	if _, err := db.Exec(context.Background(), `UPDATE auth_rate_limits SET attempts=25 WHERE key_hash=$1`, ipKey[:]); err != nil {
		t.Fatal(err)
	}
	request("POST", "/api/auth/login", `{"email":"different@example.test","password":"wrong test passphrase"}`, nil, "", 429)
	if _, err := db.Exec(context.Background(), `UPDATE auth_rate_limits SET expires_at=now()-interval '1 second'`); err != nil {
		t.Fatal(err)
	}
	request("POST", "/api/auth/login", body, nil, "", 401)
}

func TestForwardedClientIP(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
	request.RemoteAddr = "192.0.2.10:1234"
	request.Header.Set("X-Forwarded-For", "198.51.100.3, 203.0.113.4, 192.0.2.11")
	app := &application{}
	if got := app.clientIP(request); got != "192.0.2.10" {
		t.Fatalf("untrusted proxy header was used: %s", got)
	}
	proxies, err := parseTrustedProxies("192.0.2.0/24")
	if err != nil {
		t.Fatal(err)
	}
	app.trustedProxies = proxies
	if got := app.clientIP(request); got != "203.0.113.4" {
		t.Fatalf("client IP should come from the nearest untrusted hop: %s", got)
	}
}
