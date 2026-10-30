package httpapi

import (
	"strings"
	"testing"
)

// TestDayPartREST (OpenSpec change day-parts): day_part goes through the
// schema path paired with the evening flag, an unknown value is refused, and
// GET /api/v1/me carries the Day parts preference.
func TestDayPartREST(t *testing.T) {
	e := newEnv(t, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Read", "evening": true})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"day_part": "morning"})
	e.mustStatus(resp, 200, out)
	if out["day_part"] != "morning" || out["evening"] != false {
		t.Fatalf("patched = %v", out)
	}
	for _, bad := range []map[string]any{{"day_part": "night"}, {"day_part": "evening"}} {
		resp, out = e.do("PATCH", "/api/v1/tasks/"+id, bad)
		e.mustStatus(resp, 400, out)
	}
	resp, out = e.do("GET", "/api/v1/me", nil)
	e.mustStatus(resp, 200, out)
	if out["day_parts"] != false {
		t.Fatalf("me day_parts = %v", out["day_parts"])
	}
}

// TestCaldavDayPart: X-OPENTODO-DAY-PART sets the part with the evening flag
// cleared, is served back, and a client without it leaves the part alone.
func TestCaldavDayPart(t *testing.T) {
	e, c := davSetup(t)
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:Stretch", "X-OPENTODO-EVENING:TRUE"), 201)
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:Stretch", "X-OPENTODO-DAY-PART:AFTERNOON"), 204)
	if task := e.task("t1"); task["day_part"] != "afternoon" || task["evening"] != false {
		t.Fatalf("task %v", task)
	}
	_, ics := c.must("GET", c.cal("inbox")+"t1.ics", "", 200)
	if !strings.Contains(ics, "X-OPENTODO-DAY-PART:AFTERNOON\r\n") || strings.Contains(ics, "X-OPENTODO-EVENING") {
		t.Fatalf("GET:\n%s", ics)
	}
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:Stretch well"), 204)
	if task := e.task("t1"); task["day_part"] != "afternoon" || task["title"] != "Stretch well" {
		t.Fatalf("after a client without the property: %v", task)
	}
}

// TestQuickAddParseDayParts: day_parts turns the part phrases on (default off).
func TestQuickAddParseDayParts(t *testing.T) {
	a := parseAccountData{lang: "en", labels: map[string]string{}, names: map[string]string{}}
	a.ctx.Languages = []string{"en"}
	got := parseLine("Stretch tomorrow morning", a, "2026-10-14", "08:00")
	if got.Title != "Stretch morning" || got.Fields["day_part"] != nil {
		t.Fatalf("off: %+v", got)
	}
	a.ctx.DayParts = true
	got = parseLine("Stretch tomorrow morning", a, "2026-10-14", "08:00")
	if got.Title != "Stretch" || got.Fields["day_part"] != "morning" {
		t.Fatalf("on: %+v", got)
	}
	var kinds []string
	for _, c := range got.Chips {
		kinds = append(kinds, c.Kind+":"+c.Text)
	}
	if !strings.Contains(strings.Join(kinds, ","), "daypart:Morning") {
		t.Fatalf("chips %v", kinds)
	}
}
