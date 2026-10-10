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
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
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
	h := New(cfg, auth.NewService(db, cfg.SessionTTL, allowSignup), syncSvc, nil, log, "test")
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	// Open event streams would otherwise hold srv.Close; mirror main.go's shutdown hook.
	t.Cleanup(syncSvc.Notifier().CloseAll)
	jar, _ := cookiejar.New(nil)
	return &env{t: t, srv: srv, client: &http.Client{Jar: jar}, db: db, handler: h, sync: syncSvc}
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
