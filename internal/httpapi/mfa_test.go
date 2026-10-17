package httpapi

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"strings"
	gosync "sync"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
	"github.com/pixari/opentodo/internal/webauthn"
	"github.com/pixari/opentodo/internal/webauthn/testauth"
)

// mfaClock is the auth service's time source in these tests, so codes for
// successive time steps and stale sessions can be produced deterministically.
type mfaClock struct {
	mu gosync.Mutex
	t  time.Time
}

func (c *mfaClock) now() time.Time { c.mu.Lock(); defer c.mu.Unlock(); return c.t }
func (c *mfaClock) advance(d time.Duration) {
	c.mu.Lock()
	c.t = c.t.Add(d)
	c.mu.Unlock()
}

type mfaEnv struct {
	*env
	clock *mfaClock
}

// newMFAEnv starts a server on a localhost base URL (passkeys available) with
// a controllable clock, and registers the owner.
func newMFAEnv(t *testing.T) *mfaEnv {
	t.Helper()
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	cfg := config.Config{SessionTTL: 24 * time.Hour}
	cfg.BaseURL, _ = url.Parse(testBase)
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	syncSvc := opsync.NewService(db)
	authSvc := auth.NewService(db, cfg.SessionTTL, false)
	clk := &mfaClock{t: time.Now().Truncate(30 * time.Second)}
	authSvc.SetClock(clk.now)
	h := New(cfg, authSvc, syncSvc, nil, log, "test")
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	t.Cleanup(syncSvc.Notifier().CloseAll)
	jar, _ := cookiejar.New(nil)
	e := &mfaEnv{env: &env{t: t, srv: srv, client: &http.Client{Jar: jar}, db: db, handler: h, sync: syncSvc}, clock: clk}
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	return e
}

// code returns the current code and moves the clock one step on, so the next
// call yields a code the replay guard accepts.
func (m *mfaEnv) code(secret string) string {
	m.t.Helper()
	c, err := auth.TOTPCodeAt(secret, m.clock.now())
	if err != nil {
		m.t.Fatal(err)
	}
	m.clock.advance(30 * time.Second)
	return c
}

// enrol runs enroll + confirm for the client c and returns the secret and codes.
func (m *mfaEnv) enrol(c *env) (string, []string) {
	m.t.Helper()
	resp, out := c.do("POST", "/api/v1/mfa/totp/enroll", map[string]any{})
	c.mustStatus(resp, 200, out)
	secret := out["secret"].(string)
	if !strings.HasPrefix(out["uri"].(string), "otpauth://totp/OpenTodo:") || out["expiresAt"] == nil {
		m.t.Fatalf("enroll = %v", out)
	}
	resp, out = c.do("POST", "/api/v1/mfa/totp/confirm", map[string]string{"code": m.code(secret)})
	c.mustStatus(resp, 200, out)
	raw := out["recoveryCodes"].([]any)
	codes := make([]string, len(raw))
	for i, v := range raw {
		codes[i] = v.(string)
	}
	if st := out["mfa"].(map[string]any); st["enrolled"] != true || st["recoveryCodesRemaining"] != float64(10) {
		m.t.Fatalf("status after confirm = %v", st)
	}
	return secret, codes
}

// client returns a fresh browser (own cookie jar and address) on the same server.
func (m *mfaEnv) client(ip string) *env { return newClientAt(m.env, ip) }

func login(c *env, email, password string) (*http.Response, map[string]any) {
	return c.do("POST", "/api/v1/auth/login", map[string]string{"email": email, "password": password})
}

func hasCookie(resp *http.Response, name string) bool {
	for _, ck := range resp.Cookies() {
		if ck.Name == name && ck.Value != "" {
			return true
		}
	}
	return false
}

