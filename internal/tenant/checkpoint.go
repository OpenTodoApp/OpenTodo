package tenant

import (
	"context"
	"database/sql"
	"sync"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/jobs"
	"github.com/OpenTodoApp/opentodo/internal/store"
)

// checkpointEvery spaces the checkpoint job's runs while the data changes.
const checkpointEvery = time.Second

// checkpointer schedules the copy of the write-ahead log back into the
// database (store.CheckpointWAL) off the writer's commits: due checkpointEvery
// after its last run once the tenant's data changed since then (the Signal
// counts every commit of the op log, and the writes probe counts another
// process's), or again after a run that could not copy the whole log (a
// reader was still on it). An idle tenant has none due, so a host never opens
// one for it; closing the database checkpoints what is left.
type checkpointer struct {
	sig      *jobs.Signal
	db       *sql.DB // the reader pool, so a checkpoint never waits for the writer connection
	dataDir  string
	truncate int64

	mu     sync.Mutex
	last   time.Time
	seen   uint64
	behind bool
}

func newCheckpointer(sig *jobs.Signal, db *sql.DB, dataDir string, now time.Time) *checkpointer {
	return &checkpointer{sig: sig, db: db, dataDir: dataDir, truncate: store.WALTruncateBytes, last: now, seen: sig.Count()}
}

// Next is when a checkpoint is due; ok is false while nothing is left to copy.
func (c *checkpointer) Next(context.Context) (time.Time, bool, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.behind && c.sig.Count() == c.seen {
		return time.Time{}, false, nil
	}
	return c.last.Add(checkpointEvery), true, nil
}

// run checkpoints once. Changes committed while it runs count for the next run.
func (c *checkpointer) run(ctx context.Context, now time.Time) (store.CheckpointResult, error) {
	c.mu.Lock()
	c.last, c.seen = now, c.sig.Count()
	c.mu.Unlock()
	res, err := store.CheckpointWAL(ctx, c.db, c.dataDir, c.truncate)
	c.mu.Lock()
	c.behind = err != nil || !res.Complete()
	c.mu.Unlock()
	return res, err
}

func (t *Tenant) checkpointJob() jobs.Job {
	return jobs.Job{Name: jobs.Checkpoint, Next: t.checkpoints.Next, Run: t.checkpoint, Retry: checkpointEvery, WhileOpen: true}
}

func (t *Tenant) checkpoint(ctx context.Context) {
	res, err := t.checkpoints.run(ctx, t.now())
	switch {
	case err != nil:
		if ctx.Err() == nil {
			t.log.Warn("database checkpoint failed", "err", err)
		}
	case res.Truncated:
		t.log.Info("database write-ahead log truncated", "frames", res.Frames, "busy", res.Busy)
	}
}
