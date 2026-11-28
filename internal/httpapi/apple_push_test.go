package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"strings"
	gosync "sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/config"
	ob "github.com/OpenTodoApp/opentodo/internal/outbound"
	"github.com/OpenTodoApp/opentodo/internal/push"
	"github.com/OpenTodoApp/opentodo/internal/pushrelay/relaytest"
	"github.com/OpenTodoApp/opentodo/internal/store/storetest"
	"github.com/OpenTodoApp/opentodo/internal/tenant/services"
)

// iPhone push through the relay (ios-push-relay): the owner's switch, the
// registration routes and the due route, against the real relay in-process.

// relayCount counts the requests a relay (or anything at its address) receives.
type relayCount struct {
	mu   gosync.Mutex
	n    int
	next http.Handler
}

func (c *relayCount) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	c.mu.Lock()
	c.n++
	c.mu.Unlock()
	c.next.ServeHTTP(w, r)
}

func (c *relayCount) count() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.n
}

type appleTestEnv struct {
	*env
	set   *services.Set
	relay *relaytest.Env
	calls *relayCount
	// skew moves the server's clock forward (the delivery check's cache).
	skew *atomic.Int64
}

// appleEnv is a server with web push and the relay client pointed at a real
// relay on loopback (private targets allowed for that client only), signed in
// as the owner. envURL sets OPENTODO_APPLE_RELAY to the relay's address.
func appleEnv(t *testing.T, envURL bool) *appleTestEnv {
	t.Helper()
	dir := t.TempDir()
	db, err := storetest.OpenDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	relay := relaytest.New(t, time.Now())
	calls := &relayCount{next: relay.Relay}
	relay.Server.Config.Handler = calls
	cfg := config.Config{SessionTTL: time.Hour, DataDir: dir}
	if envURL {
		cfg.AppleRelayURL = relay.Server.URL
	}
	set := testSet(t, cfg, db, services.Options{})
	set.Push = push.New(db, set.Sync, dir, push.Options{AllowHTTP: true, Client: http.DefaultClient})
	url := func(context.Context) string { return relay.Server.URL }
	if envURL {
		url = set.AppleRelayURL
	}
	set.Apple = push.NewApple(db, set.Sync, push.AppleOptions{On: set.AppleRelay.On, URL: url,
		Client: ob.NewClient(&ob.Dialer{AllowPrivate: func(context.Context) bool { return true }}, 5*time.Second)})
	skew := &atomic.Int64{}
	h := New(set, nil, WithClock(func() time.Time { return time.Now().Add(time.Duration(skew.Load())) }))
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	jar, _ := cookiejar.New(nil)
	e := &env{t: t, srv: srv, client: &http.Client{Jar: jar}, db: db, handler: h, sync: set.Sync}
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	return &appleTestEnv{env: e, set: set, relay: relay, calls: calls, skew: skew}
}

func appleBody(device string) (map[string]any, string) {
	tok := make([]byte, 32)
	_, _ = rand.Read(tok)
	due := make([]byte, 32)
	_, _ = rand.Read(due)
	d := base64.RawURLEncoding.EncodeToString(due)
	return map[string]any{"deviceId": device, "token": hex.EncodeToString(tok), "environment": "production", "dueToken": d, "includeContent": true}, d
}

// due calls the due route as the notification extension does: no cookie.
func (a *appleTestEnv) due(token string) (int, map[string]any) {
	c := newClientAt(a.env, "203.0.113.120")
	h := []string{}
	if token != "" {
		h = []string{"Authorization", "Bearer " + token}
	}
	resp, out := c.do("GET", "/api/v1/push/apple/due", nil, h...)
	return resp.StatusCode, out
}

