package httpapi

import (
	"net/http"
	"testing"
	"time"
)

// OpenSpec change series-occurrences, "Occurrences for integrations".
func TestTaskOccurrences(t *testing.T) {
	e := ownerEnv(t)
	m, _ := e.member("m@example.com", "198.51.100.30")
	read := e.token("read")
	e.now.Freeze(time.Date(2026, 10, 12, 12, 0, 0, 0, time.Local))
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Study", "due": map[string]any{"date": "2026-10-12", "time": "18:00"}, "recurrence": "every weekday", "estimate_minutes": 60})
	e.mustStatus(resp, 201, out)
	study := out["id"].(string)

	// List a week of sessions: the 12th is current, the 13th to the 16th projected, each at 18:00.
	resp, out = e.do("GET", "/api/v1/tasks/"+study+"/occurrences?from=2026-10-12&to=2026-10-18", nil)
	e.mustStatus(resp, 200, out)
	if out["series_id"] != study || out["rule"] != "every weekday" || out["capped"] != false {
		t.Fatalf("answer = %v", out)
	}
	got := []string{}
	for _, o := range out["occurrences"].([]any) {
		m := o.(map[string]any)
		if m["time"] != "18:00" {
			t.Fatalf("occurrence without its time: %v", m)
		}
		got = append(got, m["date"].(string)+" "+m["state"].(string))
	}
	want := []string{"2026-10-12 current", "2026-10-13 projected", "2026-10-14 projected", "2026-10-15 projected", "2026-10-16 projected"}
	if len(got) != len(want) {
		t.Fatalf("occurrences = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("occurrences = %v, want %v", got, want)
		}
	}

	// Defaults: from today to 30 days after; a read token may call it.
	c := e.bearerClient()
	resp, out = c.do("GET", "/api/v1/tasks/"+study+"/occurrences", nil, bearer(read)...)
	c.mustStatus(resp, 200, out)
	if n := len(out["occurrences"].([]any)); n != 23 { // 12 Oct to 11 Nov: 23 weekdays
		t.Fatalf("default range = %d occurrences: %v", n, out)
	}

	// Bad input.
	for _, q := range []string{"?from=2026-10-20&to=2026-10-12", "?from=2026-10-01&to=2027-11-05", "?from=2026-13-01", "?to=tomorrow"} {
		resp, out = e.do("GET", "/api/v1/tasks/"+study+"/occurrences"+q, nil)
		if resp.StatusCode != http.StatusBadRequest || errCode(out) != "invalid_input" {
			t.Fatalf("%s = %d %v", q, resp.StatusCode, out)
		}
	}
	// A task without a rule.
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Once", "due": map[string]any{"date": "2026-10-12"}})
	e.mustStatus(resp, 201, out)
	once := out["id"].(string)
	resp, out = e.do("GET", "/api/v1/tasks/"+once+"/occurrences", nil)
	if resp.StatusCode != http.StatusBadRequest || errCode(out) != "not_recurring" {
		t.Fatalf("plain task = %d %v", resp.StatusCode, out)
	}
	// Unknown or unseen task.
	resp, out = e.do("GET", "/api/v1/tasks/nope/occurrences", nil)
	if resp.StatusCode != http.StatusNotFound || errCode(out) != "not_found" {
		t.Fatalf("unknown = %d %v", resp.StatusCode, out)
	}
	resp, out = m.do("GET", "/api/v1/tasks/"+study+"/occurrences", nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("another account = %d %v", resp.StatusCode, out)
	}
	// Not signed in.
	anon := newClientAt(e, "203.0.113.60")
	resp, _ = anon.do("GET", "/api/v1/tasks/"+study+"/occurrences", nil)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous = %d", resp.StatusCode)
	}
}

// Completed records count toward "for N times", as on every device.
func TestTaskOccurrencesCountsCompletedRecords(t *testing.T) {
	e := ownerEnv(t)
	e.now.Freeze(time.Date(2026, 10, 12, 12, 0, 0, 0, time.Local))
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Course", "due": map[string]any{"date": "2026-10-10"}, "recurrence": "every day for 5 times"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	// Complete twice: records for the 10th and the next occurrence.
	for i := 0; i < 2; i++ {
		resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"completed_at": e.now.Now().UnixMilli()})
		e.mustStatus(resp, 200, out)
	}
	resp, out = e.do("GET", "/api/v1/tasks/"+id+"/occurrences?from=2026-10-01&to=2026-10-31", nil)
	e.mustStatus(resp, 200, out)
	occ := out["occurrences"].([]any)
	// Two done: the current occurrence plus two projections make the five.
	if len(occ) != 3 || occ[0].(map[string]any)["state"] != "current" {
		t.Fatalf("occurrences = %v", occ)
	}
}
