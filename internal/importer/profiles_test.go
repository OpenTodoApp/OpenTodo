package importer

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func fixture(t *testing.T, name string) []byte {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func parse(t *testing.T, data []byte, opts Options) *Parsed {
	t.Helper()
	if err := opts.Normalize(); err != nil {
		t.Fatal(err)
	}
	p, err := Parse(data, opts)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	return p
}

func rowBySource(t *testing.T, p *Parsed, id string) Row {
	t.Helper()
	for _, r := range p.Rows {
		if r.SourceID == id {
			return r
		}
	}
	t.Fatalf("no row with source id %q in %+v", id, p.Rows)
	return Row{}
}

func TestDetectFormat(t *testing.T) {
	cases := []struct {
		name string
		data []byte
		want string
	}{
		{"own export", []byte(`{"format":"opentodo-export","version":1,"projects":[],"tasks":[],"labels":[]}`), "opentodo"},
		{"own export wins over the tasks signature", []byte(`{"tasks":[],"format":"opentodo-export","version":2}`), "opentodo"},
		{"items backup", fixture(t, "items.json"), "json-items"},
		{"lists", fixture(t, "lists.json"), "json-lists"},
		{"generic object", fixture(t, "generic.json"), "json-generic"},
		{"generic array", []byte(`[{"title":"a"}]`), "json-generic"},
		{"csv", fixture(t, "tasks.csv"), "csv"},
		{"csv with BOM and semicolons", []byte("\xef\xbb\xbftitle;project\nA;B\n"), "csv"},
	}
	for _, c := range cases {
		p, err := Detect(c.data, "")
		if err != nil {
			t.Fatalf("%s: %v", c.name, err)
		}
		if p.Name() != c.want {
			t.Fatalf("%s: detected %s, want %s", c.name, p.Name(), c.want)
		}
	}
	for _, bad := range [][]byte{[]byte("name,email\nx,y\n"), []byte(`{"hello":"world"}`), []byte("\x00\x01binary"), {}} {
		_, err := Detect(bad, "")
		if !errors.Is(err, ErrUnsupportedFormat) {
			t.Fatalf("Detect(%q) err = %v, want unsupported_format", bad, err)
		}
		for _, name := range ProfileNames() {
			if !strings.Contains(err.Error(), name) {
				t.Fatalf("error %q does not name supported format %s", err, name)
			}
		}
	}
	// The user can override detection, and an unknown override is an option error.
	if p, err := Detect([]byte("title\nx\n"), "json-generic"); err != nil || p.Name() != "json-generic" {
		t.Fatalf("override: %v %v", p, err)
	}
	var oe *OptionError
	if _, err := Detect(nil, "nope"); !errors.As(err, &oe) {
		t.Fatalf("unknown override err = %v", err)
	}
}

func TestCSVMappingAndRowErrors(t *testing.T) {
	p := parse(t, fixture(t, "tasks.csv"), Options{TimeZone: "Europe/Rome"})
	if p.Format != "csv" {
		t.Fatalf("format %s", p.Format)
	}
	wantRec := []string{"id", "Title", "Description", "Project", "Section", "Parent", "Priority", "Due Date", "Due Time", "Labels", "Completed At", "Created At"}
	if !reflect.DeepEqual(p.Recognised, wantRec) {
		t.Fatalf("recognised %v", p.Recognised)
	}
	if !reflect.DeepEqual(p.Ignored, []string{"Recurrence", "Color"}) {
		t.Fatalf("ignored %v", p.Ignored)
	}
	if len(p.Rows) != 6 {
		t.Fatalf("rows = %d", len(p.Rows))
	}
	r1 := rowBySource(t, p, "id:1")
	if r1.Line != 2 || r1.Title != "Write report" || r1.Description != "First draft" || r1.ProjectName != "Work" || r1.SectionName != "Q4" ||
		r1.Priority != 1 || *r1.Due != (Due{Date: "2026-10-20", Time: "14:30"}) || !reflect.DeepEqual(r1.Labels, []string{"focus", "deep"}) || r1.Completed {
		t.Fatalf("row 1 = %+v", r1)
	}
	if want := time.Date(2026, 10, 1, 0, 0, 0, 0, mustLoc(t, "Europe/Rome")).UnixMilli(); r1.CreatedAt != want {
		t.Fatalf("created_at = %d, want %d", r1.CreatedAt, want)
	}
	r2 := rowBySource(t, p, "id:2")
	if r2.ParentSourceID != "id:1" || r2.Priority != 2 || !r2.Completed || r2.CompletedAt != time.Date(2026, 10, 5, 10, 0, 0, 0, time.UTC).UnixMilli() {
		t.Fatalf("row 2 = %+v", r2)
	}
	r3 := rowBySource(t, p, "id:3")
	if r3.Priority != 0 || r3.Due != nil || len(r3.Warnings) != 1 || !strings.Contains(r3.Warnings[0], "recurrence") {
		t.Fatalf("row 3 = %+v", r3)
	}
	for id, want := range map[string]string{"id:4": `invalid priority "7"`, "id:5": "due_time requires due_date", "id:6": "title is required"} {
		r := rowBySource(t, p, id)
		if !strings.Contains(r.Err, want) {
			t.Fatalf("%s err = %q, want %q", id, r.Err, want)
		}
	}
	if r := rowBySource(t, p, "id:6"); r.Line != 7 {
		t.Fatalf("row numbers follow the file lines: got %d", r.Line)
	}

	// Without an id column a row's source id is stable across reads of the same
	// content, and `parent` falls back to a unique title.
	data := []byte("title,parent,priority\nTrip,,P2\nFlights,Trip,\nFlights,Trip,\n")
	a, b := parse(t, data, Options{}), parse(t, data, Options{})
	if a.Rows[1].SourceID != b.Rows[1].SourceID || a.Rows[1].SourceID == a.Rows[2].SourceID {
		t.Fatalf("content source ids: %q %q %q", a.Rows[1].SourceID, b.Rows[1].SourceID, a.Rows[2].SourceID)
	}
	if a.Rows[1].ParentSourceID != a.Rows[0].SourceID || a.Rows[0].Priority != 2 {
		t.Fatalf("parent by title: %+v", a.Rows)
	}
}

func mustLoc(t *testing.T, name string) *time.Location {
	t.Helper()
	l, err := time.LoadLocation(name)
	if err != nil {
		t.Fatal(err)
	}
	return l
}

func TestProfile_json_generic(t *testing.T) {
	p := parse(t, fixture(t, "generic.json"), Options{TimeZone: "Europe/Berlin"})
	if p.Format != "json-generic" || len(p.Rows) != 7 {
		t.Fatalf("format %s rows %d", p.Format, len(p.Rows))
	}
	garden := rowBySource(t, p, "project:p2")
	if garden.Kind != KindProject || garden.Title != "Garden" || garden.ParentSourceID != "project:p1" {
		t.Fatalf("garden = %+v", garden)
	}
	t1 := rowBySource(t, p, "task:t1")
	if t1.Title != "Plan the beds" || t1.Description != "Sketch first" || t1.ProjectSourceID != "project:p2" || t1.SectionName != "Spring" ||
		t1.Priority != 1 || *t1.Due != (Due{Date: "2026-11-02", Time: "10:30"}) || !reflect.DeepEqual(t1.Labels, []string{"outside", "weekend"}) {
		t.Fatalf("t1 = %+v", t1)
	}
	t2 := rowBySource(t, p, "task:t2")
	if t2.ParentSourceID != "task:t1" || !t2.Completed || t2.CompletedAt != time.Date(2026, 10, 3, 10, 0, 0, 0, time.UTC).UnixMilli() || t2.ProjectSourceID != "project:p2" {
		t.Fatalf("t2 = %+v", t2)
	}
	t3 := rowBySource(t, p, "task:t3")
	if t3.Title != "Call the plumber" || t3.ProjectName != "Home" || t3.Priority != 2 || t3.Due.Date != "2026-10-20" || !t3.Completed ||
		!reflect.DeepEqual(t3.Warnings, []string{"recurrence dropped (not supported)", "attachment dropped (not supported)"}) {
		t.Fatalf("t3 = %+v", t3)
	}
	t4 := rowBySource(t, p, "task:t4")
	if t4.Title != "Inbox thought" || !reflect.DeepEqual(t4.Labels, []string{"idea", "later"}) || t4.ProjectName != "" {
		t.Fatalf("t4 = %+v", t4)
	}
	if t5 := rowBySource(t, p, "task:t5"); !strings.Contains(t5.Err, "invalid priority") {
		t.Fatalf("t5 = %+v", t5)
	}
}

func TestProfile_json_items(t *testing.T) {
	p := parse(t, fixture(t, "items.json"), Options{TimeZone: "UTC"})
	if p.Format != "json-items" {
		t.Fatalf("format %s", p.Format)
	}
	// The source inbox and deleted items are not rows.
	if len(p.Rows) != 5 {
		t.Fatalf("rows = %d: %+v", len(p.Rows), p.Rows)
	}
	client := rowBySource(t, p, "project:201")
	if client.Title != "Client A" || client.ParentSourceID != "project:200" {
		t.Fatalf("client = %+v", client)
	}
	deck := rowBySource(t, p, "item:1")
	if deck.Title != "Kickoff deck" || deck.Description != "Ten slides" || deck.ProjectSourceID != "project:201" || deck.SectionName != "Backlog" ||
		deck.Priority != 1 || *deck.Due != (Due{Date: "2026-10-15"}) || !reflect.DeepEqual(deck.Labels, []string{"call"}) || deck.Completed ||
		deck.CreatedAt != time.Date(2026, 9, 30, 12, 0, 0, 0, time.UTC).UnixMilli() ||
		!reflect.DeepEqual(deck.Warnings, []string{"comments dropped (not supported)"}) {
		t.Fatalf("deck = %+v", deck)
	}
	agenda := rowBySource(t, p, "item:2")
	if agenda.ParentSourceID != "item:1" || agenda.Priority != 4 || *agenda.Due != (Due{Date: "2026-10-14", Time: "16:00"}) || !agenda.Completed ||
		agenda.CompletedAt != time.Date(2026, 10, 5, 9, 0, 0, 0, time.UTC).UnixMilli() ||
		!reflect.DeepEqual(agenda.Warnings, []string{"recurrence dropped (not supported)"}) {
		t.Fatalf("agenda = %+v", agenda)
	}
	water := rowBySource(t, p, "item:3")
	if water.ProjectSourceID != "" || water.Priority != 3 {
		t.Fatalf("inbox item = %+v", water)
	}
}

func TestProfile_json_lists(t *testing.T) {
	p := parse(t, fixture(t, "lists.json"), Options{TimeZone: "America/New_York"})
	if p.Format != "json-lists" || len(p.Rows) != 6 {
		t.Fatalf("format %s rows %d", p.Format, len(p.Rows))
	}
	if l := rowBySource(t, p, "list:L1"); l.Kind != KindProject || l.Title != "Errands" {
		t.Fatalf("list = %+v", l)
	}
	a := rowBySource(t, p, "task:a")
	// A zoned midnight in UTC is the evening before in New York.
	if a.ProjectSourceID != "list:L1" || a.Priority != 1 || *a.Due != (Due{Date: "2026-10-11", Time: "20:00"}) || a.Description != "Post office closes at 6" {
		t.Fatalf("a = %+v", a)
	}
	b := rowBySource(t, p, "task:b")
	if b.ParentSourceID != "task:a" || !b.Completed || b.CompletedAt != time.Date(2026, 10, 9, 18, 20, 0, 0, time.UTC).UnixMilli() ||
		!reflect.DeepEqual(b.Warnings, []string{"links dropped (not supported)"}) {
		t.Fatalf("b = %+v", b)
	}
	if d := rowBySource(t, p, "task:d"); d.ParentSourceID != "task:c" || d.ProjectSourceID != "list:L2" {
		t.Fatalf("d = %+v", d)
	}
}

func TestZonedDueBecomesFloating(t *testing.T) {
	for _, c := range []struct {
		in, tz string
		want   Due
	}{
		{"2026-10-11", "Asia/Tokyo", Due{Date: "2026-10-11"}},
		{"2026-10-11T23:30", "Asia/Tokyo", Due{Date: "2026-10-11", Time: "23:30"}},
		{"2026-10-11T23:30:00Z", "Asia/Tokyo", Due{Date: "2026-10-12", Time: "08:30"}},
		{"2026-10-11T23:30:00+02:00", "UTC", Due{Date: "2026-10-11", Time: "21:30"}},
		{"2026-03-29T01:30:00Z", "Europe/Rome", Due{Date: "2026-03-29", Time: "03:30"}},
	} {
		d, err := parseDue(c.in, mustLoc(t, c.tz))
		if err != nil || *d != c.want {
			t.Fatalf("parseDue(%q, %s) = %+v, %v; want %+v", c.in, c.tz, d, err, c.want)
		}
	}
	if _, err := parseDue("11/10/2026", time.UTC); err == nil {
		t.Fatal("ambiguous date accepted")
	}
	// The option drives CSV conversion end to end.
	p := parse(t, []byte("title,due_date\nCall,2026-10-11T07:00:00Z\n"), Options{TimeZone: "America/Los_Angeles"})
	if *p.Rows[0].Due != (Due{Date: "2026-10-11", Time: "00:00"}) {
		t.Fatalf("csv zoned due = %+v", p.Rows[0].Due)
	}
	var oe *OptionError
	opts := Options{TimeZone: "Mars/Olympus"}
	if err := opts.Normalize(); !errors.As(err, &oe) || !strings.Contains(err.Error(), "timeZone") {
		t.Fatalf("unknown zone err = %v", err)
	}
}

func TestResolveParentsAnyOrder(t *testing.T) {
	// The child comes before its parent and the grandchild first of all.
	data := []byte("id,title,parent,project\n3,Compare prices,2,\n2,Hotel,1,\n1,Plan trip,,Travel\n4,Orphan,99,\n")
	for _, reversed := range []bool{false, true} {
		in := data
		if reversed {
			lines := strings.Split(strings.TrimSpace(string(data)), "\n")
			for i, j := 1, len(lines)-1; i < j; i, j = i+1, j-1 {
				lines[i], lines[j] = lines[j], lines[i]
			}
			in = []byte(strings.Join(lines, "\n") + "\n")
		}
		parsed := parse(t, in, Options{})
		ids := 0
		plan := BuildPlan(parsed, normalized(t, Options{}), &State{}, time.UnixMilli(1_760_000_000_000), func() string { ids++; return "n" + string(rune('a'+ids)) })
		byTitle := map[string]change{}
		for _, c := range plan.changes {
			if c.entity == KindTask {
				byTitle[fieldString(c, "title")] = c
			}
		}
		trip, hotel, compare := byTitle["Plan trip"], byTitle["Hotel"], byTitle["Compare prices"]
		if fieldString(hotel, "parent_id") != trip.id || fieldString(compare, "parent_id") != hotel.id {
			t.Fatalf("reversed=%v: parents not resolved: %+v", reversed, byTitle)
		}
		// Subtasks follow their parent's project.
		if p := fieldString(trip, "project_id"); p == "" || fieldString(hotel, "project_id") != p || fieldString(compare, "project_id") != p {
			t.Fatalf("reversed=%v: subtree projects differ", reversed)
		}
		orphan := byTitle["Orphan"]
		if fieldString(orphan, "parent_id") != "" {
			t.Fatalf("orphan has a parent")
		}
		for _, r := range plan.Rows {
			if r.Title == "Orphan" && (len(r.Warnings) != 1 || !strings.Contains(r.Warnings[0], `parent "99" not found`)) {
				t.Fatalf("orphan warnings = %v", r.Warnings)
			}
		}
	}
}

func TestSectionsOption(t *testing.T) {
	data := []byte("title,section,labels\nA,Backlog,x\n")
	for _, c := range []struct {
		sections string
		labels   int
	}{{"label", 2}, {"ignore", 1}} {
		plan := BuildPlan(parse(t, data, Options{}), normalized(t, Options{Sections: c.sections}), &State{}, time.Now(), counter())
		if plan.Totals.NewLabels != c.labels {
			t.Fatalf("sections=%s: %d new labels, want %d", c.sections, plan.Totals.NewLabels, c.labels)
		}
	}
}

func TestProjectMatchingByName(t *testing.T) {
	st := &State{Projects: entities(`{"id":"pw","name":"work"}`, `{"id":"pd","name":"Old","deleted_at":5}`)}
	data := []byte("title,project\nA,WORK\nB,old\nC,old\n")
	plan := BuildPlan(parse(t, data, Options{}), normalized(t, Options{}), st, time.Now(), counter())
	var tasks []change
	var projects []change
	for _, c := range plan.changes {
		switch c.entity {
		case KindTask:
			tasks = append(tasks, c)
		case KindProject:
			projects = append(projects, c)
		}
	}
	if fieldString(tasks[0], "project_id") != "pw" {
		t.Fatalf("existing project not matched case-insensitively")
	}
	// A deleted project is not reused; one new project serves both rows.
	if len(projects) != 1 || fieldString(projects[0], "name") != "old" || fieldString(tasks[1], "project_id") != projects[0].id || fieldString(tasks[2], "project_id") != projects[0].id {
		t.Fatalf("projects = %+v tasks = %+v", projects, tasks)
	}
}

func TestTooManyRows(t *testing.T) {
	var b bytes.Buffer
	b.WriteString("title\n")
	for i := 0; i <= MaxRows; i++ {
		b.WriteString("x\n")
	}
	opts := normalized(t, Options{})
	if _, err := Parse(b.Bytes(), opts); !errors.Is(err, ErrTooManyRows) {
		t.Fatalf("err = %v", err)
	}
}