func TestTwoStepLogin(t *testing.T) {
	m := newMFAEnv(t)
	secret, codes := m.enrol(m.env)

	c := m.client("203.0.113.1")
	resp, out := login(c, "owner@example.com", "correct horse battery")
	c.mustStatus(resp, 200, out)
	if out["mfaRequired"] != true || out["challenge"] == "" || out["user"] != nil || hasCookie(resp, sessionCookie) {
		t.Fatalf("password step = %v (cookie %v)", out, hasCookie(resp, sessionCookie))
	}
	// Not signed in yet.
	resp, out = c.do("GET", "/api/v1/me", nil)
	c.mustStatus(resp, 401, out)

	_, out = login(c, "owner@example.com", "correct horse battery")
	challenge := out["challenge"]
	code := m.code(secret)
	resp, out = c.do("POST", "/api/v1/auth/mfa", map[string]any{"challenge": challenge, "code": code})
	c.mustStatus(resp, 200, out)
	if !hasCookie(resp, sessionCookie) || out["user"].(map[string]any)["email"] != "owner@example.com" {
		t.Fatalf("second step = %v", out)
	}
	if hasCookie(resp, trustCookie) {
		t.Fatal("trust cookie set without remember")
	}
	resp, out = c.do("GET", "/api/v1/me", nil)
	c.mustStatus(resp, 200, out)
	if st := out["mfa"].(map[string]any); st["enrolled"] != true || st["restricted"] != false {
		t.Fatalf("me.mfa = %v", st)
	}

	// The same code completing another sign-in within its window: refused.
	d := m.client("203.0.113.2")
	_, out = login(d, "owner@example.com", "correct horse battery")
	resp, out = d.do("POST", "/api/v1/auth/mfa", map[string]any{"challenge": out["challenge"], "code": code})
	d.mustStatus(resp, 401, out)
	if errCode(out) != "mfa_code_invalid" {
		t.Fatalf("replay = %v", out)
	}

	// A recovery code completes the step and is consumed.
	_, out = login(d, "owner@example.com", "correct horse battery")
	resp, out = d.do("POST", "/api/v1/auth/mfa", map[string]any{"challenge": out["challenge"], "recoveryCode": codes[0]})
	d.mustStatus(resp, 200, out)
	resp, out = d.do("GET", "/api/v1/mfa", nil)
	d.mustStatus(resp, 200, out)
	if out["mfa"].(map[string]any)["recoveryCodesRemaining"] != float64(9) {
		t.Fatalf("remaining = %v", out)
	}
	f := m.client("203.0.113.3")
	_, out = login(f, "owner@example.com", "correct horse battery")
	resp, out = f.do("POST", "/api/v1/auth/mfa", map[string]any{"challenge": out["challenge"], "recoveryCode": codes[0]})
	f.mustStatus(resp, 401, out)
	if errCode(out) != "mfa_code_invalid" {
		t.Fatalf("recovery reuse = %v", out)
	}

	// Audit: methods recorded, failures carry a reason but never the code.
	var methods []string
	for _, ev := range m.events(audit.LoginSucceededName) {
		methods = append(methods, ev.Details["method"])
	}
	if got := strings.Join(methods, ","); !strings.Contains(got, "password+totp") || !strings.Contains(got, "password+recovery_code") {
		t.Fatalf("login methods = %s", got)
	}
	fails := m.events(audit.MFAChallengeFailedName)
	if len(fails) != 2 {
		t.Fatalf("challenge_failed events = %d", len(fails))
	}
	for _, ev := range fails {
		for _, v := range ev.Details {
			if strings.Contains(v, code) || strings.Contains(v, strings.ReplaceAll(codes[0], "-", "")) {
				t.Fatalf("code stored in event: %v", ev.Details)
			}
		}
		if ev.Details["reason"] == "" {
			t.Fatalf("no reason: %v", ev.Details)
		}
	}

	// An account without a second factor still signs in in one step.
	m.member("member@example.com", "203.0.113.4")
	g := m.client("203.0.113.5")
	resp, out = login(g, "member@example.com", "member long password")
	g.mustStatus(resp, 200, out)
	if out["mfaRequired"] != nil || !hasCookie(resp, sessionCookie) {
		t.Fatalf("unenrolled login = %v", out)
	}
}

