package sync

import (
	"errors"
	"slices"
	"testing"
)

// TestUserPrefsArePersonalAndConverge (date-time-preferences D1): every user
// writes the same entityId "me", yet each row stays in its author's personal
// scope, reaches only the author's other devices, and concurrent writes from two
// devices converge on the op with the greater (ts, device).
func TestUserPrefsArePersonalAndConverge(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor) // sharing a project does not share preferences

	if res := f.apply("alice", "A", f.op("user_prefs", "me", "date_format", `"day-month"`)); res.Applied != 1 || len(res.Rejected) != 0 {
		t.Fatalf("alice write = %+v", res)
	}
	if res := f.apply("bob", "B", f.op("user_prefs", "me", "date_format", `"month-day"`)); res.Applied != 1 || len(res.Rejected) != 0 {
		t.Fatalf("bob write = %+v", res)
	}
	if got := f.field("alice", "user_prefs", "me", "date_format"); got != `"day-month"` {
		t.Fatalf("alice reads %s", got)
	}
	if got := f.field("bob", "user_prefs", "me", "date_format"); got != `"month-day"` {
		t.Fatalf("bob reads %s", got)
	}
	values := func(user, device string) []string {
		ops, _ := f.pullAll(user, device, 0)
		var out []string
		for _, o := range ops {
			if o.Entity == "user_prefs" {
				out = append(out, string(o.Value))
			}
		}
		return out
	}
	if got := values("alice", "A2"); !slices.Equal(got, []string{`"day-month"`}) {
		t.Fatalf("alice's other device got %v", got)
	}
	if got := values("bob", "B2"); !slices.Equal(got, []string{`"month-day"`}) {
		t.Fatalf("bob's other device got %v", got)
	}

	// Two of alice's devices write offline; the later timestamp wins wherever the ops land first.
	early := f.op("user_prefs", "me", "time_format", `"12h"`)
	late := f.op("user_prefs", "me", "time_format", `"24h"`)
	f.apply("alice", "A2", late)
	f.apply("alice", "A", early)
	if got := f.field("alice", "user_prefs", "me", "time_format"); got != `"24h"` {
		t.Fatalf("after concurrent writes alice reads %s, want the later \"24h\"", got)
	}

	// Equal timestamps: the device id breaks the tie, the same way on every server.
	a := f.op("user_prefs", "me", "week_start", `"sun"`)
	b := a
	b.ID, b.Value = a.ID+"-b", []byte(`"sat"`)
	f.apply("alice", "Z", b)
	f.apply("alice", "A", a)
	if got := f.field("alice", "user_prefs", "me", "week_start"); got != `"sat"` {
		t.Fatalf("tie on ts: alice reads %s, want the greater device's \"sat\"", got)
	}

	// Appearance (theming D1): mode and accent converge per field, so a mode
	// change on one device and an accent change on another both survive.
	mode := f.op("user_prefs", "me", "theme_mode", `"dark"`)
	accent := f.op("user_prefs", "me", "theme_accent", `"orange"`)
	if res := f.apply("alice", "A", mode); res.Applied != 1 || len(res.Rejected) != 0 {
		t.Fatalf("theme_mode = %+v", res)
	}
	if res := f.apply("alice", "A2", accent); res.Applied != 1 || len(res.Rejected) != 0 {
		t.Fatalf("theme_accent = %+v", res)
	}
	if f.field("alice", "user_prefs", "me", "theme_mode") != `"dark"` || f.field("alice", "user_prefs", "me", "theme_accent") != `"orange"` {
		t.Fatal("appearance fields did not both survive")
	}
	if got := f.field("bob", "user_prefs", "me", "theme_accent"); got != "" {
		t.Fatalf("bob sees alice's accent: %s", got)
	}

	// Interface language (app-localization D1): personal like the date fields and
	// converging by (ts, device).
	de := f.op("user_prefs", "me", "language", `"de"`)
	es := f.op("user_prefs", "me", "language", `"es"`)
	f.apply("alice", "A", es)
	f.apply("alice", "A2", de)
	if got := f.field("alice", "user_prefs", "me", "language"); got != `"es"` {
		t.Fatalf("language: alice reads %s, want the later \"es\"", got)
	}
	if got := f.field("bob", "user_prefs", "me", "language"); got != "" {
		t.Fatalf("bob sees alice's language: %s", got)
	}
}

