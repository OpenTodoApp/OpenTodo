package sync

import (
	"context"
	"testing"
	"time"
)

func recv(t *testing.T, sub *Subscription, within time.Duration) (int64, bool) {
	t.Helper()
	select {
	case seq := <-sub.C():
		return seq, true
	case <-time.After(within):
		return 0, false
	}
}

func TestNotifierExcludesOriginDevice(t *testing.T) {
	n := NewNotifier()
	phone := n.Subscribe("u1", "phone")
	laptop := n.Subscribe("u1", "laptop")
	other := n.Subscribe("u2", "phone")
	defer n.Unsubscribe(phone)
	defer n.Unsubscribe(laptop)
	defer n.Unsubscribe(other)

	n.Notify("u1", "phone", 7)
	if _, ok := recv(t, phone, 50*time.Millisecond); ok {
		t.Fatal("origin device must not be woken by its own push")
	}
	if seq, ok := recv(t, laptop, time.Second); !ok || seq != 7 {
		t.Fatalf("laptop wake-up = %d, %v; want 7", seq, ok)
	}
	if _, ok := recv(t, other, 50*time.Millisecond); ok {
		t.Fatal("another user's stream must never be woken")
	}

	// REST writes use a device no browser has, so every device is woken.
	n.Notify("u1", "server", 8)
	if seq, ok := recv(t, phone, time.Second); !ok || seq != 8 {
		t.Fatalf("phone wake-up after REST write = %d, %v", seq, ok)
	}
	if seq, ok := recv(t, laptop, time.Second); !ok || seq != 8 {
		t.Fatalf("laptop wake-up after REST write = %d, %v", seq, ok)
	}
}

func TestNotifierCoalescesSlowSubscriber(t *testing.T) {
	n := NewNotifier()
	sub := n.Subscribe("u1", "slow")
	defer n.Unsubscribe(sub)
	done := make(chan struct{})
	go func() {
		defer close(done)
		for seq := int64(1); seq <= 100; seq++ {
			n.Notify("u1", "other", seq)
		}
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Notify blocked on a subscriber that is not reading")
	}
	seq, ok := recv(t, sub, time.Second)
	if !ok || seq != 100 {
		t.Fatalf("coalesced wake-up = %d, %v; want the newest cursor 100", seq, ok)
	}
	if _, ok := recv(t, sub, 50*time.Millisecond); ok {
		t.Fatal("expected exactly one buffered wake-up")
	}
}

func TestNotifierEvictsOldestOverCap(t *testing.T) {
	n := NewNotifier()
	subs := make([]*Subscription, 0, MaxStreamsPerUser+1)
	for i := 0; i < MaxStreamsPerUser; i++ {
		subs = append(subs, n.Subscribe("u1", "d"))
	}
	if got := n.Count("u1"); got != MaxStreamsPerUser {
		t.Fatalf("count = %d, want %d", got, MaxStreamsPerUser)
	}
	select {
	case <-subs[0].Done():
		t.Fatal("oldest closed before the cap was exceeded")
	default:
	}
	extra := n.Subscribe("u1", "d")
	subs = append(subs, extra)
	select {
	case <-subs[0].Done():
	case <-time.After(time.Second):
		t.Fatal("oldest subscription was not evicted")
	}
	select {
	case <-subs[1].Done():
		t.Fatal("only the oldest subscription should be evicted")
	default:
	}
	if got := n.Count("u1"); got != MaxStreamsPerUser {
		t.Fatalf("count after eviction = %d, want %d", got, MaxStreamsPerUser)
	}
	// The newest subscriber is live and the evicted one is gone from the fan-out.
	n.Notify("u1", "x", 3)
	if seq, ok := recv(t, extra, time.Second); !ok || seq != 3 {
		t.Fatalf("new subscriber wake-up = %d, %v", seq, ok)
	}
	if _, ok := recv(t, subs[0], 50*time.Millisecond); ok {
		t.Fatal("evicted subscriber still receives wake-ups")
	}
	for _, s := range subs {
		n.Unsubscribe(s)
	}
	if got := n.Count("u1"); got != 0 {
		t.Fatalf("count after unsubscribe = %d", got)
	}
}

func TestNotifierCloseAll(t *testing.T) {
	n := NewNotifier()
	a := n.Subscribe("u1", "a")
	b := n.Subscribe("u2", "b")
	n.CloseAll()
	for _, s := range []*Subscription{a, b} {
		select {
		case <-s.Done():
		case <-time.After(time.Second):
			t.Fatal("CloseAll did not close a subscription")
		}
	}
	// Unsubscribe after CloseAll is harmless.
	n.Unsubscribe(a)
}

func TestApplyReportsLatestSeq(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	res, err := s.Apply(ctx, "u", []Op{op("1", "task", "t1", "title", `"a"`, 1, "A"), op("2", "task", "t1", "title", `"b"`, 2, "A")})
	if err != nil {
		t.Fatal(err)
	}
	if res.Seq == 0 {
		t.Fatal("Apply must report the latest cursor")
	}
	_, cursor, _, _ := s.Pull(ctx, "u", 0, "", 10)
	if res.Seq != cursor {
		t.Fatalf("Apply seq = %d, Pull cursor = %d", res.Seq, cursor)
	}
	// Duplicates do not move the cursor.
	again, _ := s.Apply(ctx, "u", []Op{op("1", "task", "t1", "title", `"a"`, 1, "A")})
	if again.Seq != res.Seq || again.Applied != 0 {
		t.Fatalf("duplicate apply = %+v", again)
	}
	if s.Notifier() == nil {
		t.Fatal("service must expose a notifier")
	}
}
