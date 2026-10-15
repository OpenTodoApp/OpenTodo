package httpapi

import (
	"strings"
	"testing"
)

// CalDAV mapping of task dependencies (OpenSpec change task-dependencies, task 7.1).
func TestCalDAVDependsOn(t *testing.T) {
	e, c := davSetup(t)
	inbox := c.cal(inboxCalendar)
	c.must("PUT", inbox+"confirm.ics", vtodoBody("confirm", "SUMMARY:Confirm dates"), 201, "If-None-Match", "*")
	// A blocker in the same calendar becomes blocked_by; an unknown UID stays client data.
	c.must("PUT", inbox+"flights.ics", vtodoBody("flights", "SUMMARY:Book flights", "RELATED-TO;RELTYPE=DEPENDS-ON:confirm", "RELATED-TO;RELTYPE=DEPENDS-ON:not-yet"), 201, "If-None-Match", "*")
	task := e.task("flights")
	if l, _ := task["blocked_by"].([]any); len(l) != 1 || l[0] != "confirm" {
		t.Fatalf("blocked_by = %v", task["blocked_by"])
	}
	if extra, _ := task["ical_extra"].(string); !strings.Contains(extra, "RELTYPE=DEPENDS-ON:not-yet") {
		t.Fatalf("extra = %q", extra)
	}
	// Served back as RELATED-TO;RELTYPE=DEPENDS-ON, the untyped line stays the parent.
	_, body := c.must("GET", inbox+"flights.ics", "", 200)
	if !strings.Contains(body, "RELATED-TO;RELTYPE=DEPENDS-ON:confirm") {
		t.Fatalf("served:\n%s", body)
	}
	// A PUT that would close a cycle is refused and writes nothing.
	c.must("PUT", inbox+"confirm.ics", vtodoBody("confirm", "SUMMARY:Confirm dates", "RELATED-TO;RELTYPE=DEPENDS-ON:flights"), 403)
	if l, _ := e.task("confirm")["blocked_by"].([]any); len(l) != 0 {
		t.Fatalf("cycle written: %v", l)
	}
	// Dropping the line unblocks.
	c.must("PUT", inbox+"flights.ics", vtodoBody("flights", "SUMMARY:Book flights"), 204)
	if l, _ := e.task("flights")["blocked_by"].([]any); len(l) != 0 {
		t.Fatalf("after removal: %v", l)
	}
}
