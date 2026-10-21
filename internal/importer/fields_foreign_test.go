package importer

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	opsync "github.com/pixari/opentodo/internal/sync"
)

// Imported custom fields (more-importers D3, data-import "Imported custom fields").

func planRows(t *testing.T, st *State, rows ...Row) *Plan {
	t.Helper()
	parsed := &Parsed{Format: "asana-csv", Rows: rows}
	return BuildPlan(parsed, normalized(t, Options{}), st, time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC), counter())
}

func project(source, name string) Row {
	return Row{Kind: KindProject, SourceID: source, Title: name}
}

func task(source, title, project string, fields ...FieldValue) Row {
	return Row{Kind: KindTask, SourceID: source, Title: title, ProjectSourceID: project, Fields: fields}
}

func changesOf(p *Plan, entity string) []change {
	var out []change
	for _, c := range p.changes {
		if c.entity == entity {
			out = append(out, c)
		}
	}
	return out
}

// fieldValue returns the value a task change writes to definition id ("" when none).
func fieldValue(c change, id string) string {
	for _, f := range c.fields {
		if f.name == opsync.FieldValuePrefix+id {
			return string(f.value)
		}
	}
	return ""
}

func taskChange(t *testing.T, p *Plan, title string) change {
	t.Helper()
	for _, c := range changesOf(p, KindTask) {
		if fieldString(c, "title") == title {
			return c
		}
	}
	t.Fatalf("no task %q in %+v", title, p.changes)
	return change{}
}

func TestImportedNumberColumn(t *testing.T) {
	p := planRows(t, &State{},
		project("p:web", "Website"),
		task("t:1", "One", "p:web", FieldValue{"Effort", FieldNumber, 2.0}),
		task("t:2", "Two", "p:web", FieldValue{"Effort", FieldNumber, 3.5}))
	defs := changesOf(p, KindField)
	if len(defs) != 1 || p.Totals.Fields != 1 {
		t.Fatalf("definitions = %+v, totals.fields = %d", defs, p.Totals.Fields)
	}
	d := defs[0]
	if fieldString(d, "name") != "Effort" || fieldString(d, "type") != FieldNumber || fieldString(d, "options") != "" {
		t.Fatalf("definition = %+v", d.fields)
	}
	if v := fieldValue(taskChange(t, p, "One"), d.id); v != "2" {
		t.Fatalf("One = %q", v)
	}
	if v := fieldValue(taskChange(t, p, "Two"), d.id); v != "3.5" {
		t.Fatalf("Two = %q", v)
	}
	// The definition is written before the tasks that use it.
	for i, c := range p.changes {
		if c.entity == KindTask {
			for _, c2 := range p.changes[i:] {
				if c2.entity == KindField {
					t.Fatal("a field definition comes after a task")
				}
			}
			break
		}
	}
}

func TestImportedChoiceFromValues(t *testing.T) {
	p := planRows(t, &State{},
		project("p:web", "Website"),
		task("t:1", "One", "p:web", FieldValue{"Stage", FieldChoice, "Draft"}),
		task("t:2", "Two", "p:web", FieldValue{"Stage", FieldChoice, "Review"}),
		task("t:3", "Three", "p:web", FieldValue{"Stage", FieldChoice, "Draft"}))
	defs := changesOf(p, KindField)
	if len(defs) != 1 || fieldString(defs[0], "type") != FieldChoice || fieldString(defs[0], "options") != "Draft\nReview" {
		t.Fatalf("definitions = %+v", defs)
	}
	if v := fieldValue(taskChange(t, p, "Two"), defs[0].id); v != `"Review"` {
		t.Fatalf("Two = %q", v)
	}
}

func TestImportedFieldExistingOfAnotherType(t *testing.T) {
	st := &State{
		Projects: entities(`{"id":"web","name":"Website"}`),
		Fields:   entities(`{"id":"f1","project_id":"web","name":"effort","type":"text","options":""}`),
	}
	parsed := &Parsed{Format: "asana-csv", Rows: []Row{
		project("p:web", "Website"),
		task("t:1", "One", "p:web", FieldValue{"Effort", FieldNumber, 2.0}),
		task("t:2", "Two", "p:web", FieldValue{"Effort", FieldNumber, 3.0}),
	}}
	p := BuildPlan(parsed, normalized(t, Options{}), st, time.Now(), counter())
	if len(changesOf(p, KindField)) != 0 {
		t.Fatal("a definition was created next to one of another type")
	}
	for _, r := range p.Rows {
		if r.Kind == KindTask && !hasPrefix(r.Warnings, `field "Effort" exists with another type (text)`) {
			t.Fatalf("row %q warnings = %v", r.Title, r.Warnings)
		}
	}
	if v := fieldValue(taskChange(t, p, "One"), "f1"); v != "" {
		t.Fatalf("mismatched value written: %q", v)
	}
}

