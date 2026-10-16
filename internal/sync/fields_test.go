package sync

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

// Custom fields (OpenSpec change `custom-fields`): the `field` entity and the
// task's `fields.<id>` family of value ops.

func TestValidateFieldOps(t *testing.T) {
	long := strings.Repeat("a", 64)
	for i, g := range []Op{
		op("1", "field", "f1", "name", `"Cost"`, 1, "A"),
		op("2", "field", "f1", "project_id", `"p1"`, 1, "A"),
		op("3", "field", "f1", "type", `"number"`, 1, "A"),
		op("4", "field", "f1", "options", `"Quote\nOrdered"`, 1, "A"),
		op("5", "field", "f1", "position", `2`, 1, "A"),
		op("6", "field", "f1", "created_at", `1700000000000`, 1, "A"),
		op("7", "field", "f1", "deleted_at", `null`, 1, "A"),
		op("8", "task", "t1", "fields.f1", `"Acme"`, 1, "A"),
		op("9", "task", "t1", "fields.f1", `120.5`, 1, "A"),
		op("10", "task", "t1", "fields.f1", `true`, 1, "A"),
		op("11", "task", "t1", "fields.f1", `null`, 1, "A"),
		op("12", "task", "t1", "fields."+long, `-3`, 1, "A"),
		op("13", "task", "t1", "fields.a_B-9", `false`, 1, "A"),
	} {
		if err := Validate(g); err != nil {
			t.Errorf("case %d should pass: %v", i, err)
		}
	}
	for i, b := range []Op{
		op("1", "task", "t1", "fields.f1", `{"a":1}`, 1, "A"),
		op("2", "task", "t1", "fields.f1", `[1,2]`, 1, "A"),
		op("3", "task", "t1", "fields.f1", `NaN`, 1, "A"),
		op("4", "task", "t1", "fields.f1", `1e400`, 1, "A"),
		op("5", "task", "t1", "fields."+long+"a", `1`, 1, "A"),
		op("6", "task", "t1", "fields.", `1`, 1, "A"),
		op("7", "task", "t1", "fields.a.b", `1`, 1, "A"),
		op("8", "project", "p1", "fields.x", `1`, 1, "A"),
		op("9", "field", "f1", "project_id", `null`, 1, "A"),
		op("10", "field", "f1", "fields.x", `1`, 1, "A"),
		op("11", "field", "f1", "color", `"#fff"`, 1, "A"),
	} {
		if err := Validate(b); err == nil {
			t.Errorf("case %d should fail", i)
		}
	}
	if Plural["fields"] != "field" {
		t.Fatal("fields collection is not mapped")
	}
	if !KnownField("task", "fields.f1") || KnownField("project", "fields.f1") || !KnownField("field", "name") {
		t.Fatal("KnownField")
	}
}

// Different fields of one task converge independently; the same field resolves
// by last-writer-wins for that field alone (spec "Values converge per field").
func TestFieldValuesConvergePerKey(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	mustApply(t, s, "u1", op("1", "task", "T", "title", `"Kitchen"`, 100, "A"))
	// Device B (newer) arrives first, device A second.
	mustApply(t, s, "u1", op("b1", "task", "T", "fields.client", `"Acme"`, 300, "B"), op("b2", "task", "T", "fields.cost", `150`, 300, "B"))
	mustApply(t, s, "u1", op("a1", "task", "T", "fields.cost", `120`, 200, "A"), op("a2", "task", "T", "title", `"Kitchen v2"`, 200, "A"))
	e, err := s.Get(ctx, "u1", "task", "T")
	if err != nil {
		t.Fatal(err)
	}
	if string(e["fields.client"]) != `"Acme"` || string(e["fields.cost"]) != `150` || string(e["title"]) != `"Kitchen v2"` {
		t.Fatalf("task = %v", e)
	}
	// Clearing a value is a null op.
	mustApply(t, s, "u1", op("c1", "task", "T", "fields.client", `null`, 400, "A"))
	if e, _ = s.Get(ctx, "u1", "task", "T"); string(e["fields.client"]) != `null` {
		t.Fatalf("cleared = %s", e["fields.client"])
	}
}

