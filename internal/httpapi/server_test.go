package httpapi

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"strings"
	gosync "sync"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
	"github.com/pixari/opentodo/internal/webhook"
)

type env struct {
	t       *testing.T
	srv     *httptest.Server
	client  *http.Client
	db      *sql.DB
	handler http.Handler
	sync    *opsync.Service
	// ip, when set, is sent as X-Forwarded-For so clients get separate rate-limit windows.
	ip string
	// hooks and clock drive the webhook worker deterministically.
	hooks *webhook.Service
	clock *testClock
}

func newEnv(t *testing.T, allowSignup bool) *env {
	t.Helper()
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	cfg := config.Config{SessionTTL: time.Hour, AllowSignup: allowSignup}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	syncSvc := opsync.NewService(db)
	clock := &testClock{t: time.UnixMilli(1_760_000_000_000)}
	hooks := webhook.New(db, syncSvc, webhook.Options{Version: "test", Log: log, Now: clock.Now, Rand: func() float64 { return 0.5 }})
	syncSvc.SetObserver(hooks.Observe)
	h := New(cfg, auth.NewService(db, cfg.SessionTTL, allowSignup), syncSvc, nil, log, "test", WithWebhooks(hooks))
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	// Open event streams would otherwise hold srv.Close; mirror main.go's shutdown hook.
	t.Cleanup(syncSvc.Notifier().CloseAll)
	jar, _ := cookiejar.New(nil)
	return &env{t: t, srv: srv, client: &http.Client{Jar: jar}, db: db, handler: h, sync: syncSvc, hooks: hooks, clock: clock}
}

// testClock is the injectable clock handed to the webhook worker.
type testClock struct {
	mu gosync.Mutex
	t  time.Time
}

func (c *testClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *testClock) Advance(d time.Duration) {
	c.mu.Lock()
	c.t = c.t.Add(d)
	c.mu.Unlock()
}

func (e *env) do(method, path string, body any, headers ...string) (*http.Response, map[string]any) {
	e.t.Helper()
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, e.srv.URL+path, rd)
	req.Header.Set("Content-Type", "application/json")
	if e.ip != "" {
		req.Header.Set("X-Forwarded-For", e.ip)
	}
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	resp, err := e.client.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer resp.Body.Close()
	var out map[string]any
	raw, _ := io.ReadAll(resp.Body)
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out)
	}
	return resp, out
}

func (e *env) mustStatus(resp *http.Response, want int, out map[string]any) {
	e.t.Helper()
	if resp.StatusCode != want {
		e.t.Fatalf("%s %s: status %d, want %d (%v)", resp.Request.Method, resp.Request.URL.Path, resp.StatusCode, want, out)
	}
}

func TestFirstRunSetupThenSignupClosed(t *testing.T) {
	e := newEnv(t, false)
	resp, out := e.do("GET", "/healthz", nil)
	e.mustStatus(resp, 200, out)

	resp, out = e.do("GET", "/api/v1/auth/status", nil)
	e.mustStatus(resp, 200, out)
	if out["setupRequired"] != true || out["signupAllowed"] != true || out["authenticated"] != false {
		t.Fatalf("status before setup = %v", out)
	}

	resp, out = e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "password": "short"})
	e.mustStatus(resp, 400, out)

	resp, out = e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	if out["user"].(map[string]any)["role"] != "owner" {
		t.Fatalf("first user should be owner: %v", out)
	}

	// Session cookie now authenticates.
	resp, out = e.do("GET", "/api/v1/me", nil)
	e.mustStatus(resp, 200, out)

	// Second account is refused while signup is closed.
	other := newClientFor(e)
	resp, out = other.do("POST", "/api/v1/auth/register", map[string]string{"email": "x@example.com", "password": "another long password"})
	other.mustStatus(resp, 403, out)
	resp, out = other.do("GET", "/api/v1/auth/status", nil)
	if out["setupRequired"] != false || out["signupAllowed"] != false {
		t.Fatalf("status after setup = %v", out)
	}

	// Wrong password, then right password.
	resp, out = other.do("POST", "/api/v1/auth/login", map[string]string{"email": "owner@example.com", "password": "nope nope nope"})
	other.mustStatus(resp, 401, out)
	resp, out = other.do("POST", "/api/v1/auth/login", map[string]string{"email": "OWNER@example.com", "password": "correct horse battery"})
	other.mustStatus(resp, 200, out)

	// Logout revokes the session.
	resp, out = other.do("POST", "/api/v1/auth/logout", nil)
	other.mustStatus(resp, 204, out)
	resp, out = other.do("GET", "/api/v1/me", nil)
	other.mustStatus(resp, 401, out)
}

