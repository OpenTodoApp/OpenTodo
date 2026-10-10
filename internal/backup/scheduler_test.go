package backup

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestNextRunComputation(t *testing.T) {
	berlin, err := time.LoadLocation("Europe/Berlin")
	if err != nil {
		t.Skip("no tzdata:", err)
	}
	at := func(s string) time.Time {
		tm, err := time.ParseInLocation("2006-01-02 15:04", s, berlin)
		if err != nil {
			t.Fatal(err)
		}
		return tm
	}
	cases := []struct {
		sc    Schedule
		after string
		want  string
	}{
		{Schedule{FreqHourly, "00:15", 0}, "2026-10-10 12:00", "2026-10-10 12:15"},
		{Schedule{FreqHourly, "00:15", 0}, "2026-10-10 12:15", "2026-10-10 13:15"},
		{Schedule{FreqHourly, "09:45", 0}, "2026-10-10 23:50", "2026-10-11 00:45"},
		{Schedule{FreqDaily, "03:00", 0}, "2026-10-10 02:59", "2026-10-10 03:00"},
		{Schedule{FreqDaily, "03:00", 0}, "2026-10-10 03:00", "2026-10-11 03:00"},
		{Schedule{FreqDaily, "03:00", 0}, "2026-12-31 12:00", "2027-01-01 03:00"},
		// 2026-10-10 is a Saturday.
		{Schedule{FreqWeekly, "04:30", 1}, "2026-10-10 12:00", "2026-10-12 04:30"},
		{Schedule{FreqWeekly, "04:30", 6}, "2026-10-10 04:00", "2026-10-10 04:30"},
		{Schedule{FreqWeekly, "04:30", 6}, "2026-10-10 05:00", "2026-10-17 04:30"},
		// Daylight saving time ends in Berlin on 2026-10-25: still 03:00 local.
		{Schedule{FreqDaily, "03:00", 0}, "2026-10-24 12:00", "2026-10-25 03:00"},
		{Schedule{FreqDaily, "03:00", 0}, "2026-10-25 03:30", "2026-10-26 03:00"},
	}
	for _, c := range cases {
		got := nextRun(c.sc, at(c.after), berlin)
		if !got.Equal(at(c.want)) {
			t.Errorf("%+v after %s: got %s, want %s", c.sc, c.after, got.In(berlin).Format("2006-01-02 15:04 MST"), c.want)
		}
	}
	if !nextRun(Schedule{Frequency: FreqOff}, time.Now(), berlin).IsZero() {
		t.Error("off schedule produced a time")
	}
}

func enableDaily(t *testing.T, e *testEnv, at string) {
	t.Helper()
	set := DefaultSettings()
	set.Schedule = Schedule{Frequency: FreqDaily, Time: at}
	if _, err := e.svc.SaveSettings(context.Background(), set, SecretUpdate{}); err != nil {
		t.Fatal(err)
	}
}

