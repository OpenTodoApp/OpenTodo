package compaction

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/jobs"
	"github.com/OpenTodoApp/opentodo/internal/settings"
	"github.com/OpenTodoApp/opentodo/internal/store"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

const day = 24 * time.Hour

type fixture struct {
	t    *testing.T
	ctx  context.Context
	dir  string
	db   *sql.DB
	sync *opsync.Service
	sig  *jobs.Signal
	svc  *Service
	logs *syncBuffer
	free uint64
	now  time.Time
	n    int
}

type syncBuffer struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (b *syncBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.b.Write(p)
}

func (b *syncBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.b.String()
}

// newFixture opens a database (oldMode: created before incremental vacuum,
// as every database of an earlier version is) and the job over it.
func newFixture(t *testing.T, oldMode bool) *fixture {
	t.Helper()
	f := &fixture{t: t, ctx: context.Background(), dir: t.TempDir(), sig: &jobs.Signal{}, logs: &syncBuffer{},
		free: 1 << 40, now: time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)}
	var err error
	if oldMode {
		f.db, err = store.OpenFile(store.DBPath(f.dir))
		if err == nil {
			_, err = f.db.Exec(`CREATE TABLE legacy(x)`)
		}
		if err == nil {
			err = store.Migrate(f.ctx, f.db)
		}
	} else {
		f.db, err = store.Open(f.dir)
	}
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { f.db.Close() })
	f.sync = opsync.NewService(f.db)
	f.sync.SetClock(func() time.Time { return f.now })
	f.svc = New(Options{DB: f.db, Sync: f.sync, Settings: settings.New(f.db), DataDir: f.dir, Signal: f.sig,
		Now: func() time.Time { return f.now }, Log: slog.New(slog.NewTextHandler(f.logs, &slog.HandlerOptions{Level: slog.LevelDebug})),
		FreeSpace: func(string) (uint64, bool, error) { return f.free, true, nil }})
	return f
}

// notes writes n saves of task id's note, each a document of size bytes plus
// its description, and reports a change like the sync observer does.
func (f *fixture) notes(id string, n, size int) {
	f.t.Helper()
	var ops []opsync.Op
	for i := 0; i < n; i++ {
		f.n++
		ts := f.now.UnixMilli() + int64(f.n)
		body := base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{byte(f.n)}, size))
		docv, _ := json.Marshal("ydoc:v1:" + body)
		desc, _ := json.Marshal(fmt.Sprintf("revision %d", f.n))
		ops = append(ops,
			opsync.Op{ID: fmt.Sprintf("d%d", f.n), Entity: "task", EntityID: id, Field: "notes_doc", Value: docv, TS: ts, Device: "A"},
			opsync.Op{ID: fmt.Sprintf("s%d", f.n), Entity: "task", EntityID: id, Field: "description", Value: desc, TS: ts, Device: "A"})
		if len(ops) >= 200 {
			f.apply(ops)
			ops = nil
		}
	}
	if len(ops) > 0 {
		f.apply(ops)
	}
	f.sig.Changed()
}

func (f *fixture) apply(ops []opsync.Op) {
	f.t.Helper()
	if _, err := f.sync.Apply(f.ctx, "u1", ops); err != nil {
		f.t.Fatal(err)
	}
}

func (f *fixture) count() int {
	var n int
	_ = f.db.QueryRow(`SELECT COUNT(*) FROM ops`).Scan(&n)
	return n
}

func (f *fixture) status() Status {
	f.t.Helper()
	st, err := f.svc.Status(f.ctx)
	if err != nil {
		f.t.Fatal(err)
	}
	return st
}

func (f *fixture) next() (time.Time, bool) {
	f.t.Helper()
	at, ok, err := f.svc.Next(f.ctx)
	if err != nil {
		f.t.Fatal(err)
	}
	return at, ok
}

// TestScheduleAfterChangesOnly (3.1): idle, the job is never due; after a
// change it is due an hour after start, then a day after the last pass.
func TestScheduleAfterChangesOnly(t *testing.T) {
	f := newFixture(t, false)
	start := f.now
	if _, ok := f.next(); ok {
		t.Fatal("due without any change")
	}
	f.notes("t1", 2, 10)
	if at, ok := f.next(); !ok || !at.Equal(start.Add(FirstDelay)) {
		t.Fatalf("first due %v %v, want an hour after start", at, ok)
	}
	f.now = f.now.Add(2 * time.Hour)
	f.svc.Run(f.ctx)
	if _, ok := f.next(); ok {
		t.Fatal("due again without a change")
	}
	f.notes("t1", 1, 10)
	if at, ok := f.next(); !ok || !at.Equal(f.now.Add(Every)) {
		t.Fatalf("due %v, want a day after the last pass", at)
	}
	// A new process (or a host reopening the tenant) keeps the day's spacing.
	again := New(f.svc.o)
	f.sig.Changed()
	if at, ok, _ := again.Next(f.ctx); !ok || !at.Equal(f.now.Add(Every)) {
		t.Fatalf("after reopening: due %v, want a day after the last pass", at)
	}
}