func TestChallengeExhausted(t *testing.T) {
	m := newMFAEnv(t)
	secret, _ := m.enrol(m.env)
	c := m.client("203.0.113.10")
	_, out := login(c, "owner@example.com", "correct horse battery")
	challenge := out["challenge"]
	for i := 0; i < 5; i++ {
		resp, out := c.do("POST", "/api/v1/auth/mfa", map[string]any{"challenge": challenge, "code": "000000"})
		c.mustStatus(resp, 401, out)
		if errCode(out) != "mfa_code_invalid" {
			t.Fatalf("attempt %d = %v", i+1, out)
		}
	}
	resp, out := c.do("POST", "/api/v1/auth/mfa", map[string]any{"challenge": challenge, "code": m.code(secret)})
	c.mustStatus(resp, 401, out)
	if errCode(out) != "mfa_challenge_invalid" || hasCookie(resp, sessionCookie) {
		t.Fatalf("sixth attempt = %v", out)
	}
	// Unknown challenge and missing fields.
	resp, out = c.do("POST", "/api/v1/auth/mfa", map[string]any{"challenge": "nope", "code": "123456"})
	if resp.StatusCode != 401 || errCode(out) != "mfa_challenge_invalid" {
		t.Fatalf("unknown challenge = %d %v", resp.StatusCode, out)
	}
	resp, out = c.do("POST", "/api/v1/auth/mfa", map[string]any{"challenge": "nope"})
	if resp.StatusCode != 400 || errCode(out) != "invalid_input" {
		t.Fatalf("missing code = %d %v", resp.StatusCode, out)
	}
	// Expired challenge.
	_, out = login(c, "owner@example.com", "correct horse battery")
	challenge = out["challenge"]
	m.clock.advance(auth.LoginChallengeTTL + time.Second)
	resp, out = c.do("POST", "/api/v1/auth/mfa", map[string]any{"challenge": challenge, "code": m.code(secret)})
	if resp.StatusCode != 401 || errCode(out) != "mfa_challenge_invalid" {
		t.Fatalf("expired challenge = %d %v", resp.StatusCode, out)
	}
	// The second step is rate limited per address.
	r := m.client("203.0.113.11")
	var last *http.Response
	for i := 0; i < 11; i++ {
		last, _ = r.do("POST", "/api/v1/auth/mfa", map[string]any{"challenge": "x", "code": "123456"})
	}
	if last.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("11th attempt = %d", last.StatusCode)
	}
	// Cross-site second step is refused.
	resp, out = c.do("POST", "/api/v1/auth/mfa", map[string]any{"challenge": "x", "code": "1"}, "Origin", "https://evil.example")
	if resp.StatusCode != 403 || errCode(out) != "bad_origin" {
		t.Fatalf("cross-site = %d %v", resp.StatusCode, out)
	}
}

func TestTrustedDeviceSkipsSecondStep(t *testing.T) {
	m := newMFAEnv(t)
	secret, _ := m.enrol(m.env)
	c := m.client("203.0.113.20")
	_, out := login(c, "owner@example.com", "correct horse battery")
	resp, out := c.do("POST", "/api/v1/auth/mfa", map[string]any{"challenge": out["challenge"], "code": m.code(secret), "remember": true})
	c.mustStatus(resp, 200, out)
	var trust *http.Cookie
	for _, ck := range resp.Cookies() {
		if ck.Name == trustCookie {
			trust = ck
		}
	}
	if trust == nil || !trust.HttpOnly || trust.SameSite != http.SameSiteLaxMode || trust.Path != "/api/v1/auth" || trust.MaxAge != 30*24*3600 {
		t.Fatalf("trust cookie = %+v", trust)
	}
	// Sign out and in again from the same browser: no second step.
	c.do("POST", "/api/v1/auth/logout", nil)
	resp, out = login(c, "owner@example.com", "correct horse battery")
	c.mustStatus(resp, 200, out)
	if out["mfaRequired"] != nil || !hasCookie(resp, sessionCookie) {
		t.Fatalf("remembered login = %v", out)
	}
	// A wrong password is still refused on a remembered browser.
	resp, out = login(c, "owner@example.com", "wrong password!!")
	if resp.StatusCode != 401 {
		t.Fatalf("wrong password on trusted device = %d", resp.StatusCode)
	}
	// The trust cookie does not help another account or another browser.
	other := m.client("203.0.113.21")
	resp, out = login(other, "owner@example.com", "correct horse battery")
	if out["mfaRequired"] != true {
		t.Fatalf("other browser = %v", out)
	}
	// Listed in Settings; forgetting all brings the second step back.
	resp, out = c.do("GET", "/api/v1/mfa/trusted-devices", nil)
	c.mustStatus(resp, 200, out)
	devices := out["devices"].([]any)
	if len(devices) != 1 || devices[0].(map[string]any)["lastUsedAt"] == nil {
		t.Fatalf("devices = %v", devices)
	}
	resp, out = c.do("DELETE", "/api/v1/mfa/trusted-devices", nil)
	c.mustStatus(resp, 204, out)
	resp, out = login(c, "owner@example.com", "correct horse battery")
	if out["mfaRequired"] != true {
		t.Fatalf("after forget all = %v", out)
	}
	// Forget one by id; unknown ids are 404.
	resp, out = c.do("POST", "/api/v1/auth/mfa", map[string]any{"challenge": out["challenge"], "code": m.code(secret), "remember": true})
	c.mustStatus(resp, 200, out)
	_, out = c.do("GET", "/api/v1/mfa/trusted-devices", nil)
	id := out["devices"].([]any)[0].(map[string]any)["id"].(string)
	resp, out = c.do("DELETE", "/api/v1/mfa/trusted-devices/"+id, nil)
	c.mustStatus(resp, 204, out)
	resp, out = c.do("DELETE", "/api/v1/mfa/trusted-devices/"+id, nil)
	c.mustStatus(resp, 404, out)
	// Expiry after 30 days.
	resp, out = login(c, "owner@example.com", "correct horse battery")
	resp, out = c.do("POST", "/api/v1/auth/mfa", map[string]any{"challenge": out["challenge"], "code": m.code(secret), "remember": true})
	c.mustStatus(resp, 200, out)
	m.clock.advance(auth.TrustedDeviceTTL + time.Minute)
	resp, out = login(c, "owner@example.com", "correct horse battery")
	if out["mfaRequired"] != true {
		t.Fatalf("expired trust = %v", out)
	}
}