func TestNoRelayCallWhileOff(t *testing.T) {
	a := appleEnv(t, false)
	resp, out := a.do("GET", "/api/v1/settings/push/apple-relay", nil)
	a.mustStatus(resp, 200, out)
	if out["enabled"] != false || out["url"] != push.DefaultRelayURL {
		t.Fatalf("default settings %v", out)
	}
	body, dueTok := appleBody("phone")
	for _, c := range []struct {
		method, path string
		body         any
	}{{"POST", "/api/v1/push/apple", body}, {"PUT", "/api/v1/push/apple/x/schedule", map[string]any{"cursor": 1, "until": 1}}} {
		resp, out := a.do(c.method, c.path, c.body)
		if resp.StatusCode != 403 || errCode(out) != "relay-off" {
			t.Errorf("%s %s while off = %d %v", c.method, c.path, resp.StatusCode, out)
		}
	}
	if s, out := a.due(dueTok); s != 403 || errCode(out) != "relay-off" {
		t.Errorf("due while off = %d %v", s, out)
	}
	if n := a.calls.count(); n != 0 {
		t.Fatalf("the relay received %d requests while the switch was off", n)
	}
	// Removing a registration works with the switch off: an opt-out is
	// always recorded, and it contacts no relay.
	if resp, out := a.do("DELETE", "/api/v1/push/apple/x", nil); resp.StatusCode != 404 || errCode(out) != "not_found" {
		t.Errorf("DELETE while off = %d %v", resp.StatusCode, out)
	}
	resp, out = a.do("PUT", "/api/v1/settings/push/apple-relay", map[string]any{"enabled": true})
	a.mustStatus(resp, 200, out)
	resp, out = a.do("POST", "/api/v1/push/apple", body)
	a.mustStatus(resp, 201, out)
	id := out["registration"].(map[string]any)["id"].(string)
	resp, out = a.do("PUT", "/api/v1/settings/push/apple-relay", map[string]any{"enabled": false})
	a.mustStatus(resp, 200, out)
	before := a.calls.count()
	if resp, out := a.do("DELETE", "/api/v1/push/apple/"+id, nil); resp.StatusCode != 204 {
		t.Fatalf("opt-out while off = %d %v", resp.StatusCode, out)
	}
	if a.calls.count() != before {
		t.Fatal("removing a registration contacted the relay")
	}
}

// TestAppleRegisterLimits: at most 5 registrations an hour per user, and the
// relay's 429 comes back as 429 with its Retry-After.
func TestAppleRegisterLimits(t *testing.T) {
	a := appleEnv(t, false)
	resp, out := a.do("PUT", "/api/v1/settings/push/apple-relay", map[string]any{"enabled": true})
	a.mustStatus(resp, 200, out)
	for i := range appleRegisterLimit {
		body, _ := appleBody("phone" + string(rune('a'+i)))
		resp, out := a.do("POST", "/api/v1/push/apple", body)
		a.mustStatus(resp, 201, out)
	}
	body, _ := appleBody("extra")
	resp, out = a.do("POST", "/api/v1/push/apple", body)
	if resp.StatusCode != 429 || errCode(out) != "rate_limited" || resp.Header.Get("Retry-After") == "" {
		t.Fatalf("6th registration = %d %v", resp.StatusCode, out)
	}
	// Another user has a budget of their own; the relay's 429 is passed on.
	m, _ := a.member("member@example.com", "203.0.113.140")
	a.relay.Server.Config.Handler = http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Retry-After", "1200")
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = io.WriteString(w, `{"error":"limit"}`)
	})
	resp, out = m.do("POST", "/api/v1/push/apple", body)
	if resp.StatusCode != 429 || errCode(out) != "rate_limited" || resp.Header.Get("Retry-After") != "1200" {
		t.Fatalf("relay busy = %d %v Retry-After %q", resp.StatusCode, out, resp.Header.Get("Retry-After"))
	}
}

