package tenant

import (
	"bytes"
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/backup"
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
