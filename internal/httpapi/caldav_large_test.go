package httpapi

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/auth"
	"github.com/OpenTodoApp/opentodo/internal/perfseed"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// OpenSpec change caldav-verified, "Large-account budgets" (design D4, task
// 2.2): CalDAV requests on the 10,000-task account of the performance budgets
// (internal/perfseed, the fixture of performance-10k, built from its fixed
// seed through the op log). Allocation counts are the gates, wall-clock
// ceilings catch an accidental O(n²) without flaking on a slow runner, and
// every measured value is printed.
//
// The shared fixture has 60 projects and the Inbox, so the calendar home
// lists more calendars than the 20 of design D4. The test adds an empty
// calendar, a 50-task and a 500-task one beside them, which give the per-task
// costs; the 1,000-task account the incremental sync is compared with is
// seeded the same way.

const propfindEtags = `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:getetag/><d:resourcetype/></d:prop></d:propfind>`

const queryAll = `<?xml version="1.0" encoding="utf-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop>` +
	`<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VTODO"/></c:comp-filter></c:filter></c:calendar-query>`

// knownOver are budgets the server does not meet yet, with the reason: a
// budget named here is measured and printed but does not fail, and its fix
// removes the entry. The run that found the first three (every request loaded
// the account's whole task list, about 1.49 million allocations and 250 ms on
// 10,000 tasks) is tasks.md 2.2; the partial view fixed them (davroutes
// narrow.go), and none is left.
var knownOver = map[string]string{}

// shareProjects shares n new, empty projects of the account with a second
// member, as the 10,000-task fixture shares three (perfseed.SharedCount): each
// shared project is one more scope every read of the request goes through, so
// the account the large one is compared with shares as many. Membership is
// never an op; the server adds it.
func shareProjects(t *testing.T, e *env, uid, email string, n int) {
	t.Helper()
	ctx := context.Background()
	a := auth.NewService(e.db, time.Hour, false)
	owner, err := a.UserByEmail(ctx, email)
	if err != nil {
		t.Fatal(err)
	}
	_, secret, err := a.CreateInvitation(ctx, owner, "member@example.com", 0)
	if err != nil {
		t.Fatal(err)
	}
	member, err := a.Register(ctx, "member@example.com", "Member", davPassword, secret)
	if err != nil {
		t.Fatal(err)
	}
	for i := range n {
		if _, err := e.sync.AddMember(ctx, uid, seedCalendar(t, e, uid, fmt.Sprintf("shared%d", i), 0), member.ID, opsync.RoleEditor); err != nil {
			t.Fatal(err)
		}
	}
}

// seedCalendar adds a project of n open tasks to the account through the op log.
func seedCalendar(t *testing.T, e *env, uid, name string, n int) string {
	t.Helper()
	pid := "cal-" + name
	ops := []opsync.Op{
		{ID: pid + "-name", Entity: "project", EntityID: pid, Field: "name", Value: []byte(`"` + name + `"`), TS: 2000, Device: "seed"},
		{ID: pid + "-created", Entity: "project", EntityID: pid, Field: "created_at", Value: []byte("1"), TS: 2000, Device: "seed"},
	}
	for i := range n {
		id := fmt.Sprintf("%s-t%04d", name, i)
		for _, f := range []struct{ field, value string }{{"title", `"T"`}, {"created_at", "1"}, {"project_id", `"` + pid + `"`}} {
			ops = append(ops, opsync.Op{ID: id + "-" + f.field, Entity: "task", EntityID: id, Field: f.field, Value: []byte(f.value), TS: 2000, Device: "seed"})
		}
	}
	for start := 0; start < len(ops); start += 600 {
		if _, err := e.sync.Apply(context.Background(), uid, ops[start:min(start+600, len(ops))]); err != nil {
			t.Fatal(err)
		}
	}
	return pid
}

type measured struct {
	allocs float64
	took   time.Duration
	body   string
}

// measure runs a request once for its body, then counts its allocations and
// times it over three more runs.
func measure(c *davClient, method, path, body string, want int, headers ...string) measured {
	c.e.t.Helper()
	_, out := c.must(method, path, body, want, headers...)
	start := time.Now()
	allocs := testing.AllocsPerRun(3, func() { c.must(method, path, body, want, headers...) })
	return measured{allocs: allocs, took: time.Since(start) / 4, body: out}
}

// budget fails the test when ok is false, unless the budget is a known
// finding, and prints the measurement either way.
func budget(t *testing.T, name string, ok bool, format string, args ...any) {
	t.Helper()
	msg := fmt.Sprintf(name+": "+format, args...)
	switch reason, known := knownOver[name]; {
	case ok:
		t.Log(msg)
	case known:
		t.Logf("%s (over budget, known: %s)", msg, reason)
	default:
		t.Errorf("%s: over budget", msg)
	}
}

