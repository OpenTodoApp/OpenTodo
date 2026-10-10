package httpapi

import (
	"bytes"
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
	t      *testing.T
	srv    *httptest.Server
	client *http.Client
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
	h := New(cfg, auth.NewService(db, cfg.SessionTTL, allowSignup), opsync.NewService(db), nil, log, "test")
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	jar, _ := cookiejar.New(nil)
	return &env{t: t, srv: srv, client: &http.Client{Jar: jar}}
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
	return &env{t: e.t, srv: e.srv, client: &http.Client{Jar: jar}}
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
