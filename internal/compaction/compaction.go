// Package compaction is the background job that removes superseded note
// history from the op log and returns the freed space to the file system
// (OpenSpec `op-log-compaction`): the deletion itself is
// sync.Service.CompactNotes; this package schedules it, reclaims pages with
// incremental vacuum, converts an older database to incremental mode once at
// a quiet moment, and keeps the report the owner's Database storage card
// shows.
package compaction

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	gosync "sync"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/jobs"
	"github.com/OpenTodoApp/opentodo/internal/settings"
	"github.com/OpenTodoApp/opentodo/internal/store"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Timing and sizes (design D4, D5, D6).
const (
	// Every spaces complete passes, and only after a change (jobs.Upkeep).
	Every = 24 * time.Hour
	// FirstDelay is when the first pass after start-up is due, so a restart
	// loop does not compact repeatedly.
	FirstDelay = time.Hour
	// Retry is the pause before a pass that ran out of budget continues.
	Retry = time.Minute
	// Budget bounds the work of one run.
	Budget = 20 * time.Second
	// Slice is how long a run deletes before it returns the pages it freed to
	// the file system, so the free list stays short and each incremental
	// vacuum step cheap (notes-compaction-at-scale D2: with gigabytes on the
	// free list a step of 500 pages held writes back for a second).
	Slice = 2 * time.Second
	// VacuumStep is how many free pages the first incremental vacuum step of
	// a run returns; later steps grow or shrink so that one holds the writer
	// for about VacuumHold.
	VacuumStep = 64
	VacuumHold = 20 * time.Millisecond
	vacuumMin  = 16
	vacuumMax  = 128
	// QuietFor is how long no op may have arrived before the one-time
	// conversion runs; after ConvertAnyway without such a moment it runs at the
	// next run anyway.
	QuietFor      = 10 * time.Minute
	ConvertAnyway = 7 * 24 * time.Hour
	// warnEvery spaces the warnings about missing disk space.
	warnEvery = 24 * time.Hour
)

// SettingKey is the settings row holding the report and the conversion state.
const SettingKey = "compaction.last"

// Conversion states of an existing database (design D6, D7).
const (
	ConversionPending   = "pending"           // not attempted yet, or free space unknown
	ConversionWaiting   = "waiting_for_quiet" // ops kept arriving
	ConversionNoSpace   = "no_space"          // the file system lacks the space for the rewrite
	ConversionDone      = "done"              // incremental mode (new databases start here)
	conversionUnchecked = ""
)

// Report is one run, or the sum of the runs of one complete pass.
type Report struct {
	At                 int64 `json:"at"` // Unix milliseconds
	OpsRemoved         int   `json:"ops_removed"`
	ValueBytesRemoved  int64 `json:"value_bytes_removed"`
	FileBytesReclaimed int64 `json:"file_bytes_reclaimed"`
	More               bool  `json:"more"`
	Converted          bool  `json:"converted"`
}

func (r *Report) add(o Report) {
	r.OpsRemoved += o.OpsRemoved
	r.ValueBytesRemoved += o.ValueBytesRemoved
	r.FileBytesReclaimed += o.FileBytesReclaimed
	r.Converted = r.Converted || o.Converted
}

// record is the stored state (settings key SettingKey).
type record struct {
	// Last is the last complete pass.
	Last *Report `json:"last,omitempty"`
	// Pass sums the runs of the pass in progress; InPass says one is in
	// progress and Mark is the field it resumes after ("" for the start).
	Pass   Report `json:"pass"`
	InPass bool   `json:"in_pass,omitempty"`
	Mark   string `json:"mark,omitempty"`
	// Cursor is the sequence number an earlier version resumed from; a pass
	// it left unfinished starts again from the first field.
	Cursor int64 `json:"cursor,omitempty"`
	// VacuumPending: free pages left after the last run's budget ran out.
	VacuumPending bool   `json:"vacuum_pending,omitempty"`
	Conversion    string `json:"conversion"`
	FirstAttempt  int64  `json:"first_attempt,omitempty"`
	NeededBytes   int64  `json:"needed_bytes,omitempty"`
	WarnedAt      int64  `json:"warned_at,omitempty"`
}

