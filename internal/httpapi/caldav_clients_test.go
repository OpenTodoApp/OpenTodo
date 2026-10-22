package httpapi

import (
	"os"
	"strings"
	"testing"
)

// OpenSpec change caldav-interop, tasks 5.2 and 5.3: what real clients sent in
// the verification run of 2026-10-22 (Thunderbird 158.0.1 through its CalDAV
// provider, todoman 4.7.0 synced by vdirsyncer 0.21.0), kept as fixtures so the
// results in docs/caldav.md stay pinned.

func clientFixture(t *testing.T, client, name, uid string) string {
	t.Helper()
	raw, err := os.ReadFile("../caldav/testdata/" + client + "/" + name + ".ics")
	if err != nil {
		t.Fatal(err)
	}
	return strings.ReplaceAll(string(raw), placeholderUID(t, string(raw)), uid)
}

// placeholderUID is the fixture's UID line value.
func placeholderUID(t *testing.T, ics string) string {
	t.Helper()
	for _, line := range strings.Split(ics, "\r\n") {
		if strings.HasPrefix(line, "UID:") {
			return strings.TrimPrefix(line, "UID:")
		}
	}
	t.Fatal("fixture without UID")
	return ""
}

// occurrenceRecords counts the completed occurrence records of a series.
func occurrenceRecords(e *env, seriesID string) int {
	e.t.Helper()
	resp, out := e.do("GET", "/api/v1/tasks", nil)
	e.mustStatus(resp, 200, out)
	n := 0
	for _, x := range out["tasks"].([]any) {
		m := x.(map[string]any)
		if m["series_id"] == seriesID && m["completed_at"] != nil {
			n++
		}
	}
	return n
}

// TestThunderbirdCompletesOccurrence: Thunderbird's task list shows the
// occurrences of a repeating task and completes the one clicked as an override
// (RECURRENCE-ID with STATUS:COMPLETED) next to the unchanged series.
func TestThunderbirdCompletesOccurrence(t *testing.T) {
	e, c := davSetup(t)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "TB daily", "due": map[string]any{"date": "2026-11-02"}, "recurrence": "every day"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	c.must("PUT", c.cal("inbox")+id+".ics", clientFixture(t, "thunderbird-158", "occurrence-completed", id), 204)
	got := e.task(id)
	if d := got["due"].(map[string]any); d["date"] != "2026-11-03" || got["completed_at"] != nil || got["recurrence"] != "every day" {
		t.Fatalf("series: %v", got)
	}
	if n := occurrenceRecords(e, id); n != 1 {
		t.Fatalf("occurrence records: %d", n)
	}
	// Served back without the override, starting at the next occurrence.
	_, ics := c.must("GET", c.cal("inbox")+id+".ics", "", 200)
	if strings.Contains(ics, "RECURRENCE-ID") || !strings.Contains(ics, "DUE;VALUE=DATE:20261103\r\n") {
		t.Fatalf("served:\n%s", ics)
	}
}

// TestCompletedOverrideOfAnotherDay: an override completed for a day that is
// not the current occurrence is not modelled and completes nothing.
func TestCompletedOverrideOfAnotherDay(t *testing.T) {
	e, c := davSetup(t)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "TB daily", "due": map[string]any{"date": "2026-11-02"}, "recurrence": "every day"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	body := strings.ReplaceAll(clientFixture(t, "thunderbird-158", "occurrence-completed", id), "RECURRENCE-ID;VALUE=DATE:20261102", "RECURRENCE-ID;VALUE=DATE:20261105")
	c.must("PUT", c.cal("inbox")+id+".ics", body, 204)
	if d := e.task(id)["due"].(map[string]any); d["date"] != "2026-11-02" || occurrenceRecords(e, id) != 0 {
		t.Fatalf("another day completed the series: %v", d)
	}
}

