package push

import (
	"context"
	"testing"
	"time"
)

// An away period that pauses reminders (away-periods "Quiet while away"): a
// reminder firing inside it reaches neither the devices nor the channels and is
// not delivered later; the day after the period, reminders go out again. The
// day is the user's logical day in their zone.
func TestAwayHoldsReminders(t *testing.T) {
	e := newTestEnv(t)
	ctx := context.Background()
	s := e.service()
	var got []string
	s.SetReminderHook(func(_ context.Context, r DueReminder) { got = append(got, r.ID) })
	// UTC+10: at 2026-11-30 20:00 UTC it is already 1 December there.
	s.SetUserZone(func(context.Context, string) *time.Location { return time.FixedZone("", 10*3600) })
	*e.clock = time.Date(2026, 11, 26, 9, 0, 0, 0, time.UTC)
	e.apply(t, "u1", map[string]map[string]any{
		"task:t1":       {"title": "Call the dentist"},
		"user_prefs:me": {"away": "2026-11-24..2026-11-30 quiet"},
	})
	e.reminder(t, "u1", "r1", "t1", e.clock.UnixMilli()-1)
	if _, err := s.Tick(ctx); err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Fatalf("held reminder handed over: %v", got)
	}
	*e.clock = time.Date(2026, 11, 30, 20, 0, 0, 0, time.UTC)
	_, _ = s.Tick(ctx)
	if len(got) != 0 {
		t.Fatalf("dropped reminder delivered later: %v", got)
	}
	e.reminder(t, "u1", "r2", "t1", e.clock.UnixMilli()-1)
	_, _ = s.Tick(ctx)
	if len(got) != 1 || got[0] != "r2" {
		t.Fatalf("the day after the period: %v", got)
	}
}

// A period that keeps reminders (no " quiet"), and a malformed value, hold nothing.
func TestAwayWithoutQuietDelivers(t *testing.T) {
	for _, v := range []string{"2026-11-24..2026-11-30", "2026-11-24..garbage quiet"} {
		e := newTestEnv(t)
		s := e.service()
		var got []string
		s.SetReminderHook(func(_ context.Context, r DueReminder) { got = append(got, r.ID) })
		*e.clock = time.Date(2026, 11, 26, 9, 0, 0, 0, time.UTC)
		e.apply(t, "u1", map[string]map[string]any{"task:t1": {"title": "x"}, "user_prefs:me": {"away": v}})
		e.reminder(t, "u1", "r1", "t1", e.clock.UnixMilli()-1)
		_, _ = s.Tick(context.Background())
		if len(got) != 1 {
			t.Fatalf("%q: %v", v, got)
		}
	}
}
