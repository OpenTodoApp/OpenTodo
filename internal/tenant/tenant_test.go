package tenant

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/mail/smtptest"
	"github.com/pixari/opentodo/internal/notify"
	"github.com/pixari/opentodo/internal/push"
	"github.com/pixari/opentodo/internal/store"
)

func testConfig(dir string) config.Config {
	return config.Config{Addr: ":0", DataDir: dir, SessionTTL: time.Hour, ImportMaxMB: 1, TrashRetentionDays: 30}
}

type client struct {
	t    *testing.T
	base string
	http *http.Client
}

func newClient(t *testing.T, base string) *client {
	jar, _ := cookiejar.New(nil)
	return &client{t: t, base: base, http: &http.Client{Jar: jar}}
}

func (c *client) do(method, path string, body any) (int, map[string]any) {
	c.t.Helper()
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, c.base+path, rd)
	req.Header.Set("Content-Type", "application/json")
	if method != http.MethodGet {
		req.Header.Set("Origin", c.base)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer resp.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out
}

func openTenant(t *testing.T, dir string) (*Tenant, *httptest.Server) {
	t.Helper()
	tn, err := Open(context.Background(), testConfig(dir), Options{Version: "test", Web: http.NotFoundHandler()})
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(tn.Handler)
	t.Cleanup(func() {
		srv.Close()
		tn.Close()
	})
	return tn, srv
}

// TestTwoTenantsNeverCross (multi-tenant-host 1.3): two tenants in one
// process, each with its own data directory, share no sync data, sessions,
// notifications, live-update notifier or push keys.
func TestTwoTenantsNeverCross(t *testing.T) {
	ta, sa := openTenant(t, filepath.Join(t.TempDir(), "a"))
	tb, sb := openTenant(t, filepath.Join(t.TempDir(), "b"))
	a, b := newClient(t, sa.URL), newClient(t, sb.URL)
	creds := map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"}
	for _, c := range []*client{a, b} {
		if code, out := c.do("POST", "/api/v1/auth/register", creds); code != http.StatusCreated && code != http.StatusOK {
			t.Fatalf("register: %d %v", code, out)
		}
	}
	// Sessions: a cookie from tenant A means nothing to tenant B.
	sessA := a.http.Jar.Cookies(mustURL(t, sa.URL))
	cross := newClient(t, sb.URL)
	cross.http.Jar.SetCookies(mustURL(t, sb.URL), sessA)
	if code, _ := cross.do("GET", "/api/v1/me", nil); code != http.StatusUnauthorized {
		t.Fatalf("A's session on B: %d, want 401", code)
	}
	// Sync: an op written to A is never served by B.
	op := map[string]any{"id": "op-1", "entity": "task", "entityId": "task-1", "field": "title", "value": "only in A", "ts": time.Now().UnixMilli(), "device": "dev-a"}
	if code, out := a.do("POST", "/api/v1/sync", map[string]any{"device": "dev-a", "cursor": 0, "ops": []any{op}}); code != http.StatusOK {
		t.Fatalf("sync A: %d %v", code, out)
	}
	_, outA := a.do("POST", "/api/v1/sync", map[string]any{"device": "dev-a2", "cursor": 0, "ops": []any{}})
	_, outB := b.do("POST", "/api/v1/sync", map[string]any{"device": "dev-b", "cursor": 0, "ops": []any{}})
	if n := len(outA["ops"].([]any)); n != 1 {
		t.Fatalf("A serves %d ops, want 1", n)
	}
	if ops, _ := outB["ops"].([]any); len(ops) != 0 {
		t.Fatalf("B serves A's ops: %v", ops)
	}
	// Notifications: an event in A's inbox stays in A.
	_, me := a.do("GET", "/api/v1/me", nil)
	uidA := me["user"].(map[string]any)["id"].(string)
	ta.Inbox.Assigned(context.Background(), notify.Assigned{AssigneeID: uidA, ActorID: "x", TaskID: "task-1", TaskTitle: "t", At: time.Now().UnixMilli()})
	if _, out := a.do("GET", "/api/v1/notifications", nil); len(out["notifications"].([]any)) != 1 {
		t.Fatalf("A notifications: %v", out)
	}
	if _, out := b.do("GET", "/api/v1/notifications", nil); len(out["notifications"].([]any)) != 0 {
		t.Fatalf("B sees A's notifications: %v", out)
	}
	// Live updates: each tenant has its own notifier.
	if ta.Sync.Notifier() == tb.Sync.Notifier() {
		t.Fatal("tenants share a notifier")
	}
	// Push keys: one key pair per data directory.
	_, ka := a.do("GET", "/api/v1/push/vapid-key", nil)
	_, kb := b.do("GET", "/api/v1/push/vapid-key", nil)
	if ka["publicKey"] == nil || ka["publicKey"] == kb["publicKey"] {
		t.Fatalf("push keys: A %v, B %v", ka, kb)
	}
	for _, d := range []string{ta.Cfg.DataDir, tb.Cfg.DataDir} {
		if _, err := os.Stat(push.KeyPath(d)); err != nil {
			t.Fatalf("no key file in %s: %v", d, err)
		}
	}
}