// TestDayStartIsPersonalAndConverges (day-boundary D1): the day start is an
// additive string field of user_prefs; it lands in the author's personal scope
// only and two devices' concurrent writes converge by (ts, device).
func TestDayStartIsPersonalAndConverges(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	early := f.op("user_prefs", "me", "day_start", `"02:00"`)
	late := f.op("user_prefs", "me", "day_start", `"04:00"`)
	if res := f.apply("alice", "A", late); res.Applied != 1 || len(res.Rejected) != 0 {
		t.Fatalf("day_start write = %+v", res)
	}
	f.apply("alice", "A2", early)
	if got := f.field("alice", "user_prefs", "me", "day_start"); got != `"04:00"` {
		t.Fatalf("alice reads %s, want the later \"04:00\"", got)
	}
	if got := f.field("bob", "user_prefs", "me", "day_start"); got != "<none>" {
		t.Fatalf("bob sees alice's day start: %s", got)
	}
	ops, _ := f.pullAll("bob", "B2", 0)
	for _, o := range ops {
		if o.Entity == "user_prefs" {
			t.Fatalf("bob's device pulled %+v", o)
		}
	}
	// Equal timestamps: the greater device id wins on every server.
	a := f.op("user_prefs", "me", "day_start", `"01:00"`)
	b := a
	b.ID, b.Value = a.ID+"-b", []byte(`"03:00"`)
	f.apply("alice", "Z", b)
	f.apply("alice", "A", a)
	if got := f.field("alice", "user_prefs", "me", "day_start"); got != `"03:00"` {
		t.Fatalf("tie on ts: alice reads %s, want \"03:00\"", got)
	}
}

// TestRowDetailValidates (calm-rows D1): the row detail preference is an additive
// string field of user_prefs; a sync batch carrying it is accepted, another kind refused.
func TestRowDetailValidates(t *testing.T) {
	op := Op{ID: "o", Entity: "user_prefs", EntityID: "me", Field: "row_detail", TS: 1, Device: "D", Value: []byte(`"detailed"`)}
	if err := Validate(op); err != nil {
		t.Fatalf("row_detail = detailed refused: %v", err)
	}
	op.Value = []byte(`true`)
	if err := Validate(op); !errors.Is(err, ErrInvalidOp) {
		t.Fatalf("row_detail = true accepted (err %v)", err)
	}
	f := newSharing(t)
	if res := f.apply("alice", "A", f.op("user_prefs", "me", "row_detail", `"detailed"`)); res.Applied != 1 || len(res.Rejected) != 0 {
		t.Fatalf("batch with row_detail: %+v", res)
	}
	if got := f.field("alice", "user_prefs", "me", "row_detail"); got != `"detailed"` {
		t.Fatalf("row_detail = %s", got)
	}
}

