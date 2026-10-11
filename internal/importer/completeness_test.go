package importer

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"testing"
	"time"
)

// Tests for OpenSpec change import-completeness: sections, recurrence and
// reminders survive imports.

func TestParseRecurrence(t *testing.T) {
	cases := []struct {
		in, due, want string
	}{
		{"every week", "", "every week"},
		{"Every Monday, Wednesday", "", "every monday, wednesday"},
		{"every 2 weeks after completion", "", "every 2 weeks after completion"},
		{"FREQ=WEEKLY", "", "every week"},
		{"RRULE:FREQ=WEEKLY;INTERVAL=2", "2026-10-13", "every 2 weeks"},
		{"DTSTART:20261013T090000Z\nRRULE:FREQ=MONTHLY;BYMONTHDAY=15", "", "every 15th"},
		{"FREQ=WEEKLY;BYDAY=MO,FR", "", "every monday, friday"},
		{"daily", "", "every day"},
		{"Weekly", "", "every week"},
		{"annually", "", "every year"},
		{"biweekly", "", "every 2 weeks"},
		{"fortnightly", "", "every 2 weeks"},
		{"every other month", "", "every 2 months"},
		{"every workday", "", "every weekday"},
		{"weekdays", "", "every weekday"},
		{"every weekend", "", "every saturday, sunday"},
		{"every! 3 days", "", "every 3 days after completion"},
		{"every! week until 2027-01-01", "", "every week after completion until 2027-01-01"},
		{"every tue 4pm", "", "every tuesday"},
		{"every day at 09:00", "", "every day"},
		{"every mon at 9", "", "every monday"},
		{"each friday", "", "every friday"},
		{"every last friday", "", "every last friday"},
		{"every 3rd tuesday", "", "every 3rd tuesday"},
		{"every 15th", "", "every 15th"},
		{"every 3 hours", "", ""},
		{"hourly", "", ""},
		{"FREQ=HOURLY", "", ""},
		{"every mon starting next week", "", ""},
		{"every other monday", "", ""},
		{"whenever I feel like it", "", ""},
	}
	for _, c := range cases {
		got, err := parseRecurrence(c.in, c.due)
		if c.want == "" {
			if err == nil {
				t.Errorf("%q: got %q, want unsupported", c.in, got)
			}
			continue
		}
		if err != nil || got != c.want {
			t.Errorf("%q: got %q, %v; want %q", c.in, got, err, c.want)
		}
	}
	objects := []struct {
		in   string
		want string
	}{
		{`{"frequency":"daily","interval":3}`, "every 3 days"},
		{`{"freq":"WEEKLY","days":["MO","TH"]}`, "every monday, thursday"},
		{`{"pattern":{"type":"absoluteMonthly","interval":1}}`, "every month"},
		{`{"type":"yearly"}`, "every year"},
		{`["RRULE:FREQ=DAILY;INTERVAL=2"]`, "every 2 days"},
		{`{"rrule":"FREQ=MONTHLY;BYDAY=-1FR"}`, "every last friday"},
		{`{"frequency":"weekly","interval":2,"days":["monday"]}`, ""},
		{`{"frequency":"minutely"}`, ""},
	}
	for _, c := range objects {
		v, err := decodeJSON(strings.NewReader(c.in))
		if err != nil {
			t.Fatal(err)
		}
		got, _, err := recurrenceFrom(v, "")
		if (c.want == "") != (err != nil) || got != c.want {
			t.Errorf("%s: got %q, %v; want %q", c.in, got, err, c.want)
		}
	}
}

