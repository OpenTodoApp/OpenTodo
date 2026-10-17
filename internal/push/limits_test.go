package push

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

// TestSubscriptionCapReplacesOldest (INT-4): an account keeps at most 20
// subscriptions; registering one more replaces the least recently registered.
func TestSubscriptionCapReplacesOldest(t *testing.T) {
	e := newTestEnv(t)
	s := e.service()
	f := newFakePush(t)
	ctx := context.Background()
	for i := 0; i <= 20; i++ {
		*e.clock = e.clock.Add(time.Second)
		if _, _, err := s.Upsert(ctx, "u1", "", f.input(fmt.Sprintf("dev%02d", i), false)); err != nil {
			t.Fatal(err)
		}
	}
	list, err := s.ListByUser(ctx, "u1")
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 20 {
		t.Fatalf("subscriptions = %d, want 20", len(list))
	}
	if got, _ := s.SubscriptionForDevice(ctx, "u1", "dev00"); got != nil {
		t.Fatal("the oldest subscription was kept")
	}
	if got, _ := s.SubscriptionForDevice(ctx, "u1", "dev20"); got == nil {
		t.Fatal("the newest subscription was not stored")
	}
	// Another account is unaffected.
	if _, _, err := s.Upsert(ctx, "u2", "", f.input("phone", false)); err != nil {
		t.Fatal(err)
	}
	if list, _ := s.ListByUser(ctx, "u1"); len(list) != 20 {
		t.Fatalf("u1 subscriptions after u2 registered = %d", len(list))
	}
}

// TestDisabledSubscriptionIsSkipped (INT-4): a subscription that failed many
// times in a row and has not delivered for a day is no longer sent to, until
// the device registers it again.
func TestDisabledSubscriptionIsSkipped(t *testing.T) {
	e := newTestEnv(t)
	s := e.service()
	f := newFakePush(t)
	ctx := context.Background()
	sub, _, err := s.Upsert(ctx, "u1", "", f.input("phone", false))
	if err != nil {
		t.Fatal(err)
	}
	stale := e.clock.Add(-48 * time.Hour).UnixMilli()
	if _, err := e.db.Exec(`UPDATE push_subscriptions SET failures = 25, last_error = 'push service answered 500', updated_at = ? WHERE id = ?`, stale, sub.ID); err != nil {
		t.Fatal(err)
	}
	now := e.clock.UnixMilli()
	e.apply(t, "u1", map[string]map[string]any{"task:t1": {"title": "x"}})
	e.reminder(t, "u1", "r1", "t1", now-1)
	if _, err := s.Tick(ctx); err != nil {
		t.Fatal(err)
	}
	if got := len(f.received()); got != 0 {
		t.Fatalf("disabled subscription received %d pushes", got)
	}
	// Registering again (the device's "Re-enable") gives it a fresh start.
	if _, _, err := s.Upsert(ctx, "u1", "", f.input("phone", false)); err != nil {
		t.Fatal(err)
	}
	e.reminder(t, "u1", "r2", "t1", now)
	if _, err := s.Tick(ctx); err != nil {
		t.Fatal(err)
	}
	if got := len(f.received()); got != 1 {
		t.Fatalf("re-registered subscription received %d pushes, want 1", got)
	}
}

// TestSlowEndpointDoesNotDelayOthers (INT-4): sends run concurrently per
// account, so one account's hanging push endpoint does not hold back another
// account's reminders.
func TestSlowEndpointDoesNotDelayOthers(t *testing.T) {
	e := newTestEnv(t)
	s := e.service()
	release := make(chan struct{})
	slow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-release:
		case <-time.After(5 * time.Second):
		}
		w.WriteHeader(http.StatusCreated)
	}))
	t.Cleanup(slow.Close)
	t.Cleanup(func() {
		select {
		case <-release:
		default:
			close(release)
		}
	})
	fast := newFakePush(t)
	ctx := context.Background()
	for i := 0; i < 3; i++ {
		in := fast.input(fmt.Sprintf("slow%d", i), false)
		in.Endpoint = slow.URL + fmt.Sprintf("/push/%d", i)
		if _, _, err := s.Upsert(ctx, "u1", "", in); err != nil {
			t.Fatal(err)
		}
	}
	if _, _, err := s.Upsert(ctx, "u2", "", fast.input("phone", false)); err != nil {
		t.Fatal(err)
	}
	now := e.clock.UnixMilli()
	e.apply(t, "u1", map[string]map[string]any{"task:t1": {"title": "x"}})
	e.apply(t, "u2", map[string]map[string]any{"task:t2": {"title": "y"}})
	e.reminder(t, "u1", "r1", "t1", now-2) // due first
	e.reminder(t, "u2", "r2", "t2", now-1)
	done := make(chan struct{})
	go func() {
		defer close(done)
		_, _ = s.Tick(ctx)
	}()
	deadline := time.Now().Add(2 * time.Second)
	for len(fast.received()) == 0 {
		if time.Now().After(deadline) {
			close(release)
			<-done
			t.Fatal("another account's reminder waited for the slow endpoint")
		}
		time.Sleep(10 * time.Millisecond)
	}
	close(release)
	<-done
}

// TestUserSendBudget (INT-4): once an account's sends in one pass take longer
// than its budget, its remaining sends wait for the next pass and the reminder
// is not recorded as delivered.
func TestUserSendBudget(t *testing.T) {
	e := newTestEnv(t)
	s := e.service()
	s.userBudget = 50 * time.Millisecond
	var hits atomic.Int64
	slow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		time.Sleep(100 * time.Millisecond)
		w.WriteHeader(http.StatusCreated)
	}))
	t.Cleanup(slow.Close)
	f := newFakePush(t)
	ctx := context.Background()
	for i := 0; i < 3; i++ {
		in := f.input(fmt.Sprintf("dev%d", i), false)
		in.Endpoint = slow.URL + fmt.Sprintf("/push/%d", i)
		if _, _, err := s.Upsert(ctx, "u1", "", in); err != nil {
			t.Fatal(err)
		}
	}
	now := e.clock.UnixMilli()
	e.apply(t, "u1", map[string]map[string]any{"task:t1": {"title": "x"}})
	e.reminder(t, "u1", "r1", "t1", now-1)
	n, err := s.Tick(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if n != 0 || hits.Load() != 1 {
		t.Fatalf("recorded %d after %d sends, want 0 after 1", n, hits.Load())
	}
	// Past the retry window the reminder is recorded even if the budget runs out.
	*e.clock = e.clock.Add(RetryWindow + time.Minute)
	if n, _ := s.Tick(ctx); n != 1 {
		t.Fatalf("recorded %d after the retry window, want 1", n)
	}
}
