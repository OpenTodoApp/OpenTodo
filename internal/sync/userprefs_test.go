package sync

import (
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