func TestParseReminder(t *testing.T) {
	rome := mustLoc(t, "Europe/Rome")
	at := func(y, m, d, hh, mm int, loc *time.Location) int64 {
		return time.Date(y, time.Month(m), d, hh, mm, 0, 0, loc).UnixMilli()
	}
	cases := []struct {
		in   string
		want Reminder
		err  string
	}{
		{`30`, Reminder{Offset: -30}, ""},
		{`"45"`, Reminder{Offset: -45}, ""},
		{`"15m"`, Reminder{Offset: -15}, ""},
		{`"1 hour before"`, Reminder{Offset: -60}, ""},
		{`"2d"`, Reminder{Offset: -2880}, ""},
		{`"-PT15M"`, Reminder{Offset: -15}, ""},
		{`"-P1DT2H"`, Reminder{Offset: -1560}, ""},
		{`"PT10M"`, Reminder{Offset: 10}, ""},
		{`"2026-10-20T08:00"`, Reminder{Absolute: true, At: at(2026, 10, 20, 8, 0, rome)}, ""},
		{`"2026-10-20T08:00:00Z"`, Reminder{Absolute: true, At: at(2026, 10, 20, 8, 0, time.UTC)}, ""},
		{`"2026-10-20"`, Reminder{Absolute: true, At: at(2026, 10, 20, 9, 0, rome)}, ""},
		{`{"type":"relative","minute_offset":30}`, Reminder{Offset: -30}, ""},
		{`{"offset_minutes":-90}`, Reminder{Offset: -90}, ""},
		{`{"minutesBefore":5}`, Reminder{Offset: -5}, ""},
		{`{"trigger":"-PT1H"}`, Reminder{Offset: -60}, ""},
		{`{"type":"absolute","due":{"date":"2026-10-14T15:00:00"}}`, Reminder{Absolute: true, At: at(2026, 10, 14, 15, 0, rome)}, ""},
		{`{"remind_at":"2026-10-14T15:00:00+02:00"}`, Reminder{Absolute: true, At: at(2026, 10, 14, 15, 0, rome)}, ""},
		{`{"type":"location","name":"Office"}`, Reminder{}, "location reminder dropped (not supported)"},
		{`"next tuesday-ish"`, Reminder{}, `reminder "next tuesday-ish" dropped (not recognised)`},
		{`{"note":"x"}`, Reminder{}, `dropped (not recognised)`},
	}
	for _, c := range cases {
		v, err := decodeJSON(strings.NewReader(c.in))
		if err != nil {
			t.Fatal(err)
		}
		got, err := reminderFrom(v, rome)
		if c.err != "" {
			if err == nil || !strings.Contains(err.Error(), c.err) {
				t.Errorf("%s: err %v, want %q", c.in, err, c.err)
			}
			continue
		}
		if err != nil || got != c.want {
			t.Errorf("%s: got %+v, %v; want %+v", c.in, got, err, c.want)
		}
	}
	row := Row{}
	addReminders(&row, []any{json.Number("600000")}, rome)
	if len(row.Reminders) != 0 || len(row.Warnings) != 1 {
		t.Fatalf("offset beyond a year: %+v", row)
	}
}

// fixedNow pins the service clock so reminder firing times relative to "now"
// are deterministic.
func (h *harness) fixedNow(t time.Time) { h.svc.now = func() time.Time { return t } }

func TestPreviewCountsCompleteness(t *testing.T) {
	h := newHarness(t)
	h.fixedNow(time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC))
	plan, err := h.svc.Preview(context.Background(), h.uid, fixture(t, "items.json"), Options{TimeZone: "UTC"})
	if err != nil {
		t.Fatal(err)
	}
	// Sections Backlog and Waiting (the deleted one is not listed), the recurring
	// agenda and rent tasks, and the two reminders of the deck (the location
	// reminder and the deleted one are not).
	if plan.Totals.NewSections != 2 || plan.Totals.Recurring != 2 || plan.Totals.Reminders != 2 || plan.Totals.Error != 0 {
		t.Fatalf("totals = %+v", plan.Totals)
	}
	var sync RowResult
	for _, r := range plan.Rows {
		if r.SourceID == "item:6" {
			sync = r
		}
	}
	if sync.Outcome != OutcomeCreate || !reflect.DeepEqual(sync.Warnings, []string{`recurrence "every mon starting next week" not supported; imported without a rule`}) {
		t.Fatalf("unsupported recurrence row = %+v", sync)
	}
	if h.count(`SELECT COUNT(*) FROM ops`) != 0 {
		t.Fatal("preview wrote ops")
	}
	// The JSON shape carries the new counts and notes.
	b, _ := json.Marshal(plan)
	for _, k := range []string{`"newSections":2`, `"recurring":2`, `"reminders":2`, `"notes":[]`} {
		if !strings.Contains(string(b), k) {
			t.Fatalf("preview JSON lacks %s: %s", k, b)
		}
	}
}

