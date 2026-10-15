package sync

import (
	"encoding/json"
	"errors"
	"slices"
	"strings"
	"testing"
)

// TestFieldValueValidation (custom-fields 1.1): fields.<id> takes null, a
// string, a finite number or a boolean; objects, arrays and bad ids are refused.
func TestFieldValueValidation(t *testing.T) {
	v := func(field, value string) error {
		return Validate(Op{ID: "o", Entity: "task", EntityID: "t1", Field: field, Value: []byte(value), TS: 1, Device: "A"})
	}
	for _, ok := range []string{`null`, `"Acme"`, `120.5`, `-3`, `true`, `false`} {
		if err := v("fields.f1", ok); err != nil {
			t.Errorf("%s: %v", ok, err)
		}
	}
	for _, bad := range []string{`{"a":1}`, `[1]`} {
		if err := v("fields.f1", bad); !errors.Is(err, ErrInvalidOp) {
			t.Errorf("%s accepted", bad)
		}
	}
	for _, field := range []string{"fields.", "fields.a b", "fields." + strings.Repeat("x", 65), "fieldsx"} {
		if err := v(field, `1`); !errors.Is(err, ErrInvalidOp) {
			t.Errorf("field %q accepted", field)
		}
	}
	if err := Validate(Op{ID: "o", Entity: "project", EntityID: "p", Field: "fields.f1", Value: []byte(`1`), TS: 1, Device: "A"}); !errors.Is(err, ErrInvalidOp) {
		t.Error("a field value on a project accepted")
	}
	if !IsFieldValue("task", "fields.f1") || IsFieldValue("task", "title") || !KnownField("field", "options") {
		t.Fatal("helpers")
	}
}

// TestFieldDefinitionsFollowTheProject (custom-fields 1.2): definitions live in
// the project's scope, move when it is shared, and editors may write them.
func TestFieldDefinitionsFollowTheProject(t *testing.T) {
	f := newSharing(t)
	f.apply("alice", "A",
		f.op("field", "cost", "name", `"Cost"`), f.op("field", "cost", "project_id", `"p"`), f.op("field", "cost", "type", `"number"`),
		f.op("task", "t1", "fields.cost", `120`),
	)
	f.add("alice", "bob", RoleEditor)
	f.add("alice", "carol", RoleViewer)
	if got := f.field("bob", "field", "cost", "name"); got != `"Cost"` {
		t.Fatalf("bob reads the definition as %s", got)
	}
	if got := f.field("carol", "task", "t1", "fields.cost"); got != `120` {
		t.Fatalf("carol reads the value as %s", got)
	}
	add := f.op("field", "client", "name", `"Client"`)
	res := f.apply("bob", "B", add, f.op("field", "client", "project_id", `"p"`), f.op("field", "client", "type", `"text"`), f.op("task", "t1", "fields.cost", `150`))
	if len(res.Rejected) != 0 || res.Applied != 4 {
		t.Fatalf("editor = %v applied %d", rejectedIDs(res), res.Applied)
	}
	viewer := f.op("field", "cost", "name", `"Price"`)
	if res := f.apply("carol", "C", viewer); !slices.Equal(rejectedIDs(res), []string{viewer.ID + ":forbidden"}) {
		t.Fatalf("viewer = %v", rejectedIDs(res))
	}
}

// TestOccurrenceRecordKeepsFieldValues (custom-fields 1.3).
func TestOccurrenceRecordKeepsFieldValues(t *testing.T) {
	ctx := t.Context()
	s := newTestService(t)
	if _, err := s.Apply(ctx, "u1", []Op{
		op("a", "task", "s1", "title", `"Invoice"`, 10, "A"),
		op("b", "task", "s1", "recurrence", `"every month"`, 10, "A"),
		op("c", "task", "s1", "due", `{"date":"2026-10-10"}`, 10, "A"),
		op("d", "task", "s1", "fields.cost", `120`, 10, "A"),
	}); err != nil {
		t.Fatal(err)
	}
	series, _ := s.Get(ctx, "u1", "task", "s1")
	_, record, ok, err := s.RecurringCompletion(ctx, "u1", "s1", map[string]json.RawMessage{"completed_at": json.RawMessage("100")}, series, "2026-10-10")
	if err != nil || !ok || string(record["fields.cost"]) != "120" {
		t.Fatalf("record = %v ok=%v err=%v", record, ok, err)
	}
}

// TestFieldValueInHistory (custom-fields 1.5): a value change is a history change like any field.
func TestFieldValueInHistory(t *testing.T) {
	ctx := t.Context()
	s := newTestService(t)
	if _, err := s.Apply(ctx, "u1", []Op{op("a", "task", "t1", "title", `"Quote"`, 10, "A"), op("b", "task", "t1", "fields.cost", `120`, 20, "A")}); err != nil {
		t.Fatal(err)
	}
	h, err := s.History(ctx, "u1", "task", "t1", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, set := range h.ChangeSets {
		for _, c := range set.Changes {
			found = found || (c.Field == "fields.cost" && string(c.To) == "120")
		}
	}
	if !found {
		t.Fatalf("history = %+v", h.ChangeSets)
	}
}
