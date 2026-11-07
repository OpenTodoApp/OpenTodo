package ratelimit_test

import (
	"context"
	"database/sql"
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/agenttools"
	"github.com/OpenTodoApp/opentodo/internal/ratelimit"
	"github.com/OpenTodoApp/opentodo/internal/store/storetest"
)

// Stored limits (OpenSpec change persistent-limits).

func openDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := storetest.OpenDir(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func open(t *testing.T, db *sql.DB, now func() time.Time, wake func()) *ratelimit.Store {
	t.Helper()
	s, err := ratelimit.Open(context.Background(), db, now, wake)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestTimesSurviveAReopen(t *testing.T) {
	ctx := context.Background()
	db := openDB(t)
	now := time.UnixMilli(1_760_000_000_000)
	clock := func() time.Time { return now }
	wakes := 0
	st := open(t, db, clock, func() { wakes++ })
	w := ratelimit.NewTimes(time.Minute)
	w.Attach(st, "relay")
	for range 3 {
		w.Add("user-1", now)
	}
	w.Add("user-2", now)
	if wakes != 1 {
		t.Fatalf("wakes = %d, want one until the next flush", wakes)
	}
	if at, ok, _ := st.Next(ctx); !ok || at.After(now.Add(ratelimit.FlushEvery)) {
		t.Fatalf("next = %v %v while windows wait", at, ok)
	}
	if err := st.Flush(ctx); err != nil {
		t.Fatal(err)
	}
	var key string
	if err := db.QueryRow(`SELECT key FROM limit_windows WHERE limiter = 'relay' LIMIT 1`).Scan(&key); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(key, "user") || len(key) != 32 {
		t.Fatalf("stored key %q: want the salted hash", key)
	}

	// A second process on the same database finds the windows.
	again := ratelimit.NewTimes(time.Minute)
	again.Attach(open(t, db, clock, nil), "relay")
	if n := len(again.Recent("user-1", now.Add(30*time.Second))); n != 3 {
		t.Fatalf("restored calls = %d, want 3", n)
	}
	if n := len(again.Recent("user-1", now.Add(61*time.Second))); n != 0 {
		t.Fatalf("calls after the window = %d", n)
	}

	// Ended windows leave the table.
	now = now.Add(2 * time.Minute)
	if at, ok, _ := st.Next(ctx); !ok || at.After(now) {
		t.Fatalf("next = %v %v, want the ended window due", at, ok)
	}
	if err := st.Flush(ctx); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM limit_windows`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("rows after the windows ended = %d %v", n, err)
	}
	if _, ok, _ := st.Next(ctx); ok {
		t.Fatal("due with nothing stored")
	}
}

func TestSaltIsPerDatabase(t *testing.T) {
	a, b := open(t, openDB(t), nil, nil), open(t, openDB(t), nil, nil)
	if a.Key("203.0.113.7") == b.Key("203.0.113.7") {
		t.Fatal("two databases hash a key alike")
	}
	if first, again := a.Key("x"), a.Key("x"); first != again {
		t.Fatal("the hash is not stable")
	}
	var nilStore *ratelimit.Store
	if nilStore.Key("x") != "x" {
		t.Fatal("a nil store must keep keys as they are")
	}
}

// TestAgentBudgetSurvivesARestart: a token that used its day's items is still
// refused after the limiter is rebuilt over the same database.
func TestAgentBudgetSurvivesARestart(t *testing.T) {
	ctx := context.Background()
	db := openDB(t)
	now := time.Date(2026, 11, 7, 10, 0, 0, 0, time.UTC)
	clock := func() time.Time { return now }
	st := open(t, db, clock, nil)
	l := agenttools.NewLimiter(clock)
	l.Attach(st)
	if ok, _ := l.AllowCallFor("u1", "tok"); !ok {
		t.Fatal("first call refused")
	}
	if ok, _ := l.ReserveFor("u1", "tok", agenttools.PerDay); !ok {
		t.Fatal("day budget refused")
	}
	if err := st.Flush(ctx); err != nil {
		t.Fatal(err)
	}

	after := agenttools.NewLimiter(clock)
	after.Attach(open(t, db, clock, nil))
	if ok, wait := after.ReserveFor("u1", "tok", 1); ok || wait <= 0 {
		t.Fatalf("after a restart: reserve = %v %d, want refused until tomorrow", ok, wait)
	}
	// The account's budget came back too: another token of the person has
	// only what the account has left.
	if ok, _ := after.ReserveFor("u1", "tok-2", agenttools.AccountPerDay-agenttools.PerDay+1); ok {
		t.Fatal("the account's day count was not restored")
	}
	// Tomorrow the budget is whole again.
	now = now.Add(24 * time.Hour)
	if ok, _ := after.ReserveFor("u1", "tok", 1); !ok {
		t.Fatal("refused on the next day")
	}
}
