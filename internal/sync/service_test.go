package sync

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/store"
)

func newTestService(t testing.TB) *Service {
	t.Helper()
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return NewService(db)
}

func op(id, entity, entityID, field, value string, ts int64, device string) Op {
	return Op{ID: id, Entity: entity, EntityID: entityID, Field: field, Value: json.RawMessage(value), TS: ts, Device: device}
}

func TestApplyIsIdempotentAndConverges(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	ops := []Op{
		op("a1", "task", "t1", "title", `"buy milk"`, 100, "A"),
		op("b1", "task", "t1", "title", `"buy oat milk"`, 200, "B"),
	}
	res, err := s.Apply(ctx, "u1", ops)
	if err != nil {
		t.Fatal(err)
	}
	if res.Applied != 2 {
		t.Fatalf("applied = %d, want 2", res.Applied)
	}
	// Re-sending the same ops is a no-op.
	res, err = s.Apply(ctx, "u1", ops)
	if err != nil || res.Duplicates != 2 || res.Applied != 0 {
		t.Fatalf("second apply = %+v, %v", res, err)
	}
	// Delivering the older op again, alone, must not regress the field.
	if _, err := s.Apply(ctx, "u1", []Op{op("a1-retry", "task", "t1", "title", `"buy milk"`, 100, "A")}); err != nil {
		t.Fatal(err)
	}
	e, err := s.Get(ctx, "u1", "task", "t1")
	if err != nil {
		t.Fatal(err)
	}
	if string(e["title"]) != `"buy oat milk"` {
		t.Fatalf("title = %s, want newest write", e["title"])
	}
}

func TestOrderIndependence(t *testing.T) {
	ctx := context.Background()
	ops := []Op{
		op("1", "task", "t1", "priority", `1`, 300, "A"),
		op("2", "task", "t1", "priority", `2`, 300, "B"), // same ts, B > A wins
		op("3", "task", "t1", "priority", `3`, 100, "C"),
	}
	want := `2`
	for _, order := range [][]int{{0, 1, 2}, {2, 1, 0}, {1, 2, 0}} {
		s := newTestService(t)
		for _, i := range order {
			if _, err := s.Apply(ctx, "u", []Op{ops[i]}); err != nil {
				t.Fatal(err)
			}
		}
		e, _ := s.Get(ctx, "u", "task", "t1")
		if string(e["priority"]) != want {
			t.Fatalf("order %v: priority = %s, want %s", order, e["priority"], want)
		}
	}
}

func TestPullExcludesOwnDeviceButAdvancesCursor(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	_, err := s.Apply(ctx, "u", []Op{
		op("1", "project", "p1", "name", `"Home"`, 1, "A"),
		op("2", "project", "p1", "color", `"#f00"`, 2, "B"),
		op("3", "task", "t1", "title", `"x"`, 3, "A"),
	})
	if err != nil {
		t.Fatal(err)
	}
	got, cursor, more, err := s.Pull(ctx, "u", 0, "A", 100)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].ID != "2" || cursor != 3 || more {
		t.Fatalf("pull = %d ops, cursor %d, more %v", len(got), cursor, more)
	}
	// Other users never see these ops.
	other, _, _, _ := s.Pull(ctx, "someone-else", 0, "", 100)
	if len(other) != 0 {
		t.Fatal("ops leaked across users")
	}
	// Pagination.
	page, cursor, more, _ := s.Pull(ctx, "u", 0, "", 2)
	if len(page) != 2 || cursor != 2 || !more {
		t.Fatalf("page = %d, cursor %d, more %v", len(page), cursor, more)
	}
}

func TestValidateRejectsBadOps(t *testing.T) {
	bad := []Op{
		op("1", "task", "t1", "nope", `1`, 1, "A"),
		op("1", "widget", "t1", "title", `"x"`, 1, "A"),
		op("1", "task", "t1", "priority", `9`, 1, "A"),
		op("1", "task", "t1", "due", `{"date":"tomorrow"}`, 1, "A"),
		op("1", "task", "t1", "title", `123`, 1, "A"),
		op("", "task", "t1", "title", `"x"`, 1, "A"),
		op("1", "task", "t1", "title", `"x"`, 0, "A"),
		op("1", "task", "t1", "labels", `null`, 1, "A"),
		op("1", "task", "t1", "estimate_minutes", `0`, 1, "A"),
		op("1", "task", "t1", "estimate_minutes", `-5`, 1, "A"),
		op("1", "task", "t1", "estimate_minutes", `1.5`, 1, "A"),
		op("1", "task", "t1", "estimate_minutes", `"30"`, 1, "A"),
		op("1", "task", "t1", "estimate_minutes", `10081`, 1, "A"),
	}
	for i, b := range bad {
		if err := Validate(b); err == nil {
			t.Errorf("case %d should fail", i)
		}
	}
	good := []Op{
		op("1", "task", "t1", "due", `{"date":"2026-10-10","time":"09:30"}`, 1, "A"),
		op("1", "task", "t1", "due", `null`, 1, "A"),
		op("1", "task", "t1", "labels", `["a","b"]`, 1, "A"),
		op("1", "project", "p1", "archived", `true`, 1, "A"),
		op("1", "task", "t1", "estimate_minutes", `45`, 1, "A"),
		op("1", "task", "t1", "estimate_minutes", `10080`, 1, "A"),
		op("1", "task", "t1", "estimate_minutes", `null`, 1, "A"),
	}
	for i, g := range good {
		if err := Validate(g); err != nil {
			t.Errorf("case %d should pass: %v", i, err)
		}
	}
}

