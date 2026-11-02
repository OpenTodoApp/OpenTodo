package httpapi

import (
	"fmt"
	"strings"
	"testing"
)

// plan-objectives 2.1 (http-api "Objectives collection"): create, list with
// filters, patch, the limit, validation, tombstone delete, anonymous, read and
// agent tokens, and another account's objective.
func TestObjectivesCollection(t *testing.T) {
	e := newEnv(t, true)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "a@example.com", "name": "A", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)

	resp, out = e.do("POST", "/api/v1/objectives", map[string]any{"title": "Ship 1.0", "period": "2026-Q4"})
	e.mustStatus(resp, 201, out)
	quarterly := out["id"].(string)
	if out["done_at"] != float64(0) || out["position"] == nil || out["period"] != "2026-Q4" {
		t.Fatalf("created = %v", out)
	}

	// Validation: a month, an empty title, a missing period.
	for _, body := range []map[string]any{
		{"title": "Monthly", "period": "2026-11"},
		{"title": "  ", "period": "2026-W44"},
		{"title": strings.Repeat("x", 141), "period": "2026-W44"},
		{"title": "No period"},
	} {
		resp, out = e.do("POST", "/api/v1/objectives", body)
		if resp.StatusCode != 400 || errCode(out) != "invalid_input" {
			t.Fatalf("%v: %d %v", body, resp.StatusCode, out)
		}
	}
	resp, out = e.do("POST", "/api/v1/objectives", map[string]any{"title": "Monthly", "period": "2026-11"})
	if msg := fmt.Sprint(out["error"]); !strings.Contains(msg, "period") {
		t.Fatalf("message does not name the field: %v", msg)
	}

	// Five open weekly objectives; a done one does not count; the sixth is 409.
	var week []string
	for i := range 5 {
		resp, out = e.do("POST", "/api/v1/objectives", map[string]any{"title": fmt.Sprint("Week ", i), "period": "2026-W44"})
		e.mustStatus(resp, 201, out)
		week = append(week, out["id"].(string))
	}
	before := countOps(t, e)
	resp, out = e.do("POST", "/api/v1/objectives", map[string]any{"title": "One more", "period": "2026-W44"})
	if resp.StatusCode != 409 || errCode(out) != "too_many_objectives" {
		t.Fatalf("sixth: %d %v", resp.StatusCode, out)
	}
	if countOps(t, e) != before {
		t.Fatal("the refused sixth wrote ops")
	}
	// Moving the quarterly one into the full week is refused too.
	resp, out = e.do("PATCH", "/api/v1/objectives/"+quarterly, map[string]any{"period": "2026-W44"})
	if resp.StatusCode != 409 || errCode(out) != "too_many_objectives" {
		t.Fatalf("move into a full week: %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("PATCH", "/api/v1/objectives/"+week[0], map[string]any{"done_at": 1761638400000})
	e.mustStatus(resp, 200, out)
	resp, out = e.do("POST", "/api/v1/objectives", map[string]any{"title": "Now it fits", "period": "2026-W44"})
	e.mustStatus(resp, 201, out)

	// Filters.
	resp, out = e.do("GET", "/api/v1/objectives?period=2026-W44&open=true", nil)
	e.mustStatus(resp, 200, out)
	if n := len(out["objectives"].([]any)); n != 5 {
		t.Fatalf("open in W44 = %d", n)
	}
	resp, out = e.do("GET", "/api/v1/objectives?period=2026-Q4", nil)
	e.mustStatus(resp, 200, out)
	if n := len(out["objectives"].([]any)); n != 1 {
		t.Fatalf("Q4 = %d", n)
	}
	resp, out = e.do("GET", "/api/v1/objectives?period=Q4", nil)
	if resp.StatusCode != 400 || errCode(out) != "invalid_input" {
		t.Fatalf("bad period filter: %d %v", resp.StatusCode, out)
	}

	// Delete is a tombstone.
	resp, out = e.do("DELETE", "/api/v1/objectives/"+quarterly, nil)
	if resp.StatusCode != 204 && resp.StatusCode != 200 {
		t.Fatalf("delete: %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("GET", "/api/v1/objectives/"+quarterly, nil)
	e.mustStatus(resp, 404, out)
	resp, out = e.do("GET", "/api/v1/objectives?include_deleted=true&period=2026-Q4", nil)
	e.mustStatus(resp, 200, out)
	if l := out["objectives"].([]any); len(l) != 1 || l[0].(map[string]any)["deleted_at"] == nil {
		t.Fatalf("tombstone = %v", l)
	}

	// Read and agent tokens may list but not write.
	for _, scope := range []string{"read", "agent"} {
		secret := e.token(scope)
		c := e.bearerClient()
		if scope == "read" {
			resp, out = c.do("GET", "/api/v1/objectives", nil, bearer(secret)...)
			c.mustStatus(resp, 200, out)
		}
		resp, out = c.do("POST", "/api/v1/objectives", map[string]any{"title": "Nope", "period": "2026-Q4"}, bearer(secret)...)
		if resp.StatusCode != 403 || errCode(out) != "insufficient_scope" {
			t.Fatalf("%s token POST: %d %v", scope, resp.StatusCode, out)
		}
	}

	// Anonymous.
	anon := newClientFor(e)
	resp, out = anon.do("GET", "/api/v1/objectives", nil)
	anon.mustStatus(resp, 401, out)
	resp, out = anon.do("POST", "/api/v1/objectives", map[string]any{"title": "x", "period": "2026-Q4"})
	anon.mustStatus(resp, 401, out)

	// Another account sees none of them.
	b := newClientAt(e, "203.0.113.77")
	resp, out = b.do("POST", "/api/v1/auth/register", map[string]string{"email": "b@example.com", "name": "B", "password": "correct horse battery"})
	b.mustStatus(resp, 201, out)
	resp, out = b.do("GET", "/api/v1/objectives/"+week[1], nil)
	b.mustStatus(resp, 404, out)
	resp, out = b.do("GET", "/api/v1/objectives", nil)
	b.mustStatus(resp, 200, out)
	if n := len(out["objectives"].([]any)); n != 0 {
		t.Fatalf("b sees %d objectives", n)
	}
}