// TestAppleDueFailedLookupsLimited: an address that keeps sending unknown due
// tokens gets 429 for them, while a token that resolves is still answered.
func TestAppleDueFailedLookupsLimited(t *testing.T) {
	a := appleEnv(t, false)
	resp, out := a.do("PUT", "/api/v1/settings/push/apple-relay", map[string]any{"enabled": true})
	a.mustStatus(resp, 200, out)
	body, dueTok := appleBody("phone")
	resp, out = a.do("POST", "/api/v1/push/apple", body)
	a.mustStatus(resp, 201, out)
	wrong := base64.RawURLEncoding.EncodeToString(make([]byte, 32))
	for i := range appleDueMissLimit {
		if s, _ := a.due(wrong); s != 401 {
			t.Fatalf("miss %d = %d", i+1, s)
		}
	}
	if s, out := a.due(wrong); s != 429 {
		t.Fatalf("miss after %d misses = %d %v", appleDueMissLimit, s, out)
	}
	// A valid token from the same address (phones behind one NAT) still works.
	if s, out := a.due(dueTok); s != 200 {
		t.Fatalf("valid token from a blocked address = %d %v", s, out)
	}
}

func TestEnvOverrideNeverTurnsOn(t *testing.T) {
	a := appleEnv(t, true)
	resp, out := a.do("GET", "/api/v1/settings/push/apple-relay", nil)
	a.mustStatus(resp, 200, out)
	if out["enabled"] != false || out["url"] != a.relay.Server.URL || out["urlFixedBy"] != "OPENTODO_APPLE_RELAY" {
		t.Fatalf("settings with the override %v", out)
	}
	body, _ := appleBody("phone")
	if resp, out := a.do("POST", "/api/v1/push/apple", body); resp.StatusCode != 403 || errCode(out) != "relay-off" {
		t.Fatalf("register with only the override = %d %v", resp.StatusCode, out)
	}
	if resp, out := a.do("PUT", "/api/v1/settings/push/apple-relay/url", map[string]any{"url": "https://203.0.113.5"}); resp.StatusCode != 409 {
		t.Fatalf("address under the override = %d %v", resp.StatusCode, out)
	}
	if n := a.calls.count(); n != 0 {
		t.Fatalf("the override's address received %d requests", n)
	}
	// Turned on, the override's address is the one used.
	resp, out = a.do("PUT", "/api/v1/settings/push/apple-relay", map[string]any{"enabled": true})
	a.mustStatus(resp, 200, out)
	resp, out = a.do("POST", "/api/v1/push/apple", body)
	a.mustStatus(resp, 201, out)
	if a.calls.count() != 1 {
		t.Fatalf("%d relay requests", a.calls.count())
	}
}

func TestAppleRelaySettings(t *testing.T) {
	a := appleEnv(t, false)
	m, _ := a.member("member@example.com", "203.0.113.121")
	if resp, out := m.do("PUT", "/api/v1/settings/push/apple-relay", map[string]any{"enabled": true}); resp.StatusCode != 403 || errCode(out) != "forbidden" {
		t.Fatalf("member turns it on = %d %v", resp.StatusCode, out)
	}
	if resp, out := m.do("PUT", "/api/v1/settings/push/apple-relay/url", map[string]any{"url": "https://203.0.113.5"}); resp.StatusCode != 403 {
		t.Fatalf("member sets the address = %d %v", resp.StatusCode, out)
	}
	if resp, out := m.do("GET", "/api/v1/settings/push/apple-relay", nil); resp.StatusCode != 200 || out["enabled"] != false {
		t.Fatalf("member reads it = %d %v", resp.StatusCode, out)
	}
	for url, code := range map[string]string{"http://203.0.113.5": "invalid_input", "https://10.0.0.5": "private_target",
		"https://127.0.0.1:8443": "private_target", "https://u:p@203.0.113.5": "invalid_input", "ftp://203.0.113.5": "invalid_input"} {
		if resp, out := a.do("PUT", "/api/v1/settings/push/apple-relay/url", map[string]any{"url": url}); resp.StatusCode != 400 || errCode(out) != code {
			t.Errorf("address %s = %d %v, want 400 %s", url, resp.StatusCode, out, code)
		}
	}
	resp, out := a.do("PUT", "/api/v1/settings/push/apple-relay/url", map[string]any{"url": "https://203.0.113.5/relay/"})
	a.mustStatus(resp, 200, out)
	if out["url"] != "https://203.0.113.5/relay" {
		t.Fatalf("stored address %v", out)
	}
	resp, out = a.do("PUT", "/api/v1/settings/push/apple-relay/url", map[string]any{"url": ""})
	a.mustStatus(resp, 200, out)
	if out["url"] != push.DefaultRelayURL {
		t.Fatalf("reset address %v", out)
	}
	if n := a.calls.count(); n != 0 {
		t.Fatalf("setting the address made %d relay requests", n)
	}
}

