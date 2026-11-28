package httpapi

import (
	"context"
	"fmt"
	"html"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/auth"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// OpenSpec change caldav-verified, "Large-account budgets": a GET, a
// multiget, a sync-collection after a token and the listing of a project's
// calendar (PROPFIND Depth 1, calendar-query, the first sync-collection) read
// only the tasks they serve (davroutes narrow.go). The partial view must serve
// exactly what the whole view serves (davroutes SetWholeView): the same
// resources in the same order, with the same ETags and calendar data, with
// subtasks at every depth (in a project and in the Inbox), blockers, labels,
// reminders, a series with an exception and a resource the client named; for
// a member of a shared project, an event-mode app password, a task blocked by
// one in an archived project, and a calendar too large to read one by one.

var (
	hrefRe = regexp.MustCompile(`<d:href>([^<]*)</d:href>`)
	dataRe = regexp.MustCompile(`<c:calendar-data>([^<]*)</c:calendar-data>`)
)

// resource is one response of a multistatus.
type resource struct{ href, etag, data string }

// servedList is the responses of a multistatus, in order.
func servedList(t *testing.T, body string) []resource {
	t.Helper()
	var out []resource
	for _, r := range strings.Split(body, "<d:response>")[1:] {
		href := hrefRe.FindStringSubmatch(r)
		if href == nil {
			t.Fatalf("response without href: %s", r)
		}
		res := resource{href: href[1]}
		if m := etagRe.FindStringSubmatch(r); m != nil {
			res.etag = m[1]
		}
		if m := dataRe.FindStringSubmatch(r); m != nil {
			res.data = html.UnescapeString(m[1])
		}
		out = append(out, res)
	}
	return out
}

// served maps each href of a multistatus to its ETag and calendar data.
func served(t *testing.T, body string) map[string][2]string {
	t.Helper()
	out := map[string][2]string{}
	for _, r := range servedList(t, body) {
		out[r.href] = [2]string{r.etag, r.data}
	}
	return out
}

var listingNames = [3]string{"PROPFIND Depth 1", "calendar-query", "first sync-collection"}

// listings are a calendar's three listings, the calendar's own response left out.
func listings(t *testing.T, c *davClient, cal string) [3][]resource {
	t.Helper()
	var out [3][]resource
	_, body := c.must("PROPFIND", c.cal(cal), propfindEtags, 207, "Depth", "1")
	for _, r := range servedList(t, body) {
		if r.href != c.cal(cal) {
			out[0] = append(out[0], r)
		}
	}
	_, body = c.must("REPORT", c.cal(cal), queryAll, 207, "Depth", "1")
	out[1] = servedList(t, body)
	_, body = c.must("REPORT", c.cal(cal), fmt.Sprintf(syncReport, ""), 207, "Depth", "1")
	out[2] = servedList(t, body)
	return out
}

// hrefsOf is the hrefs of resources, in order.
func hrefsOf(rs []resource) []string {
	out := make([]string, len(rs))
	for i, r := range rs {
		out[i] = r.href
	}
	return out
}

// sameAsWholeView checks that the three listings of cal serve what they
// serve on the whole view, in the same order, and returns the whole view's
// calendar-query, which must list at least least resources.
func sameAsWholeView(t *testing.T, c *davClient, cal string, least int) []resource {
	t.Helper()
	got := listings(t, c, cal)
	c.e.server.dav.SetWholeView(true)
	want := listings(t, c, cal)
	c.e.server.dav.SetWholeView(false)
	for i, name := range listingNames {
		if fmt.Sprint(got[i]) != fmt.Sprint(want[i]) {
			t.Errorf("%s of %s: the partial view serves\n%v\nthe whole view\n%v", name, cal, hrefsOf(got[i]), hrefsOf(want[i]))
		}
	}
	if len(want[1]) < least {
		t.Fatalf("%s: the whole view lists %d resources, want at least %d", cal, len(want[1]), least)
	}
	return want[1]
}

func TestCalDAVPartialViewServesWhatTheWholeViewServes(t *testing.T) {
	e, c := davSetup(t)
	// The repeating task's dates below are fixed, so the server's today is too: on a
	// real clock the skip of 2026-11-14 stopped being an upcoming occurrence.
	e.now.Freeze(time.Date(2026, 11, 13, 12, 0, 0, 0, time.UTC))
	create := func(path string, body map[string]any) string {
		t.Helper()
		resp, out := e.do("POST", path, body)
		e.mustStatus(resp, 201, out)
		return out["id"].(string)
	}
	garden := create("/api/v1/projects", map[string]any{"name": "Garden"})
	label := create("/api/v1/labels", map[string]any{"name": "Outside", "color": "#64748b"})
	plan := create("/api/v1/tasks", map[string]any{"title": "Plan", "project_id": garden})
	dig := create("/api/v1/tasks", map[string]any{"title": "Dig", "project_id": garden, "parent_id": plan, "labels": []string{label}})
	create("/api/v1/tasks", map[string]any{"title": "Seeds", "project_id": garden, "parent_id": dig})
	create("/api/v1/tasks", map[string]any{"title": "Water", "project_id": garden, "blocked_by": []string{plan}})
	weed := create("/api/v1/tasks", map[string]any{"title": "Weed", "project_id": garden, "due": map[string]any{"date": "2026-11-12", "time": "08:00"}, "recurrence": "every day"})
	resp, out := e.do("POST", "/api/v1/tasks/"+weed+"/occurrences/2026-11-14/skip", nil)
	e.mustStatus(resp, 200, out)
	create("/api/v1/reminders", map[string]any{"task_id": plan, "fire_at": 1794211200000})
	call := create("/api/v1/tasks", map[string]any{"title": "Call"})
	create("/api/v1/tasks", map[string]any{"title": "Find the number", "parent_id": call})
	c.must("PUT", c.cal("inbox")+"named-by-client.ics", tasksOrgBody("client-uid-1", "Named", "RELATED-TO:"+call), 201, "If-None-Match", "*")

	for _, cal := range []string{garden, "inbox"} {
		whole := map[string][2]string{}
		for _, r := range sameAsWholeView(t, c, cal, 3) {
			whole[r.href] = [2]string{r.etag, r.data}
		}
		want := []string{"\r\nRELATED-TO:"}
		if cal == garden {
			want = append(want, "EXDATE", "BEGIN:VALARM", "CATEGORIES:Outside", "RELATED-TO;RELTYPE=DEPENDS-ON:"+plan)
		}
		for _, w := range want {
			if !strings.Contains(fmt.Sprint(whole), w) {
				t.Fatalf("%s: no resource carries %q", cal, w)
			}
		}
		var hrefs strings.Builder
		for href, w := range whole {
			resp, ics := c.must("GET", href, "", 200)
			if resp.Header.Get("ETag") != w[0] || ics != w[1] {
				t.Errorf("GET %s: ETag %s, want %s\n%s\nwant\n%s", href, resp.Header.Get("ETag"), w[0], ics, w[1])
			}
			fmt.Fprintf(&hrefs, "<d:href>%s</d:href>", href)
		}
		multiget := func(hrefs string) map[string][2]string {
			t.Helper()
			_, body := c.must("REPORT", c.cal(cal), `<?xml version="1.0"?><c:calendar-multiget xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop>`+
				hrefs+`</c:calendar-multiget>`, 207, "Depth", "1")
			got := served(t, body)
			for href, g := range got {
				if g[0] == "" {
					delete(got, href) // a name no task has
				}
			}
			return got
		}
		if got := multiget(hrefs.String()); fmt.Sprint(got) != fmt.Sprint(whole) {
			t.Errorf("%s: the multiget serves\n%v\nthe whole view\n%v", cal, got, whole)
		}
		// Every task changed since the first position of the log: the same
		// members (the other calendar's tasks are reported gone, as before).
		_, body := c.must("REPORT", c.cal(cal), fmt.Sprintf(syncReport, "urn:opentodo:sync:0"), 207, "Depth", "1")
		got := served(t, body)
		for href, g := range got {
			if g[0] == "" {
				delete(got, href)
			}
		}
		if len(got) != len(whole) {
			t.Errorf("%s: the sync-collection serves %d resources, the whole view %d\n%s", cal, len(got), len(whole), body)
		}
		for href, w := range whole {
			if got[href][0] != w[0] {
				t.Errorf("%s: sync-collection ETag of %s is %q, want %q", cal, href, got[href][0], w[0])
			}
		}
	}
}

func TestCalDAVPartialListingServesWhatTheWholeViewServes(t *testing.T) {
	e, c := davSetup(t)
	create := func(env *env, path string, body map[string]any) string {
		t.Helper()
		resp, out := env.do("POST", path, body)
		env.mustStatus(resp, 201, out)
		return out["id"].(string)
	}
	due := map[string]any{"date": "2026-11-20", "time": "09:00"}

	t.Run("a member of a shared project", func(t *testing.T) {
		team := create(e, "/api/v1/projects", map[string]any{"name": "Team"})
		private := create(e, "/api/v1/projects", map[string]any{"name": "Private"})
		secret := create(e, "/api/v1/tasks", map[string]any{"title": "Secret", "project_id": private})
		lead := create(e, "/api/v1/tasks", map[string]any{"title": "Lead", "project_id": team, "due": due})
		create(e, "/api/v1/tasks", map[string]any{"title": "Follow", "project_id": team, "parent_id": lead})
		create(e, "/api/v1/tasks", map[string]any{"title": "Waits", "project_id": team, "blocked_by": []string{lead, secret}})
		ctx := context.Background()
		a := auth.NewService(e.db, time.Hour, false)
		owner, err := a.UserByEmail(ctx, "owner@example.com")
		if err != nil {
			t.Fatal(err)
		}
		_, invite, err := a.CreateInvitation(ctx, owner, "member@example.com", 0)
		if err != nil {
			t.Fatal(err)
		}
		member, err := a.Register(ctx, "member@example.com", "Member", davPassword, invite)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := e.sync.AddMember(ctx, c.uid, team, member.ID, opsync.RoleEditor); err != nil {
			t.Fatal(err)
		}
		m := newClientFor(e)
		resp, out := m.do("POST", "/api/v1/auth/login", map[string]string{"email": "member@example.com", "password": davPassword})
		m.mustStatus(resp, 200, out)
		mine := create(m, "/api/v1/tasks", map[string]any{"title": "Mine", "project_id": team, "parent_id": lead})
		mc := newDavClient(m, "member@example.com", member.ID)
		got := sameAsWholeView(t, mc, team, 4)
		if !strings.Contains(fmt.Sprint(got), mine) {
			t.Fatalf("the member's own subtask is not listed: %v", hrefsOf(got))
		}
	})

	t.Run("an event-mode app password", func(t *testing.T) {
		trips := create(e, "/api/v1/projects", map[string]any{"name": "Trips"})
		create(e, "/api/v1/tasks", map[string]any{"title": "Fly", "project_id": trips, "due": due})
		create(e, "/api/v1/tasks", map[string]any{"title": "Stay", "project_id": trips, "start": "2026-11-20", "span": true, "due": map[string]string{"date": "2026-11-22"}})
		create(e, "/api/v1/tasks", map[string]any{"title": "Someday", "project_id": trips})
		resp, out := e.do("POST", "/api/v1/app-passwords", map[string]any{"name": "Calendar", "events": true})
		e.mustStatus(resp, 201, out)
		ev := &davClient{e: e, email: c.email, secret: out["secret"].(string), uid: c.uid}
		if got := sameAsWholeView(t, ev, trips, 2); len(got) != 2 || !strings.Contains(got[0].data, "BEGIN:VEVENT") {
			t.Fatalf("the event calendar lists %d resources, want the 2 dated tasks as events: %v", len(got), got)
		}
	})

	t.Run("a task blocked by one of an archived project", func(t *testing.T) {
		shed := create(e, "/api/v1/projects", map[string]any{"name": "Shed"})
		paint := create(e, "/api/v1/tasks", map[string]any{"title": "Paint", "project_id": shed})
		yard := create(e, "/api/v1/projects", map[string]any{"name": "Yard"})
		create(e, "/api/v1/tasks", map[string]any{"title": "Fence", "project_id": yard, "blocked_by": []string{paint}})
		create(e, "/api/v1/tasks", map[string]any{"title": "Mow", "project_id": yard})
		resp, out := e.do("PATCH", "/api/v1/projects/"+shed, map[string]any{"archived": true})
		e.mustStatus(resp, 200, out)
		sameAsWholeView(t, c, yard, 2)
		for _, whole := range []bool{false, true} {
			e.server.dav.SetWholeView(whole)
			c.must("PROPFIND", c.cal(shed), propfindEtags, 404, "Depth", "1")
			c.must("REPORT", c.cal(shed), queryAll, 404, "Depth", "1")
		}
		e.server.dav.SetWholeView(false)
	})

	t.Run("a calendar of more tasks than are read one by one", func(t *testing.T) {
		big := seedCalendar(t, e, c.uid, "big", 1001)
		if got := sameAsWholeView(t, c, big, 1001); len(got) != 1001 {
			t.Fatalf("the large calendar lists %d resources, want 1001", len(got))
		}
	})
}