// Options configure New.
type Options struct {
	DB *sql.DB // the writer
	// Reader is the query-only pool (store.OpenReader). With it a run copies
	// the write-ahead log back into the database from there, so a write never
	// waits for that copy (notes-compaction-at-scale D2); nil leaves it to
	// SQLite's automatic checkpoints on the writer.
	Reader   *sql.DB
	Sync     *opsync.Service
	Settings *settings.Store
	// DataDir holds the database (for the write-ahead log's size and the free
	// space check); "" skips both.
	DataDir string
	Signal  *jobs.Signal
	Now     func() time.Time
	Log     *slog.Logger
	// FreeSpace reports the free bytes of the data directory's file system;
	// nil is store.FreeSpace (tests stub it).
	FreeSpace func(dir string) (uint64, bool, error)
	// Budget overrides the Budget of one run (tests).
	Budget time.Duration
}

// Service is the compaction job of one tenant.
type Service struct {
	o      Options
	upkeep *jobs.Upkeep

	mu     gosync.Mutex
	loaded bool
	// pending: a pass ran out of budget and continues (also after a restart
	// or, on a host, after the tenant was closed and opened again).
	pending bool
	// lastDone is when the last complete pass ended (Unix ms; 0 for never).
	lastDone int64
	// step is the size of the next incremental vacuum step (pages); only Run
	// uses it.
	step int
}

// New builds the job; its first pass is due FirstDelay after now, once
// something changed.
func New(o Options) *Service {
	if o.Now == nil {
		o.Now = time.Now
	}
	if o.Log == nil {
		o.Log = slog.Default()
	}
	if o.FreeSpace == nil {
		o.FreeSpace = store.FreeSpace
	}
	if o.Budget <= 0 {
		o.Budget = Budget
	}
	return &Service{o: o, upkeep: jobs.NewUpkeep(Every, o.Signal, o.Now().Add(FirstDelay-Every))}
}

// Job is the job's description for the tenant's list (internal/tenant/jobs.go).
func (s *Service) Job() jobs.Job {
	return jobs.Job{Name: jobs.Compaction, Next: s.Next, Run: s.Run, Retry: Retry}
}

// Next is due a day after the last complete pass (an hour after start-up for
// the first), only once something changed since; a pass that ran out of
// budget stays due and continues after Retry.
func (s *Service) Next(ctx context.Context) (time.Time, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.loaded {
		rec, err := s.load(ctx)
		if err != nil {
			return time.Time{}, false, err
		}
		s.remember(rec)
	}
	if s.pending {
		return s.o.Now(), true, nil
	}
	at, ok := s.upkeep.Next()
	if !ok {
		return time.Time{}, false, nil
	}
	if done := time.UnixMilli(s.lastDone).Add(Every); s.lastDone > 0 && done.After(at) {
		at = done
	}
	return at, true, nil
}

// remember keeps what Next needs from the stored record; callers hold mu.
func (s *Service) remember(rec record) {
	s.loaded, s.pending = true, rec.InPass || rec.Cursor != 0
	if rec.Last != nil {
		s.lastDone = rec.Last.At
	}
}

func (s *Service) load(ctx context.Context) (record, error) {
	var rec record
	_, err := s.o.Settings.Get(ctx, SettingKey, &rec)
	return rec, err
}

// Run is one run: delete within the budget, reclaim or convert, report.
func (s *Service) Run(ctx context.Context) {
	now := s.o.Now()
	log := s.o.Log
	rec, err := s.load(ctx)
	if err != nil {
		log.Error("notes compaction: read state", "err", err)
		return
	}
	deadline := time.Now().Add(s.o.Budget)
	run := Report{At: now.UnixMilli()}
	s.step = VacuumStep
	defer s.tune(ctx)()
	// Delete for a slice, then reclaim what it freed, until the pass ends or
	// the budget does (notes-compaction-at-scale D2).
	for {
		res, err := s.o.Sync.CompactNotes(ctx, now, rec.Mark, min(time.Until(deadline), Slice))
		if err != nil {
			if ctx.Err() == nil {
				log.Error("notes compaction failed", "err", err)
			}
			return
		}
		run.OpsRemoved += res.OpsRemoved
		run.ValueBytesRemoved += res.ValueBytesRemoved
		run.More = res.More
		rec.Mark, rec.InPass, rec.Cursor = res.Next, res.More, 0
		bytes, converted := s.reclaim(ctx, &rec, now, res.OpsRemoved > 0, deadline)
		run.FileBytesReclaimed += bytes
		run.Converted = run.Converted || converted
		if !res.More || converted || !time.Now().Before(deadline) || ctx.Err() != nil {
			break
		}
	}
	rec.Pass.add(run)
	if !run.More {
		last := rec.Pass
		last.At = now.UnixMilli()
		rec.Last, rec.Pass = &last, Report{}
		s.upkeep.Ran(now)
	}
	if err := s.o.Settings.Set(ctx, SettingKey, rec); err != nil {
		log.Error("notes compaction: save report", "err", err)
	}
	s.mu.Lock()
	s.remember(rec)
	s.mu.Unlock()
	level := slog.LevelDebug
	if run.OpsRemoved > 0 || run.FileBytesReclaimed > 0 || run.Converted {
		level = slog.LevelInfo
	}
	log.Log(ctx, level, "notes compaction", "ops", run.OpsRemoved, "value_bytes", run.ValueBytesRemoved,
		"file_bytes", run.FileBytesReclaimed, "more", run.More, "converted", run.Converted)
}

