package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/pixari/opentodo/internal/issues"
)

// Issue connections over HTTP (OpenSpec change issue-import, tasks 4.1–4.6).
// The provider is an in-process fake GitHub API on loopback; nothing leaves
// the machine.

// fakeGitHub answers /api/v3/user and /api/v3/issues; status overrides every answer.
type fakeGitHub struct {
	srv    *httptest.Server
	hits   atomic.Int32
	status atomic.Int32
	issues []map[string]any
}

func newFakeGitHub(t *testing.T) *fakeGitHub {
	f := &fakeGitHub{}
	f.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.hits.Add(1)
		if s := f.status.Load(); s != 0 {
			w.WriteHeader(int(s))
			return
		}
		if r.Header.Get("Authorization") != "Bearer ghp_valid" {
			w.WriteHeader(401)
			return
		}
		switch r.URL.Path {
		case "/api/v3/user":
			fmt.Fprint(w, `{"login": "octo"}`)
		case "/api/v3/issues":
			if r.URL.Query().Get("per_page") == "1" {
				fmt.Fprint(w, `[]`)
				return
			}
			json.NewEncoder(w).Encode(f.issues)
		default:
			w.WriteHeader(404)
		}
	}))
	t.Cleanup(f.srv.Close)
	return f
}

func issuesOn(t *testing.T, e *env) {
	t.Helper()
	resp, out := e.do("PUT", "/api/v1/settings/issues", map[string]any{"enabled": true})
	e.mustStatus(resp, 200, out)
}

func allowPrivateTargets(t *testing.T, e *env) {
	t.Helper()
	yes := true
	if err := e.hooks.SeedAllowPrivate(context.Background(), &yes); err != nil {
		t.Fatal(err)
	}
}

func connOf(out map[string]any) map[string]any {
	c, _ := out["connection"].(map[string]any)
	return c
}

func TestIssuesSwitch(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("GET", "/api/v1/settings/issues", nil)
	e.mustStatus(resp, 200, out)
	if out["enabled"] != false {
		t.Fatalf("default = %v", out)
	}
	resp, out = e.do("GET", "/api/v1/issues/connections", nil)
	if resp.StatusCode != 404 || errCode(out) != "issues_disabled" {
		t.Fatalf("off = %d %v", resp.StatusCode, out)
	}
	m, _ := e.member("m@example.com", "198.51.100.30")
	resp, out = m.do("PUT", "/api/v1/settings/issues", map[string]any{"enabled": true})
	if resp.StatusCode != 403 || errCode(out) != "forbidden" {
		t.Fatalf("member put = %d %v", resp.StatusCode, out)
	}
	resp, out = m.do("GET", "/api/v1/settings/issues", nil)
	m.mustStatus(resp, 200, out)
	anon := newClientAt(e, "10.9.9.10")
	for _, p := range []string{"/api/v1/settings/issues", "/api/v1/issues/connections"} {
		if resp, out := anon.do("GET", p, nil); resp.StatusCode != 401 || errCode(out) != "unauthorized" {
			t.Fatalf("anonymous %s = %d %v", p, resp.StatusCode, out)
		}
	}
	issuesOn(t, e)
	resp, out = m.do("GET", "/api/v1/issues/connections", nil)
	m.mustStatus(resp, 200, out)
	var n int
	e.db.QueryRow(`SELECT COUNT(*) FROM audit_events WHERE name = 'settings.changed' AND details LIKE '%integrations.issues%'`).Scan(&n)
	if n != 1 {
		t.Fatalf("%d settings.changed events", n)
	}
}