func newClientFor(e *env) *env {
	jar, _ := cookiejar.New(nil)
	return &env{t: e.t, srv: e.srv, client: &http.Client{Jar: jar}, db: e.db}
}

// newClientAt is newClientFor with its own client address for rate limiting.
func newClientAt(e *env, ip string) *env {
	c := newClientFor(e)
	c.ip = ip
	return c
}

func TestUnauthenticatedIsRejected(t *testing.T) {
	e := newEnv(t, false)
	for _, p := range []string{"/api/v1/me", "/api/v1/tasks", "/api/v1/export"} {
		resp, out := e.do("GET", p, nil)
		e.mustStatus(resp, 401, out)
	}
	resp, out := e.do("POST", "/api/v1/sync", map[string]any{"device": "d", "cursor": 0})
	e.mustStatus(resp, 401, out)
	resp, out = e.do("GET", "/api/v1/nothing-here", nil)
	e.mustStatus(resp, 401, out)
}

func TestCrossSiteCookieWritesAreRejected(t *testing.T) {
	e := newEnv(t, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)

	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "evil"}, "Origin", "https://evil.example")
	e.mustStatus(resp, 403, out)

	u, _ := url.Parse(e.srv.URL)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "fine"}, "Origin", "http://"+u.Host)
	e.mustStatus(resp, 201, out)
}

func TestRestWriteThroughAndSyncRoundTrip(t *testing.T) {
	e := newEnv(t, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)

	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Home", "color": "#10b981"})
	e.mustStatus(resp, 201, out)
	projectID := out["id"].(string)

	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Buy milk", "project_id": projectID, "due": map[string]any{"date": "2026-10-11"}})
	e.mustStatus(resp, 201, out)
	taskID := out["id"].(string)
	if out["priority"] != float64(4) {
		t.Fatalf("default priority = %v", out["priority"])
	}

	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": 42})
	e.mustStatus(resp, 400, out)

	resp, out = e.do("PATCH", "/api/v1/tasks/"+taskID, map[string]any{"priority": 1, "completed_at": 1234})
	e.mustStatus(resp, 200, out)
	if out["priority"] != float64(1) {
		t.Fatalf("patched priority = %v", out["priority"])
	}

	// estimate_minutes (additive field) is accepted by PATCH, read back, and validated.
	resp, out = e.do("PATCH", "/api/v1/tasks/"+taskID, map[string]any{"estimate_minutes": 45})
	e.mustStatus(resp, 200, out)
	if out["estimate_minutes"] != float64(45) {
		t.Fatalf("patched estimate_minutes = %v", out["estimate_minutes"])
	}
	resp, out = e.do("GET", "/api/v1/tasks/"+taskID, nil)
	e.mustStatus(resp, 200, out)
	if out["estimate_minutes"] != float64(45) {
		t.Fatalf("estimate_minutes after read = %v", out["estimate_minutes"])
	}
	resp, out = e.do("PATCH", "/api/v1/tasks/"+taskID, map[string]any{"estimate_minutes": 0})
	e.mustStatus(resp, 400, out)
	// POST validates it too (a string is rejected and no task is created).
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Write report", "estimate_minutes": "30"})
	e.mustStatus(resp, 400, out)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+taskID, map[string]any{"estimate_minutes": nil})
	e.mustStatus(resp, 200, out)
	if out["estimate_minutes"] != nil {
		t.Fatalf("cleared estimate_minutes = %v", out["estimate_minutes"])
	}

	resp, out = e.do("GET", "/api/v1/tasks", nil)
	e.mustStatus(resp, 200, out)
	if n := len(out["tasks"].([]any)); n != 1 {
		t.Fatalf("tasks = %d", n)
	}

	// A device syncing from scratch receives every op, including REST-originated ones.
	resp, out = e.do("POST", "/api/v1/sync", map[string]any{"device": "phone", "cursor": 0, "ops": []any{}})
	e.mustStatus(resp, 200, out)
	ops := out["ops"].([]any)
	if len(ops) < 6 {
		t.Fatalf("expected ops for project and task fields, got %d", len(ops))
	}
	cursor := out["cursor"].(float64)

	// The device pushes an offline edit; it is reflected in REST reads and not echoed back.
	resp, out = e.do("POST", "/api/v1/sync", map[string]any{"device": "phone", "cursor": cursor, "ops": []any{
		map[string]any{"id": "phone-1", "entity": "task", "entityId": taskID, "field": "title", "value": "Buy oat milk", "ts": time.Now().UnixMilli() + 1, "device": "phone"},
	}})
	e.mustStatus(resp, 200, out)
	if out["applied"] != float64(1) || len(out["ops"].([]any)) != 0 {
		t.Fatalf("push response = %v", out)
	}
	resp, out = e.do("GET", "/api/v1/tasks/"+taskID, nil)
	e.mustStatus(resp, 200, out)
	if out["title"] != "Buy oat milk" {
		t.Fatalf("title after sync = %v", out["title"])
	}

	// Invalid ops are rejected as a batch.
	resp, out = e.do("POST", "/api/v1/sync", map[string]any{"device": "phone", "cursor": cursor, "ops": []any{
		map[string]any{"id": "phone-2", "entity": "task", "entityId": taskID, "field": "bogus", "value": 1, "ts": 5, "device": "phone"},
	}})
	e.mustStatus(resp, 400, out)

	// Delete is a tombstone: hidden from lists, present in export.
	resp, out = e.do("DELETE", "/api/v1/tasks/"+taskID, nil)
	e.mustStatus(resp, 204, out)
	resp, out = e.do("GET", "/api/v1/tasks/"+taskID, nil)
	e.mustStatus(resp, 404, out)
	resp, out = e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, 200, out)
	if len(out["tasks"].([]any)) != 1 || len(out["projects"].([]any)) != 1 {
		t.Fatalf("export = %v", out)
	}
}

