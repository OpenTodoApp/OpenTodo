package httpapi

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
	"github.com/pixari/opentodo/internal/webauthn"
	"github.com/pixari/opentodo/internal/webauthn/testauth"
)

// Tests run over plain http, so the base URL is a localhost development origin
// (passkeys available, cookies not Secure). The relying party is therefore
// "localhost"; the synthetic authenticator signs for that origin.
const (
	testBase   = "http://localhost"
	testRPID   = "localhost"
	testOrigin = "http://localhost"
)

func newEnvWithBase(t *testing.T, base string, allowSignup bool) *env {
	t.Helper()
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	cfg := config.Config{SessionTTL: time.Hour, AllowSignup: allowSignup}
	if base != "" {
		cfg.BaseURL, _ = url.Parse(base)
	}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	syncSvc := opsync.NewService(db)
	h := New(cfg, auth.NewService(db, cfg.SessionTTL, allowSignup), syncSvc, nil, log, "test")
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	// Same shutdown hook as newEnv: open event streams would otherwise hold srv.Close.
	t.Cleanup(syncSvc.Notifier().CloseAll)
	jar, _ := cookiejar.New(nil)
	return &env{t: t, srv: srv, client: &http.Client{Jar: jar}, db: db, handler: h, sync: syncSvc}
}

// credentialJSON mirrors PublicKeyCredential.toJSON().
func credentialJSON(id []byte, response map[string]any) map[string]any {
	return map[string]any{
		"id": webauthn.EncodeBase64URL(id), "rawId": webauthn.EncodeBase64URL(id), "type": "public-key",
		"response": response,
	}
}

func (e *env) registerPasskey(a *testauth.Authenticator, name string) (*http.Response, map[string]any) {
	e.t.Helper()
	resp, out := e.do("POST", "/api/v1/passkeys/register/options", map[string]any{})
	e.mustStatus(resp, 200, out)
	pk := out["publicKey"].(map[string]any)
	challenge, err := webauthn.DecodeBase64URL(pk["challenge"].(string))
	if err != nil {
		e.t.Fatal(err)
	}
	cd, att := a.Register(e.t, testRPID, testOrigin, challenge)
	return e.do("POST", "/api/v1/passkeys/register", map[string]any{
		"name": name,
		"credential": credentialJSON(a.CredentialID, map[string]any{
			"clientDataJSON":    webauthn.EncodeBase64URL(cd),
			"attestationObject": webauthn.EncodeBase64URL(att),
			"transports":        []string{"internal", "hybrid"},
		}),
	})
}

func (e *env) loginWithPasskey(a *testauth.Authenticator) (*http.Response, map[string]any) {
	e.t.Helper()
	resp, out := e.do("POST", "/api/v1/auth/passkey/options", map[string]any{})
	e.mustStatus(resp, 200, out)
	pk := out["publicKey"].(map[string]any)
	if pk["rpId"] != testRPID || len(pk["allowCredentials"].([]any)) != 0 {
		e.t.Fatalf("login options = %v", pk)
	}
	challenge, _ := webauthn.DecodeBase64URL(pk["challenge"].(string))
	cd, ad, sig := a.Assert(e.t, testRPID, testOrigin, challenge)
	return e.do("POST", "/api/v1/auth/passkey", map[string]any{
		"credential": credentialJSON(a.CredentialID, map[string]any{
			"clientDataJSON":    webauthn.EncodeBase64URL(cd),
			"authenticatorData": webauthn.EncodeBase64URL(ad),
			"signature":         webauthn.EncodeBase64URL(sig),
			"userHandle":        "",
		}),
	})
}

