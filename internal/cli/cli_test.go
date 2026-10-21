package cli

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/httpapi"
	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// fixedNow is "today" for every test: Saturday 2026-10-10, local time.
var fixedNow = time.Date(2026, 10, 10, 12, 0, 0, 0, time.Local)

const (
	ownerEmail    = "owner@example.com"
	ownerPassword = "correct horse battery"
)

// harness runs the real API in-process and drives the CLI through App.Main.
type harness struct {
	t          *testing.T
	db         *sql.DB
	srv        *httptest.Server
	configPath string
	env        map[string]string
	stdin      string
	tty        bool
	apiToken   string // a token minted directly through the API, for seeding
	// reqMu guards requests: every request the in-process server received.
	reqMu    sync.Mutex
	requests []string
}

// requestLog returns the requests received since the last call, as
// "METHOD /path", and clears it.
func (h *harness) requestLog() []string {
	h.reqMu.Lock()
	defer h.reqMu.Unlock()
	out := h.requests
	h.requests = nil
	return out
}

// writesIn filters a request log down to requests that are not GET.
func writesIn(log []string) []string {
	var out []string
	for _, r := range log {
		if !strings.HasPrefix(r, "GET ") {
			out = append(out, r)
		}
	}
	return out
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	cfg := config.Config{SessionTTL: time.Hour}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	h := httpapi.New(cfg, auth.NewService(db, cfg.SessionTTL, false), opsync.NewService(db), nil, log, "test")
	hs := &harness{t: t, db: db, configPath: filepath.Join(t.TempDir(), "cfg", "config.json"), env: map[string]string{}}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hs.reqMu.Lock()
		hs.requests = append(hs.requests, r.Method+" "+r.URL.Path)
		hs.reqMu.Unlock()
		h.ServeHTTP(w, r)
	}))
	t.Cleanup(srv.Close)
	hs.srv = srv

	// Owner setup through the API, then an admin token for seeding fixtures
	// (it also creates tokens, a credential route: route-authorization-policy).
	resp := hs.api("POST", "/api/v1/auth/register", map[string]string{"email": ownerEmail, "name": "Owner", "password": ownerPassword}, "")
	if resp.StatusCode != 201 {
		t.Fatalf("register: %d", resp.StatusCode)
	}
	var cookie string
	for _, c := range resp.Cookies() {
		if c.Name == "opentodo_session" {
			cookie = c.Value
		}
	}
	req, _ := http.NewRequest("POST", srv.URL+"/api/v1/tokens", strings.NewReader(`{"name":"seed","scope":"admin"}`))
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
	hs.apiToken = out.Secret
	return hs
}

// api performs a raw request with an optional bearer token.
func (h *harness) api(method, path string, body any, token string) *http.Response {
	h.t.Helper()
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, h.srv.URL+path, rd)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		h.t.Fatal(err)
	}
	return resp
}

func (h *harness) apiJSON(method, path string, body any) map[string]any {
	h.t.Helper()
	resp := h.api(method, path, body, h.apiToken)
	defer resp.Body.Close()
	var out map[string]any
	raw, _ := io.ReadAll(resp.Body)
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out)
	}
	if resp.StatusCode >= 300 {
		h.t.Fatalf("%s %s: %d %s", method, path, resp.StatusCode, raw)
	}
	return out
}

// put seeds an entity with a chosen id through the sync endpoint, so tests can
// rely on deterministic ids and prefixes.
func (h *harness) put(entity, id string, fields map[string]any) {
	h.t.Helper()
	ts := time.Now().UnixMilli()
	ops := []map[string]any{}
	if entity == "task" {
		if _, ok := fields["priority"]; !ok {
			fields["priority"] = 4
		}
	}
	if _, ok := fields["created_at"]; !ok {
		fields["created_at"] = ts
	}
	if _, ok := fields["position"]; !ok {
		fields["position"] = ts
	}
	n := 0
	for f, v := range fields {
		n++
		ops = append(ops, map[string]any{"id": id + "/" + f, "entity": entity, "entityId": id, "field": f, "value": v, "ts": ts, "device": "seed"})
	}
	h.apiJSON("POST", "/api/v1/sync", map[string]any{"device": "seed", "cursor": 0, "ops": ops})
}

// run executes one CLI invocation and returns exit code, stdout and stderr.
func (h *harness) run(args ...string) (int, string, string) {
	h.t.Helper()
	var out, errb bytes.Buffer
	a := &App{
		Stdin:      strings.NewReader(h.stdin),
		Stdout:     &out,
		Stderr:     &errb,
		ConfigPath: h.configPath,
		Getenv:     func(k string) string { return h.env[k] },
		Now:        func() time.Time { return fixedNow },
		Hostname:   "testbox",
		IsTerminal: func() bool { return h.tty },
	}
	code := a.Main(args)
	return code, out.String(), errb.String()
}

func (h *harness) mustRun(args ...string) string {
	h.t.Helper()
	code, out, errb := h.run(args...)
	if code != 0 {
		h.t.Fatalf("ot %s: exit %d\nstdout: %s\nstderr: %s", strings.Join(args, " "), code, out, errb)
	}
	return out
}

// login signs the harness in through the real login flow.
func (h *harness) login() {
	h.t.Helper()
	h.stdin = ownerPassword + "\n"
	h.mustRun("login", h.srv.URL, "--email", ownerEmail)
	h.stdin = ""
}

// loginAdmin signs in, then runs ot with the seed admin token: creating
// tokens is a credential route that a full token may not use
// (route-authorization-policy).
func (h *harness) loginAdmin() {
	h.t.Helper()
	h.login()
	h.setToken(h.apiToken)
}