func TestLabelsRequireAuth(t *testing.T) {
	e := newEnv(t, false)
	resp, out := e.do("GET", "/api/v1/labels", nil)
	e.mustStatus(resp, 401, out)
	resp, out = e.do("POST", "/api/v1/labels", map[string]any{"name": "errand"})
	e.mustStatus(resp, 401, out)
	if out["error"].(map[string]any)["code"] != "unauthorized" {
		t.Fatalf("error = %v", out)
	}
}

func TestLabelsCrud(t *testing.T) {
	e := newEnv(t, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)

	resp, out = e.do("POST", "/api/v1/labels", map[string]any{"name": "errand"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	if out["name"] != "errand" || out["color"] == nil || out["color"] == "" || out["position"] == nil || out["created_at"] == nil {
		t.Fatalf("created label = %v", out)
	}

	// Empty names and unknown fields are refused.
	resp, out = e.do("POST", "/api/v1/labels", map[string]any{"name": "  "})
	e.mustStatus(resp, 400, out)
	resp, out = e.do("POST", "/api/v1/labels", map[string]any{"name": "x", "archived": true})
	e.mustStatus(resp, 400, out)
	if out["error"].(map[string]any)["code"] != "invalid_input" {
		t.Fatalf("error = %v", out)
	}
	// Uniqueness is advisory: a duplicate name is accepted (devices may hold duplicates).
	resp, out = e.do("POST", "/api/v1/labels", map[string]any{"name": "Errand", "color": "#3b82f6"})
	e.mustStatus(resp, 201, out)
	dupID := out["id"].(string)

	resp, out = e.do("GET", "/api/v1/labels/"+id, nil)
	e.mustStatus(resp, 200, out)

	resp, out = e.do("PATCH", "/api/v1/labels/"+id, map[string]any{"name": "errands", "color": "#ec4899"})
	e.mustStatus(resp, 200, out)
	if out["name"] != "errands" || out["color"] != "#ec4899" {
		t.Fatalf("patched label = %v", out)
	}
	resp, out = e.do("PATCH", "/api/v1/labels/"+id, map[string]any{"name": ""})
	e.mustStatus(resp, 400, out)

	resp, out = e.do("GET", "/api/v1/labels", nil)
	e.mustStatus(resp, 200, out)
	if n := len(out["labels"].([]any)); n != 2 {
		t.Fatalf("labels = %d", n)
	}

	resp, out = e.do("DELETE", "/api/v1/labels/"+dupID, nil)
	e.mustStatus(resp, 204, out)
	resp, out = e.do("GET", "/api/v1/labels/"+dupID, nil)
	e.mustStatus(resp, 404, out)
	resp, out = e.do("GET", "/api/v1/labels", nil)
	if n := len(out["labels"].([]any)); n != 1 {
		t.Fatalf("labels after delete = %d", n)
	}
	resp, out = e.do("GET", "/api/v1/labels?include_deleted=true", nil)
	if n := len(out["labels"].([]any)); n != 2 {
		t.Fatalf("labels including deleted = %d", n)
	}
}

func TestTaskLabelsMustExist(t *testing.T) {
	e := newEnv(t, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("POST", "/api/v1/labels", map[string]any{"name": "errand"})
	e.mustStatus(resp, 201, out)
	labelID := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/labels", map[string]any{"name": "gone"})
	e.mustStatus(resp, 201, out)
	goneID := out["id"].(string)
	resp, out = e.do("DELETE", "/api/v1/labels/"+goneID, nil)
	e.mustStatus(resp, 204, out)

	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "x", "labels": []string{"nope"}})
	e.mustStatus(resp, 400, out)
	if out["error"].(map[string]any)["code"] != "invalid_input" {
		t.Fatalf("error = %v", out)
	}
	resp, out = e.do("GET", "/api/v1/tasks", nil)
	if n := len(out["tasks"].([]any)); n != 0 {
		t.Fatalf("rejected create left %d tasks", n)
	}

	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "x", "labels": []string{labelID}})
	e.mustStatus(resp, 201, out)
	taskID := out["id"].(string)

	for _, bad := range []any{[]string{"nope"}, []string{goneID}, []string{labelID, "nope"}} {
		resp, out = e.do("PATCH", "/api/v1/tasks/"+taskID, map[string]any{"labels": bad, "title": "changed"})
		e.mustStatus(resp, 400, out)
	}
	// Wrong types still fail schema validation with the same code.
	resp, out = e.do("PATCH", "/api/v1/tasks/"+taskID, map[string]any{"labels": "errand"})
	e.mustStatus(resp, 400, out)
	resp, out = e.do("GET", "/api/v1/tasks/"+taskID, nil)
	e.mustStatus(resp, 200, out)
	if out["title"] != "x" || len(out["labels"].([]any)) != 1 {
		t.Fatalf("task changed by rejected patch: %v", out)
	}
	resp, out = e.do("PATCH", "/api/v1/tasks/"+taskID, map[string]any{"labels": []string{}})
	e.mustStatus(resp, 200, out)
}

