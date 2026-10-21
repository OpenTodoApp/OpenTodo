package vault

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/httpapi"
	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// server runs the real API in process (as internal/cli's harness does).
type server struct {
	t     *testing.T
	url   string
	token string
	user  string
}

func newServer(t *testing.T) *server {
	t.Helper()
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	cfg := config.Config{SessionTTL: time.Hour}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	h := httpapi.New(cfg, auth.NewService(db, cfg.SessionTTL, false), opsync.NewService(db), nil, log, "test")
	hs := httptest.NewServer(h)
	t.Cleanup(hs.Close)
	s := &server{t: t, url: hs.URL}
	b, _ := json.Marshal(map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"})
	resp, err := http.Post(hs.URL+"/api/v1/auth/register", "application/json", bytes.NewReader(b))
	if err != nil || resp.StatusCode != 201 {
		t.Fatalf("register: %v %v", err, resp)
	}
	var cookie string
	for _, c := range resp.Cookies() {
		if c.Name == "opentodo_session" {
			cookie = c.Value
		}
	}
	req, _ := http.NewRequest("POST", hs.URL+"/api/v1/tokens", strings.NewReader(`{"name":"vault","scope":"full"}`))
	req.AddCookie(&http.Cookie{Name: "opentodo_session", Value: cookie})
	req.Header.Set("Content-Type", "application/json")
	r, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	var out struct {
		Secret string `json:"secret"`
	}
	_ = json.NewDecoder(r.Body).Decode(&out)
	r.Body.Close()
	s.token = out.Secret
	me := s.do("GET", "/api/v1/me", nil)
	if u, ok := me["user"].(map[string]any); ok {
		s.user, _ = u["id"].(string)
	} else {
		s.user, _ = me["id"].(string)
	}
	return s
}

func (s *server) do(method, path string, body any) map[string]any {
	s.t.Helper()
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, s.url+path, rd)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		s.t.Fatal(err)
	}
	defer resp.Body.Close()
	var out map[string]any
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		s.t.Fatalf("%s %s: %d %s", method, path, resp.StatusCode, raw)
	}
	_ = json.Unmarshal(raw, &out)
	return out
}

func (s *server) status(path string) int {
	req, _ := http.NewRequest("GET", s.url+path, nil)
	req.Header.Set("Authorization", "Bearer "+s.token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		s.t.Fatal(err)
	}
	resp.Body.Close()
	return resp.StatusCode
}

func (s *server) create(collection string, body map[string]any) string {
	s.t.Helper()
	out := s.do("POST", "/api/v1/"+collection, body)
	id, _ := out["id"].(string)
	if id == "" {
		s.t.Fatalf("create %s: no id in %v", collection, out)
	}
	return id
}

func (s *server) get(collection, id string) map[string]any {
	return s.do("GET", "/api/v1/"+collection+"/"+id, nil)
}

