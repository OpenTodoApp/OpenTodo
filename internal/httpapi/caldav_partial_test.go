package httpapi

import (
	"fmt"
	"html"
	"regexp"
	"strings"
	"testing"
	"time"
)

// OpenSpec change caldav-verified, "Large-account budgets": a GET, a
// multiget and a sync-collection after a token read only the tasks they
// serve (davroutes narrow.go), a calendar-query reads the whole view. The
// partial view must serve exactly what the whole view serves: the same
// resources, ETags and calendar data, with subtasks at every depth (in a
// project and in the Inbox), blockers, labels, reminders, a series with an
// exception and a resource the client named.

var (
	hrefRe = regexp.MustCompile(`<d:href>([^<]*)</d:href>`)
	dataRe = regexp.MustCompile(`<c:calendar-data>([^<]*)</c:calendar-data>`)
)

// served maps each href of a multistatus to its ETag and calendar data.
func served(t *testing.T, body string) map[string][2]string {
	t.Helper()
	out := map[string][2]string{}
	for _, r := range strings.Split(body, "<d:response>")[1:] {
		href := hrefRe.FindStringSubmatch(r)
		if href == nil {
			t.Fatalf("response without href: %s", r)
		}
		var etag, data string
		if m := etagRe.FindStringSubmatch(r); m != nil {
			etag = m[1]
		}
		if m := dataRe.FindStringSubmatch(r); m != nil {
			data = html.UnescapeString(m[1])
		}
		out[href[1]] = [2]string{etag, data}
	}
	return out
}

func TestCalDAVPartialViewServesWhatTheWholeViewServes(t *testing.T) {
	e, c := davSetup(t)
	// The dates below are fixed, and skipping an occurrence is only allowed from the task's
	// current one on: on the real clock the test fails from 14 November 2026.
	e.now.Freeze(time.Date(2026, 11, 12, 9, 0, 0, 0, time.UTC))
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
		_, body := c.must("REPORT", c.cal(cal), queryAll, 207, "Depth", "1")
		whole := served(t, body)
		if len(whole) < 3 {
			t.Fatalf("%s: the calendar-query served %d resources\n%s", cal, len(whole), body)
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
		_, body = c.must("REPORT", c.cal(cal), `<?xml version="1.0"?><c:calendar-multiget xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop>`+
			hrefs.String()+`</c:calendar-multiget>`, 207, "Depth", "1")
		if got := served(t, body); fmt.Sprint(got) != fmt.Sprint(whole) {
			t.Errorf("%s: the multiget serves\n%v\nthe calendar-query\n%v", cal, got, whole)
		}
		// Every task changed since the first position of the log: the same
		// members (the other calendar's tasks are reported gone, as before).
		_, body = c.must("REPORT", c.cal(cal), fmt.Sprintf(syncReport, "urn:opentodo:sync:0"), 207, "Depth", "1")
		got := served(t, body)
		for href, g := range got {
			if g[0] == "" {
				delete(got, href)
			}
		}
		if len(got) != len(whole) {
			t.Errorf("%s: the sync-collection serves %d resources, the calendar-query %d\n%s", cal, len(got), len(whole), body)
		}
		for href, w := range whole {
			if got[href][0] != w[0] {
				t.Errorf("%s: sync-collection ETag of %s is %q, want %q", cal, href, got[href][0], w[0])
			}
		}
	}
}