// reclaim returns freed pages to the file system: in steps on an incremental
// database, or by the one-time conversion of an older one. It reports the
// bytes the file shrank by.
func (s *Service) reclaim(ctx context.Context, rec *record, now time.Time, removed bool, deadline time.Time) (int64, bool) {
	st, err := store.Stats(ctx, s.o.DB, "")
	if err != nil {
		s.o.Log.Warn("notes compaction: database stats", "err", err)
		return 0, false
	}
	if st.AutoVacuum != store.AutoVacuumIncremental {
		return s.convert(ctx, rec, now, st)
	}
	rec.Conversion = ConversionDone
	if !removed && !rec.VacuumPending {
		return 0, false
	}
	free := st.FreePages
	for free > 0 {
		started := time.Now()
		if free, err = store.IncrementalVacuum(ctx, s.o.DB, s.step); err != nil {
			s.o.Log.Warn("notes compaction: incremental vacuum", "err", err)
			break
		}
		s.step = nextStep(s.step, time.Since(started))
		if !time.Now().Before(deadline) || ctx.Err() != nil {
			break
		}
	}
	rec.VacuumPending = free > 0
	if s.o.Reader == nil {
		if err := store.Checkpoint(ctx, s.o.DB); err != nil {
			s.o.Log.Warn("notes compaction: checkpoint", "err", err)
		}
	}
	after, err := store.Stats(ctx, s.o.DB, "")
	if err != nil {
		return 0, false
	}
	return max(0, st.Bytes()-after.Bytes()), false
}

// nextStep sizes the next incremental vacuum step from how long the last one
// held the writer, so a step takes about VacuumHold however costly a page is:
// in proportion, at most halved or grown by half at a time.
func nextStep(step int, took time.Duration) int {
	next := step
	if took > 0 {
		next = int(int64(step) * int64(VacuumHold) / int64(took))
	}
	next = min(max(next, step/2), step+step/2)
	return min(max(next, vacuumMin), vacuumMax)
}

// Writer settings during a run (notes-compaction-at-scale D2).
const (
	// runCacheKiB is the writer's page cache during a run: deleting and
	// relocating pages touches index pages all over the file.
	runCacheKiB = 32 * 1024
	// checkpointEvery spaces the checkpoints during a run.
	checkpointEvery = time.Second
)

// tune sets the writer up for a run and returns what puts it back: a larger
// page cache and, when the run has the reader pool, no automatic checkpoint in
// the writer's commits (a push would otherwise wait while its commit copies the
// run's pages back into the database). A goroutine checkpoints from the reader
// pool instead, alongside the run and the writes (WAL mode allows both).
func (s *Service) tune(ctx context.Context) func() {
	var cache, auto int64
	if err := s.o.DB.QueryRowContext(ctx, `PRAGMA cache_size`).Scan(&cache); err != nil {
		return func() {}
	}
	if err := s.o.DB.QueryRowContext(ctx, `PRAGMA wal_autocheckpoint`).Scan(&auto); err != nil {
		return func() {}
	}
	_, _ = s.o.DB.ExecContext(ctx, fmt.Sprintf(`PRAGMA cache_size = -%d`, runCacheKiB))
	stop := make(chan struct{})
	var wg gosync.WaitGroup
	if s.o.Reader != nil {
		_, _ = s.o.DB.ExecContext(ctx, `PRAGMA wal_autocheckpoint = 0`)
		wg.Add(1)
		go func() {
			defer wg.Done()
			tick := time.NewTicker(checkpointEvery)
			defer tick.Stop()
			for {
				select {
				case <-stop:
					return
				case <-ctx.Done():
					return
				case <-tick.C:
					s.checkpoint(ctx)
				}
			}
		}()
	}
	return func() {
		close(stop)
		wg.Wait()
		ctx := context.WithoutCancel(ctx)
		// The run's last pages first, so the next write's commit does not copy them.
		if s.o.Reader != nil {
			s.checkpoint(ctx)
		}
		_, _ = s.o.DB.ExecContext(ctx, fmt.Sprintf(`PRAGMA cache_size = %d`, cache))
		_, _ = s.o.DB.ExecContext(ctx, fmt.Sprintf(`PRAGMA wal_autocheckpoint = %d`, auto))
	}
}