// TestThunderbirdDatesAndAlarms: a new task with Start and Due, an alarm added
// and then changed in the task dialog, and Due cleared while the served Start stays.
func TestThunderbirdDatesAndAlarms(t *testing.T) {
	e, c := davSetup(t)
	c.must("PUT", c.cal("inbox")+"tb-start-due.ics", clientFixture(t, "thunderbird-158", "new-start-due", "tb-start-due"), 201)
	got := e.task("tb-start-due")
	if d := got["due"].(map[string]any); d["date"] != "2026-11-18" || d["time"] != nil || got["deadline"] != "2026-11-20" {
		t.Fatalf("start and due: %v", got)
	}

	c.must("PUT", c.cal("inbox")+"tb-alarm.ics", clientFixture(t, "thunderbird-158", "alarm-added", "tb-alarm"), 201)
	rs := e.reminders("tb-alarm")
	if len(rs) != 1 || rs[0]["kind"] != "relative" || rs[0]["offset_minutes"] != float64(-15) {
		t.Fatalf("alarm added: %v", rs)
	}
	// The dialog builds a new alarm without the served UID: the reminder is
	// replaced, never doubled.
	c.must("PUT", c.cal("inbox")+"tb-alarm.ics", clientFixture(t, "thunderbird-158", "alarm-changed", "tb-alarm"), 204)
	rs = e.reminders("tb-alarm")
	if len(rs) != 1 || rs[0]["offset_minutes"] != float64(-30) {
		t.Fatalf("alarm changed: %v", rs)
	}

	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "TB due only", "due": map[string]any{"date": "2026-11-19", "time": "09:00", "tz": "Europe/Berlin"}})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	// Clearing only Due leaves the Start this server served: a DTSTART alone
	// sets nothing, so the due date stays (docs/caldav.md, "DTSTART alone").
	c.must("PUT", c.cal("inbox")+id+".ics", clientFixture(t, "thunderbird-158", "due-cleared-start-kept", id), 204)
	if d := e.task(id)["due"].(map[string]any); d["date"] != "2026-11-19" || d["time"] != "09:00" || d["tz"] != "Europe/Berlin" {
		t.Fatalf("due cleared, start kept: %v", d)
	}
}

// TestTodomanWrites: todoman writes times in UTC, drops the served start when
// only the due is edited, and completes a repeating task by finishing it
// without its rule and creating the next occurrence as a new task.
func TestTodomanWrites(t *testing.T) {
	e, c := davSetup(t)
	c.must("PUT", c.cal("inbox")+"tm-due-only.ics", clientFixture(t, "todoman-4.7", "new-due-utc", "tm-due-only"), 201)
	if d := e.task("tm-due-only")["due"].(map[string]any); d["date"] != "2026-11-19" || d["time"] != "08:00" || d["tz"] != "UTC" {
		t.Fatalf("UTC due: %v", d)
	}

	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "TM move", "due": map[string]any{"date": "2026-11-06", "time": "09:00", "tz": "UTC"}})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	c.must("PUT", c.cal("inbox")+id+".ics", clientFixture(t, "todoman-4.7", "edit-due-without-start", id), 204)
	got := e.task(id)
	if d := got["due"].(map[string]any); d["date"] != "2026-11-08" || d["time"] != "09:00" || got["deadline"] != nil {
		t.Fatalf("due moved: %v", got)
	}

	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "TM daily", "due": map[string]any{"date": "2026-11-02"}, "recurrence": "every day"})
	e.mustStatus(resp, 201, out)
	id = out["id"].(string)
	c.must("PUT", c.cal("inbox")+id+".ics", clientFixture(t, "todoman-4.7", "done-recurring-completed", id), 204)
	c.must("PUT", c.cal("inbox")+"tm-daily-next.ics", clientFixture(t, "todoman-4.7", "done-recurring-next", "tm-daily-next"), 201)
	got = e.task(id)
	if got["completed_at"] == nil || got["recurrence"] != nil {
		t.Fatalf("completed series: %v", got)
	}
	next := e.task("tm-daily-next")
	if d := next["due"].(map[string]any); d["date"] != "2026-11-03" || next["recurrence"] != "every day" || next["completed_at"] != nil {
		t.Fatalf("next occurrence: %v", next)
	}
}
