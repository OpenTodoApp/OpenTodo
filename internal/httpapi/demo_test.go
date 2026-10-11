package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/demo"
	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// demoServer is a demo instance; visitors are envs with their own cookie jar
// and client address.
type demoServer struct {
	t    *testing.T
	base *env
	demo *demo.Service
	n    int
}

func newDemoServer(t *testing.T) *demoServer {
	t.Helper()
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	cfg := config.Config{SessionTTL: time.Hour, Demo: true}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	syncSvc := opsync.NewService(db)
	authSvc := auth.NewService(db, cfg.SessionTTL, false)
	d := demo.New(authSvc, syncSvc, log)
	if err := d.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	h := New(cfg, authSvc, syncSvc, http.NotFoundHandler(), log, "test", WithDemo(d))
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	t.Cleanup(syncSvc.Notifier().CloseAll)
	jar, _ := cookiejar.New(nil)
	return &demoServer{t: t, demo: d, base: &env{t: t, srv: srv, client: &http.Client{Jar: jar}, db: db, handler: h, sync: syncSvc}}
}

// anonymous returns a visitor without a session from a new address.
func (d *demoServer) anonymous() *env {
	d.n++
	jar, _ := cookiejar.New(nil)
	e := *d.base
	e.client = &http.Client{Jar: jar}
	e.ip = "203.0.113." + strconv.Itoa(d.n)
	return &e
}


// token reads a creation token from auth/status.
func token(e *env) string {
	e.t.Helper()
	resp, out := e.do("GET", "/api/v1/auth/status", nil)
	e.mustStatus(resp, http.StatusOK, out)
	d, _ := out["demo"].(map[string]any)
	tok, _ := d["token"].(string)
	if tok == "" {
		e.t.Fatalf("no demo token in %v", out)
	}
	return tok
}

// createSandbox posts for a sandbox as the sign-in page would.
func createSandbox(e *env, tok string) (*http.Response, map[string]any) {
	e.t.Helper()
	return e.do("POST", "/api/v1/demo/sandbox", map[string]string{"token": tok}, "Origin", e.srv.URL)
}

// visitor is a new visitor signed into a fresh sandbox.
func (d *demoServer) visitor() (*env, string) {
	e := d.anonymous()
	resp, out := createSandbox(e, token(e))
	e.mustStatus(resp, http.StatusCreated, out)
	u, _ := out["user"].(map[string]any)
	return e, u["id"].(string)
}

func demoRows(t *testing.T, e *env, q string, args ...any) int {
	t.Helper()
	var n int
	if err := e.db.QueryRow(q, args...).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func findProject(t *testing.T, e *env, name string) string {
	t.Helper()
	resp, out := e.do("GET", "/api/v1/projects", nil)
	e.mustStatus(resp, http.StatusOK, out)
	for _, p := range out["projects"].([]any) {
		if pm := p.(map[string]any); pm["name"] == name {
			return pm["id"].(string)
		}
	}
	t.Fatalf("project %q missing", name)
	return ""
}

func TestDemoStatusHasTokenNotCredentials(t *testing.T) {
	d := newDemoServer(t)
	e := d.anonymous()
	resp, out := e.do("GET", "/api/v1/auth/status", nil)
	e.mustStatus(resp, http.StatusOK, out)
	info, _ := out["demo"].(map[string]any)
	if info["token"] == "" || info["resetsAt"] == nil || info["email"] != nil || info["password"] != nil {
		t.Fatalf("demo = %v", info)
	}
	if h, _ := info["sandboxHours"].(map[string]any); h["idle"] != float64(2) || h["max"] != float64(24) {
		t.Fatalf("sandboxHours = %v", info["sandboxHours"])
	}
	if out["signupAllowed"] != false {
		t.Fatalf("signupAllowed = %v", out["signupAllowed"])
	}
	// No account can be signed into with a password: not the old public one.
	resp, out = e.do("POST", "/api/v1/auth/login", map[string]string{"email": "demo@example.com", "password": "opentodo-demo"})
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("old demo credentials: %d %v", resp.StatusCode, out)
	}
}

