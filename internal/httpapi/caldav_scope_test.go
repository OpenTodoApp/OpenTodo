package httpapi

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/calsync/calsynctest"
)

// CalDAV app passwords with a scope (OpenSpec change sync-scope).
func TestCalDAVScopedAppPassword(t *testing.T) {
	e, all := davSetup(t)
	uid := all.uid
	resp, out := e.do("POST", "/api/v1/workspaces", map[string]any{"name": "Work"})
	e.mustStatus(resp, 201, out)
	work := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Garden"})
	e.mustStatus(resp, 201, out)
	garden := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Website", "workspace_id": work})
	e.mustStatus(resp, 201, out)
	website := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Prune roses", "project_id": garden})
	e.mustStatus(resp, 201, out)
	rose := out["id"].(string)

	// A scope of one workspace: its projects and its Inbox only.
	resp, out = e.do("POST", "/api/v1/app-passwords", map[string]any{"name": "Work phone", "scope": map[string]any{"mode": "only", "workspaces": []string{work}}})
	e.mustStatus(resp, 201, out)
	ap := out["appPassword"].(map[string]any)
	if s := ap["scope"].(map[string]any); s["mode"] != "only" {
		t.Fatalf("scope = %v", s)
	}
	c := &davClient{e: e, email: "owner@example.com", secret: out["secret"].(string), uid: uid}
	_, body := c.must("PROPFIND", "/dav/calendars/"+uid+"/", propfindCalendars, 207, "Depth", "1")
	for _, want := range []string{c.cal("inbox-" + work), c.cal(website)} {
		if !strings.Contains(body, want) {
			t.Fatalf("listing lacks %q:\n%s", want, body)
		}
	}
	for _, not := range []string{c.cal("inbox"), c.cal(garden)} {
		if strings.Contains(body, not) {
			t.Fatalf("listing has %q:\n%s", not, body)
		}
	}
	// Outside the scope nothing is read or written.
	c.must("PROPFIND", c.cal(garden), propfindCalendars, 404, "Depth", "1")
	c.must("GET", c.cal(garden)+rose+".ics", "", 404)
	c.must("DELETE", c.cal(garden)+rose+".ics", "", 404)
	c.must("PUT", c.cal(garden)+"new.ics", vtodoBody("new", "SUMMARY:x"), 409)
	c.must("REPORT", c.cal(garden), fmt.Sprintf(syncReport, ""), 404, "Depth", "1")
	// The UID of a task outside the scope does not move it here.
	c.must("PUT", c.cal(website)+rose+".ics", vtodoBody(rose, "SUMMARY:Taken over"), 201)
	if tk := e.task(rose); tk["project_id"] != garden || tk["title"] != "Prune roses" || tk["deleted_at"] != nil {
		t.Fatalf("task outside the scope changed: %v", tk)
	}
	// A new calendar goes into the scope's workspace.
	c.must("MKCALENDAR", c.cal("clients"), "", 201)
	resp, out = e.do("GET", "/api/v1/projects/clients", nil)
	e.mustStatus(resp, 200, out)
	if out["workspace_id"] != work {
		t.Fatalf("new calendar = %v", out)
	}

	// A task that leaves the scope is reported removed.
	c.must("PUT", c.cal("inbox-"+work)+"call.ics", vtodoBody("call", "SUMMARY:Call"), 201)
	_, body = c.must("REPORT", c.cal("inbox-"+work), fmt.Sprintf(syncReport, ""), 207, "Depth", "1")
	tok := tokenRe.FindStringSubmatch(body)[1]
	resp, out = e.do("PATCH", "/api/v1/tasks/call", map[string]any{"project_id": garden})
	e.mustStatus(resp, 200, out)
	_, body = c.must("REPORT", c.cal("inbox-"+work), fmt.Sprintf(syncReport, tok), 207, "Depth", "1")
	if !strings.Contains(body, "/call.ics</d:href><d:status>HTTP/1.1 404") {
		t.Fatalf("move out of the scope not reported:\n%s", body)
	}

	// A new scope applies to the next request: all but one project.
	id := ap["id"].(string)
	resp, out = e.do("PATCH", "/api/v1/app-passwords/"+id, map[string]any{"scope": map[string]any{"mode": "except", "projects": []string{website}}})
	e.mustStatus(resp, 200, out)
	_, body = c.must("PROPFIND", "/dav/calendars/"+uid+"/", propfindCalendars, 207, "Depth", "1")
	if strings.Contains(body, c.cal(website)) || !strings.Contains(body, c.cal(garden)) || !strings.Contains(body, c.cal("inbox")) {
		t.Fatalf("listing after the change:\n%s", body)
	}
	c.must("REPORT", c.cal(website), fmt.Sprintf(syncReport, tok), 404, "Depth", "1")
	// Everything again.
	resp, out = e.do("PATCH", "/api/v1/app-passwords/"+id, map[string]any{"scope": map[string]any{"mode": "all"}})
	e.mustStatus(resp, 200, out)
	c.must("PROPFIND", c.cal(website), propfindCalendars, 207, "Depth", "0")

	// Refused scopes and unknown passwords.
	for _, bad := range []map[string]any{{"mode": "some"}, {"mode": "only", "projects": []string{strings.Repeat("x", 65)}}, {}} {
		resp, out = e.do("PATCH", "/api/v1/app-passwords/"+id, map[string]any{"scope": bad})
		if resp.StatusCode != 400 || errCode(out) != "invalid_input" {
			t.Fatalf("scope %v = %d %v", bad, resp.StatusCode, out)
		}
	}
	if resp, out = e.do("PATCH", "/api/v1/app-passwords/"+id, map[string]any{}); resp.StatusCode != 400 {
		t.Fatalf("no scope = %d %v", resp.StatusCode, out)
	}
	if resp, out = e.do("PATCH", "/api/v1/app-passwords/nope", map[string]any{"scope": map[string]any{"mode": "all"}}); resp.StatusCode != 404 {
		t.Fatalf("unknown = %d %v", resp.StatusCode, out)
	}
	anon := newClientAt(e, "10.9.9.12")
	if resp, out = anon.do("PATCH", "/api/v1/app-passwords/"+id, map[string]any{"scope": map[string]any{"mode": "all"}}); resp.StatusCode != 401 {
		t.Fatalf("anonymous = %d %v", resp.StatusCode, out)
	}
}