func TestForeignRemindersPlanned(t *testing.T) {
	h := newHarness(t)
	now := time.Date(2026, 10, 14, 20, 0, 0, 0, time.UTC)
	h.fixedNow(now)
	job := h.run(string(fixture(t, "items.json")), Options{TimeZone: "Europe/Rome"})
	if job.Status != StatusDone {
		t.Fatalf("job = %+v", job)
	}
	tasks := byTitle(h.list("task", false))
	deck := tasks["Kickoff deck"]
	rome := mustLoc(t, "Europe/Rome")
	got := map[string]map[string]string{}
	for _, r := range h.list("reminder", false) {
		if str(r, "task_id") != str(deck, "id") {
			t.Fatalf("reminder on another task: %v", r)
		}
		got[str(r, "kind")] = map[string]string{"offset": string(r["offset_minutes"]), "fire": string(r["fire_at"]), "dismissed": string(r["dismissed_at"])}
	}
	// Relative: 30 minutes before the date-only due (09:00 Rome) on 2026-10-15 —
	// still ahead of "now", so it fires normally.
	rel := fmt.Sprint(time.Date(2026, 10, 15, 8, 30, 0, 0, rome).UnixMilli())
	if got["relative"]["offset"] != "-30" || got["relative"]["fire"] != rel || got["relative"]["dismissed"] != "null" {
		t.Fatalf("relative = %v", got["relative"])
	}
	// Absolute 2026-10-14 15:00 Rome already passed: imported as dismissed.
	abs := fmt.Sprint(time.Date(2026, 10, 14, 15, 0, 0, 0, rome).UnixMilli())
	if got["absolute"]["fire"] != abs || got["absolute"]["dismissed"] != fmt.Sprint(now.UnixMilli()) {
		t.Fatalf("absolute = %v", got["absolute"])
	}
	// A rule on a task without a due date gives it the rule's first date.
	h2 := newHarness(t)
	h2.fixedNow(time.Date(2026, 10, 14, 10, 0, 0, 0, time.UTC)) // a Wednesday
	h2.run("title,recurrence,reminder\nBins,every friday,10m before\nLoose,,15\n", Options{})
	got2 := byTitle(h2.list("task", false))
	if string(got2["Bins"]["due"]) != `{"date":"2026-10-16"}` || str(got2["Bins"], "recurrence") != "every friday" {
		t.Fatalf("bins = %v", got2["Bins"])
	}
	for _, r := range h2.list("reminder", false) {
		if str(r, "task_id") == str(got2["Loose"], "id") && string(r["fire_at"]) != "null" {
			t.Fatalf("relative reminder without a due fires: %v", r)
		}
	}
}