func TestPasskeyUVSatisfiesMFA(t *testing.T) {
	m := newMFAEnv(t)
	phone := testauth.New(t, webauthn.AlgES256) // reports user verification
	resp, out := m.registerPasskey(phone, "Phone")
	m.mustStatus(resp, 201, out)
	key := testauth.New(t, webauthn.AlgEdDSA)
	key.ExtraFlags = 0 // presence only, no user verification
	resp, out = m.registerPasskey(key, "Security key")
	m.mustStatus(resp, 201, out)
	secret, _ := m.enrol(m.env)

	c := m.client("203.0.113.30")
	resp, out = c.loginWithPasskey(phone)
	c.mustStatus(resp, 200, out)
	if out["mfaRequired"] != nil || !hasCookie(resp, sessionCookie) {
		t.Fatalf("UV passkey = %v", out)
	}
	var mfaAt *int64
	if err := m.db.QueryRow(`SELECT a.mfa_at FROM session_auth a JOIN sessions s ON s.token_hash = a.token_hash
		ORDER BY s.created_at DESC LIMIT 1`).Scan(&mfaAt); err != nil || mfaAt == nil {
		t.Fatalf("mfa_at not set for UV passkey session: %v", err)
	}

	// Without user verification the passkey is one factor: the code is asked.
	d := m.client("203.0.113.31")
	resp, out = d.loginWithPasskey(key)
	d.mustStatus(resp, 200, out)
	if out["mfaRequired"] != true || hasCookie(resp, sessionCookie) {
		t.Fatalf("non-UV passkey = %v", out)
	}
	resp, out = d.do("POST", "/api/v1/auth/mfa", map[string]any{"challenge": out["challenge"], "code": m.code(secret)})
	d.mustStatus(resp, 200, out)
	found := false
	for _, ev := range m.events(audit.LoginSucceededName) {
		if ev.Details["method"] == "passkey+totp" {
			found = true
		}
	}
	if !found {
		t.Fatal("passkey+totp sign-in not recorded")
	}
}

// stale makes every session of the server older than the freshness window.
func (m *mfaEnv) stale() {
	m.t.Helper()
	if _, err := m.db.Exec("UPDATE session_auth SET reauth_at = ?", m.clock.now().Add(-FreshWindow-time.Minute).UnixMilli()); err != nil {
		m.t.Fatal(err)
	}
}

