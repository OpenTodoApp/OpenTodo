package tenant

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/backup"
	"github.com/OpenTodoApp/opentodo/internal/jobs"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
	"github.com/OpenTodoApp/opentodo/internal/webhook"
)

// lockedBuffer is a log sink safe for concurrent writers.
type lockedBuffer struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (l *lockedBuffer) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.b.Write(p)
}

func (l *lockedBuffer) String() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.b.String()
}

// TestStopJobsWaitsForRunningBackup (reliable-background-jobs): stopping the
// jobs cancels a backup in progress and waits until it has recorded its
// outcome, so closing the database afterwards loses nothing and logs no
// "database is closed" error.
func TestStopJobsWaitsForRunningBackup(t *testing.T) {
	entered := make(chan struct{})
	var once sync.Once
	dav := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case "MKCOL":
			w.WriteHeader(http.StatusCreated)
		case http.MethodPut:
			_, _ = io.Copy(io.Discard, r.Body)
			once.Do(func() { close(entered) })
			select {
			case <-r.Context().Done():
			case <-time.After(5 * time.Second):
			}
			w.WriteHeader(http.StatusCreated)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer dav.Close()

	logs := &lockedBuffer{}
	log := slog.New(slog.NewTextHandler(logs, nil))
	tn, err := Open(context.Background(), testConfig(t.TempDir()), Options{Version: "test", Web: http.NotFoundHandler(), Log: log})
	if err != nil {
		t.Fatal(err)
	}
	defer tn.Close()
	set := backup.DefaultSettings()
	set.Destination = backup.DestWebDAV
	set.WebDAV = backup.WebDAVSettings{URL: dav.URL + "/backups/", AllowHTTP: true}
	if _, err := tn.Backups.SaveSettings(context.Background(), set, backup.SecretUpdate{}); err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	stop := tn.StartJobs(ctx, nil)
	if err := tn.Backups.StartRun(context.Background(), backup.KindManual, ""); err != nil {
		t.Fatal(err)
	}
	select {
	case <-entered:
	case <-time.After(10 * time.Second):
		t.Fatal("backup never reached the destination")
	}
	cancel()
	stopped := make(chan struct{})
	go func() {
		stop()
		close(stopped)
	}()
	select {
	case <-stopped:
	case <-time.After(4 * time.Second):
		t.Fatal("stop did not return: the backup in progress was not cancelled")
	}
	if r := tn.Backups.Running(); r != nil {
		t.Fatalf("a backup is still running after stop: %+v", r)
	}
	runs, err := tn.Backups.History(context.Background(), 5)
	if err != nil {
		t.Fatal(err)
	}
	if len(runs) != 1 || runs[0].Status != backup.StatusFailed {
		t.Fatalf("runs after stop = %+v, want one failed run", runs)
	}
	if err := tn.Close(); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(logs.String(), "database is closed") {
		t.Fatalf("a job used the database after Close:\n%s", logs.String())
	}
}

// receiver counts webhook deliveries.
type receiver struct {
	srv  *httptest.Server
	hits atomic.Int32
}

func newReceiver(t *testing.T) *receiver {
	r := &receiver{}
	r.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		r.hits.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(r.srv.Close)
	return r
}

// waitHits waits until the receiver saw want deliveries, at most within.
func (r *receiver) waitHits(t *testing.T, want int32, within time.Duration) time.Duration {
	t.Helper()
	start := time.Now()
	for r.hits.Load() < want {
		if time.Since(start) > within {
			t.Fatalf("%d deliveries after %v, want %d", r.hits.Load(), within, want)
		}
		time.Sleep(5 * time.Millisecond)
	}
	return time.Since(start)
}

// webhookUser creates an account with a webhook for task.created pointing at
// rcv (the receiver is on 127.0.0.1, so private targets are allowed).
func webhookUser(t *testing.T, tn *Tenant, rcv *receiver) string {
	t.Helper()
	ctx := context.Background()
	u, err := tn.Auth.CreateAccount(ctx, "owner@example.com", "Owner", "correct horse battery", "owner")
	if err != nil {
		t.Fatal(err)
	}
	if err := tn.Hooks.SetAllowPrivate(ctx, true); err != nil {
		t.Fatal(err)
	}
	if _, err := tn.Hooks.Create(ctx, u.ID, webhook.Patch{URL: &rcv.srv.URL, Events: []string{"task.created"}, EventsSet: true}); err != nil {
		t.Fatal(err)
	}
	return u.ID
}

var opSeq atomic.Int64

