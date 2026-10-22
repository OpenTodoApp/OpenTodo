package httpapi

import (
	"fmt"
	"net/http"
	"os"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/caldav"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// OpenSpec change caldav-interop: estimates, inbound date shapes and alarms as
// reminders over CalDAV.

func TestCaldavBoundsMatchSchema(t *testing.T) {
	if caldav.MaxEstimateMinutes != opsync.MaxPositiveInt || caldav.MaxAlarmOffset != opsync.MaxReminderOffset {
		t.Fatalf("caldav bounds %d/%d differ from the op schema %d/%d", caldav.MaxEstimateMinutes, caldav.MaxAlarmOffset, opsync.MaxPositiveInt, opsync.MaxReminderOffset)
	}
}

// laterOp is a device op stamped after anything the server just wrote.
func laterOp(id, entity, entityID, field string, value any) map[string]any {
	op := syncOp(id, entity, entityID, field, value)
	op["ts"], op["device"] = time.Now().UnixMilli()+5_000, "laptop"
	return op
}

func TestPutEstimate(t *testing.T) {
	e, c := davSetup(t)
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:Plan", "ESTIMATED-DURATION:PT2H"), 201)
	if got := e.task("t1")["estimate_minutes"]; got != float64(120) || e.caldavOps("t1")["estimate_minutes"] != 1 {
		t.Fatalf("estimate %v ops %v", got, e.caldavOps("t1"))
	}
	_, ics := c.must("GET", c.cal("inbox")+"t1.ics", "", 200)
	if !strings.Contains(ics, "\r\nESTIMATED-DURATION:PT2H\r\n") {
		t.Fatalf("estimate not served:\n%s", ics)
	}
	// A client that never sends the property leaves it alone.
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:Plan the week"), 204)
	if got := e.task("t1"); got["estimate_minutes"] != float64(120) || got["title"] != "Plan the week" {
		t.Fatalf("absence removed the estimate: %v", got)
	}
	// Out of range or not a duration: 403 valid-calendar-data, nothing written.
	before := fmt.Sprint(e.caldavOps("t1"))
	for _, bad := range []string{"P2W", "-PT1H", "soon"} {
		_, out := c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:Plan the week", "ESTIMATED-DURATION:"+bad), 403)
		if !strings.Contains(out, "valid-calendar-data") {
			t.Fatalf("%s: %s", bad, out)
		}
	}
	if fmt.Sprint(e.caldavOps("t1")) != before {
		t.Fatal("a refused estimate wrote ops")
	}
	// Seconds round up and are served back in minutes.
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:Plan the week", "ESTIMATED-DURATION:PT20M30S"), 204)
	if _, ics = c.must("GET", c.cal("inbox")+"t1.ics", "", 200); !strings.Contains(ics, "ESTIMATED-DURATION:PT21M\r\n") {
		t.Fatalf("rounded:\n%s", ics)
	}
	// Convergence: a later device edit of the same field wins everywhere.
	_, cursor, _ := syncAll(e, "laptop", 0)
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:Plan the week", "ESTIMATED-DURATION:PT1H"), 204)
	syncOnce(e, "laptop", cursor, []map[string]any{laterOp("est", "task", "t1", "estimate_minutes", 30)})
	if got := e.task("t1")["estimate_minutes"]; got != float64(30) {
		t.Fatalf("not converged: %v", got)
	}
	if _, ics = c.must("GET", c.cal("inbox")+"t1.ics", "", 200); !strings.Contains(ics, "ESTIMATED-DURATION:PT30M\r\n") {
		t.Fatalf("CalDAV view not converged:\n%s", ics)
	}
}

// TestInboundDateShapes runs every row of the "Inbound date shapes" table
// against every state a task can be in.
func TestInboundDateShapes(t *testing.T) {
	e, c := davSetup(t)
	type state struct {
		name string
		body map[string]any
	}
	states := []state{
		{"plain", map[string]any{"due": map[string]any{"date": "2026-10-20"}}},
		{"deadline", map[string]any{"due": map[string]any{"date": "2026-10-20"}, "deadline": "2026-10-24"}},
		{"recurring", map[string]any{"due": map[string]any{"date": "2026-10-20"}, "recurrence": "every week"}},
		{"deferred", map[string]any{"start": "someday"}},
	}
	type row struct {
		name  string
		lines []string
		// want(due, deadline) given the task's due and deadline before the PUT.
		want func(due, deadline string) (string, string)
	}
	rows := []row{
		{"due only", []string{"DUE;VALUE=DATE:20261022"}, func(due, deadline string) (string, string) {
			if deadline != "" {
				return "", "2026-10-22"
			}
			return "2026-10-22", ""
		}},
		{"start and due equal", []string{"DTSTART;VALUE=DATE:20261022", "DUE;VALUE=DATE:20261022"}, func(_, deadline string) (string, string) { return "2026-10-22", deadline }},
		{"start and due differ", []string{"DTSTART;VALUE=DATE:20261022", "DUE;VALUE=DATE:20261025"}, func(_, _ string) (string, string) { return "2026-10-22", "2026-10-25" }},
		{"start and duration", []string{"DTSTART;VALUE=DATE:20261022", "ESTIMATED-DURATION:PT1H"}, func(_, deadline string) (string, string) { return "2026-10-22", deadline }},
		{"start and DURATION", []string{"DTSTART;VALUE=DATE:20261022", "DURATION:PT1H"}, func(_, deadline string) (string, string) { return "2026-10-22", deadline }},
		{"start alone", []string{"DTSTART;VALUE=DATE:20261022"}, func(due, deadline string) (string, string) { return due, deadline }},
		{"neither", nil, func(_, deadline string) (string, string) { return "", deadline }},
	}
	dateOf := func(task map[string]any) (string, string) {
		due, deadline := "", ""
		if d, ok := task["due"].(map[string]any); ok {
			due = d["date"].(string)
		}
		if dl, ok := task["deadline"].(string); ok {
			deadline = dl
		}
		return due, deadline
	}
	for _, st := range states {
		for _, r := range rows {
			body := map[string]any{"title": st.name + " " + r.name}
			for k, v := range st.body {
				body[k] = v
			}
			resp, out := e.do("POST", "/api/v1/tasks", body)
			e.mustStatus(resp, 201, out)
			id := out["id"].(string)
			due0, deadline0 := dateOf(e.task(id))
			lines := append([]string{"SUMMARY:" + st.name + " " + r.name}, r.lines...)
			c.must("PUT", c.cal("inbox")+id+".ics", vtodoBody(id, lines...), 204)
			gotDue, gotDeadline := dateOf(e.task(id))
			wantDue, wantDeadline := r.want(due0, deadline0)
			if gotDue != wantDue || gotDeadline != wantDeadline {
				t.Fatalf("%s / %s: due %q deadline %q, want %q %q", st.name, r.name, gotDue, gotDeadline, wantDue, wantDeadline)
			}
			// A date the shape does not name is not even written.
			ops := e.caldavOps(id)
			if wantDue == due0 && ops["due"] != 0 {
				t.Fatalf("%s / %s: unchanged due written (%v)", st.name, r.name, ops)
			}
			if wantDeadline == deadline0 && ops["deadline"] != 0 {
				t.Fatalf("%s / %s: unchanged deadline written (%v)", st.name, r.name, ops)
			}
		}
	}
	// On create the table is the same: DTSTART and DURATION are a due time.
	c.must("PUT", c.cal("inbox")+"new.ics", vtodoBody("new", "SUMMARY:Call", "DTSTART:20261020T140000", "DURATION:PT30M"), 201)
	if got := e.task("new"); got["due"].(map[string]any)["time"] != "14:00" || got["deadline"] != nil {
		t.Fatalf("create: %v", got)
	}
}

func TestNoDueNeverClearsDeadline(t *testing.T) {
	e, c := davSetup(t)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Slides", "due": map[string]any{"date": "2026-10-13"}, "deadline": "2026-10-17"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	_, ics := c.must("GET", c.cal("inbox")+id+".ics", "", 200)
	if !strings.Contains(ics, "DTSTART;VALUE=DATE:20261013\r\n") || !strings.Contains(ics, "DUE;VALUE=DATE:20261017\r\n") {
		t.Fatalf("served:\n%s", ics)
	}
	// Mitra moves it and writes no DUE.
	c.must("PUT", c.cal("inbox")+id+".ics", vtodoBody(id, "SUMMARY:Slides", "DTSTART;VALUE=DATE:20261015", "ESTIMATED-DURATION:PT2H"), 204)
	got := e.task(id)
	if got["due"].(map[string]any)["date"] != "2026-10-15" || got["deadline"] != "2026-10-17" || got["estimate_minutes"] != float64(120) {
		t.Fatalf("after move: %v", got)
	}
	_, ics = c.must("GET", c.cal("inbox")+id+".ics", "", 200)
	if !strings.Contains(ics, "DTSTART;VALUE=DATE:20261015\r\n") || !strings.Contains(ics, "DUE;VALUE=DATE:20261017\r\n") {
		t.Fatalf("served back:\n%s", ics)
	}
	// Removing the due date on purpose keeps the deadline.
	c.must("PUT", c.cal("inbox")+id+".ics", vtodoBody(id, "SUMMARY:Slides"), 204)
	if got = e.task(id); got["due"] != nil || got["deadline"] != "2026-10-17" {
		t.Fatalf("due cleared: %v", got)
	}
}

func TestRecurringMovedWithoutDue(t *testing.T) {
	e, c := davSetup(t)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Sync", "due": map[string]any{"date": "2026-10-13", "time": "09:00"}, "recurrence": "every week"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	c.must("PUT", c.cal("inbox")+id+".ics", vtodoBody(id, "SUMMARY:Sync", "DTSTART:20261014T090000", "ESTIMATED-DURATION:PT1H", "RRULE:FREQ=WEEKLY"), 204)
	got := e.task(id)
	d := got["due"].(map[string]any)
	if d["date"] != "2026-10-14" || d["time"] != "09:00" || got["recurrence"] != "every week" {
		t.Fatalf("recurring moved: %v", got)
	}
	// A device receives the move.
	all, _, _ := syncAll(e, "phone", 0)
	if !strings.Contains(fmt.Sprint(all), "2026-10-14") {
		t.Fatal("device did not receive the new date")
	}
}

// TestMitraScheduledUndated: the issue's undated task scheduled in Mitra.
func TestMitraScheduledUndated(t *testing.T) {
	e, c := davSetup(t)
	raw, err := os.ReadFile("../caldav/testdata/mitra/scheduled-undated.ics")
	if err != nil {
		t.Fatal(err)
	}
	c.must("PUT", c.cal("inbox")+"mitra-scheduled.ics", string(raw), 201)
	got := e.task("mitra-scheduled")
	if d := got["due"].(map[string]any); d["date"] != "2026-10-20" || d["time"] != "14:00" || got["estimate_minutes"] != float64(30) {
		t.Fatalf("scheduled: %v", got)
	}
	// Served back with DTSTART = DUE, so Mitra keeps showing it as scheduled (issue #248).
	_, ics := c.must("GET", c.cal("inbox")+"mitra-scheduled.ics", "", 200)
	if !strings.Contains(ics, "DUE:20261020T140000\r\n") || !strings.Contains(ics, "DTSTART:20261020T140000\r\n") || !strings.Contains(ics, "ESTIMATED-DURATION:PT30M\r\n") {
		t.Fatalf("served:\n%s", ics)
	}
	// The served object sent back unchanged writes nothing.
	before := fmt.Sprint(e.caldavOps("mitra-scheduled"))
	c.must("PUT", c.cal("inbox")+"mitra-scheduled.ics", ics, 204)
	if fmt.Sprint(e.caldavOps("mitra-scheduled")) != before {
		t.Fatal("unchanged PUT wrote ops")
	}
}

// TestMitraEchoedDue: Mitra (since its fix for issue #196) moves a task by
// sending the new DTSTART with the DUE it was served (issue #248). The echo is a
// move, not a deadline; a DUE the client changed is still one.
func TestMitraEchoedDue(t *testing.T) {
	e, c := davSetup(t)
	mitra := func(name string) string {
		raw, err := os.ReadFile("../caldav/testdata/mitra/" + name)
		if err != nil {
			t.Fatal(err)
		}
		return string(raw)
	}
	// A timed task moved: due follows DTSTART, no deadline appears.
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Call the bank", "due": map[string]any{"date": "2026-10-22", "time": "14:00"}})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	_, ics := c.must("GET", c.cal("inbox")+id+".ics", "", 200)
	if !strings.Contains(ics, "DTSTART:20261022T140000\r\n") || !strings.Contains(ics, "DUE:20261022T140000\r\n") {
		t.Fatalf("served:\n%s", ics)
	}
	c.must("PUT", c.cal("inbox")+id+".ics", strings.ReplaceAll(mitra("timed-moved-echoed-due.ics"), "mitra-timed-moved", id), 204)
	got := e.task(id)
	if d := got["due"].(map[string]any); d["date"] != "2026-10-23" || d["time"] != "10:00" || got["deadline"] != nil || got["estimate_minutes"] != float64(30) {
		t.Fatalf("timed moved: %v", got)
	}
	// A recurring task moved the same way keeps its rule and gains no deadline.
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Weekly sync", "due": map[string]any{"date": "2026-10-13", "time": "09:00"}, "recurrence": "every week"})
	e.mustStatus(resp, 201, out)
	id = out["id"].(string)
	c.must("PUT", c.cal("inbox")+id+".ics", strings.ReplaceAll(mitra("recurring-moved-echoed-due.ics"), "mitra-recurring-echo", id), 204)
	got = e.task(id)
	if d := got["due"].(map[string]any); d["date"] != "2026-10-14" || d["time"] != "09:00" || got["deadline"] != nil || got["recurrence"] != "every week" {
		t.Fatalf("recurring moved: %v", got)
	}
	// A due-date task scheduled in Mitra: the echoed date is not a deadline.
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Renew the passport", "due": map[string]any{"date": "2026-10-22"}})
	e.mustStatus(resp, 201, out)
	id = out["id"].(string)
	c.must("PUT", c.cal("inbox")+id+".ics", strings.ReplaceAll(mitra("dated-scheduled-echoed-due.ics"), "mitra-dated-scheduled", id), 204)
	got = e.task(id)
	if d := got["due"].(map[string]any); d["date"] != "2026-10-21" || d["time"] != "15:00" || got["deadline"] != nil {
		t.Fatalf("dated scheduled: %v", got)
	}
	// A DUE the client changed is a deadline, as before.
	c.must("PUT", c.cal("inbox")+id+".ics", vtodoBody(id, "SUMMARY:Renew the passport", "DTSTART:20261021T150000", "DUE;VALUE=DATE:20261031"), 204)
	if got = e.task(id); got["deadline"] != "2026-10-31" {
		t.Fatalf("changed due: %v", got)
	}
	// With a deadline, the echoed DUE is the deadline and stays one.
	c.must("PUT", c.cal("inbox")+id+".ics", vtodoBody(id, "SUMMARY:Renew the passport", "DTSTART:20261024T150000", "DUE;VALUE=DATE:20261031"), 204)
	if got = e.task(id); got["deadline"] != "2026-10-31" || got["due"].(map[string]any)["date"] != "2026-10-24" {
		t.Fatalf("deadline kept: %v", got)
	}
}

var alarmUIDRe = regexp.MustCompile(`\r\nUID:([^\r]+)\r\nX-WR-ALARMUID`)

func TestAlarmBecomesReminder(t *testing.T) {
	e, c := davSetup(t)
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:Call", "DUE:20261013T093000", "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT15M", "END:VALARM"), 201)
	rems := e.reminders("t1")
	if len(rems) != 1 || rems[0]["kind"] != "relative" || rems[0]["offset_minutes"] != float64(-15) {
		t.Fatalf("reminders %v", rems)
	}
	want := time.Date(2026, 10, 13, 9, 15, 0, 0, time.UTC).UnixMilli() // floating due read in the user's zone (UTC here)
	if rems[0]["fire_at"] != float64(want) {
		t.Fatalf("fire_at %v, want %d", rems[0]["fire_at"], want)
	}
	rid := rems[0]["id"].(string)
	if e.caldavOps(rid)["kind"] != 1 || e.task("t1")["ical_extra"] != nil {
		t.Fatalf("ops %v task %v", e.caldavOps(rid), e.task("t1"))
	}
	_, ics := c.must("GET", c.cal("inbox")+"t1.ics", "", 200)
	if strings.Count(ics, "BEGIN:VALARM") != 1 || !strings.Contains(ics, "UID:"+rid+"\r\n") || !strings.Contains(ics, "TRIGGER;RELATED=END:-PT15M") || !strings.Contains(ics, "X-OPENTODO-ALARMS:1") {
		t.Fatalf("served:\n%s", ics)
	}
	// The served object sent back unchanged writes nothing.
	before := fmt.Sprint(e.caldavOps("t1"), e.caldavOps(rid))
	c.must("PUT", c.cal("inbox")+"t1.ics", ics, 204)
	if fmt.Sprint(e.caldavOps("t1"), e.caldavOps(rid)) != before || len(e.reminders("t1")) != 1 {
		t.Fatal("unchanged PUT wrote ops")
	}
	// An absolute alarm (Apple Reminders' shape) becomes an absolute reminder.
	c.must("PUT", c.cal("inbox")+"t2.ics", vtodoBody("t2", "SUMMARY:Water", "BEGIN:VALARM", "X-WR-ALARMUID:0D5B2C71-AAAA", "UID:0D5B2C71-AAAA",
		"TRIGGER;VALUE=DATE-TIME:20261011T073000Z", "ACTION:DISPLAY", "END:VALARM"), 201)
	rems = e.reminders("t2")
	if len(rems) != 1 || rems[0]["kind"] != "absolute" || rems[0]["fire_at"] != float64(time.Date(2026, 10, 11, 7, 30, 0, 0, time.UTC).UnixMilli()) || rems[0]["id"] != "0D5B2C71-AAAA" {
		t.Fatalf("absolute %v", rems)
	}
	if _, ics = c.must("GET", c.cal("inbox")+"t2.ics", "", 200); !strings.Contains(ics, "UID:0D5B2C71-AAAA\r\n") || !strings.Contains(ics, "TRIGGER;VALUE=DATE-TIME:20261011T073000Z") {
		t.Fatalf("absolute served:\n%s", ics)
	}
}

func TestAlarmOnUndatedTask(t *testing.T) {
	e, c := davSetup(t)
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:Someday", "BEGIN:VALARM", "TRIGGER:-PT1H", "END:VALARM"), 201)
	rems := e.reminders("t1")
	if len(rems) != 1 || rems[0]["offset_minutes"] != float64(-60) || rems[0]["fire_at"] != nil {
		t.Fatalf("reminders %v", rems)
	}
	if _, ics := c.must("GET", c.cal("inbox")+"t1.ics", "", 200); !strings.Contains(ics, "TRIGGER;RELATED=END:-PT1H") {
		t.Fatalf("served:\n%s", ics)
	}
}

func TestAlarmEditedKeepsIdentity(t *testing.T) {
	e, c := davSetup(t)
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:Call", "DUE:20261013T093000"), 201)
	resp, rem := e.do("POST", "/api/v1/reminders", map[string]any{"task_id": "t1", "kind": "relative", "offset_minutes": -30})
	e.mustStatus(resp, 201, rem)
	rid := rem["id"].(string)
	_, ics := c.must("GET", c.cal("inbox")+"t1.ics", "", 200)
	if !strings.Contains(ics, "TRIGGER;RELATED=END:-PT30M") {
		t.Fatalf("served:\n%s", ics)
	}
	c.must("PUT", c.cal("inbox")+"t1.ics", strings.Replace(ics, "TRIGGER;RELATED=END:-PT30M", "TRIGGER;RELATED=END:-PT1H", 1), 204)
	rems := e.reminders("t1")
	want := time.Date(2026, 10, 13, 8, 30, 0, 0, time.UTC).UnixMilli()
	if len(rems) != 1 || rems[0]["id"] != rid || rems[0]["offset_minutes"] != float64(-60) || rems[0]["fire_at"] != float64(want) {
		t.Fatalf("edited %v", rems)
	}
}

func TestAlarmRemovedTombstones(t *testing.T) {
	e, c := davSetup(t)
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:Call", "DUE:20261013T093000"), 201)
	var ids []string
	for _, off := range []int{-30, -120} {
		resp, rem := e.do("POST", "/api/v1/reminders", map[string]any{"task_id": "t1", "kind": "relative", "offset_minutes": off})
		e.mustStatus(resp, 201, rem)
		ids = append(ids, rem["id"].(string))
	}
	_, ics := c.must("GET", c.cal("inbox")+"t1.ics", "", 200)
	// Drop the first alarm block.
	start := strings.Index(ics, "BEGIN:VALARM\r\nUID:"+ids[0])
	end := strings.Index(ics[start:], "END:VALARM\r\n") + start + len("END:VALARM\r\n")
	c.must("PUT", c.cal("inbox")+"t1.ics", ics[:start]+ics[end:], 204)
	rems := e.reminders("t1")
	if len(rems) != 1 || rems[0]["id"] != ids[1] || e.caldavOps(ids[0])["deleted_at"] != 1 {
		t.Fatalf("after removal %v", rems)
	}
	// Removing the last one: the echoed count says the client saw it.
	_, ics = c.must("GET", c.cal("inbox")+"t1.ics", "", 200)
	start = strings.Index(ics, "BEGIN:VALARM")
	end = strings.Index(ics, "END:VALARM\r\n") + len("END:VALARM\r\n")
	c.must("PUT", c.cal("inbox")+"t1.ics", ics[:start]+ics[end:], 204)
	if rems = e.reminders("t1"); len(rems) != 0 {
		t.Fatalf("last alarm removed: %v", rems)
	}
}

func TestClientWithoutAlarmsLeavesReminders(t *testing.T) {
	e, c := davSetup(t)
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:Call", "DUE:20261013T093000"), 201)
	resp, rem := e.do("POST", "/api/v1/reminders", map[string]any{"task_id": "t1", "kind": "relative", "offset_minutes": -30})
	e.mustStatus(resp, 201, rem)
	// The client never fetched the alarm: no VALARM and no echoed count.
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:Call the bank", "DUE:20261013T093000"), 204)
	if rems := e.reminders("t1"); len(rems) != 1 || e.task("t1")["title"] != "Call the bank" {
		t.Fatalf("reminders %v", rems)
	}
}

func TestTooManyAlarms(t *testing.T) {
	e, c := davSetup(t)
	lines := []string{"SUMMARY:Busy", "DUE:20261013T093000"}
	for i := 1; i <= 25; i++ {
		lines = append(lines, "BEGIN:VALARM", "ACTION:DISPLAY", fmt.Sprintf("TRIGGER:-PT%dM", i), "END:VALARM")
	}
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", lines...), 201)
	if rems := e.reminders("t1"); len(rems) != caldav.MaxMappedAlarms {
		t.Fatalf("%d reminders", len(rems))
	}
	extra, _ := e.task("t1")["ical_extra"].(string)
	if strings.Count(extra, "BEGIN:VALARM") != 5 || !strings.Contains(extra, "TRIGGER:-PT25M") {
		t.Fatalf("kept: %q", extra)
	}
	if _, ics := c.must("GET", c.cal("inbox")+"t1.ics", "", 200); strings.Count(ics, "BEGIN:VALARM") != 25 {
		t.Fatalf("served %d alarms", strings.Count(ics, "BEGIN:VALARM"))
	}
}

func TestUnmappedAlarmSurvivesTitleEdit(t *testing.T) {
	e, c := davSetup(t)
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:A", "BEGIN:VALARM", "ACTION:AUDIO", "TRIGGER:-PT15M", "REPEAT:3", "DURATION:PT5M", "END:VALARM"), 201)
	if rems := e.reminders("t1"); len(rems) != 0 {
		t.Fatalf("audio alarm mapped: %v", rems)
	}
	resp, out := e.do("PATCH", "/api/v1/tasks/t1", map[string]any{"title": "B"})
	e.mustStatus(resp, 200, out)
	_, ics := c.must("GET", c.cal("inbox")+"t1.ics", "", 200)
	if !strings.Contains(ics, "BEGIN:VALARM\r\nACTION:AUDIO\r\nTRIGGER:-PT15M\r\nREPEAT:3\r\nDURATION:PT5M\r\nEND:VALARM") || !strings.Contains(ics, "SUMMARY:B") {
		t.Fatalf("served:\n%s", ics)
	}
}

func TestDeadlineReminderRoundTrip(t *testing.T) {
	e, c := davSetup(t)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Taxes", "deadline": "2026-11-06"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	resp, rem := e.do("POST", "/api/v1/reminders", map[string]any{"task_id": id, "kind": "deadline", "offset_minutes": -1440})
	e.mustStatus(resp, 201, rem)
	rid := rem["id"].(string)
	_, ics := c.must("GET", c.cal("inbox")+id+".ics", "", 200)
	if !strings.Contains(ics, "TRIGGER;RELATED=END:-P1D\r\nX-OPENTODO-KIND:DEADLINE") {
		t.Fatalf("served:\n%s", ics)
	}
	c.must("PUT", c.cal("inbox")+id+".ics", ics, 204)
	if ops := e.caldavOps(rid); len(ops) != 0 {
		t.Fatalf("unchanged alarm wrote %v", ops)
	}
	// A plain alarm a client adds on a deadline task counts from DUE, the deadline.
	c.must("PUT", c.cal("inbox")+id+".ics", strings.Replace(ics, "END:VTODO", "BEGIN:VALARM\r\nTRIGGER:-PT2H\r\nEND:VALARM\r\nEND:VTODO", 1), 204)
	kinds := map[string]int{}
	for _, r := range e.reminders(id) {
		kinds[r["kind"].(string)]++
	}
	if kinds["deadline"] != 2 {
		t.Fatalf("kinds %v", kinds)
	}
}

func TestEtagChangesOnReminderEdit(t *testing.T) {
	e, c := davSetup(t)
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:Call", "DUE:20261013T093000"), 201)
	_, ms := c.must("REPORT", c.cal("inbox"), `<?xml version="1.0"?><d:sync-collection xmlns:d="DAV:"><d:sync-token/><d:prop><d:getetag/></d:prop></d:sync-collection>`, 207)
	tok := regexp.MustCompile(`<d:sync-token>([^<]+)</d:sync-token>`).FindStringSubmatch(ms)[1]
	etag := etagRe.FindStringSubmatch(ms)[1]
	resp, rem := e.do("POST", "/api/v1/reminders", map[string]any{"task_id": "t1", "kind": "relative", "offset_minutes": -30})
	e.mustStatus(resp, 201, rem)
	_, ms = c.must("REPORT", c.cal("inbox"), `<?xml version="1.0"?><d:sync-collection xmlns:d="DAV:"><d:sync-token>`+tok+`</d:sync-token><d:prop><d:getetag/></d:prop></d:sync-collection>`, 207)
	m := etagRe.FindStringSubmatch(ms)
	if m == nil || m[1] == etag || !strings.Contains(ms, "t1.ics") {
		t.Fatalf("resource not reported with a new ETag:\n%s", ms)
	}
	if _, ics := c.must("GET", c.cal("inbox")+"t1.ics", "", 200); !strings.Contains(ics, "UID:"+rem["id"].(string)) {
		t.Fatalf("new alarm not served:\n%s", ics)
	}
	// A device's tombstone is reported too.
	_, ms = c.must("REPORT", c.cal("inbox"), `<?xml version="1.0"?><d:sync-collection xmlns:d="DAV:"><d:sync-token/><d:prop><d:getetag/></d:prop></d:sync-collection>`, 207)
	tok = regexp.MustCompile(`<d:sync-token>([^<]+)</d:sync-token>`).FindStringSubmatch(ms)[1]
	resp, out := e.do("DELETE", "/api/v1/reminders/"+rem["id"].(string), nil)
	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		t.Fatalf("delete reminder: %d %v", resp.StatusCode, out)
	}
	_, ms = c.must("REPORT", c.cal("inbox"), `<?xml version="1.0"?><d:sync-collection xmlns:d="DAV:"><d:sync-token>`+tok+`</d:sync-token><d:prop><d:getetag/></d:prop></d:sync-collection>`, 207)
	if !strings.Contains(ms, "t1.ics") {
		t.Fatalf("tombstoned reminder not reported:\n%s", ms)
	}
}

