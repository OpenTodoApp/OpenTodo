//go:build unix

package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/cookiejar"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/backup"
)

// lockedBuffer collects the server's output, written by os/exec's copier
// while the test reads it.
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

// TestWebRestoreRestartsInPlace (backup-restore-web 3.3): the real binary
// confirms a restore over HTTP, stops, applies it and comes back as the same
// process with the archive's data.
func TestWebRestoreRestartsInPlace(t *testing.T) {
	if testing.Short() {
		t.Skip("builds and runs the server binary")
	}
	bin := filepath.Join(t.TempDir(), "opentodo")
	goBin, err := exec.LookPath("go")
	if err != nil {
		t.Skip("needs the go command on PATH")
	}
	build := exec.Command(goBin, "build", "-o", bin, ".")
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build: %v\n%s", err, out)
	}
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := l.Addr().String()
	l.Close()
	dir := t.TempDir()
	var logs lockedBuffer
	cmd := exec.Command(bin)
	cmd.Env = append(os.Environ(), "OPENTODO_DATA_DIR="+dir, "OPENTODO_ADDR="+addr)
	cmd.Stdout, cmd.Stderr = &logs, &logs
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	exited := make(chan error, 1)
	go func() { exited <- cmd.Wait() }()
	t.Cleanup(func() {
		cmd.Process.Kill()
		<-exited
		if t.Failed() {
			t.Logf("server log:\n%s", logs.String())
		}
	})
	base := "http://" + addr
	waitHealthy := func() {
		t.Helper()
		deadline := time.Now().Add(20 * time.Second)
		for time.Now().Before(deadline) {
			select {
			case err := <-exited:
				t.Fatalf("server exited: %v", err)
			default:
			}
			if resp, err := http.Get(base + "/healthz"); err == nil {
				resp.Body.Close()
				if resp.StatusCode == 200 {
					return
				}
			}
			time.Sleep(100 * time.Millisecond)
		}
		t.Fatal("server did not become healthy")
	}
	jar, _ := cookiejar.New(nil)
	client := &http.Client{Jar: jar, Timeout: 30 * time.Second}
	call := func(method, path string, body any, want int) map[string]any {
		t.Helper()
		var rd io.Reader
		if body != nil {
			b, _ := json.Marshal(body)
			rd = bytes.NewReader(b)
		}
		req, _ := http.NewRequest(method, base+path, rd)
		req.Header.Set("Content-Type", "application/json")
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("%s %s: %v", method, path, err)
		}
		defer resp.Body.Close()
		raw, _ := io.ReadAll(resp.Body)
		if resp.StatusCode != want {
			t.Fatalf("%s %s = %d, want %d: %s", method, path, resp.StatusCode, want, raw)
		}
		var out map[string]any
		_ = json.Unmarshal(raw, &out)
		if out == nil {
			out = map[string]any{"raw": string(raw)}
		}
		return out
	}
	tasks := func() string {
		out := call("GET", "/api/v1/tasks", nil, 200)
		b, _ := json.Marshal(out)
		return string(b)
	}

	waitHealthy()
	call("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"}, 201)
	call("POST", "/api/v1/tasks", map[string]any{"title": "Made before the backup"}, 201)
	call("PUT", "/api/v1/backups/settings", map[string]any{"settings": backup.DefaultSettings()}, 200)
	call("POST", "/api/v1/backups/run", nil, 202)
	var archive string
	for i := 0; i < 100 && archive == ""; i++ {
		time.Sleep(100 * time.Millisecond)
		out := call("GET", "/api/v1/backups/archives", nil, 200)
		if list, _ := out["archives"].([]any); len(list) == 1 {
			archive = list[0].(map[string]any)["name"].(string)
		}
	}
	if archive == "" {
		t.Fatal("no archive appeared")
	}
	call("POST", "/api/v1/tasks", map[string]any{"title": "Made after the backup"}, 201)
	if !strings.Contains(tasks(), "Made after the backup") {
		t.Fatal("setup: second task missing")
	}

	prep := call("POST", "/api/v1/backups/restore/prepare", map[string]any{"source": map[string]string{"archive": archive}}, 200)
	call("POST", "/api/v1/backups/restore", map[string]any{"id": prep["id"], "confirm": "RESTORE"}, 202)
	pid := cmd.Process.Pid
	// The server goes away and comes back.
	time.Sleep(300 * time.Millisecond)
	waitHealthy()
	select {
	case err := <-exited:
		t.Fatalf("the process exited instead of restarting in place: %v", err)
	default:
	}
	if cmd.Process.Pid != pid {
		t.Fatal("pid changed")
	}
	// The session was created before the backup was taken, so it is still
	// valid; sign in again anyway to be independent of timing.
	call("POST", "/api/v1/auth/login", map[string]string{"email": "owner@example.com", "password": "correct horse battery"}, 200)
	got := tasks()
	if !strings.Contains(got, "Made before the backup") || strings.Contains(got, "Made after the backup") {
		t.Fatalf("tasks after restore = %s", got)
	}
	state := call("GET", "/api/v1/backups/restore", nil, 200)
	last, _ := state["last"].(map[string]any)
	if last == nil || last["ok"] != true || state["undoAvailable"] != true {
		t.Fatalf("restore state = %v", state)
	}
	if !strings.Contains(logs.String(), "restore applied") {
		t.Fatalf("log does not mention the apply:\n%s", logs.String())
	}
}
