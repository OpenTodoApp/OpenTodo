package cli

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/calsync/calsynctest"
)

// ot calendar (calendar-event-edits, task 6.3) against the real server and a
// fake CalDAV account holding one event on the harness's fixed day.
func calendarHarness(t *testing.T) (*harness, *calsynctest.Server, func()) {
	t.Helper()
	h := newHarness(t)
	h.apiJSON("PUT", "/api/v1/settings/calendar-sync", map[string]any{"enabled": true})
	h.apiJSON("PUT", "/api/v1/settings/webhooks", map[string]any{"allowPrivate": true})
	cal := calsynctest.New()
	t.Cleanup(cal.Close)
	cal.AddCalendar("home", &calsynctest.Calendar{Name: "Home"})
	day := strings.ReplaceAll(fixedNow.AddDate(0, 0, 2).Format("2006-01-02"), "-", "")
	cal.Put("home", "standup.ics", "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:standup\r\nSUMMARY:Standup\r\nDTSTART;TZID=Europe/Berlin:"+day+
		"T090000\r\nDTEND;TZID=Europe/Berlin:"+day+"T093000\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n")
	_, full := h.apiToken2("full")
	resp := h.api("POST", "/api/v1/calendar-sync/connections", map[string]any{"server_url": cal.URL, "username": "me", "password": "app-pass"}, full)
	var out struct {
		Connection struct {
			ID string `json:"id"`
		} `json:"connection"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&out)
	resp.Body.Close()
	if out.Connection.ID == "" {
		t.Fatalf("connect: %d", resp.StatusCode)
	}
	id := out.Connection.ID
	r := h.api("PATCH", "/api/v1/calendar-sync/connections/"+id, map[string]any{"target": cal.CalendarURL("work"), "read": []string{cal.CalendarURL("home")}, "edit_events": true}, full)
	r.Body.Close()
	r = h.api("POST", "/api/v1/calendar-sync/connections/"+id+"/sync", nil, full)
	r.Body.Close()
	h.setToken(full)
	return h, cal, func() { h.api("POST", "/api/v1/calendar-sync/connections/"+id+"/sync", nil, full).Body.Close() }
}

func TestCalendarCommands(t *testing.T) {
	h, cal, sync := calendarHarness(t)
	out := h.mustRun("calendar")
	if !strings.Contains(out, "Standup") || !strings.Contains(out, "editable") || !strings.Contains(out, "09:00-09:30") {
		t.Fatalf("list = %s", out)
	}
	var list []map[string]any
	if err := json.Unmarshal([]byte(h.mustRun("calendar", "events", "--json")), &list); err != nil || len(list) != 1 {
		t.Fatalf("--json = %v %v", list, err)
	}
	id := list[0]["id"].(string)
	day := fixedNow.AddDate(0, 0, 2).Format("2006-01-02")
	// A new start alone keeps the length and the zone.
	out = h.mustRun("calendar", "event", "edit", id[:8], "--start", day+"T14:00")
	if !strings.Contains(out, "14:00-14:30") {
		t.Fatalf("edit = %s", out)
	}
	stamp := strings.ReplaceAll(day, "-", "")
	if data := cal.Get("home", "standup.ics"); !strings.Contains(data, "DTSTART;TZID=Europe/Berlin:"+stamp+"T140000") || !strings.Contains(data, "DTEND;TZID=Europe/Berlin:"+stamp+"T143000") {
		t.Fatalf("calendar = %s", data)
	}
	// Changed in the calendar app since: event_changed exits 1.
	list = nil
	_ = json.Unmarshal([]byte(h.mustRun("calendar", "events", "--json")), &list)
	id = list[0]["id"].(string)
	cal.Put("home", "standup.ics", strings.Replace(cal.Get("home", "standup.ics"), "Standup", "Elsewhere", 1))
	if code, _, errb := h.run("calendar", "event", "edit", id[:8], "--title", "Planning"); code != ExitServer || !strings.Contains(errb, "changed in your calendar") {
		t.Fatalf("stale = %d %s", code, errb)
	}
	// A dry run plans the request and sends nothing.
	sync()
	list = nil
	_ = json.Unmarshal([]byte(h.mustRun("calendar", "events", "--json")), &list)
	id = list[0]["id"].(string)
	h.requestLog()
	plan := h.mustRun("calendar", "event", "delete", id[:8], "--dry-run", "--json")
	if w := writesIn(h.requestLog()); len(w) != 0 || !strings.Contains(plan, "DELETE") {
		t.Fatalf("dry run = %s, writes %v", plan, w)
	}
	plan = h.mustRun("calendar", "event", "edit", id[:8], "--title", "x", "--dry-run", "--json")
	if !strings.Contains(plan, "PATCH") || cal.Get("home", "standup.ics") == "" {
		t.Fatalf("dry edit = %s", plan)
	}
	h.mustRun("calendar", "event", "delete", id[:8], "--yes")
	if cal.Get("home", "standup.ics") != "" {
		t.Fatal("not deleted")
	}
}

func TestCalendarCommandExitCodes(t *testing.T) {
	h, _, _ := calendarHarness(t)
	var list []map[string]any
	_ = json.Unmarshal([]byte(h.mustRun("calendar", "events", "--json")), &list)
	id := list[0]["id"].(string)
	_, read := h.apiToken2("read")
	h.setToken(read)
	h.requestLog()
	if code, _, errb := h.run("calendar", "event", "delete", id[:8], "--yes"); code != ExitNotPermitted || !strings.Contains(errb, "read-only") {
		t.Fatalf("read token = %d %s", code, errb)
	}
	if w := writesIn(h.requestLog()); len(w) != 0 {
		t.Fatal("a read token's delete was sent")
	}
	h.setToken("ot_wrong")
	if code, _, _ := h.run("calendar"); code != ExitAuth {
		t.Fatalf("rejected token = %d", code)
	}
	delete(h.env, "OPENTODO_TOKEN")
	delete(h.env, "OPENTODO_URL")
	if code, _, _ := h.run("calendar"); code != ExitAuth && code != ExitUsage {
		t.Fatalf("no login = %d", code)
	}
}

// Completion goes one level deeper for ot calendar event edit|delete.
func TestCalendarCompletion(t *testing.T) {
	h := &harness{t: t, env: map[string]string{}}
	if _, subs, _ := h.completeLine("calendar", ""); !contains(subs, "events") || !contains(subs, "event") || contains(subs, "event edit") {
		t.Fatalf("calendar = %v", subs)
	}
	if _, subs, _ := h.completeLine("calendar", "event", ""); !contains(subs, "edit") || !contains(subs, "delete") {
		t.Fatalf("calendar event = %v", subs)
	}
	if _, flags, _ := h.completeLine("calendar", "event", "edit", "--"); !contains(flags, "--title") || !contains(flags, "--all-day") {
		t.Fatalf("flags = %v", flags)
	}
}