func TestForeignSectionsCreatedAndReused(t *testing.T) {
	h := newHarness(t)
	h.write("web", 1000, "project", "pw", map[string]any{"name": "Work", "color": "#000", "position": 1, "archived": false, "created_at": 1})
	h.write("web", 1000, "section", "sb", map[string]any{"name": "Backlog", "project_id": "pw", "position": 1, "created_at": 1})
	data := "title,project,section\nA,Work,backlog\nB,Work,Q4\nC,Work,q4\nD,,Someday\n"
	plan, err := h.svc.Preview(context.Background(), h.uid, []byte(data), Options{})
	if err != nil {
		t.Fatal(err)
	}
	if plan.Totals.NewSections != 1 || plan.Totals.NewLabels != 1 {
		t.Fatalf("totals = %+v", plan.Totals)
	}
	if w := plan.Rows[3].Warnings; len(w) != 1 || !strings.Contains(w[0], "section imported as a label") {
		t.Fatalf("inbox row = %+v", plan.Rows[3])
	}
	h.run(data, Options{})
	tasks := byTitle(h.list("task", false))
	sections := byTitle(h.list("section", false))
	if len(sections) != 2 || str(tasks["A"], "section_id") != "sb" || str(tasks["B"], "section_id") != str(sections["Q4"], "id") ||
		str(tasks["C"], "section_id") != str(sections["Q4"], "id") || str(sections["Q4"], "project_id") != "pw" || str(tasks["D"], "section_id") != "" {
		t.Fatalf("sections = %v tasks = %v", sections, tasks)
	}
	// A target project gives Inbox rows a project, so their section is a section.
	plan, _ = h.svc.Preview(context.Background(), h.uid, []byte("title,section\nE,Someday\n"), Options{TargetProject: "pw"})
	if plan.Totals.NewSections != 1 || plan.Totals.NewLabels != 0 {
		t.Fatalf("target project totals = %+v", plan.Totals)
	}
	// The old behaviours stay available.
	for opt, labels := range map[string]int{"label": 1, "ignore": 0} {
		plan, _ = h.svc.Preview(context.Background(), h.uid, []byte("title,project,section\nF,Work,Fresh\n"), Options{Sections: opt})
		if plan.Totals.NewSections != 0 || plan.Totals.NewLabels != labels {
			t.Fatalf("sections=%s totals = %+v", opt, plan.Totals)
		}
	}
}

func TestUndoRemovesSectionsAndReminders(t *testing.T) {
	h := newHarness(t)
	h.fixedNow(time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC))
	job := h.run(string(fixture(t, "items.json")), Options{})
	if len(h.list("section", false)) != 2 || len(h.list("reminder", false)) != 2 {
		t.Fatalf("import did not create sections and reminders")
	}
	// The user later files their own task into an imported section.
	backlog := byTitle(h.list("section", false))["Backlog"]
	h.write("web", 1000, "task", "mine", map[string]any{"title": "Mine", "priority": 4, "section_id": str(backlog, "id")})
	if _, err := h.svc.Undo(context.Background(), h.uid, job.ID); err != nil {
		t.Fatal(err)
	}
	if n := len(h.list("section", false)); n != 0 {
		t.Fatalf("%d sections left after undo", n)
	}
	if n := len(h.list("reminder", false)); n != 0 {
		t.Fatalf("%d reminders left after undo", n)
	}
	if n := len(h.list("section", true)); n != 2 {
		t.Fatalf("undone sections are tombstones: %d", n)
	}
	mine := byTitle(h.list("task", false))["Mine"]
	if !isNull(mine["section_id"]) {
		t.Fatalf("own task still in an undone section: %v", mine)
	}
	// The file can be imported again after the undo.
	again := h.run(string(fixture(t, "items.json")), Options{})
	if again.Totals.NewSections != 2 || len(h.list("section", false)) != 2 {
		t.Fatalf("re-import after undo = %+v", again.Totals)
	}
}