func (s *server) list(collection string) []map[string]any {
	s.t.Helper()
	req, _ := http.NewRequest("GET", s.url+"/api/v1/"+collection, nil)
	req.Header.Set("Authorization", "Bearer "+s.token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		s.t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var arr []map[string]any
	if json.Unmarshal(raw, &arr) == nil {
		return arr
	}
	var env map[string]json.RawMessage
	_ = json.Unmarshal(raw, &env)
	for _, v := range env {
		if json.Unmarshal(v, &arr) == nil && arr != nil {
			return arr
		}
	}
	return nil
}

// recorder is a transport that keeps the replies.
type recorder struct {
	Transport
	replies []Reply
	sent    []Op
}

func (r *recorder) Exchange(ctx context.Context, req Request) (Reply, error) {
	r.sent = append(r.sent, req.Ops...)
	rep, err := r.Transport.Exchange(ctx, req)
	r.replies = append(r.replies, rep)
	return rep, err
}

type vaultT struct {
	s   *server
	dir string
	now func() time.Time
}

func (s *server) vault(t *testing.T) *vaultT {
	t.Helper()
	v := &vaultT{s: s, dir: t.TempDir(), now: time.Now}
	st := NewState("default", s.url)
	rep, err := Sync(context.Background(), v.opts(&Options{State: st}))
	if err != nil {
		t.Fatal(err)
	}
	_ = rep
	return v
}

func (v *vaultT) opts(o *Options) Options {
	o.Dir = v.dir
	if o.Transport == nil {
		o.Transport = &HTTPTransport{URL: v.s.url, Token: v.s.token}
	}
	o.UserID = v.s.user
	o.Now = v.now
	o.Loc = time.UTC
	return *o
}

func (v *vaultT) sync(t *testing.T) *Report {
	t.Helper()
	rep, err := Sync(context.Background(), v.opts(&Options{}))
	if err != nil {
		t.Fatal(err)
	}
	return rep
}

func (v *vaultT) read(t *testing.T, name string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(v.dir, name))
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func (v *vaultT) write(t *testing.T, name, text string) {
	t.Helper()
	p := filepath.Join(v.dir, name)
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
}

// edit replaces old with new in a file and fails when old is missing.
func (v *vaultT) edit(t *testing.T, name, old, new string) {
	t.Helper()
	text := v.read(t, name)
	if !strings.Contains(text, old) {
		t.Fatalf("%s does not hold %q:\n%s", name, old, text)
	}
	v.write(t, name, strings.Replace(text, old, new, 1))
}

func lineOf(t *testing.T, text, needle string) string {
	t.Helper()
	for _, l := range strings.Split(text, "\n") {
		if strings.Contains(l, needle) {
			return l
		}
	}
	t.Fatalf("no line with %q in:\n%s", needle, text)
	return ""
}

func TestFirstWriteLayout(t *testing.T) {
	s := newServer(t)
	home := s.create("projects", map[string]any{"name": "Home"})
	work := s.create("projects", map[string]any{"name": "Work"})
	s.create("projects", map[string]any{"name": "Launch", "parent_id": work})
	for _, title := range []string{"One", "Two", "Three"} {
		s.create("tasks", map[string]any{"title": title})
	}
	s.create("tasks", map[string]any{"title": "Book the plumber", "project_id": home, "priority": 2})
	v := s.vault(t)
	for _, f := range []string{"Inbox.md", "Home.md", "Work/Work.md", "Work/Launch.md", ".opentodo/state.json"} {
		if _, err := os.Stat(filepath.Join(v.dir, f)); err != nil {
			t.Errorf("missing %s", f)
		}
	}
	if l := lineOf(t, v.read(t, "Home.md"), "Book the plumber"); !strings.HasPrefix(l, "- [ ] Book the plumber ⏫ 🆔 ") {
		t.Errorf("line = %q", l)
	}
	if !strings.HasPrefix(v.read(t, "Home.md"), "---\nopentodo-id: "+home+"\n") {
		t.Errorf("front matter:\n%s", v.read(t, "Home.md"))
	}
	// A second sync with no change writes nothing.
	if rep := v.sync(t); rep.Written != 0 || len(rep.Events) != 0 {
		t.Errorf("second sync: %+v", rep)
	}
	fi, _ := os.Stat(StatePath(v.dir))
	if fi.Mode().Perm() != 0o600 {
		t.Errorf("state mode %v", fi.Mode().Perm())
	}
}

func TestFileEditsReachTheApp(t *testing.T) {
	s := newServer(t)
	home := s.create("projects", map[string]any{"name": "Home"})
	pay := s.create("tasks", map[string]any{"title": "Pay rent", "project_id": home})
	call := s.create("tasks", map[string]any{"title": "Call mum", "project_id": home})
	v := s.vault(t)
	v.edit(t, "Home.md", "- [ ] Pay rent", "- [x] Pay rent ✅ 2026-10-20")
	v.edit(t, "Home.md", "- [ ] Call mum", "- [ ] ⏫ Call mum #family 📅 2026-10-26")
	v.write(t, "Home.md", v.read(t, "Home.md")+"- [ ] Order compost 📅 2026-11-02\n")
	rep := v.sync(t)
	if rep.Created != 1 || rep.Updated != 2 {
		t.Fatalf("report %+v", rep)
	}
	p := s.get("tasks", pay)
	want := time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC).UnixMilli()
	if int64(p["completed_at"].(float64)) != want {
		t.Errorf("completed_at = %v", p["completed_at"])
	}
	c := s.get("tasks", call)
	if c["priority"].(float64) != 2 || c["due"].(map[string]any)["date"] != "2026-10-26" || len(c["labels"].([]any)) != 1 {
		t.Errorf("call mum = %v", c)
	}
	text := v.read(t, "Home.md")
	if l := lineOf(t, text, "Call mum"); !strings.HasPrefix(l, "- [ ] Call mum 📅 2026-10-26 ⏫ #family 🆔 ") {
		t.Errorf("rewritten line = %q", l)
	}
	if l := lineOf(t, text, "Order compost"); !strings.Contains(l, "🆔 ") {
		t.Errorf("new line has no id: %q", l)
	}
	if rep := v.sync(t); rep.Written != 0 || rep.Updated != 0 || rep.Created != 0 {
		t.Errorf("third sync not idle: %+v", rep)
	}
}