func TestExportIncludesLabels(t *testing.T) {
	e := newEnv(t, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("POST", "/api/v1/labels", map[string]any{"name": "errand"})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("POST", "/api/v1/labels", map[string]any{"name": "old"})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("DELETE", "/api/v1/labels/"+out["id"].(string), nil)
	e.mustStatus(resp, 204, out)

	resp, out = e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, 200, out)
	labels, ok := out["labels"].([]any)
	if !ok || len(labels) != 2 || out["version"] != float64(1) {
		t.Fatalf("export = %v", out)
	}
	deleted := 0
	for _, l := range labels {
		if l.(map[string]any)["deleted_at"] != nil {
			deleted++
		}
	}
	if deleted != 1 {
		t.Fatalf("export should keep the deleted label, got %d deleted", deleted)
	}
}

func TestApiTokens(t *testing.T) {
	e := newEnv(t, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("POST", "/api/v1/tokens", map[string]string{"name": "cli"})
	e.mustStatus(resp, 201, out)
	secret := out["secret"].(string)
	if !strings.HasPrefix(secret, "ot_") {
		t.Fatalf("secret = %q", secret)
	}
	tokenID := out["token"].(map[string]any)["id"].(string)

	bare := &env{t: t, srv: e.srv, client: &http.Client{}}
	resp, out = bare.do("GET", "/api/v1/me", nil, "Authorization", "Bearer "+secret)
	bare.mustStatus(resp, 200, out)
	// Token auth is not subject to the Origin check (no cookie involved).
	resp, out = bare.do("POST", "/api/v1/tasks", map[string]any{"title": "from cli"}, "Authorization", "Bearer "+secret, "Origin", "https://elsewhere.example")
	bare.mustStatus(resp, 201, out)
	resp, out = bare.do("GET", "/api/v1/me", nil, "Authorization", "Bearer ot_wrong")
	bare.mustStatus(resp, 401, out)

	resp, out = e.do("DELETE", "/api/v1/tokens/"+tokenID, nil)
	e.mustStatus(resp, 204, out)
	resp, out = bare.do("GET", "/api/v1/me", nil, "Authorization", "Bearer "+secret)
	bare.mustStatus(resp, 401, out)
}

func TestLoginRateLimit(t *testing.T) {
	e := newEnv(t, false)
	e.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "password": "correct horse battery"})
	other := newClientFor(e)
	var last int
	for i := 0; i < 12; i++ {
		resp, _ := other.do("POST", "/api/v1/auth/login", map[string]string{"email": "o@example.com", "password": "wrong password here"})
		last = resp.StatusCode
	}
	if last != http.StatusTooManyRequests {
		t.Fatalf("expected 429 after repeated failures, got %d", last)
	}
}

