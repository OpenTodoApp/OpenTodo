package httpapi

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/calsync/calsynctest"
)

// Event edits over HTTP (OpenSpec change calendar-event-edits, tasks 3.1–3.4).

type eventEnv struct {
	*env
	srv  *Server
	cal  *calsynctest.Server
	id   string // the connection
	day  string // tomorrow, YYYY-MM-DD
	path string // the connection's events base
}

func newEventEnv(t *testing.T) *eventEnv {
	t.Helper()
	e, srv := calsyncEnv(t)
	calsyncOn(t, e)
	allowPrivateTargets(t, e)
	cal := calsynctest.New()
	t.Cleanup(cal.Close)
	cal.Addresses = []string{"mailto:me@example.org"}
	cal.AddCalendar("home", &calsynctest.Calendar{Name: "Home"})
	resp, out := e.do("POST", "/api/v1/calendar-sync/connections", map[string]any{"server_url": cal.URL, "username": "me", "password": "app-pass"})
	e.mustStatus(resp, 201, out)
	id := connOf(out)["id"].(string)
	resp, out = e.do("PATCH", "/api/v1/calendar-sync/connections/"+id, map[string]any{"target": cal.CalendarURL("work"), "read": []string{cal.CalendarURL("home")}})
	e.mustStatus(resp, 200, out)
	ee := &eventEnv{env: e, srv: srv, cal: cal, id: id, day: time.Now().AddDate(0, 0, 1).Format("2006-01-02"), path: "/api/v1/calendar-sync/connections/" + id + "/events/"}
	ee.put("standup.ics", "UID:standup\r\nSUMMARY:Standup")
	return ee
}

// put stores an event of tomorrow 09:00–09:30 UTC in "home" (extra holds UID
// and other properties) and syncs.
func (e *eventEnv) put(member, extra string) {
	e.t.Helper()
	stamp := strings.ReplaceAll(e.day, "-", "")
	e.cal.Put("home", member, "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\n"+extra+"\r\nDTSTART:"+stamp+"T090000Z\r\nDTEND:"+stamp+"T093000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n")
	resp, out := e.do("POST", "/api/v1/calendar-sync/connections/"+e.id+"/sync", nil)
	e.mustStatus(resp, 200, out)
}

func (e *eventEnv) setOptions(body map[string]any) map[string]any {
	e.t.Helper()
	resp, out := e.do("PATCH", "/api/v1/calendar-sync/connections/"+e.id, body)
	e.mustStatus(resp, 200, out)
	return connOf(out)
}

// event is the served event with summary, and the events route's answer.
func (e *eventEnv) event(summary string) (map[string]any, map[string]any) {
	e.t.Helper()
	resp, out := e.do("GET", "/api/v1/calendar-feeds/events?from="+e.day+"&to="+e.day, nil)
	e.mustStatus(resp, 200, out)
	for _, x := range out["events"].([]any) {
		if ev := x.(map[string]any); ev["summary"] == summary {
			return ev, out
		}
	}
	e.t.Fatalf("no event %q in %v", summary, out)
	return nil, nil
}

func (e *eventEnv) token(body map[string]any) string {
	e.t.Helper()
	resp, out := e.do("POST", "/api/v1/tokens", body)
	e.mustStatus(resp, 201, out)
	return out["secret"].(string)
}