// TestFavouritesValidates (sidebar-favourites D1): the favourites list is an
// additive string field of user_prefs; a batch carrying it is accepted and
// stored, a batch without it still applies, and another kind is refused.
func TestFavouritesValidates(t *testing.T) {
	op := Op{ID: "o", Entity: "user_prefs", EntityID: "me", Field: "favourites", TS: 1, Device: "D", Value: []byte(`"project:p1,view:v1"`)}
	if err := Validate(op); err != nil {
		t.Fatalf("favourites refused: %v", err)
	}
	op.Value = []byte(`["project:p1"]`)
	if err := Validate(op); !errors.Is(err, ErrInvalidOp) {
		t.Fatalf("favourites as an array accepted (err %v)", err)
	}
	f := newSharing(t)
	if res := f.apply("alice", "A", f.op("user_prefs", "me", "density", `"compact"`)); res.Applied != 1 || len(res.Rejected) != 0 {
		t.Fatalf("batch without favourites: %+v", res)
	}
	if res := f.apply("alice", "A", f.op("user_prefs", "me", "favourites", `"label:l1,future:x"`)); res.Applied != 1 || len(res.Rejected) != 0 {
		t.Fatalf("batch with favourites: %+v", res)
	}
	if got := f.field("alice", "user_prefs", "me", "favourites"); got != `"label:l1,future:x"` {
		t.Fatalf("favourites = %s", got)
	}
	if got := f.field("bob", "user_prefs", "me", "favourites"); got != "<none>" {
		t.Fatalf("bob sees alice's favourites: %s", got)
	}
}

// TestFocusPrefsValidate (focus-mode D5): the eight focus preferences are additive
// user_prefs fields, strings and numbers each checked by kind; they resolve to the
// author's personal scope and converge per field by last-writer-wins.
func TestFocusPrefsValidate(t *testing.T) {
	good := map[string]string{
		"focus_mode": `"flowtime"`, "focus_auto_start": `"both"`, "focus_sound": `"on"`,
		"focus_work_minutes": `50`, "focus_short_break_minutes": `5`, "focus_long_break_minutes": `15`,
		"focus_long_break_every": `4`, "focus_break_after_minutes": `90`,
	}
	for field, value := range good {
		op := Op{ID: "o", Entity: "user_prefs", EntityID: "me", Field: field, TS: 1, Device: "D", Value: []byte(value)}
		if err := Validate(op); err != nil {
			t.Fatalf("%s = %s refused: %v", field, value, err)
		}
	}
	for _, field := range []string{"focus_work_minutes", "focus_long_break_every", "focus_break_after_minutes"} {
		op := Op{ID: "o", Entity: "user_prefs", EntityID: "me", Field: field, TS: 1, Device: "D", Value: []byte(`"25"`)}
		if err := Validate(op); !errors.Is(err, ErrInvalidOp) {
			t.Fatalf("%s = \"25\" (a string) accepted (err %v)", field, err)
		}
	}
	op := Op{ID: "o", Entity: "user_prefs", EntityID: "me", Field: "focus_mode", TS: 1, Device: "D", Value: []byte(`3`)}
	if err := Validate(op); !errors.Is(err, ErrInvalidOp) {
		t.Fatalf("focus_mode = 3 accepted (err %v)", err)
	}

	f := newSharing(t)
	f.add("alice", "bob", RoleEditor) // sharing a project does not share preferences
	if res := f.apply("alice", "A", f.op("user_prefs", "me", "focus_work_minutes", `50`)); res.Applied != 1 || len(res.Rejected) != 0 {
		t.Fatalf("alice write = %+v", res)
	}
	if got := f.field("alice", "user_prefs", "me", "focus_work_minutes"); got != `50` {
		t.Fatalf("alice reads %s", got)
	}
	if got := f.field("bob", "user_prefs", "me", "focus_work_minutes"); got != "<none>" && got != "" {
		t.Fatalf("bob reads alice's focus preference: %s", got)
	}
	// Two devices offline: the laptop sets the mode, the phone the work length; both survive.
	f.apply("alice", "laptop", f.op("user_prefs", "me", "focus_mode", `"flowtime"`))
	f.apply("alice", "phone", f.op("user_prefs", "me", "focus_work_minutes", `30`))
	if got := f.field("alice", "user_prefs", "me", "focus_mode"); got != `"flowtime"` {
		t.Fatalf("focus_mode = %s", got)
	}
	if got := f.field("alice", "user_prefs", "me", "focus_work_minutes"); got != `30` {
		t.Fatalf("focus_work_minutes = %s", got)
	}
}
