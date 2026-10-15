package caldav

import (
	"strings"
	"testing"
)

// OpenSpec change deadlines, design D6: with a deadline, DUE is the deadline
// (a date) and DTSTART the planned day.
func TestDeadlineEncode(t *testing.T) {
	enc := func(task Task) string { task.UID, task.Priority = "u", 4; return string(Encode(task)) }

	// Deadline served.
	out := enc(Task{Due: &Due{Date: "2026-10-13", Time: strp("09:30")}, Deadline: "2026-10-17"})
	if !strings.Contains(out, "\r\nDTSTART:20261013T093000\r\n") || !strings.Contains(out, "\r\nDUE;VALUE=DATE:20261017\r\n") {
		t.Fatalf("deadline served: %s", out)
	}
	// Deadline without a due date.
	out = enc(Task{Deadline: "2026-10-17"})
	if !strings.Contains(out, "\r\nDUE;VALUE=DATE:20261017\r\n") || strings.Contains(out, "DTSTART") {
		t.Fatalf("deadline only: %s", out)
	}
	// Due date with time, no deadline: unchanged, no DTSTART.
	out = enc(Task{Due: &Due{Date: "2026-10-11", Time: strp("09:30")}})
	if !strings.Contains(out, "\r\nDUE:20261011T093000\r\n") || strings.Contains(out, "DTSTART") {
		t.Fatalf("due with time: %s", out)
	}
	// Recurring anchor unchanged: DTSTART equals DUE.
	out = enc(Task{Due: &Due{Date: "2026-10-11"}, Recurrence: "every week"})
	if !strings.Contains(out, "\r\nDUE;VALUE=DATE:20261011\r\n") || !strings.Contains(out, "\r\nDTSTART;VALUE=DATE:20261011\r\n") {
		t.Fatalf("recurring anchor: %s", out)
	}
	// A zoned planned day keeps its VTIMEZONE next to the deadline.
	out = enc(Task{Due: &Due{Date: "2026-10-13", Time: strp("09:30"), TZ: strp("Europe/Berlin")}, Deadline: "2026-10-17"})
	if !strings.Contains(out, "DTSTART;TZID=Europe/Berlin:20261013T093000") || !strings.Contains(out, "BEGIN:VTIMEZONE") {
		t.Fatalf("zoned start: %s", out)
	}
	// A client DTSTART kept in the remainder is not served twice.
	out = enc(Task{Due: &Due{Date: "2026-10-13"}, Deadline: "2026-10-17", Extra: "DTSTART;VALUE=DATE:20261001"})
	if strings.Count(out, "DTSTART") != 1 {
		t.Fatalf("duplicate DTSTART: %s", out)
	}
}

func TestDeadlineDecode(t *testing.T) {
	// Start and due from a client.
	in, err := Decode(vtodo("DTSTART;VALUE=DATE:20261013\r\nDUE;VALUE=DATE:20261017"))
	if err != nil {
		t.Fatal(err)
	}
	if in.Due == nil || in.Due.Date != "2026-10-13" || in.Due.Time != nil || in.Deadline != "2026-10-17" || in.DueOnly || strings.Contains(in.Extra, "DTSTART") {
		t.Fatalf("start and due: %+v due=%+v", in, in.Due)
	}
	// Timed DUE with a start keeps the day.
	in, _ = Decode(vtodo("DTSTART:20261013T090000\r\nDUE:20261017T170000"))
	if in.Due == nil || in.Due.Date != "2026-10-13" || in.Due.Time == nil || *in.Due.Time != "09:00" || in.Deadline != "2026-10-17" {
		t.Fatalf("timed: %+v due=%+v", in, in.Due)
	}
	if out := string(Encode(Task{UID: "u", Priority: 4, Due: in.Due, Deadline: in.Deadline})); !strings.Contains(out, "\r\nDUE;VALUE=DATE:20261017\r\n") {
		t.Fatalf("served back: %s", out)
	}
	// Only DUE: the due date, flagged for the caller.
	in, _ = Decode(vtodo("DUE;TZID=Europe/Berlin:20261011T093000"))
	if in.Due == nil || in.Deadline != "" || !in.DueOnly {
		t.Fatalf("due only: %+v", in)
	}
	// Recurring anchor sent back: due only, no deadline, nothing kept.
	in, _ = Decode(vtodo("DTSTART;VALUE=DATE:20261011\r\nDUE;VALUE=DATE:20261011\r\nRRULE:FREQ=WEEKLY"))
	if in.Deadline != "" || in.Rule != "every week" || strings.Contains(in.Extra, "DTSTART") || in.DueOnly {
		t.Fatalf("recurring anchor: %+v", in)
	}
	// A DTSTART without DUE stays client data.
	in, _ = Decode(vtodo("DTSTART;VALUE=DATE:20261011"))
	if in.Due != nil || !strings.Contains(in.Extra, "DTSTART;VALUE=DATE:20261011") {
		t.Fatalf("start only: %+v", in)
	}
}

// OpenSpec change someday-and-evening, design D7.
func TestStartEveningProperties(t *testing.T) {
	out := string(Encode(Task{UID: "u", Priority: 4, Start: "someday"}))
	if !strings.Contains(out, "\r\nX-OPENTODO-START:SOMEDAY\r\n") || strings.Contains(out, "DUE") || strings.Contains(out, "DTSTART") {
		t.Fatalf("someday served: %s", out)
	}
	out = string(Encode(Task{UID: "u", Priority: 4, Start: "2026-10-21", Evening: true}))
	if !strings.Contains(out, "\r\nX-OPENTODO-START:20261021\r\n") || !strings.Contains(out, "\r\nX-OPENTODO-EVENING:TRUE\r\n") {
		t.Fatalf("deferred evening served: %s", out)
	}
	if out = string(Encode(Task{UID: "u", Priority: 4})); strings.Contains(out, "X-OPENTODO") {
		t.Fatalf("unset served: %s", out)
	}
	in, _ := Decode(vtodo("X-OPENTODO-START:20261021", "X-OPENTODO-EVENING:TRUE"))
	if in.Start == nil || *in.Start != "2026-10-21" || in.Evening == nil || !*in.Evening || strings.Contains(in.Extra, "X-OPENTODO") {
		t.Fatalf("decoded: %+v", in)
	}
	in, _ = Decode(vtodo("X-OPENTODO-START:LATER", "X-OPENTODO-EVENING:MAYBE"))
	if in.Start != nil || in.Evening != nil || !strings.Contains(in.Extra, "X-OPENTODO-START:LATER") || !strings.Contains(in.Extra, "X-OPENTODO-EVENING:MAYBE") {
		t.Fatalf("invalid kept: %+v", in)
	}
	in, _ = Decode(vtodo("SUMMARY:x"))
	if in.Start != nil || in.Evening != nil {
		t.Fatalf("absent: %+v", in)
	}
}