func TestIssueConnectionLifecycle(t *testing.T) {
	e := ownerEnv(t)
	issuesOn(t, e)
	gh := newFakeGitHub(t)
	gh.issues = []map[string]any{{"number": 42, "title": "Fix login redirect", "body": "Details", "html_url": "https://github.com/acme/web/issues/42",
		"state": "open", "updated_at": "2026-10-01T09:00:00Z", "repository_url": gh.srv.URL + "/api/v3/repos/acme/web", "labels": []any{}}}
	body := map[string]any{"provider": "github", "host": gh.srv.URL, "token": "ghp_valid", "name": "Work"}
	// A loopback host is a private target until the owner allows them; http too.
	resp, out := e.do("POST", "/api/v1/issues/connections", body)
	if resp.StatusCode != 400 || gh.hits.Load() != 0 {
		t.Fatalf("private = %d %v", resp.StatusCode, out)
	}
	allowPrivateTargets(t, e)
	resp, out = e.do("POST", "/api/v1/issues/connections", body)
	e.mustStatus(resp, 201, out)
	c := connOf(out)
	id := c["id"].(string)
	raw, _ := json.Marshal(out)
	if strings.Contains(string(raw), "ghp_valid") || c["token_set"] != true || c["account_login"] != "octo" || c["can_read_issues"] != true {
		t.Fatalf("created = %s", raw)
	}
	// Token never returned, also not by the list; stored only in the secrets file.
	resp, out = e.do("GET", "/api/v1/issues/connections", nil)
	e.mustStatus(resp, 200, out)
	raw, _ = json.Marshal(out)
	if strings.Contains(string(raw), "ghp_valid") || !strings.Contains(string(raw), `"token_set":true`) {
		t.Fatalf("list = %s", raw)
	}
	var dbHit int
	e.db.QueryRow(`SELECT COUNT(*) FROM issue_connections WHERE filter LIKE '%ghp_%' OR host LIKE '%ghp_%' OR name LIKE '%ghp_%'`).Scan(&dbHit)
	if dbHit != 0 {
		t.Fatal("the token reached the database")
	}
	// Sync now creates the task.
	resp, out = e.do("POST", "/api/v1/issues/connections/"+id+"/sync", nil)
	e.mustStatus(resp, 200, out)
	if run := out["run"].(map[string]any); out["ok"] != true || run["created"].(float64) != 1 || connOf(out)["task_count"].(float64) != 1 {
		t.Fatalf("sync = %v", out)
	}
	resp, out = e.do("GET", "/api/v1/tasks", nil)
	e.mustStatus(resp, 200, out)
	if !strings.Contains(fmt.Sprint(out), "Fix login redirect") {
		t.Fatalf("tasks = %v", out)
	}
	// The MCP resource lists it without the token.
	if text := e.issuesResource(t); !strings.Contains(text, id) || strings.Contains(text, "ghp_valid") || !strings.Contains(text, `"token_set":true`) {
		t.Fatalf("resource = %s", text)
	}
	// Token check against a refused token.
	gh.status.Store(401)
	resp, out = e.do("POST", "/api/v1/issues/connections/"+id+"/test", nil)
	e.mustStatus(resp, 200, out)
	if out["ok"] != false || out["reason"] != issues.ReasonUnauthorized || connOf(out)["stopped_reason"] != issues.ReasonUnauthorized {
		t.Fatalf("refused check = %v", out)
	}
	// A stopped connection is not synced, and no request leaves the server.
	hits := gh.hits.Load()
	resp, out = e.do("POST", "/api/v1/issues/connections/"+id+"/sync", nil)
	if resp.StatusCode != 409 || errCode(out) != "connection_stopped" || gh.hits.Load() != hits {
		t.Fatalf("stopped sync = %d %v", resp.StatusCode, out)
	}
	// Replacing the token clears the stop and checks again.
	gh.status.Store(0)
	resp, out = e.do("PATCH", "/api/v1/issues/connections/"+id, map[string]any{"token": "ghp_valid"})
	e.mustStatus(resp, 200, out)
	if c := connOf(out); c["stopped_reason"] != "" || c["state"] == issues.StateStopped {
		t.Fatalf("after a new token = %v", c)
	}
	// Settings changes are audited by name, never by value.
	resp, out = e.do("PATCH", "/api/v1/issues/connections/"+id, map[string]any{"interval_minutes": 60, "name": "Job", "map_labels": true})
	e.mustStatus(resp, 200, out)
	resp, out = e.do("GET", "/api/v1/me/activity", nil)
	e.mustStatus(resp, 200, out)
	act, _ := json.Marshal(out)
	for _, want := range []string{"issue_connection.created", "issue_connection.updated", `"setting":"token"`, `"setting":"name,labels,interval"`} {
		if !strings.Contains(string(act), want) {
			t.Errorf("activity lacks %s: %s", want, act)
		}
	}
	if strings.Contains(string(act), "127.0.0.1") || strings.Contains(string(act), "ghp_") || strings.Contains(string(act), "Fix login") {
		t.Fatalf("activity carries a host, token or issue text: %s", act)
	}
	// Delete keeps the task and removes the token.
	resp, _ = e.do("DELETE", "/api/v1/issues/connections/"+id, nil)
	e.mustStatus(resp, 204, nil)
	resp, out = e.do("GET", "/api/v1/tasks", nil)
	e.mustStatus(resp, 200, out)
	if !strings.Contains(fmt.Sprint(out), "Fix login redirect") {
		t.Fatal("the task went with the connection")
	}
	sec, _ := os.ReadFile(issues.NewTokens(dataDirOf(e)).Path())
	if strings.Contains(string(sec), id) {
		t.Fatal("the token outlived the connection")
	}
}