func (h *harness) tokens() []map[string]any {
	h.t.Helper()
	out := h.apiJSON("GET", "/api/v1/tokens", nil)
	var list []map[string]any
	for _, t := range out["tokens"].([]any) {
		list = append(list, t.(map[string]any))
	}
	return list
}

func (h *harness) task(id string) map[string]any {
	h.t.Helper()
	resp := h.api("GET", "/api/v1/tasks/"+id, nil, h.apiToken)
	defer resp.Body.Close()
	if resp.StatusCode == 404 {
		return nil
	}
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return out
}

// seedViews creates the fixture used by the list, ref and golden tests.
func (h *harness) seedViews() {
	h.put("project", "home0001", map[string]any{"name": "Home", "color": "#10b981", "archived": false})
	h.put("project", "attic001", map[string]any{"name": "Attic", "color": "#64748b", "archived": true})
	h.put("task", "rent0001", map[string]any{"title": "Pay rent", "priority": 2, "project_id": "home0001", "due": map[string]any{"date": "2026-10-08"}, "position": 5})
	h.put("task", "plum0001", map[string]any{"title": "Call the plumber", "priority": 1, "due": map[string]any{"date": "2026-10-10", "time": "09:00"}, "position": 4})
	h.put("task", "plant001", map[string]any{"title": "Water plants", "project_id": "home0001", "due": map[string]any{"date": "2026-10-10"}, "position": 3})
	h.put("task", "dent0001", map[string]any{"title": "Dentist", "priority": 3, "due": map[string]any{"date": "2026-10-11", "time": "14:30"}, "position": 2})
	h.put("task", "book0001", map[string]any{"title": "Read a book", "position": 1})
	h.put("task", "done0001", map[string]any{"title": "Old thing", "due": map[string]any{"date": "2026-10-09"}, "completed_at": 1700000000000})
	h.put("task", "gone0001", map[string]any{"title": "Deleted thing", "deleted_at": 1700000000000})
	h.put("task", "loft0001", map[string]any{"title": "In the attic", "project_id": "attic001", "due": map[string]any{"date": "2026-10-10"}})
}

// TestInboxRule: a start date, past or future, and Someday schedule a task; a
// deadline alone does not (inbox-means-unplaced, cli-client "List tasks").
func TestInboxRule(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.put("task", "undated1", map[string]any{"title": "Undated", "position": 1})
	h.put("task", "dline001", map[string]any{"title": "Deadline only", "deadline": "2026-11-06", "position": 2})
	h.put("task", "start001", map[string]any{"title": "Starts later", "start": "2030-01-05", "position": 3})
	h.put("task", "start002", map[string]any{"title": "Started", "start": "2026-01-05", "position": 4})
	h.put("task", "some0001", map[string]any{"title": "Someday", "start": "someday", "position": 5})
	if got := idsOf(t, h.mustRun("inbox", "--json")); !equalStrings(got, []string{"undated1", "dline001"}) {
		t.Fatalf("ot inbox = %v", got)
	}
}

