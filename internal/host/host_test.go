package host

import (
	"context"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/store"
)

// TestRouting (3.1): two tenants by host name, an unknown name and the bare
// address; operations never cross tenants.
func TestRouting(t *testing.T) {
	f := newFixture(t, nil)
	alice, smith := f.client("alice"), f.client("smith")
	alice.register("alice@example.com", f.create("alice", config.Limits{}))
	smith.register("smith@example.com", f.create("smith", config.Limits{}))

	alice.sync("alice-phone", taskOps("t1", "Alice only"))
	if ops := alice.sync("alice-laptop", nil)["ops"].([]any); len(ops) != 2 {
		t.Fatalf("alice sees %d ops, want 2", len(ops))
	}
	if ops, _ := smith.sync("smith-phone", nil)["ops"].([]any); len(ops) != 0 {
		t.Fatalf("smith sees alice's ops: %v", ops)
	}
	// Alice's session is nothing on Smith's host name.
	cross := f.client("smith")
	cross.jar = alice.jar
	cross.jar.SetCookies(mustURL("http://smith.example.test"), alice.jar.Cookies(mustURL("http://alice.example.test")))
	if code, _ := cross.do("GET", "/api/v1/me", nil); code != http.StatusUnauthorized {
		t.Fatalf("alice's cookie on smith: %d", code)
	}
	// Unknown and deleted names answer the same 404 envelope.
	f.create("gone", config.Limits{})
	if code, _ := f.operator("DELETE", "/operator/v1/tenants/gone", nil, nil); code != http.StatusNoContent {
		t.Fatalf("delete: %d", code)
	}
	for _, name := range []string{"nobody", "gone"} {
		code, out := f.client(name).do("GET", "/api/v1/auth/status", nil)
		if code != http.StatusNotFound || errCode(out) != "not_found" {
			t.Fatalf("%s: %d %v", name, code, out)
		}
	}
	// Another domain, or two labels deep, names no tenant either.
	for _, host := range []string{"alice.other.test", "a.alice.example.test", "example.test"} {
		c := f.client("x")
		c.host = host
		if code, _ := c.do("GET", "/api/v1/auth/status", nil); code != http.StatusNotFound {
			t.Fatalf("%s: %d", host, code)
		}
	}
	// The bare address answers the health check only.
	resp, err := http.Get(f.srv.URL + "/healthz")
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("healthz: %v %v", resp, err)
	}
	resp.Body.Close()
}

func mustURL(raw string) *url.URL { u, _ := url.Parse(raw); return u }

// TestColdStartAndIdleClose (3.2): a closed tenant opens on its next request,
// well under a second, and closes again after the idle time.
func TestColdStartAndIdleClose(t *testing.T) {
	f := newFixture(t, nil)
	c := f.client("alice")
	c.register("alice@example.com", f.create("alice", config.Limits{}))
	f.clock.Advance(11 * time.Minute)
	if n := f.h.pool.sweep(); n != 1 || f.h.pool.isOpen("alice") {
		t.Fatalf("idle sweep closed %d", n)
	}
	start := time.Now()
	if code := c.login("alice@example.com"); code != http.StatusOK {
		t.Fatalf("sign-in after a cold start: %d", code)
	}
	if d := time.Since(start); d > time.Second {
		t.Fatalf("cold start took %v", d)
	}
	if !f.h.pool.isOpen("alice") {
		t.Fatal("not open after a request")
	}
}

// TestStreamKeepsTenantOpen (3.2): a live event stream holds its tenant open
// past the idle time; once it ends the tenant closes.
func TestStreamKeepsTenantOpen(t *testing.T) {
	f := newFixture(t, nil)
	c := f.client("alice")
	c.register("alice@example.com", f.create("alice", config.Limits{}))
	ctx, cancel := context.WithCancel(context.Background())
	req := c.request("GET", "/api/v1/sync/events?device=d1", nil).WithContext(ctx)
	resp, err := c.send(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("stream: %v %v", resp, err)
	}
	f.clock.Advance(time.Hour)
	if n := f.h.pool.sweep(); n != 0 || !f.h.pool.isOpen("alice") {
		t.Fatal("closed while a stream is attached")
	}
	cancel()
	resp.Body.Close()
	deadline := time.Now().Add(5 * time.Second)
	for f.h.pool.isOpen("alice") && time.Now().Before(deadline) {
		f.clock.Advance(11 * time.Minute)
		f.h.pool.sweep()
		time.Sleep(10 * time.Millisecond)
	}
	if f.h.pool.isOpen("alice") {
		t.Fatal("still open after the stream ended")
	}
}