// createTask applies a new task through the op log, as a device's sync does.
func createTask(t *testing.T, tn *Tenant, uid, id string) {
	t.Helper()
	n := opSeq.Add(1)
	now := time.Now().UnixMilli()
	op := opsync.Op{ID: "op-" + id, Entity: "task", EntityID: id, Field: "created_at", Value: json.RawMessage(`1`), TS: now*1000 + n, Device: "phone"}
	if _, err := tn.Sync.Apply(context.Background(), uid, []opsync.Op{op}); err != nil {
		t.Fatal(err)
	}
}

func openJobsTenant(t *testing.T, dir string) *Tenant {
	t.Helper()
	tn, err := Open(context.Background(), testConfig(dir), Options{Version: "test", Web: http.NotFoundHandler()})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { tn.Close() })
	return tn
}

func startJobs(t *testing.T, tn *Tenant) {
	ctx, cancel := context.WithCancel(context.Background())
	stop := tn.StartJobs(ctx, nil)
	t.Cleanup(func() {
		cancel()
		stop()
	})
}

// TestQueuedWebhookIsSentAtOnce (one-job-model): a delivery queued by the
// commit observer wakes the webhooks job, so it is sent well before the 30 s
// check interval and without a poll.
func TestQueuedWebhookIsSentAtOnce(t *testing.T) {
	tn := openJobsTenant(t, t.TempDir())
	rcv := newReceiver(t)
	uid := webhookUser(t, tn, rcv)
	startJobs(t, tn)
	// Let the runner settle into its idle sleep first.
	time.Sleep(100 * time.Millisecond)
	createTask(t, tn, uid, "t1")
	if took := rcv.waitHits(t, 1, 5*time.Second); took > time.Second {
		t.Fatalf("delivery took %v, want it at once", took)
	}
}

// TestJobListMatchesTheConfiguration: a self-hosted server and a host run the
// same list; a demo instance has no outbound jobs.
func TestJobListMatchesTheConfiguration(t *testing.T) {
	names := func(tn *Tenant) map[string]bool {
		out := map[string]bool{}
		for _, j := range tn.Jobs() {
			out[j.Name] = true
		}
		return out
	}
	got := names(openJobsTenant(t, t.TempDir()))
	for _, n := range []string{jobs.Reminders, jobs.Backup, jobs.Webhooks, jobs.Calendars, jobs.Issues, jobs.Digest, jobs.Rules, jobs.Housekeeping} {
		if !got[n] {
			t.Errorf("job %q missing: %v", n, got)
		}
	}
	if got[jobs.Email] || got[jobs.Demo] || got[jobs.Writes] {
		t.Errorf("unconfigured jobs present: %v", got)
	}
	cfg := testConfig(t.TempDir())
	cfg.Demo = true
	demo, err := Open(context.Background(), cfg, Options{Version: "test", Web: http.NotFoundHandler()})
	if err != nil {
		t.Fatal(err)
	}
	defer demo.Close()
	got = names(demo)
	for _, n := range []string{jobs.Backup, jobs.Webhooks, jobs.Calendars, jobs.Issues, jobs.Digest, jobs.Rules, jobs.Reminders} {
		if got[n] {
			t.Errorf("demo instance has job %q", n)
		}
	}
	if !got[jobs.Demo] || !got[jobs.Housekeeping] {
		t.Errorf("demo instance jobs: %v", got)
	}
}

// TestOnlyTheLeaderRunsJobs (one-job-model D6, rolling-updates): two servers
// on one data directory, the jobs running in one. A delivery queued through
// the other is sent by the leader within a few seconds (it notices the other
// process's write), exactly once, and the other never sends.
func TestOnlyTheLeaderRunsJobs(t *testing.T) {
	dir := t.TempDir()
	leader := openJobsTenant(t, dir)
	other := openJobsTenant(t, dir)
	rcv := newReceiver(t)
	uid := webhookUser(t, other, rcv)
	startJobs(t, leader)
	time.Sleep(100 * time.Millisecond)
	createTask(t, other, uid, "t1")
	if took := rcv.waitHits(t, 1, 10*time.Second); took > 5*time.Second {
		t.Fatalf("the leader sent the delivery after %v", took)
	}
	time.Sleep(1500 * time.Millisecond)
	if n := rcv.hits.Load(); n != 1 {
		t.Fatalf("%d deliveries, want exactly one", n)
	}
	ds, err := other.Hooks.Deliveries(context.Background(), uid, firstWebhook(t, other, uid))
	if err != nil || len(ds) != 1 || ds[0].Status != "delivered" {
		t.Fatalf("deliveries %+v %v", ds, err)
	}
}

func firstWebhook(t *testing.T, tn *Tenant, uid string) string {
	t.Helper()
	list, err := tn.Hooks.List(context.Background(), uid)
	if err != nil || len(list) != 1 {
		t.Fatalf("webhooks %+v %v", list, err)
	}
	return list[0].ID
}
