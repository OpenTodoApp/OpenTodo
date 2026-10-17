package httpapi

import (
	"net/http"
	"testing"
	"time"
)

// TestSignOutEverywhere (route-authorization-policy, SEC-16): from a recently
// confirmed session, every session (this one too), remembered browser, API
// token and app password of the account ends; tokens cannot call it.
func TestSignOutEverywhere(t *testing.T) {
	m := newMFAEnv(t)
	resp, out := m.do("POST", "/api/v1/tokens", map[string]string{"name": "script", "scope": "admin"})
	m.mustStatus(resp, 201, out)
	token := out["secret"].(string)
	resp, out = m.do("POST", "/api/v1/app-passwords", map[string]string{"name": "phone"})
	m.mustStatus(resp, 201, out)
	other := m.client("203.0.113.80")
	resp, out = login(other, "owner@example.com", "correct horse battery")
	other.mustStatus(resp, 200, out)

	script := newClientAt(m.env, "203.0.113.81")
	resp, out = script.do("POST", "/api/v1/me/sign-out-everywhere", nil, "Authorization", "Bearer "+token)
	if resp.StatusCode != 403 || errCode(out) != "session_required" {
		t.Fatalf("token signs out everywhere = %d %v", resp.StatusCode, out)
	}
	m.clock.advance(FreshWindow + time.Second)
	resp, out = m.do("POST", "/api/v1/me/sign-out-everywhere", nil)
	if resp.StatusCode != 403 || errCode(out) != "reauth_required" {
		t.Fatalf("stale session = %d %v", resp.StatusCode, out)
	}
	resp, out = m.do("POST", "/api/v1/auth/reauth", map[string]string{"password": "correct horse battery"})
	m.mustStatus(resp, 200, out)
	resp, out = m.do("POST", "/api/v1/me/sign-out-everywhere", nil)
	m.mustStatus(resp, 204, out)
	if !clearsCookie(resp, sessionCookie) {
		t.Fatal("session cookie not cleared")
	}

	for name, c := range map[string]*env{"this browser": m.env, "another browser": other} {
		if resp, out := c.do("GET", "/api/v1/me", nil); resp.StatusCode != 401 {
			t.Errorf("%s after sign-out everywhere = %d %v", name, resp.StatusCode, out)
		}
	}
	if resp, out := script.do("GET", "/api/v1/me", nil, "Authorization", "Bearer "+token); resp.StatusCode != 401 {
		t.Errorf("token after sign-out everywhere = %d %v", resp.StatusCode, out)
	}
	var live int
	if err := m.db.QueryRow("SELECT COUNT(*) FROM app_passwords WHERE revoked_at IS NULL").Scan(&live); err != nil || live != 0 {
		t.Fatalf("live app passwords = %d %v", live, err)
	}
	// The password still signs in.
	resp, out = login(m.client("203.0.113.82"), "owner@example.com", "correct horse battery")
	m.mustStatus(resp, 200, out)
}

// clearsCookie reports whether resp expires the named cookie.
func clearsCookie(resp *http.Response, name string) bool {
	for _, c := range resp.Cookies() {
		if c.Name == name && c.MaxAge < 0 {
			return true
		}
	}
	return false
}