func idsOf(t *testing.T, jsonArray string) []string {
	t.Helper()
	var list []map[string]any
	if err := json.Unmarshal([]byte(jsonArray), &list); err != nil {
		t.Fatalf("not a JSON array: %v\n%s", err, jsonArray)
	}
	ids := make([]string, 0, len(list))
	for _, e := range list {
		ids = append(ids, e["id"].(string))
	}
	return ids
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// ---- 2. authentication ----

func TestLoginCreatesTokenAndDropsSession(t *testing.T) {
	h := newHarness(t)
	h.stdin = ownerPassword + "\n"
	code, out, errb := h.run("login", h.srv.URL, "--email", ownerEmail)
	if code != 0 {
		t.Fatalf("login exit %d: %s %s", code, out, errb)
	}
	if !strings.Contains(out, "Signed in to "+h.srv.URL+" as "+ownerEmail) || strings.Contains(out, "ot_") {
		t.Fatalf("login output = %q", out)
	}
	if strings.Contains(errb, ownerPassword) || strings.Contains(out, ownerPassword) {
		t.Fatal("password echoed")
	}

	var names []string
	for _, tk := range h.tokens() {
		names = append(names, tk["name"].(string))
	}
	if !strings.Contains(strings.Join(names, ","), "cli@testbox") {
		t.Fatalf("tokens after login = %v", names)
	}

	var sessions int
	if err := h.db.QueryRow("SELECT COUNT(*) FROM sessions").Scan(&sessions); err != nil {
		t.Fatal(err)
	}
	// The harness's own registration session remains; the CLI's must be gone.
	if sessions != 1 {
		t.Fatalf("sessions after login = %d, want 1 (only the test's own)", sessions)
	}

	raw, err := os.ReadFile(h.configPath)
	if err != nil {
		t.Fatal(err)
	}
	var cfg Config
	if err := json.Unmarshal(raw, &cfg); err != nil {
		t.Fatal(err)
	}
	p := cfg.Profiles["default"]
	if cfg.Default != "default" || p.URL != h.srv.URL || !strings.HasPrefix(p.Token, "ot_") {
		t.Fatalf("config = %+v", cfg)
	}

	// auth status reports the account and the token name, never the secret.
	out = h.mustRun("auth", "status")
	if !strings.Contains(out, ownerEmail) || !strings.Contains(out, "cli@testbox") || strings.Contains(out, p.Token) {
		t.Fatalf("auth status = %q", out)
	}
	out = h.mustRun("auth", "status", "--json")
	var st struct {
		User  user  `json:"user"`
		Token token `json:"token"`
	}
	if err := json.Unmarshal([]byte(out), &st); err != nil || st.User.Email != ownerEmail || st.Token.Name != "cli@testbox" {
		t.Fatalf("auth status --json = %q (%v)", out, err)
	}

	// logout revokes on the server and forgets locally.
	out = h.mustRun("auth", "logout", "--yes")
	if !strings.Contains(out, "Revoked token \"cli@testbox\"") {
		t.Fatalf("logout = %q", out)
	}
	for _, tk := range h.tokens() {
		if tk["name"] == "cli@testbox" {
			t.Fatal("token still present after logout")
		}
	}
	code, _, errb = h.run("list")
	if code != ExitUsage || !strings.Contains(errb, "not signed in") {
		t.Fatalf("after logout: exit %d %q", code, errb)
	}

	// set-token stores a token minted elsewhere.
	code, out, errb = h.run("auth", "set-token", h.apiToken)
	if code != 0 || !strings.Contains(out, ownerEmail) {
		t.Fatalf("set-token: %d %q %q", code, out, errb)
	}
	h.mustRun("list")
}

func TestAuthFailures(t *testing.T) {
	h := newHarness(t)

	// Wrong password: exit 3, server message, nothing stored.
	h.stdin = "not the password\n"
	code, out, errb := h.run("login", h.srv.URL, "--email", ownerEmail)
	if code != ExitAuth || !strings.Contains(errb, "invalid email or password") {
		t.Fatalf("wrong password: exit %d stdout %q stderr %q", code, out, errb)
	}
	if _, err := os.Stat(h.configPath); !os.IsNotExist(err) {
		t.Fatal("config written after failed login")
	}
	h.stdin = "not the password\n"
	code, out, _ = h.run("login", h.srv.URL, "--email", ownerEmail, "--json")
	var env struct {
		Error struct{ Code, Message string } `json:"error"`
	}
	if code != ExitAuth || json.Unmarshal([]byte(out), &env) != nil || env.Error.Code != "invalid_credentials" {
		t.Fatalf("wrong password --json: exit %d %q", code, out)
	}

	// Missing configuration: exit 2 with instructions.
	code, _, errb = h.run("list")
	if code != ExitUsage || !strings.Contains(errb, "ot login") || !strings.Contains(errb, "OPENTODO_URL") {
		t.Fatalf("no config: exit %d %q", code, errb)
	}

	// Revoked token: exit 3 and a hint to log in again.
	h.login()
	for _, tk := range h.tokens() {
		if tk["name"] == "cli@testbox" {
			h.apiJSON("DELETE", "/api/v1/tokens/"+tk["id"].(string), nil)
		}
	}
	code, _, errb = h.run("list")
	if code != ExitAuth || !strings.Contains(errb, "ot login") {
		t.Fatalf("revoked token: exit %d %q", code, errb)
	}
	code, out, _ = h.run("list", "--json")
	if code != ExitAuth || !strings.Contains(out, `"code":"unauthorized"`) {
		t.Fatalf("revoked token --json: exit %d %q", code, out)
	}
}

// ---- 3. tasks ----

func TestListFiltersAndOrdering(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.seedViews()

	cases := []struct {
		args []string
		want []string
	}{
		{[]string{"today", "--json"}, []string{"rent0001", "plum0001", "plant001"}},
		{[]string{"list", "--today", "--json"}, []string{"rent0001", "plum0001", "plant001"}},
		{[]string{"upcoming", "--json"}, []string{"dent0001"}},
		// Inbox leaves out planned tasks (inbox-means-unplaced): no project and not
		// scheduled, so dent0001 and plum0001 (dated, without a project) are not in it.
		{[]string{"inbox", "--json"}, []string{"book0001"}},
		{[]string{"list", "--inbox", "--json"}, []string{"book0001"}},
		{[]string{"list", "--project", "home", "--json"}, []string{"plant001", "rent0001"}},
		{[]string{"list", "--project", "attic001", "--json"}, []string{"loft0001"}},
		{[]string{"list", "--completed", "--json"}, []string{"done0001"}},
		{[]string{"list", "--json"}, []string{"rent0001", "plum0001", "plant001", "dent0001", "book0001"}},
		{[]string{"list", "--all", "--json"}, []string{"rent0001", "done0001", "plum0001", "plant001", "dent0001", "book0001"}},
		{[]string{"list", "--limit", "2", "--json"}, []string{"rent0001", "plum0001"}},
		// Completion range (completed-date-filters): done0001 was completed at 1700000000000.
		{[]string{"list", "--completed-after", "1699999999999", "--completed-before", "1700000000001", "--json"}, []string{"done0001"}},
		{[]string{"list", "--completed-after", "2023-11-14T22:13:20Z", "--json"}, []string{"done0001"}},
		{[]string{"list", "--completed", "--completed-before", "2023-11-14", "--json"}, []string{}},
		{[]string{"list", "--completed-after", "2023-11-15T00:00:00Z", "--json"}, []string{}},
		{[]string{"list", "--project", "home", "--completed-after", "2020-01-01", "--json"}, []string{}},
	}
	for _, c := range cases {
		out := h.mustRun(c.args...)
		if got := idsOf(t, out); !equalStrings(got, c.want) {
			t.Errorf("ot %s = %v, want %v", strings.Join(c.args, " "), got, c.want)
		}
	}

	// Human output: overdue first and marked.
	out := h.mustRun("today")
	lines := strings.Split(strings.TrimSpace(out), "\n")
	if len(lines) != 4 || !strings.Contains(lines[1], "Pay rent") || !strings.Contains(lines[1], "overdue") || !strings.Contains(lines[2], "09:00") {
		t.Fatalf("today table:\n%s", out)
	}
	if strings.Contains(out, "\x1b[") {
		t.Fatal("colour codes without a TTY")
	}

	// Unknown project lists the available names.
	code, _, errb := h.run("list", "--project", "Garage")
	if code != ExitUsage || !strings.Contains(errb, "Home") || !strings.Contains(errb, "Attic") {
		t.Fatalf("unknown project: exit %d %q", code, errb)
	}
	if code, _, errb = h.run("list", "--today", "--inbox"); code != ExitUsage || !strings.Contains(errb, "choose one") {
		t.Fatalf("two views: exit %d %q", code, errb)
	}
	if code, _, errb = h.run("list", "--completed-after", "lastweek"); code != ExitUsage || !strings.Contains(errb, "--completed-after") || !strings.Contains(errb, "YYYY-MM-DD") {
		t.Fatalf("bad completion date: exit %d %q", code, errb)
	}
	if code, _, errb = h.run("list", "--today", "--completed-after", "2026-10-01"); code != ExitUsage || !strings.Contains(errb, "--today") {
		t.Fatalf("range with --today: exit %d %q", code, errb)
	}
}

func TestTableGolden(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.seedViews()
	got := h.mustRun("today")
	want, err := os.ReadFile(filepath.Join("testdata", "today.golden"))
	if err != nil {
		t.Fatal(err)
	}
	if got != string(want) {
		t.Fatalf("table output differs from testdata/today.golden\n--- got ---\n%s--- want ---\n%s", got, want)
	}
}

func TestAddBuildsCorrectBody(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.put("project", "home0001", map[string]any{"name": "Home", "color": "#10b981", "archived": false})

	out := h.mustRun("add", "Call the plumber", "--project", "Home", "--due", "tomorrow", "--time", "09:00", "--priority", "2", "--label", "phone", "--label", "house", "--note", "ask about the boiler", "--json")
	var created task
	if err := json.Unmarshal([]byte(out), &created); err != nil {
		t.Fatalf("add --json = %q: %v", out, err)
	}
	if created.Title != "Call the plumber" || created.ProjectID == nil || *created.ProjectID != "home0001" || created.Priority != 2 ||
		created.Due == nil || created.Due.Date != "2026-10-11" || created.Due.Time == nil || *created.Due.Time != "09:00" ||
		len(created.Labels) != 2 || created.Description != "ask about the boiler" {
		t.Fatalf("created = %+v", created)
	}
	if h.task(created.ID) == nil {
		t.Fatal("task not on server")
	}

	// Plain output is just the id; flags may come before the title.
	out = h.mustRun("add", "--priority", "1", "Buy milk")
	id := strings.TrimSpace(out)
	srv := h.task(id)
	if srv == nil || srv["title"] != "Buy milk" || srv["priority"] != float64(1) || srv["due"] != nil {
		t.Fatalf("plain add: %q -> %v", out, srv)
	}

	// --time alone means today.
	out = h.mustRun("add", "Standup", "--time", "10:00", "--json")
	var standup task
	_ = json.Unmarshal([]byte(out), &standup)
	if standup.Due == nil || standup.Due.Date != "2026-10-10" || *standup.Due.Time != "10:00" {
		t.Fatalf("standup = %+v", standup.Due)
	}

	// edit: change, then clear.
	out = h.mustRun("edit", created.ID, "--priority", "3", "--due", "monday", "--json")
	var edited task
	_ = json.Unmarshal([]byte(out), &edited)
	if edited.Priority != 3 || edited.Due.Date != "2026-10-12" || edited.Due.Time == nil || *edited.Due.Time != "09:00" {
		t.Fatalf("edited = %+v %+v", edited, edited.Due)
	}
	out = h.mustRun("edit", created.ID, "--due", "none", "--project", "none", "--note", "", "--title", "Plumber", "--json")
	_ = json.Unmarshal([]byte(out), &edited)
	if edited.Due != nil || edited.ProjectID != nil || edited.Description != "" || edited.Title != "Plumber" {
		t.Fatalf("cleared = %+v", edited)
	}
	if code, _, errb := h.run("edit", created.ID); code != ExitUsage || !strings.Contains(errb, "nothing to change") {
		t.Fatalf("edit without flags: %d %q", code, errb)
	}
	if code, _, errb := h.run("edit", created.ID, "--time", "08:00"); code != ExitUsage || !strings.Contains(errb, "no due date") {
		t.Fatalf("time without date: %d %q", code, errb)
	}
}

func TestRefResolution(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.seedViews()

	// Unique prefix completes the task.
	out := h.mustRun("done", "plum")
	if !strings.Contains(out, "Call the plumber") {
		t.Fatalf("done = %q", out)
	}
	if h.task("plum0001")["completed_at"] == nil {
		t.Fatal("task not completed")
	}
	// Full id works even when it is also a prefix of nothing else; reopen clears.
	h.mustRun("reopen", "plum0001")
	if h.task("plum0001")["completed_at"] != nil {
		t.Fatal("task not reopened")
	}

	// Ambiguous prefix changes nothing and lists both candidates.
	code, _, errb := h.run("done", "pl")
	if code != ExitUsage || !strings.Contains(errb, "plum0001") || !strings.Contains(errb, "plant001") {
		t.Fatalf("ambiguous: exit %d %q", code, errb)
	}
	if h.task("plant001")["completed_at"] != nil || h.task("plum0001")["completed_at"] != nil {
		t.Fatal("ambiguous ref changed something")
	}

	// Several refs: all resolved before anything changes.
	code, _, _ = h.run("done", "rent", "pl")
	if code != ExitUsage || h.task("rent0001")["completed_at"] != nil {
		t.Fatal("multi-ref with ambiguity must not change the unambiguous one")
	}
	out = h.mustRun("done", "rent", "dent", "--json")
	if got := idsOf(t, out); !equalStrings(got, []string{"rent0001", "dent0001"}) {
		t.Fatalf("done multi --json = %v", got)
	}

	// Deleted tasks are excluded from matching.
	code, _, errb = h.run("done", "gone")
	if code != ExitUsage || !strings.Contains(errb, "no task matches") {
		t.Fatalf("deleted ref: exit %d %q", code, errb)
	}
}

func TestRmPromptsOnlyOnTTY(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.seedViews()

	// On a terminal: prompt, "n" aborts.
	h.tty, h.stdin = true, "n\n"
	code, _, errb := h.run("rm", "book")
	if code != ExitUsage || !strings.Contains(errb, "[y/N]") || h.task("book0001") == nil {
		t.Fatalf("declined prompt: exit %d %q", code, errb)
	}
	// "y" deletes.
	h.stdin = "y\n"
	if code, _, errb = h.run("rm", "book"); code != 0 || h.task("book0001") != nil {
		t.Fatalf("accepted prompt: exit %d %q", code, errb)
	}
	// --yes skips the prompt.
	h.stdin = ""
	if code, _, errb = h.run("rm", "dent", "--yes"); code != 0 || strings.Contains(errb, "[y/N]") || h.task("dent0001") != nil {
		t.Fatalf("--yes: exit %d %q", code, errb)
	}
	// Not a terminal: no prompt, and without --yes nothing is deleted (exit 2).
	h.tty = false
	if code, _, errb = h.run("rm", "rent"); code != ExitUsage || strings.Contains(errb, "[y/N]") || !strings.Contains(errb, "--yes") || h.task("rent0001") == nil {
		t.Fatalf("non-tty without --yes: exit %d %q", code, errb)
	}
	if code, _, errb = h.run("rm", "rent", "--yes"); code != 0 || strings.Contains(errb, "[y/N]") || h.task("rent0001") != nil {
		t.Fatalf("non-tty with --yes: exit %d %q", code, errb)
	}
	// Soft delete: still in the export.
	var export struct {
		Tasks []map[string]any `json:"tasks"`
	}
	_ = json.Unmarshal([]byte(h.mustRun("export")), &export)
	found := false
	for _, tk := range export.Tasks {
		if tk["id"] == "rent0001" && tk["deleted_at"] != nil {
			found = true
		}
	}
	if !found {
		t.Fatal("deleted task missing from export")
	}
}

func TestLocalValidationExit2(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"tasks":[]}`))
	}))
	defer srv.Close()
	h := &harness{t: t, configPath: filepath.Join(t.TempDir(), "config.json"), env: map[string]string{"OPENTODO_URL": srv.URL, "OPENTODO_TOKEN": "ot_test"}}
	bad := [][]string{
		{"add", "x", "--priority", "7"},
		{"add", "x", "--priority", "0"},
		{"add", "x", "--time", "25:00"},
		{"add", "x", "--time", "9:00"},
		{"add", "x", "--due", "2026-13-45"},
		{"add", "x", "--due", "someday"},
		{"add", "x", "--due", "none"},
		{"add"},
		{"edit", "abc", "--priority", "9"},
		{"list", "--limit", "-1"},
		{"list", "--bogus"},
		{"done"},
		{"project", "frobnicate"},
	}
	for _, args := range bad {
		code, out, errb := h.run(args...)
		if code != ExitUsage {
			t.Errorf("ot %s: exit %d, want 2 (stdout %q stderr %q)", strings.Join(args, " "), code, out, errb)
		}
		if out != "" {
			t.Errorf("ot %s: wrote to stdout %q", strings.Join(args, " "), out)
		}
	}
	if calls != 0 {
		t.Fatalf("local validation made %d HTTP calls", calls)
	}
}

// ---- 4. projects, tokens, export ----

func TestProjectCommands(t *testing.T) {
	h := newHarness(t)
	h.login()

	id := strings.TrimSpace(h.mustRun("project", "add", "Garden"))
	out := h.mustRun("project", "list", "--json")
	var projects []map[string]any
	_ = json.Unmarshal([]byte(out), &projects)
	if len(projects) != 1 || projects[0]["id"] != id || projects[0]["name"] != "Garden" || projects[0]["color"] == "" {
		t.Fatalf("project list = %s", out)
	}
	if out = h.mustRun("project", "list"); !strings.Contains(out, "Garden") {
		t.Fatalf("project table = %q", out)
	}

	h.mustRun("project", "rename", "garden", "Back garden")
	h.mustRun("add", "Mow the lawn", "--project", "Back garden")
	if out = h.mustRun("list", "--project", id[:4]); !strings.Contains(out, "Mow the lawn") {
		t.Fatalf("project view = %q", out)
	}

	h.mustRun("project", "archive", "Back garden")
	if out = h.mustRun("project", "list"); strings.Contains(out, "Back garden") {
		t.Fatalf("archived project still listed: %q", out)
	}
	if out = h.mustRun("project", "list", "--all"); !strings.Contains(out, "archived") {
		t.Fatalf("--all hides archived: %q", out)
	}
	// Tasks of an archived project leave the cross-project views.
	if out = h.mustRun("list"); strings.Contains(out, "Mow the lawn") {
		t.Fatalf("archived project's task still in list: %q", out)
	}
	h.mustRun("project", "archive", id, "--undo")
	if out = h.mustRun("list"); !strings.Contains(out, "Mow the lawn") {
		t.Fatalf("restored project's task missing: %q", out)
	}

	code, _, errb := h.run("project", "rename", "nope", "x")
	if code != ExitUsage || !strings.Contains(errb, "Back garden") {
		t.Fatalf("rename unknown: %d %q", code, errb)
	}

	h.mustRun("project", "rm", id, "--yes")
	if out = h.mustRun("project", "list", "--all", "--json"); strings.TrimSpace(out) != "[]" {
		t.Fatalf("after rm = %q", out)
	}
	resp := h.api("GET", "/api/v1/projects/"+id, nil, h.apiToken)
	resp.Body.Close()
	if resp.StatusCode != 404 {
		t.Fatalf("project not deleted: %d", resp.StatusCode)
	}
}

func TestTokenAndExport(t *testing.T) {
	h := newHarness(t)
	h.loginAdmin()

	code, out, errb := h.run("token", "create", "backup-script")
	secret := strings.TrimSpace(out)
	if code != 0 || !strings.HasPrefix(secret, "ot_") || !strings.Contains(errb, "only once") {
		t.Fatalf("token create: %d %q %q", code, out, errb)
	}
	// The secret works as a bearer token.
	resp := h.api("GET", "/api/v1/me", nil, secret)
	resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("new token rejected: %d", resp.StatusCode)
	}

	out = h.mustRun("token", "list", "--json")
	var tokens []map[string]any
	_ = json.Unmarshal([]byte(out), &tokens)
	names := map[string]bool{}
	for _, tk := range tokens {
		names[tk["name"].(string)] = true
		if _, leaked := tk["secret"]; leaked {
			t.Fatal("token list leaks secrets")
		}
	}
	if !names["backup-script"] || !names["cli@testbox"] || !names["seed"] {
		t.Fatalf("token names = %v", names)
	}
	if out = h.mustRun("token", "list"); !strings.Contains(out, "backup-script") || !strings.Contains(out, "(this client)") {
		t.Fatalf("token table = %q", out)
	}

	out = h.mustRun("token", "create", "ci", "--json")
	var created map[string]any
	if err := json.Unmarshal([]byte(out), &created); err != nil || created["secret"] == nil || created["token"] == nil {
		t.Fatalf("token create --json = %q", out)
	}

	h.mustRun("token", "revoke", "backup-script", "--yes")
	resp = h.api("GET", "/api/v1/me", nil, secret)
	resp.Body.Close()
	if resp.StatusCode != 401 {
		t.Fatalf("revoked token still works: %d", resp.StatusCode)
	}
	if code, _, errb = h.run("token", "revoke", "nope", "--yes"); code != ExitUsage || !strings.Contains(errb, "no token") {
		t.Fatalf("revoke unknown: %d %q", code, errb)
	}

	h.mustRun("add", "Export me")
	out = h.mustRun("export")
	var export map[string]any
	if err := json.Unmarshal([]byte(out), &export); err != nil || export["format"] != "opentodo-export" || export["version"] != float64(1) {
		t.Fatalf("export = %q", out)
	}
	file := filepath.Join(t.TempDir(), "backup.json")
	if out = h.mustRun("export", "--out", file); !strings.Contains(out, file) {
		t.Fatalf("export --out = %q", out)
	}
	raw, err := os.ReadFile(file)
	if err != nil || !bytes.Contains(raw, []byte("Export me")) {
		t.Fatalf("export file: %v %s", err, raw)
	}
}

// ---- 5. output contract ----

func TestJSONOutputIsPureAPIShape(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.seedViews()

	out := h.mustRun("list", "--today", "--json")
	var fromCLI []map[string]any
	if err := json.Unmarshal([]byte(out), &fromCLI); err != nil {
		t.Fatalf("not JSON: %v\n%s", err, out)
	}
	if strings.Count(strings.TrimSpace(out), "\n") != 0 {
		t.Fatalf("stdout holds more than one JSON document:\n%s", out)
	}
	byID := map[string]map[string]any{}
	for _, e := range h.apiJSON("GET", "/api/v1/tasks", nil)["tasks"].([]any) {
		m := e.(map[string]any)
		byID[m["id"].(string)] = m
	}
	for _, e := range fromCLI {
		want := byID[e["id"].(string)]
		a, _ := json.Marshal(e)
		b, _ := json.Marshal(want)
		if string(a) != string(b) {
			t.Fatalf("CLI entity differs from API entity:\n%s\n%s", a, b)
		}
	}

	// Single entity for writes; nothing but JSON on stdout.
	out = h.mustRun("done", "plum", "--json")
	var one map[string]any
	if err := json.Unmarshal([]byte(out), &one); err != nil || one["id"] != "plum0001" || one["completed_at"] == nil {
		t.Fatalf("done --json = %q", out)
	}
	if one["status"] != "completed" || one["ref"] != "plum" {
		t.Fatalf("done --json lacks ref and status: %q", out)
	}
	out = h.mustRun("rm", "plant", "--json", "--yes")
	if err := json.Unmarshal([]byte(out), &one); err != nil || one["id"] != "plant001" || one["status"] != "deleted" {
		t.Fatalf("rm --json = %q", out)
	}
	out = h.mustRun("project", "add", "Garden", "--json")
	if err := json.Unmarshal([]byte(out), &one); err != nil || one["name"] != "Garden" {
		t.Fatalf("project add --json = %q", out)
	}

	// Errors in --json mode go to stdout as the envelope (with exit), and one
	// human line to stderr.
	code, out, errb := h.run("done", "d", "--json") // dent0001 and done0001
	var env struct {
		Error struct {
			Code, Message string
			Exit          int
		} `json:"error"`
	}
	if code != ExitUsage || !strings.HasPrefix(errb, "ot: ") || strings.Count(errb, "\n") != 1 || json.Unmarshal([]byte(out), &env) != nil || env.Error.Code != "usage" || env.Error.Exit != ExitUsage {
		t.Fatalf("json error: exit %d stdout %q stderr %q", code, out, errb)
	}

	// Colour appears only on a TTY without NO_COLOR.
	h.tty = true
	if out = h.mustRun("today"); !strings.Contains(out, "\x1b[") {
		t.Fatal("no colour on a TTY")
	}
	h.env["NO_COLOR"] = "1"
	if out = h.mustRun("today"); strings.Contains(out, "\x1b[") {
		t.Fatal("colour despite NO_COLOR")
	}
	delete(h.env, "NO_COLOR")
	h.tty = false
	if out = h.mustRun("today"); strings.Contains(out, "\x1b[") {
		t.Fatal("colour without a TTY")
	}
}

// task.labels holds label ids (OpenSpec `labels`): --label resolves names to ids,
// reuses an existing label ignoring case, and creates a missing one.
func TestLabelFlagResolvesNamesToIDs(t *testing.T) {
	h := newHarness(t)
	h.login()
	errand := h.apiJSON("POST", "/api/v1/labels", map[string]any{"name": "errand"})["id"].(string)

	id := strings.TrimSpace(h.mustRun("add", "Post parcel", "--label", "Errand", "--label", "phone", "--label", errand))
	srv := h.task(id)
	ids, _ := srv["labels"].([]any)
	if len(ids) != 2 || ids[0] != errand {
		t.Fatalf("labels = %v, want [%s <phone id>]", srv["labels"], errand)
	}
	labels := h.apiJSON("GET", "/api/v1/labels", nil)["labels"].([]any)
	if len(labels) != 2 {
		t.Fatalf("expected errand + newly created phone, got %v", labels)
	}
	phone := ids[1].(string)

	// edit replaces the list and reuses the label created above.
	h.mustRun("edit", id, "--label", "PHONE")
	if got := h.task(id)["labels"].([]any); len(got) != 1 || got[0] != phone {
		t.Fatalf("edited labels = %v, want [%s]", got, phone)
	}
	if n := len(h.apiJSON("GET", "/api/v1/labels", nil)["labels"].([]any)); n != 2 {
		t.Fatalf("edit created a duplicate label: %d labels", n)
	}
}

// TestTokenCreateNeedsAdminToken: the full token ot login stores cannot
// create tokens (route-authorization-policy); the error names the admin scope.
func TestTokenCreateNeedsAdminToken(t *testing.T) {
	h := newHarness(t)
	h.login()
	code, _, errb := h.run("token", "create", "minted")
	if code != ExitNotPermitted || !strings.Contains(errb, "admin API token") {
		t.Fatalf("token create with a full token: %d %q", code, errb)
	}
	// Everything else keeps working with it.
	h.mustRun("token", "list")
}

func TestTokenCreateScope(t *testing.T) {
	h := newHarness(t)
	h.loginAdmin()
	code, out, errb := h.run("token", "create", "desk-assistant", "--scope", "agent")
	if code != 0 || !strings.HasPrefix(strings.TrimSpace(out), "ot_") || !strings.Contains(errb, "scope agent") || !strings.Contains(errb, "both assistant switches") {
		t.Fatalf("agent token: %d %q %q", code, out, errb)
	}
	code, _, errb = h.run("token", "create", "reader", "--scope", "read")
	if code != 0 || !strings.Contains(errb, "scope read") {
		t.Fatalf("read token: %d %q", code, errb)
	}
	code, _, errb = h.run("token", "create", "x", "--scope", "admin")
	if code != ExitUsage || !strings.Contains(errb, "full, read, agent") {
		t.Fatalf("admin scope: %d %q", code, errb)
	}
	listed := h.mustRun("token", "list")
	if !strings.Contains(listed, "SCOPE") || !strings.Contains(listed, "agent") || !strings.Contains(listed, "read") || strings.Contains(listed, " x ") {
		t.Fatalf("token list = %q", listed)
	}
	out = h.mustRun("token", "list", "--json")
	var tokens []map[string]any
	_ = json.Unmarshal([]byte(out), &tokens)
	scopes := map[string]string{}
	for _, tk := range tokens {
		scopes[tk["name"].(string)], _ = tk["scope"].(string)
	}
	if scopes["desk-assistant"] != "agent" || scopes["reader"] != "read" || scopes["backup-script"] != "" {
		t.Fatalf("scopes = %v", scopes)
	}
	if _, ok := scopes["x"]; ok {
		t.Fatal("a token with an invalid scope was created")
	}
	// The default stays full.
	h.mustRun("token", "create", "plain")
	out = h.mustRun("token", "list", "--json")
	_ = json.Unmarshal([]byte(out), &tokens)
	for _, tk := range tokens {
		if tk["name"] == "plain" && tk["scope"] != "full" {
			t.Fatalf("default scope = %v", tk["scope"])
		}
	}
}

func TestAddRepeatAndRemind(t *testing.T) {
	h := newHarness(t)
	h.login()
	reminders := func(taskID string) []map[string]any {
		var out []map[string]any
		for _, r := range h.apiJSON("GET", "/api/v1/reminders", nil)["reminders"].([]any) {
			m := r.(map[string]any)
			if m["task_id"] == taskID && m["deleted_at"] == nil {
				out = append(out, m)
			}
		}
		return out
	}
	// A rule and two reminders, in order.
	id := strings.TrimSpace(h.mustRun("add", "Backup check", "--due", "monday", "--time", "09:00", "--repeat", "Every Week", "--remind", "30 min before", "--remind", "1 day before"))
	if tk := h.task(id); tk["recurrence"] != "every week" {
		t.Fatalf("task = %v", tk)
	}
	rs := reminders(id)
	if len(rs) != 2 || rs[0]["offset_minutes"] != float64(-30) || rs[1]["offset_minutes"] != float64(-1440) || rs[0]["kind"] != "relative" {
		t.Fatalf("reminders = %v", rs)
	}
	// An invalid rule never reaches the server.
	h.requestLog()
	if code, _, errb := h.run("add", "x", "--repeat", "every blursday"); code != ExitUsage || !strings.Contains(errb, "--repeat") || len(h.requestLog()) != 0 {
		t.Fatalf("invalid rule: %d %q", code, errb)
	}
	// Clear the rule; the due date stays.
	out := h.mustRun("edit", id, "--repeat", "none", "--json")
	var edited task
	_ = json.Unmarshal([]byte(out), &edited)
	if tk := h.task(id); tk["recurrence"] != nil || tk["due"] == nil {
		t.Fatalf("cleared = %v", tk)
	}
	// A reminder without a due waits for one, and says so.
	code, stdout, stderr := h.run("add", "Prepare slides", "--remind", "1 day before")
	if code != 0 || !strings.Contains(stderr, "once the task has a due date") {
		t.Fatalf("waiting reminder: %d %q %q", code, stdout, stderr)
	}
	waiting := reminders(strings.TrimSpace(stdout))
	if len(waiting) != 1 || waiting[0]["offset_minutes"] != float64(-1440) || waiting[0]["fire_at"] != nil {
		t.Fatalf("waiting = %v", waiting)
	}
	// An idempotent retry converges to one task and one reminder.
	var first, second map[string]any
	_ = json.Unmarshal([]byte(h.mustRun("add", "Flight", "--due", "2026-11-03", "--time", "06:00", "--remind", "1 day before", "--idempotency-key", "trip-flight", "--json")), &first)
	_ = json.Unmarshal([]byte(h.mustRun("add", "Flight", "--due", "2026-11-03", "--time", "06:00", "--remind", "1 day before", "--idempotency-key", "trip-flight", "--json")), &second)
	if first["id"] != second["id"] || len(reminders(first["id"].(string))) != 1 {
		t.Fatalf("retry: %v %v %v", first["id"], second["id"], reminders(first["id"].(string)))
	}
	// A bad reminder phrase is a usage error before any request.
	if code, _, errb := h.run("add", "x", "--remind", "whenever"); code != ExitUsage || !strings.Contains(errb, "--remind") {
		t.Fatalf("bad phrase: %d %q", code, errb)
	} // The server refuses the reminder (over a year) after creating the task: exit 1, the task id named.
	code, stdout, stderr = h.run("add", "Far away", "--due", "2026-11-03", "--remind", "60 weeks before")
	if code != ExitServer || !strings.Contains(stderr, "the task was created: ") {
		t.Fatalf("failed reminder: %d %q %q", code, stdout, stderr)
	}
}

func TestAddNatural(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.put("project", "home0001", map[string]any{"name": "Home", "color": "#10b981", "archived": false})
	// fixedNow is Saturday 2026-10-10 at 12:00.
	var created task
	_ = json.Unmarshal([]byte(h.mustRun("add", "--natural", "Water plants every Monday remind me at 8 #home", "--json")), &created)
	tk := h.task(created.ID)
	if tk["title"] != "Water plants" || tk["project_id"] != "home0001" || tk["recurrence"] != "every monday" || tk["due"].(map[string]any)["date"] != "2026-10-12" {
		t.Fatalf("natural = %v", tk)
	}
	var rs []map[string]any
	for _, r := range h.apiJSON("GET", "/api/v1/reminders", nil)["reminders"].([]any) {
		if m := r.(map[string]any); m["task_id"] == created.ID {
			rs = append(rs, m)
		}
	}
	if len(rs) != 1 || rs[0]["offset_minutes"] != float64(-60) {
		t.Fatalf("reminders = %v", rs)
	}
	// German, with an explicit language.
	_ = json.Unmarshal([]byte(h.mustRun("add", "--natural", "--lang", "de", "Zahnarzt nächsten Mittwoch um 15 Uhr erinnere mich 30 Minuten vorher", "--json")), &created)
	tk = h.task(created.ID)
	if tk["title"] != "Zahnarzt" || tk["due"].(map[string]any)["time"] != "15:00" {
		t.Fatalf("german = %v", tk)
	}
	// Ordinal weekday rule with "of the month" (quick-add-nth-weekday 3.3).
	_ = json.Unmarshal([]byte(h.mustRun("add", "--natural", "Board every 2nd Tuesday of the month at 10:00", "--json")), &created)
	tk = h.task(created.ID)
	if due, _ := tk["due"].(map[string]any); tk["title"] != "Board" || tk["recurrence"] != "every 2nd tuesday" || due["date"] != "2026-10-13" || due["time"] != "10:00" {
		t.Fatalf("ordinal weekday = %v", tk)
	}
	// Unknown project token stays in the title.
	_ = json.Unmarshal([]byte(h.mustRun("add", "--natural", "Read #nosuch tomorrow", "--json")), &created)
	tk = h.task(created.ID)
	if tk["title"] != "Read #nosuch" || tk["project_id"] != nil || tk["due"].(map[string]any)["date"] != "2026-10-11" {
		t.Fatalf("unknown project = %v", tk)
	}
	// Dry run: the reminder refers to the planned task.
	out := h.mustRun("add", "--natural", "Flight 3 Nov at 06:00 remind me 1 day before", "--dry-run", "--json")
	var plan struct {
		Requests []struct {
			Method, Path string
			Body         map[string]any
		} `json:"requests"`
	}
	_ = json.Unmarshal([]byte(out), &plan)
	if len(plan.Requests) != 2 || plan.Requests[0].Path != "/api/v1/tasks" || plan.Requests[1].Path != "/api/v1/reminders" || plan.Requests[1].Body["task_id"] != "(planned-1)" {
		t.Fatalf("plan = %s", out)
	}
}