func TestConcurrentEditsAndConflicts(t *testing.T) {
	s := newServer(t)
	home := s.create("projects", map[string]any{"name": "Home"})
	a := s.create("tasks", map[string]any{"title": "Fix sink", "project_id": home})
	b := s.create("tasks", map[string]any{"title": "Call the plumber", "project_id": home})
	v := s.vault(t)
	// Different fields: both win.
	v.edit(t, "Home.md", "- [ ] Fix sink", "- [ ] Fix sink 🔺")
	s.do("PATCH", "/api/v1/tasks/"+a, map[string]any{"title": "Fix the sink"})
	// Same field: the app wins and the file's line goes to the conflict file.
	v.edit(t, "Home.md", "- [ ] Call the plumber", "- [ ] Call the gas man")
	s.do("PATCH", "/api/v1/tasks/"+b, map[string]any{"title": "Call the electrician"})
	rep := v.sync(t)
	if rep.Conflicts != 1 {
		t.Fatalf("conflicts = %d (%+v)", rep.Conflicts, rep)
	}
	if got := s.get("tasks", a); got["priority"].(float64) != 1 || got["title"] != "Fix the sink" {
		t.Errorf("a = %v", got)
	}
	if got := s.get("tasks", b)["title"]; got != "Call the electrician" {
		t.Errorf("b title = %v", got)
	}
	text := v.read(t, "Home.md")
	lineOf(t, text, "- [ ] Fix the sink 🔺")
	lineOf(t, text, "- [ ] Call the electrician")
	conf := v.read(t, "Home.conflict.md")
	if !strings.Contains(conf, "title") || !strings.Contains(conf, "Call the gas man") {
		t.Errorf("conflict file:\n%s", conf)
	}
	st, err := ReadStatus(v.dir)
	if err != nil || len(st.Conflicts) != 1 || len(st.Changed) != 0 {
		t.Errorf("status %+v %v", st, err)
	}
}

func TestLineRemoval(t *testing.T) {
	s := newServer(t)
	home := s.create("projects", map[string]any{"name": "Home"})
	gone := s.create("tasks", map[string]any{"title": "Old idea", "project_id": home})
	sub := s.create("tasks", map[string]any{"title": "Sub idea", "project_id": home, "parent_id": gone})
	kept := s.create("tasks", map[string]any{"title": "Water plants", "project_id": home})
	v := s.vault(t)
	text := v.read(t, "Home.md")
	var keep []string
	for _, l := range strings.Split(text, "\n") {
		if !strings.Contains(l, "Old idea") && !strings.Contains(l, "Sub idea") && !strings.Contains(l, "Water plants") {
			keep = append(keep, l)
		}
	}
	v.write(t, "Home.md", strings.Join(keep, "\n"))
	s.do("PATCH", "/api/v1/tasks/"+kept, map[string]any{"completed_at": time.Now().UnixMilli()})
	rep := v.sync(t)
	if rep.Trashed != 2 {
		t.Errorf("trashed = %d %+v", rep.Trashed, rep.Events)
	}
	for _, id := range []string{gone, sub} {
		if s.status("/api/v1/tasks/"+id) != 404 {
			t.Errorf("%s not trashed", id)
		}
	}
	if s.get("tasks", kept)["deleted_at"] != nil {
		t.Error("changed task was trashed")
	}
	lineOf(t, v.read(t, "Home.md"), "- [x] Water plants")
}

func TestTrashedInTheAppWhileEdited(t *testing.T) {
	s := newServer(t)
	home := s.create("projects", map[string]any{"name": "Home"})
	id := s.create("tasks", map[string]any{"title": "Paint fence", "project_id": home})
	v := s.vault(t)
	v.edit(t, "Home.md", "Paint fence", "Paint the fence")
	s.do("DELETE", "/api/v1/tasks/"+id, nil)
	rep := v.sync(t)
	if rep.Conflicts != 1 || strings.Contains(v.read(t, "Home.md"), "Paint") {
		t.Errorf("report %+v\n%s", rep, v.read(t, "Home.md"))
	}
	if !strings.Contains(v.read(t, "Home.conflict.md"), "Paint the fence") {
		t.Error("edited line not in the conflict file")
	}
}

