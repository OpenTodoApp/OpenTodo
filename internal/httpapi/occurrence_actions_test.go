package httpapi

import (
	"net/http"
	"strings"
	"testing"
	"time"
)

// OpenSpec change series-exceptions, "Occurrences through the API and CLI".

func occurrenceStates(t *testing.T, e *env, id, from, to string) map[string]string {
	t.Helper()
	resp, out := e.do("GET", "/api/v1/tasks/"+id+"/occurrences?from="+from+"&to="+to, nil)
	e.mustStatus(resp, 200, out)
	got := map[string]string{}
	for _, o := range out["occurrences"].([]any) {
		m := o.(map[string]any)
		got[m["date"].(string)] = m["state"].(string)
	}
	return got
}

func TestOccurrenceActions(t *testing.T) {
	e := ownerEnv(t)
	e.now.Freeze(time.Date(2026, 10, 12, 12, 0, 0, 0, time.Local))
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Weekly report", "due": map[string]any{"date": "2026-10-12"}, "recurrence": "every monday"})
	e.mustStatus(resp, 201, out)
	report := out["id"].(string)
	full, read := e.token("full"), e.token("read")
	c := e.bearerClient()

	// Skip from a script: the answer is the skipped record of the 19th.
	resp, out = c.do("POST", "/api/v1/tasks/"+report+"/occurrences/2026-10-19/skip", nil, bearer(full)...)
	c.mustStatus(resp, 200, out)
	if out["series_id"] != report || out["occurrence_date"] != "2026-10-19" || out["skipped"] != true || out["completed_at"] == nil {
		t.Fatalf("skip answer = %v", out)
	}
	if got := occurrenceStates(t, e, report, "2026-10-12", "2026-11-02"); got["2026-10-19"] != "skipped" || got["2026-10-26"] != "projected" || got["2026-10-12"] != "current" {
		t.Fatalf("states = %v", got)
	}
	// Read token refused; nothing written.
	resp, out = c.do("POST", "/api/v1/tasks/"+report+"/occurrences/2026-10-26/complete", nil, bearer(read)...)
	if resp.StatusCode != http.StatusForbidden || errCode(out) != "insufficient_scope" {
		t.Fatalf("read token = %d %v", resp.StatusCode, out)
	}
	resp, out = c.do("POST", "/api/v1/tasks/"+report+"/occurrences/2026-10-26/complete", nil, bearer(e.token("agent"))...)
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("agent token = %d %v", resp.StatusCode, out)
	}
	// Not an occurrence: a Tuesday, a date before the current one.
	for _, date := range []string{"2026-10-20", "2026-10-05"} {
		resp, out = e.do("POST", "/api/v1/tasks/"+report+"/occurrences/"+date+"/complete", nil)
		if resp.StatusCode != http.StatusBadRequest || errCode(out) != "not_an_occurrence" {
			t.Fatalf("%s = %d %v", date, resp.StatusCode, out)
		}
	}
	resp, out = e.do("POST", "/api/v1/tasks/"+report+"/occurrences/next-week/complete", nil)
	if resp.StatusCode != http.StatusBadRequest || errCode(out) != "invalid_input" {
		t.Fatalf("bad date = %d %v", resp.StatusCode, out)
	}
	// Completing the series now jumps over the skipped 19th.
	resp, out = e.do("PATCH", "/api/v1/tasks/"+report, map[string]any{"completed_at": e.now.Now().UnixMilli()})
	e.mustStatus(resp, 200, out)
	if due := out["due"].(map[string]any); due["date"] != "2026-10-26" {
		t.Fatalf("series due = %v, want the 26th", due)
	}

	// Move and edit one occurrence; complete a future one early.
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Study", "due": map[string]any{"date": "2026-10-12", "time": "18:00"}, "recurrence": "every weekday"})
	e.mustStatus(resp, 201, out)
	study := out["id"].(string)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+study+"/occurrences/2026-10-14", map[string]any{"due": map[string]any{"date": "2026-10-14", "time": "19:00"}, "title": "Study: exam prep"})
	e.mustStatus(resp, 200, out)
	moved := out["id"].(string)
	if out["occurrence_date"] != "2026-10-14" || out["completed_at"] != nil || out["title"] != "Study: exam prep" || out["due"].(map[string]any)["time"] != "19:00" {
		t.Fatalf("moved = %v", out)
	}
	resp, out = e.do("POST", "/api/v1/tasks/"+study+"/occurrences/2026-10-15/complete", nil)
	e.mustStatus(resp, 200, out)
	resp, out = e.do("GET", "/api/v1/tasks/"+study, nil)
	e.mustStatus(resp, 200, out)
	if out["title"] != "Study" || out["due"].(map[string]any)["date"] != "2026-10-12" {
		t.Fatalf("series changed: %v", out)
	}
	got := occurrenceStates(t, e, study, "2026-10-12", "2026-10-16")
	if got["2026-10-14"] != "open" || got["2026-10-15"] != "done" || got["2026-10-13"] != "projected" || got["2026-10-16"] != "projected" {
		t.Fatalf("states = %v", got)
	}
	// The PATCH of the existing record edits it in place; fixed fields are refused.
	resp, out = e.do("PATCH", "/api/v1/tasks/"+study+"/occurrences/2026-10-14", map[string]any{"priority": 1})
	e.mustStatus(resp, 200, out)
	if out["id"] != moved || out["priority"] != float64(1) || out["title"] != "Study: exam prep" {
		t.Fatalf("edit = %v", out)
	}
	resp, out = e.do("PATCH", "/api/v1/tasks/"+study+"/occurrences/2026-10-16", map[string]any{"occurrence_date": "2026-10-17"})
	if resp.StatusCode != http.StatusBadRequest || errCode(out) != "invalid_input" {
		t.Fatalf("fixed field = %d %v", resp.StatusCode, out)
	}

	// Not recurring; unknown task.
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Once", "due": map[string]any{"date": "2026-10-12"}})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("POST", "/api/v1/tasks/"+out["id"].(string)+"/occurrences/2026-10-12/complete", nil)
	if resp.StatusCode != http.StatusBadRequest || errCode(out) != "not_recurring" {
		t.Fatalf("plain = %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("POST", "/api/v1/tasks/nope/occurrences/2026-10-12/complete", nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("unknown = %d %v", resp.StatusCode, out)
	}
}

