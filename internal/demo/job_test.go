package demo

import (
	"context"
	"testing"
	"time"
)

// TestDemoJobSchedule (one-job-model): the demo job is due for a cleanup at
// startup and every CleanupInterval after the last one, and for the nightly
// reset at the first ResetHour after the last reset.
func TestDemoJobSchedule(t *testing.T) {
	ctx := context.Background()
	s, db := newDemo(t)
	noon := time.Date(2026, 10, 27, 12, 0, 0, 0, time.UTC)
	clock := noon
	s.SetClock(func() time.Time { return clock })
	if err := s.settings.Set(ctx, resetKey, noon.Add(-9*time.Hour).UnixMilli()); err != nil { // 03:00 today
		t.Fatal(err)
	}
	if at, ok, err := s.NextDue(ctx); err != nil || !ok || at.After(clock) {
		t.Fatalf("next due %v %v %v, want a cleanup at startup", at, ok, err)
	}
	s.RunDue(ctx)
	if at, _, _ := s.NextDue(ctx); !at.Equal(noon.Add(CleanupInterval)) {
		t.Fatalf("next due %v, want the next cleanup", at)
	}
	sandbox(t, s, "192.0.2.1")
	// Late in the evening the next cleanup is still first; past 03:00 the reset is due.
	clock = time.Date(2026, 10, 28, 2, 58, 0, 0, time.UTC)
	s.RunDue(ctx)
	if at, _, _ := s.NextDue(ctx); !at.Equal(time.Date(2026, 10, 28, 3, 0, 0, 0, time.UTC)) {
		t.Fatalf("next due %v, want the nightly reset", at)
	}
	clock = time.Date(2026, 10, 28, 3, 0, 1, 0, time.UTC)
	s.RunDue(ctx)
	if n := count(t, db, `SELECT COUNT(*) FROM demo_sandboxes`); n != 0 {
		t.Fatalf("sandboxes after the nightly reset = %d", n)
	}
	if at, _, _ := s.NextDue(ctx); !at.Equal(time.Date(2026, 10, 28, 2, 58, 0, 0, time.UTC).Add(CleanupInterval)) {
		t.Fatalf("next due %v, want the cleanup after the 02:58 one", at)
	}
}