func TestDismissalStaysLocal(t *testing.T) {
	e, c := davSetup(t)
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:Call", "DUE:20261013T093000", "BEGIN:VALARM", "TRIGGER:-PT15M", "END:VALARM"), 201)
	rid := e.reminders("t1")[0]["id"].(string)
	_, before := c.must("GET", c.cal("inbox")+"t1.ics", "", 200)
	_, cursor, _ := syncAll(e, "laptop", 0)
	syncOnce(e, "laptop", cursor, []map[string]any{laterOp("dis", "reminder", rid, "dismissed_at", time.Now().UnixMilli())})
	_, after := c.must("GET", c.cal("inbox")+"t1.ics", "", 200)
	if alarmUIDRe.FindString(before) != alarmUIDRe.FindString(after) || !strings.Contains(after, "TRIGGER;RELATED=END:-PT15M") {
		t.Fatalf("alarm changed after a dismissal:\n%s", after)
	}
	ops := fmt.Sprint(e.caldavOps(rid))
	c.must("PUT", c.cal("inbox")+"t1.ics", after, 204)
	if fmt.Sprint(e.caldavOps(rid)) != ops || e.reminders("t1")[0]["dismissed_at"] == nil {
		t.Fatalf("the PUT touched the reminder: %v %v", e.caldavOps(rid), e.reminders("t1"))
	}
}