// A materialised occurrence gets copies of the series' relative reminders
// (series-exceptions D7), firing from its own due.
func TestOccurrenceRecordCopiesRelativeReminders(t *testing.T) {
	e := ownerEnv(t)
	e.now.Freeze(time.Date(2026, 10, 12, 12, 0, 0, 0, time.Local))
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Study", "due": map[string]any{"date": "2026-10-12", "time": "18:00"}, "recurrence": "every weekday"})
	e.mustStatus(resp, 201, out)
	study := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/reminders", map[string]any{"task_id": study, "kind": "relative", "offset_minutes": -15})
	e.mustStatus(resp, 201, out)
	// The series reminds at 17:45 on the 12th (in the account's zone).
	seriesFire := int64(out["fire_at"].(float64))
	resp, out = e.do("POST", "/api/v1/reminders", map[string]any{"task_id": study, "kind": "absolute", "fire_at": time.Date(2026, 10, 20, 9, 0, 0, 0, time.Local).UnixMilli()})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+study+"/occurrences/2026-10-14", map[string]any{"due": map[string]any{"date": "2026-10-14", "time": "19:00"}})
	e.mustStatus(resp, 200, out)
	record := out["id"].(string)
	// The copy reminds at 18:45 on the 14th: two days and an hour later.
	want := seriesFire + (49 * time.Hour).Milliseconds()
	copies := 0
	for _, m := range e.reminders(record) {
		copies++
		if m["kind"] != "relative" || int64(m["fire_at"].(float64)) != want {
			t.Fatalf("copy = %v, want relative at 18:45", m)
		}
	}
	if copies != 1 {
		t.Fatalf("copies = %d, want the relative reminder only", copies)
	}
}

// A viewer of a shared project cannot act on an occurrence.
func TestOccurrenceActionViewer(t *testing.T) {
	se := newShareEnv(t)
	se.share(se.alice, "bob@example.com", "viewer")
	resp, out := se.alice.do("POST", "/api/v1/tasks", map[string]any{"title": "Stand-up", "project_id": se.project, "due": map[string]any{"date": "2099-10-12"}, "recurrence": "every day"})
	se.alice.mustStatus(resp, 201, out)
	id := out["id"].(string)
	resp, out = se.bob.do("POST", "/api/v1/tasks/"+id+"/occurrences/2099-10-13/skip", nil)
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("viewer = %d %v", resp.StatusCode, out)
	}
}

// On an encrypted account the server writes records without content fields
// (series-exceptions D12): a ciphertext is bound to its entity id.
func TestOccurrenceRecordOnEncryptedAccount(t *testing.T) {
	e := ownerEnv(t)
	e.now.Freeze(time.Date(2026, 10, 12, 12, 0, 0, 0, time.Local))
	cipher := "enc:v1:" + strings.Repeat("A", 40)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": cipher, "description": cipher, "due": map[string]any{"date": "2026-10-12"}, "recurrence": "every day"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"completed_at": e.now.Now().UnixMilli()})
	e.mustStatus(resp, 200, out)
	for _, path := range []string{"/api/v1/tasks/" + occurrenceID(id, "2026-10-12")} {
		resp, out = e.do("GET", path, nil)
		e.mustStatus(resp, 200, out)
		if (out["title"] != nil && out["title"] != "") || (out["description"] != nil && out["description"] != "") || out["series_id"] != id {
			t.Fatalf("record = %v, want no content", out)
		}
	}
	resp, out = e.do("POST", "/api/v1/tasks/"+id+"/occurrences/2026-10-15/skip", nil)
	e.mustStatus(resp, 200, out)
	if out["title"] != nil && out["title"] != "" {
		t.Fatalf("skipped record title = %v", out["title"])
	}
}
