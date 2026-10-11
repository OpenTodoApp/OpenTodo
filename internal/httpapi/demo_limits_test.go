package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/demo"
)

func TestSandboxByteBudget(t *testing.T) {
	d := newDemoServer(t)
	e, uid := d.visitor()
	// Close to the byte budget: a batch whose values would cross it is refused
	// whole, smaller writes still fit.
	if _, err := e.db.Exec(`UPDATE demo_sandboxes SET bytes_total = ? WHERE user_id = ?`, demo.BytesTotal-3000, uid); err != nil {
		t.Fatal(err)
	}
	before := demoRows(t, e, `SELECT COUNT(*) FROM ops`)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "big", "description": strings.Repeat("n", 4000)})
	if resp.StatusCode != http.StatusTooManyRequests || errCode(out) != "demo_limit" || !strings.Contains(out["error"].(map[string]any)["message"].(string), "storage limit") {
		t.Fatalf("over the byte budget: %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("POST", "/api/v1/sync", map[string]any{"device": "d1", "cursor": 0, "ops": []any{map[string]any{
		"id": "bb1", "entity": "task", "entityId": "tb", "field": "description", "value": strings.Repeat("n", 3000), "ts": time.Now().UnixMilli(), "device": "d1"}}})
	if resp.StatusCode != http.StatusTooManyRequests || errCode(out) != "demo_limit" {
		t.Fatalf("sync over the byte budget: %d %v", resp.StatusCode, out)
	}
	if n := demoRows(t, e, `SELECT COUNT(*) FROM ops`); n != before {
		t.Fatalf("ops applied despite the refusal: %d -> %d", before, n)
	}
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "small"})
	e.mustStatus(resp, http.StatusCreated, out)
	if got := demoRows(t, e, `SELECT bytes_total FROM demo_sandboxes WHERE user_id = ?`, uid); got <= demo.BytesTotal-3000 {
		t.Fatalf("bytes not charged: %d", got)
	}
}

func TestDemoSizeGuardRefusesWrites(t *testing.T) {
	d := newDemoServer(t)
	e, _ := d.visitor()
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "before"})
	e.mustStatus(resp, http.StatusCreated, out)
	// Two more sandboxes push the database above a 1 MB limit: live sandboxes
	// cannot write either.
	d.visitor()
	d.visitor()
	d.demo.SetLimits(0, 1)
	before := demoRows(t, e, `SELECT COUNT(*) FROM ops`)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "after"})
	if resp.StatusCode != http.StatusTooManyRequests || errCode(out) != "demo_limit" {
		t.Fatalf("REST write above the size limit: %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("POST", "/api/v1/sync", map[string]any{"device": "d1", "cursor": 0, "ops": []any{map[string]any{
		"id": "sg1", "entity": "task", "entityId": "tg", "field": "title", "value": "x", "ts": time.Now().UnixMilli(), "device": "d1"}}})
	if resp.StatusCode != http.StatusTooManyRequests || errCode(out) != "demo_limit" {
		t.Fatalf("sync above the size limit: %d %v", resp.StatusCode, out)
	}
	if n := demoRows(t, e, `SELECT COUNT(*) FROM ops`); n != before {
		t.Fatalf("ops applied above the size limit: %d -> %d", before, n)
	}
	// Reads keep working.
	resp, out = e.do("GET", "/api/v1/tasks", nil)
	e.mustStatus(resp, http.StatusOK, out)
}

// TestClientAddressIgnoresSpoofedForwardedFor: the per-address limits use the
// last X-Forwarded-For hop (added by the nearest proxy), so a client that puts
// a different address in front each time is still counted as itself.
func TestClientAddressIgnoresSpoofedForwardedFor(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "10.0.0.9:5555"
	if got := clientIP(r); got != "10.0.0.9" {
		t.Fatalf("no header: %q", got)
	}
	r.Header.Set("X-Forwarded-For", "6.6.6.6, 198.51.100.7")
	if got := clientIP(r); got != "198.51.100.7" {
		t.Fatalf("appended hop: %q", got)
	}
	r.Header.Add("X-Forwarded-For", "198.51.100.8 ")
	if got := clientIP(r); got != "198.51.100.8" {
		t.Fatalf("second header line: %q", got)
	}

	// Sign-in limiter: ten attempts per minute, whatever the client puts first.
	e := newEnv(t, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "name": "O", "password": "correct horse battery"})
	e.mustStatus(resp, http.StatusCreated, out)
	limited := false
	for i := 0; i < 12; i++ {
		resp, _ := e.do("POST", "/api/v1/auth/login", map[string]string{"email": "o@example.com", "password": "wrong password!"},
			"X-Forwarded-For", "192.0.2."+strconv.Itoa(i)+", 203.0.113.50")
		if resp.StatusCode == http.StatusTooManyRequests {
			limited = true
		}
	}
	if !limited {
		t.Fatal("spoofed leading X-Forwarded-For entries evade the sign-in limit")
	}

	// Demo sandbox limit: five per address per hour despite spoofed leading entries.
	d := newDemoServer(t)
	v := d.anonymous()
	v.ip = ""
	var codes []int
	for i := 0; i < demo.PerAddressPerHour+1; i++ {
		resp, _ := v.do("POST", "/api/v1/demo/sandbox", map[string]string{"token": token(v)}, "Origin", v.srv.URL,
			"X-Forwarded-For", "192.0.2."+strconv.Itoa(i)+", 203.0.113.60")
		codes = append(codes, resp.StatusCode)
	}
	if codes[len(codes)-1] != http.StatusTooManyRequests {
		t.Fatalf("spoofed leading entries evade the sandbox limit: %v", codes)
	}
}
