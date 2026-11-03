//go:build perf

package perf

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/perfseed"
)

// env reads a setting of the benchmark with a default.
func env(name, def string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return def
}

// TestServerBudgets measures every server budget PERF_RUNS times (default 5)
// on fresh copies of the fixture and fails when a median exceeds its budget.
//
//	PERF_BIN      the server binary (default bin/opentodo, built by make perf)
//	PERF_FIXTURE  a perfseed data directory (default: generated once here)
//	PERF_REPORT   where to write the JSON report (default perf-report/server.json)
func TestServerBudgets(t *testing.T) {
	root, _ := filepath.Abs("../..")
	bin := env("PERF_BIN", filepath.Join(root, "bin", "opentodo"))
	if _, err := os.Stat(bin); err != nil {
		t.Fatalf("server binary %s: %v (run make perf, or make web server)", bin, err)
	}
	runs, _ := strconv.Atoi(env("PERF_RUNS", "5"))
	fixture := os.Getenv("PERF_FIXTURE")
	if fixture == "" {
		fixture = filepath.Join(t.TempDir(), "fixture")
		start := time.Now()
		s, err := perfseed.Run(context.Background(), mkdir(t, fixture), perfseed.Options{})
		if err != nil {
			t.Fatal(err)
		}
		writeJSON(t, filepath.Join(fixture, "perfseed.json"), s)
		t.Logf("fixture: %d ops in %s", s.Ops, time.Since(start).Round(time.Millisecond))
	}
	var sum perfseed.Summary
	readJSON(t, filepath.Join(fixture, "perfseed.json"), &sum)
	samples := map[string][]float64{}
	for i := range runs {
		for k, v := range measureOnce(t, bin, fixture, sum) {
			samples[k] = append(samples[k], v)
		}
		t.Logf("run %d/%d done", i+1, runs)
	}
	budgets := loadBudgets(t, filepath.Join(root, "scripts", "perf", "budgets.json"))
	rep := report(budgets, "server", samples)
	// The notes fixture's server metrics are TestNotesBudgets'.
	plain := rep.Metrics[:0]
	for _, m := range rep.Metrics {
		if !isNotesMetric(m.ID) {
			plain = append(plain, m)
		}
	}
	rep.Metrics = plain
	writeJSON(t, env("PERF_REPORT", filepath.Join(root, "perf-report", "server.json")), rep)
	for _, m := range rep.Metrics {
		t.Logf("%-22s median %8.1f %-2s budget %6g  runs %v", m.ID, m.Median, m.Unit, m.Limit, m.Runs)
		if !m.OK {
			t.Errorf("%s", m.Failure)
		}
	}
}

// measureOnce starts the server on a copy of the fixture and takes one sample
// of every server metric.
func measureOnce(t *testing.T, bin, fixture string, sum perfseed.Summary) map[string]float64 {
	t.Helper()
	dir := t.TempDir()
	copyFile(t, filepath.Join(fixture, "opentodo.db"), filepath.Join(dir, "opentodo.db"))
	out := map[string]float64{}
	st, _ := os.Stat(filepath.Join(dir, "opentodo.db"))
	out["server-db-size"] = mb(st.Size())

	addr := freeAddr(t)
	cmd := exec.Command(bin)
	cmd.Env = append(os.Environ(), "OPENTODO_DATA_DIR="+dir, "OPENTODO_ADDR="+addr, "OPENTODO_MCP=true", "OPENTODO_LOG_LEVEL=warn")
	var logs bytes.Buffer
	cmd.Stdout, cmd.Stderr = &logs, &logs
	start := time.Now()
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() {
		_ = cmd.Process.Signal(syscall.SIGTERM)
		done := make(chan struct{})
		go func() { _ = cmd.Wait(); close(done) }()
		select {
		case <-done:
		case <-time.After(10 * time.Second):
			_ = cmd.Process.Kill()
		}
		if t.Failed() {
			t.Logf("server log:\n%s", logs.String())
		}
	}()
	base := "http://" + addr
	c := &client{t: t, base: base, token: sum.Token, http: &http.Client{Timeout: 2 * time.Minute}}
	for {
		if resp, err := http.Get(base + "/healthz"); err == nil {
			resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				break
			}
		}
		if time.Since(start) > 30*time.Second {
			t.Fatalf("server not healthy after 30 s:\n%s", logs.String())
		}
		time.Sleep(5 * time.Millisecond)
	}
	out["server-start"] = ms(time.Since(start))
	pid := cmd.Process.Pid
	// Idle: once start-up work (migrations, seeding, the first job pass) settled.
	time.Sleep(3 * time.Second)
	out["server-idle-rss"] = rss(t, pid, "VmRSS")

	// One new device's full first pull, page by page.
	resetPeak(t, pid)
	var pages []float64
	cursor := int64(0)
	ops := 0
	for {
		var res struct {
			Ops     []json.RawMessage `json:"ops"`
			Cursor  int64             `json:"cursor"`
			HasMore bool              `json:"hasMore"`
		}
		d := c.do("POST", "/api/v1/sync", map[string]any{"device": "perf-device", "cursor": cursor, "ops": []any{}}, &res)
		ops += len(res.Ops)
		if len(res.Ops) >= 900 {
			pages = append(pages, ms(d)) // only full pages count for the page budget
		}
		cursor = res.Cursor
		if !res.HasMore {
			break
		}
	}
	if ops < sum.Ops/2 {
		t.Fatalf("the first pull returned %d ops, the fixture has %d", ops, sum.Ops)
	}
	out["server-pull-page"] = p95(pages)
	out["server-pull-rss"] = rss(t, pid, "VmHWM")

	// Pushes of 100 ops, each a title edit of 100 tasks of the big project.
	var tasks struct {
		Tasks []struct {
			ID        string  `json:"id"`
			ProjectID *string `json:"project_id"`
		} `json:"tasks"`
	}
	var lists []float64
	for i := range 20 {
		d := c.do("GET", "/api/v1/tasks?project_id="+sum.BigProject, nil, &tasks)
		if i > 0 { // the first is a warm-up
			lists = append(lists, ms(d))
		}
	}
	out["server-list-project"] = p95(lists)
	var big []string
	for _, x := range tasks.Tasks {
		if x.ProjectID != nil && *x.ProjectID == sum.BigProject {
			big = append(big, x.ID)
		}
	}
	if len(big) < 100 {
		t.Fatalf("the big project lists %d tasks", len(big))
	}
	var pushes []float64
	now := time.Now().UnixMilli()
	for i := range 20 {
		batch := make([]map[string]any, 0, 100)
		for j := range 100 {
			id := big[(i*100+j)%len(big)]
			batch = append(batch, map[string]any{"id": fmt.Sprintf("perf-push-%d-%d-%d", now, i, j), "entity": "task", "entityId": id,
				"field": "title", "value": fmt.Sprintf("Edited %d", i), "ts": now + int64(i*100+j), "device": "perf-pusher"})
		}
		// The cursor is the head, so the push pulls nothing back.
		var res struct {
			Applied int   `json:"applied"`
			Cursor  int64 `json:"cursor"`
		}
		d := c.do("POST", "/api/v1/sync", map[string]any{"device": "perf-pusher", "cursor": cursor + int64(i*100), "ops": batch}, &res)
		if res.Applied != 100 {
			t.Fatalf("push applied %d of 100", res.Applied)
		}
		pushes = append(pushes, ms(d))
	}
	out["server-push"] = p95(pushes)
	var gets []float64
	for i := range 50 {
		d := c.do("GET", "/api/v1/tasks/"+big[i], nil, nil)
		gets = append(gets, ms(d))
	}
	out["server-get-task"] = p95(gets)
	var searches []float64
	for i := range 20 {
		var res struct {
			Result struct {
				IsError bool `json:"isError"`
			} `json:"result"`
		}
		d := c.do("POST", "/mcp", map[string]any{"jsonrpc": "2.0", "id": i + 1, "method": "tools/call",
			"params": map[string]any{"name": "search_tasks", "arguments": map[string]any{"query": sum.SearchTerm}}}, &res)
		if res.Result.IsError {
			t.Fatal("search_tasks failed")
		}
		searches = append(searches, ms(d))
	}
	out["server-mcp-search"] = p95(searches)

	resetPeak(t, pid)
	out["server-export"] = ms(c.do("GET", "/api/v1/export", nil, nil))
	out["server-export-rss"] = rss(t, pid, "VmHWM")
	return out
}