const fullOwnExport = `{
  "format": "opentodo-export", "version": 1, "exportedAt": "2026-10-10T10:00:00Z",
  "labels": [{"id": "l1", "name": "errand", "color": "#f00", "position": 1, "created_at": 1}],
  "projects": [{"id": "p1", "name": "Home", "color": "#0f0", "position": 1, "archived": false, "created_at": 1, "role": "editor", "owner_id": "someone"}],
  "sections": [
    {"id": "s1", "name": "Doing", "project_id": "p1", "position": 1, "created_at": 2},
    {"id": "s2", "name": "Gone", "project_id": "p1", "position": 2, "created_at": 2, "deleted_at": 3}
  ],
  "tasks": [
    {"id": "t1", "title": "Water plants", "description": "", "priority": 4, "position": 1, "created_at": 5, "labels": ["l1"],
     "project_id": "p1", "section_id": "s1", "recurrence": "Every  Monday", "due": {"date": "2026-10-19", "time": "08:00", "tz": "Europe/Rome"},
     "estimate_minutes": 15, "notes_doc": "ydoc:v1:AQID", "ical_extra": "X-FOO:bar", "assignee_id": "u1", "completed_at": null},
    {"id": "t1-occ", "title": "Water plants", "description": "", "priority": 4, "position": 1, "created_at": 5, "labels": [],
     "project_id": "p1", "series_id": "t1", "due": {"date": "2026-10-12"}, "completed_at": 1760300000000},
    {"id": "t2", "title": "Shared chore", "description": "", "priority": 4, "position": 2, "created_at": 5, "labels": [], "assignee_id": "someone-else"}
  ],
  "reminders": [
    {"id": "r-future", "task_id": "t1", "kind": "absolute", "offset_minutes": null, "fire_at": 1893456000000, "delivered_at": null, "dismissed_at": null, "created_at": 6},
    {"id": "r-relative", "task_id": "t1", "kind": "relative", "offset_minutes": -15, "fire_at": 1792390500000, "delivered_at": null, "dismissed_at": null, "created_at": 6},
    {"id": "r-stale", "task_id": "t2", "kind": "absolute", "offset_minutes": null, "fire_at": 1600000000000, "delivered_at": null, "dismissed_at": null, "created_at": 6},
    {"id": "r-delivered", "task_id": "t2", "kind": "absolute", "offset_minutes": null, "fire_at": 1600000000000, "delivered_at": 1600000001000, "dismissed_at": null, "created_at": 6},
    {"id": "r-orphan", "task_id": "nope", "kind": "absolute", "offset_minutes": null, "fire_at": 1893456000000, "created_at": 6}
  ],
  "views": [
    {"id": "v1", "name": "Today", "query": "due:today", "kind": "list", "group_by": "none", "sort_by": "due", "sort_dir": "asc", "pinned": true, "position": 1, "color": "", "panels": [], "created_at": 7},
    {"id": "v2", "name": "Board", "query": "", "kind": "dashboard", "group_by": "none", "sort_by": "due", "sort_dir": "asc", "pinned": false, "position": 2, "color": "", "panels": ["v1"], "created_at": 7}
  ],
  "comments": [
    {"id": "c1", "task_id": "t1", "author_id": "someone", "body": "hi", "mentions": [], "created_at": 8},
    {"id": "c2", "task_id": "t1", "author_id": "someone", "body": "ho", "mentions": [], "created_at": 9}
  ],
  "encryption": null
}`

func TestOwnExportReadsAllEntities(t *testing.T) {
	p := parse(t, []byte(fullOwnExport), Options{})
	var kinds []string
	for _, r := range p.Rows {
		kinds = append(kinds, r.Kind)
	}
	want := []string{"label", "project", "section", "section", "task", "task", "task", "reminder", "reminder", "reminder", "reminder", "reminder", "view", "view"}
	if !reflect.DeepEqual(kinds, want) {
		t.Fatalf("kinds = %v", kinds)
	}
	if len(p.Notes) != 1 || !strings.HasPrefix(p.Notes[0], "2 comments are not imported") {
		t.Fatalf("notes = %v", p.Notes)
	}
	if r := rowBySource(t, p, "r-future"); r.Title != "Reminder: Water plants" {
		t.Fatalf("reminder title = %q", r.Title)
	}
}

