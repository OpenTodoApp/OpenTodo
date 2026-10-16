package host

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/backup"
	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/tenant"
)

// TestOperatorNeedsToken (6.1): without the host token, or with another, the
// operator interface answers 401 and changes, lists or names nothing.
func TestOperatorNeedsToken(t *testing.T) {
	f := newFixture(t, nil)
	f.create("alice", config.Limits{})
	for _, auth := range []string{"", "Bearer wrong", "Bearer " + testToken + "x", testToken} {
		for _, rt := range []struct{ method, path, body string }{
			{"GET", "/operator/v1/tenants", ""},
			{"POST", "/operator/v1/tenants", `{"name":"mallory"}`},
			{"GET", "/operator/v1/tenants/alice", ""},
			{"DELETE", "/operator/v1/tenants/alice", ""},
			{"GET", "/operator/v1/tenants/alice/archive", ""},
		} {
			req, _ := http.NewRequest(rt.method, f.op.URL+rt.path, strings.NewReader(rt.body))
			if auth != "" {
				req.Header.Set("Authorization", auth)
			}
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatal(err)
			}
			b, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			if resp.StatusCode != http.StatusUnauthorized || strings.Contains(string(b), "alice") {
				t.Fatalf("%s %s with %q: %d %s", rt.method, rt.path, auth, resp.StatusCode, b)
			}
		}
	}
	if _, err := f.h.reg.Get(context.Background(), "mallory"); err == nil {
		t.Fatal("created without a token")
	}
	if rec, _ := f.h.reg.Get(context.Background(), "alice"); rec.State != StateActive {
		t.Fatal("changed without a token")
	}
	// The operator routes are not reachable through a tenant's host name.
	code, _ := f.client("alice").do("GET", "/operator/v1/tenants", nil)
	if code == http.StatusOK {
		t.Fatal("operator interface reachable through a tenant host name")
	}
}

// TestLifecycle (6.1): create, list, suspend (503 with data kept), resume,
// change limits, export, delete with a tombstone, and the name's grace period.
func TestLifecycle(t *testing.T) {
	f := newFixture(t, nil)
	c := f.client("smith")
	c.register("smith@example.com", f.create("smith", config.Limits{Members: 3}))
	c.sync("dev", taskOps("t1", "Keep me"))

	code, body := f.operator("GET", "/operator/v1/tenants", nil, nil)
	if code != http.StatusOK || !strings.Contains(string(body), `"name":"smith"`) || !strings.Contains(string(body), `"members":3`) {
		t.Fatalf("list: %d %s", code, body)
	}
	// A name that is taken, invalid or reserved is refused.
	for name, want := range map[string]int{"smith": http.StatusConflict, "Bad_Name": http.StatusBadRequest, "www": http.StatusBadRequest} {
		if code, _ := f.operator("POST", "/operator/v1/tenants", strings.NewReader(`{"name":"`+name+`"}`), nil); code != want {
			t.Fatalf("create %s: %d, want %d", name, code, want)
		}
	}

	if code, _ := f.operator("POST", "/operator/v1/tenants/smith/suspend", nil, nil); code != http.StatusOK {
		t.Fatalf("suspend: %d", code)
	}
	code, out := c.do("GET", "/api/v1/me", nil)
	if code != http.StatusServiceUnavailable || errCode(out) != "suspended" {
		t.Fatalf("suspended tenant: %d %v", code, out)
	}
	if f.h.pool.isOpen("smith") {
		t.Fatal("suspended tenant still open")
	}
	if code, _ := f.operator("POST", "/operator/v1/tenants/smith/suspend", nil, nil); code != http.StatusConflict {
		t.Fatalf("suspend twice: %d", code)
	}
	if code, _ := f.operator("POST", "/operator/v1/tenants/smith/resume", nil, nil); code != http.StatusOK {
		t.Fatalf("resume: %d", code)
	}
	if code, _ := c.do("GET", "/api/v1/me", nil); code != http.StatusOK {
		t.Fatalf("after resume: %d", code)
	}
	if ops := c.sync("dev2", nil)["ops"].([]any); len(ops) != 2 {
		t.Fatalf("data after resume: %d ops", len(ops))
	}

	if code, body := f.operator("PATCH", "/operator/v1/tenants/smith", strings.NewReader(`{"limits":{"members":5,"dbMb":10}}`), nil); code != http.StatusOK || !strings.Contains(string(body), `"dbMb":10`) {
		t.Fatalf("patch: %d %s", code, body)
	}

	code, archive := f.operator("GET", "/operator/v1/tenants/smith/archive", nil, nil)
	if code != http.StatusOK || len(archive) < 100 {
		t.Fatalf("export: %d (%d bytes)", code, len(archive))
	}

	if code, _ := f.operator("DELETE", "/operator/v1/tenants/smith", nil, nil); code != http.StatusNoContent {
		t.Fatalf("delete: %d", code)
	}
	if _, err := os.Stat(f.h.TenantDir("smith")); !os.IsNotExist(err) {
		t.Fatalf("data directory kept: %v", err)
	}
	if code, _ := c.do("GET", "/api/v1/me", nil); code != http.StatusNotFound {
		t.Fatalf("deleted tenant: %d", code)
	}
	code, body = f.operator("GET", "/operator/v1/tenants/smith", nil, nil)
	if code != http.StatusOK || !strings.Contains(string(body), `"state":"deleted"`) {
		t.Fatalf("tombstone: %d %s", code, body)
	}
	if code, _ := f.operator("POST", "/operator/v1/tenants", strings.NewReader(`{"name":"smith"}`), nil); code != http.StatusConflict {
		t.Fatalf("name reused within the grace period: %d", code)
	}
	if code, _ := f.operator("GET", "/operator/v1/tenants/smith/archive", nil, nil); code != http.StatusNotFound {
		t.Fatalf("export of a deleted tenant: %d", code)
	}
	f.clock.Advance(TombstoneGrace + time.Hour)
	if code, _ := f.operator("POST", "/operator/v1/tenants", strings.NewReader(`{"name":"smith"}`), nil); code != http.StatusCreated {
		t.Fatalf("name after the grace period: %d", code)
	}

	// The exported archive becomes a new tenant whose owner signs in as before.
	if code, body := f.operator("PUT", "/operator/v1/tenants/jones/archive", bytes.NewReader(archive), nil); code != http.StatusCreated {
		t.Fatalf("create from archive: %d %s", code, body)
	}
	jones := f.client("jones")
	if code := jones.login("smith@example.com"); code != http.StatusOK {
		t.Fatalf("sign-in on the imported tenant: %d", code)
	}
	if ops := jones.sync("dev3", nil)["ops"].([]any); len(ops) != 2 {
		t.Fatalf("imported data: %d ops", len(ops))
	}
	if code, _ := f.operator("PUT", "/operator/v1/tenants/jones/archive", bytes.NewReader(archive), nil); code != http.StatusConflict {
		t.Fatalf("import over an existing tenant: %d", code)
	}
	if code, _ := f.operator("PUT", "/operator/v1/tenants/junk/archive", strings.NewReader("not an archive"), nil); code != http.StatusUnprocessableEntity {
		t.Fatalf("junk archive: %d", code)
	}
	if _, err := f.h.reg.Get(context.Background(), "junk"); err == nil {
		t.Fatal("junk archive registered a tenant")
	}
}

