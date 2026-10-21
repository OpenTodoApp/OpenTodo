package importer

import (
	"strconv"
	"strings"
	"testing"
	"time"
)

// Scenario tests for the profiles of OpenSpec change more-importers; the golden
// previews in testdata/<format>/ cover the full mapping of each fixture.

func parseIn(t *testing.T, data string, zone string) *Parsed {
	t.Helper()
	p, err := parseWith(t, []byte(data), func(o *Options) {
		if zone != "" {
			loc, err := time.LoadLocation(zone)
			if err != nil {
				t.Fatal(err)
			}
			o.loc = loc
		}
		o.importerName = "Owner Example"
	})
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func taskRow(t *testing.T, p *Parsed, title string) Row {
	t.Helper()
	for _, r := range p.Rows {
		if r.Kind == KindTask && r.Title == title {
			return r
		}
	}
	t.Fatalf("no task %q in %+v", title, p.Rows)
	return Row{}
}

func hasWarning(r Row, substr string) bool {
	for _, w := range r.Warnings {
		if strings.Contains(w, substr) {
			return true
		}
	}
	return false
}

func TestWindowsZones(t *testing.T) {
	for win, iana := range map[string]string{
		"Pacific Standard Time":   "America/Los_Angeles",
		"W. Europe Standard Time": "Europe/Berlin",
		"UTC":                     "Etc/UTC",
	} {
		if got := windowsZones[win]; got != iana {
			t.Errorf("%s: got %q, want %s", win, got, iana)
		}
	}
	for _, z := range windowsZones {
		if _, err := time.LoadLocation(z); err != nil {
			t.Errorf("zone %s does not load: %v", z, err)
		}
	}
}

func TestGoogleTasksDueDoesNotShift(t *testing.T) {
	// Google writes the due date as midnight UTC; the date part is the date the
	// user chose, whatever the import's zone.
	p := parseIn(t, `{"kind":"tasks#taskLists","items":[{"kind":"tasks#taskList","id":"l1","title":"Errands","items":[
		{"kind":"tasks#task","id":"t1","title":"Post office","status":"needsAction","due":"2026-11-03T00:00:00.000Z"},
		{"kind":"tasks#task","id":"t2","title":"Broken","status":"needsAction","due":"next week"}]}]}`, "America/Los_Angeles")
	if p.Format != "google-tasks-json" {
		t.Fatalf("format %s", p.Format)
	}
	r := taskRow(t, p, "Post office")
	if r.Due == nil || r.Due.Date != "2026-11-03" || r.Due.Time != "" {
		t.Fatalf("due %+v", r.Due)
	}
	if b := taskRow(t, p, "Broken"); b.Due != nil || !hasWarning(b, "due") {
		t.Fatalf("malformed due must warn and be dropped: %+v", b)
	}
}

func TestTrelloDueConvertedToZone(t *testing.T) {
	p := parseIn(t, `{"id":"b1","name":"Home","lists":[{"id":"l1","name":"To do","pos":1}],"checklists":[],"labels":[],"actions":[],"members":[],
		"cards":[{"id":"c1","name":"Fix tap","idList":"l1","due":"2026-11-05T17:00:00.000Z","dueComplete":false,"labels":[],"closed":false}]}`, "Europe/Rome")
	r := taskRow(t, p, "Fix tap")
	if r.Due == nil || r.Due.Date != "2026-11-05" || r.Due.Time != "18:00" {
		t.Fatalf("due %+v, want 2026-11-05 18:00 in Rome", r.Due)
	}
}

func TestMicrosoftToDoWeeklyAndZone(t *testing.T) {
	p := parseIn(t, `[{"displayName":"Work","wellknownListName":"none","id":"l1","tasks":[
		{"id":"t1","title":"Stand-up","importance":"normal","status":"notStarted",
		 "dueDateTime":{"dateTime":"2026-11-03T23:00:00.0000000","timeZone":"Pacific Standard Time"},
		 "recurrence":{"pattern":{"type":"weekly","interval":1,"daysOfWeek":["monday","wednesday"]},"range":{"type":"noEnd"}}}]}]`, "Europe/Berlin")
	if p.Format != "microsoft-todo-json" {
		t.Fatalf("format %s", p.Format)
	}
	r := taskRow(t, p, "Stand-up")
	if r.Recurrence != "every monday, wednesday" {
		t.Fatalf("recurrence %q", r.Recurrence)
	}
	if r.Due == nil || r.Due.Date != "2026-11-03" || r.Due.Time != "" {
		t.Fatalf("due %+v: To Do due dates are dates in their own zone", r.Due)
	}
}

func TestMicrosoftToDoNotAFile(t *testing.T) {
	if p, err := Detect([]byte(`[{"displayName":"Work","id":"l1"}]`), ""); err == nil && p.Name() == "microsoft-todo-json" {
		t.Fatal("a list without To Do keys must not be detected as Microsoft To Do")
	}
}

func TestAppleRemindersPriorityAndTime(t *testing.T) {
	p := parseIn(t, `[
		{"identifier":"a","list":"Home","title":"High","isCompleted":false,"priority":1,"dueDate":"2026-11-03T17:30:00+01:00"},
		{"identifier":"b","list":"Home","title":"Medium","isCompleted":false,"priority":5,"dueDate":"2026-11-04"},
		{"identifier":"c","list":"Home","title":"Low","isCompleted":false,"priority":9},
		{"identifier":"d","list":"Home","title":"None","isCompleted":false,"priority":0}]`, "Europe/Rome")
	for title, want := range map[string]int{"High": 1, "Medium": 2, "Low": 3, "None": 4} {
		if got := taskRow(t, p, title).Priority; got != want && !(want == 4 && got == 0) {
			t.Errorf("%s: priority %d, want %d", title, got, want)
		}
	}
	if d := taskRow(t, p, "High").Due; d == nil || d.Date != "2026-11-03" || d.Time != "17:30" {
		t.Fatalf("timed due %+v, want 17:30 in Rome", d)
	}
	if d := taskRow(t, p, "Medium").Due; d == nil || d.Date != "2026-11-04" || d.Time != "" {
		t.Fatalf("all-day due %+v", d)
	}
}

func TestAnyDoMidnightAndWeekly(t *testing.T) {
	midnight := time.Date(2026, 11, 3, 0, 0, 0, 0, time.UTC).UnixMilli()
	evening := time.Date(2026, 11, 3, 17, 30, 0, 0, time.UTC).UnixMilli()
	p := parseIn(t, `{"categories":[{"id":"c","name":"Work","isDefault":false}],"tasks":[
		{"globalTaskId":"1","categoryId":"c","title":"All day","status":"UNCHECKED","dueDate":`+strconv.FormatInt(midnight, 10)+`,"repeatingMethod":"TASK_REPEAT_WEEK"},
		{"globalTaskId":"2","categoryId":"c","title":"Timed","status":"UNCHECKED","dueDate":`+strconv.FormatInt(evening, 10)+`},
		{"globalTaskId":"3","categoryId":"c","title":"Gone","status":"DELETED"}]}`, "")
	r := taskRow(t, p, "All day")
	if r.Due == nil || r.Due.Date != "2026-11-03" || r.Due.Time != "" || r.Recurrence != "every week" {
		t.Fatalf("midnight weekly: due %+v recurrence %q", r.Due, r.Recurrence)
	}
	if d := taskRow(t, p, "Timed").Due; d == nil || d.Time != "17:30" {
		t.Fatalf("timed due %+v", d)
	}
	for _, row := range p.Rows {
		if row.Title == "Gone" {
			t.Fatal("deleted tasks are skipped")
		}
	}
}

func TestAnyDoNotAFile(t *testing.T) {
	if p, err := Detect([]byte(`{"categories":[{"id":"c"}],"tasks":[{"title":"x"}]}`), ""); err == nil && p.Name() == "anydo-json" {
		t.Fatal("tasks without categoryId and status must not be detected as Any.do")
	}
}

func TestTrelloZipOfBoards(t *testing.T) {
	board := func(id, name string) string {
		return `{"id":"` + id + `","name":"` + name + `","lists":[{"id":"l` + id + `","name":"To do","pos":1}],"checklists":[],"labels":[],"actions":[],"members":[],
			"cards":[{"id":"c` + id + `","name":"Card of ` + name + `","idList":"l` + id + `","labels":[],"closed":false}]}`
	}
	p, err := parseWith(t, zipOf(t, map[string]string{"home.json": board("1", "Home"), "work.json": board("2", "Work")}), nil)
	if err != nil {
		t.Fatal(err)
	}
	if p.Format != "trello-json" {
		t.Fatalf("format %q", p.Format)
	}
	projects := map[string]bool{}
	for _, r := range p.Rows {
		if r.Kind == KindProject {
			projects[r.Title] = true
		}
	}
	if !projects["Home"] || !projects["Work"] || len(p.ViewHints) != 2 {
		t.Fatalf("projects %v view hints %v: one board project per file", projects, p.ViewHints)
	}
	taskRow(t, p, "Card of Work")
}
