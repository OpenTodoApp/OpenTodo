package httpapi

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/oidc/oidctest"
)

// appPKCE is the app's side of an app flow: a verifier, its challenge, a state.
type appPKCE struct{ verifier, challenge, state string }

func newAppPKCE(state string) appPKCE {
	v := strings.Repeat("v", 20) + state + strings.Repeat("x", 43-len(state))
	sum := sha256.Sum256([]byte(v))
	return appPKCE{verifier: v, challenge: base64.RawURLEncoding.EncodeToString(sum[:]), state: state}
}

// appAuthorize runs an app flow in sheet (the system's authentication sheet),
// taps Continue on the confirmation page and returns the redirect to the app.
func (o *oidcEnv) appAuthorize(sheet *env, p appPKCE) *url.URL {
	o.t.Helper()
	ticket := o.appConfirmation(sheet, p)
	back := appChoose(sheet, ticket, "continue", sheet.srv.URL)
	if back.StatusCode != http.StatusSeeOther || hasCookie(back, sessionCookie) {
		o.t.Fatalf("continue = %d, session cookie %v", back.StatusCode, hasCookie(back, sessionCookie))
	}
	u := mustURL(location(back))
	if u.Scheme != "opentodo" || u.Host != "sso" || u.Query().Get("state") != p.state {
		o.t.Fatalf("continue redirects to %q", location(back))
	}
	return u
}

var ticketField = regexp.MustCompile(`name="ticket" value="([^"]+)"`)