// checkpoint copies the write-ahead log back into the database from the
// reader pool.
func (s *Service) checkpoint(ctx context.Context) {
	if err := store.Checkpoint(ctx, s.o.Reader); err != nil && ctx.Err() == nil {
		s.o.Log.Warn("notes compaction: checkpoint", "err", err)
	}
}

// convert runs the one-time VACUUM of an older database when it has been
// quiet (or ConvertAnyway passed since the first attempt) and the file system
// has room for the rewrite (design D6).
func (s *Service) convert(ctx context.Context, rec *record, now time.Time, st store.FileStats) (int64, bool) {
	log := s.o.Log
	if rec.FirstAttempt == 0 {
		rec.FirstAttempt = now.UnixMilli()
	}
	last, err := s.o.Sync.LastReceived(ctx)
	if err != nil {
		log.Warn("notes compaction: last write", "err", err)
		return 0, false
	}
	quiet := now.Sub(time.UnixMilli(last)) >= QuietFor
	if !quiet && now.Sub(time.UnixMilli(rec.FirstAttempt)) < ConvertAnyway {
		rec.Conversion = ConversionWaiting
		return 0, false
	}
	need := st.Bytes() + st.Bytes()/10
	free, known, err := s.freeSpace()
	warn := now.Sub(time.UnixMilli(rec.WarnedAt)) >= warnEvery
	switch {
	case err != nil || !known:
		rec.Conversion = ConversionPending
		if warn {
			rec.WarnedAt = now.UnixMilli()
			log.Warn("notes compaction: free disk space unknown, skipping the one-time database conversion", "err", err)
		}
		return 0, false
	case free < uint64(need):
		rec.Conversion, rec.NeededBytes = ConversionNoSpace, need
		if warn {
			rec.WarnedAt = now.UnixMilli()
			log.Warn("notes compaction: not enough free disk space for the one-time database conversion; old note versions are still removed",
				"needed_bytes", need, "free_bytes", free)
		}
		return 0, false
	}
	started := time.Now()
	if err := store.ConvertIncremental(ctx, s.o.DB); err != nil {
		log.Error("notes compaction: database conversion failed", "err", err)
		return 0, false
	}
	if _, err := s.o.DB.ExecContext(ctx, `PRAGMA wal_checkpoint(TRUNCATE)`); err != nil {
		log.Warn("notes compaction: checkpoint", "err", err)
	}
	after, _ := store.Stats(ctx, s.o.DB, "")
	rec.Conversion, rec.NeededBytes, rec.VacuumPending = ConversionDone, 0, false
	log.Info("notes compaction: database converted to incremental vacuum", "duration", time.Since(started).Round(time.Millisecond),
		"bytes_before", st.Bytes(), "bytes_after", after.Bytes())
	return max(0, st.Bytes()-after.Bytes()), true
}

func (s *Service) freeSpace() (uint64, bool, error) {
	if s.o.DataDir == "" {
		return 0, false, nil
	}
	return s.o.FreeSpace(s.o.DataDir)
}

// Status is what the owner's Database storage card shows
// (GET /api/v1/settings/storage).
type Status struct {
	DatabaseBytes int64   `json:"database_bytes"`
	FreeBytes     int64   `json:"free_bytes"`
	WALBytes      int64   `json:"wal_bytes"`
	Last          *Report `json:"last_compaction"`
	Conversion    string  `json:"conversion"`
	// NeededBytes is the free disk space the conversion waits for (no_space).
	NeededBytes int64 `json:"conversion_needed_bytes,omitempty"`
}

// Status reads the file's sizes and the stored report.
func (s *Service) Status(ctx context.Context) (Status, error) {
	st, err := store.Stats(ctx, s.o.DB, s.o.DataDir)
	if err != nil {
		return Status{}, err
	}
	rec, err := s.load(ctx)
	if err != nil {
		return Status{}, err
	}
	out := Status{DatabaseBytes: st.Bytes(), FreeBytes: st.FreeBytes(), WALBytes: st.WALBytes, Last: rec.Last, Conversion: rec.Conversion}
	switch {
	case st.AutoVacuum == store.AutoVacuumIncremental:
		out.Conversion = ConversionDone
	case out.Conversion == conversionUnchecked || out.Conversion == ConversionDone:
		out.Conversion = ConversionPending
	case out.Conversion == ConversionNoSpace:
		out.NeededBytes = rec.NeededBytes
	}
	return out, nil
}