type client struct {
	t     *testing.T
	base  string
	token string
	http  *http.Client
}

// do sends one request, reads the whole answer and returns how long it took.
func (c *client) do(method, path string, body, into any) time.Duration {
	c.t.Helper()
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, c.base+path, rd)
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	start := time.Now()
	resp, err := c.http.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	d := time.Since(start)
	if err != nil {
		c.t.Fatal(err)
	}
	if resp.StatusCode >= 300 {
		c.t.Fatalf("%s %s: %d %s", method, path, resp.StatusCode, raw)
	}
	if into != nil {
		if err := json.Unmarshal(raw, into); err != nil {
			c.t.Fatalf("%s %s: %v", method, path, err)
		}
	}
	return d
}

// rss reads a memory line of /proc/<pid>/status in MB: VmRSS is now, VmHWM
// the peak since the last resetPeak.
func rss(t *testing.T, pid int, field string) float64 {
	t.Helper()
	f, err := os.Open(fmt.Sprintf("/proc/%d/status", pid))
	if err != nil {
		t.Fatalf("memory needs Linux /proc: %v", err)
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		if v, ok := strings.CutPrefix(sc.Text(), field+":"); ok {
			kb, _ := strconv.ParseFloat(strings.TrimSuffix(strings.TrimSpace(v), " kB"), 64)
			return kb / 1024
		}
	}
	t.Fatalf("no %s in /proc/%d/status", field, pid)
	return 0
}

// resetPeak starts a new peak (VmHWM) window: writing 5 to clear_refs.
func resetPeak(t *testing.T, pid int) {
	t.Helper()
	if err := os.WriteFile(fmt.Sprintf("/proc/%d/clear_refs", pid), []byte("5"), 0); err != nil {
		t.Logf("cannot reset the peak memory counter, the peak includes start-up: %v", err)
	}
}

func p95(xs []float64) float64 {
	if len(xs) == 0 {
		return 0
	}
	s := append([]float64(nil), xs...)
	sort.Float64s(s)
	i := int(float64(len(s))*0.95+0.5) - 1
	return s[max(0, min(i, len(s)-1))]
}

func ms(d time.Duration) float64 { return float64(d.Microseconds()) / 1000 }
func mb(n int64) float64         { return float64(n) / (1 << 20) }

func freeAddr(t *testing.T) string {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()
	return l.Addr().String()
}

func mkdir(t *testing.T, dir string) string {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	return dir
}

func copyFile(t *testing.T, from, to string) {
	b, err := os.ReadFile(from)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(to, b, 0o600); err != nil {
		t.Fatal(err)
	}
}

func readJSON(t *testing.T, path string, v any) {
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(b, v); err != nil {
		t.Fatal(err)
	}
}

func writeJSON(t *testing.T, path string, v any) {
	b, _ := json.MarshalIndent(v, "", "  ")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, append(b, '\n'), 0o644); err != nil {
		t.Fatal(err)
	}
}