func TestSandboxCreation(t *testing.T) {
	d := newDemoServer(t)
	e := d.anonymous()
	tok := token(e)
	// Not from the page: no Origin, or another site.
	resp, out := e.do("POST", "/api/v1/demo/sandbox", map[string]string{"token": tok})
	if resp.StatusCode != http.StatusForbidden || errCode(out) != "bad_origin" {
		t.Fatalf("no origin: %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("POST", "/api/v1/demo/sandbox", map[string]string{"token": tok}, "Origin", "https://evil.example")
	if resp.StatusCode != http.StatusForbidden || errCode(out) != "bad_origin" {
		t.Fatalf("cross origin: %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("POST", "/api/v1/demo/sandbox", map[string]string{}, "Origin", e.srv.URL)
	if resp.StatusCode != http.StatusForbidden || errCode(out) != "demo_token" {
		t.Fatalf("no token: %d %v", resp.StatusCode, out)
	}
	if n := demoRows(t, e, `SELECT COUNT(*) FROM demo_sandboxes`); n != 0 {
		t.Fatalf("sandboxes after refusals = %d", n)
	}
	// A GET (a crawler or link preview) creates nothing.
	resp, _ = e.do("GET", "/api/v1/demo/sandbox", nil)
	if resp.StatusCode < 400 {
		t.Fatalf("GET sandbox: %d", resp.StatusCode)
	}

	resp, out = createSandbox(e, tok)
	e.mustStatus(resp, http.StatusCreated, out)
	u, _ := out["user"].(map[string]any)
	if u["role"] != "member" || !strings.HasSuffix(u["email"].(string), "@demo.invalid") {
		t.Fatalf("user = %v", u)
	}
	// Signed in with the seeded data and a sandbox row.
	resp, out = e.do("GET", "/api/v1/auth/status", nil)
	e.mustStatus(resp, http.StatusOK, out)
	if out["authenticated"] != true {
		t.Fatalf("not signed in: %v", out)
	}
	shared := findProject(t, e, "Home renovation")
	resp, out = e.do("GET", "/api/v1/projects/"+shared+"/members", nil)
	e.mustStatus(resp, http.StatusOK, out)
	if b, _ := json.Marshal(out); !strings.Contains(string(b), demo.CollaboratorName) {
		t.Fatalf("collaborator missing: %s", b)
	}
	if n := demoRows(t, e, `SELECT COUNT(*) FROM demo_sandboxes WHERE user_id = ?`, u["id"]); n != 1 {
		t.Fatal("sandbox row missing")
	}
	if n := demoRows(t, e, `SELECT COUNT(*) FROM demo_sandboxes WHERE addr_hash LIKE ?`, "%"+e.ip+"%"); n != 0 {
		t.Fatal("client address stored in clear")
	}
	// The collaborator has no session and cannot sign in.
	if n := demoRows(t, e, `SELECT COUNT(*) FROM sessions s JOIN demo_sandboxes d ON d.collaborator_id = s.user_id`); n != 0 {
		t.Fatal("collaborator has a session")
	}
}

func TestSandboxTokenSingleUse(t *testing.T) {
	d := newDemoServer(t)
	e := d.anonymous()
	tok := token(e)
	resp, out := createSandbox(e, tok)
	e.mustStatus(resp, http.StatusCreated, out)
	other := d.anonymous()
	resp, out = createSandbox(other, tok)
	if resp.StatusCode != http.StatusForbidden || errCode(out) != "demo_token" {
		t.Fatalf("reused token: %d %v", resp.StatusCode, out)
	}
	resp, out = createSandbox(other, tok[:len(tok)-2]+"AA")
	if resp.StatusCode != http.StatusForbidden || errCode(out) != "demo_token" {
		t.Fatalf("forged token: %d %v", resp.StatusCode, out)
	}
	if n := demoRows(t, e, `SELECT COUNT(*) FROM demo_sandboxes`); n != 1 {
		t.Fatalf("sandboxes = %d", n)
	}
}

func TestSandboxCreationLimits(t *testing.T) {
	d := newDemoServer(t)
	e := d.anonymous()
	for i := 0; i < demo.PerAddressPerHour; i++ {
		resp, out := createSandbox(e, token(e))
		e.mustStatus(resp, http.StatusCreated, out)
	}
	users := demoRows(t, e, `SELECT COUNT(*) FROM users`)
	resp, out := createSandbox(e, token(e))
	if resp.StatusCode != http.StatusTooManyRequests || errCode(out) != "rate_limited" {
		t.Fatalf("sixth sandbox: %d %v", resp.StatusCode, out)
	}
	if n := demoRows(t, e, `SELECT COUNT(*) FROM users`); n != users {
		t.Fatalf("accounts created by a refused request: %d -> %d", users, n)
	}
	// Another address is not affected.
	other := d.anonymous()
	resp, out = createSandbox(other, token(other))
	other.mustStatus(resp, http.StatusCreated, out)

	// Database size guard: above the threshold no new sandbox is created.
	d.demo.SetLimits(0, 1)
	third := d.anonymous()
	resp, out = createSandbox(third, token(third))
	if resp.StatusCode != http.StatusServiceUnavailable || errCode(out) != "demo_busy" {
		t.Fatalf("database full: %d %v", resp.StatusCode, out)
	}
}

func TestSandboxCapEvictsIdle(t *testing.T) {
	d := newDemoServer(t)
	d.demo.SetLimits(2, 0)
	first, firstID := d.visitor()
	_, secondID := d.visitor()
	third := d.anonymous()
	resp, out := createSandbox(third, token(third))
	if resp.StatusCode != http.StatusServiceUnavailable || errCode(out) != "demo_busy" {
		t.Fatalf("full demo: %d %v", resp.StatusCode, out)
	}
	if !strings.Contains(out["error"].(map[string]any)["message"].(string), "busy") {
		t.Fatalf("message: %v", out)
	}
	// The first visitor has been idle for 20 minutes: the newcomer takes its place.
	old := time.Now().Add(-20 * time.Minute).UnixMilli()
	if _, err := third.db.Exec(`UPDATE demo_sandboxes SET last_active_at = ? WHERE user_id = ?`, old, firstID); err != nil {
		t.Fatal(err)
	}
	resp, out = createSandbox(third, token(third))
	third.mustStatus(resp, http.StatusCreated, out)
	if n := demoRows(t, third, `SELECT COUNT(*) FROM users WHERE id = ?`, firstID); n != 0 {
		t.Fatal("idle sandbox not evicted")
	}
	if n := demoRows(t, third, `SELECT COUNT(*) FROM users WHERE id = ?`, secondID); n != 1 {
		t.Fatal("active sandbox evicted")
	}
	resp, out = first.do("GET", "/api/v1/tasks", nil)
	if resp.StatusCode != http.StatusUnauthorized || errCode(out) != "demo_expired" {
		t.Fatalf("evicted visitor: %d %v", resp.StatusCode, out)
	}
}

// pullAll returns every op and purge a visitor can pull from cursor 0, as JSON.
func pullAll(e *env) string {
	e.t.Helper()
	var all []string
	cursor := 0.0
	for {
		resp, out := e.do("POST", "/api/v1/sync", map[string]any{"device": "iso", "cursor": cursor, "ops": []any{}})
		e.mustStatus(resp, http.StatusOK, out)
		b, _ := json.Marshal(out)
		all = append(all, string(b))
		cursor, _ = out["cursor"].(float64)
		if out["hasMore"] != true {
			return strings.Join(all, "\n")
		}
	}
}

func TestSandboxIsolation(t *testing.T) {
	d := newDemoServer(t)
	a, aID := d.visitor()
	b, bID := d.visitor()
	const secret = "visitor-a-secret-graffiti"
	bNotes := demoRows(t, b, `SELECT COUNT(*) FROM notifications WHERE user_id = ?`, bID)

	// A writes a personal task, a comment on a shared task that tries to mention
	// B, and tries to involve B in every way it can.
	resp, out := a.do("POST", "/api/v1/tasks", map[string]any{"title": secret + " title"})
	a.mustStatus(resp, http.StatusCreated, out)
	taskID := out["id"].(string)
	shared := findProject(t, a, "Home renovation")
	resp, out = a.do("POST", "/api/v1/tasks", map[string]any{"title": secret + " shared", "project_id": shared})
	a.mustStatus(resp, http.StatusCreated, out)
	sharedTask := out["id"].(string)
	resp, out = a.do("POST", "/api/v1/tasks/"+sharedTask+"/comments", map[string]any{"body": secret + " comment", "mentions": []string{bID}})
	a.mustStatus(resp, http.StatusCreated, out)
	if m, _ := out["mentions"].([]any); len(m) != 0 {
		t.Fatalf("mention of another sandbox kept: %v", out["mentions"])
	}
	resp, out = a.do("PATCH", "/api/v1/tasks/"+sharedTask, map[string]any{"assignee_id": bID})
	if resp.StatusCode != http.StatusBadRequest || errCode(out) != "not_a_member" {
		t.Fatalf("assign to another sandbox: %d %v", resp.StatusCode, out)
	}
	resp, out = a.do("POST", "/api/v1/projects/"+shared+"/members", map[string]any{"email": "x@demo.invalid", "role": "editor"})
	if resp.StatusCode != http.StatusForbidden || errCode(out) != "demo_restricted" {
		t.Fatalf("add member: %d %v", resp.StatusCode, out)
	}
	// Sync can neither: an op that assigns to B is refused.
	resp, out = a.do("POST", "/api/v1/sync", map[string]any{"device": "a1", "cursor": 0, "ops": []any{map[string]any{
		"id": "op-assign", "entity": "task", "entityId": sharedTask, "field": "assignee_id", "value": bID, "ts": time.Now().UnixMilli(), "device": "a1"}}})
	a.mustStatus(resp, http.StatusOK, out)
	if rej, _ := out["rejected"].([]any); len(rej) != 1 {
		t.Fatalf("assignment via sync not refused: %v", out["rejected"])
	}

	// B sees none of it, whichever way it asks.
	for _, path := range []string{"/api/v1/tasks", "/api/v1/projects", "/api/v1/export", "/api/v1/notifications", "/api/v1/activity",
		"/api/v1/me/activity", "/api/v1/tasks?deleted=true"} {
		resp, out := b.do("GET", path, nil)
		raw, _ := json.Marshal(out)
		if strings.Contains(string(raw), secret) || strings.Contains(string(raw), aID) {
			t.Errorf("B reads A's data at %s (%d)", path, resp.StatusCode)
		}
	}
	for _, path := range []string{"/api/v1/tasks/" + taskID, "/api/v1/tasks/" + sharedTask, "/api/v1/tasks/" + sharedTask + "/comments",
		"/api/v1/tasks/" + sharedTask + "/activity", "/api/v1/projects/" + shared + "/activity", "/api/v1/tasks/" + taskID + "/history",
		"/api/v1/projects/" + shared + "/members", "/api/v1/projects/" + shared} {
		resp, out := b.do("GET", path, nil)
		raw, _ := json.Marshal(out)
		if resp.StatusCode < 400 || strings.Contains(string(raw), secret) {
			t.Errorf("B reads %s: %d %s", path, resp.StatusCode, raw)
		}
	}
	if pulled := pullAll(b); strings.Contains(pulled, secret) || strings.Contains(pulled, taskID) || strings.Contains(pulled, shared) {
		t.Error("B pulls A's ops")
	}
	if n := demoRows(t, b, `SELECT COUNT(*) FROM notifications WHERE user_id = ?`, bID); n != bNotes {
		t.Errorf("B got %d notifications from A", n-bNotes)
	}
	resp, _ = b.do("GET", "/api/v1/users", nil)
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("B lists accounts: %d", resp.StatusCode)
	}
	// B cannot write A's entities either: a REST edit is refused and a sync op
	// for A's task lands in B's own scope, never in A's.
	resp, _ = b.do("PATCH", "/api/v1/tasks/"+taskID, map[string]any{"title": "defaced"})
	if resp.StatusCode < 400 {
		t.Errorf("B edits A's task: %d", resp.StatusCode)
	}
	resp, out = b.do("POST", "/api/v1/sync", map[string]any{"device": "b1", "cursor": 0, "ops": []any{map[string]any{
		"id": "op-deface", "entity": "task", "entityId": taskID, "field": "title", "value": "defaced", "ts": time.Now().UnixMilli() + 1000, "device": "b1"}}})
	b.mustStatus(resp, http.StatusOK, out)
	resp, out = a.do("GET", "/api/v1/tasks/"+taskID, nil)
	a.mustStatus(resp, http.StatusOK, out)
	if out["title"] != secret+" title" {
		t.Fatalf("A's task changed by B: %v", out["title"])
	}
	// Nobody anonymous reads anything.
	anon := d.anonymous()
	for _, path := range []string{"/api/v1/tasks", "/api/v1/export", "/api/v1/tasks/" + taskID} {
		if resp, _ := anon.do("GET", path, nil); resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("anonymous %s: %d", path, resp.StatusCode)
		}
	}
}

func TestSandboxWriteBudget(t *testing.T) {
	d := newDemoServer(t)
	e, uid := d.visitor()
	// Near the hourly budget: a batch that would cross it is refused whole.
	if _, err := e.db.Exec(`UPDATE demo_sandboxes SET ops_hour_count = ? WHERE user_id = ?`, demo.OpsPerHour-2, uid); err != nil {
		t.Fatal(err)
	}
	ops := []any{}
	for i, title := range []string{"one", "two", "three"} {
		ops = append(ops, map[string]any{"id": "b" + title, "entity": "task", "entityId": "t" + title, "field": "title", "value": title,
			"ts": time.Now().UnixMilli() + int64(i), "device": "d1"})
	}
	before := demoRows(t, e, `SELECT COUNT(*) FROM ops`)
	resp, out := e.do("POST", "/api/v1/sync", map[string]any{"device": "d1", "cursor": 0, "ops": ops})
	if resp.StatusCode != http.StatusTooManyRequests || errCode(out) != "demo_limit" {
		t.Fatalf("sync over budget: %d %v", resp.StatusCode, out)
	}
	if n := demoRows(t, e, `SELECT COUNT(*) FROM ops`); n != before {
		t.Fatalf("ops applied despite the refusal: %d -> %d", before, n)
	}
	// Two more fit; REST writes count too.
	resp, out = e.do("POST", "/api/v1/sync", map[string]any{"device": "d1", "cursor": 0, "ops": ops[:1]})
	e.mustStatus(resp, http.StatusOK, out)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "x"})
	if resp.StatusCode != http.StatusTooManyRequests || errCode(out) != "demo_limit" {
		t.Fatalf("REST over budget: %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("POST", "/api/v1/tasks/tone/comments", map[string]any{"body": "hi"})
	if resp.StatusCode != http.StatusTooManyRequests || errCode(out) != "demo_limit" {
		t.Fatalf("comment over budget: %d %v", resp.StatusCode, out)
	}
	// A new hour opens the window again; the total budget still holds.
	if _, err := e.db.Exec(`UPDATE demo_sandboxes SET ops_hour_start = ?, ops_total = ? WHERE user_id = ?`,
		time.Now().Add(-61*time.Minute).UnixMilli(), demo.OpsTotal-1, uid); err != nil {
		t.Fatal(err)
	}
	resp, out = e.do("PATCH", "/api/v1/tasks/tone", map[string]any{"priority": 1})
	e.mustStatus(resp, http.StatusOK, out)
	resp, out = e.do("PATCH", "/api/v1/tasks/tone", map[string]any{"priority": 2})
	if resp.StatusCode != http.StatusTooManyRequests || errCode(out) != "demo_limit" || !strings.Contains(out["error"].(map[string]any)["message"].(string), "5000") {
		t.Fatalf("total budget: %d %v", resp.StatusCode, out)
	}
}

func TestDemoFieldSizes(t *testing.T) {
	d := newDemoServer(t)
	e, _ := d.visitor()
	big := strings.Repeat("x", demo.MaxTextBytes+1)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": big})
	if resp.StatusCode != http.StatusBadRequest || errCode(out) != "invalid_input" {
		t.Fatalf("long title: %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": strings.Repeat("x", demo.MaxTextBytes)})
	e.mustStatus(resp, http.StatusCreated, out)
	id := out["id"].(string)
	// Notes may be longer, up to 32 KB.
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"description": strings.Repeat("n", demo.MaxNotesBytes)})
	e.mustStatus(resp, http.StatusOK, out)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"description": strings.Repeat("n", demo.MaxNotesBytes+1)})
	if resp.StatusCode != http.StatusBadRequest || errCode(out) != "invalid_input" {
		t.Fatalf("long notes: %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": big})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("long project name: %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("POST", "/api/v1/tasks/"+id+"/comments", map[string]any{"body": big})
	if resp.StatusCode != http.StatusBadRequest || errCode(out) != "invalid_input" {
		t.Fatalf("long comment: %d %v", resp.StatusCode, out)
	}
	// Sync refuses the batch like any other size limit.
	resp, out = e.do("POST", "/api/v1/sync", map[string]any{"device": "d1", "cursor": 0, "ops": []any{map[string]any{
		"id": "big", "entity": "label", "entityId": "l1", "field": "name", "value": big, "ts": time.Now().UnixMilli(), "device": "d1"}}})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("long label via sync: %d %v", resp.StatusCode, out)
	}
}