// dataDirOf is the env's data directory (the database's temporary directory).
func dataDirOf(e *env) string {
	var file string
	_ = e.db.QueryRow(`SELECT file FROM pragma_database_list WHERE name = 'main'`).Scan(&file)
	return file[:strings.LastIndex(file, "/")]
}

// issuesResource reads opentodo://integrations/issues through /mcp with a read token.
func (e *env) issuesResource(t *testing.T) string {
	t.Helper()
	e.enableMCP(true)
	secret := e.token("read")
	r := e.bearerClient().rpc(secret, "resources/read", map[string]any{"uri": "opentodo://integrations/issues"})
	return r["result"].(map[string]any)["contents"].([]any)[0].(map[string]any)["text"].(string)
}

func TestIssueConnectionValidation(t *testing.T) {
	e := ownerEnv(t)
	issuesOn(t, e)
	allowPrivateTargets(t, e)
	gh := newFakeGitHub(t)
	base := func(over map[string]any) map[string]any {
		b := map[string]any{"provider": "github", "host": gh.srv.URL, "token": "ghp_valid"}
		for k, v := range over {
			b[k] = v
		}
		return b
	}
	repos21 := []string{}
	for i := range 21 {
		repos21 = append(repos21, fmt.Sprintf("acme/r%d", i))
	}
	field := func(out map[string]any) string {
		f, _ := out["error"].(map[string]any)["field"].(string)
		return f
	}
	for _, c := range []struct {
		over  map[string]any
		field string
	}{
		{map[string]any{"host": "ftp://example.com"}, "host"},
		{map[string]any{"host": ""}, "host"},
		{map[string]any{"host": "https://" + strings.Repeat("a", 2050) + ".com"}, "host"},
		{map[string]any{"interval_minutes": 5}, "interval_minutes"},
		{map[string]any{"provider": "jira"}, "provider"},
		{map[string]any{"token": ""}, "token"},
		{map[string]any{"project_id": "nope"}, "project_id"},
		{map[string]any{"filter": map[string]any{"scope": "repositories", "repositories": repos21}}, "repositories"},
	} {
		resp, out := e.do("POST", "/api/v1/issues/connections", base(c.over))
		if resp.StatusCode != 400 || errCode(out) != "invalid_input" || field(out) != c.field {
			t.Errorf("%v = %d %v", c.over, resp.StatusCode, out)
		}
	}
	// An archived project cannot be the target.
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Old", "archived": true})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("POST", "/api/v1/issues/connections", base(map[string]any{"project_id": out["id"]}))
	if resp.StatusCode != 400 || field(out) != "project_id" {
		t.Fatalf("archived project = %d %v", resp.StatusCode, out)
	}
	var n int
	e.db.QueryRow(`SELECT COUNT(*) FROM issue_connections`).Scan(&n)
	if n != 0 {
		t.Fatalf("%d stored after refusals", n)
	}
	// Name defaults to the host; at most five connections.
	resp, out = e.do("POST", "/api/v1/issues/connections", base(nil))
	e.mustStatus(resp, 201, out)
	if name := connOf(out)["name"].(string); !strings.HasPrefix(name, "127.0.0.1:") {
		t.Fatalf("default name = %q", name)
	}
	first := connOf(out)["id"].(string)
	for range 4 {
		resp, out = e.do("POST", "/api/v1/issues/connections", base(nil))
		e.mustStatus(resp, 201, out)
	}
	resp, out = e.do("POST", "/api/v1/issues/connections", base(nil))
	if resp.StatusCode != 409 || errCode(out) != "limit_reached" {
		t.Fatalf("sixth = %d %v", resp.StatusCode, out)
	}
	// Another account's id is not found.
	m, _ := e.member("m2@example.com", "198.51.100.31")
	for _, method := range []string{"PATCH", "DELETE"} {
		if resp, out := m.do(method, "/api/v1/issues/connections/"+first, map[string]any{}); resp.StatusCode != 404 || errCode(out) != "not_found" {
			t.Fatalf("foreign %s = %d %v", method, resp.StatusCode, out)
		}
	}
}