func TestCalendarEventOptions(t *testing.T) {
	e := newEventEnv(t)
	c := e.setOptions(map[string]any{})
	if c["edit_events"] != false || c["assistant_edits"] != false {
		t.Fatalf("defaults = %v", c)
	}
	cals := c["calendars"].([]any)
	if caps, _ := cals[0].(map[string]any)["caps"].(map[string]any); caps["update"] != true {
		t.Fatalf("caps = %v", cals)
	}
	ev, _ := e.event("Standup")
	if acc := ev["access"].(map[string]any); acc["update"] != false || acc["reason"] != "edits_off" {
		t.Fatalf("access with edits off = %v", acc)
	}
	if resp, out := e.do("PATCH", "/api/v1/calendar-sync/connections/"+e.id, map[string]any{"assistant_edits": true}); resp.StatusCode != 400 || errField(out) != "assistant_edits" {
		t.Fatalf("assistants before edits = %d %v", resp.StatusCode, out)
	}
	if resp, out := e.do("PATCH", "/api/v1/calendar-sync/connections/"+e.id, map[string]any{"edit_events": "yes"}); resp.StatusCode != 400 || errCode(out) != "invalid_input" {
		t.Fatalf("wrong type = %d %v", resp.StatusCode, out)
	}
	if c = e.setOptions(map[string]any{"edit_events": true, "assistant_edits": true}); c["edit_events"] != true || c["assistant_edits"] != true {
		t.Fatalf("on = %v", c)
	}
	var n int
	e.db.QueryRow(`SELECT COUNT(*) FROM audit_events WHERE name = 'calendar_connection.updated' AND details LIKE '%edit_events%' AND details LIKE '%assistant_edits%'`).Scan(&n)
	if n != 1 {
		t.Fatalf("%d audit events naming the options", n)
	}
	ev, out := e.event("Standup")
	if acc := ev["access"].(map[string]any); acc["update"] != true || acc["delete"] != true || ev["rev"] == "" {
		t.Fatalf("editable = %v", ev)
	}
	sub := out["subscriptions"].([]any)[0].(map[string]any)
	for _, k := range []string{"connectionId", "calendarUrl", "caps", "editEvents"} {
		if sub[k] == nil {
			t.Fatalf("subscription without %s: %v", k, sub)
		}
	}
	if c = e.setOptions(map[string]any{"edit_events": false}); c["edit_events"] != false || c["assistant_edits"] != false {
		t.Fatalf("off turns both off = %v", c)
	}
	m, _ := e.member("other@example.com", "198.51.100.40")
	if resp, _ := m.do("PATCH", "/api/v1/calendar-sync/connections/"+e.id, map[string]any{"edit_events": true}); resp.StatusCode != 404 {
		t.Fatalf("another user's connection = %d", resp.StatusCode)
	}
	if resp, out := newClientAt(e.env, "10.9.9.12").do("PATCH", "/api/v1/calendar-sync/connections/"+e.id, map[string]any{"edit_events": true}); resp.StatusCode != 401 || errCode(out) != "unauthorized" {
		t.Fatalf("anonymous = %d %v", resp.StatusCode, out)
	}
}