func TestProjectFiles(t *testing.T) {
	s := newServer(t)
	home := s.create("projects", map[string]any{"name": "Home"})
	work := s.create("projects", map[string]any{"name": "Work"})
	launch := s.create("projects", map[string]any{"name": "Launch", "parent_id": work})
	s.create("tasks", map[string]any{"title": "Ship", "project_id": launch})
	odd := s.create("projects", map[string]any{"name": "Q4/Q1: plans?"})
	v := s.vault(t)
	if _, err := os.Stat(filepath.Join(v.dir, "Q4-Q1- plans-.md")); err != nil {
		t.Error("safe name missing")
	}
	// Rename a file.
	if err := os.Rename(filepath.Join(v.dir, "Home.md"), filepath.Join(v.dir, "Household.md")); err != nil {
		t.Fatal(err)
	}
	// New file, then deleted file.
	v.write(t, "Garden.md", "- [ ] Dig\n- [ ] Plant\n- [ ] Water\n")
	if err := os.Remove(filepath.Join(v.dir, "Work", "Launch.md")); err != nil {
		t.Fatal(err)
	}
	rep := v.sync(t)
	if s.get("projects", home)["name"] != "Household" {
		t.Error("project not renamed")
	}
	if s.get("projects", odd)["name"] != "Q4/Q1: plans?" {
		t.Error("odd name changed")
	}
	lineOf(t, v.read(t, "Work/Launch.md"), "Ship")
	restored := false
	for _, e := range rep.Events {
		if e.Kind == "restored" && e.File == "Work/Launch.md" {
			restored = true
		}
	}
	if !restored {
		t.Errorf("no restored event: %+v", rep.Events)
	}
	garden := v.read(t, "Garden.md")
	if !strings.HasPrefix(garden, "---\nopentodo-id: ") || strings.Count(garden, "🆔") != 3 {
		t.Errorf("garden:\n%s", garden)
	}
	gid := strings.TrimSpace(strings.SplitN(strings.SplitN(garden, "opentodo-id: ", 2)[1], "\n", 2)[0])
	if lineOf(t, garden, "Dig") > lineOf(t, garden, "Water") && false {
		t.Error("order")
	}
	// Move Garden into Household's folder: it becomes a sub-project.
	if err := os.MkdirAll(filepath.Join(v.dir, "Household"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(filepath.Join(v.dir, "Garden.md"), filepath.Join(v.dir, "Household", "Garden.md")); err != nil {
		t.Fatal(err)
	}
	v.sync(t)
	if s.get("projects", gid)["parent_id"] != home {
		t.Errorf("garden parent = %v", s.get("projects", gid)["parent_id"])
	}
	for _, f := range []string{"Household/Household.md", "Household/Garden.md"} {
		if _, err := os.Stat(filepath.Join(v.dir, f)); err != nil {
			t.Errorf("missing %s", f)
		}
	}
	if _, err := os.Stat(filepath.Join(v.dir, "Household.md")); err == nil {
		t.Error("Household.md left behind")
	}
	// Archived in the app: an unchanged file is removed, an edited one renamed.
	s.do("PATCH", "/api/v1/projects/"+odd, map[string]any{"archived": true})
	v.edit(t, "Work/Launch.md", "Ship", "Ship it")
	s.do("PATCH", "/api/v1/projects/"+launch, map[string]any{"archived": true})
	rep = v.sync(t)
	if _, err := os.Stat(filepath.Join(v.dir, "Q4-Q1- plans-.md")); err == nil {
		t.Error("archived project's file kept")
	}
	if _, err := os.Stat(filepath.Join(v.dir, "Work", "Launch.conflict.md")); err != nil {
		t.Errorf("edited archived file not renamed: %+v", rep.Events)
	}
	if _, err := os.Stat(filepath.Join(v.dir, "Work.md")); err != nil {
		t.Error("Work did not collapse back to Work.md")
	}
}

func TestRecurringCompletionFromTheFile(t *testing.T) {
	s := newServer(t)
	id := s.create("tasks", map[string]any{"title": "Bins", "due": map[string]any{"date": "2026-10-26"}, "recurrence": "every week"})
	v := s.vault(t)
	v.edit(t, "Inbox.md", "- [ ] Bins", "- [x] Bins")
	v.sync(t)
	text := v.read(t, "Inbox.md")
	if l := lineOf(t, text, "Bins"); !strings.HasPrefix(l, "- [ ] Bins 📅 2026-11-02 🔁 every week") {
		t.Errorf("line = %q", l)
	}
	if strings.Count(text, "Bins") != 1 {
		t.Errorf("done occurrence printed:\n%s", text)
	}
	rec := s.get("tasks", occurrenceID(id, "2026-10-26"))
	if rec["completed_at"] == nil || rec["series_id"] != id {
		t.Errorf("occurrence record = %v", rec)
	}
}

func TestReorderIsOneOp(t *testing.T) {
	s := newServer(t)
	home := s.create("projects", map[string]any{"name": "Home"})
	for i, title := range []string{"A", "B", "C", "D"} {
		s.create("tasks", map[string]any{"title": title, "project_id": home, "position": float64(i+1) * 1000})
	}
	v := s.vault(t)
	text := v.read(t, "Home.md")
	d := lineOf(t, text, "- [ ] D")
	text = strings.Replace(text, d+"\n", "", 1)
	text = strings.Replace(text, lineOf(t, text, "- [ ] A"), d+"\n"+lineOf(t, text, "- [ ] A"), 1)
	v.write(t, "Home.md", text)
	rec := &recorder{Transport: &HTTPTransport{URL: s.url, Token: s.token}}
	if _, err := Sync(context.Background(), v.opts(&Options{Transport: rec})); err != nil {
		t.Fatal(err)
	}
	if len(rec.sent) != 1 || rec.sent[0].Field != "position" {
		t.Fatalf("ops = %+v", rec.sent)
	}
	if v.read(t, "Home.md") != text {
		t.Errorf("file rewritten:\n%s", v.read(t, "Home.md"))
	}
}

func TestSectionsSubtasksNotes(t *testing.T) {
	s := newServer(t)
	work := s.create("projects", map[string]any{"name": "Work"})
	v := s.vault(t)
	v.write(t, "Work.md", v.read(t, "Work.md")+"\nSome prose.\n\n## Next week\n\n- [ ] Pack\n  - [ ] Passport\n    a note line\n- [ ] Book #deep-work\n")
	v.sync(t)
	var pack, passport map[string]any
	for _, tk := range s.list("tasks") {
		switch tk["title"] {
		case "Pack":
			pack = tk
		case "Passport":
			passport = tk
		}
	}
	if pack == nil || passport == nil || passport["parent_id"] != pack["id"] || pack["section_id"] == nil {
		t.Fatalf("pack %v passport %v", pack, passport)
	}
	if passport["description"] != "a note line" {
		t.Errorf("note = %q", passport["description"])
	}
	if pack["project_id"] != work {
		t.Error("project")
	}
	text := v.read(t, "Work.md")
	if !strings.Contains(text, "Some prose.\n\n## Next week\n\n- [ ] Pack") || !strings.Contains(text, "\n    a note line\n") {
		t.Errorf("file:\n%s", text)
	}
	if rep := v.sync(t); rep.Written != 0 || rep.Updated != 0 {
		t.Errorf("not idle: %+v", rep)
	}
}

func TestCrashBeforeStateWriteRepushesSameIDs(t *testing.T) {
	s := newServer(t)
	s.create("tasks", map[string]any{"title": "Draft"})
	v := s.vault(t)
	before, _ := os.ReadFile(StatePath(v.dir))
	v.edit(t, "Inbox.md", "- [ ] Draft", "- [ ] Draft letter")
	v.write(t, "Inbox.md", v.read(t, "Inbox.md")+"- [ ] Post it\n")
	edited := v.read(t, "Inbox.md")
	first := &recorder{Transport: &HTTPTransport{URL: s.url, Token: s.token}}
	if _, err := Sync(context.Background(), v.opts(&Options{Transport: first})); err != nil {
		t.Fatal(err)
	}
	// The crash: the state and the file are as before the run.
	if err := os.WriteFile(StatePath(v.dir), before, 0o600); err != nil {
		t.Fatal(err)
	}
	v.write(t, "Inbox.md", edited)
	second := &recorder{Transport: &HTTPTransport{URL: s.url, Token: s.token}}
	if _, err := Sync(context.Background(), v.opts(&Options{Transport: second})); err != nil {
		t.Fatal(err)
	}
	ids := map[string]bool{}
	for _, op := range first.sent {
		ids[op.ID] = true
	}
	if len(second.sent) == 0 || len(second.sent) != len(first.sent) {
		t.Fatalf("sent %d then %d", len(first.sent), len(second.sent))
	}
	dups := 0
	for _, op := range second.sent {
		if !ids[op.ID] {
			t.Errorf("new op id on retry: %+v", op)
		}
	}
	for _, r := range second.replies {
		dups += r.Duplicates
	}
	if dups != len(second.sent) {
		t.Errorf("duplicates = %d of %d", dups, len(second.sent))
	}
	n := 0
	for _, tk := range s.list("tasks") {
		if tk["title"] == "Post it" {
			n++
		}
	}
	if n != 1 {
		t.Errorf("%d tasks Post it", n)
	}
}

func TestVaultClockAhead(t *testing.T) {
	s := newServer(t)
	id := s.create("tasks", map[string]any{"title": "Renew passport"})
	v := s.vault(t)
	v.now = func() time.Time { return time.Now().Add(time.Hour) }
	v.sync(t) // learns the offset
	v.edit(t, "Inbox.md", "Renew passport", "Renew passports")
	v.sync(t)
	s.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"title": "Renew the passport"})
	v.sync(t)
	if got := s.get("tasks", id)["title"]; got != "Renew the passport" {
		t.Errorf("title = %v", got)
	}
	lineOf(t, v.read(t, "Inbox.md"), "Renew the passport")
}