func TestReauthRequiredOnStaleSession(t *testing.T) {
	m := newMFAEnv(t)
	// A fresh session (just signed in) creates a token without a prompt.
	resp, out := m.do("POST", "/api/v1/tokens", map[string]string{"name": "fresh"})
	m.mustStatus(resp, 201, out)

	m.clock.advance(FreshWindow + time.Second)
	for _, r := range []struct{ method, path string }{
		{"POST", "/api/v1/tokens"},
		{"POST", "/api/v1/invitations"},
		{"PUT", "/api/v1/settings/mfa"},
		{"DELETE", "/api/v1/mfa/totp"},
		{"POST", "/api/v1/mfa/recovery-codes/regenerate"},
		{"POST", "/api/v1/members/x/mfa/reset"},
	} {
		resp, out := m.do(r.method, r.path, map[string]string{"name": "stale", "required": "none"})
		if resp.StatusCode != 403 || errCode(out) != "reauth_required" {
			t.Fatalf("%s %s on stale session = %d %v", r.method, r.path, resp.StatusCode, out)
		}
	}
	_, out = m.do("GET", "/api/v1/tokens", nil)
	if n := len(out["tokens"].([]any)); n != 1 {
		t.Fatalf("tokens = %d, the stale request must not create one", n)
	}

	// Wrong password, then the right one; the request then succeeds.
	resp, out = m.do("POST", "/api/v1/auth/reauth", map[string]string{"password": "not my password"})
	if resp.StatusCode != 401 || errCode(out) != "invalid_credentials" {
		t.Fatalf("wrong reauth = %d %v", resp.StatusCode, out)
	}
	resp, out = m.do("POST", "/api/v1/auth/reauth", map[string]string{"password": "correct horse battery"})
	m.mustStatus(resp, 200, out)
	resp, out = m.do("POST", "/api/v1/tokens", map[string]string{"name": "after reauth"})
	m.mustStatus(resp, 201, out)

	// With a second factor, a current code re-authenticates too.
	secret, _ := m.enrol(m.env)
	m.clock.advance(FreshWindow + time.Second)
	resp, out = m.do("POST", "/api/v1/mfa/recovery-codes/regenerate", nil)
	if errCode(out) != "reauth_required" {
		t.Fatalf("regenerate stale = %v", out)
	}
	resp, out = m.do("POST", "/api/v1/auth/reauth", map[string]string{"code": "000000"})
	if resp.StatusCode != 401 || errCode(out) != "mfa_code_invalid" {
		t.Fatalf("wrong code = %d %v", resp.StatusCode, out)
	}
	resp, out = m.do("POST", "/api/v1/auth/reauth", map[string]string{"code": m.code(secret)})
	m.mustStatus(resp, 200, out)
	resp, out = m.do("POST", "/api/v1/mfa/recovery-codes/regenerate", nil)
	m.mustStatus(resp, 200, out)
	if len(out["recoveryCodes"].([]any)) != 10 {
		t.Fatalf("regenerate = %v", out)
	}
	resp, out = m.do("POST", "/api/v1/auth/reauth", map[string]string{})
	if resp.StatusCode != 400 || errCode(out) != "invalid_input" {
		t.Fatalf("empty reauth = %d %v", resp.StatusCode, out)
	}
	// Anonymous reauth.
	resp, out = m.client("203.0.113.40").do("POST", "/api/v1/auth/reauth", map[string]string{"password": "x"})
	if resp.StatusCode != 401 || errCode(out) != "unauthorized" {
		t.Fatalf("anonymous reauth = %d %v", resp.StatusCode, out)
	}
}

func TestBearerTokenNeverChallenged(t *testing.T) {
	m := newMFAEnv(t)
	// Minting tokens is a credential route: a script needs an admin token
	// (route-authorization-policy), which is never challenged either.
	resp, out := m.do("POST", "/api/v1/tokens", map[string]string{"name": "script", "scope": "admin"})
	m.mustStatus(resp, 201, out)
	bearer := "Bearer " + out["secret"].(string)
	m.member("member@example.com", "203.0.113.51")
	m.enrol(m.env)
	// The owner requires the factor for everyone; scripts are unaffected.
	resp, out = m.do("PUT", "/api/v1/settings/mfa", map[string]string{"required": "all"})
	m.mustStatus(resp, 200, out)
	m.clock.advance(FreshWindow + time.Hour)

	script := newClientAt(m.env, "203.0.113.50")
	resp, out = script.do("POST", "/api/v1/tokens", map[string]string{"name": "minted by script"}, "Authorization", bearer)
	script.mustStatus(resp, 201, out)
	resp, out = script.do("GET", "/api/v1/tasks", nil, "Authorization", bearer)
	script.mustStatus(resp, 200, out)
	resp, out = script.do("POST", "/api/v1/auth/reauth", map[string]string{"password": "x"}, "Authorization", bearer)
	if resp.StatusCode != 400 {
		t.Fatalf("bearer reauth = %d %v", resp.StatusCode, out)
	}
	// A member's bearer token keeps working under the policy although the member
	// has no second factor.
	var memberToken string
	{
		mc := m.client("203.0.113.52")
		resp, out = login(mc, "member@example.com", "member long password")
		mc.mustStatus(resp, 200, out)
		resp, out = mc.do("POST", "/api/v1/tokens", map[string]string{"name": "x"})
		if resp.StatusCode != 403 || errCode(out) != "mfa_enrolment_required" {
			t.Fatalf("restricted member token creation = %d %v", resp.StatusCode, out)
		}
		// Create the member's token directly to model a token minted before the policy.
		var uid string
		if err := m.db.QueryRow("SELECT id FROM users WHERE email = 'member@example.com'").Scan(&uid); err != nil {
			t.Fatal(err)
		}
		_, plain, err := auth.NewService(m.db, time.Hour, false).CreateToken(t.Context(), uid, "old")
		if err != nil {
			t.Fatal(err)
		}
		memberToken = plain
	}
	resp, out = script.do("GET", "/api/v1/tasks", nil, "Authorization", "Bearer "+memberToken)
	script.mustStatus(resp, 200, out)
}

