package vault

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// fake is a server that serves a fixed log once and records what it receives.
type fake struct {
	log      []Op
	shared   []string
	received []Op
	gen      string
}

func (f *fake) Exchange(_ context.Context, req Request) (Reply, error) {
	f.received = append(f.received, req.Ops...)
	rep := Reply{Ops: []Op{}, ServerTime: time.Now().UnixMilli(), Generation: f.gen, Cursor: int64(len(f.log))}
	if req.Cursor < int64(len(f.log)) {
		rep.Ops = f.log[req.Cursor:]
	}
	for _, p := range f.shared {
		rep.Memberships = append(rep.Memberships, Membership{ProjectID: p})
	}
	f.log = append(f.log, req.Ops...)
	if len(req.Ops) > 0 {
		rep.Cursor = int64(len(f.log))
	}
	return rep, nil
}

// row makes the ops of one entity.
func row(entity, id string, fields map[string]any) []Op {
	var out []Op
	for f, v := range fields {
		raw, _ := json.Marshal(v)
		out = append(out, Op{ID: entity + id + f, Entity: entity, EntityID: id, Field: f, Value: raw, TS: 1, Device: "seed"})
	}
	return out
}

func task(id, title, project string, extra map[string]any) []Op {
	f := map[string]any{"title": title, "project_id": nullable(project), "priority": 4, "position": 1000, "deleted_at": nil, "completed_at": nil}
	for k, v := range extra {
		f[k] = v
	}
	return row("task", id, f)
}

func project(id, name string) []Op {
	return row("project", id, map[string]any{"name": name, "color": "#22c55e", "archived": false, "parent_id": nil, "position": 1000, "deleted_at": nil})
}

func runFake(t *testing.T, dir string, f *fake, st *State) (*Report, error) {
	t.Helper()
	return Sync(context.Background(), Options{Dir: dir, Transport: f, Loc: time.UTC, State: st})
}

func fieldsSent(f *fake, id string) map[string]string {
	out := map[string]string{}
	for _, op := range f.received {
		if op.EntityID == id {
			out[op.Field] = string(op.Value)
		}
	}
	return out
}

func TestLineReports(t *testing.T) {
	dir := t.TempDir()
	var log []Op
	log = append(log, project("p-home", "Home")...)
	log = append(log, project("p-shared", "Shared")...)
	log = append(log, task("t1", "Water", "p-home", nil)...)
	log = append(log, task("t2", "Rent", "p-home", map[string]any{"position": 2000})...)
	log = append(log, task("t3", "Plan", "p-home", map[string]any{"position": 3000})...)
	log = append(log, task("t4", "Theirs", "p-shared", nil)...)
	f := &fake{log: log, shared: []string{"p-shared"}}
	if _, err := runFake(t, dir, f, NewState("default", "http://x")); err != nil {
		t.Fatal(err)
	}
	home := filepath.Join(dir, "Home.md")
	b, _ := os.ReadFile(home)
	text := string(b)
	text = strings.Replace(text, "- [ ] Water 🆔 t1", "- [ ] Water 📅 2026-02-30 ⏫ 🆔 t1", 1)
	text = strings.Replace(text, "- [ ] Rent 🆔 t2", "- [ ] Rent 🔁 every blursday ⛔ t4 🔽 🆔 t2", 1)
	text = strings.Replace(text, "- [ ] Plan 🆔 t3", "- [ ] Plan 🆔 t3\n- [ ] Ghost 🆔 not-a-task", 1)
	if err := os.WriteFile(home, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
	rep, err := runFake(t, dir, f, nil)
	if err != nil {
		t.Fatal(err)
	}
	all := strings.Join(rep.Warnings, "\n")
	for _, want := range []string{"📅 2026-02-30 is not a date", "every blursday", "another sharing", "not-a-task is not in the account"} {
		if !strings.Contains(all, want) {
			t.Errorf("no warning %q in:\n%s", want, all)
		}
	}
	// The rest of the line is synced; the bad fields are not.
	if got := fieldsSent(f, "t1"); got["priority"] != "2" || got["due"] != "" {
		t.Errorf("t1 sent %v", got)
	}
	if got := fieldsSent(f, "t2"); len(got) != 0 {
		t.Errorf("t2 sent %v", got)
	}
	b, _ = os.ReadFile(home)
	if !strings.Contains(string(b), "- [ ] Ghost 🆔 not-a-task") {
		t.Errorf("unknown line not kept:\n%s", b)
	}
	if !strings.Contains(string(b), "- [ ] Rent 🆔 t2") {
		t.Errorf("rent line not rewritten from the app:\n%s", b)
	}
}

func TestTaskLimitAtInit(t *testing.T) {
	var log []Op
	for i := 0; i <= MaxTasks; i++ {
		id := fmt.Sprintf("t%05d", i)
		raw := json.RawMessage(`"x"`)
		log = append(log, Op{ID: id, Entity: "task", EntityID: id, Field: "title", Value: raw, TS: 1, Device: "seed"})
	}
	dir := t.TempDir()
	_, err := runFake(t, dir, &fake{log: log}, NewState("default", "http://x"))
	if _, ok := err.(*LimitError); !ok || !strings.Contains(err.Error(), "20000") {
		t.Fatalf("err = %v", err)
	}
	if entries, _ := os.ReadDir(dir); len(entries) != 0 {
		t.Errorf("init wrote %d entries", len(entries))
	}
}

func TestNoteLimit(t *testing.T) {
	dir := t.TempDir()
	f := &fake{log: task("t1", "Long", "", nil)}
	if _, err := runFake(t, dir, f, NewState("default", "http://x")); err != nil {
		t.Fatal(err)
	}
	inbox := filepath.Join(dir, "Inbox.md")
	note := "  " + strings.Repeat("a", MaxNoteBytes+1)
	if err := os.WriteFile(inbox, []byte("- [ ] Long 🆔 t1\n"+note+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := runFake(t, dir, f, nil); err == nil || !strings.Contains(err.Error(), "64 KB") {
		t.Fatalf("err = %v", err)
	}
	if len(f.received) != 0 {
		t.Error("ops sent past a limit")
	}
}

func TestGenerationRestartsFromZero(t *testing.T) {
	dir := t.TempDir()
	f := &fake{log: task("t1", "Keep", "", nil), gen: "g1"}
	if _, err := runFake(t, dir, f, NewState("default", "http://x")); err != nil {
		t.Fatal(err)
	}
	// The server is restored from a backup without the task: a new generation.
	f.log, f.gen, f.received = nil, "g2", nil
	rep, err := runFake(t, dir, f, nil)
	if err != nil {
		t.Fatal(err)
	}
	if fieldsSent(f, "t1")["title"] != `"Keep"` {
		t.Errorf("the vault did not re-send what it knew: %v", f.received)
	}
	if !strings.Contains(strings.Join(rep.Warnings, " "), "restored from a backup") {
		t.Errorf("warnings %v", rep.Warnings)
	}
	st, _ := LoadState(dir)
	if st.Generation != "g2" {
		t.Errorf("generation %q", st.Generation)
	}
}