func TestCalendarEventPatchAndDelete(t *testing.T) {
	e := newEventEnv(t)
	e.setOptions(map[string]any{"edit_events": true})
	ev, _ := e.event("Standup")
	nine := "10:00"
	half := "10:30"
	utc := "UTC"
	body := map[string]any{"rev": ev["rev"], "start": map[string]any{"date": e.day, "time": nine, "tz": utc}, "end": map[string]any{"date": e.day, "time": half, "tz": utc}}
	resp, out := e.do("PATCH", e.path+ev["id"].(string), body)
	e.mustStatus(resp, 200, out)
	moved := out["event"].(map[string]any)
	if out["replaces"] != ev["id"] || moved["id"] == ev["id"] || moved["rev"] == ev["rev"] || moved["start"].(map[string]any)["time"] != "10:00" {
		t.Fatalf("patch = %v", out)
	}
	stamp := strings.ReplaceAll(e.day, "-", "")
	if !strings.Contains(e.cal.Get("home", "standup.ics"), "DTSTART:"+stamp+"T100000Z") {
		t.Fatalf("calendar = %s", e.cal.Get("home", "standup.ics"))
	}
	var n int
	e.db.QueryRow(`SELECT COUNT(*) FROM audit_events WHERE name = 'calendar_event.changed' AND details LIKE '%"event_action":"updated"%' AND details NOT LIKE '%Standup%'`).Scan(&n)
	if n != 1 {
		t.Fatalf("%d calendar_event.changed events", n)
	}
	// The old rev is stale now: 409 without contacting the calendar.
	gets := e.cal.Count("GET")
	body["rev"] = ev["rev"]
	if resp, out := e.do("PATCH", e.path+moved["id"].(string), body); resp.StatusCode != 409 || errCode(out) != "event_changed" || e.cal.Count("GET") != gets {
		t.Fatalf("stale = %d %v", resp.StatusCode, out)
	}
	if resp, out := e.do("DELETE", e.path+moved["id"].(string), nil); resp.StatusCode != 400 || errField(out) != "rev" {
		t.Fatalf("delete without rev = %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("DELETE", e.path+moved["id"].(string)+"?rev="+moved["rev"].(string), nil)
	e.mustStatus(resp, 204, out)
	if e.cal.Get("home", "standup.ics") != "" {
		t.Fatal("not deleted")
	}
	e.db.QueryRow(`SELECT COUNT(*) FROM audit_events WHERE name = 'calendar_event.changed' AND details LIKE '%"event_action":"deleted"%'`).Scan(&n)
	if n != 1 {
		t.Fatalf("%d delete events", n)
	}
	if resp, out := e.do("POST", e.path+moved["id"].(string)+"/undo", nil); resp.StatusCode != 404 || errCode(out) != "not_found" {
		t.Fatalf("undo without an undo = %d %v", resp.StatusCode, out)
	}
}

func TestCalendarEventErrors(t *testing.T) {
	e := newEventEnv(t)
	e.put("weekly.ics", "UID:weekly\r\nSUMMARY:Weekly\r\nRRULE:FREQ=WEEKLY;COUNT=2")
	e.put("boss.ics", "UID:boss\r\nSUMMARY:Boss\r\nORGANIZER:mailto:boss@example.org")
	ev, _ := e.event("Standup")
	id, rev := ev["id"].(string), ev["rev"].(string)
	name := map[string]any{"rev": rev, "summary": "Planning"}
	if resp, out := e.do("PATCH", e.path+id, name); resp.StatusCode != 403 || errCode(out) != "event_edits_off" {
		t.Fatalf("edits off = %d %v", resp.StatusCode, out)
	}
	e.setOptions(map[string]any{"edit_events": true})
	ev, _ = e.event("Standup")
	rev = ev["rev"].(string)
	d := e.day
	for _, tc := range []struct {
		body  map[string]any
		field string
	}{
		{map[string]any{"rev": rev, "start": map[string]any{"date": d, "time": "10:00"}}, "end"},
		{map[string]any{"rev": rev, "start": map[string]any{"date": d, "time": "10:00"}, "end": map[string]any{"date": d, "time": "09:00"}}, "start"},
		{map[string]any{"rev": rev, "start": map[string]any{"date": d, "time": "10:00", "tz": "Mars/Base"}, "end": map[string]any{"date": d, "time": "11:00", "tz": "Mars/Base"}}, "start"},
		{map[string]any{"rev": rev, "start": map[string]any{"date": d, "time": "25:00"}, "end": map[string]any{"date": d, "time": "26:00"}}, "start"},
		{map[string]any{"rev": rev, "summary": " \r\n"}, "summary"},
		{map[string]any{"rev": rev, "summary": strings.Repeat("a", 501)}, "summary"},
		{map[string]any{"rev": rev}, "summary"},
		{map[string]any{"summary": "x"}, "rev"},
	} {
		if resp, out := e.do("PATCH", e.path+id, tc.body); resp.StatusCode != 400 || errCode(out) != "invalid_input" || errField(out) != tc.field {
			t.Errorf("%v = %d %v", tc.body, resp.StatusCode, out)
		}
	}
	if resp, out := e.do("PATCH", e.path+id, map[string]any{"rev": rev, "summary": "x", "color": "red"}); resp.StatusCode != 400 {
		t.Fatalf("unknown member = %d %v", resp.StatusCode, out)
	}
	if resp, out := e.do("PATCH", e.path+id, map[string]any{"rev": rev, "summary": strings.Repeat("a", 5000)}); resp.StatusCode != 413 || errCode(out) != "too_large" {
		t.Fatalf("large body = %d %v", resp.StatusCode, out)
	}
	if resp, out := e.do("PATCH", e.path+"nope", name); resp.StatusCode != 404 || errCode(out) != "not_found" {
		t.Fatalf("unknown = %d %v", resp.StatusCode, out)
	}
	weekly, _ := e.event("Weekly")
	if resp, out := e.do("PATCH", e.path+weekly["id"].(string), map[string]any{"rev": weekly["rev"], "summary": "x"}); resp.StatusCode != 422 || errCode(out) != "event_not_editable" || !strings.Contains(out["error"].(map[string]any)["message"].(string), "recurring") {
		t.Fatalf("weekly = %d %v", resp.StatusCode, out)
	}
	boss, _ := e.event("Boss")
	if resp, out := e.do("DELETE", e.path+boss["id"].(string)+"?rev="+boss["rev"].(string), nil); resp.StatusCode != 422 || !strings.Contains(out["error"].(map[string]any)["message"].(string), "not_organizer") {
		t.Fatalf("boss = %d %v", resp.StatusCode, out)
	}
	// A redirect answer to the write is not followed.
	e.cal.RedirectNext("PUT", http.StatusTemporaryRedirect, "")
	name["rev"] = rev
	if resp, out := e.do("PATCH", e.path+id, name); resp.StatusCode != 502 || errCode(out) != "calendar_unreachable" || !strings.Contains(out["error"].(map[string]any)["message"].(string), "redirect_refused") {
		t.Fatalf("redirect = %d %v", resp.StatusCode, out)
	}
	// Deleted in the calendar app: 404 event_gone and the row is dropped.
	e.cal.Delete("home", "standup.ics")
	if resp, out := e.do("PATCH", e.path+id, name); resp.StatusCode != 404 || errCode(out) != "event_gone" {
		t.Fatalf("gone = %d %v", resp.StatusCode, out)
	}
	// Calendar sync off: every route is 404 calendar_sync_disabled.
	resp, out := e.do("PUT", "/api/v1/settings/calendar-sync", map[string]any{"enabled": false})
	e.mustStatus(resp, 200, out)
	if resp, out := e.do("PATCH", e.path+id, name); resp.StatusCode != 404 || errCode(out) != "calendar_sync_disabled" {
		t.Fatalf("switch off = %d %v", resp.StatusCode, out)
	}
}

func TestCalendarEventAuthorization(t *testing.T) {
	e := newEventEnv(t)
	e.setOptions(map[string]any{"edit_events": true})
	ev, _ := e.event("Standup")
	id, rev := ev["id"].(string), ev["rev"].(string)
	resp, out := e.do("POST", "/api/v1/workspaces", map[string]any{"name": "Work"})
	e.mustStatus(resp, 201, out)
	work := out["id"].(string)
	limited := e.token(map[string]any{"name": "Work only", "scope": "full", "workspaces": []string{work}})
	read := e.token(map[string]any{"name": "Reader", "scope": "read"})
	agent := e.token(map[string]any{"name": "Assistant", "scope": "agent"})
	c := e.bearerClient()
	before := e.cal.Count("GET") + e.cal.Count("PUT")
	routes := [][2]string{{"PATCH", e.path + id}, {"DELETE", e.path + id + "?rev=" + rev}, {"POST", e.path + id + "/undo"}}
	for _, r := range routes {
		if resp, out := newClientAt(e.env, "10.9.9.13").do(r[0], r[1], map[string]any{"rev": rev, "summary": "x"}); resp.StatusCode != 401 || errCode(out) != "unauthorized" {
			t.Errorf("anonymous %s = %d %v", r[0], resp.StatusCode, out)
		}
		if resp, out := c.do(r[0], r[1], map[string]any{"rev": rev, "summary": "x"}, bearer(limited)...); resp.StatusCode != 403 || errCode(out) != "token_restricted" {
			t.Errorf("limited %s = %d %v", r[0], resp.StatusCode, out)
		}
		for _, secret := range []string{read, agent} {
			if resp, out := c.do(r[0], r[1], map[string]any{"rev": rev, "summary": "x"}, bearer(secret)...); resp.StatusCode != 403 {
				t.Errorf("%s token %s = %d %v", secret[:4], r[0], resp.StatusCode, out)
			}
		}
	}
	if resp, out := c.do("GET", "/api/v1/calendar-feeds/events?from="+e.day+"&to="+e.day, nil, bearer(limited)...); resp.StatusCode != 403 || errCode(out) != "token_restricted" {
		t.Fatalf("limited events route = %d %v", resp.StatusCode, out)
	}
	if after := e.cal.Count("GET") + e.cal.Count("PUT"); after != before {
		t.Fatalf("a refused request contacted the calendar (%d -> %d)", before, after)
	}
	m, _ := e.member("other2@example.com", "198.51.100.41")
	if resp, out := m.do("PATCH", e.path+id, map[string]any{"rev": rev, "summary": "x"}); resp.StatusCode != 404 || errCode(out) != "not_found" {
		t.Fatalf("another user's event = %d %v", resp.StatusCode, out)
	}
	// The rate limit: more than the limiter allows is 429.
	e.srv.calsyncEventLimiter = newRateLimiter(1, time.Hour)
	full := e.token(map[string]any{"name": "Script", "scope": "full"})
	if resp, out := c.do("PATCH", e.path+"nope", map[string]any{"rev": rev, "summary": "x"}, bearer(full)...); resp.StatusCode != 404 {
		t.Fatalf("first = %d %v", resp.StatusCode, out)
	}
	if resp, out := c.do("PATCH", e.path+id, map[string]any{"rev": rev, "summary": "x"}, bearer(full)...); resp.StatusCode != 429 || errCode(out) != "rate_limited" {
		t.Fatalf("second = %d %v", resp.StatusCode, out)
	}
}

func errField(out map[string]any) any {
	e, _ := out["error"].(map[string]any)
	return e["field"]
}