// largeAccount is the 10,000-task fixture behind a CalDAV client, with an
// empty, a 50-task and a 500-task calendar added.
func largeAccount(t *testing.T) (*env, *davClient, perfseed.Summary, [3]string) {
	t.Helper()
	e := newEnv(t, true)
	start := time.Now()
	sum, err := perfseed.Seed(context.Background(), e.db, perfseed.Options{Now: time.Date(2026, 11, 2, 12, 0, 0, 0, time.UTC)})
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("seeded %d tasks (%d ops) in %s", sum.Counts["task"], sum.Ops, time.Since(start).Round(time.Millisecond))
	resp, out := e.do("POST", "/api/v1/auth/login", map[string]string{"email": perfseed.OwnerEmail, "password": perfseed.Password})
	e.mustStatus(resp, 200, out)
	resp, out = e.do("PUT", "/api/v1/settings/caldav", map[string]any{"enabled": true})
	e.mustStatus(resp, 200, out)
	c := newDavClient(e, perfseed.OwnerEmail, sum.OwnerID)
	return e, c, sum, [3]string{seedCalendar(t, e, sum.OwnerID, "empty", 0), seedCalendar(t, e, sum.OwnerID, "small", 50), seedCalendar(t, e, sum.OwnerID, "large", 500)}
}

// syncAfterOneChange takes a token of the calendar, renames one of its tasks
// and measures the incremental sync-collection.
func syncAfterOneChange(t *testing.T, e *env, c *davClient, cal, task string) measured {
	t.Helper()
	_, body := c.must("REPORT", c.cal(cal), fmt.Sprintf(syncReport, ""), 207, "Depth", "1")
	tok := tokenRe.FindStringSubmatch(body)[1]
	resp, out := e.do("PATCH", "/api/v1/tasks/"+task, map[string]any{"title": "Renamed"})
	e.mustStatus(resp, 200, out)
	m := measure(c, "REPORT", c.cal(cal), fmt.Sprintf(syncReport, tok), 207, "Depth", "1")
	if n := strings.Count(m.body, "<d:response>"); n != 1 || !strings.Contains(m.body, "/"+task+".ics</d:href><d:propstat>") || len(etagRe.FindAllString(m.body, -1)) != 1 {
		t.Fatalf("sync-collection after one change: %d responses, want exactly the renamed task\n%s", n, m.body)
	}
	if next := tokenRe.FindStringSubmatch(m.body)[1]; next == tok {
		t.Fatal("sync-collection after one change: the token did not advance")
	}
	return m
}

func multiget(c *davClient, cal string, ids []string) string {
	var b strings.Builder
	b.WriteString(`<?xml version="1.0"?><c:calendar-multiget xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/></d:prop>`)
	for _, id := range ids {
		fmt.Fprintf(&b, "<d:href>%s%s.ics</d:href>", c.cal(cal), id)
	}
	b.WriteString(`</c:calendar-multiget>`)
	return b.String()
}

func taskIDs(name string, n int) []string {
	out := make([]string, n)
	for i := range out {
		out[i] = fmt.Sprintf("%s-t%04d", name, i)
	}
	return out
}

// multigetPerHref is the allocations of each href beyond the first of a
// 500-href multiget of the calendar.
func multigetPerHref(t *testing.T, c *davClient, cal string, ids []string) (float64, measured) {
	t.Helper()
	one := measure(c, "REPORT", c.cal(cal), multiget(c, cal, ids[:1]), 207, "Depth", "1")
	all := measure(c, "REPORT", c.cal(cal), multiget(c, cal, ids), 207, "Depth", "1")
	if n := len(etagRe.FindAllString(all.body, -1)); n != len(ids) {
		t.Fatalf("multiget of %d hrefs returned %d etags", len(ids), n)
	}
	return (all.allocs - one.allocs) / float64(len(ids)-1), all
}

