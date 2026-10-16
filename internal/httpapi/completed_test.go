package httpapi

import (
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"
)

// OpenSpec change completed-date-filters: completed_by on server-side
// completions (task 3.2) and the completion range on the task list (task 4.1).

func meID(t *testing.T, e *env) string {
	t.Helper()
	resp, out := e.do("GET", "/api/v1/me", nil)
	e.mustStatus(resp, 200, out)
	return out["user"].(map[string]any)["id"].(string)
}

func TestRestCompletionStampsCompletedBy(t *testing.T) {
	e := registeredEnv(t)
	me := meID(t, e)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Report"})
	e.mustStatus(resp, 201, out)
	if v, has := out["completed_by"]; has && v != nil {
		t.Fatalf("new task completed_by = %v, want none", v)
	}
	id := out["id"].(string)

	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"completed_at": time.Now().UnixMilli()})
	e.mustStatus(resp, 200, out)
	if out["completed_by"] != me {
		t.Fatalf("completed_by = %v, want %s", out["completed_by"], me)
	}
	// Both ops share the timestamp and device, so they resolve together.
	var atTS, byTS int64
	var atDev, byDev string
	e.db.QueryRow(`SELECT ts, device FROM ops WHERE entity_id = ? AND field = 'completed_at' ORDER BY seq DESC LIMIT 1`, id).Scan(&atTS, &atDev)
	e.db.QueryRow(`SELECT ts, device FROM ops WHERE entity_id = ? AND field = 'completed_by' ORDER BY seq DESC LIMIT 1`, id).Scan(&byTS, &byDev)
	if atTS != byTS || atDev != byDev || atTS == 0 {
		t.Fatalf("completed_at op (%d, %q) and completed_by op (%d, %q) differ", atTS, atDev, byTS, byDev)
	}

	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"completed_at": nil})
	e.mustStatus(resp, 200, out)
	if out["completed_at"] != nil || out["completed_by"] != nil {
		t.Fatalf("reopened = %v", out)
	}

	// An explicit value in the same write wins over the stamp.
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"completed_at": time.Now().UnixMilli(), "completed_by": nil})
	e.mustStatus(resp, 200, out)
	if out["completed_by"] != nil {
		t.Fatalf("explicit completed_by = %v, want null", out["completed_by"])
	}
}

func TestRestRecurringCompletionRecordCarriesCompletedBy(t *testing.T) {
	e := registeredEnv(t)
	me := meID(t, e)
	today := dayOffset(0)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Water plants", "recurrence": "every day", "due": map[string]any{"date": today}})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"completed_at": time.Now().UnixMilli()})
	e.mustStatus(resp, 200, out)
	if out["completed_at"] != nil || out["completed_by"] != nil {
		t.Fatalf("series = %v, want it open without completed_by", out)
	}
	resp, out = e.do("GET", "/api/v1/tasks/"+occurrenceID(id, today), nil)
	e.mustStatus(resp, 200, out)
	if out["completed_by"] != me || out["completed_at"] == nil {
		t.Fatalf("occurrence record = %v", out)
	}
}

func TestPublicTickRecordsNoCompleter(t *testing.T) {
	se := newShareEnv(t)
	tick, _ := publicLink(t, se.alice, se.project, map[string]any{"rights": "tick"})
	anon := newClientAt(se.alice, "10.9.2.1")
	resp, out := anon.do("POST", "/api/v1/public/"+tick+"/tick", map[string]any{"taskId": se.task, "completed": true})
	anon.mustStatus(resp, 200, out)
	resp, out = se.alice.do("GET", "/api/v1/tasks/"+se.task, nil)
	se.alice.mustStatus(resp, 200, out)
	if out["completed_at"] == nil || out["completed_by"] != nil {
		t.Fatalf("ticked task = %v, want completed with completed_by null", out)
	}
}

func listIDs(t *testing.T, e *env, query string) []string {
	t.Helper()
	resp, out := e.do("GET", "/api/v1/tasks"+query, nil)
	e.mustStatus(resp, 200, out)
	var titles []string
	for _, raw := range out["tasks"].([]any) {
		titles = append(titles, raw.(map[string]any)["title"].(string))
	}
	sort.Strings(titles)
	return titles
}

func TestRestTaskListCompletionRange(t *testing.T) {
	e := registeredEnv(t)
	zurich, _ := time.LoadLocation("Europe/Zurich")
	at := func(day string, hour int) int64 {
		d, _ := time.ParseInLocation("2006-01-02", day, zurich)
		return d.Add(time.Duration(hour) * time.Hour).UnixMilli()
	}
	for title, done := range map[string]int64{
		"open": 0, "sunday-before": at("2026-10-04", 23), "monday": at("2026-10-05", 0), "sunday": at("2026-10-11", 23), "next-monday": at("2026-10-12", 0),
	} {
		body := map[string]any{"title": title}
		if done != 0 {
			body["completed_at"] = done
		}
		resp, out := e.do("POST", "/api/v1/tasks", body)
		e.mustStatus(resp, 201, out)
	}

	week := "?completed_after=2026-10-05&completed_before=2026-10-12&timezone=Europe/Zurich"
	if got := strings.Join(listIDs(t, e, week), ","); got != "monday,sunday" {
		t.Fatalf("last week = %s", got)
	}
	// UTC by default: midnight Zurich is 22:00 UTC the day before, so each end shifts.
	if got := strings.Join(listIDs(t, e, "?completed_after=2026-10-05&completed_before=2026-10-12"), ","); got != "next-monday,sunday" {
		t.Fatalf("UTC week = %s", got)
	}
	// One end, an RFC 3339 time and Unix milliseconds.
	if got := strings.Join(listIDs(t, e, "?completed_before=2026-10-05T00:00:00%2B02:00"), ","); got != "sunday-before" {
		t.Fatalf("before = %s", got)
	}
	if got := strings.Join(listIDs(t, e, "?completed_after="+strconv.FormatInt(at("2026-10-12", 0), 10)), ","); got != "next-monday" {
		t.Fatalf("after ms = %s", got)
	}
	// Without the parameters the list is unchanged.
	if n := len(listIDs(t, e, "")); n != 5 {
		t.Fatalf("plain list = %d tasks", n)
	}

	for _, q := range []struct{ path, field string }{
		{"/api/v1/tasks?completed_after=last-week", "completed_after"},
		{"/api/v1/tasks?completed_before=2026-02-30", "completed_before"},
		{"/api/v1/projects?completed_after=2026-10-05", "completed_after"},
		{"/api/v1/tasks?completed_after=2026-10-05&timezone=Mars/Olympus", "timezone"},
	} {
		resp, out := e.do("GET", q.path, nil)
		if resp.StatusCode != 400 || errCode(out) != "invalid_input" || !strings.HasPrefix(errMessage(out), q.field+":") {
			t.Fatalf("%s = %d %v", q.path, resp.StatusCode, out)
		}
	}

	anon := newClientFor(e)
	resp, out := anon.do("GET", "/api/v1/tasks"+week, nil)
	anon.mustStatus(resp, 401, out)
}