func TestPasskeyRegisterLoginRevoke(t *testing.T) {
	e := newEnvWithBase(t, testBase, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "name": "Owner", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("GET", "/api/v1/auth/status", nil)
	if out["passkeysAvailable"] != true {
		t.Fatalf("status = %v", out)
	}

	phone := testauth.New(t, webauthn.AlgES256)
	resp, out = e.registerPasskey(phone, "Phone")
	e.mustStatus(resp, 201, out)
	p1 := out["passkey"].(map[string]any)
	if p1["name"] != "Phone" || p1["createdAt"] == nil || p1["lastUsedAt"] != p1["createdAt"] {
		t.Fatalf("passkey = %v", p1)
	}
	laptop := testauth.New(t, webauthn.AlgEdDSA)
	resp, out = e.registerPasskey(laptop, "Work laptop")
	e.mustStatus(resp, 201, out)
	p2ID := out["passkey"].(map[string]any)["id"].(string)

	resp, out = e.do("GET", "/api/v1/passkeys", nil)
	e.mustStatus(resp, 200, out)
	if n := len(out["passkeys"].([]any)); n != 2 {
		t.Fatalf("passkeys = %d", n)
	}

	// Passwordless sign-in from a fresh client sets the cookie and records use.
	other := newClientFor(e)
	resp, out = other.loginWithPasskey(phone)
	other.mustStatus(resp, 200, out)
	if out["user"].(map[string]any)["email"] != "o@example.com" {
		t.Fatalf("login response = %v", out)
	}
	found := false
	for _, c := range resp.Cookies() {
		if c.Name == sessionCookie && c.HttpOnly && c.SameSite == http.SameSiteLaxMode {
			found = true
		}
	}
	if !found {
		t.Fatal("session cookie not set by passkey login")
	}
	resp, out = other.do("GET", "/api/v1/me", nil)
	other.mustStatus(resp, 200, out)
	resp, out = other.do("GET", "/api/v1/passkeys", nil)
	for _, p := range out["passkeys"].([]any) {
		pm := p.(map[string]any)
		if pm["name"] == "Phone" && pm["lastUsedAt"] == nil {
			t.Fatalf("lastUsedAt not recorded: %v", pm)
		}
	}

	// Rename.
	resp, out = e.do("PATCH", "/api/v1/passkeys/"+p2ID, map[string]string{"name": "Desk"})
	e.mustStatus(resp, 200, out)
	if out["passkey"].(map[string]any)["name"] != "Desk" {
		t.Fatalf("rename = %v", out)
	}
	resp, out = e.do("PATCH", "/api/v1/passkeys/"+p2ID, map[string]string{"name": " "})
	e.mustStatus(resp, 400, out)

	// Replayed challenge: the same assertion a second time.
	resp, out = other.do("POST", "/api/v1/auth/passkey/options", map[string]any{})
	challenge, _ := webauthn.DecodeBase64URL(out["publicKey"].(map[string]any)["challenge"].(string))
	cd, ad, sig := laptop.Assert(t, testRPID, testOrigin, challenge)
	body := map[string]any{"credential": credentialJSON(laptop.CredentialID, map[string]any{
		"clientDataJSON": webauthn.EncodeBase64URL(cd), "authenticatorData": webauthn.EncodeBase64URL(ad), "signature": webauthn.EncodeBase64URL(sig),
	})}
	anon := &env{t: t, srv: e.srv, client: &http.Client{}}
	resp, out = anon.do("POST", "/api/v1/auth/passkey", body)
	anon.mustStatus(resp, 200, out)
	resp, out = anon.do("POST", "/api/v1/auth/passkey", body)
	anon.mustStatus(resp, 400, out)
	if errCode(out) != "passkey_challenge_invalid" {
		t.Fatalf("replay error = %v", out)
	}

	// Wrong origin in a registration is invalid_input and stores nothing.
	resp, out = e.do("POST", "/api/v1/passkeys/register/options", map[string]any{})
	challenge, _ = webauthn.DecodeBase64URL(out["publicKey"].(map[string]any)["challenge"].(string))
	evil := testauth.New(t, webauthn.AlgES256)
	cd, att := evil.Register(t, testRPID, "https://evil.example", challenge)
	resp, out = e.do("POST", "/api/v1/passkeys/register", map[string]any{"name": "evil", "credential": credentialJSON(evil.CredentialID, map[string]any{
		"clientDataJSON": webauthn.EncodeBase64URL(cd), "attestationObject": webauthn.EncodeBase64URL(att),
	})})
	e.mustStatus(resp, 400, out)
	if errCode(out) != "invalid_input" {
		t.Fatalf("origin error = %v", out)
	}
	resp, out = e.do("POST", "/api/v1/passkeys/register", map[string]any{"name": "x", "credential": credentialJSON(evil.CredentialID, map[string]any{
		"clientDataJSON": "***", "attestationObject": webauthn.EncodeBase64URL(att),
	})})
	e.mustStatus(resp, 400, out)
	if errCode(out) != "bad_request" {
		t.Fatalf("encoding error = %v", out)
	}
	resp, out = e.do("GET", "/api/v1/passkeys", nil)
	if n := len(out["passkeys"].([]any)); n != 2 {
		t.Fatalf("passkeys after failures = %d", n)
	}

	// Revoke the phone from the laptop session; the phone can no longer sign in.
	resp, out = other.do("DELETE", "/api/v1/passkeys/"+p1["id"].(string), nil)
	other.mustStatus(resp, 204, out)
	resp, out = newClientFor(e).loginWithPasskey(phone)
	if resp.StatusCode != 401 || errCode(out) != "invalid_credentials" {
		t.Fatalf("revoked login = %d %v", resp.StatusCode, out)
	}
	// Password still works. (Unknown credential ids are covered in internal/auth;
	// every client here shares one per-address limiter window of 10.)
	resp, out = newClientFor(e).do("POST", "/api/v1/auth/login", map[string]string{"email": "o@example.com", "password": "correct horse battery"})
	e.mustStatus(resp, 200, out)
}

func TestPasskeyCounterRegressionOverHTTP(t *testing.T) {
	e := newEnvWithBase(t, testBase, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	key := testauth.New(t, webauthn.AlgES256)
	key.Counter = 100
	resp, out = e.registerPasskey(key, "Key")
	e.mustStatus(resp, 201, out)
	resp, out = newClientFor(e).loginWithPasskey(key)
	e.mustStatus(resp, 200, out)
	key.Counter = 50
	resp, out = newClientFor(e).loginWithPasskey(key)
	if resp.StatusCode != 401 || errCode(out) != "invalid_credentials" {
		t.Fatalf("regression = %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("GET", "/api/v1/passkeys", nil)
	if out["passkeys"].([]any)[0].(map[string]any)["suspiciousAt"] == nil {
		t.Fatalf("not flagged: %v", out)
	}
}

func TestPasskeyRoutesAuth(t *testing.T) {
	e := newEnvWithBase(t, testBase, true)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	resp, out = e.registerPasskey(testauth.New(t, webauthn.AlgES256), "Mine")
	e.mustStatus(resp, 201, out)
	mine := out["passkey"].(map[string]any)["id"].(string)

	// Anonymous requests get 401 unauthorized on every account route.
	anon := &env{t: t, srv: e.srv, client: &http.Client{}}
	for _, rt := range []struct{ method, path string }{
		{"POST", "/api/v1/passkeys/register/options"},
		{"POST", "/api/v1/passkeys/register"},
		{"GET", "/api/v1/passkeys"},
		{"PATCH", "/api/v1/passkeys/" + mine},
		{"DELETE", "/api/v1/passkeys/" + mine},
	} {
		resp, out := anon.do(rt.method, rt.path, map[string]any{})
		if resp.StatusCode != 401 || errCode(out) != "unauthorized" {
			t.Fatalf("%s %s anonymous = %d %v", rt.method, rt.path, resp.StatusCode, out)
		}
	}

	// Another account sees 404 for a foreign id and does not list it.
	member := newClientFor(e)
	resp, out = member.do("POST", "/api/v1/auth/register", map[string]string{"email": "m@example.com", "password": "another long password"})
	member.mustStatus(resp, 201, out)
	resp, out = member.do("PATCH", "/api/v1/passkeys/"+mine, map[string]string{"name": "stolen"})
	if resp.StatusCode != 404 || errCode(out) != "not_found" {
		t.Fatalf("foreign patch = %d %v", resp.StatusCode, out)
	}
	resp, out = member.do("DELETE", "/api/v1/passkeys/"+mine, nil)
	if resp.StatusCode != 404 || errCode(out) != "not_found" {
		t.Fatalf("foreign delete = %d %v", resp.StatusCode, out)
	}
	resp, out = member.do("GET", "/api/v1/passkeys", nil)
	if n := len(out["passkeys"].([]any)); n != 0 {
		t.Fatalf("member sees %d foreign passkeys", n)
	}
	// Cookie writes still require a matching Origin.
	resp, out = e.do("POST", "/api/v1/passkeys/register/options", map[string]any{}, "Origin", "https://evil.example")
	e.mustStatus(resp, 403, out)

	// Servers without an https/localhost base URL refuse with 409.
	for _, base := range []string{"", "http://192.168.1.10:8080"} {
		plain := newEnvWithBase(t, base, false)
		resp, out := plain.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "password": "correct horse battery"})
		plain.mustStatus(resp, 201, out)
		resp, out = plain.do("GET", "/api/v1/auth/status", nil)
		if out["passkeysAvailable"] != false {
			t.Fatalf("base %q status = %v", base, out)
		}
		for _, rt := range []struct{ method, path string }{
			{"POST", "/api/v1/passkeys/register/options"},
			{"POST", "/api/v1/passkeys/register"},
			{"GET", "/api/v1/passkeys"},
			{"PATCH", "/api/v1/passkeys/x"},
			{"DELETE", "/api/v1/passkeys/x"},
			{"POST", "/api/v1/auth/passkey/options"},
			{"POST", "/api/v1/auth/passkey"},
		} {
			resp, out := plain.do(rt.method, rt.path, map[string]any{})
			if resp.StatusCode != 409 || errCode(out) != "passkeys_unavailable" {
				t.Fatalf("base %q %s %s = %d %v", base, rt.method, rt.path, resp.StatusCode, out)
			}
		}
	}
	// An https base URL reports availability (cookies are Secure there, so only status is checked).
	secure := newEnvWithBase(t, "https://todo.example.com", false)
	resp, out = secure.do("GET", "/api/v1/auth/status", nil)
	if out["passkeysAvailable"] != true {
		t.Fatalf("https status = %v", out)
	}
}

func TestPasskeyLoginRateLimit(t *testing.T) {
	e := newEnvWithBase(t, testBase, false)
	var last int
	for i := 0; i < 12; i++ {
		resp, _ := e.do("POST", "/api/v1/auth/passkey", map[string]any{"credential": map[string]any{"rawId": "AAAA"}})
		last = resp.StatusCode
	}
	if last != http.StatusTooManyRequests {
		t.Fatalf("expected 429 after repeated attempts, got %d", last)
	}
	// Passkey attempts share the window with password sign-in.
	resp, out := e.do("POST", "/api/v1/auth/login", map[string]string{"email": "o@example.com", "password": "correct horse battery"})
	if resp.StatusCode != http.StatusTooManyRequests || errCode(out) != "rate_limited" {
		t.Fatalf("password login after passkey attempts = %d %v", resp.StatusCode, out)
	}

	// Challenge requests are limited too, in their own window, so the sign-in
	// screen's autofill request never uses up password attempts.
	fresh := newEnvWithBase(t, testBase, false)
	for i := 0; i < 10; i++ {
		resp, out := fresh.do("POST", "/api/v1/auth/passkey/options", map[string]any{})
		fresh.mustStatus(resp, 200, out)
	}
	resp, out = fresh.do("POST", "/api/v1/auth/passkey/options", map[string]any{})
	if resp.StatusCode != http.StatusTooManyRequests || errCode(out) != "rate_limited" {
		t.Fatalf("11th options request = %d %v", resp.StatusCode, out)
	}
	resp, out = fresh.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "password": "correct horse battery"})
	fresh.mustStatus(resp, 201, out)

	// The anonymous routes also enforce Origin.
	other := newEnvWithBase(t, testBase, false)
	resp, out = other.do("POST", "/api/v1/auth/passkey/options", map[string]any{}, "Origin", "https://evil.example")
	other.mustStatus(resp, 403, out)
}