func TestOwnExportRecurrenceAssigneeReminders(t *testing.T) {
	h := newHarness(t)
	now := time.Date(2026, 10, 11, 12, 0, 0, 0, time.UTC)
	h.fixedNow(now)
	plan, err := h.svc.Preview(context.Background(), h.uid, []byte(fullOwnExport), Options{})
	if err != nil {
		t.Fatal(err)
	}
	if plan.Totals.NewSections != 1 || plan.Totals.Recurring != 1 || plan.Totals.Reminders != 4 || plan.Totals.Error != 1 ||
		len(plan.Notes) != 1 || plan.Totals.Create != 13 {
		t.Fatalf("totals = %+v notes = %v", plan.Totals, plan.Notes)
	}
	rows := map[string]RowResult{}
	for _, r := range plan.Rows {
		rows[r.SourceID] = r
	}
	if r := rows["p1"]; len(r.Warnings) != 0 {
		t.Fatalf("sharing annotations warned: %v", r.Warnings)
	}
	if r := rows["r-orphan"]; r.Outcome != OutcomeError || !strings.Contains(r.Reason, "task nope") {
		t.Fatalf("orphan reminder = %+v", r)
	}
	if r := rows["t2"]; len(r.Warnings) != 1 || !strings.Contains(r.Warnings[0], "assignee dropped") {
		t.Fatalf("foreign assignee = %+v", r)
	}
	if r := rows["r-stale"]; !reflect.DeepEqual(r.Warnings, []string{warnPastReminder}) {
		t.Fatalf("stale reminder = %+v", r)
	}
	for _, id := range []string{"r-future", "r-delivered", "t1"} {
		if len(rows[id].Warnings) != 0 {
			t.Fatalf("%s warned: %v", id, rows[id].Warnings)
		}
	}

	job := h.run(fullOwnExport, Options{})
	if job.Status != StatusDone || job.Totals.Written != 13 {
		t.Fatalf("job = %+v", job)
	}
	get := func(entity, id string) map[string]json.RawMessage {
		e, err := h.sync.Get(context.Background(), h.uid, entity, id)
		if err != nil || e == nil {
			t.Fatalf("%s %s: %v %v", entity, id, e, err)
		}
		return e
	}
	t1 := get("task", "t1")
	if str(t1, "recurrence") != "every monday" || str(t1, "section_id") != "s1" || str(t1, "assignee_id") != "u1" ||
		!jsonEqual(t1["due"], json.RawMessage(`{"date":"2026-10-19","time":"08:00","tz":"Europe/Rome"}`)) || string(t1["estimate_minutes"]) != "15" ||
		str(t1, "notes_doc") != "ydoc:v1:AQID" || str(t1, "ical_extra") != "X-FOO:bar" {
		t.Fatalf("t1 = %v", t1)
	}
	if occ := get("task", "t1-occ"); str(occ, "series_id") != "t1" {
		t.Fatalf("occurrence = %v", occ)
	}
	if t2 := get("task", "t2"); !isNull(t2["assignee_id"]) {
		t.Fatalf("t2 assignee = %s", t2["assignee_id"])
	}
	if s2 := get("section", "s2"); isNull(s2["deleted_at"]) {
		t.Fatalf("section tombstone lost: %v", s2)
	}
	if r := get("reminder", "r-stale"); string(r["dismissed_at"]) != fmt.Sprint(now.UnixMilli()) {
		t.Fatalf("stale reminder = %v", r)
	}
	if r := get("reminder", "r-delivered"); !isNull(r["dismissed_at"]) || string(r["delivered_at"]) != "1600000001000" {
		t.Fatalf("delivered reminder = %v", r)
	}
	if r := get("reminder", "r-relative"); string(r["offset_minutes"]) != "-15" || string(r["fire_at"]) != "1792390500000" || !isNull(r["dismissed_at"]) {
		t.Fatalf("relative reminder = %v", r)
	}
	if v := get("view", "v2"); string(v["panels"]) != `["v1"]` {
		t.Fatalf("view = %v", v)
	}
	if n := h.count(`SELECT COUNT(*) FROM ops WHERE entity = 'comment'`); n != 0 {
		t.Fatalf("%d comment ops written", n)
	}
	// Undo removes the sections, reminders and views too.
	if _, err := h.svc.Undo(context.Background(), h.uid, job.ID); err != nil {
		t.Fatal(err)
	}
	for _, kind := range []string{"section", "reminder", "view", "task", "project", "label"} {
		if n := len(h.list(kind, false)); n != 0 {
			t.Fatalf("%d %s left after undo", n, kind)
		}
	}
}