// A task moved to another workspace's Inbox leaves the first Inbox's report.
func TestCalDAVInboxMoveReported(t *testing.T) {
	e, c := davSetup(t)
	resp, out := e.do("POST", "/api/v1/workspaces", map[string]any{"name": "Work"})
	e.mustStatus(resp, 201, out)
	work := out["id"].(string)
	c.must("PUT", c.cal("inbox")+"a.ics", vtodoBody("a", "SUMMARY:a"), 201)
	_, body := c.must("REPORT", c.cal("inbox"), fmt.Sprintf(syncReport, ""), 207, "Depth", "1")
	tok := tokenRe.FindStringSubmatch(body)[1]
	resp, out = e.do("PATCH", "/api/v1/tasks/a", map[string]any{"workspace_id": work})
	e.mustStatus(resp, 200, out)
	_, body = c.must("REPORT", c.cal("inbox"), fmt.Sprintf(syncReport, tok), 207, "Depth", "1")
	if !strings.Contains(body, "/a.ics</d:href><d:status>HTTP/1.1 404") {
		t.Fatalf("move not reported:\n%s", body)
	}
}

// A calendar sync connection with a scope writes the tasks of the chosen
// workspace, resolved like CalDAV's calendars (sync-scope).
func TestCalendarConnectionScope(t *testing.T) {
	e, _ := calsyncEnv(t)
	calsyncOn(t, e)
	allowPrivateTargets(t, e)
	cal := calsynctest.New()
	t.Cleanup(cal.Close)
	resp, out := e.do("POST", "/api/v1/calendar-sync/connections", map[string]any{"server_url": cal.URL, "username": "me", "password": "app-pass"})
	e.mustStatus(resp, 201, out)
	c := connOf(out)
	id := c["id"].(string)
	target := c["calendars"].([]any)[0].(map[string]any)["url"].(string)
	resp, out = e.do("POST", "/api/v1/workspaces", map[string]any{"name": "Work"})
	e.mustStatus(resp, 201, out)
	work := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Website", "workspace_id": work})
	e.mustStatus(resp, 201, out)
	website := out["id"].(string)
	tomorrow := time.Now().AddDate(0, 0, 1).Format("2006-01-02")
	at := map[string]any{"date": tomorrow, "time": "09:00"}
	ids := map[string]string{}
	for name, body := range map[string]map[string]any{
		"home":    {"title": "Home", "due": at},
		"site":    {"title": "Deploy", "due": at, "project_id": website},
		"workbox": {"title": "Call", "due": at, "workspace_id": work},
	} {
		resp, out = e.do("POST", "/api/v1/tasks", body)
		e.mustStatus(resp, 201, out)
		ids[name] = out["id"].(string)
	}
	if resp, out = e.do("PATCH", "/api/v1/calendar-sync/connections/"+id, map[string]any{"scope": map[string]any{"mode": "nope"}}); resp.StatusCode != 400 || errCode(out) != "invalid_input" {
		t.Fatalf("bad scope = %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("PATCH", "/api/v1/calendar-sync/connections/"+id, map[string]any{"target": target, "scope": map[string]any{"mode": "only", "workspaces": []string{work}}})
	e.mustStatus(resp, 200, out)
	if s := connOf(out)["scope"].(map[string]any); s["mode"] != "only" {
		t.Fatalf("scope = %v", s)
	}
	resp, out = e.do("POST", "/api/v1/calendar-sync/connections/"+id+"/sync", nil)
	e.mustStatus(resp, 200, out)
	if cal.Get("work", ids["site"]+".ics") == "" || cal.Get("work", ids["workbox"]+".ics") == "" || cal.Get("work", ids["home"]+".ics") != "" {
		t.Fatalf("members = %v", cal.Members("work"))
	}
	// Leaving Website out removes its event at the next cycle.
	resp, out = e.do("PATCH", "/api/v1/calendar-sync/connections/"+id, map[string]any{"scope": map[string]any{"mode": "only", "inboxes": []string{work}}})
	e.mustStatus(resp, 200, out)
	resp, out = e.do("POST", "/api/v1/calendar-sync/connections/"+id+"/sync", nil)
	e.mustStatus(resp, 200, out)
	if got := cal.Members("work"); len(got) != 1 || got[0] != ids["workbox"]+".ics" {
		t.Fatalf("members = %v", got)
	}
	var n int
	e.db.QueryRow(`SELECT COUNT(*) FROM audit_events WHERE name = 'calendar_connection.updated' AND details LIKE '%scope%'`).Scan(&n)
	if n != 2 {
		t.Fatalf("%d scope updates audited", n)
	}
}
