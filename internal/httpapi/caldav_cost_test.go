package httpapi

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	opsync "github.com/pixari/opentodo/internal/sync"
)

// CalDAV request costs (OpenSpec change `server-query-costs`): the view is
// loaded once per request and indexed, so each href of a multiget costs the
// same however many tasks the account has.
func TestCalDAVMultigetCostPerHrefDoesNotGrowWithTasks(t *testing.T) {
	e, c := davSetup(t)
	const tasks, hrefs = 2000, 200
	for start := 0; start < tasks; start += 200 {
		var ops []opsync.Op
		for i := start; i < start+200; i++ {
			id := fmt.Sprintf("task%05d", i)
			for _, f := range []struct{ field, value string }{{"title", `"T"`}, {"created_at", "1"}, {"project_id", "null"}} {
				ops = append(ops, opsync.Op{ID: fmt.Sprintf("%s-%s", id, f.field), Entity: "task", EntityID: id, Field: f.field, Value: []byte(f.value), TS: 1000, Device: "seed"})
			}
		}
		if _, err := e.sync.Apply(context.Background(), c.uid, ops); err != nil {
			t.Fatal(err)
		}
	}
	multiget := func(n int) string {
		var b strings.Builder
		b.WriteString(`<?xml version="1.0"?><c:calendar-multiget xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/></d:prop>`)
		for i := range n {
			fmt.Fprintf(&b, "<d:href>%stask%05d.ics</d:href>", c.cal("inbox"), tasks-1-i*7)
		}
		b.WriteString(`</c:calendar-multiget>`)
		return b.String()
	}
	one, many := multiget(1), multiget(hrefs)
	if _, body := c.must("REPORT", c.cal("inbox"), many, 207, "Depth", "1"); len(etagRe.FindAllString(body, -1)) != hrefs {
		t.Fatalf("multiget returned %d etags", len(etagRe.FindAllString(body, -1)))
	}
	measure := func(body string) (float64, time.Duration) {
		start := time.Now()
		allocs := testing.AllocsPerRun(3, func() { c.must("REPORT", c.cal("inbox"), body, 207, "Depth", "1") })
		return allocs, time.Since(start) / 4
	}
	a1, d1 := measure(one)
	an, dn := measure(many)
	perHref := (an - a1) / (hrefs - 1)
	t.Logf("multiget on %d tasks: 1 href %.0f allocs %v, %d hrefs %.0f allocs %v (%.0f allocs per extra href)", tasks, a1, d1, hrefs, an, dn, perHref)
	if perHref > tasks/4 {
		t.Fatalf("each href costs %.0f allocations on an account of %d tasks: the lookup scans the account", perHref, tasks)
	}
}