func TestExpiredSessionGetsDemoExpired(t *testing.T) {
	d := newDemoServer(t)
	e, _ := d.visitor()
	resp, out := e.do("GET", "/api/v1/tasks", nil)
	e.mustStatus(resp, http.StatusOK, out)
	if err := d.demo.Reset(context.Background()); err != nil {
		t.Fatal(err)
	}
	for _, c := range []struct{ method, path string }{{"GET", "/api/v1/tasks"}, {"POST", "/api/v1/sync"}, {"GET", "/api/v1/sync/events"}} {
		resp, out := e.do(c.method, c.path, map[string]any{"device": "d", "cursor": 0, "ops": []any{}})
		if resp.StatusCode != http.StatusUnauthorized || errCode(out) != "demo_expired" {
			t.Errorf("%s %s: %d %v", c.method, c.path, resp.StatusCode, out)
		}
	}
	// The status says signed out (no error page) and hands out a new token.
	resp, out = e.do("GET", "/api/v1/auth/status", nil)
	e.mustStatus(resp, http.StatusOK, out)
	if out["authenticated"] != false || out["demo"] == nil {
		t.Fatalf("status after expiry: %v", out)
	}
	// Without any cookie it is the usual 401.
	resp, out = d.anonymous().do("GET", "/api/v1/tasks", nil)
	if resp.StatusCode != http.StatusUnauthorized || errCode(out) != "unauthorized" {
		t.Fatalf("anonymous: %d %v", resp.StatusCode, out)
	}
	// A new sandbox works in the same browser.
	resp, out = createSandbox(e, token(e))
	e.mustStatus(resp, http.StatusCreated, out)
}

