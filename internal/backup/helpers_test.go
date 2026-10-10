package backup

import (
	"database/sql"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/store"
)

// fakeClock is the injectable clock used by scheduler tests.
type fakeClock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *fakeClock) Set(t time.Time) {
	c.mu.Lock()
	c.t = t
	c.mu.Unlock()
}

func (c *fakeClock) Advance(d time.Duration) {
	c.mu.Lock()
	c.t = c.t.Add(d)
	c.mu.Unlock()
}

type testEnv struct {
	dir   string
	db    *sql.DB
	svc   *Service
	clock *fakeClock
}

func newTestEnv(t *testing.T) *testEnv {
	t.Helper()
	dir := t.TempDir()
	db, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	clock := &fakeClock{t: time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)}
	svc := New(db, dir, Options{
		Version: "test", Log: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Now: clock.Now, Loc: time.UTC,
	})
	return &testEnv{dir: dir, db: db, svc: svc, clock: clock}
}