func TestApplePushRoutes(t *testing.T) {
	a := appleEnv(t, false)
	resp, out := a.do("PUT", "/api/v1/settings/push/apple-relay", map[string]any{"enabled": true})
	a.mustStatus(resp, 200, out)
	// Without a session: 401, and the relay is not contacted.
	body, dueTok := appleBody("phone")
	anon := newClientAt(a.env, "203.0.113.122")
	if resp, _ := anon.do("POST", "/api/v1/push/apple", body); resp.StatusCode != 401 {
		t.Fatalf("anonymous register = %d", resp.StatusCode)
	}
	if a.calls.count() != 0 {
		t.Fatal("an anonymous registration reached the relay")
	}
	// An API token is not a device's session.
	resp, out = a.do("POST", "/api/v1/tokens", map[string]string{"name": "script", "scope": "full"})
	a.mustStatus(resp, 201, out)
	if resp, out := anon.do("POST", "/api/v1/push/apple", body, "Authorization", "Bearer "+out["secret"].(string)); resp.StatusCode != 403 || errCode(out) != "session_required" {
		t.Fatalf("token register = %d %v", resp.StatusCode, out)
	}
	// Invalid bodies.
	for name, b := range map[string]map[string]any{"no token": {"deviceId": "p", "environment": "production", "dueToken": dueTok},
		"extra": {"deviceId": "p", "token": body["token"], "environment": "production", "dueToken": dueTok, "title": "x"}} {
		if resp, out := a.do("POST", "/api/v1/push/apple", b); resp.StatusCode != 400 {
			t.Errorf("%s = %d %v", name, resp.StatusCode, out)
		}
	}
	// Register.
	resp, out = a.do("POST", "/api/v1/push/apple", body)
	a.mustStatus(resp, 201, out)
	reg := out["registration"].(map[string]any)
	id := reg["id"].(string)
	if _, leak := reg["handle"]; leak || reg["deviceId"] != "phone" {
		t.Fatalf("registration %v", reg)
	}
	var stored string
	_ = a.db.QueryRow(`SELECT handle || wake_key || due_token_hash FROM apple_devices WHERE id = ?`, id).Scan(&stored)
	if stored == "" || strings.Contains(stored, body["token"].(string)) || strings.Contains(stored, dueTok) {
		t.Fatalf("stored %q", stored)
	}
	// A reminder due now, and the due route.
	resp, task := a.do("POST", "/api/v1/tasks", map[string]any{"title": "Call the **bank**"})
	a.mustStatus(resp, 201, task)
	resp, rem := a.do("POST", "/api/v1/reminders", map[string]any{"task_id": task["id"], "kind": "absolute", "fire_at": time.Now().Add(-time.Minute).UnixMilli()})
	a.mustStatus(resp, 201, rem)
	s, out := a.due(dueTok)
	if s != 200 {
		t.Fatalf("due = %d %v", s, out)
	}
	list, _ := out["reminders"].([]any)
	if len(list) != 1 || list[0].(map[string]any)["title"] != "Call the bank" || list[0].(map[string]any)["id"] != rem["id"] {
		t.Fatalf("due %v", out)
	}
	for name, tok := range map[string]string{"no token": "", "wrong token": base64.RawURLEncoding.EncodeToString(make([]byte, 32)), "garbage": "x"} {
		if s, out := a.due(tok); s != 401 || out["reminders"] != nil {
			t.Errorf("due with %s = %d %v", name, s, out)
		}
	}
	// A session cookie is no due token.
	if resp, out := a.do("GET", "/api/v1/push/apple/due", nil); resp.StatusCode != 401 {
		t.Errorf("due with the owner's session = %d %v", resp.StatusCode, out)
	}
	for range appleDueLimit - 1 {
		a.due(dueTok)
	}
	if s, out := a.due(dueTok); s != 429 {
		t.Fatalf("31st due = %d %v", s, out)
	}
	// Schedule reports.
	if resp, out := a.do("PUT", "/api/v1/push/apple/"+id+"/schedule", map[string]any{"cursor": 5, "until": time.Now().Add(7 * 24 * time.Hour).UnixMilli()}); resp.StatusCode != 200 || out["renew"] != false {
		t.Fatalf("schedule = %d %v", resp.StatusCode, out)
	}
	if resp, out := a.do("PUT", "/api/v1/push/apple/"+id+"/schedule", map[string]any{"cursor": -1, "until": 0}); resp.StatusCode != 400 {
		t.Fatalf("bad schedule = %d %v", resp.StatusCode, out)
	}
	// Another user cannot see or remove it.
	m, _ := a.member("member@example.com", "203.0.113.123")
	if resp, _ := m.do("PUT", "/api/v1/push/apple/"+id+"/schedule", map[string]any{"cursor": 1, "until": 1}); resp.StatusCode != 404 {
		t.Fatalf("member's schedule report = %d", resp.StatusCode)
	}
	if resp, _ := m.do("DELETE", "/api/v1/push/apple/"+id, nil); resp.StatusCode != 404 {
		t.Fatalf("member's delete = %d", resp.StatusCode)
	}
	// Delete, then the row and the token are gone.
	if resp, out := a.do("DELETE", "/api/v1/push/apple/"+id, nil); resp.StatusCode != 204 {
		t.Fatalf("delete = %d %v", resp.StatusCode, out)
	}
	if resp, _ := a.do("DELETE", "/api/v1/push/apple/"+id, nil); resp.StatusCode != 404 {
		t.Fatalf("second delete = %d", resp.StatusCode)
	}
	if resp, _ := a.do("PUT", "/api/v1/push/apple/"+id+"/schedule", map[string]any{"cursor": 1, "until": 1}); resp.StatusCode != 404 {
		t.Fatalf("schedule after delete = %d", resp.StatusCode)
	}
	if a.calls.count() != 1 {
		t.Fatalf("%d relay requests, want the one registration", a.calls.count())
	}
}

