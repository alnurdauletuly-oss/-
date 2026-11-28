package main

import (
	"context"
	"crypto/sha256"
	"errors"
	"log"
	"net"
	"net/http"
	"net/netip"
	"strconv"
	"strings"
	"time"
)

func parseTrustedProxies(value string) ([]netip.Prefix, error) {
	var proxies []netip.Prefix
	if strings.TrimSpace(value) == "" {
		return proxies, nil
	}
	for item := range strings.SplitSeq(value, ",") {
		prefix, err := netip.ParsePrefix(strings.TrimSpace(item))
		if err != nil || prefix.Bits() == 0 || prefix.Addr().Is4In6() {
			return nil, errors.New("JOSPAT_TRUSTED_PROXIES must contain specific IPv4 or IPv6 CIDR ranges")
		}
		proxies = append(proxies, prefix.Masked())
	}
	return proxies, nil
}

func (app *application) clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	peer, err := netip.ParseAddr(host)
	if err != nil {
		return "unknown"
	}
	peer = peer.Unmap().WithZone("")
	isTrusted := func(ip netip.Addr) bool {
		for _, prefix := range app.trustedProxies {
			if prefix.Contains(ip) {
				return true
			}
		}
		return false
	}
	if !isTrusted(peer) {
		return peer.String()
	}
	hops := strings.Split(strings.Join(r.Header.Values("X-Forwarded-For"), ","), ",")
	for i := len(hops) - 1; i >= 0; i-- {
		hop, err := netip.ParseAddr(strings.TrimSpace(hops[i]))
		if err != nil || hop.Zone() != "" {
			return peer.String()
		}
		hop = hop.Unmap()
		if !isTrusted(hop) || i == 0 {
			return hop.String()
		}
	}
	return peer.String()
}

func (app *application) allowAuth(w http.ResponseWriter, r *http.Request, action, email string, maxIP, maxEmail int) bool {
	if !app.takeAuthAttempt(w, r, action+":ip:"+app.clientIP(r), maxIP) {
		return false
	}
	return email == "" || app.takeAuthAttempt(w, r, action+":email:"+email, maxEmail)
}

func (app *application) takeAuthAttempt(w http.ResponseWriter, r *http.Request, key string, limit int) bool {
	digest := sha256.Sum256([]byte(key))
	var count, retryAfter int
	err := app.db.QueryRow(r.Context(), `INSERT INTO auth_rate_limits (key_hash,attempts,expires_at)
		VALUES ($1,1,now()+interval '15 minutes')
		ON CONFLICT (key_hash) DO UPDATE SET
			attempts=CASE WHEN auth_rate_limits.expires_at<=now() THEN 1 ELSE LEAST(auth_rate_limits.attempts+1,$2::int+1) END,
			expires_at=CASE WHEN auth_rate_limits.expires_at<=now() THEN EXCLUDED.expires_at ELSE auth_rate_limits.expires_at END
		RETURNING attempts,GREATEST(1,ceil(extract(epoch FROM (expires_at-now()))))::int`, digest[:], limit).Scan(&count, &retryAfter)
	if err != nil {
		databaseError(w, "check auth limit", err)
		return false
	}
	if count > limit {
		w.Header().Set("Retry-After", strconv.Itoa(retryAfter))
		fail(w, http.StatusTooManyRequests, "auth_rate_limited")
		return false
	}
	return true
}

func (app *application) cleanupAuth(ctx context.Context) {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for ctx.Err() == nil {
		cleanup, cancel := context.WithTimeout(ctx, 10*time.Second)
		_, err := app.db.Exec(cleanup, `DELETE FROM auth_tokens WHERE expires_at<=now();
			DELETE FROM sessions WHERE expires_at<=now();
			DELETE FROM auth_rate_limits WHERE expires_at<=now()`)
		cancel()
		if err != nil && ctx.Err() == nil {
			log.Printf("clean up expired auth records: %T", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
