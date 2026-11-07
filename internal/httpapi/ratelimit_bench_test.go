package httpapi

import (
	"context"
	"strconv"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/ratelimit"
	"github.com/OpenTodoApp/opentodo/internal/store/storetest"
)

// What a stored limiter adds to a check (persistent-limits D6): the key's
// hash and a flag; the write happens later, in the limits job.
func BenchmarkRateLimiterHit(b *testing.B) {
	keys := make([]string, 1024)
	for i := range keys {
		keys[i] = "203.0.113." + strconv.Itoa(i%256) + "/" + strconv.Itoa(i)
	}
	b.Run("memory", func(b *testing.B) {
		l := newRateLimiter(10, time.Minute)
		for i := 0; b.Loop(); i++ {
			l.hit(keys[i%len(keys)])
		}
	})
	b.Run("stored", func(b *testing.B) {
		db, err := storetest.OpenDir(b.TempDir())
		if err != nil {
			b.Fatal(err)
		}
		defer db.Close()
		st, err := ratelimit.Open(context.Background(), db, nil, nil)
		if err != nil {
			b.Fatal(err)
		}
		l := newRateLimiter(10, time.Minute)
		l.store = st
		st.Register("bench", l)
		for i := 0; b.Loop(); i++ {
			l.hit(keys[i%len(keys)])
		}
	})
}

// TestStoredLimiterRestores: a stored limiter's window is found again by a new
// limiter over the same store's rows, with its refusals (one audit event per
// window).
func TestStoredLimiterRestores(t *testing.T) {
	ctx := context.Background()
	db, err := storetest.OpenDir(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	st, err := ratelimit.Open(ctx, db, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	l := newRateLimiter(2, time.Minute)
	l.store = st
	st.Register("login", l)
	for range 3 {
		l.hit("2001:db8::1")
	}
	if blocked, first := l.check("2001:db8::2"); !blocked || !first {
		t.Fatalf("check = %v %v, want blocked (same /64) and the first refusal", blocked, first)
	}
	if err := st.Flush(ctx); err != nil {
		t.Fatal(err)
	}
	st2, err := ratelimit.Open(ctx, db, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	again := newRateLimiter(2, time.Minute)
	again.store = st2
	st2.Register("login", again)
	if !again.blocked("2001:db8::3") {
		t.Fatal("restored window not blocked")
	}
	if blocked, first := again.check("2001:db8::3"); !blocked || first {
		t.Fatalf("check after restore = %v %v, want blocked and not a first refusal", blocked, first)
	}
	if again.retryAfter("2001:db8::3") <= 0 {
		t.Fatal("no retry time after restore")
	}
	// A reset (a successful sign-in) removes the stored row.
	again.reset("2001:db8::3")
	if err := st2.Flush(ctx); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM limit_windows WHERE limiter = 'login'`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("rows after reset = %d %v", n, err)
	}
}
