package httpapi

import (
	"strings"
	"testing"
)

// OpenSpec change series-split, "Split series in CalDAV". Dated in 2030 so the
// day the test runs does not matter (2030-01-07 is a Monday).

func TestCalDAVServesSplitSeries(t *testing.T) {
	e, c := davSetup(t)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Study", "due": map[string]any{"date": "2030-01-07", "time": "18:00"}, "recurrence": "every weekday"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/tasks/"+id+"/split", map[string]any{"from": "2030-01-09", "changes": map[string]any{"due": map[string]any{"date": "2030-01-09", "time": "19:00"}}})
	e.mustStatus(resp, 200, out)
	piece := out["id"].(string)

	_, ics := c.must("GET", c.cal("inbox")+id+".ics", "", 200)
	if !strings.Contains(ics, "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;UNTIL=20300108\r\n") || !strings.Contains(ics, "DUE:20300107T180000\r\n") {
		t.Fatalf("old series:\n%s", ics)
	}
	_, ics = c.must("GET", c.cal("inbox")+piece+".ics", "", 200)
	if !strings.Contains(ics, "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR\r\n") || !strings.Contains(ics, "DUE:20300109T190000\r\n") ||
		!strings.Contains(ics, "RELATED-TO;RELTYPE=SIBLING:"+id+"\r\n") {
		t.Fatalf("piece:\n%s", ics)
	}
	// A client writing the piece back keeps its link (served once) and its split.
	c.must("PUT", c.cal("inbox")+piece+".ics", ics, 204)
	if sf, _ := e.task(piece)["split_from"].(map[string]any); sf["series"] != id {
		t.Fatalf("split_from after a client's write = %v", e.task(piece)["split_from"])
	}
	_, ics = c.must("GET", c.cal("inbox")+piece+".ics", "", 200)
	if n := strings.Count(ics, "RELATED-TO;RELTYPE=SIBLING:"); n != 1 {
		t.Fatalf("sibling served %d times:\n%s", n, ics)
	}
}

// A stored until later than the derived end (a device has not repaired the
// rule yet) is served as the derived end.
func TestCalDAVServesDerivedUntil(t *testing.T) {
	e, c := davSetup(t)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Run", "due": map[string]any{"date": "2030-01-07"}, "recurrence": "every day"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/tasks/"+id+"/split", map[string]any{"from": "2030-01-20", "changes": map[string]any{"title": "Run longer"}})
	e.mustStatus(resp, 200, out)
	// Another device split at the 10th offline: its piece arrives, the root's
	// rule still says the 19th.
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Run early", "due": map[string]any{"date": "2030-01-10"}, "recurrence": "every day", "split_from": map[string]any{"series": id, "date": "2030-01-10"}})
	e.mustStatus(resp, 201, out)
	early := out["id"].(string)
	_, ics := c.must("GET", c.cal("inbox")+id+".ics", "", 200)
	if !strings.Contains(ics, "RRULE:FREQ=DAILY;UNTIL=20300109\r\n") {
		t.Fatalf("root:\n%s", ics)
	}
	_, ics = c.must("GET", c.cal("inbox")+early+".ics", "", 200)
	if !strings.Contains(ics, "RRULE:FREQ=DAILY;UNTIL=20300119\r\n") || !strings.Contains(ics, "RELATED-TO;RELTYPE=SIBLING:"+id+"\r\n") {
		t.Fatalf("middle piece:\n%s", ics)
	}
}

// A client's own "this and future" edit: it ends the series with UNTIL and PUTs
// a new object; that is a rule change and a new task, without a lineage link.
func TestCalDAVClientThisAndFuture(t *testing.T) {
	e, c := davSetup(t)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Study", "due": map[string]any{"date": "2030-01-07", "time": "18:00"}, "recurrence": "every weekday"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	_, ics := c.must("GET", c.cal("inbox")+id+".ics", "", 200)
	ended := strings.Replace(ics, "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR\r\n", "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;UNTIL=20300108\r\n", 1)
	if ended == ics {
		t.Fatalf("served:\n%s", ics)
	}
	c.must("PUT", c.cal("inbox")+id+".ics", ended, 204)
	c.must("PUT", c.cal("inbox")+"study-later.ics", vtodoBody("study-later", "SUMMARY:Study", "DTSTART:20300109T190000", "DUE:20300109T190000", "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"), 201)
	old := e.task(id)
	if old["recurrence"] != "every weekday until 2030-01-08" || old["split_from"] != nil {
		t.Fatalf("old = %v", old)
	}
	resp, out = e.do("GET", "/api/v1/tasks?limit=200", nil)
	e.mustStatus(resp, 200, out)
	found := false
	for _, raw := range out["tasks"].([]any) {
		task := raw.(map[string]any)
		if task["id"] == id || task["recurrence"] != "every weekday" {
			continue
		}
		found = true
		if task["split_from"] != nil {
			t.Fatalf("new task carries split_from: %v", task)
		}
	}
	if !found {
		t.Fatalf("no new series in %v", out)
	}
}