func TestIssueConnectionCredentials(t *testing.T) {
	e := ownerEnv(t)
	issuesOn(t, e)
	allowPrivateTargets(t, e)
	gh := newFakeGitHub(t)
	resp, out := e.do("POST", "/api/v1/issues/connections", map[string]any{"provider": "github", "host": gh.srv.URL, "token": "ghp_valid"})
	e.mustStatus(resp, 201, out)
	id := connOf(out)["id"].(string)
	// Read and agent tokens read but never write.
	c := e.bearerClient()
	for _, scope := range []string{"read", "agent"} {
		secret := e.token(scope)
		resp, out := c.do("GET", "/api/v1/issues/connections", nil, bearer(secret)...)
		c.mustStatus(resp, 200, out)
		for _, w := range []struct{ method, path string }{
			{"POST", "/api/v1/issues/connections"}, {"PATCH", "/api/v1/issues/connections/" + id}, {"DELETE", "/api/v1/issues/connections/" + id},
			{"POST", "/api/v1/issues/connections/" + id + "/test"}, {"POST", "/api/v1/issues/connections/" + id + "/sync"},
		} {
			if resp, out := c.do(w.method, w.path, map[string]any{}, bearer(secret)...); resp.StatusCode != 403 || errCode(out) != "insufficient_scope" {
				t.Fatalf("%s token %s %s = %d %v", scope, w.method, w.path, resp.StatusCode, out)
			}
		}
	}
	// A stale session cannot create a connection or replace a token, but may rename.
	e.staleSessions()
	resp, out = e.do("POST", "/api/v1/issues/connections", map[string]any{"provider": "github", "host": gh.srv.URL, "token": "ghp_valid"})
	if resp.StatusCode != 403 || errCode(out) != "reauth_required" {
		t.Fatalf("stale create = %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("PATCH", "/api/v1/issues/connections/"+id, map[string]any{"token": "ghp_other"})
	if resp.StatusCode != 403 || errCode(out) != "reauth_required" {
		t.Fatalf("stale token = %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("PATCH", "/api/v1/issues/connections/"+id, map[string]any{"name": "Renamed"})
	e.mustStatus(resp, 200, out)
	// Twelve checks and syncs an hour, then 429 without a request.
	for i := range 11 { // the create's check used one
		resp, out := e.do("POST", "/api/v1/issues/connections/"+id+"/test", nil)
		if resp.StatusCode != 200 {
			t.Fatalf("check %d = %d %v", i, resp.StatusCode, out)
		}
	}
	hits := gh.hits.Load()
	resp, out = e.do("POST", "/api/v1/issues/connections/"+id+"/sync", nil)
	if resp.StatusCode != 429 || errCode(out) != "rate_limited" || gh.hits.Load() != hits {
		t.Fatalf("thirteenth = %d %v", resp.StatusCode, out)
	}
}

func TestIssueConnectionsAndEncryption(t *testing.T) {
	e := ownerEnv(t)
	issuesOn(t, e)
	allowPrivateTargets(t, e)
	gh := newFakeGitHub(t)
	resp, out := e.do("POST", "/api/v1/issues/connections", map[string]any{"provider": "github", "host": gh.srv.URL, "token": "ghp_valid", "name": "Work"})
	e.mustStatus(resp, 201, out)
	id := connOf(out)["id"].(string)
	resp, out = e.do("PUT", "/api/v1/encryption/keys", keyRecord(1, 7))
	e.mustStatus(resp, 201, out)
	if fmt.Sprint(out["issueConnectionsStopped"]) != "[Work]" {
		t.Fatalf("encryption response = %v", out)
	}
	resp, out = e.do("GET", "/api/v1/issues/connections", nil)
	e.mustStatus(resp, 200, out)
	if c := out["connections"].([]any)[0].(map[string]any); c["stopped_reason"] != issues.ReasonEncrypted {
		t.Fatalf("connection = %v", c)
	}
	resp, out = e.do("POST", "/api/v1/issues/connections", map[string]any{"provider": "github", "host": gh.srv.URL, "token": "ghp_valid"})
	if resp.StatusCode != 409 || errCode(out) != "encryption_enabled" {
		t.Fatalf("encrypted create = %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("PATCH", "/api/v1/issues/connections/"+id, map[string]any{"enabled": true})
	if resp.StatusCode != 409 || errCode(out) != "encryption_enabled" {
		t.Fatalf("encrypted enable = %d %v", resp.StatusCode, out)
	}
}

func TestIssueConnectionsRefusedOnDemoBeforeAuth(t *testing.T) {
	d := newDemoServer(t)
	anon := d.anonymous()
	for _, c := range []struct{ method, path string }{
		{"POST", "/api/v1/issues/connections"}, {"GET", "/api/v1/settings/issues"}, {"PUT", "/api/v1/settings/issues"},
	} {
		if resp, out := anon.do(c.method, c.path, map[string]any{}); resp.StatusCode != 403 || errCode(out) != "demo_restricted" {
			t.Fatalf("%s %s = %d %v", c.method, c.path, resp.StatusCode, out)
		}
	}
	if demoRows(t, anon, `SELECT COUNT(*) FROM issue_connections`) != 0 {
		t.Fatal("stored on the demo")
	}
}
