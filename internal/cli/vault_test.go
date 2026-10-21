package cli

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/e2ee/crypt"
)

func readFile(t *testing.T, p string) string {
	t.Helper()
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func writeFile(t *testing.T, p, text string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
}

func replaceIn(t *testing.T, p, old, new string) {
	t.Helper()
	text := readFile(t, p)
	if !strings.Contains(text, old) {
		t.Fatalf("%s lacks %q:\n%s", p, old, text)
	}
	writeFile(t, p, strings.Replace(text, old, new, 1))
}

func syncRequests(log []string) int {
	n := 0
	for _, r := range log {
		if r == "POST /api/v1/sync" {
			n++
		}
	}
	return n
}

func TestVaultInitSyncStatus(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.put("project", "home0001", map[string]any{"name": "Home", "color": "#10b981", "archived": false})
	h.put("task", "rent0001", map[string]any{"title": "Pay rent", "project_id": "home0001"})
	h.put("task", "plum0001", map[string]any{"title": "Call the plumber", "project_id": "home0001"})
	dir := filepath.Join(t.TempDir(), "Tasks")
	out := h.mustRun("vault", "init", dir)
	if !strings.Contains(out, "1 projects and 2 tasks written") {
		t.Fatalf("init output %q", out)
	}
	home := filepath.Join(dir, "Home.md")
	if !strings.Contains(readFile(t, home), "- [ ] Pay rent 🆔 rent0001") {
		t.Fatalf("Home.md:\n%s", readFile(t, home))
	}
	// Already a vault: exit 2, nothing changed.
	if code, _, errb := h.run("vault", "init", dir); code != ExitUsage || !strings.Contains(errb, "already a vault") {
		t.Fatalf("second init: %d %q", code, errb)
	}
	// A folder with notes needs --adopt.
	notes := t.TempDir()
	writeFile(t, filepath.Join(notes, "Reading.md"), "- [ ] Dune\n")
	if code, _, errb := h.run("vault", "init", notes); code != ExitUsage || !strings.Contains(errb, "--adopt") {
		t.Fatalf("notes init: %d %q", code, errb)
	}
	if _, err := os.Stat(filepath.Join(notes, ".opentodo")); err == nil {
		t.Fatal("refused init created state")
	}
	h.mustRun("vault", "init", notes, "--adopt")
	if !strings.Contains(readFile(t, filepath.Join(notes, "Reading.md")), "opentodo-id: ") {
		t.Fatal("adopted file has no project id")
	}

	// Two new lines and a completion on the phone: created 2, written 1.
	writeFile(t, home, readFile(t, home)+"- [ ] Buy bulbs\n- [ ] Fix the gate\n")
	h.apiJSON("PATCH", "/api/v1/tasks/plum0001", map[string]any{"completed_at": time.Now().UnixMilli()})
	var rep struct {
		Written, Created, Updated, Trashed, Conflicts int
		Warnings                                      []string
		Cursor                                        int64
	}
	if err := json.Unmarshal([]byte(h.mustRun("vault", "sync", dir, "--json")), &rep); err != nil {
		t.Fatal(err)
	}
	// Written: Home.md, and Reading.md for the project the adopted folder made.
	if rep.Created != 2 || rep.Written != 2 || rep.Cursor == 0 {
		t.Fatalf("sync report %+v", rep)
	}
	if !strings.Contains(readFile(t, home), "- [x] Call the plumber") {
		t.Fatalf("completion not written:\n%s", readFile(t, home))
	}

	// Dry run: one planned title op, nothing written or pushed.
	replaceIn(t, home, "Pay rent", "Pay the rent")
	before := readFile(t, home)
	out = h.mustRun("vault", "sync", dir, "--dry-run", "--json")
	var plan struct {
		Planned []struct{ Field string }
	}
	_ = json.Unmarshal([]byte(out), &plan)
	if len(plan.Planned) != 1 || plan.Planned[0].Field != "title" {
		t.Fatalf("dry run %s", out)
	}
	if h.task("rent0001")["title"] != "Pay rent" || readFile(t, home) != before {
		t.Fatal("dry run changed something")
	}

	// Read-only: the app's change is written, the file edit stays pending.
	h.put("task", "bins0001", map[string]any{"title": "Bins out"})
	h.mustRun("vault", "sync", dir, "--read-only")
	if h.task("rent0001")["title"] != "Pay rent" {
		t.Fatal("read-only pushed")
	}
	if !strings.Contains(readFile(t, filepath.Join(dir, "Inbox.md")), "Bins out") {
		t.Fatal("read-only did not write the app's change")
	}
	// Status reads only the folder: it works with no server at all.
	h.env["OPENTODO_URL"] = "http://127.0.0.1:1"
	h.requestLog()
	out = h.mustRun("vault", "status", dir, "--json")
	if !strings.Contains(out, `"changed":["Home.md"]`) || len(h.requestLog()) != 0 {
		t.Fatalf("status %s", out)
	}
	// Unreachable on sync: exit 4 naming the URL, nothing changed.
	code, _, errb := h.run("vault", "sync", dir)
	if code != ExitUnreachable || !strings.Contains(errb, "127.0.0.1:1") || readFile(t, home) != before {
		t.Fatalf("unreachable: %d %q", code, errb)
	}
	delete(h.env, "OPENTODO_URL")
	h.mustRun("vault", "sync", dir)
	if h.task("rent0001")["title"] != "Pay the rent" {
		t.Fatal("pending edit not pushed")
	}
}

func TestVaultScopeAndEncryption(t *testing.T) {
	h := newHarness(t)
	h.login()
	dir := filepath.Join(t.TempDir(), "Tasks")
	h.mustRun("vault", "init", dir)
	// An agent token: exit 5 insufficient_scope before any sync request.
	h.env["OPENTODO_URL"] = h.srv.URL
	h.env["OPENTODO_TOKEN"] = h.agentToken()
	h.requestLog()
	code, out, _ := h.run("vault", "sync", dir, "--json")
	if code != ExitNotPermitted || !strings.Contains(out, "insufficient_scope") || syncRequests(h.requestLog()) != 0 {
		t.Fatalf("agent token: %d %s", code, out)
	}
	delete(h.env, "OPENTODO_URL")
	delete(h.env, "OPENTODO_TOKEN")

	// Encrypted account, locked: exit 5 encryption_enabled naming the unlock command.
	dek := seqBytes(0x40, 32)
	h.encrypted(1, dek)
	h.put("task", "pass0001", map[string]any{"title": h.seal(dek, "task", "pass0001", "title", "Renew passport")})
	h.put("task", "bad00001", map[string]any{"title": h.seal(dek, "task", "other", "title", "Wrong binding"), "priority": 4})
	h.requestLog()
	code, out, _ = h.run("vault", "sync", dir, "--json")
	if code != ExitNotPermitted || !strings.Contains(out, "encryption_enabled") || !strings.Contains(out, "ot encryption unlock") || syncRequests(h.requestLog()) != 0 {
		t.Fatalf("locked: %d %s", code, out)
	}
	// Unlocked: plaintext in the file, ciphertext on the server.
	h.mustRun("encryption", "unlock", "--passphrase-file", h.passphraseFile())
	h.mustRun("vault", "sync", dir)
	inbox := filepath.Join(dir, "Inbox.md")
	text := readFile(t, inbox)
	if !strings.Contains(text, "- [ ] Renew passport 🆔 pass0001") || !strings.Contains(text, "- [ ] Encrypted item 🆔 bad00001") {
		t.Fatalf("Inbox.md:\n%s", text)
	}
	replaceIn(t, inbox, "Renew passport", "Renew passports")
	replaceIn(t, inbox, "Encrypted item 🆔 bad00001", "Encrypted item 🔺 🆔 bad00001")
	h.mustRun("vault", "sync", dir)
	stored := h.task("pass0001")["title"].(string)
	if pt, err := crypt.Open(dek, "task", "pass0001", "title", stored); err != nil || pt != "Renew passports" {
		t.Fatalf("stored title %q opens to %q, %v", stored, pt, err)
	}
	bad := h.task("bad00001")
	if bad["priority"].(float64) != 1 || !strings.HasPrefix(bad["title"].(string), "enc:v1:") {
		t.Fatalf("undecryptable task: %v", bad)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, ".opentodo", "state.json")); strings.Contains(string(b), "Renew passports") {
		t.Error("the state file holds plaintext")
	}
}

