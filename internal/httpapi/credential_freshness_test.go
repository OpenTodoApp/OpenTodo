package httpapi

import (
	"net/http"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/oidc/oidctest"
	"github.com/pixari/opentodo/internal/webauthn"
	"github.com/pixari/opentodo/internal/webauthn/testauth"
)

// credential-freshness: adding a way to sign in (a passkey, an authenticator
// app, a linked provider identity) needs a recent sign-in, and adding one never
// makes a stale session fresh.

func TestAddingCredentialsNeedsRecentSignIn(t *testing.T) {
	m := newMFAEnv(t)
	m.clock.advance(FreshWindow + time.Second)
	for _, r := range []struct{ method, path string }{
		{"POST", "/api/v1/passkeys/register/options"},
		{"POST", "/api/v1/passkeys/register"},
		{"POST", "/api/v1/mfa/totp/enroll"},
		{"POST", "/api/v1/mfa/totp/confirm"},
	} {
		resp, out := m.do(r.method, r.path, map[string]any{"code": "000000", "name": "x"})
		if resp.StatusCode != 403 || errCode(out) != "reauth_required" {
			t.Fatalf("%s %s on a stale session = %d %v", r.method, r.path, resp.StatusCode, out)
		}
	}
	if n := countRows(t, m, "SELECT COUNT(*) FROM mfa_totp"); n != 0 {
		t.Fatalf("a stale enrol stored a secret (%d rows)", n)
	}
	// After re-authenticating, both ceremonies work.
	resp, out := m.do("POST", "/api/v1/auth/reauth", map[string]string{"password": "correct horse battery"})
	m.mustStatus(resp, 200, out)
	resp, out = m.registerPasskey(testauth.New(t, webauthn.AlgES256), "Phone")
	m.mustStatus(resp, 201, out)
	m.enrol(m.env)
}

func TestConfirmingTOTPDoesNotGrantFreshness(t *testing.T) {
	m := newMFAEnv(t)
	// Signed in at t0; enrolment confirmed just before the window ends.
	resp, out := m.do("POST", "/api/v1/mfa/totp/enroll", map[string]any{})
	m.mustStatus(resp, 200, out)
	secret := out["secret"].(string)
	m.clock.advance(FreshWindow - time.Minute)
	resp, out = m.do("POST", "/api/v1/mfa/totp/confirm", map[string]string{"code": m.code(secret)})
	m.mustStatus(resp, 200, out)
	// Two minutes later the sign-in is older than the window: enrolling did
	// not renew it, so a sensitive route asks again.
	m.clock.advance(2 * time.Minute)
	resp, out = m.do("POST", "/api/v1/tokens", map[string]string{"name": "after enrol"})
	if resp.StatusCode != 403 || errCode(out) != "reauth_required" {
		t.Fatalf("token after enrolment = %d %v, want reauth_required", resp.StatusCode, out)
	}
	// The second factor is still recorded as satisfied for the session.
	var mfaAt *int64
	if err := m.db.QueryRow(`SELECT a.mfa_at FROM session_auth a JOIN sessions s ON s.token_hash = a.token_hash
		ORDER BY s.created_at DESC LIMIT 1`).Scan(&mfaAt); err != nil || mfaAt == nil {
		t.Fatalf("mfa_at after confirm = %v %v", mfaAt, err)
	}
}

func TestOIDCLinkNeedsRecentSignIn(t *testing.T) {
	o := newOIDCEnv(t, false)
	o.configure(nil)
	o.idp.SetUser(oidctest.User{Subject: "owner-sub", Email: "", EmailVerified: false})

	// A stale session cannot link a new identity, and is not made fresh.
	o.clock.advance(FreshWindow + time.Second)
	resp := raw(o.env, o.authorize(o.env), "Accept", "text/html")
	if location(resp) != "/settings/account/security?error=reauth_required" {
		t.Fatalf("stale link = %d %q", resp.StatusCode, location(resp))
	}
	_, out := o.do("GET", "/api/v1/me/identities", nil)
	if n := len(out["identities"].([]any)); n != 0 {
		t.Fatalf("identities after a stale link = %d", n)
	}
	resp2, out := o.do("POST", "/api/v1/tokens", map[string]string{"name": "x"})
	if resp2.StatusCode != 403 || errCode(out) != "reauth_required" {
		t.Fatalf("token after refused link = %d %v", resp2.StatusCode, out)
	}

	// After re-authenticating the link succeeds; it does not renew freshness.
	r, out := o.do("POST", "/api/v1/auth/reauth", map[string]string{"password": "correct horse battery"})
	o.mustStatus(r, 200, out)
	o.clock.advance(FreshWindow - time.Minute)
	if resp = o.ssoLogin(o.env); location(resp) != "/settings/account/security?linked=1" {
		t.Fatalf("fresh link = %q", location(resp))
	}
	o.clock.advance(2 * time.Minute)
	r, out = o.do("POST", "/api/v1/tokens", map[string]string{"name": "x"})
	if r.StatusCode != 403 || errCode(out) != "reauth_required" {
		t.Fatalf("token after a new link = %d %v, want reauth_required", r.StatusCode, out)
	}

	// Confirming an identity the account already has re-authenticates a stale
	// session (provider-only accounts rely on it).
	if resp = o.ssoLogin(o.env); resp.StatusCode != http.StatusSeeOther || location(resp) != "/settings/account/security?reauthenticated=1" {
		t.Fatalf("re-confirm = %d %q", resp.StatusCode, location(resp))
	}
	r, out = o.do("POST", "/api/v1/tokens", map[string]string{"name": "x"})
	o.mustStatus(r, 201, out)
}