// TestRunRemovesReclaimsAndReports (3.2): a run past the window removes the old
// versions, the incremental database shrinks, and the report is stored.
func TestRunRemovesReclaimsAndReports(t *testing.T) {
	f := newFixture(t, false)
	f.notes("t1", 60, 6000)
	before := f.status()
	f.now = f.now.Add(31 * day)
	f.svc.Run(f.ctx)
	st := f.status()
	if f.count() != 2 {
		t.Fatalf("ops left %d, want the two winners", f.count())
	}
	if st.Last == nil || st.Last.OpsRemoved != 118 || st.Last.ValueBytesRemoved < 59*8000 || st.Last.More {
		t.Fatalf("report %+v", st.Last)
	}
	if st.Last.FileBytesReclaimed <= 0 || st.DatabaseBytes >= before.DatabaseBytes || st.Conversion != ConversionDone {
		t.Fatalf("not reclaimed: before %d, after %+v", before.DatabaseBytes, st)
	}
	if st.Last.At != f.now.UnixMilli() {
		t.Fatalf("report time %d", st.Last.At)
	}
	if !strings.Contains(f.logs.String(), "level=INFO msg=\"notes compaction\" ops=118") {
		t.Fatalf("log: %s", f.logs.String())
	}
}

// TestPassSpansRuns (3.1): a pass larger than one run's budget stays due and
// continues from where it stopped until every eligible op is gone.
func TestPassSpansRuns(t *testing.T) {
	f := newFixture(t, false)
	f.sync.SetCompactChunk(5)
	f.svc.o.Budget = time.Nanosecond
	f.notes("t1", 20, 10)
	f.now = f.now.Add(31 * day)
	runs := 0
	for ; runs < 20; runs++ {
		if _, ok := f.next(); !ok {
			break
		}
		f.svc.Run(f.ctx)
	}
	if f.count() != 2 {
		t.Fatalf("ops left %d after %d runs", f.count(), runs)
	}
	if runs < 4 {
		t.Fatalf("%d runs, want the pass split", runs)
	}
	st := f.status()
	if st.Last == nil || st.Last.OpsRemoved != 38 {
		t.Fatalf("pass report %+v", st.Last)
	}
	// The continuation survives a restart.
	f.notes("t2", 20, 10)
	f.now = f.now.Add(31 * day)
	f.svc.Run(f.ctx)
	again := New(f.svc.o)
	if at, ok, _ := again.Next(f.ctx); !ok || at.After(f.now) {
		t.Fatalf("restarted mid-pass: due %v %v, want now", at, ok)
	}
}

// TestConversionWaitsForQuietAndDisk (3.1, 3.2): an older database converts
// only when no op arrived for ten minutes (or after seven days anyway) and the
// disk has the space; without it the job warns, still removes old versions,
// and the card shows how much is needed.
func TestConversionWaitsForQuietAndDisk(t *testing.T) {
	f := newFixture(t, true)
	if st := f.status(); st.Conversion != ConversionPending {
		t.Fatalf("old database: %+v", st)
	}
	f.notes("t1", 30, 4000)
	f.now = f.now.Add(31 * day)
	f.notes("t2", 1, 10) // just now: not quiet
	f.svc.Run(f.ctx)
	if st := f.status(); st.Conversion != ConversionWaiting || f.count() != 4 {
		t.Fatalf("busy: %+v, %d ops", st, f.count())
	}
	// Quiet, but the disk is short: nothing is rewritten.
	f.now = f.now.Add(11 * time.Minute)
	f.free = 1000
	f.svc.Run(f.ctx)
	st := f.status()
	mode, _ := store.AutoVacuumMode(f.ctx, f.db)
	if st.Conversion != ConversionNoSpace || st.NeededBytes < st.DatabaseBytes || mode != store.AutoVacuumNone {
		t.Fatalf("short disk: %+v, mode %d", st, mode)
	}
	if !strings.Contains(f.logs.String(), "level=WARN msg=\"notes compaction: not enough free disk space") {
		t.Fatalf("no warning: %s", f.logs.String())
	}
	// The space comes back: converted once, the file shrinks.
	f.free = 1 << 40
	f.sig.Changed()
	f.svc.Run(f.ctx)
	st = f.status()
	if mode, _ := store.AutoVacuumMode(f.ctx, f.db); mode != store.AutoVacuumIncremental || st.Conversion != ConversionDone {
		t.Fatalf("not converted: %+v, mode %d", st, mode)
	}
	if st.Last == nil || !st.Last.Converted || st.Last.FileBytesReclaimed <= 0 || st.FreeBytes != 0 {
		t.Fatalf("conversion report %+v", st)
	}
	if !strings.Contains(f.logs.String(), "database converted to incremental vacuum") {
		t.Fatalf("log: %s", f.logs.String())
	}
}

// TestConversionAfterSevenDaysWithoutQuiet: a server that never falls quiet
// converts at the first run seven days after the first attempt.
func TestConversionAfterSevenDaysWithoutQuiet(t *testing.T) {
	f := newFixture(t, true)
	f.notes("t1", 2, 10)
	f.svc.Run(f.ctx)
	if st := f.status(); st.Conversion != ConversionWaiting {
		t.Fatalf("first attempt: %s", st.Conversion)
	}
	f.now = f.now.Add(7 * day)
	f.notes("t1", 1, 10)
	f.svc.Run(f.ctx)
	if st := f.status(); st.Conversion != ConversionDone {
		t.Fatalf("after seven days: %s", st.Conversion)
	}
}

// TestUnknownFreeSpaceSkipsConversion: where the platform cannot tell, the
// conversion is skipped with a warning.
func TestUnknownFreeSpaceSkipsConversion(t *testing.T) {
	f := newFixture(t, true)
	f.svc.o.FreeSpace = func(string) (uint64, bool, error) { return 0, false, nil }
	f.notes("t1", 2, 10)
	f.now = f.now.Add(time.Hour)
	f.svc.Run(f.ctx)
	if mode, _ := store.AutoVacuumMode(f.ctx, f.db); mode != store.AutoVacuumNone || f.status().Conversion != ConversionPending {
		t.Fatalf("converted without knowing the free space")
	}
	if !strings.Contains(f.logs.String(), "free disk space unknown") {
		t.Fatalf("no warning: %s", f.logs.String())
	}
}