func TestValidateAcceptsLabelOps(t *testing.T) {
	good := []Op{
		op("1", "label", "l1", "name", `"errand"`, 1, "A"),
		op("2", "label", "l1", "color", `"#ef4444"`, 1, "A"),
		op("3", "label", "l1", "position", `1700000000000`, 1, "A"),
		op("4", "label", "l1", "created_at", `1700000000000`, 1, "A"),
		op("5", "label", "l1", "deleted_at", `null`, 1, "A"),
		op("6", "label", "l1", "deleted_at", `1700000000001`, 1, "A"),
	}
	for i, g := range good {
		if err := Validate(g); err != nil {
			t.Errorf("case %d should pass: %v", i, err)
		}
	}
	bad := []Op{
		op("1", "label", "l1", "name", `42`, 1, "A"),
		op("1", "label", "l1", "archived", `true`, 1, "A"),
		op("1", "label", "l1", "deleted_at", `"soon"`, 1, "A"),
	}
	for i, b := range bad {
		if err := Validate(b); err == nil {
			t.Errorf("case %d should fail", i)
		}
	}
	if Plural["labels"] != "label" {
		t.Fatalf("Plural[labels] = %q", Plural["labels"])
	}
	// Label ops round-trip through Apply and List like any other entity.
	ctx := context.Background()
	s := newTestService(t)
	if _, err := s.Apply(ctx, "u", good[:4]); err != nil {
		t.Fatal(err)
	}
	list, err := s.List(ctx, "u", "label", false)
	if err != nil || len(list) != 1 || string(list[0]["name"]) != `"errand"` {
		t.Fatalf("list = %v, %v", list, err)
	}
}

func TestValidateAcceptsViewOps(t *testing.T) {
	good := []Op{
		op("1", "view", "v1", "name", `"Work tomorrow"`, 1, "A"),
		op("2", "view", "v1", "query", `"@work & due <= tomorrow & p1"`, 1, "A"),
		op("3", "view", "v1", "kind", `"list"`, 1, "A"),
		op("4", "view", "v1", "group_by", `"project"`, 1, "A"),
		op("5", "view", "v1", "sort_by", `"due"`, 1, "A"),
		op("6", "view", "v1", "sort_dir", `"asc"`, 1, "A"),
		op("7", "view", "v1", "pinned", `true`, 1, "A"),
		op("8", "view", "v1", "position", `1700000000000`, 1, "A"),
		op("9", "view", "v1", "color", `"#3b82f6"`, 1, "A"),
		op("10", "view", "v1", "panels", `[]`, 1, "A"),
		op("11", "view", "v1", "created_at", `1700000000000`, 1, "A"),
		op("12", "view", "v1", "deleted_at", `null`, 1, "A"),
		// Unknown enumeration values are accepted by sync (additive); clients fall back at read time.
		op("13", "view", "v2", "group_by", `"colour"`, 1, "A"),
		op("14", "view", "v2", "panels", `["v1","v3"]`, 1, "A"),
	}
	for i, g := range good {
		if err := Validate(g); err != nil {
			t.Errorf("case %d should pass: %v", i, err)
		}
	}
	bad := []Op{
		op("1", "view", "v1", "pinned", `"yes"`, 1, "A"),
		op("1", "view", "v1", "panels", `"v1"`, 1, "A"),
		op("1", "view", "v1", "panels", `null`, 1, "A"),
		op("1", "view", "v1", "query", `42`, 1, "A"),
		op("1", "view", "v1", "archived", `true`, 1, "A"),
	}
	for i, b := range bad {
		if err := Validate(b); err == nil {
			t.Errorf("case %d should fail", i)
		}
	}
	if Plural["views"] != "view" {
		t.Fatalf("Plural[views] = %q", Plural["views"])
	}
	ctx := context.Background()
	s := newTestService(t)
	if _, err := s.Apply(ctx, "u", good[:12]); err != nil {
		t.Fatal(err)
	}
	list, err := s.List(ctx, "u", "view", false)
	if err != nil || len(list) != 1 || string(list[0]["query"]) != `"@work & due <= tomorrow & p1"` {
		t.Fatalf("list = %v, %v", list, err)
	}
}

func TestFutureTimestampsAreClamped(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	fixed := time.UnixMilli(1_000_000)
	s.now = func() time.Time { return fixed }
	if _, err := s.Apply(ctx, "u", []Op{op("1", "task", "t1", "title", `"far future"`, fixed.UnixMilli()+3_600_000, "A")}); err != nil {
		t.Fatal(err)
	}
	got, _, _, _ := s.Pull(ctx, "u", 0, "", 10)
	if got[0].TS != fixed.UnixMilli()+MaxFutureSkewMs {
		t.Fatalf("ts = %d, want clamped", got[0].TS)
	}
}

func TestListHidesTombstonesAndSorts(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	_, err := s.Apply(ctx, "u", []Op{
		op("1", "task", "b", "title", `"second"`, 1, "A"),
		op("2", "task", "b", "position", `2`, 1, "A"),
		op("3", "task", "a", "title", `"first"`, 1, "A"),
		op("4", "task", "a", "position", `1`, 1, "A"),
		op("5", "task", "gone", "title", `"deleted"`, 1, "A"),
		op("6", "task", "gone", "deleted_at", `5`, 1, "A"),
	})
	if err != nil {
		t.Fatal(err)
	}
	list, err := s.List(ctx, "u", "task", false)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 || string(list[0]["id"]) != `"a"` || string(list[1]["id"]) != `"b"` {
		t.Fatalf("list = %v", list)
	}
	all, _ := s.List(ctx, "u", "task", true)
	if len(all) != 3 {
		t.Fatalf("includeDeleted list = %d", len(all))
	}
}
