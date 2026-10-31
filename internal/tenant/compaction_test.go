package tenant

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/compaction"
	"github.com/OpenTodoApp/opentodo/internal/jobs"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

func jobNamed(t *testing.T, tn *Tenant, name string) jobs.Job {
	t.Helper()
	for _, j := range tn.Jobs() {
		if j.Name == name {
			return j
		}
	}
	t.Fatalf("no job %q", name)
	return jobs.Job{}
}

// TestCompactionJob (op-log-compaction 3.1, 3.2): the tenant's compaction job
// is due an hour after start once something changed, removes old note
// versions and stores its report.
func TestCompactionJob(t *testing.T) {
	ctx := context.Background()
	later := time.Now().Add(31 * 24 * time.Hour)
	tn, err := Open(ctx, testConfig(t.TempDir()), Options{Version: "test", Web: http.NotFoundHandler(), Now: func() time.Time { return later }})
	if err != nil {
		t.Fatal(err)
	}
	defer tn.Close()
	job := jobNamed(t, tn, jobs.Compaction)
	if _, ok, _ := job.Next(ctx); ok {
		t.Fatal("due before any change")
	}
	now := time.Now().UnixMilli()
	var ops []opsync.Op
	for i := 0; i < 5; i++ {
		v, _ := json.Marshal(fmt.Sprintf("ydoc:v1:QUJD%04d", i))
		ops = append(ops, opsync.Op{ID: fmt.Sprintf("n%d", i), Entity: "task", EntityID: "t1", Field: "notes_doc", Value: v, TS: now + int64(i), Device: "phone"})
	}
	if _, err := tn.Sync.Apply(ctx, "u1", ops); err != nil {
		t.Fatal(err)
	}
	at, ok, _ := job.Next(ctx)
	if !ok || !at.Equal(later.Add(compaction.FirstDelay)) {
		t.Fatalf("due %v %v, want an hour after start", at, ok)
	}
	job.Run(ctx)
	st, err := tn.Compaction.Status(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if st.Last == nil || st.Last.OpsRemoved != 4 || st.Conversion != compaction.ConversionDone {
		t.Fatalf("status %+v", st)
	}
	var stored map[string]any
	if ok, err := tn.Settings.Get(ctx, compaction.SettingKey, &stored); !ok || err != nil || stored["last"] == nil {
		t.Fatalf("stored report %v %v %v", ok, err, stored)
	}
	if _, ok, _ := job.Next(ctx); ok {
		t.Fatal("due again without a change")
	}
}

// TestCompactionJobOnDemo: the demo registers the job; it finds nothing to
// delete there, since sandboxes never reach the 30-day window.
func TestCompactionJobOnDemo(t *testing.T) {
	ctx := context.Background()
	cfg := testConfig(t.TempDir())
	cfg.Demo = true
	tn, err := Open(ctx, cfg, Options{Version: "test", Web: http.NotFoundHandler()})
	if err != nil {
		t.Fatal(err)
	}
	defer tn.Close()
	var before, after int
	_ = tn.DB.QueryRow(`SELECT COUNT(*) FROM ops`).Scan(&before)
	jobNamed(t, tn, jobs.Compaction).Run(ctx)
	_ = tn.DB.QueryRow(`SELECT COUNT(*) FROM ops`).Scan(&after)
	st, _ := tn.Compaction.Status(ctx)
	if after != before || st.Last == nil || st.Last.OpsRemoved != 0 {
		t.Fatalf("demo: ops %d -> %d, report %+v", before, after, st.Last)
	}
}
