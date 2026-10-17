package push

import (
	"context"
	"fmt"
	"net/http"
	"testing"
	"time"
)

// cancelAfter is a transport that cancels a context once the push service has
// answered: shutdown began while the push was in flight.
type cancelAfter struct {
	base   http.RoundTripper
	cancel context.CancelFunc
}

func (c cancelAfter) RoundTrip(r *http.Request) (*http.Response, error) {
	resp, err := c.base.RoundTrip(r)
	c.cancel()
	return resp, err
}

// TestShutdownDuringPushRecordsDelivery (reliable-background-jobs): a reminder
// pushed while the server began shutting down is still recorded as delivered,
// so it is not pushed again after the restart.
func TestShutdownDuringPushRecordsDelivery(t *testing.T) {
	e := newTestEnv(t)
	f := newFakePush(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s := New(e.db, e.sync, e.dir, Options{AllowHTTP: true, Client: &http.Client{Transport: cancelAfter{http.DefaultTransport, cancel}}, Now: func() time.Time { return *e.clock }})
	if _, _, err := s.Upsert(context.Background(), "u1", "", f.input("phone", false)); err != nil {
		t.Fatal(err)
	}
	now := e.clock.UnixMilli()
	e.apply(t, "u1", map[string]map[string]any{"task:t1": {"title": "Call", "completed_at": nil, "deleted_at": nil}})
	e.reminder(t, "u1", "r1", "t1", now-60_000)
	_, _ = s.Tick(ctx)
	if got := f.received(); len(got) != 1 {
		t.Fatalf("pushed %d, want 1", len(got))
	}
	if n, err := e.service().Tick(context.Background()); err != nil || n != 0 {
		t.Fatalf("tick after restart recorded %d, %v", n, err)
	}
	if got := f.received(); len(got) != 1 {
		t.Fatalf("pushed again after the restart: %d", len(got))
	}
}

// TestStaleRemindersAreDismissed (reliable-background-jobs): reminders of
// completed or deleted tasks are recorded as dismissed by the server once, so
// the scheduler stops examining them on every pass, and they never hide a due
// reminder behind them.
func TestStaleRemindersAreDismissed(t *testing.T) {
	e := newTestEnv(t)
	f := newFakePush(t)
	ctx := context.Background()
	s := e.service()
	if _, _, err := s.Upsert(ctx, "u1", "", f.input("phone", false)); err != nil {
		t.Fatal(err)
	}
	now := e.clock.UnixMilli()
	e.apply(t, "u1", map[string]map[string]any{
		"task:done":    {"title": "Done", "completed_at": now - 5000, "deleted_at": nil},
		"task:deleted": {"title": "Gone", "completed_at": nil, "deleted_at": now - 5000},
		"task:open":    {"title": "Open", "completed_at": nil, "deleted_at": nil},
	})
	const stale = 1200 // more than a page of candidates
	for i := 0; i < stale; i++ {
		task := "done"
		if i%2 == 1 {
			task = "deleted"
		}
		e.reminder(t, "u1", fmt.Sprintf("r-stale-%04d", i), task, now-int64(10*60_000-i))
	}
	e.reminder(t, "u1", "r-open", "open", now-1000) // fires after every stale one
	n, err := s.Tick(ctx)
	if err != nil || n != 1 {
		t.Fatalf("tick recorded %d, %v", n, err)
	}
	if got := f.received(); len(got) != 1 || got[0].ReminderID != "r-open" {
		t.Fatalf("pushed = %+v", got)
	}
	cands, err := s.candidates(ctx, now, -1)
	if err != nil {
		t.Fatal(err)
	}
	if len(cands) != 0 {
		t.Fatalf("%d reminders are still scanned on every pass", len(cands))
	}
	r, _ := e.sync.Get(ctx, "u1", "reminder", "r-stale-0000")
	if string(r["dismissed_at"]) == "null" || string(r["delivered_at"]) != "null" {
		t.Fatalf("stale reminder = dismissed %s delivered %s", r["dismissed_at"], r["delivered_at"])
	}
	// Reopening the task and moving the reminder to a new time fires it again.
	*e.clock = e.clock.Add(time.Minute)
	e.apply(t, "u1", map[string]map[string]any{"task:done": {"completed_at": nil}, "reminder:r-stale-0000": {"fire_at": e.clock.UnixMilli() - 10, "dismissed_at": nil}})
	if n, _ := s.Tick(ctx); n != 1 {
		t.Fatalf("re-fired %d, want 1", n)
	}
}