// subtaskEnv registers an owner and builds "Plan trip" > "Hotel" > "Compare prices" in one project.
func subtaskEnv(t *testing.T) (e *env, projectID, trip, hotel, compare string) {
	t.Helper()
	e = newEnv(t, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Travel", "color": "#10b981"})
	e.mustStatus(resp, 201, out)
	projectID = out["id"].(string)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Plan trip", "project_id": projectID})
	e.mustStatus(resp, 201, out)
	trip = out["id"].(string)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Hotel", "project_id": projectID, "parent_id": trip})
	e.mustStatus(resp, 201, out)
	hotel = out["id"].(string)
	if out["parent_id"] != trip {
		t.Fatalf("created parent_id = %v", out["parent_id"])
	}
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Compare prices", "project_id": projectID, "parent_id": hotel})
	e.mustStatus(resp, 201, out)
	compare = out["id"].(string)
	return e, projectID, trip, hotel, compare
}

func TestTaskParentRejectsCycle(t *testing.T) {
	e, _, trip, hotel, compare := subtaskEnv(t)
	for _, bad := range []string{hotel, compare, trip} {
		resp, out := e.do("PATCH", "/api/v1/tasks/"+trip, map[string]any{"parent_id": bad})
		e.mustStatus(resp, 400, out)
		if out["error"].(map[string]any)["code"] != "invalid_input" {
			t.Fatalf("error = %v", out)
		}
	}
	resp, out := e.do("GET", "/api/v1/tasks/"+trip, nil)
	e.mustStatus(resp, 200, out)
	if out["parent_id"] != nil {
		t.Fatalf("parent changed: %v", out["parent_id"])
	}
	// Unknown and deleted parents are refused too; a legal move is accepted.
	resp, out = e.do("PATCH", "/api/v1/tasks/"+compare, map[string]any{"parent_id": "nope"})
	e.mustStatus(resp, 400, out)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+compare, map[string]any{"parent_id": trip})
	e.mustStatus(resp, 200, out)
	if out["parent_id"] != trip {
		t.Fatalf("legal move: %v", out)
	}
	resp, out = e.do("DELETE", "/api/v1/tasks/"+hotel, nil)
	e.mustStatus(resp, 204, out)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+compare, map[string]any{"parent_id": hotel})
	e.mustStatus(resp, 400, out)
}

func TestTaskParentMustShareProject(t *testing.T) {
	e, projectID, trip, hotel, _ := subtaskEnv(t)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Inbox item"})
	e.mustStatus(resp, 201, out)
	inboxTask := out["id"].(string)

	resp, out = e.do("PATCH", "/api/v1/tasks/"+inboxTask, map[string]any{"parent_id": trip})
	e.mustStatus(resp, 400, out)
	if out["error"].(map[string]any)["code"] != "invalid_input" {
		t.Fatalf("error = %v", out)
	}
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Stray", "parent_id": trip})
	e.mustStatus(resp, 400, out)
	// Setting the project in the same patch satisfies the rule.
	resp, out = e.do("PATCH", "/api/v1/tasks/"+inboxTask, map[string]any{"parent_id": trip, "project_id": projectID})
	e.mustStatus(resp, 200, out)
	// Clearing the parent is always allowed.
	resp, out = e.do("PATCH", "/api/v1/tasks/"+hotel, map[string]any{"parent_id": nil})
	e.mustStatus(resp, 200, out)
	if out["parent_id"] != nil {
		t.Fatalf("cleared parent = %v", out["parent_id"])
	}
}