func TestAppleRelayUnreachable(t *testing.T) {
	a := appleEnv(t, false)
	resp, out := a.do("PUT", "/api/v1/settings/push/apple-relay", map[string]any{"enabled": true})
	a.mustStatus(resp, 200, out)
	a.relay.Server.Config.Handler = http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = io.WriteString(w, `{"error":"apns"}`)
	})
	body, _ := appleBody("phone")
	resp, out = a.do("POST", "/api/v1/push/apple", body)
	if resp.StatusCode != 502 || errCode(out) != "relay-unreachable" {
		t.Fatalf("register with the relay down = %d %v", resp.StatusCode, out)
	}
	a.relay.Server.Close()
	resp, out = a.do("POST", "/api/v1/push/apple", body)
	if resp.StatusCode != 502 || errCode(out) != "relay-unreachable" {
		t.Fatalf("register with the relay gone = %d %v", resp.StatusCode, out)
	}
	var n int
	_ = a.db.QueryRow(`SELECT COUNT(*) FROM apple_devices`).Scan(&n)
	if n != 0 {
		t.Fatalf("%d registrations stored", n)
	}
}

// TestAppleDeviceGoesWithSession: signing out, a revoked device (sign out
// everywhere) and a deleted account remove the registrations.
func TestAppleDeviceGoesWithSession(t *testing.T) {
	a := appleEnv(t, false)
	resp, out := a.do("PUT", "/api/v1/settings/push/apple-relay", map[string]any{"enabled": true})
	a.mustStatus(resp, 200, out)
	count := func() (n int) {
		_ = a.db.QueryRow(`SELECT COUNT(*) FROM apple_devices`).Scan(&n)
		return n
	}
	phone := newClientAt(a.env, "203.0.113.130")
	resp, out = login(phone, "owner@example.com", "correct horse battery")
	phone.mustStatus(resp, 200, out)
	body, _ := appleBody("phone")
	resp, out = phone.do("POST", "/api/v1/push/apple", body)
	phone.mustStatus(resp, 201, out)
	body2, _ := appleBody("browser")
	resp, out = a.do("POST", "/api/v1/push/apple", body2)
	a.mustStatus(resp, 201, out)
	if count() != 2 {
		t.Fatal("two registrations expected")
	}
	resp, out = phone.do("POST", "/api/v1/auth/logout", nil)
	if resp.StatusCode >= 300 {
		t.Fatalf("logout = %d %v", resp.StatusCode, out)
	}
	if count() != 1 {
		t.Fatalf("%d registrations after the phone signed out", count())
	}
	resp, out = a.do("POST", "/api/v1/me/sign-out-everywhere", nil)
	a.mustStatus(resp, 204, out)
	if count() != 0 {
		t.Fatalf("%d registrations after signing out everywhere", count())
	}
}