func TestReauthRateLimited(t *testing.T) {
	m := newMFAEnv(t)
	m.ip = "203.0.113.60"
	for i := 0; i < 10; i++ {
		resp, out := m.do("POST", "/api/v1/auth/reauth", map[string]string{"password": "wrong password"})
		if resp.StatusCode != 401 {
			t.Fatalf("attempt %d = %d %v", i+1, resp.StatusCode, out)
		}
	}
	resp, out := m.do("POST", "/api/v1/auth/reauth", map[string]string{"password": "correct horse battery"})
	if resp.StatusCode != http.StatusTooManyRequests || errCode(out) != "rate_limited" {
		t.Fatalf("11th attempt = %d %v", resp.StatusCode, out)
	}
	// Another address is past the per-address window, but ten failures also lock
	// the account (trusted-client-identity, TestReauthAccountLockout).
	m.ip = "203.0.113.61"
	resp, out = m.do("POST", "/api/v1/auth/reauth", map[string]string{"password": "correct horse battery"})
	if resp.StatusCode != http.StatusTooManyRequests || errCode(out) != "account_locked" {
		t.Fatalf("other address = %d %v", resp.StatusCode, out)
	}
}

func TestPolicyRestrictsUnenrolledSessions(t *testing.T) {
	m := newMFAEnv(t)
	m.enrol(m.env)
	mc, _ := m.member("member@example.com", "203.0.113.70")
	// Before the policy: the member works normally.
	resp, out := mc.do("GET", "/api/v1/tasks", nil)
	mc.mustStatus(resp, 200, out)

	resp, out = m.do("PUT", "/api/v1/settings/mfa", map[string]string{"required": "all"})
	m.mustStatus(resp, 200, out)
	if out["required"] != "all" {
		t.Fatalf("policy = %v", out)
	}
	// The member's existing session is restricted on the next request.
	for _, r := range []struct{ method, path string }{
		{"GET", "/api/v1/tasks"}, {"POST", "/api/v1/sync"}, {"GET", "/api/v1/tokens"}, {"GET", "/api/v1/export"},
	} {
		resp, out := mc.do(r.method, r.path, map[string]any{"device": "d", "cursor": 0, "ops": []any{}})
		if resp.StatusCode != 403 || errCode(out) != "mfa_enrolment_required" {
			t.Fatalf("%s %s restricted = %d %v", r.method, r.path, resp.StatusCode, out)
		}
	}
	// A new sign-in succeeds (no lock-out) and is restricted too.
	nc := m.client("203.0.113.71")
	resp, out = login(nc, "member@example.com", "member long password")
	nc.mustStatus(resp, 200, out)
	resp, out = nc.do("GET", "/api/v1/tasks", nil)
	if resp.StatusCode != 403 || errCode(out) != "mfa_enrolment_required" {
		t.Fatalf("new session restricted = %d %v", resp.StatusCode, out)
	}
	// Profile and status say so.
	resp, out = nc.do("GET", "/api/v1/me", nil)
	nc.mustStatus(resp, 200, out)
	if st := out["mfa"].(map[string]any); st["restricted"] != true || st["required"] != true || st["policy"] != "all" {
		t.Fatalf("me.mfa = %v", st)
	}
	_, out = nc.do("GET", "/api/v1/auth/status", nil)
	if out["mfa"].(map[string]any)["restricted"] != true {
		t.Fatalf("status.mfa = %v", out["mfa"])
	}
	// Enrolment works while restricted, and lifts the restriction.
	m.enrol(nc)
	resp, out = nc.do("GET", "/api/v1/tasks", nil)
	nc.mustStatus(resp, 200, out)
	resp, out = mc.do("GET", "/api/v1/tasks", nil)
	mc.mustStatus(resp, 200, out)
	// Sign-out works while restricted (for another restricted account).
	resp, out = m.do("PUT", "/api/v1/settings/mfa", map[string]string{"required": "owner"})
	m.mustStatus(resp, 200, out)
	if len(m.events(audit.SettingsChangedName)) != 2 {
		t.Fatalf("settings.changed events = %d", len(m.events(audit.SettingsChangedName)))
	}
	resp, out = m.do("PUT", "/api/v1/settings/mfa", map[string]string{"required": "sometimes"})
	if resp.StatusCode != 400 || errCode(out) != "invalid_input" {
		t.Fatalf("invalid policy = %d %v", resp.StatusCode, out)
	}
}