func TestLaterReminderDeleteWins(t *testing.T) {
	e, c := davSetup(t)
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:Call", "DUE:20261013T093000", "BEGIN:VALARM", "TRIGGER:-PT15M", "END:VALARM"), 201)
	rid := e.reminders("t1")[0]["id"].(string)
	_, ics := c.must("GET", c.cal("inbox")+"t1.ics", "", 200)
	_, cursor, _ := syncAll(e, "laptop", 0)
	c.must("PUT", c.cal("inbox")+"t1.ics", strings.Replace(ics, "-PT15M", "-PT45M", 1), 204)
	syncOnce(e, "laptop", cursor, []map[string]any{laterOp("del", "reminder", rid, "deleted_at", time.Now().UnixMilli())})
	if rems := e.reminders("t1"); len(rems) != 0 {
		t.Fatalf("not converged: %v", rems)
	}
	if _, ics = c.must("GET", c.cal("inbox")+"t1.ics", "", 200); strings.Contains(ics, "BEGIN:VALARM") {
		t.Fatalf("deleted reminder still served:\n%s", ics)
	}
}

func TestAlarmWriteRequiresAuth(t *testing.T) {
	e, c := davSetup(t)
	anon := &davClient{e: e, email: c.email, secret: "wrong password entirely", uid: c.uid}
	resp, _ := anon.req("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:Call", "BEGIN:VALARM", "TRIGGER:-PT15M", "END:VALARM"))
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status %d", resp.StatusCode)
	}
	if rems := e.reminders("t1"); len(rems) != 0 {
		t.Fatalf("reminder written without auth: %v", rems)
	}
}