// appConfirmation runs an app flow in sheet up to the confirmation page, checks
// the page (no session, no code, the account named, a strict policy) and
// returns its ticket.
func (o *oidcEnv) appConfirmation(sheet *env, p appPKCE) string {
	o.t.Helper()
	q := url.Values{"app_challenge": {p.challenge}, "app_state": {p.state}}
	resp := raw(sheet, o.srv.URL+"/api/v1/auth/oidc/start?"+q.Encode())
	if resp.StatusCode != http.StatusFound {
		o.t.Fatalf("app start = %d", resp.StatusCode)
	}
	idpResp, err := o.idp.HTTPClient().Get(location(resp))
	if err != nil {
		o.t.Fatal(err)
	}
	idpResp.Body.Close()
	cl := &http.Client{Jar: sheet.client.Jar, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	req, _ := http.NewRequest("GET", idpResp.Header.Get("Location"), nil)
	req.Header.Set("X-Forwarded-For", sheet.ip)
	req.Header.Set("Accept-Language", "de-CH, de;q=0.9, en;q=0.5")
	page, err := cl.Do(req)
	if err != nil {
		o.t.Fatal(err)
	}
	defer page.Body.Close()
	body, _ := io.ReadAll(page.Body)
	if page.StatusCode != http.StatusOK || hasCookie(page, sessionCookie) || location(page) != "" {
		o.t.Fatalf("app callback = %d, session cookie %v, location %q", page.StatusCode, hasCookie(page, sessionCookie), location(page))
	}
	csp := page.Header.Get("Content-Security-Policy")
	for _, want := range []string{"default-src 'none'", "form-action 'self' opentodo:", "frame-ancestors 'none'"} {
		if !strings.Contains(csp, want) {
			o.t.Fatalf("page policy %q lacks %q", csp, want)
		}
	}
	html := string(body)
	if !regexp.MustCompile(`Als [a-z]+@example\.com in der OpenTodo-App weitermachen\?`).MatchString(html) || strings.Contains(html, "<script") || strings.Contains(html, "code=") {
		o.t.Fatalf("confirmation page:\n%s", html)
	}
	m := ticketField.FindStringSubmatch(html)
	if m == nil {
		o.t.Fatalf("no ticket on the page:\n%s", html)
	}
	return m[1]
}

// appChoose posts the confirmation page's form from sheet with an Origin.
func appChoose(sheet *env, ticket, action, origin string) *http.Response {
	sheet.t.Helper()
	form := url.Values{"ticket": {ticket}, "action": {action}}
	req, _ := http.NewRequest("POST", sheet.srv.URL+appSSOContinuePath, strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("X-Forwarded-For", sheet.ip)
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	cl := &http.Client{Jar: sheet.client.Jar, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := cl.Do(req)
	if err != nil {
		sheet.t.Fatal(err)
	}
	resp.Body.Close()
	return resp
}

// The confirmation page holds the code back until a tap: another site cannot
// post it, Cancel goes back to the app with nothing, and a ticket works once.
func TestOIDCAppFlowAsksBeforeTheHandOff(t *testing.T) {
	o := newOIDCEnv(t, false)
	o.configure(map[string]any{"allowProvision": true})
	sheet, webView := o.client("203.0.113.30"), o.client("203.0.113.31")

	p := newAppPKCE("app-state-ask")
	ticket := o.appConfirmation(sheet, p)
	if resp := appChoose(sheet, ticket, "continue", "https://evil.example"); resp.StatusCode != http.StatusForbidden {
		t.Fatalf("continue from another site = %d", resp.StatusCode)
	}
	back := appChoose(sheet, ticket, "cancel", sheet.srv.URL)
	u := mustURL(location(back))
	if back.StatusCode != http.StatusSeeOther || u.Scheme != "opentodo" || u.Query().Get("state") != p.state || u.Query().Get("code") != "" || u.Query().Get("error") != "" {
		t.Fatalf("cancel = %d %q", back.StatusCode, location(back))
	}
	if resp := appChoose(sheet, ticket, "continue", sheet.srv.URL); resp.StatusCode != http.StatusSeeOther || strings.HasPrefix(location(resp), "opentodo:") {
		t.Fatalf("continue after cancel = %d %q", resp.StatusCode, location(resp))
	}

	p = newAppPKCE("app-state-twice")
	ticket = o.appConfirmation(sheet, p)
	code := mustURL(location(appChoose(sheet, ticket, "continue", sheet.srv.URL))).Query().Get("code")
	if resp := appChoose(sheet, ticket, "continue", sheet.srv.URL); strings.HasPrefix(location(resp), "opentodo:") {
		t.Fatalf("a ticket released a second code: %q", location(resp))
	}
	if resp, out := redeem(webView, code, p.verifier); resp.StatusCode != http.StatusSeeOther || !hasCookie(resp, sessionCookie) {
		t.Fatalf("redeem after continue = %d %v", resp.StatusCode, out)
	}
}

// redeem posts a code and verifier from webView without following redirects.
func redeem(webView *env, code, verifier string, headers ...string) (*http.Response, map[string]any) {
	webView.t.Helper()
	b, _ := json.Marshal(map[string]string{"code": code, "code_verifier": verifier})
	req, _ := http.NewRequest("POST", webView.srv.URL+appSSOSessionPath, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-For", webView.ip)
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	cl := &http.Client{Jar: webView.client.Jar, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := cl.Do(req)
	if err != nil {
		webView.t.Fatal(err)
	}
	defer resp.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return resp, out
}

func TestOIDCAppFlowSignsInTheWebView(t *testing.T) {
	o := newOIDCEnv(t, false)
	o.configure(map[string]any{"allowProvision": true})
	sheet, webView := o.client("203.0.113.10"), o.client("203.0.113.11")

	p := newAppPKCE("app-state-1")
	back := o.appAuthorize(sheet, p)
	code := back.Query().Get("code")
	if code == "" || back.Query().Get("error") != "" {
		t.Fatalf("app redirect = %v", back)
	}
	// The sheet itself is not signed in.
	if resp, out := sheet.do("GET", "/api/v1/me", nil); resp.StatusCode != 401 {
		t.Fatalf("sheet /me = %d %v", resp.StatusCode, out)
	}

	// A wrong verifier spends the code.
	if resp, out := redeem(webView, code, newAppPKCE("other-state").verifier); resp.StatusCode != 400 || errCode(out) != "oidc_state_invalid" {
		t.Fatalf("wrong verifier = %d %v", resp.StatusCode, out)
	}
	if resp, out := redeem(webView, code, p.verifier); resp.StatusCode != 400 || errCode(out) != "oidc_state_invalid" {
		t.Fatalf("spent code = %d %v", resp.StatusCode, out)
	}

	// A fresh flow, redeemed with the right verifier, signs the web view in once.
	p = newAppPKCE("app-state-2")
	code = o.appAuthorize(sheet, p).Query().Get("code")
	resp, out := redeem(webView, code, p.verifier)
	if resp.StatusCode != http.StatusSeeOther || location(resp) != "/" || !hasCookie(resp, sessionCookie) {
		t.Fatalf("redeem = %d %q %v", resp.StatusCode, location(resp), out)
	}
	resp, out = webView.do("GET", "/api/v1/me", nil)
	webView.mustStatus(resp, 200, out)
	if u := out["user"].(map[string]any); u["email"] != "member@example.com" {
		t.Fatalf("signed in as %v", u)
	}
	if resp, out = redeem(o.client("203.0.113.12"), code, p.verifier); resp.StatusCode != 400 {
		t.Fatalf("replayed code = %d %v", resp.StatusCode, out)
	}
	if n := o.auditCount("name = 'login.succeeded' AND details LIKE '%\"oidc\"%'"); n != 1 {
		t.Fatalf("login.succeeded oidc events = %d", n)
	}
}

func TestOIDCAppFlowRefusals(t *testing.T) {
	o := newOIDCEnv(t, false)
	o.configure(map[string]any{"allowProvision": true})
	sheet := o.client("203.0.113.20")

	// Malformed app parameters.
	for _, q := range []string{"app_challenge=short&app_state=s", "app_challenge=" + newAppPKCE("s").challenge, "app_state=s"} {
		resp, out := sheet.do("GET", "/api/v1/auth/oidc/start?"+q, nil)
		if resp.StatusCode != 400 || errCode(out) != "invalid_request" {
			t.Fatalf("start ?%s = %d %v", q, resp.StatusCode, out)
		}
	}

	// From another site, a code is never redeemed.
	p := newAppPKCE("app-state-3")
	code := o.appAuthorize(sheet, p).Query().Get("code")
	webView := o.client("203.0.113.21")
	if resp, out := redeem(webView, code, p.verifier, "Origin", "https://evil.example"); resp.StatusCode != 403 || errCode(out) != "bad_origin" {
		t.Fatalf("cross-site redeem = %d %v", resp.StatusCode, out)
	}

	// The provider refusing sends the error to the app, with its state.
	o.idp.AuthorizeError = "access_denied"
	q := url.Values{"app_challenge": {p.challenge}, "app_state": {"app-state-4"}}
	resp := raw(sheet, o.srv.URL+"/api/v1/auth/oidc/start?"+q.Encode())
	idpResp, err := o.idp.HTTPClient().Get(location(resp))
	if err != nil {
		t.Fatal(err)
	}
	idpResp.Body.Close()
	o.idp.AuthorizeError = ""
	back := mustURL(location(raw(sheet, idpResp.Header.Get("Location"))))
	if back.Scheme != "opentodo" || back.Query().Get("error") != "oidc_failed" || back.Query().Get("state") != "app-state-4" || back.Query().Get("code") != "" {
		t.Fatalf("refused app flow redirects to %v", back)
	}

	// The same rules as a sign-in in the web view: the owner is never signed in by email alone.
	o.idp.SetUser(oidctest.User{Subject: "owner-sub", Email: "owner@example.com", EmailVerified: true})
	p = newAppPKCE("app-state-5")
	code = o.appAuthorize(sheet, p).Query().Get("code")
	if resp, out := redeem(webView, code, p.verifier); location(resp) != "/?error=oidc_link_required" || hasCookie(resp, sessionCookie) {
		t.Fatalf("owner by email = %d %q %v", resp.StatusCode, location(resp), out)
	}
}

func TestOIDCAppFlowLinksFromASignedInWebView(t *testing.T) {
	o := newOIDCEnv(t, false)
	o.configure(nil)
	o.idp.SetUser(oidctest.User{Subject: "owner-sub", Email: "owner@example.com", EmailVerified: true})

	// The sheet has a session of its own (Safari): the flow still only hands
	// the identity over, and the web view's session decides it is a link.
	sheet := o.client("203.0.113.30")
	resp, out := login(sheet, "owner@example.com", "correct horse battery")
	sheet.mustStatus(resp, 200, out)
	p := newAppPKCE("app-state-6")
	code := o.appAuthorize(sheet, p).Query().Get("code")

	resp, out = redeem(o.env, code, p.verifier)
	if resp.StatusCode != http.StatusSeeOther || location(resp) != "/settings/account/security?linked=1" {
		t.Fatalf("link redeem = %d %q %v", resp.StatusCode, location(resp), out)
	}
	resp, out = o.do("GET", "/api/v1/me/identities", nil)
	o.mustStatus(resp, 200, out)
	if ids := out["identities"].([]any); len(ids) != 1 {
		t.Fatalf("identities = %v", ids)
	}
}