// TestDeliveryCheckNoProbeWhileOff: the relay's state in the delivery check
// probes the relay only while the owner's switch is on (D10).
func TestDeliveryCheckNoProbeWhileOff(t *testing.T) {
	a := appleEnv(t, false)
	if resp, out := a.do("GET", "/api/v1/push/apple/status?device=phone", nil); resp.StatusCode != 403 || errCode(out) != "relay-off" {
		t.Fatalf("status while off = %d %v", resp.StatusCode, out)
	}
	if n := a.calls.count(); n != 0 {
		t.Fatalf("the relay received %d requests while off", n)
	}
	resp, out := a.do("PUT", "/api/v1/settings/push/apple-relay", map[string]any{"enabled": true})
	a.mustStatus(resp, 200, out)
	resp, out = a.do("GET", "/api/v1/push/apple/status?device=phone", nil)
	a.mustStatus(resp, 200, out)
	relay := out["relay"].(map[string]any)
	if relay["reached"] != true || relay["protocol"] != float64(1) || out["registration"] != nil {
		t.Fatalf("status %v", out)
	}
	body, _ := appleBody("phone")
	resp, out = a.do("POST", "/api/v1/push/apple", body)
	a.mustStatus(resp, 201, out)
	// Failing wakes for three days: the registration reports the relay unreachable.
	if _, err := a.db.Exec(`UPDATE apple_devices SET failures = 40, failing_since = ?`, time.Now().Add(-73*time.Hour).UnixMilli()); err != nil {
		t.Fatal(err)
	}
	a.relay.Server.Close()
	// Within a minute the cached probe answers; after it, the relay is asked again.
	resp, out = a.do("GET", "/api/v1/push/apple/status?device=phone", nil)
	a.mustStatus(resp, 200, out)
	if out["relay"].(map[string]any)["reached"] != true {
		t.Fatalf("cached probe %v", out)
	}
	a.skew.Store(int64(61 * time.Second))
	resp, out = a.do("GET", "/api/v1/push/apple/status?device=phone", nil)
	a.mustStatus(resp, 200, out)
	reg, _ := out["registration"].(map[string]any)
	if out["relay"].(map[string]any)["reached"] != false || reg == nil || reg["relayUnreachable"] != true || reg["failures"] != float64(40) {
		t.Fatalf("status with the relay down %v", out)
	}
}