func TestPolicyRequiresOwner(t *testing.T) {
	m := newMFAEnv(t)
	mc, _ := m.member("member@example.com", "203.0.113.80")
	for _, method := range []string{"GET", "PUT"} {
		resp, out := mc.do(method, "/api/v1/settings/mfa", map[string]string{"required": "none"})
		if resp.StatusCode != 403 || errCode(out) != "forbidden" {
			t.Fatalf("member %s = %d %v", method, resp.StatusCode, out)
		}
		resp, out = m.client("203.0.113.81").do(method, "/api/v1/settings/mfa", map[string]string{"required": "none"})
		if resp.StatusCode != 401 || errCode(out) != "unauthorized" {
			t.Fatalf("anonymous %s = %d %v", method, resp.StatusCode, out)
		}
	}
	resp, out := m.do("GET", "/api/v1/settings/mfa", nil)
	m.mustStatus(resp, 200, out)
	if out["required"] != "none" {
		t.Fatalf("default policy = %v", out)
	}
	// "owner" restricts the unenrolled owner, not the member.
	resp, out = m.do("PUT", "/api/v1/settings/mfa", map[string]string{"required": "owner"})
	m.mustStatus(resp, 200, out)
	resp, out = mc.do("GET", "/api/v1/tasks", nil)
	mc.mustStatus(resp, 200, out)
	resp, out = m.do("GET", "/api/v1/tasks", nil)
	if resp.StatusCode != 403 || errCode(out) != "mfa_enrolment_required" {
		t.Fatalf("owner under owner policy = %d %v", resp.StatusCode, out)
	}
	resp, out = m.do("POST", "/api/v1/auth/logout", nil)
	m.mustStatus(resp, 204, out)
}

func TestEnrolConfirmDisable(t *testing.T) {
	m := newMFAEnv(t)
	// Anonymous requests.
	anon := m.client("203.0.113.90")
	for _, p := range []string{"/api/v1/mfa/totp/enroll", "/api/v1/mfa/totp/confirm"} {
		resp, out := anon.do("POST", p, map[string]string{"code": "123456"})
		if resp.StatusCode != 401 || errCode(out) != "unauthorized" {
			t.Fatalf("anonymous %s = %d %v", p, resp.StatusCode, out)
		}
	}
	// Wrong and stale confirmation codes.
	resp, out := m.do("POST", "/api/v1/mfa/totp/enroll", map[string]any{})
	m.mustStatus(resp, 200, out)
	secret := out["secret"].(string)
	resp, out = m.do("POST", "/api/v1/mfa/totp/confirm", map[string]string{"code": "000000"})
	if resp.StatusCode != 400 || errCode(out) != "mfa_code_invalid" {
		t.Fatalf("wrong confirm = %d %v", resp.StatusCode, out)
	}
	m.clock.advance(auth.EnrollmentTTL + time.Second)
	resp, out = m.do("POST", "/api/v1/mfa/totp/confirm", map[string]string{"code": m.code(secret)})
	if resp.StatusCode != 400 || errCode(out) != "mfa_code_invalid" {
		t.Fatalf("stale confirm = %d %v", resp.StatusCode, out)
	}
	_, out = m.do("GET", "/api/v1/mfa", nil)
	if out["mfa"].(map[string]any)["enrolled"] != false {
		t.Fatalf("enrolled after failures: %v", out)
	}
	// Disabling without a factor.
	m.do("POST", "/api/v1/auth/reauth", map[string]string{"password": "correct horse battery"})
	resp, out = m.do("DELETE", "/api/v1/mfa/totp", nil)
	if resp.StatusCode != 409 || errCode(out) != "mfa_not_enrolled" {
		t.Fatalf("disable unenrolled = %d %v", resp.StatusCode, out)
	}

	secret, _ = m.enrol(m.env)
	resp, out = m.do("POST", "/api/v1/mfa/totp/enroll", map[string]any{})
	if resp.StatusCode != 409 || errCode(out) != "mfa_already_enrolled" {
		t.Fatalf("second enrol = %d %v", resp.StatusCode, out)
	}
	if len(m.events(audit.MFAEnrolledName)) != 1 {
		t.Fatal("mfa.enrolled not recorded")
	}
	// Remember a browser, then disable: the next sign-in needs only the password
	// and the trusted devices are gone.
	c := m.client("203.0.113.91")
	_, out = login(c, "owner@example.com", "correct horse battery")
	resp, out = c.do("POST", "/api/v1/auth/mfa", map[string]any{"challenge": out["challenge"], "code": m.code(secret), "remember": true})
	c.mustStatus(resp, 200, out)
	resp, out = m.do("DELETE", "/api/v1/mfa/totp", nil)
	m.mustStatus(resp, 204, out)
	if n := countRows(t, m, "SELECT COUNT(*) FROM trusted_devices"); n != 0 {
		t.Fatalf("trusted devices after disable = %d", n)
	}
	resp, out = login(m.client("203.0.113.92"), "owner@example.com", "correct horse battery")
	if resp.StatusCode != 200 || out["mfaRequired"] != nil {
		t.Fatalf("login after disable = %v", out)
	}
	if ev := m.events(audit.MFADisabledName); len(ev) != 1 || ev[0].Details["method"] != "totp" {
		t.Fatalf("mfa.disabled = %+v", ev)
	}
}