func TestImportedFieldReusesSameTypeByName(t *testing.T) {
	st := &State{
		Projects: entities(`{"id":"launch","name":"Launch"}`),
		Fields:   entities(`{"id":"est","project_id":"launch","name":"Estimate","type":"number","options":""}`),
	}
	p := planRows(t, st,
		project("p:l", "Launch"),
		task("t:1", "One", "p:l", FieldValue{"estimate", FieldNumber, 5.0}))
	if len(changesOf(p, KindField)) != 0 || p.Totals.Fields != 0 {
		t.Fatalf("definition created although one exists: %+v", changesOf(p, KindField))
	}
	if v := fieldValue(taskChange(t, p, "One"), "est"); v != "5" {
		t.Fatalf("value = %q", v)
	}
}

func TestImportedFieldLimitReached(t *testing.T) {
	docs := []string{`{"id":"web","name":"Website"}`}
	var defs []string
	for i := 0; i < opsync.MaxFieldsPerProject; i++ {
		defs = append(defs, fmt.Sprintf(`{"id":"f%d","project_id":"web","name":"F%d","type":"text","options":""}`, i, i))
	}
	st := &State{Projects: entities(docs...), Fields: entities(defs...)}
	p := planRows(t, st,
		project("p:web", "Website"),
		task("t:1", "One", "p:web", FieldValue{"Budget", FieldNumber, 10.0}))
	if len(changesOf(p, KindField)) != 0 {
		t.Fatal("a definition was created past the limit")
	}
	c := taskChange(t, p, "One")
	for _, f := range c.fields {
		if strings.HasPrefix(f.name, opsync.FieldValuePrefix) {
			t.Fatalf("value written past the limit: %v", f)
		}
	}
	if !hasPrefix(p.Rows[1].Warnings, `field "Budget" not created: the project already has 30 fields`) {
		t.Fatalf("warnings = %v", p.Rows[1].Warnings)
	}
}

func TestImportedFieldInboxTask(t *testing.T) {
	p := planRows(t, &State{}, task("t:1", "Loose", "", FieldValue{"Effort", FieldNumber, 1.0}))
	if len(changesOf(p, KindField)) != 0 {
		t.Fatal("a definition was created for an Inbox task")
	}
	if !hasPrefix(p.Rows[0].Warnings, "custom field values dropped (Effort): fields belong to a project") {
		t.Fatalf("warnings = %v", p.Rows[0].Warnings)
	}
}

func TestImportedChoiceTooManyOptionsBecomesText(t *testing.T) {
	rows := []Row{project("p:web", "Website")}
	for i := 0; i < maxImportedOptions+1; i++ {
		rows = append(rows, task(fmt.Sprintf("t:%d", i), fmt.Sprintf("T%d", i), "p:web", FieldValue{"Owner", FieldChoice, fmt.Sprintf("value %d", i)}))
	}
	p := planRows(t, &State{}, rows...)
	defs := changesOf(p, KindField)
	if len(defs) != 1 || fieldString(defs[0], "type") != FieldText {
		t.Fatalf("definitions = %+v", defs)
	}
	if v := fieldValue(taskChange(t, p, "T3"), defs[0].id); v != `"value 3"` {
		t.Fatalf("value = %q", v)
	}
}

// Undo removes the definitions the job created and leaves earlier ones alone.
func TestUndoRemovesCreatedFieldDefinitions(t *testing.T) {
	h := newHarness(t)
	h.write("web", 1000, "project", "launch", map[string]any{"name": "Launch", "position": 1, "created_at": 1000})
	h.write("web", 1000, "field", "kept", map[string]any{"project_id": "launch", "name": "Kept", "type": "text", "options": "", "position": 1, "created_at": 1000})
	h.svc.now = func() time.Time { return time.UnixMilli(2_000_000) }
	csv := "ID,Team,Title,Status,Priority,UUID,Project,Estimate\n" +
		"ENG-1,Eng,First,Todo,High,u1,Launch,3\n" +
		"ENG-2,Eng,Second,Todo,Low,u2,Launch,5\n"
	job := h.run(csv, Options{Format: "linear-csv"})
	defs := h.list("field", false)
	if len(defs) != 2 {
		t.Fatalf("definitions after import = %d, want 2 (Kept and Estimate)", len(defs))
	}
	var estimate string
	for _, d := range defs {
		if str(d, "name") == "Estimate" {
			estimate = str(d, "id")
		}
	}
	for _, task := range h.list("task", false) {
		v := opsync.FieldValues(task)[estimate]
		var n float64
		_ = json.Unmarshal(v, &n)
		if (str(task, "title") == "First" && n != 3) || (str(task, "title") == "Second" && n != 5) {
			t.Fatalf("task %s value %s", str(task, "title"), v)
		}
	}
	h.svc.now = func() time.Time { return time.UnixMilli(3_000_000) }
	if _, err := h.svc.Undo(context.Background(), h.uid, job.ID); err != nil {
		t.Fatal(err)
	}
	left := h.list("field", false)
	if len(left) != 1 || str(left[0], "id") != "kept" {
		t.Fatalf("definitions after undo = %v", left)
	}
}