// TestOpenHoldsTheDirectory: an open tenant holds its data directory shared,
// so maintenance commands refuse it, and Close releases it.
func TestOpenHoldsTheDirectory(t *testing.T) {
	dir := t.TempDir()
	tn, err := Open(context.Background(), testConfig(dir), Options{Web: http.NotFoundHandler()})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Lock(dir); err == nil {
		t.Fatal("exclusive lock taken while the tenant is open")
	}
	if err := tn.Close(); err != nil {
		t.Fatal(err)
	}
	if err := tn.Close(); err != nil {
		t.Fatal("second Close:", err)
	}
	release, err := store.Lock(dir)
	if err != nil {
		t.Fatal("lock after Close:", err)
	}
	release()
}

// TestStartJobsRunsDigest (multi-tenant-host x stats-and-review): a
// self-hosted server's weekly digest runs from StartJobs: a user who opted in
// gets the digest at the chosen hour through the server's outgoing email.
func TestStartJobsRunsDigest(t *testing.T) {
	sink := smtptest.New(t, smtptest.Options{NoSTARTTLS: true, NoAuth: true})
	cfg := testConfig(t.TempDir())
	cfg.SMTP = config.SMTPConfig{Host: sink.Host, Port: sink.Port, Security: "none", From: "OpenTodo <todo@example.com>"}
	// Friday 2026-10-23 08:00 UTC: an hour after a Friday 07:00 digest is due.
	friday := time.Date(2026, 10, 23, 8, 0, 0, 0, time.UTC)
	tn, err := Open(context.Background(), cfg, Options{Version: "test", Web: http.NotFoundHandler(), Now: func() time.Time { return friday }})
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(tn.Handler)
	t.Cleanup(func() {
		srv.Close()
		tn.Close()
	})
	if tn.Digest == nil || tn.Mail == nil {
		t.Fatal("digest not wired")
	}
	c := newClient(t, srv.URL)
	if code, out := c.do("POST", "/api/v1/auth/register", map[string]any{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"}); code != http.StatusCreated && code != http.StatusOK {
		t.Fatalf("register: %d %v", code, out)
	}
	if code, out := c.do("PUT", "/api/v1/me/email-digest", map[string]any{"enabled": true, "weekday": 5, "hour": 7, "timeZone": "UTC", "language": "en"}); code != http.StatusOK || out["available"] != true {
		t.Fatalf("opt in: %d %v", code, out)
	}
	_, me := c.do("GET", "/api/v1/me", nil)
	uid := me["user"].(map[string]any)["id"].(string)

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	tn.StartJobs(ctx, done, nil)
	defer func() {
		cancel()
		<-done
	}()
	deadline := time.Now().Add(10 * time.Second)
	for len(sink.Messages()) == 0 {
		if time.Now().After(deadline) {
			t.Fatal("no digest sent by the jobs StartJobs started")
		}
		time.Sleep(20 * time.Millisecond)
	}
	if m := sink.Messages()[0]; len(m.To) != 1 || m.To[0] != "owner@example.com" {
		t.Fatalf("digest to %v", m.To)
	}
	// The pass records the send once the message is out.
	for {
		st, err := tn.Digest.Store().Get(context.Background(), uid)
		if err != nil {
			t.Fatal(err)
		}
		if st.LastSentFor == "2026-10-23" {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("send not recorded: %+v", st)
		}
		time.Sleep(20 * time.Millisecond)
	}
}

func mustURL(t *testing.T, raw string) *url.URL {
	t.Helper()
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	return u
}
