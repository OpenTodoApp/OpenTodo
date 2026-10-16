package digest

import "testing"

// TestDueAt: the host's "next due" time for one row matches what a pass does
// (multi-tenant-host D3): the hour ahead, now when a pass would act, the next
// retry, or the end of the window when it comes first.
func TestDueAt(t *testing.T) {
	st := Settings{UserID: "u1", Enabled: true, Weekday: 5, Hour: 7, TimeZone: "Europe/Zurich", Lang: "en"}
	attempted := func(s string) Settings { c := st; c.LastAttemptAt = at(s).UnixMilli(); return c }
	sent := st
	sent.LastSentFor = "2026-10-23"
	for _, tc := range []struct {
		name string
		st   Settings
		now  string
		want string
	}{
		{"ahead", st, "2026-10-21 12:00", "2026-10-23 07:00"},
		{"due now", st, "2026-10-23 07:01", "2026-10-23 07:01"},
		{"retry", attempted("2026-10-23 08:00"), "2026-10-23 08:05", "2026-10-23 08:15"},
		{"window ends first", attempted("2026-10-23 12:50"), "2026-10-23 12:55", "2026-10-23 13:00"},
		{"give up now", attempted("2026-10-23 12:50"), "2026-10-23 13:00", "2026-10-23 13:00"},
		{"sent: next week", sent, "2026-10-23 09:00", "2026-10-30 07:00"},
	} {
		if got := dueAt(tc.st, at(tc.now)); !got.Equal(at(tc.want)) {
			t.Errorf("%s: %v, want %s", tc.name, got.In(zurich), tc.want)
		}
	}
	off := st
	off.Enabled = false
	if got := dueAt(off, at("2026-10-21 12:00")); !got.IsZero() {
		t.Errorf("disabled: %v", got)
	}
}
