package sync

import (
	"context"
	"slices"
	"testing"
)

// Sections and boards (OpenSpec change `board-view`).

func TestValidateAcceptsSectionOps(t *testing.T) {
	for i, g := range []Op{
		op("1", "section", "s1", "name", `"Doing"`, 1, "A"),
		op("2", "section", "s1", "project_id", `"p1"`, 1, "A"),
		op("3", "section", "s1", "position", `1.5`, 1, "A"),
		op("4", "section", "s1", "created_at", `1700000000000`, 1, "A"),
		op("5", "section", "s1", "deleted_at", `null`, 1, "A"),
		op("6", "section", "s1", "deleted_at", `1700000000000`, 1, "A"),
		op("7", "task", "t1", "section_id", `"s1"`, 1, "A"),
		op("8", "task", "t1", "section_id", `null`, 1, "A"),
		// Colour and icon (icons-and-section-style); sync does not check the
		// catalogue, so a name from a newer client is accepted.
		op("9", "section", "s1", "color", `"#3b82f6"`, 1, "A"),
		op("10", "section", "s1", "color", `null`, 1, "A"),
		op("11", "section", "s1", "icon", `"hourglass"`, 1, "A"),
		op("12", "section", "s1", "icon", `"icon-from-a-newer-client"`, 1, "A"),
		op("13", "section", "s1", "icon", `null`, 1, "A"),
	} {
		if err := Validate(g); err != nil {
			t.Errorf("case %d should pass: %v", i, err)
		}
	}
	for i, b := range []Op{
		op("1", "section", "s1", "emoji", `"x"`, 1, "A"), // unknown field
		op("2", "section", "s1", "project_id", `null`, 1, "A"),
		op("3", "section", "s1", "project_id", `""`, 1, "A"),
		op("4", "section", "s1", "name", `7`, 1, "A"),
		op("5", "task", "t1", "section_id", `42`, 1, "A"),
		op("6", "project", "p1", "section_id", `"s1"`, 1, "A"),
	} {
		if err := Validate(b); err == nil {
			t.Errorf("case %d should fail", i)
		}
	}
	if Plural["sections"] != "section" {
		t.Fatal("sections collection is not mapped")
	}
}

// A rename on one device and a colour on another converge to both, in any
// delivery order (sections-and-boards "Colour and rename at the same time").
func TestSectionColourAndRenameConverge(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	base := []Op{
		op("c1", "section", "s1", "name", `"Doing"`, 100, "A"),
		op("c2", "section", "s1", "project_id", `"p1"`, 100, "A"),
	}
	rename := op("a1", "section", "s1", "name", `"In progress"`, 200, "A")
	colour := op("b1", "section", "s1", "color", `"#3b82f6"`, 150, "B")
	icon := op("b2", "section", "s1", "icon", `"hourglass"`, 150, "B")
	for user, order := range map[string][]Op{
		"u1": append(append([]Op{}, base...), rename, colour, icon),
		"u2": append([]Op{icon, colour, rename}, base...),
	} {
		if _, err := s.Apply(ctx, user, order); err != nil {
			t.Fatal(err)
		}
		row, err := s.Get(ctx, user, "section", "s1")
		if err != nil {
			t.Fatal(err)
		}
		if string(row["name"]) != `"In progress"` || string(row["color"]) != `"#3b82f6"` || string(row["icon"]) != `"hourglass"` {
			t.Fatalf("%s section = name %s, color %s, icon %s", user, row["name"], row["color"], row["icon"])
		}
	}
}

