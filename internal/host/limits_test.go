package host

import (
	"bytes"
	"context"
	"fmt"
	"mime/multipart"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/config"
)

func rejected(out map[string]any) map[string]string {
	got := map[string]string{}
	list, _ := out["rejected"].([]any)
	for _, r := range list {
		m := r.(map[string]any)
		got[m["id"].(string)] = m["reason"].(string)
	}
	return got
}

// TestStorageLimit (5.1): a full tenant refuses a new task per operation,
// naming the storage limit; trashing still works; other tenants are unaffected.
func TestStorageLimit(t *testing.T) {
	f := newFixture(t, nil)
	c := f.client("full")
	c.register("full@example.com", f.create("full", config.Limits{DBMB: 1}))
	other := f.client("roomy")
	other.register("roomy@example.com", f.create("roomy", config.Limits{}))
	c.sync("dev", taskOps("t0", "Before"))
	// Fill the database past 1 MB.
	tn, release, err := f.h.pool.acquire(context.Background(), "full")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tn.DB.Exec(`CREATE TABLE ballast(b BLOB); INSERT INTO ballast VALUES(zeroblob(1500000))`); err != nil {
		t.Fatal(err)
	}
	release()

	now := time.Now().UnixMilli()
	trash := map[string]any{"id": "del-t0", "entity": "task", "entityId": "t0", "field": "deleted_at", "value": now, "ts": now, "device": "dev"}
	out := c.sync("dev", append(taskOps("t1", "After"), trash))
	got := rejected(out)
	if got["t1-After-t"] != "limit_storage" || got["t1-After-c"] != "limit_storage" {
		t.Fatalf("rejected = %v", got)
	}
	if _, refused := got["del-t0"]; refused {
		t.Fatal("moving to the Trash was refused")
	}
	// The refused task's values are not sent back to overwrite the device's copy.
	for _, o := range out["ops"].([]any) {
		if o.(map[string]any)["entityId"] == "t1" {
			t.Fatalf("server value sent for a limit refusal: %v", o)
		}
	}
	// REST writes name the limit too.
	code, res := c.do("POST", "/api/v1/tasks", map[string]any{"title": "Via REST"})
	if code != http.StatusForbidden || errCode(res) != "limit_storage" {
		t.Fatalf("REST create: %d %v", code, res)
	}
	// Reads keep working, and another tenant is unaffected.
	if code, _ := c.do("GET", "/api/v1/tasks", nil); code != http.StatusOK {
		t.Fatalf("read: %d", code)
	}
	if got := rejected(other.sync("dev", taskOps("t1", "After"))); len(got) != 0 {
		t.Fatalf("other tenant refused: %v", got)
	}
}

// TestOperationLimits (5.1): ops per hour and in total are refused per
// operation; the rest of the batch is stored, and the hour window frees up.
func TestOperationLimits(t *testing.T) {
	f := newFixture(t, nil)
	c := f.client("busy")
	c.register("busy@example.com", f.create("busy", config.Limits{OpsPerHour: 3}))
	got := rejected(c.sync("dev", append(taskOps("a", "One"), taskOps("b", "Two")...)))
	if len(got) != 1 || got["b-Two-c"] != "limit_ops_hour" {
		t.Fatalf("hour: %v", got)
	}
	f.clock.Advance(61 * time.Minute)
	if got := rejected(c.sync("dev", taskOps("c", "Three"))); len(got) != 0 {
		t.Fatalf("after an hour: %v", got)
	}

	g := f.client("total")
	g.register("total@example.com", f.create("total", config.Limits{OpsTotal: 4}))
	if got := rejected(g.sync("dev", taskOps("a", "One"))); len(got) != 0 {
		t.Fatalf("first batch: %v", got)
	}
	got = rejected(g.sync("dev", append(taskOps("b", "Two"), taskOps("c", "Three")...)))
	if len(got) != 2 || got["c-Three-t"] != "limit_ops_total" || got["c-Three-c"] != "limit_ops_total" {
		t.Fatalf("total: %v", got)
	}
}

// TestRequestLimit (5.1): requests above the tenant's rate answer 429
// limit_requests; the next minute works again.
func TestRequestLimit(t *testing.T) {
	f := newFixture(t, nil)
	f.create("chatty", config.Limits{RequestsPerMinute: 3})
	c := f.client("chatty")
	for i := 0; i < 3; i++ {
		if code, _ := c.do("GET", "/api/v1/auth/status", nil); code != http.StatusOK {
			t.Fatalf("request %d: %d", i, code)
		}
	}
	code, out := c.do("GET", "/api/v1/auth/status", nil)
	if code != http.StatusTooManyRequests || errCode(out) != "limit_requests" {
		t.Fatalf("over the rate: %d %v", code, out)
	}
	f.clock.Advance(time.Minute)
	if code, _ := c.do("GET", "/api/v1/auth/status", nil); code != http.StatusOK {
		t.Fatalf("next minute: %d", code)
	}
}

// TestImportLimit (5.1): an import above the tenant's size answers 413
// limit_import.
func TestImportLimit(t *testing.T) {
	f := newFixture(t, nil)
	c := f.client("small")
	c.register("small@example.com", f.create("small", config.Limits{ImportMB: 1}))
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, _ := mw.CreateFormFile("file", "big.json")
	fw.Write([]byte(`{"tasks":[` + strings.Repeat(`{"title":"x"},`, 120000) + `{"title":"y"}]}`))
	mw.Close()
	req := c.request("POST", "/api/v1/import/preview", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	resp, err := c.send(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var b bytes.Buffer
	b.ReadFrom(resp.Body)
	if resp.StatusCode != http.StatusRequestEntityTooLarge || !strings.Contains(b.String(), "limit_import") {
		t.Fatalf("import: %d %s", resp.StatusCode, b.String())
	}
}

// TestMemberLimit (5.1): with a limit of two members, a third account is
// refused with limit_members.
func TestMemberLimit(t *testing.T) {
	f := newFixture(t, func(c *config.Config, _ *Options) { c.AllowSignup = true })
	c := f.client("team")
	c.register("owner@example.com", f.create("team", config.Limits{Members: 2}))
	for i, want := range []int{http.StatusCreated, http.StatusForbidden} {
		code, out := f.client("team").do("POST", "/api/v1/auth/register", map[string]any{"email": fmt.Sprintf("m%d@example.com", i), "name": "M", "password": "correct horse battery"})
		if code != want && !(want == http.StatusCreated && code == http.StatusOK) {
			t.Fatalf("member %d: %d %v", i, code, out)
		}
		if want == http.StatusForbidden && errCode(out) != "limit_members" {
			t.Fatalf("code = %v", out)
		}
	}
}