func TestDemoRobotsHeader(t *testing.T) {
	d := newDemoServer(t)
	e := d.anonymous()
	for _, c := range []struct{ method, path string }{{"GET", "/"}, {"GET", "/inbox"}, {"GET", "/api/v1/auth/status"}, {"GET", "/api/v1/tasks"},
		{"POST", "/api/v1/tokens"}, {"GET", "/api/v1/nope"}, {"GET", "/healthz"}} {
		resp, _ := e.do(c.method, c.path, nil)
		if got := resp.Header.Get("X-Robots-Tag"); got != "noindex, nofollow" {
			t.Errorf("%s %s: X-Robots-Tag = %q", c.method, c.path, got)
		}
	}
	plain := newEnv(t, false)
	resp, _ := plain.do("GET", "/api/v1/auth/status", nil)
	if resp.Header.Get("X-Robots-Tag") != "" {
		t.Fatal("X-Robots-Tag without demo mode")
	}
}

func TestDemoRestrictedRoutes(t *testing.T) {
	d := newDemoServer(t)
	e, _ := d.visitor()
	shared := findProject(t, e, "Home renovation")
	cases := []struct{ method, path string }{
		{"POST", "/api/v1/auth/register"},
		{"POST", "/api/v1/invitations"},
		{"POST", "/api/v1/users/x/transfer-ownership"},
		{"DELETE", "/api/v1/users/x"},
		{"POST", "/api/v1/me/password"},
		{"POST", "/api/v1/tokens"},
		{"POST", "/api/v1/app-passwords"},
		{"PUT", "/api/v1/settings/caldav"},
		{"PUT", "/api/v1/settings/oidc"},
		{"PUT", "/api/v1/settings/mcp"},
		{"GET", "/mcp"},
		{"POST", "/mcp"},
		{"PROPFIND", "/dav/"},
		{"GET", "/.well-known/caldav"},
		{"POST", "/api/v1/backups/run"},
		{"PUT", "/api/v1/backups/settings"},
		{"POST", "/api/v1/webhooks"},
		{"PATCH", "/api/v1/email-inbox"},
		{"POST", "/api/v1/import"},
		{"POST", "/api/v1/import/preview"},
		{"PUT", "/api/v1/encryption/keys"},
		{"POST", "/api/v1/mfa/totp/enroll"},
		{"POST", "/api/v1/passkeys/register/options"},
		{"POST", "/api/v1/push/subscriptions"},
		{"GET", "/api/v1/auth/oidc/start"},
		{"POST", "/api/v1/projects/" + shared + "/members"},
		{"DELETE", "/api/v1/projects/" + shared + "/members/someone"},
		{"POST", "/api/v1/projects/" + shared + "/transfer"},
	}
	for _, c := range cases {
		resp, out := e.do(c.method, c.path, map[string]any{})
		if resp.StatusCode != http.StatusForbidden || errCode(out) != "demo_restricted" {
			t.Errorf("%s %s: %d %v", c.method, c.path, resp.StatusCode, out)
		}
	}

	// Everyday use still works: create, edit and delete a task, list members, sync.
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Try OpenTodo"})
	e.mustStatus(resp, http.StatusCreated, out)
	id, _ := out["id"].(string)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"priority": 1})
	e.mustStatus(resp, http.StatusOK, out)
	resp, out = e.do("DELETE", "/api/v1/tasks/"+id, nil)
	e.mustStatus(resp, http.StatusNoContent, out)
	resp, out = e.do("GET", "/api/v1/projects/"+shared+"/members", nil)
	e.mustStatus(resp, http.StatusOK, out)
	resp, out = e.do("POST", "/api/v1/sync", map[string]any{"device": "d1", "cursor": 0, "ops": []any{}})
	e.mustStatus(resp, http.StatusOK, out)
	resp, out = e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, http.StatusOK, out)
}

