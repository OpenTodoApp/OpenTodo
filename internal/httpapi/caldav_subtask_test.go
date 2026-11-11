package httpapi

import (
	"net/http"
	"strings"
	"testing"
)

// OpenSpec change caldav-verified, "Subtask hierarchy with real clients" (task
// 2.3): subtasks round-trip three levels deep, the way Tasks.org (through
// DAVx⁵) and jtx Board write them.

// tasksOrgBody is a VTODO shaped as DAVx⁵ uploads one from Tasks.org: the
// ical4android PRODID, a typed RELATED-TO for the parent.
func tasksOrgBody(uid, title, parentLine string) string {
	lines := []string{"BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:+//IDN bitfire.at//ical4android (org.tasks)", "BEGIN:VTODO",
		"DTSTAMP:20261111T090000Z", "UID:" + uid, "CREATED:20261111T090000Z", "LAST-MODIFIED:20261111T090000Z", "SUMMARY:" + title}
	if parentLine != "" {
		lines = append(lines, parentLine)
	}
	lines = append(lines, "STATUS:NEEDS-ACTION", "END:VTODO", "END:VCALENDAR")
	return strings.Join(lines, "\r\n") + "\r\n"
}

func TestSubtaskThreeLevelsFromTasksOrg(t *testing.T) {
	e, c := davSetup(t)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Errands"})
	e.mustStatus(resp, 201, out)
	pid := out["id"].(string)
	c.must("PUT", c.cal(pid)+"1001.ics", tasksOrgBody("1001", "Trip", ""), 201, "If-None-Match", "*")
	c.must("PUT", c.cal(pid)+"1002.ics", tasksOrgBody("1002", "Pack", "RELATED-TO;RELTYPE=PARENT:1001"), 201, "If-None-Match", "*")
	// jtx Board and older clients write the relation untyped (RFC 5545: PARENT is the default).
	c.must("PUT", c.cal(pid)+"1003.ics", tasksOrgBody("1003", "Socks", "RELATED-TO:1002"), 201, "If-None-Match", "*")
	for id, parent := range map[string]any{"1001": nil, "1002": "1001", "1003": "1002"} {
		got := e.task(id)
		if got["parent_id"] != parent || got["project_id"] != pid {
			t.Errorf("%s: parent %v project %v, want parent %v in %s", id, got["parent_id"], got["project_id"], parent, pid)
		}
		if got["ical_extra"] != nil {
			t.Errorf("%s: the relation was kept as client data: %v", id, got["ical_extra"])
		}
	}
	// A child uploaded before its parent is kept as client data, and resolved
	// once the parent arrives and the child is written again.
	c.must("PUT", c.cal(pid)+"2002.ics", tasksOrgBody("2002", "Early child", "RELATED-TO;RELTYPE=PARENT:2001"), 201, "If-None-Match", "*")
	if got := e.task("2002"); got["parent_id"] != nil || !strings.Contains(asString(got["ical_extra"]), "RELATED-TO:2001") {
		t.Fatalf("early child: %v", got)
	}
	c.must("PUT", c.cal(pid)+"2001.ics", tasksOrgBody("2001", "Late parent", ""), 201, "If-None-Match", "*")
	c.must("PUT", c.cal(pid)+"2002.ics", tasksOrgBody("2002", "Early child", "RELATED-TO;RELTYPE=PARENT:2001"), 204)
	if got := e.task("2002"); got["parent_id"] != "2001" || strings.Contains(asString(got["ical_extra"]), "RELATED-TO") {
		t.Fatalf("resolved child: %v", got)
	}
}

func TestSubtaskThreeLevelsServed(t *testing.T) {
	e, c := davSetup(t)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Trip"})
	e.mustStatus(resp, 201, out)
	pid := out["id"].(string)
	create := func(title string, parent any) string {
		resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": title, "project_id": pid, "parent_id": parent})
		e.mustStatus(resp, 201, out)
		return out["id"].(string)
	}
	root := create("Trip", nil)
	pack := create("Pack", root)
	book := create("Book flights", root)
	socks := create("Socks", pack)
	for id, parent := range map[string]string{root: "", pack: root, book: root, socks: pack} {
		_, ics := c.must("GET", c.cal(pid)+id+".ics", "", 200)
		n := strings.Count(ics, "RELATED-TO")
		switch {
		case parent == "" && n != 0:
			t.Errorf("top-level task served with a relation:\n%s", ics)
		case parent != "" && (n != 1 || !strings.Contains(ics, "\r\nRELATED-TO:"+parent+"\r\n")):
			t.Errorf("%s: want one untyped RELATED-TO:%s\n%s", id, parent, ics)
		}
	}
	// What the client stores is what it sends back: a round trip changes nothing.
	_, ics := c.must("GET", c.cal(pid)+socks+".ics", "", 200)
	c.must("PUT", c.cal(pid)+socks+".ics", ics, 204)
	if got := e.task(socks); got["parent_id"] != pack || got["ical_extra"] != nil {
		t.Fatalf("round trip: %v", got)
	}
}

