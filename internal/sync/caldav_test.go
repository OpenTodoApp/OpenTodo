package sync

import (
	"context"
	"strings"
	"testing"
)

// CalDAV (OpenSpec change `caldav`).

func TestValidateAcceptsIcalExtra(t *testing.T) {
	long := `"` + strings.Repeat("X-A:b\\r\\n", 5000) + `"`
	for i, g := range []Op{
		op("1", "task", "t1", "ical_extra", `"BEGIN:VALARM\r\nACTION:DISPLAY\r\nEND:VALARM"`, 1, "A"),
		op("2", "task", "t1", "ical_extra", `null`, 1, "A"),
		op("3", "task", "t1", "ical_extra", long, 1, "A"),
	} {
		if err := Validate(g); err != nil {
			t.Errorf("case %d should pass: %v", i, err)
		}
	}
	for i, b := range []Op{
		op("1", "task", "t1", "ical_extra", `42`, 1, "A"),
		op("2", "task", "t1", "ical_extra", `["x"]`, 1, "A"),
		op("3", "project", "p", "ical_extra", `"x"`, 1, "A"),
		op("4", "task", "t1", "ical_extra", `"`+strings.Repeat("x", MaxValueBytes)+`"`, 1, "A"),
	} {
		if err := Validate(b); err == nil {
			t.Errorf("case %d should fail", i)
		}
	}
}

func TestCursorAndChangedSince(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	if _, err := s.Apply(ctx, "u1", []Op{op("a", "task", "t1", "title", `"x"`, 1, "A")}); err != nil {
		t.Fatal(err)
	}
	c1, err := s.Cursor(ctx, "u1")
	if err != nil || c1 == 0 {
		t.Fatalf("cursor %d %v", c1, err)
	}
	if _, err := s.Apply(ctx, "u1", []Op{op("b", "task", "t2", "deleted_at", `5`, 2, "A"), op("c", "label", "l1", "name", `"n"`, 2, "A")}); err != nil {
		t.Fatal(err)
	}
	// Another user's ops are invisible.
	if _, err := s.Apply(ctx, "u2", []Op{op("d", "task", "t9", "title", `"y"`, 2, "A")}); err != nil {
		t.Fatal(err)
	}
	d, err := s.ChangedSince(ctx, "u1", c1)
	if err != nil {
		t.Fatal(err)
	}
	if !d.Fields["task"]["t2"]["deleted_at"] || d.Fields["task"]["t1"] != nil || !d.Fields["label"]["l1"]["name"] || d.Fields["task"]["t9"] != nil {
		t.Fatalf("delta %+v", d)
	}
	if c2, _ := s.Cursor(ctx, "u1"); d.Cursor != c2 || c2 <= c1 {
		t.Fatalf("cursor %d vs %d", d.Cursor, c2)
	}
	mod, err := s.Modified(ctx, "u1", "task")
	if err != nil || mod["t1"] != 1 || mod["t2"] != 2 {
		t.Fatalf("modified %v %v", mod, err)
	}
}
