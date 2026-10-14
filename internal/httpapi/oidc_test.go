package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/oidc"
	"github.com/pixari/opentodo/internal/oidc/oidctest"
	"github.com/pixari/opentodo/internal/settings"
	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// oidcEnv is a server wired to an in-process provider, with the controllable
// clock of the two-factor tests and a registered owner.
type oidcEnv struct {
	*mfaEnv
	idp *oidctest.Provider
}

func newOIDCEnv(t *testing.T, allowSignup bool) *oidcEnv {
	t.Helper()
	idp := oidctest.New(t)
	dir := t.TempDir()
	db, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	cfg := config.Config{SessionTTL: 24 * time.Hour, AllowSignup: allowSignup, DataDir: dir}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	syncSvc := opsync.NewService(db)
	authSvc := auth.NewService(db, cfg.SessionTTL, allowSignup)
	clk := &mfaClock{t: time.Now().Truncate(30 * time.Second)}
	authSvc.SetClock(clk.now)
	svc := oidc.New(settings.New(db), dir, oidc.Options{Client: idp.HTTPClient()})
	h := New(cfg, authSvc, syncSvc, nil, log, "test", WithOIDC(svc))
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	t.Cleanup(syncSvc.Notifier().CloseAll)
	jar, _ := cookiejar.New(nil)
	e := &oidcEnv{mfaEnv: &mfaEnv{env: &env{t: t, srv: srv, client: &http.Client{Jar: jar}, db: db, handler: h, sync: syncSvc}, clock: clk}, idp: idp}
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	return e
}

// configure saves the provider as the owner (fresh session) with extra fields.
func (o *oidcEnv) configure(extra map[string]any) map[string]any {
	o.t.Helper()
	body := map[string]any{"issuer": o.idp.Issuer(), "clientId": o.idp.ClientID, "clientSecret": o.idp.ClientSecret, "displayName": "Home SSO"}
	for k, v := range extra {
		body[k] = v
	}
	resp, out := o.do("PUT", "/api/v1/settings/oidc", body)
	o.mustStatus(resp, 200, out)
	return out
}