func TestDemoGuardOffByDefault(t *testing.T) {
	// Without demo mode the same routes reach their handlers (never demo_restricted).
	e := newEnv(t, false)
	resp, out := e.do("GET", "/api/v1/auth/status", nil)
	e.mustStatus(resp, http.StatusOK, out)
	if _, ok := out["demo"]; ok {
		t.Fatal("demo field present without demo mode")
	}
	resp, out = e.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "name": "O", "password": "correct horse battery"})
	e.mustStatus(resp, http.StatusCreated, out)
	resp, out = e.do("POST", "/api/v1/tokens", map[string]string{"name": "cli"})
	e.mustStatus(resp, http.StatusCreated, out)
	if demoRestricted("POST", "/api/v1/tasks") != "" || demoRestricted("GET", "/api/v1/settings/caldav") != "" ||
		demoRestricted("GET", "/api/v1/invitations/abc") != "" || demoRestricted("GET", "/api/v1/projects/p/members") != "" {
		t.Fatal("rule list refuses everyday routes")
	}
	// The sandbox route exists only in demo mode.
	users := demoRows(t, e, `SELECT COUNT(*) FROM users`)
	resp, _ = e.do("POST", "/api/v1/demo/sandbox", map[string]string{"token": "x"}, "Origin", e.srv.URL)
	if resp.StatusCode < 400 {
		t.Fatalf("sandbox route without demo mode: %d", resp.StatusCode)
	}
	if n := demoRows(t, e, `SELECT COUNT(*) FROM users`); n != users {
		t.Fatal("account created without demo mode")
	}
	// A stale cookie is the usual 401, never demo_expired.
	e.client.Jar.SetCookies(mustURL(e.srv.URL), []*http.Cookie{{Name: sessionCookie, Value: "gone", Path: "/"}})
	resp, out = e.do("GET", "/api/v1/tasks", nil)
	if resp.StatusCode != http.StatusUnauthorized || errCode(out) != "unauthorized" {
		t.Fatalf("stale cookie: %d %v", resp.StatusCode, out)
	}
}
