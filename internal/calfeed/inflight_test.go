package calfeed

import (
	"context"
	"net/http"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// Inline fetches (create, URL change, Refresh now) share the worker's bound:
// however many arrive at once, at most InFlight calendars are being fetched.
func TestRefreshSharesTheInFlightBound(t *testing.T) {
	s, _ := newStore(t)
	ctx := context.Background()
	google, _ := os.ReadFile("testdata/google.ics")
	var open, most atomic.Int32
	srv := serve(t, func(w http.ResponseWriter, r *http.Request) {
		n := open.Add(1)
		defer open.Add(-1)
		for {
			m := most.Load()
			if n <= m || most.CompareAndSwap(m, n) {
				break
			}
		}
		time.Sleep(50 * time.Millisecond)
		w.Write(google)
	})
	w := &Worker{Store: s, Fetcher: localFetcher()}
	var wg sync.WaitGroup
	for i := 0; i < 5; i++ {
		sub, err := s.Create(ctx, "u1", srv.URL+"/"+string(rune('a'+i)), "", "")
		if err != nil {
			t.Fatal(err)
		}
		wg.Add(1)
		go func() { defer wg.Done(); _, _ = w.Refresh(ctx, sub) }()
	}
	wg.Wait()
	if m := most.Load(); m > InFlight {
		t.Fatalf("%d fetches at once, want at most %d", m, InFlight)
	}
}

// A request that gives up while it waits for a slot returns at once and
// records nothing.
func TestRefreshWaitingGivesUpWithTheRequest(t *testing.T) {
	s, _ := newStore(t)
	w := &Worker{Store: s, Fetcher: localFetcher()}
	for i := 0; i < InFlight; i++ {
		if err := w.acquire(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	sub, _ := s.Create(context.Background(), "u1", "https://calendar.example/a.ics", "", "")
	if _, err := w.Refresh(ctx, sub); err == nil {
		t.Fatal("a refresh without a slot succeeded")
	}
	got, _ := s.Get(context.Background(), "u1", sub.ID)
	if got.LastError != "" {
		t.Fatalf("a refresh that never started recorded %q", got.LastError)
	}
}
