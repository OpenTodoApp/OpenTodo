package httpapi

import (
	"strings"
	"testing"
)

// OpenSpec change series-exceptions, tasks 6.1 and 6.2: exceptions of a
// repeating task served as EXDATE, open records as their own VTODOs, counted
// rules with UNTIL, and a client's EXDATE and overrides of any occurrence date.
// Dated in 2030 so the day the test runs does not matter.

// seriesICS is a client's series object: the served series (EXDATE as given)
// and its overrides.
func seriesICS(uid, exdate string, overrides ...string) string {
	b := "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\nBEGIN:VTODO\r\nUID:" + uid + "\r\nSUMMARY:Weekly report\r\n" +
		"DTSTART:20300107T090000\r\nDUE:20300107T090000\r\nRRULE:FREQ=WEEKLY;BYDAY=MO\r\n"
	if exdate != "" {
		b += "EXDATE:" + exdate + "\r\n"
	}
	b += "STATUS:NEEDS-ACTION\r\nEND:VTODO\r\n"
	for _, o := range overrides {
		b += "BEGIN:VTODO\r\nUID:" + uid + "\r\nSUMMARY:Weekly report\r\n" + o + "END:VTODO\r\n"
	}
	return b + "END:VCALENDAR\r\n"
}

func TestCalDAVExceptions(t *testing.T) {
	e, c := davSetup(t)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Weekly report", "due": map[string]any{"date": "2030-01-07", "time": "09:00"}, "recurrence": "every monday"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	// Skip the 14th, move the 21st to the 22nd.
	resp, out = e.do("POST", "/api/v1/tasks/"+id+"/occurrences/2030-01-14/skip", nil)
	e.mustStatus(resp, 200, out)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id+"/occurrences/2030-01-21", map[string]any{"due": map[string]any{"date": "2030-01-22", "time": "09:00"}})
	e.mustStatus(resp, 200, out)
	moved := out["id"].(string)

	// Exceptions served; the moved occurrence is its own VTODO linked to the series.
	_, ics := c.must("GET", c.cal("inbox")+id+".ics", "", 200)
	if !strings.Contains(ics, "EXDATE:20300114T090000,20300121T090000\r\n") || !strings.Contains(ics, "RRULE:FREQ=WEEKLY;BYDAY=MO\r\n") {
		t.Fatalf("series:\n%s", ics)
	}
	_, ics = c.must("GET", c.cal("inbox")+moved+".ics", "", 200)
	if !strings.Contains(ics, "RELATED-TO;RELTYPE=SIBLING:"+id+"\r\n") || !strings.Contains(ics, "DUE:20300122T090000\r\n") || strings.Contains(ics, "RRULE") {
		t.Fatalf("moved occurrence:\n%s", ics)
	}

	// A client deletes the occurrence of the 28th (EXDATE added): skipped.
	c.must("PUT", c.cal("inbox")+id+".ics", seriesICS(id, "20300114T090000,20300121T090000,20300128T090000"), 204)
	if rec := e.task(occurrenceID(id, "2030-01-28")); rec["skipped"] != true || rec["completed_at"] == nil {
		t.Fatalf("28th: %v", rec)
	}
	if d := e.task(id)["due"].(map[string]any); d["date"] != "2030-01-07" {
		t.Fatalf("series moved: %v", d)
	}
	// The 14th taken out of EXDATE: an open occurrence again. The moved 21st
	// left out changes nothing.
	c.must("PUT", c.cal("inbox")+id+".ics", seriesICS(id, "20300128T090000"), 204)
	if rec := e.task(occurrenceID(id, "2030-01-14")); rec["completed_at"] != nil || rec["skipped"] != false {
		t.Fatalf("14th: %v", rec)
	}
	if rec := e.task(moved); rec["due"].(map[string]any)["date"] != "2030-01-22" || rec["completed_at"] != nil {
		t.Fatalf("moved: %v", rec)
	}

	// Overrides: cancelled (skip), changed (move), completed (done) and one of a
	// Tuesday, which is not an occurrence and changes nothing.
	c.must("PUT", c.cal("inbox")+id+".ics", seriesICS(id, "20300114T090000,20300121T090000,20300128T090000",
		"RECURRENCE-ID:20300204T090000\r\nDTSTART:20300204T090000\r\nDUE:20300204T090000\r\nSTATUS:CANCELLED\r\n",
		"RECURRENCE-ID:20300211T090000\r\nDTSTART:20300212T100000\r\nDUE:20300212T100000\r\nSTATUS:NEEDS-ACTION\r\n",
		"RECURRENCE-ID:20300218T090000\r\nDTSTART:20300218T090000\r\nDUE:20300218T090000\r\nSTATUS:COMPLETED\r\nCOMPLETED:20300101T080000Z\r\n",
		"RECURRENCE-ID:20300108T090000\r\nDTSTART:20300108T090000\r\nDUE:20300108T090000\r\nSTATUS:COMPLETED\r\n",
	), 204)
	if rec := e.task(occurrenceID(id, "2030-02-04")); rec["skipped"] != true {
		t.Fatalf("cancelled: %v", rec)
	}
	if rec := e.task(occurrenceID(id, "2030-02-11")); rec["completed_at"] != nil || rec["due"].(map[string]any)["date"] != "2030-02-12" || rec["due"].(map[string]any)["time"] != "10:00" {
		t.Fatalf("changed: %v", rec)
	}
	if rec := e.task(occurrenceID(id, "2030-02-18")); rec["completed_at"] == nil || rec["skipped"] != false {
		t.Fatalf("completed: %v", rec)
	}
	resp, _ = e.do("GET", "/api/v1/tasks/"+occurrenceID(id, "2030-01-08"), nil)
	if resp.StatusCode != 404 {
		t.Fatalf("a Tuesday got a record: %d", resp.StatusCode)
	}
	if d := e.task(id)["due"].(map[string]any); d["date"] != "2030-01-07" {
		t.Fatalf("series moved: %v", d)
	}
	// Served back without the overrides; their dates are exceptions.
	_, ics = c.must("GET", c.cal("inbox")+id+".ics", "", 200)
	ics = strings.ReplaceAll(ics, "\r\n ", "") // unfold
	if strings.Contains(ics, "RECURRENCE-ID") || !strings.Contains(ics, "20300204T090000,20300211T090000,20300218T090000") {
		t.Fatalf("served:\n%s", ics)
	}
}