func TestMissedRunExecutesAtStartup(t *testing.T) {
	e := newTestEnv(t)
	ctx := context.Background()
	// Daily at 03:00, configured on Oct 9 at 12:00; it ran at 03:00 on Oct 10 ...
	e.clock.Set(time.Date(2026, 10, 9, 12, 0, 0, 0, time.UTC))
	enableDaily(t, e, "03:00")
	e.clock.Set(time.Date(2026, 10, 10, 3, 0, 0, 0, time.UTC))
	if r, err := e.svc.RunNow(ctx, KindScheduled); err != nil || r.Status != StatusSucceeded {
		t.Fatalf("first run: %+v %v", r, err)
	}
	// ... then the server was down over Oct 11 03:00 and comes back at 10:00.
	e.clock.Set(time.Date(2026, 10, 11, 10, 0, 0, 0, time.UTC))
	if _, isDue, _ := e.svc.due(ctx); !isDue {
		t.Fatal("missed run not detected")
	}

	e.svc.startupDelay = 0
	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	e.svc.Start(runCtx)
	deadline := time.Now().Add(10 * time.Second)
	var hist []Run
	for time.Now().Before(deadline) {
		hist, _ = e.svc.History(ctx, 10)
		if len(hist) == 2 && hist[0].Status != StatusRunning {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if len(hist) != 2 || hist[0].Kind != KindScheduled || hist[0].Status != StatusSucceeded {
		t.Fatalf("history after startup = %+v", hist)
	}
	// Exactly once: the schedule continues from the configured time.
	time.Sleep(100 * time.Millisecond)
	if hist, _ = e.svc.History(ctx, 10); len(hist) != 2 {
		t.Fatalf("missed run executed more than once: %d runs", len(hist))
	}
	next, _ := e.svc.NextRun(ctx)
	if want := time.Date(2026, 10, 12, 3, 0, 0, 0, time.UTC); next == nil || !next.Equal(want) {
		t.Fatalf("next run = %v, want %v", next, want)
	}
}

func TestNotDueBeforeFirstSlot(t *testing.T) {
	e := newTestEnv(t)
	enableDaily(t, e, "03:00") // configured at 12:00: first run tomorrow, not at startup
	if _, isDue, _ := e.svc.due(context.Background()); isDue {
		t.Fatal("a fresh schedule must not be due immediately")
	}
	// Manual runs do not shift the schedule.
	e.svc.RunNow(context.Background(), KindManual)
	next, _ := e.svc.NextRun(context.Background())
	if want := time.Date(2026, 10, 11, 3, 0, 0, 0, time.UTC); next == nil || !next.Equal(want) {
		t.Fatalf("next = %v want %v", next, want)
	}
	// Disabled schedule: no next run.
	set := DefaultSettings()
	e.svc.SaveSettings(context.Background(), set, SecretUpdate{})
	if next, _ := e.svc.NextRun(context.Background()); next != nil {
		t.Fatalf("disabled schedule has next run %v", next)
	}
}

func objs(names ...string) []Object {
	var out []Object
	for _, n := range names {
		out = append(out, Object{Name: n})
	}
	return out
}

func TestRetentionKeepsNewest(t *testing.T) {
	now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	a := func(day int) string {
		return ArchiveName(time.Date(2026, 10, day, 3, 0, 0, 0, time.UTC), "abcdef01", true, false)
	}
	// Keep 7: seven exist and an eighth succeeds -> the oldest goes.
	list := objs(a(1), a(2), a(3), a(4), a(5), a(6), a(7), a(8), "notes.txt", "opentodo-probe-1.txt")
	got := retentionVictims(list, Retention{KeepLast: 7}, a(8), now)
	if strings.Join(got, ",") != a(1) {
		t.Fatalf("keep 7 victims = %v", got)
	}
	// Keep 1 deletes everything else but never the new one.
	got = retentionVictims(list, Retention{KeepLast: 1}, a(8), now)
	if len(got) != 7 || strings.Contains(strings.Join(got, ","), a(8)) {
		t.Fatalf("keep 1 victims = %v", got)
	}
	// Age limit: older than 5 days (Oct 5 03:00 is 5d9h old) goes even within keep-last; the newest stays
	// even when it is itself older than the limit.
	got = retentionVictims(list, Retention{KeepLast: 30, MaxAgeDays: 5}, a(8), now)
	if strings.Join(got, ",") != strings.Join([]string{a(5), a(4), a(3), a(2), a(1)}, ",") {
		t.Fatalf("age victims = %v", got)
	}
	old := objs(a(1), a(2))
	got = retentionVictims(old, Retention{KeepLast: 5, MaxAgeDays: 1}, a(2), now)
	if strings.Join(got, ",") != a(1) {
		t.Fatalf("newest must survive the age limit: %v", got)
	}
	// A listing that does not show the new archive yet still counts it.
	got = retentionVictims(objs(a(1), a(2), a(3)), Retention{KeepLast: 2}, a(8), now)
	if strings.Join(got, ",") != strings.Join([]string{a(2), a(1)}, ",") {
		t.Fatalf("lagging listing victims = %v", got)
	}
}

// End to end at a local destination: five daily runs with keep-last 3 leave
// three archives, the newest included.
func TestRetentionAppliedAfterRun(t *testing.T) {
	e := newTestEnv(t)
	ctx := context.Background()
	set := DefaultSettings()
	set.Retention.KeepLast = 3
	e.svc.SaveSettings(ctx, set, SecretUpdate{})
	var last Run
	for i := 0; i < 5; i++ {
		e.clock.Advance(24 * time.Hour)
		r, err := e.svc.RunNow(ctx, KindManual)
		if err != nil || r.Status != StatusSucceeded || r.Error != "" {
			t.Fatalf("run %d: %+v %v", i, r, err)
		}
		last = r
	}
	entries, _ := os.ReadDir(filepath.Join(e.dir, "backups"))
	if len(entries) != 3 || entries[2].Name() != last.ArchiveName {
		var n []string
		for _, en := range entries {
			n = append(n, en.Name())
		}
		t.Fatalf("archives = %v (last %s)", n, last.ArchiveName)
	}
}

func TestConcurrentRunConflicts(t *testing.T) {
	e := newTestEnv(t)
	ctx := context.Background()
	e.svc.runMu.Lock() // a run in progress
	if err := e.svc.StartRun(ctx, KindManual); !errors.Is(err, ErrRunning) {
		t.Fatalf("StartRun during a run: %v", err)
	}
	if _, err := e.svc.RunNow(ctx, KindScheduled); !errors.Is(err, ErrRunning) {
		t.Fatalf("RunNow during a run: %v", err)
	}
	e.svc.runMu.Unlock()
	if hist, _ := e.svc.History(ctx, 10); len(hist) != 0 {
		t.Fatalf("a second run started: %+v", hist)
	}
	if err := e.svc.StartRun(ctx, KindManual); err != nil {
		t.Fatal(err)
	}
	// While the background run holds the lock, another request conflicts or the
	// first one has already finished; either way at most one run is recorded at a time.
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		h, _ := e.svc.History(ctx, 10)
		if len(h) == 1 && h[0].Status == StatusSucceeded && e.svc.Running() == nil {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("background run did not finish")
}

func TestRunHistoryPrunedAfter90Days(t *testing.T) {
	e := newTestEnv(t)
	ctx := context.Background()
	if _, err := e.svc.RunNow(ctx, KindManual); err != nil {
		t.Fatal(err)
	}
	e.clock.Advance(91 * 24 * time.Hour)
	if _, err := e.svc.RunNow(ctx, KindManual); err != nil {
		t.Fatal(err)
	}
	if h, _ := e.svc.History(ctx, 10); len(h) != 1 {
		t.Fatalf("history = %d rows, want 1", len(h))
	}
}

func TestInterruptedRunsMarkedFailed(t *testing.T) {
	e := newTestEnv(t)
	ctx := context.Background()
	e.db.Exec(`INSERT INTO backup_runs(id, kind, started_at, status) VALUES('x', 'manual', 1, 'running')`)
	runCtx, cancel := context.WithCancel(ctx)
	cancel()
	e.svc.Start(runCtx)
	h, _ := e.svc.History(ctx, 10)
	if len(h) != 1 || h[0].Status != StatusFailed || !strings.Contains(h[0].Error, "interrupted") {
		t.Fatalf("history = %+v", h)
	}
}
