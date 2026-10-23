package push

import (
	"context"
	"net/http"
	"testing"
)

// Every firing is handed to the reminder hook (notification-channels D2): with
// no device, on each retried pass while pushes fail, and never once delivered.
func TestReminderHookSeesEveryFiring(t *testing.T) {
	e := newTestEnv(t)
	ctx := context.Background()
	s := e.service()
	var got []DueReminder
	s.SetReminderHook(func(_ context.Context, r DueReminder) { got = append(got, r) })
	now := e.clock.UnixMilli()
	e.apply(t, "u1", map[string]map[string]any{"task:t1": {"title": "Water the plants"}})
	e.reminder(t, "u1", "r1", "t1", now-1)
	if n, _ := s.Tick(ctx); n != 1 || len(got) != 1 || got[0].ID != "r1" || got[0].Title != "Water the plants" || got[0].FireAt != now-1 {
		t.Fatalf("no device: recorded %d, hook %+v", n, got)
	}
	if _, _ = s.Tick(ctx); len(got) != 1 {
		t.Fatalf("delivered reminder handed over again: %+v", got)
	}
	down := newFakePush(t)
	down.status = http.StatusServiceUnavailable
	_, _, _ = s.Upsert(ctx, "u1", "", down.input("phone", false))
	e.reminder(t, "u1", "r2", "t1", now)
	_, _ = s.Tick(ctx)
	_, _ = s.Tick(ctx)
	if len(got) != 3 || got[1].ID != "r2" || got[2].ID != "r2" {
		t.Fatalf("retried firing: %+v", got)
	}
}