// A `for N times` rule is served with the UNTIL of its last remaining
// occurrence, and that RRULE sent back keeps the rule.
func TestCalDAVCountedRuleServedWithUntil(t *testing.T) {
	e, c := davSetup(t)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Course", "due": map[string]any{"date": "2030-01-07"}, "recurrence": "every day for 5 times"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	for _, d := range []string{"2030-01-08", "2030-01-09"} {
		resp, out = e.do("POST", "/api/v1/tasks/"+id+"/occurrences/"+d+"/complete", nil)
		e.mustStatus(resp, 200, out)
	}
	// Two done: the 7th, 10th and 11th remain.
	_, ics := c.must("GET", c.cal("inbox")+id+".ics", "", 200)
	if !strings.Contains(ics, "RRULE:FREQ=DAILY;UNTIL=20300111\r\n") || !strings.Contains(ics, "EXDATE;VALUE=DATE:20300108,20300109\r\n") {
		t.Fatalf("served:\n%s", ics)
	}
	back := strings.ReplaceAll(ics, "SUMMARY:Course", "SUMMARY:Course, renamed")
	c.must("PUT", c.cal("inbox")+id+".ics", back, 204)
	if got := e.task(id); got["recurrence"] != "every day for 5 times" || got["title"] != "Course, renamed" {
		t.Fatalf("rule after the round trip: %v", got)
	}
}