// projectTreeEnv registers an owner and builds "Work" > "Client A" > "Q4 launch" plus a top-level "Home".
func projectTreeEnv(t *testing.T) (e *env, work, clientA, q4, home string) {
	t.Helper()
	e = newEnv(t, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	create := func(name string, parent any) string {
		t.Helper()
		resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": name, "color": "#10b981", "parent_id": parent})
		e.mustStatus(resp, 201, out)
		if out["parent_id"] != parent {
			t.Fatalf("created %s parent_id = %v, want %v", name, out["parent_id"], parent)
		}
		return out["id"].(string)
	}
	work = create("Work", nil)
	clientA = create("Client A", work)
	q4 = create("Q4 launch", clientA)
	home = create("Home", nil)
	return e, work, clientA, q4, home
}

func TestProjectPatchRejectsCycle(t *testing.T) {
	e, work, clientA, q4, home := projectTreeEnv(t)
	for _, bad := range []string{work, clientA, q4} {
		resp, out := e.do("PATCH", "/api/v1/projects/"+work, map[string]any{"parent_id": bad})
		e.mustStatus(resp, 400, out)
		if out["error"].(map[string]any)["code"] != "invalid_input" {
			t.Fatalf("error = %v", out)
		}
	}
	resp, out := e.do("GET", "/api/v1/projects/"+work, nil)
	e.mustStatus(resp, 200, out)
	if out["parent_id"] != nil {
		t.Fatalf("parent changed: %v", out["parent_id"])
	}
	// Unknown parents are refused on patch and create; a legal move is accepted.
	resp, out = e.do("PATCH", "/api/v1/projects/"+q4, map[string]any{"parent_id": "nope"})
	e.mustStatus(resp, 400, out)
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Stray", "parent_id": "nope"})
	e.mustStatus(resp, 400, out)
	resp, out = e.do("PATCH", "/api/v1/projects/"+q4, map[string]any{"parent_id": home})
	e.mustStatus(resp, 200, out)
	if out["parent_id"] != home {
		t.Fatalf("legal move: %v", out)
	}
	// Clearing the parent is always allowed; a deleted parent is refused.
	resp, out = e.do("PATCH", "/api/v1/projects/"+q4, map[string]any{"parent_id": nil})
	e.mustStatus(resp, 200, out)
	if out["parent_id"] != nil {
		t.Fatalf("cleared parent = %v", out["parent_id"])
	}
	resp, out = e.do("DELETE", "/api/v1/projects/"+home, nil)
	e.mustStatus(resp, 204, out)
	resp, out = e.do("PATCH", "/api/v1/projects/"+q4, map[string]any{"parent_id": home})
	e.mustStatus(resp, 400, out)
}

// Back-to-back REST writes to one field must each take effect, even within a
// millisecond: they share device "server", so equal timestamps would tie.
func TestRapidPatchesAllApply(t *testing.T) {
	e, _, clientA, _, home := projectTreeEnv(t)
	for i := 0; i < 50; i++ {
		want := any(home)
		if i%2 == 1 {
			want = nil
		}
		resp, out := e.do("PATCH", "/api/v1/projects/"+clientA, map[string]any{"parent_id": want})
		e.mustStatus(resp, 200, out)
		if out["parent_id"] != want {
			t.Fatalf("patch %d: parent_id = %v, want %v", i, out["parent_id"], want)
		}
	}
}

func TestProjectPatchParentRequiresAuth(t *testing.T) {
	e, work, clientA, _, _ := projectTreeEnv(t)
	bare := &env{t: t, srv: e.srv, client: &http.Client{}}
	resp, out := bare.do("PATCH", "/api/v1/projects/"+clientA, map[string]any{"parent_id": nil})
	bare.mustStatus(resp, 401, out)
	if out["error"].(map[string]any)["code"] != "unauthorized" {
		t.Fatalf("error = %v", out)
	}
	resp, out = e.do("GET", "/api/v1/projects/"+clientA, nil)
	e.mustStatus(resp, 200, out)
	if out["parent_id"] != work {
		t.Fatalf("parent changed without auth: %v", out["parent_id"])
	}
}

func TestTaskParentRequiresAuth(t *testing.T) {
	e, _, trip, hotel, _ := subtaskEnv(t)
	bare := &env{t: t, srv: e.srv, client: &http.Client{}}
	resp, out := bare.do("PATCH", "/api/v1/tasks/"+hotel, map[string]any{"parent_id": nil})
	bare.mustStatus(resp, 401, out)
	if out["error"].(map[string]any)["code"] != "unauthorized" {
		t.Fatalf("error = %v", out)
	}
	resp, out = e.do("GET", "/api/v1/tasks/"+hotel, nil)
	e.mustStatus(resp, 200, out)
	if out["parent_id"] != trip {
		t.Fatalf("parent changed without auth: %v", out["parent_id"])
	}
}