// TestSubtaskParentInAnotherCalendar pins today's behaviour of a RELATED-TO
// naming a task of another calendar of the same account: the relation is
// resolved anywhere in the app password's scope, so the task becomes that
// task's subtask. The change's spec asks instead that such a relation be kept
// in ical_extra with parent_id unchanged; that difference is recorded as a
// finding of the verification run (tasks.md 2.3, 3.5) and fixed in its own
// change, which turns this test around.
func TestSubtaskParentInAnotherCalendar(t *testing.T) {
	e, c := davSetup(t)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Home"})
	e.mustStatus(resp, 201, out)
	home := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Work"})
	e.mustStatus(resp, 201, out)
	work := out["id"].(string)
	c.must("PUT", c.cal(home)+"h1.ics", tasksOrgBody("h1", "Home parent", ""), 201, "If-None-Match", "*")
	c.must("PUT", c.cal(work)+"w1.ics", tasksOrgBody("w1", "Work child", "RELATED-TO;RELTYPE=PARENT:h1"), 201, "If-None-Match", "*")
	got := e.task("w1")
	if got["parent_id"] != "h1" {
		t.Fatalf("cross-calendar parent: %v", got)
	}
	t.Logf("cross-calendar RELATED-TO: parent_id=%v project_id=%v (spec: kept in ical_extra, parent_id unchanged)", got["parent_id"], got["project_id"])
}

// TestSubtaskParentMovedByClient: a client moves a parent by writing it into
// another calendar under the same UID (DAVx⁵ uploads it there, then deletes
// the old resource). The parent moves and the old resource's DELETE does not
// delete it. Its subtasks keep their parent but stay where they were: the
// change's spec asks that they move with it, as a move in the app does. Like
// the cross-calendar parent above, this pins today's behaviour and is recorded
// as a finding (tasks.md 2.3, 3.5) for its own change to turn around.
func TestSubtaskParentMovedByClient(t *testing.T) {
	e, c := davSetup(t)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Home"})
	e.mustStatus(resp, 201, out)
	home := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Work"})
	e.mustStatus(resp, 201, out)
	work := out["id"].(string)
	c.must("PUT", c.cal(home)+"m1.ics", tasksOrgBody("m1", "Parent", ""), 201, "If-None-Match", "*")
	c.must("PUT", c.cal(home)+"m2.ics", tasksOrgBody("m2", "Child", "RELATED-TO;RELTYPE=PARENT:m1"), 201, "If-None-Match", "*")
	c.must("PUT", c.cal(home)+"m3.ics", tasksOrgBody("m3", "Grandchild", "RELATED-TO;RELTYPE=PARENT:m2"), 201, "If-None-Match", "*")
	c.must("PUT", c.cal(work)+"m1.ics", tasksOrgBody("m1", "Parent", ""), 204, "If-None-Match", "*")
	c.req("DELETE", c.cal(home)+"m1.ics", "")
	want := map[string][2]any{"m1": {work, nil}, "m2": {home, "m1"}, "m3": {home, "m2"}}
	for id, w := range want {
		got := e.task(id)
		if got["project_id"] != w[0] || got["parent_id"] != w[1] || got["deleted_at"] != nil {
			t.Errorf("%s after the move: project %v parent %v deleted %v, want %v under %v", id, got["project_id"], got["parent_id"], got["deleted_at"], w[0], w[1])
		}
	}
	t.Log("parent moved by a client: its subtasks stay in the old calendar (spec: they move with it)")
}

func TestSubtaskWriteWithoutCredentials(t *testing.T) {
	e, c := davSetup(t)
	c.must("PUT", c.cal("inbox")+"p.ics", tasksOrgBody("p", "Parent", ""), 201, "If-None-Match", "*")
	body := tasksOrgBody("p", "Parent renamed", "RELATED-TO;RELTYPE=PARENT:x")
	for _, auth := range []func(*http.Request){
		func(*http.Request) {},
		func(r *http.Request) { r.SetBasicAuth("owner@example.com", "wrong-app-password") },
		func(r *http.Request) { r.SetBasicAuth("owner@example.com", davPassword) }, // the account password is not an app password
	} {
		req, _ := http.NewRequest("PUT", e.srv.URL+c.cal("inbox")+"q.ics", strings.NewReader(tasksOrgBody("q", "Child", "RELATED-TO;RELTYPE=PARENT:p")))
		req.Header.Set("Content-Type", "text/calendar; charset=utf-8")
		auth(req)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("status %d, want 401", resp.StatusCode)
		}
		req, _ = http.NewRequest("PUT", e.srv.URL+c.cal("inbox")+"p.ics", strings.NewReader(body))
		auth(req)
		if resp, err = http.DefaultClient.Do(req); err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("status %d, want 401", resp.StatusCode)
		}
	}
	if resp, _ := e.do("GET", "/api/v1/tasks/q", nil); resp.StatusCode != http.StatusNotFound {
		t.Fatalf("a task was created without credentials: %d", resp.StatusCode)
	}
	if got := e.task("p"); got["title"] != "Parent" || got["parent_id"] != nil || got["ical_extra"] != nil {
		t.Fatalf("the task changed without credentials: %v", got)
	}
}