// raw performs a GET without following redirects, with c's cookies.
func raw(c *env, u string, headers ...string) *http.Response {
	c.t.Helper()
	cl := &http.Client{Jar: c.client.Jar, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	req, _ := http.NewRequest("GET", u, nil)
	if c.ip != "" {
		req.Header.Set("X-Forwarded-For", c.ip)
	}
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	resp, err := cl.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	resp.Body.Close()
	return resp
}

// authorize runs start and the provider step for c and returns the callback URL.
func (o *oidcEnv) authorize(c *env) string {
	o.t.Helper()
	resp := raw(c, o.srv.URL+"/api/v1/auth/oidc/start")
	if resp.StatusCode != http.StatusFound {
		o.t.Fatalf("start = %d", resp.StatusCode)
	}
	loc := resp.Header.Get("Location")
	if !strings.HasPrefix(loc, o.idp.Issuer()+"/authorize?") {
		o.t.Fatalf("start redirects to %q", loc)
	}
	idpResp, err := o.idp.HTTPClient().Get(loc)
	if err != nil {
		o.t.Fatal(err)
	}
	idpResp.Body.Close()
	back := idpResp.Header.Get("Location")
	if !strings.HasPrefix(back, o.srv.URL+oidcCallbackPath+"?") {
		o.t.Fatalf("provider redirects to %q", back)
	}
	return back
}

// ssoLogin runs the whole flow and returns the callback response.
func (o *oidcEnv) ssoLogin(c *env, headers ...string) *http.Response {
	o.t.Helper()
	return raw(c, o.authorize(c), headers...)
}

func location(resp *http.Response) string { return resp.Header.Get("Location") }

func (o *oidcEnv) auditCount(where string, args ...any) int {
	o.t.Helper()
	var n int
	if err := o.db.QueryRow("SELECT COUNT(*) FROM audit_events WHERE "+where, args...).Scan(&n); err != nil {
		o.t.Fatal(err)
	}
	return n
}

func TestOIDCEndToEndWithFakeProvider(t *testing.T) {
	o := newOIDCEnv(t, false)

	// Not configured: dormant.
	resp, out := o.do("GET", "/api/v1/auth/status", nil)
	if st := out["oidc"].(map[string]any); st["enabled"] != false {
		t.Fatalf("status before configuration = %v", st)
	}
	for _, p := range []string{"/api/v1/auth/oidc/start", oidcCallbackPath + "?code=x&state=y"} {
		resp, out = o.client("203.0.113.1").do("GET", p, nil)
		if resp.StatusCode != 404 || errCode(out) != "oidc_disabled" {
			t.Fatalf("%s unconfigured = %d %v", p, resp.StatusCode, out)
		}
	}

	// Configure and test.
	cfg := o.configure(map[string]any{"allowProvision": true})
	if cfg["clientSecret"] != "••••1234" || cfg["clientSecretSet"] != true || cfg["enabled"] != true ||
		cfg["redirectUri"] != o.srv.URL+oidcCallbackPath || cfg["baseUrlConfigured"] != false {
		t.Fatalf("settings = %v", cfg)
	}
	resp, out = o.do("POST", "/api/v1/settings/oidc/test", nil)
	o.mustStatus(resp, 200, out)
	host := strings.TrimPrefix(o.idp.Issuer(), "https://")
	if out["authorizationHost"] != host || out["tokenHost"] != host || out["endSessionSupported"] != true {
		t.Fatalf("test = %v", out)
	}
	anon := o.client("203.0.113.2")
	_, out = anon.do("GET", "/api/v1/auth/status", nil)
	if st := out["oidc"].(map[string]any); st["enabled"] != true || st["displayName"] != "Home SSO" || st["ssoOnly"] != false {
		t.Fatalf("status = %v", st)
	}

	// A new member signs in and is provisioned. The request carries PKCE, state and nonce.
	member := o.client("203.0.113.3")
	resp = o.ssoLogin(member)
	if resp.StatusCode != http.StatusSeeOther || location(resp) != "/" || !hasCookie(resp, sessionCookie) {
		t.Fatalf("callback = %d %q", resp.StatusCode, location(resp))
	}
	q := o.idp.LastAuthorize
	if q.Get("code_challenge_method") != "S256" || q.Get("code_challenge") == "" || q.Get("state") == "" || q.Get("nonce") == "" ||
		q.Get("redirect_uri") != o.srv.URL+oidcCallbackPath || q.Get("scope") != oidc.DefaultScopes {
		t.Fatalf("authorize query = %v", q)
	}
	resp, out = member.do("GET", "/api/v1/me", nil)
	member.mustStatus(resp, 200, out)
	if u := out["user"].(map[string]any); u["email"] != "member@example.com" || u["role"] != "member" || u["name"] != "Member" {
		t.Fatalf("provisioned user = %v", u)
	}
	if n := o.auditCount("name = 'login.succeeded' AND details LIKE '%\"oidc\"%'"); n != 1 {
		t.Fatalf("login.succeeded oidc events = %d", n)
	}
	if n := o.auditCount("name = 'identity.linked' AND details LIKE '%Home SSO%'"); n != 1 {
		t.Fatalf("identity.linked events = %d", n)
	}

	// The same subject with a changed email returns to the same account.
	o.idp.SetUser(oidctest.User{Subject: "user-1", Email: "renamed@example.com", EmailVerified: true, Name: "Member"})
	again := o.client("203.0.113.4")
	if resp = o.ssoLogin(again); location(resp) != "/" {
		t.Fatalf("returning identity = %q", location(resp))
	}
	_, out = again.do("GET", "/api/v1/me", nil)
	if out["user"].(map[string]any)["email"] != "member@example.com" {
		t.Fatalf("returning identity signed in as %v", out["user"])
	}

	// The owner's verified email links the owner account.
	o.idp.SetUser(oidctest.User{Subject: "owner-sub", Email: "owner@example.com", EmailVerified: true})
	ownerSSO := o.client("203.0.113.5")
	if resp = o.ssoLogin(ownerSSO); location(resp) != "/" {
		t.Fatalf("owner link = %q", location(resp))
	}
	_, out = ownerSSO.do("GET", "/api/v1/me", nil)
	if out["user"].(map[string]any)["role"] != "owner" {
		t.Fatalf("email-matched sign-in = %v", out["user"])
	}

	// Linking from Settings with a session: a second identity, same session.
	o.idp.SetUser(oidctest.User{Subject: "owner-second", Email: "", EmailVerified: false})
	resp = o.ssoLogin(o.env)
	if resp.StatusCode != http.StatusSeeOther || location(resp) != "/settings/security?linked=1" || hasCookie(resp, sessionCookie) {
		t.Fatalf("link = %d %q", resp.StatusCode, location(resp))
	}
	resp, out = o.do("GET", "/api/v1/me/identities", nil)
	o.mustStatus(resp, 200, out)
	if n := len(out["identities"].([]any)); n != 2 {
		t.Fatalf("owner identities = %d (%v)", n, out)
	}
	if p := out["provider"].(map[string]any); p["displayName"] != "Home SSO" {
		t.Fatalf("provider = %v", p)
	}
	// An identity linked to someone else: 409 for scripts, a redirect for browsers.
	o.idp.SetUser(oidctest.User{Subject: "user-1", Email: "member@example.com", EmailVerified: true})
	cb := o.authorize(o.env)
	resp, out = o.do("GET", strings.TrimPrefix(cb, o.srv.URL), nil)
	if resp.StatusCode != 409 || errCode(out) != "identity_taken" {
		t.Fatalf("taken identity = %d %v", resp.StatusCode, out)
	}
	resp = raw(o.env, o.authorize(o.env), "Accept", "text/html")
	if location(resp) != "/settings/security?error=identity_taken" {
		t.Fatalf("taken identity (browser) = %d %q", resp.StatusCode, location(resp))
	}

	// Provider refuses; token fails verification; unverified email; closed provisioning.
	o.idp.AuthorizeError = "access_denied"
	c := o.client("203.0.113.6")
	if resp = o.ssoLogin(c); location(resp) != "/?error=oidc_failed" || hasCookie(resp, sessionCookie) {
		t.Fatalf("provider error = %q", location(resp))
	}
	o.idp.AuthorizeError = ""
	o.idp.MutateClaims = func(m map[string]any) { m["aud"] = "someone-else" }
	if resp = o.ssoLogin(c); location(resp) != "/?error=oidc_failed" || hasCookie(resp, sessionCookie) {
		t.Fatalf("bad audience = %q", location(resp))
	}
	o.idp.MutateClaims = nil
	o.idp.SetUser(oidctest.User{Subject: "new-unverified", Email: "x@example.com", EmailVerified: false})
	if resp = o.ssoLogin(c); location(resp) != "/?error=oidc_email_unverified" {
		t.Fatalf("unverified = %q", location(resp))
	}
	o.configure(map[string]any{"allowProvision": false})
	o.idp.SetUser(oidctest.User{Subject: "new-closed", Email: "closed@example.com", EmailVerified: true})
	if resp = o.ssoLogin(c); location(resp) != "/?error=signup_closed" || hasCookie(resp, sessionCookie) {
		t.Fatalf("closed = %q", location(resp))
	}
	var users int
	_ = o.db.QueryRow("SELECT COUNT(*) FROM users").Scan(&users)
	if users != 2 {
		t.Fatalf("users = %d, want owner and the provisioned member", users)
	}

	// Sign-out: local by default; provider sign-out when enabled, only for
	// sessions that started through the provider.
	resp, out = member.do("POST", "/api/v1/auth/logout", nil)
	if resp.StatusCode != 204 {
		t.Fatalf("local logout = %d %v", resp.StatusCode, out)
	}
	o.configure(map[string]any{"providerLogout": true})
	resp, out = again.do("POST", "/api/v1/auth/logout", nil)
	again.mustStatus(resp, 200, out)
	redirect, _ := out["redirect"].(string)
	ru, _ := url.Parse(redirect)
	if !strings.HasPrefix(redirect, o.idp.Issuer()+"/logout?") || ru.Query().Get("id_token_hint") == "" ||
		ru.Query().Get("post_logout_redirect_uri") != o.srv.URL+"/" || ru.Query().Get("client_id") != o.idp.ClientID {
		t.Fatalf("provider logout redirect = %q", redirect)
	}
	resp, _ = again.do("GET", "/api/v1/me", nil)
	if resp.StatusCode != 401 {
		t.Fatalf("session after provider logout = %d", resp.StatusCode)
	}
	resp, _ = o.do("POST", "/api/v1/auth/logout", nil)
	if resp.StatusCode != 204 {
		t.Fatalf("password session logout with provider logout on = %d", resp.StatusCode)
	}
}

func TestOIDCSettingsRequireOwner(t *testing.T) {
	o := newOIDCEnv(t, true)
	anon := o.client("203.0.113.10")
	for _, r := range []struct{ method, path string }{
		{"GET", "/api/v1/settings/oidc"}, {"PUT", "/api/v1/settings/oidc"}, {"POST", "/api/v1/settings/oidc/test"},
		{"GET", "/api/v1/me/identities"}, {"DELETE", "/api/v1/me/identities/x"},
	} {
		resp, out := anon.do(r.method, r.path, map[string]any{})
		if resp.StatusCode != 401 || errCode(out) != "unauthorized" {
			t.Fatalf("anonymous %s %s = %d %v", r.method, r.path, resp.StatusCode, out)
		}
	}
	member := o.client("203.0.113.11")
	resp, out := member.do("POST", "/api/v1/auth/register", map[string]string{"email": "m@example.com", "password": "member password 1"})
	member.mustStatus(resp, 201, out)
	for _, r := range []struct{ method, path string }{
		{"GET", "/api/v1/settings/oidc"}, {"PUT", "/api/v1/settings/oidc"}, {"POST", "/api/v1/settings/oidc/test"},
	} {
		resp, out := member.do(r.method, r.path, map[string]any{"issuer": o.idp.Issuer()})
		if resp.StatusCode != 403 || errCode(out) != "forbidden" {
			t.Fatalf("member %s %s = %d %v", r.method, r.path, resp.StatusCode, out)
		}
	}
	// Invalid issuers are refused and the previous configuration stays.
	o.configure(nil)
	for _, iss := range []string{"http://sso.example.com", o.idp.Issuer() + "/missing", "not a url"} {
		resp, out := o.do("PUT", "/api/v1/settings/oidc", map[string]any{"issuer": iss})
		if resp.StatusCode != 400 || errCode(out) != "invalid_input" {
			t.Fatalf("issuer %q = %d %v", iss, resp.StatusCode, out)
		}
		resp, out = o.do("POST", "/api/v1/settings/oidc/test", map[string]any{"issuer": iss})
		if resp.StatusCode != 400 || errCode(out) != "invalid_input" {
			t.Fatalf("test %q = %d %v", iss, resp.StatusCode, out)
		}
	}
	o.idp.IssuerOverride = "https://impostor.example.com"
	o.configure(map[string]any{"issuer": ""}) // clear, so the next save re-discovers
	resp, out = o.do("PUT", "/api/v1/settings/oidc", map[string]any{"issuer": o.idp.Issuer()})
	if resp.StatusCode != 400 || !strings.Contains(errCode(out), "invalid_input") {
		t.Fatalf("issuer mismatch = %d %v", resp.StatusCode, out)
	}
	o.idp.IssuerOverride = ""
	// The masked secret round-trips as "keep"; the secret never appears in reads or the audit log.
	o.configure(nil)
	resp, out = o.do("PUT", "/api/v1/settings/oidc", map[string]any{"clientSecret": "••••1234", "displayName": "Office"})
	o.mustStatus(resp, 200, out)
	raw, _ := json.Marshal(out)
	if strings.Contains(string(raw), o.idp.ClientSecret) || out["clientSecretSet"] != true {
		t.Fatalf("settings leak or lost the secret: %s", raw)
	}
	if n := o.auditCount("details LIKE ?", "%"+o.idp.ClientSecret+"%"); n != 0 {
		t.Fatalf("secret in audit log (%d events)", n)
	}
	if n := o.auditCount("name = 'settings.changed' AND details LIKE '%oidc.issuer%'"); n < 1 {
		t.Fatalf("settings.changed events for the issuer = %d", n)
	}
}

func TestOIDCCallbackStateInvalid(t *testing.T) {
	o := newOIDCEnv(t, false)
	o.configure(map[string]any{"allowProvision": true})
	c := o.client("203.0.113.20")
	// No cookie at all (another browser, or a forged link).
	cb := o.authorize(o.client("203.0.113.21"))
	resp, out := c.do("GET", strings.TrimPrefix(cb, o.srv.URL), nil)
	if resp.StatusCode != 400 || errCode(out) != "oidc_state_invalid" || hasCookie(resp, sessionCookie) {
		t.Fatalf("no cookie = %d %v", resp.StatusCode, out)
	}
	// A state that was not issued for this cookie.
	o.authorize(c)
	u, _ := url.Parse(cb)
	qs := u.Query()
	qs.Set("state", "forged")
	resp, out = c.do("GET", oidcCallbackPath+"?"+qs.Encode(), nil)
	if resp.StatusCode != 400 || errCode(out) != "oidc_state_invalid" {
		t.Fatalf("forged state = %d %v", resp.StatusCode, out)
	}
	// Replay: the same callback with the same (re-sent) cookie works once only.
	cb = o.authorize(c)
	cookies := c.client.Jar.Cookies(mustURL(o.srv.URL + "/api/v1/auth/oidc"))
	resp = raw(c, cb)
	if location(resp) != "/" {
		t.Fatalf("first use = %d %q", resp.StatusCode, location(resp))
	}
	replay := o.client("203.0.113.22")
	replay.client.Jar.SetCookies(mustURL(o.srv.URL+"/api/v1/auth/oidc"), cookies)
	resp, out = replay.do("GET", strings.TrimPrefix(cb, o.srv.URL), nil)
	if resp.StatusCode != 400 || errCode(out) != "oidc_state_invalid" || hasCookie(resp, sessionCookie) {
		t.Fatalf("replay = %d %v", resp.StatusCode, out)
	}
	// Browsers are sent back to the sign-in screen instead of seeing JSON.
	resp = raw(o.client("203.0.113.23"), cb, "Accept", "text/html")
	if location(resp) != "/?error=oidc_state_invalid" {
		t.Fatalf("browser state error = %d %q", resp.StatusCode, location(resp))
	}
}

func mustURL(s string) *url.URL {
	u, err := url.Parse(s)
	if err != nil {
		panic(err)
	}
	return u
}

func TestUnlinkLastCredentialRefused(t *testing.T) {
	o := newOIDCEnv(t, false)
	o.configure(map[string]any{"allowProvision": true, "ssoOnly": true})
	member := o.client("203.0.113.30")
	if resp := o.ssoLogin(member); location(resp) != "/" {
		t.Fatalf("member sign-in = %q", location(resp))
	}
	_, out := member.do("GET", "/api/v1/me/identities", nil)
	list := out["identities"].([]any)
	if len(list) != 1 {
		t.Fatalf("identities = %v", out)
	}
	id := list[0].(map[string]any)["id"].(string)
	resp, out := member.do("DELETE", "/api/v1/me/identities/"+id, nil)
	if resp.StatusCode != 409 || errCode(out) != "last_credential" {
		t.Fatalf("unlink last = %d %v", resp.StatusCode, out)
	}
	resp, out = o.client("203.0.113.31").do("DELETE", "/api/v1/me/identities/"+id, nil)
	if resp.StatusCode != 401 {
		t.Fatalf("anonymous unlink = %d %v", resp.StatusCode, out)
	}
	resp, out = o.do("DELETE", "/api/v1/me/identities/"+id, nil)
	if resp.StatusCode != 404 {
		t.Fatalf("someone else's identity = %d %v", resp.StatusCode, out)
	}
	// The owner keeps a password (break-glass), so its identity can go.
	o.idp.SetUser(oidctest.User{Subject: "owner-sub", Email: "owner@example.com", EmailVerified: true})
	if resp := o.ssoLogin(o.env); location(resp) != "/settings/security?linked=1" {
		t.Fatalf("owner link = %q", location(resp))
	}
	_, out = o.do("GET", "/api/v1/me/identities", nil)
	oid := out["identities"].([]any)[0].(map[string]any)["id"].(string)
	resp, out = o.do("DELETE", "/api/v1/me/identities/"+oid, nil)
	if resp.StatusCode != 204 {
		t.Fatalf("owner unlink = %d %v", resp.StatusCode, out)
	}
	if n := o.auditCount("name = 'identity.unlinked'"); n != 1 {
		t.Fatalf("identity.unlinked events = %d", n)
	}
}

func TestMemberPasswordRefusedInSSOOnly(t *testing.T) {
	o := newOIDCEnv(t, true)
	member := o.client("203.0.113.40")
	resp, out := member.do("POST", "/api/v1/auth/register", map[string]string{"email": "m@example.com", "password": "member password 1"})
	member.mustStatus(resp, 201, out)
	resp, out = member.do("POST", "/api/v1/tokens", map[string]string{"name": "script"})
	member.mustStatus(resp, 201, out)
	token := out["secret"].(string)

	o.configure(map[string]any{"ssoOnly": true})
	_, out = o.client("203.0.113.41").do("GET", "/api/v1/auth/status", nil)
	if out["oidc"].(map[string]any)["ssoOnly"] != true {
		t.Fatalf("status = %v", out["oidc"])
	}
	fresh := o.client("203.0.113.42")
	resp, out = login(fresh, "m@example.com", "member password 1")
	if resp.StatusCode != 403 || errCode(out) != "sso_required" || hasCookie(resp, sessionCookie) {
		t.Fatalf("member password in SSO-only = %d %v", resp.StatusCode, out)
	}
	if n := o.auditCount("name = 'login.failed' AND details LIKE '%sso_required%'"); n != 1 {
		t.Fatalf("sso_required audit events = %d", n)
	}
	// A wrong password is still just invalid credentials.
	resp, out = login(fresh, "m@example.com", "wrong password!")
	if resp.StatusCode != 401 {
		t.Fatalf("wrong password = %d %v", resp.StatusCode, out)
	}
	// Registration through the password form is closed too.
	resp, out = fresh.do("POST", "/api/v1/auth/register", map[string]string{"email": "n@example.com", "password": "another password 1"})
	if resp.StatusCode != 403 || errCode(out) != "sso_required" {
		t.Fatalf("register in SSO-only = %d %v", resp.StatusCode, out)
	}
	// Owner break-glass and scripts keep working.
	resp, out = login(o.client("203.0.113.43"), "owner@example.com", "correct horse battery")
	if resp.StatusCode != 200 || !hasCookie(resp, sessionCookie) {
		t.Fatalf("owner password in SSO-only = %d %v", resp.StatusCode, out)
	}
	resp, out = fresh.do("GET", "/api/v1/me", nil, "Authorization", "Bearer "+token)
	if resp.StatusCode != 200 {
		t.Fatalf("bearer token in SSO-only = %d %v", resp.StatusCode, out)
	}
	// Turning the provider off ends SSO-only mode, so nobody is locked out.
	o.configure(map[string]any{"issuer": ""})
	resp, out = login(fresh, "m@example.com", "member password 1")
	if resp.StatusCode != 200 {
		t.Fatalf("member password after provider removed = %d %v", resp.StatusCode, out)
	}
}

// TestOIDCSignInSatisfiesMFA covers task 5.1: an account with a second factor
// that signs in through the provider is not asked for a code, and changing the
// provider settings on a stale session needs re-authentication.
func TestOIDCSignInSatisfiesMFA(t *testing.T) {
	o := newOIDCEnv(t, false)
	o.configure(nil)
	o.enrol(o.env)
	// Password sign-in asks for the code ...
	resp, out := login(o.client("203.0.113.50"), "owner@example.com", "correct horse battery")
	if resp.StatusCode != 200 || out["mfaRequired"] != true || hasCookie(resp, sessionCookie) {
		t.Fatalf("password sign-in of enrolled owner = %v", out)
	}
	// ... the provider sign-in does not.
	o.idp.SetUser(oidctest.User{Subject: "owner-sub", Email: "owner@example.com", EmailVerified: true})
	c := o.client("203.0.113.51")
	resp = o.ssoLogin(c)
	if location(resp) != "/" || !hasCookie(resp, sessionCookie) {
		t.Fatalf("provider sign-in of enrolled owner = %d %q", resp.StatusCode, location(resp))
	}
	var mfaAt *int64
	if err := o.db.QueryRow("SELECT mfa_at FROM session_auth a JOIN sessions s ON s.token_hash = a.token_hash JOIN users u ON u.id = s.user_id WHERE u.email = 'owner@example.com' ORDER BY s.created_at DESC LIMIT 1").Scan(&mfaAt); err != nil || mfaAt == nil {
		t.Fatalf("mfa_at of the provider session = %v %v", mfaAt, err)
	}
	resp, out = c.do("GET", "/api/v1/me", nil)
	c.mustStatus(resp, 200, out)

	// Stale session: changing SSO settings needs a fresh proof.
	o.clock.advance(FreshWindow + time.Second)
	resp, out = c.do("PUT", "/api/v1/settings/oidc", map[string]any{"displayName": "Stale"})
	if resp.StatusCode != 403 || errCode(out) != "reauth_required" {
		t.Fatalf("stale PUT = %d %v", resp.StatusCode, out)
	}
	// Running the provider flow again from the signed-in browser re-authenticates.
	if resp := o.ssoLogin(c); location(resp) != "/settings/security?reauthenticated=1" {
		t.Fatalf("provider re-authentication = %q", location(resp))
	}
	resp, out = c.do("PUT", "/api/v1/settings/oidc", map[string]any{"displayName": "Fresh"})
	c.mustStatus(resp, 200, out)
}
