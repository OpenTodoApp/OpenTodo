package tenant

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/jobs"
	"github.com/OpenTodoApp/opentodo/internal/store"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

func walBytes(t *testing.T, dir string) int64 {
	t.Helper()
	st, err := os.Stat(store.DBPath(dir) + "-wal")
	if os.IsNotExist(err) {
		return 0
	}
	if err != nil {
		t.Fatal(err)
	}
	return st.Size()
}

// writeBatch applies 20 title edits of about 2 KB each: about 100 KB of log.
func writeBatch(t *testing.T, tn *Tenant, round int) int64 {
	t.Helper()
	now := time.Now().UnixMilli()
	var ops []opsync.Op
	var bytes int64
	for i := range 20 {
		v, _ := json.Marshal(fmt.Sprintf("%d %s", round, strings.Repeat("t", 2000)))
		bytes += int64(len(v))
		ops = append(ops, opsync.Op{ID: fmt.Sprintf("w%d-%d", round, i), Entity: "task", EntityID: fmt.Sprintf("t%d", i), Field: "title",
			Value: v, TS: now*100 + int64(round*20+i), Device: "phone"})
	}
	if _, err := tn.Sync.Apply(context.Background(), "u1", ops); err != nil {
		t.Fatal(err)
	}
	return bytes
}

// TestCheckpointJob: the job is due only after a change, copies the whole log
// from the reader pool, and is not due again until the next change.
func TestCheckpointJob(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	tn := openJobsTenant(t, dir)
	job := jobNamed(t, tn, jobs.Checkpoint)
	if _, ok, _ := job.Next(ctx); ok {
		t.Fatal("due before any change")
	}
	writeBatch(t, tn, 0)
	if _, ok, _ := job.Next(ctx); !ok {
		t.Fatal("not due after a change")
	}
	res, err := tn.checkpoints.run(ctx, time.Now())
	if err != nil || !res.Complete() || res.Frames == 0 {
		t.Fatalf("checkpoint %+v %v", res, err)
	}
	if _, ok, _ := job.Next(ctx); ok {
		t.Fatal("due again without a change")
	}
}

// TestCheckpointJobKeepsTheLogBounded: under sustained writes the log file
// stays the size of the writes between two checkpoints, not of all of them,
// although the writer's own checkpoint is far away (store.AutoCheckpointPages):
// the same writes without the job grow it several times larger.
func TestCheckpointJobKeepsTheLogBounded(t *testing.T) {
	ctx := context.Background()
	largest := func(withJob bool) int64 {
		dir := t.TempDir()
		tn := openJobsTenant(t, dir)
		// Start from an empty log, without what opening wrote.
		if _, err := store.CheckpointWAL(ctx, tn.Reader, dir, 0); err != nil {
			t.Fatal(err)
		}
		job := jobNamed(t, tn, jobs.Checkpoint)
		var top int64
		for round := range 60 {
			writeBatch(t, tn, round)
			if withJob && round%5 == 4 {
				job.Run(ctx)
			}
			top = max(top, walBytes(t, dir))
		}
		return top
	}
	with, without := largest(true), largest(false)
	t.Logf("largest log: %d bytes with the job, %d without", with, without)
	if with*3 > without {
		t.Fatalf("log reached %d bytes with the job, %d without", with, without)
	}
}

// TestCheckpointJobRunsByItself: on a self-hosted server the runner runs the
// job shortly after a write (well before the 30 s check interval).
func TestCheckpointJobRunsByItself(t *testing.T) {
	ctx := context.Background()
	tn := openJobsTenant(t, t.TempDir())
	startJobs(t, tn)
	job := jobNamed(t, tn, jobs.Checkpoint)
	writeBatch(t, tn, 0)
	deadline := time.Now().Add(10 * time.Second)
	for {
		if _, ok, _ := job.Next(ctx); !ok {
			return
		}
		if time.Now().After(deadline) {
			t.Fatal("the checkpoint job did not run within 10 s of a write")
		}
		time.Sleep(20 * time.Millisecond)
	}
}

// TestCheckpointJobAfterClose: a run after the database closed (or with its
// context cancelled) logs at most a warning, never panics, and stays due.
func TestCheckpointJobAfterClose(t *testing.T) {
	logs := &lockedBuffer{}
	tn, err := Open(context.Background(), testConfig(t.TempDir()), Options{Version: "test", Web: http.NotFoundHandler(),
		Log: slog.New(slog.NewTextHandler(logs, nil))})
	if err != nil {
		t.Fatal(err)
	}
	job := jobNamed(t, tn, jobs.Checkpoint)
	writeBatch(t, tn, 0)
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	job.Run(cancelled)
	if strings.Contains(logs.String(), "checkpoint") {
		t.Fatalf("a cancelled run logged: %s", logs.String())
	}
	if err := tn.Close(); err != nil {
		t.Fatal(err)
	}
	job.Run(context.Background())
	if !strings.Contains(logs.String(), "database checkpoint failed") {
		t.Fatalf("no warning after close: %s", logs.String())
	}
	if _, ok, _ := job.Next(context.Background()); !ok {
		t.Fatal("a failed checkpoint is not due again")
	}
}