func countRows(t *testing.T, m *mfaEnv, q string) int {
	t.Helper()
	var n int
	if err := m.db.QueryRow(q).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestDisableRefusedByPolicy(t *testing.T) {
	m := newMFAEnv(t)
	m.enrol(m.env)
	resp, out := m.do("PUT", "/api/v1/settings/mfa", map[string]string{"required": "owner"})
	m.mustStatus(resp, 200, out)
	resp, out = m.do("DELETE", "/api/v1/mfa/totp", nil)
	if resp.StatusCode != 403 || errCode(out) != "mfa_required_by_policy" {
		t.Fatalf("disable under policy = %d %v", resp.StatusCode, out)
	}
	_, out = m.do("GET", "/api/v1/mfa", nil)
	if out["mfa"].(map[string]any)["enrolled"] != true {
		t.Fatal("factor removed despite policy")
	}
}

func TestOwnerResetClearsEverything(t *testing.T) {
	m := newMFAEnv(t)
	mc, memberID := m.member("member@example.com", "203.0.113.100")
	secret, _ := m.enrol(mc)
	// The member remembers a browser.
	b := m.client("203.0.113.101")
	_, out := login(b, "member@example.com", "member long password")
	resp, out := b.do("POST", "/api/v1/auth/mfa", map[string]any{"challenge": out["challenge"], "code": m.code(secret), "remember": true})
	b.mustStatus(resp, 200, out)
	resp, out = m.do("PUT", "/api/v1/settings/mfa", map[string]string{"required": "all"})
	m.mustStatus(resp, 200, out)
	// The owner is restricted under "all" too; enrol so the reset can be called.
	m.enrol(m.env)

	// A member cannot reset.
	resp, out = mc.do("POST", "/api/v1/members/"+memberID+"/mfa/reset", nil)
	if resp.StatusCode != 403 || errCode(out) != "forbidden" {
		t.Fatalf("member reset = %d %v", resp.StatusCode, out)
	}
	resp, out = m.do("POST", "/api/v1/members/nope/mfa/reset", nil)
	m.mustStatus(resp, 404, out)
	resp, out = m.do("POST", "/api/v1/members/"+memberID+"/mfa/reset", nil)
	m.mustStatus(resp, 204, out)
	for _, q := range []string{
		"SELECT COUNT(*) FROM mfa_totp WHERE user_id = '" + memberID + "'",
		"SELECT COUNT(*) FROM mfa_recovery_codes WHERE user_id = '" + memberID + "'",
		"SELECT COUNT(*) FROM trusted_devices WHERE user_id = '" + memberID + "'",
		"SELECT COUNT(*) FROM session_auth a JOIN sessions s ON s.token_hash = a.token_hash WHERE s.user_id = '" + memberID + "' AND a.mfa_at IS NOT NULL",
	} {
		if n := countRows(t, m, q); n != 0 {
			t.Fatalf("%s = %d", q, n)
		}
	}
	// The member signs in with the password alone, then must re-enrol.
	nc := m.client("203.0.113.102")
	resp, out = login(nc, "member@example.com", "member long password")
	if resp.StatusCode != 200 || out["mfaRequired"] != nil {
		t.Fatalf("login after reset = %v", out)
	}
	resp, out = nc.do("GET", "/api/v1/tasks", nil)
	if errCode(out) != "mfa_enrolment_required" {
		t.Fatalf("after reset under policy = %v", out)
	}
	ev := m.events(audit.MFAResetName)
	if len(ev) != 1 || str(ev[0].TargetID) != memberID || str(ev[0].ActorID) == "" {
		t.Fatalf("mfa.reset = %+v", ev)
	}
}