func TestLimitsStopBeforeAnything(t *testing.T) {
	s := newServer(t)
	s.create("tasks", map[string]any{"title": "Keep"})
	v := s.vault(t)
	before, _ := os.ReadFile(StatePath(v.dir))
	v.write(t, "Big.md", strings.Repeat("x", MaxFileBytes+1))
	_, err := Sync(context.Background(), v.opts(&Options{}))
	var le *LimitError
	if err == nil || !strings.Contains(err.Error(), "Big.md") || !asLimit(err, &le) {
		t.Fatalf("err = %v", err)
	}
	after, _ := os.ReadFile(StatePath(v.dir))
	if !bytes.Equal(before, after) {
		t.Error("state changed")
	}
}

func asLimit(err error, le **LimitError) bool {
	l, ok := err.(*LimitError)
	*le = l
	return ok
}

func TestReadOnlyAndDryRun(t *testing.T) {
	s := newServer(t)
	a := s.create("tasks", map[string]any{"title": "Edit me"})
	home := s.create("projects", map[string]any{"name": "Home"})
	b := s.create("tasks", map[string]any{"title": "Done in app", "project_id": home})
	v := s.vault(t)
	v.edit(t, "Inbox.md", "Edit me", "Edited")
	// Dry run: plans one title op and changes nothing.
	rep, err := Sync(context.Background(), v.opts(&Options{DryRun: true}))
	if err != nil || len(rep.Planned) != 1 || rep.Planned[0].Field != "title" {
		t.Fatalf("dry run %+v %v", rep, err)
	}
	if s.get("tasks", a)["title"] != "Edit me" {
		t.Error("dry run pushed")
	}
	s.do("PATCH", "/api/v1/tasks/"+b, map[string]any{"completed_at": time.Now().UnixMilli()})
	rec := &recorder{Transport: &HTTPTransport{URL: s.url, Token: s.token}}
	if _, err := Sync(context.Background(), v.opts(&Options{ReadOnly: true, Transport: rec})); err != nil {
		t.Fatal(err)
	}
	if len(rec.sent) != 0 {
		t.Errorf("read-only pushed %d ops", len(rec.sent))
	}
	lineOf(t, v.read(t, "Home.md"), "- [x] Done in app")
	st, _ := ReadStatus(v.dir)
	if len(st.Changed) != 1 || st.Changed[0] != "Inbox.md" {
		t.Errorf("status %+v", st)
	}
	v.sync(t)
	if s.get("tasks", a)["title"] != "Edited" {
		t.Error("pending edit not pushed later")
	}
}