// TestSelfHostedArchiveBecomesTenant (backups delta): an archive written by a
// self-hosted server, encrypted, creates a hosted tenant once the passphrase
// is given.
func TestSelfHostedArchiveBecomesTenant(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	cfg := config.Config{DataDir: dir, SessionTTL: time.Hour, TrashRetentionDays: 30}
	self, err := tenant.Open(ctx, cfg, tenant.Options{Web: http.NotFoundHandler()})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := self.Auth.Register(ctx, "owner@example.com", "Owner", "correct horse battery", ""); err != nil {
		t.Fatal(err)
	}
	local := filepath.Join(t.TempDir(), "backups")
	set := backup.DefaultSettings()
	set.Destination, set.Local.Dir = backup.DestLocal, local
	pass := "a long backup passphrase"
	if _, err := self.Backups.SaveSettings(ctx, set, backup.SecretUpdate{Passphrase: &pass}); err != nil {
		t.Fatal(err)
	}
	run, err := self.Backups.RunNow(ctx, backup.KindManual)
	if err != nil || run.Status != backup.StatusSucceeded {
		t.Fatalf("backup: %v %+v", err, run)
	}
	self.Close()
	archive, err := os.ReadFile(filepath.Join(local, run.ArchiveName))
	if err != nil {
		t.Fatal(err)
	}

	f := newFixture(t, nil)
	code, body := f.operator("PUT", "/operator/v1/tenants/owner/archive", bytes.NewReader(archive), nil)
	if code != http.StatusUnprocessableEntity || !strings.Contains(string(body), "passphrase_required") {
		t.Fatalf("without passphrase: %d %s", code, body)
	}
	code, body = f.operator("PUT", "/operator/v1/tenants/owner/archive", bytes.NewReader(archive), map[string]string{"X-Archive-Passphrase": pass})
	if code != http.StatusCreated {
		t.Fatalf("with passphrase: %d %s", code, body)
	}
	var res struct {
		Tenant struct{ URL string } `json:"tenant"`
	}
	_ = json.Unmarshal(body, &res)
	if res.Tenant.URL != "http://owner.example.test" {
		t.Fatalf("url = %q", res.Tenant.URL)
	}
	if code := f.client("owner").login("owner@example.com"); code != http.StatusOK {
		t.Fatalf("sign-in: %d", code)
	}
}