func TestSectionsFollowTheirProjectScope(t *testing.T) {
	f := newSharing(t)
	// A section created before sharing lives in alice's personal scope and moves
	// into the project scope when the project is shared.
	f.apply("alice", "A", f.op("section", "s1", "name", `"Backlog"`), f.op("section", "s1", "project_id", `"p"`),
		f.op("task", "t1", "section_id", `"s1"`))
	f.add("alice", "bob", RoleEditor)
	f.add("alice", "carol", RoleViewer)
	var scope string
	if err := f.s.db.QueryRow(`SELECT DISTINCT scope_id FROM scope_fields WHERE entity = 'section' AND entity_id = 's1'`).Scan(&scope); err != nil || scope != ProjectScope("p") {
		t.Fatalf("section scope = %q %v", scope, err)
	}
	if got := f.field("bob", "section", "s1", "name"); got != `"Backlog"` {
		t.Fatalf("bob sees section name %s", got)
	}
	// An editor creates and renames sections of the shared project; a viewer cannot.
	if res := f.apply("bob", "B", f.op("section", "s2", "name", `"Doing"`), f.op("section", "s2", "project_id", `"p"`),
		f.op("section", "s1", "name", `"Later"`), f.op("task", "t2", "section_id", `"s2"`)); len(res.Rejected) != 0 {
		t.Fatalf("editor rejected: %v", rejectedIDs(res))
	}
	bad := f.op("section", "s2", "name", `"Mine"`)
	res := f.apply("carol", "C", bad, f.op("section", "s3", "name", `"New"`), f.op("section", "s3", "project_id", `"p"`))
	if len(res.Rejected) != 3 || res.Applied != 0 {
		t.Fatalf("viewer result = %v applied %d", rejectedIDs(res), res.Applied)
	}
	if len(res.Restore) != 1 || string(res.Restore[0].Value) != `"Doing"` {
		t.Fatalf("restore = %+v", res.Restore)
	}
	for _, u := range []string{"alice", "bob", "carol"} {
		if got := f.field(u, "section", "s2", "name"); got != `"Doing"` {
			t.Fatalf("%s sees %s", u, got)
		}
	}
	// A section never changes scope: a project_id into another scope is refused.
	moved := f.op("section", "s2", "project_id", `"secret"`)
	if res := f.apply("alice", "A", moved); !slices.Equal(rejectedIDs(res), []string{moved.ID + ":" + ReasonScopeChange}) {
		t.Fatalf("scope change = %v", rejectedIDs(res))
	}
	// Non-members never see the project's sections.
	if got := f.field("carol", "section", "s1", "name"); got == "<none>" {
		t.Fatal("viewer cannot read sections")
	}
	if _, err := f.s.RemoveMember(f.ctx, "alice", "p", "carol"); err != nil {
		t.Fatal(err)
	}
	if got := f.field("carol", "section", "s1", "name"); got != "<none>" {
		t.Fatalf("removed member still sees section: %s", got)
	}
}

func TestConcurrentMovesResolveToNewer(t *testing.T) {
	s := newTestService(t)
	ctx := context.Background()
	mustApply(t, s, "u1",
		op("1", "project", "P", "name", `"Work"`, 100, "A"),
		op("2", "section", "S1", "project_id", `"P"`, 100, "A"),
		op("3", "section", "S2", "project_id", `"P"`, 100, "A"),
		op("4", "task", "T", "project_id", `"P"`, 100, "A"),
	)
	// Device B's move (newer) arrives first, device A's older move second.
	mustApply(t, s, "u1", op("b1", "task", "T", "section_id", `"S2"`, 300, "B"), op("b2", "task", "T", "position", `20`, 300, "B"))
	mustApply(t, s, "u1", op("a1", "task", "T", "section_id", `"S1"`, 200, "A"), op("a2", "task", "T", "position", `10`, 200, "A"))
	e, err := s.Get(ctx, "u1", "task", "T")
	if err != nil {
		t.Fatal(err)
	}
	if string(e["section_id"]) != `"S2"` || string(e["position"]) != `20` {
		t.Fatalf("task = %s %s", e["section_id"], e["position"])
	}
}

func TestPurgeProjectPurgesItsSections(t *testing.T) {
	s := newTestService(t)
	ctx := context.Background()
	mustApply(t, s, "u1",
		op("1", "project", "P", "name", `"Garden"`, 100, "A"),
		op("2", "section", "S1", "project_id", `"P"`, 100, "A"),
		op("3", "section", "S2", "project_id", `"P"`, 100, "A"),
		op("4", "section", "S2", "deleted_at", `150`, 150, "A"),
		op("5", "section", "Other", "project_id", `"Q"`, 100, "A"),
		op("6", "task", "T", "project_id", `"P"`, 100, "A"),
		op("7", "task", "T", "section_id", `"S1"`, 100, "A"),
		op("d", "project", "P", "deleted_at", `200`, 200, "A"),
	)
	res, err := s.Purge(ctx, "u1", "project", []string{"P"})
	if err != nil {
		t.Fatal(err)
	}
	if res.Projects != 1 || res.Tasks != 1 || res.Sections != 2 {
		t.Fatalf("purge = %+v", res)
	}
	for _, id := range []string{"S1", "S2"} {
		if n := countRows(t, s, `SELECT COUNT(*) FROM scope_fields WHERE entity_id = ?`, id); n != 0 {
			t.Fatalf("%s: %d fields left", id, n)
		}
	}
	if e, _ := s.Get(ctx, "u1", "section", "Other"); e == nil {
		t.Fatal("unrelated section purged")
	}
	// The pull reports the cascaded sections so devices delete them too.
	r, err := s.PullAll(ctx, "u1", 0, "other", 0)
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for _, p := range r.Purged {
		if p.Entity == "section" {
			got = append(got, p.EntityID)
		}
	}
	slices.Sort(got)
	if !slices.Equal(got, []string{"S1", "S2"}) {
		t.Fatalf("purged sections = %v", got)
	}
	// A stale offline edit of a purged section is discarded.
	res2 := mustApply(t, s, "u1", op("late", "section", "S1", "name", `"Back"`, 300, "B"))
	if res2.Applied != 0 || res2.Duplicates != 1 {
		t.Fatalf("stale section edit = %+v", res2)
	}
}