func TestVaultWatch(t *testing.T) {
	watchPoll, watchStable, watchFallback = 50*time.Millisecond, 20*time.Millisecond, 200*time.Millisecond
	t.Cleanup(func() { watchPoll, watchStable, watchFallback = 2*time.Second, time.Second, 30*time.Second })
	h := newHarness(t)
	h.login()
	h.put("project", "home0001", map[string]any{"name": "Home", "color": "#10b981", "archived": false})
	dir := filepath.Join(t.TempDir(), "Tasks")
	h.mustRun("vault", "init", dir)
	home := filepath.Join(dir, "Home.md")
	done := make(chan int)
	stop := make(chan struct{})
	go func() {
		a := &App{Stdin: strings.NewReader(""), Stdout: &strings.Builder{}, Stderr: &strings.Builder{}, ConfigPath: h.configPath,
			Getenv: func(k string) string { return "" }, Now: time.Now, Hostname: "testbox", IsTerminal: func() bool { return false }}
		ctx, cancel := contextWithStop(stop)
		defer cancel()
		done <- a.MainContext(ctx, []string{"vault", "watch", dir})
	}()
	waitFor := func(what string, ok func() bool) {
		t.Helper()
		deadline := time.Now().Add(10 * time.Second)
		for time.Now().Before(deadline) {
			if ok() {
				return
			}
			time.Sleep(20 * time.Millisecond)
		}
		t.Fatalf("timed out waiting for %s", what)
	}
	// App change reaches the file.
	h.put("task", "lamp0001", map[string]any{"title": "Fix the lamp", "project_id": "home0001"})
	waitFor("the app's task in Home.md", func() bool {
		b, _ := os.ReadFile(home)
		return strings.Contains(string(b), "Fix the lamp")
	})
	// File save reaches the app, and the line gets its id.
	writeFile(t, home, readFile(t, home)+"- [ ] Oil the hinge\n")
	waitFor("the new line's id", func() bool {
		b, _ := os.ReadFile(home)
		return strings.Contains(string(b), "Oil the hinge 🆔 ")
	})
	close(stop)
	if code := <-done; code != 0 {
		t.Fatalf("watch exit %d", code)
	}
}

func contextWithStop(stop <-chan struct{}) (context.Context, context.CancelFunc) {
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		<-stop
		cancel()
	}()
	return ctx, cancel
}
