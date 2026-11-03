//go:build perf

package perf

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/compaction"
	"github.com/OpenTodoApp/opentodo/internal/perfseed"
	"github.com/OpenTodoApp/opentodo/internal/settings"
	"github.com/OpenTodoApp/opentodo/internal/store"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// TestNotesBudgets measures the notes fixture (OpenSpec change performance-10k,
// design D7) on the server: the database before and after the compaction job has
// run to completion, how long that took, the longest a write waited behind it,
// the notes' share of what is left, and a new device's first pull of the
// compacted account (time and bytes). It leaves the compacted data directory for
// the browser half (PERF_NOTES_COMPACTED).
//
//	PERF_NOTES_FIXTURE   a perfseed data directory built with -notes (required; skipped without)
//	PERF_NOTES_COMPACTED where to leave the compacted copy (default perf-report/notes-compacted)
//	PERF_NOTES_REPORT    the JSON report (default perf-report/notes-server.json)
func TestNotesBudgets(t *testing.T) {
	fixture := os.Getenv("PERF_NOTES_FIXTURE")
	if fixture == "" {
		t.Skip("PERF_NOTES_FIXTURE names no notes fixture")
	}
	root, _ := filepath.Abs("../..")
	out := env("PERF_NOTES_COMPACTED", filepath.Join(root, "perf-report", "notes-compacted"))
	var sum perfseed.Summary
	readJSON(t, filepath.Join(fixture, "perfseed.json"), &sum)
	if sum.Notes == nil {
		t.Fatal("the fixture has no notes (perfseed -notes)")
	}
	_ = os.RemoveAll(out)
	mkdir(t, out)
	copyFile(t, filepath.Join(fixture, "opentodo.db"), filepath.Join(out, "opentodo.db"))
	writeJSON(t, filepath.Join(out, "perfseed.json"), sum)

	samples := map[string][]float64{}
	reported := map[string]float64{}
	ctx := context.Background()
	db, err := store.Open(out)
	if err != nil {
		t.Fatal(err)
	}
	before, err := store.Stats(ctx, db, out)
	if err != nil {
		t.Fatal(err)
	}
	reported["notes-db-before"] = mb(before.Bytes())
	svc := opsync.NewService(db)
	// As the server wires it: pure reads (the compaction's candidates) on the reader pool.
	reader, err := store.OpenReader(out)
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()
	svc.SetReader(reader)
	job := compaction.New(compaction.Options{DB: db, Sync: svc, Settings: settings.New(db), DataDir: out, Log: slog.New(slog.DiscardHandler),
		FreeSpace: func(string) (uint64, bool, error) { return 1 << 40, true, nil }})

	// A device keeps writing while compaction runs: the longest wait of one push.
	stop := make(chan struct{})
	var wg sync.WaitGroup
	var longest time.Duration
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; ; i++ {
			select {
			case <-stop:
				return
			case <-time.After(50 * time.Millisecond):
			}
			op := opsync.Op{ID: fmt.Sprintf("notes-push-%d", i), Entity: "task", EntityID: sum.SampleTask, Field: "title",
				Value: json.RawMessage(strconv.Quote(fmt.Sprintf("Push %d", i))), TS: time.Now().UnixMilli(), Device: "perf-pusher"}
			start := time.Now()
			if _, err := svc.Apply(ctx, sum.OwnerID, []opsync.Op{op}); err != nil {
				t.Error(err)
				return
			}
			longest = max(longest, time.Since(start))
		}
	}()
	start := time.Now()
	var removedOps int
	var removedBytes int64
	for run := 0; run < 1000; run++ {
		job.Run(ctx)
		st, err := job.Status(ctx)
		if err != nil {
			t.Fatal(err)
		}
		if st.Last != nil && st.Last.At >= start.UnixMilli() && st.FreeBytes == 0 {
			removedOps, removedBytes = st.Last.OpsRemoved, st.Last.ValueBytesRemoved
			break
		}
	}
	samples["notes-compaction"] = []float64{time.Since(start).Seconds()}
	close(stop)
	wg.Wait()
	samples["notes-push-wait"] = []float64{ms(longest)}
	if err := store.Checkpoint(ctx, db); err != nil {
		t.Fatal(err)
	}
	after, err := store.Stats(ctx, db, out)
	if err != nil {
		t.Fatal(err)
	}
	samples["notes-db-size"] = []float64{mb(after.Bytes())}
	var share int64
	if err := db.QueryRowContext(ctx, `SELECT COALESCE(SUM(LENGTH(value)), 0) FROM ops WHERE field IN ('notes_doc', 'description') AND entity IN ('note', 'task')`).Scan(&share); err != nil {
		t.Fatal(err)
	}
	var current int64
	if err := db.QueryRowContext(ctx, `SELECT COALESCE(SUM(LENGTH(value)), 0) FROM scope_fields WHERE field IN ('notes_doc', 'description') AND entity IN ('note', 'task')`).Scan(&current); err != nil {
		t.Fatal(err)
	}
	samples["notes-share"] = []float64{mb(share + current)}
	reported["notes-ops-removed"] = float64(removedOps)
	reported["notes-bytes-removed-mb"] = mb(removedBytes)
	db.Close()

	// A new device's first pull of the compacted account, over HTTP.
	bin := env("PERF_BIN", filepath.Join(root, "bin", "opentodo"))
	addr := freeAddr(t)
	cmd := exec.Command(bin)
	cmd.Env = append(os.Environ(), "OPENTODO_DATA_DIR="+out, "OPENTODO_ADDR="+addr, "OPENTODO_LOG_LEVEL=warn")
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() { _ = cmd.Process.Signal(syscall.SIGTERM); _ = cmd.Wait() }()
	base := "http://" + addr
	for i := 0; i < 600; i++ {
		if resp, err := http.Get(base + "/healthz"); err == nil {
			resp.Body.Close()
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	pullStart := time.Now()
	var pulled int64
	cursor := int64(0)
	client := &http.Client{Timeout: 5 * time.Minute}
	for {
		body, _ := json.Marshal(map[string]any{"device": "perf-notes", "cursor": cursor, "ops": []any{}})
		req, _ := http.NewRequest("POST", base+"/api/v1/sync", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+sum.Token)
		req.Header.Set("Content-Type", "application/json")
		resp, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		raw, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		pulled += int64(len(raw))
		var page struct {
			Cursor  int64 `json:"cursor"`
			HasMore bool  `json:"hasMore"`
		}
		if err := json.Unmarshal(raw, &page); err != nil {
			t.Fatalf("pull: %v: %.200s", err, raw)
		}
		cursor = page.Cursor
		if !page.HasMore {
			break
		}
	}
	reported["notes-pull-seconds"] = time.Since(pullStart).Seconds()
	reported["notes-pull-mb"] = mb(pulled)

	budgets := loadBudgets(t, filepath.Join(root, "scripts", "perf", "budgets.json"))
	rep := report(budgets, "server", samples)
	notes := rep.Metrics[:0]
	for _, m := range rep.Metrics {
		if isNotesMetric(m.ID) {
			notes = append(notes, m)
		}
	}
	rep.Metrics = notes
	rep.Reported = reported
	rep.Setting = "server (notes)"
	writeJSON(t, env("PERF_NOTES_REPORT", filepath.Join(root, "perf-report", "notes-server.json")), rep)
	for k, v := range reported {
		t.Logf("%-24s %10.1f (reported)", k, v)
	}
	for _, m := range rep.Metrics {
		t.Logf("%-22s median %8.1f %-2s budget %6g", m.ID, m.Median, m.Unit, m.Limit)
		if !m.OK {
			t.Errorf("%s", m.Failure)
		}
	}
}

func isNotesMetric(id string) bool { return len(id) > 5 && id[:5] == "notes" }