// TestOpenCapClosesLeastRecentlyUsed (3.2): at the cap, opening another tenant
// closes the least recently used idle one.
func TestOpenCapClosesLeastRecentlyUsed(t *testing.T) {
	f := newFixture(t, func(c *config.Config, _ *Options) { c.Host.MaxOpen = 2 })
	for _, n := range []string{"a1", "b2", "c3"} {
		f.create(n, config.Limits{})
	}
	f.h.pool.closeAll()
	f.client("a1").do("GET", "/api/v1/auth/status", nil)
	f.clock.Advance(time.Second)
	f.client("b2").do("GET", "/api/v1/auth/status", nil)
	f.clock.Advance(time.Second)
	f.client("a1").do("GET", "/api/v1/auth/status", nil) // a1 is now the most recent
	f.clock.Advance(time.Second)
	if code, _ := f.client("c3").do("GET", "/api/v1/auth/status", nil); code != http.StatusOK {
		t.Fatalf("c3: %d", code)
	}
	if !f.h.pool.isOpen("a1") || f.h.pool.isOpen("b2") || !f.h.pool.isOpen("c3") {
		t.Fatalf("open: a1=%v b2=%v c3=%v", f.h.pool.isOpen("a1"), f.h.pool.isOpen("b2"), f.h.pool.isOpen("c3"))
	}
}

// TestFailingMigrationIsolated (3.2): a tenant whose database cannot be
// migrated answers 503 and is reported; another tenant keeps working.
func TestFailingMigrationIsolated(t *testing.T) {
	f := newFixture(t, nil)
	good := f.client("good")
	good.register("good@example.com", f.create("good", config.Limits{}))
	f.create("broken", config.Limits{})
	f.h.pool.evict("broken")
	db := store.DBPath(f.h.TenantDir("broken"))
	for _, p := range []string{db, db + "-wal", db + "-shm"} {
		os.Remove(p)
	}
	if err := os.WriteFile(db, []byte("this is not a database, it only looks like one to the path"), 0o600); err != nil {
		t.Fatal(err)
	}
	code, out := f.client("broken").do("GET", "/api/v1/auth/status", nil)
	if code != http.StatusServiceUnavailable || errCode(out) != "unavailable" {
		t.Fatalf("broken: %d %v", code, out)
	}
	rec, _ := f.h.reg.Get(context.Background(), "broken")
	if rec.LastError == "" {
		t.Fatal("failure not reported to the operator")
	}
	if code, _ := good.do("GET", "/api/v1/me", nil); code != http.StatusOK {
		t.Fatalf("good tenant: %d", code)
	}
	// Repaired: the next attempt after failRetry opens it and clears the error.
	os.Remove(db)
	f.clock.Advance(failRetry + time.Second)
	if code, _ := f.client("broken").do("GET", "/api/v1/auth/status", nil); code != http.StatusOK {
		t.Fatalf("repaired: %d", code)
	}
	if rec, _ := f.h.reg.Get(context.Background(), "broken"); rec.LastError != "" {
		t.Fatalf("error not cleared: %q", rec.LastError)
	}
}

// TestHostRefusesSelfHostedDirectory: host mode never takes over a
// single-tenant data directory.
func TestHostRefusesSelfHostedDirectory(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	db.Close()
	u := mustURL("https://example.test")
	_, err = Open(config.Config{DataDir: dir, Host: &config.HostConfig{URL: u, Token: testToken, MaxOpen: 1, IdleTimeout: time.Minute}}, Options{})
	if err == nil {
		t.Fatal("host mode opened a self-hosted data directory")
	}
	if _, err := os.Stat(filepath.Join(dir, RegistryFile)); err == nil {
		t.Fatal("registry created in a self-hosted directory")
	}
}