func TestFieldsFollowTheirProjectScope(t *testing.T) {
	f := newSharing(t)
	f.apply("alice", "A", f.op("field", "f1", "name", `"Cost"`), f.op("field", "f1", "project_id", `"p"`), f.op("field", "f1", "type", `"number"`))
	f.add("alice", "bob", RoleEditor)
	f.add("alice", "carol", RoleViewer)
	var scope string
	if err := f.s.db.QueryRow(`SELECT DISTINCT scope_id FROM scope_fields WHERE entity = 'field' AND entity_id = 'f1'`).Scan(&scope); err != nil || scope != ProjectScope("p") {
		t.Fatalf("field scope = %q %v", scope, err)
	}
	if got := f.field("carol", "field", "f1", "name"); got != `"Cost"` {
		t.Fatalf("viewer sees %s", got)
	}
	// An editor manages definitions; a viewer cannot.
	if res := f.apply("bob", "B", f.op("field", "f2", "name", `"Client"`), f.op("field", "f2", "project_id", `"p"`),
		f.op("field", "f1", "name", `"Price"`)); len(res.Rejected) != 0 {
		t.Fatalf("editor rejected: %v", rejectedIDs(res))
	}
	res := f.apply("carol", "C", f.op("field", "f1", "name", `"Mine"`), f.op("field", "f3", "name", `"New"`), f.op("field", "f3", "project_id", `"p"`))
	if len(res.Rejected) != 3 || res.Applied != 0 {
		t.Fatalf("viewer result = %v applied %d", rejectedIDs(res), res.Applied)
	}
	moved := f.op("field", "f2", "project_id", `"secret"`)
	if res := f.apply("alice", "A", moved); len(res.Rejected) != 1 || res.Rejected[0].Reason != ReasonScopeChange {
		t.Fatalf("scope change = %v", rejectedIDs(res))
	}
	if !CanWrite(RoleEditor, "field", "name") || CanWrite(RoleViewer, "field", "name") {
		t.Fatal("CanWrite field")
	}
}

func TestPurgeProjectPurgesItsFields(t *testing.T) {
	s := newTestService(t)
	ctx := context.Background()
	mustApply(t, s, "u1",
		op("1", "project", "P", "name", `"Kitchen"`, 100, "A"),
		op("2", "field", "F1", "project_id", `"P"`, 100, "A"),
		op("3", "field", "F2", "project_id", `"P"`, 100, "A"),
		op("4", "field", "F2", "deleted_at", `150`, 150, "A"),
		op("5", "field", "Other", "project_id", `"Q"`, 100, "A"),
		op("6", "task", "T", "project_id", `"P"`, 100, "A"),
		op("7", "task", "T", "fields.F1", `120`, 100, "A"),
		op("d", "project", "P", "deleted_at", `200`, 200, "A"),
	)
	res, err := s.Purge(ctx, "u1", "project", []string{"P"})
	if err != nil {
		t.Fatal(err)
	}
	if res.Projects != 1 || res.Tasks != 1 || res.Fields != 2 {
		t.Fatalf("purge = %+v", res)
	}
	for _, id := range []string{"F1", "F2", "T"} {
		if n := countRows(t, s, `SELECT COUNT(*) FROM scope_fields WHERE entity_id = ?`, id); n != 0 {
			t.Fatalf("%s: %d fields left", id, n)
		}
	}
	if e, _ := s.Get(ctx, "u1", "field", "Other"); e == nil {
		t.Fatal("unrelated field purged")
	}
}

// A completed occurrence keeps the series' values (spec "Occurrence records
// carry values").
func TestRecurringCompletionCopiesFieldValues(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	mustApply(t, s, "u1",
		op("1", "task", "S", "title", `"Water plants"`, 100, "A"),
		op("2", "task", "S", "recurrence", `"every week"`, 100, "A"),
		op("3", "task", "S", "due", `{"date":"2026-10-12"}`, 100, "A"),
		op("4", "task", "S", "completed_at", `null`, 100, "A"),
		op("5", "task", "S", "fields.cost", `40`, 100, "A"),
		op("6", "task", "S", "fields.client", `null`, 100, "A"),
	)
	existing, err := s.Get(ctx, "u1", "task", "S")
	if err != nil {
		t.Fatal(err)
	}
	body := map[string]json.RawMessage{"completed_at": json.RawMessage(`200`)}
	id, record, ok, err := s.RecurringCompletion(ctx, "u1", "S", body, existing, "2026-10-12")
	if err != nil || !ok {
		t.Fatalf("completion ok=%v err=%v", ok, err)
	}
	if id != OccurrenceID("S", "2026-10-12") || string(record["fields.cost"]) != `40` || string(record["fields.client"]) != `null` {
		t.Fatalf("record %s = %v", id, record)
	}
}