func TestCalDAVLargeAccountBudgets(t *testing.T) {
	if testing.Short() {
		t.Skip("seeds the 10,000-task account")
	}
	if raceDetector {
		t.Skip("seeds the 10,000-task account: sequential, and too slow under the race detector (as internal/perfseed)")
	}
	// The 1,000-task account the incremental sync and the multiget are
	// compared with, sharing as many projects as the large one.
	se, sc := davSetup(t)
	shareProjects(t, se, sc.uid, "owner@example.com", perfseed.SharedCount)
	seedCalendar(t, se, sc.uid, "rest", 500)
	smallLarge := seedCalendar(t, se, sc.uid, "large", 500)
	smallSync := syncAfterOneChange(t, se, sc, smallLarge, "large-t0007")
	smallPerHref, _ := multigetPerHref(t, sc, smallLarge, taskIDs("large", 500))

	e, c, sum, cals := largeAccount(t)
	empty, small, large := cals[0], cals[1], cals[2]

	// PROPFIND Depth 1 of a 500-task calendar: the cost of each resource does
	// not grow with the calendar (the request's fixed cost, the view of the
	// account, is the empty calendar's).
	pEmpty := measure(c, "PROPFIND", c.cal(empty), propfindEtags, 207, "Depth", "1")
	pSmall := measure(c, "PROPFIND", c.cal(small), propfindEtags, 207, "Depth", "1")
	pLarge := measure(c, "PROPFIND", c.cal(large), propfindEtags, 207, "Depth", "1")
	if n := strings.Count(pLarge.body, "<d:getetag>"); n != 500 {
		t.Fatalf("PROPFIND of the 500-task calendar listed %d resources", n)
	}
	perSmall, perLarge := (pSmall.allocs-pEmpty.allocs)/50, (pLarge.allocs-pEmpty.allocs)/500
	budget(t, "PROPFIND allocations per resource", perLarge <= 1.5*perSmall,
		"%.0f per resource of 500, %.0f of 50 (at most 1.5×); fixed cost %.0f", perLarge, perSmall, pEmpty.allocs)
	budget(t, "PROPFIND time", pLarge.took <= time.Second, "%v (ceiling 1s)", pLarge.took)

	// calendar-query with the plain VTODO filter: each task encoded once, so a
	// task costs what it costs in the PROPFIND, which encodes it for its ETag.
	qEmpty := measure(c, "REPORT", c.cal(empty), queryAll, 207, "Depth", "1")
	qLarge := measure(c, "REPORT", c.cal(large), queryAll, 207, "Depth", "1")
	if n := strings.Count(qLarge.body, "BEGIN:VTODO"); n != 500 {
		t.Fatalf("calendar-query returned %d tasks, want 500", n)
	}
	perQuery := (qLarge.allocs - qEmpty.allocs) / 500
	budget(t, "calendar-query encodes each task once", perQuery <= 1.5*perLarge,
		"%.0f allocations per task, %.0f per PROPFIND resource (at most 1.5×); %d bytes", perQuery, perLarge, len(qLarge.body))
	budget(t, "calendar-query time", qLarge.took <= 1500*time.Millisecond, "%v (ceiling 1.5s)", qLarge.took)

	// sync-collection after one change: one response, and no task of the
	// calendar encoded beside it: it costs a Depth 0 PROPFIND, which loads the
	// view and encodes nothing, plus far less than encoding the calendar.
	depth0 := measure(c, "PROPFIND", c.cal(large), propfindCalendars, 207, "Depth", "0")
	sync := syncAfterOneChange(t, e, c, large, "large-t0007")
	encodeAll := 500 * perLarge
	budget(t, "sync-collection encodes only the change", sync.allocs-depth0.allocs <= encodeAll/4,
		"%.0f allocations, %.0f beyond a Depth 0 PROPFIND (at most a quarter of encoding the calendar, %.0f)", sync.allocs, sync.allocs-depth0.allocs, encodeAll)
	budget(t, "sync-collection allocations vs 1,000", sync.allocs <= 1.1*smallSync.allocs,
		"%.0f allocations, %.0f on a 1,000-task account (at most +10%%)", sync.allocs, smallSync.allocs)
	budget(t, "sync-collection time", sync.took <= 100*time.Millisecond, "%v (ceiling 100ms)", sync.took)
	// A token the server never issued is refused as before, without encoding.
	_, body := c.must("REPORT", c.cal(large), fmt.Sprintf(syncReport, "urn:opentodo:sync:999999999"), 403, "Depth", "1")
	if !strings.Contains(body, "valid-sync-token") {
		t.Fatalf("unknown token: %s", body)
	}

	// calendar-multiget of 500 hrefs: the cost per href does not grow with the account.
	perHref, mg := multigetPerHref(t, c, large, taskIDs("large", 500))
	budget(t, "multiget allocations per href", perHref <= 1.5*smallPerHref,
		"%.0f per href, %.0f on a 1,000-task account (at most 1.5×)", perHref, smallPerHref)
	budget(t, "multiget time", mg.took <= 1500*time.Millisecond, "%v (ceiling 1.5s)", mg.took)

	// PROPFIND Depth 1 of the calendar home: calendars only, no task encoded
	// (encoding the account would cost about 10,000 resources' allocations).
	home := measure(c, "PROPFIND", "/dav/calendars/"+sum.OwnerID+"/", propfindCalendars, 207, "Depth", "1")
	extra := home.allocs - depth0.allocs
	budget(t, "calendar home PROPFIND encodes no task", extra <= 0.1*float64(sum.Counts["task"])*perLarge,
		"%d responses, %.0f allocations beyond a Depth 0 PROPFIND (at most a tenth of encoding every task, %.0f)",
		strings.Count(home.body, "<d:response>"), extra, float64(sum.Counts["task"])*perLarge)
	budget(t, "calendar home PROPFIND time", home.took <= 200*time.Millisecond, "%v (ceiling 200ms)", home.took)
}
