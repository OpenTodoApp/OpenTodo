package cli

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// `ot issues` (OpenSpec change issue-import, task 6.1).

// seedIssueConnection turns the owner switch on and stores a connection of the
// owner directly (no token: the server's poll would stop it) and returns its id.
func (h *harness) seedIssueConnection() string {
	h.t.Helper()
	h.apiJSON("PUT", "/api/v1/settings/issues", map[string]any{"enabled": true})
	var uid string
	if err := h.db.QueryRow(`SELECT id FROM users WHERE role = 'owner'`).Scan(&uid); err != nil {
		h.t.Fatal(err)
	}
	id := "7f3a0000-0000-4000-8000-000000000001"
	if _, err := h.db.Exec(`INSERT INTO issue_connections(id,user_id,provider,host,name,interval_seconds,next_poll_at,created_at,updated_at)
		VALUES(?,?,'github','https://github.com','Work',1800,0,1,1)`, id, uid); err != nil {
		h.t.Fatal(err)
	}
	return id
}

func TestIssuesFeatureOff(t *testing.T) {
	h := newHarness(t)
	h.loginAdmin()
	code, _, errb := h.run("issues", "sync")
	if code != ExitNotPermitted || !strings.Contains(errb, "has not enabled issue connections") {
		t.Fatalf("feature off: exit %d %q", code, errb)
	}
	code, _, _ = h.run("issues", "list")
	if code != ExitNotPermitted {
		t.Fatalf("list off: exit %d", code)
	}
}

func TestIssuesListWithoutSecrets(t *testing.T) {
	h := newHarness(t)
	h.loginAdmin()
	id := h.seedIssueConnection()
	out := h.mustRun("issues", "list", "--json")
	var list []map[string]any
	if err := json.Unmarshal([]byte(out), &list); err != nil || len(list) != 1 {
		t.Fatalf("list = %q", out)
	}
	if list[0]["id"] != id || list[0]["token_set"] != false || list[0]["provider"] != "github" {
		t.Fatalf("connection = %v", list[0])
	}
	mustMatch(t, loadSchemas(t), "issues list", out, map[string]any{"type": "array", "items": loadSchemas(t)["issue_connection"]})
	table := h.mustRun("issues", "list")
	if !strings.Contains(table, "7f3a0000") || !strings.Contains(table, "Work") || !strings.Contains(table, "pending") {
		t.Fatalf("table = %q", table)
	}
	// Read-only mode refuses sync before any request.
	h.requestLog()
	if code, _, _ := h.run("issues", "sync", "--read-only"); code != ExitNotPermitted || len(h.requestLog()) != 0 {
		t.Fatalf("read-only: exit %d", code)
	}
}

// TestIssuesSyncOneConnection runs against a stand-in server: the counts line
// is what the command prints.
func TestIssuesSyncOneConnection(t *testing.T) {
	var synced []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/api/v1/me":
			fmt.Fprint(w, `{"user": {"id": "u1", "email": "a@b.c"}, "auth": {"kind": "token", "scope": "full"}}`)
		case r.URL.Path == "/api/v1/issues/connections":
			fmt.Fprint(w, `{"connections": [{"id": "7f3a1111-aaaa", "name": "Work", "provider": "github", "host": "https://github.com", "state": "ok", "enabled": true, "token_set": true},
				{"id": "9b2c2222-bbbb", "name": "Home", "provider": "gitlab", "host": "https://gitlab.com", "state": "ok", "enabled": true, "token_set": true}]}`)
		case r.Method == "POST" && strings.HasSuffix(r.URL.Path, "/sync"):
			synced = append(synced, r.URL.Path)
			fmt.Fprint(w, `{"ok": true, "run": {"created": 3, "completed": 1, "reopened": 0, "renamed": 2, "unlinked": 0, "partial": false}}`)
		default:
			w.WriteHeader(404)
		}
	}))
	defer srv.Close()
	h := newHarness(t)
	h.env["OPENTODO_URL"], h.env["OPENTODO_TOKEN"] = srv.URL, "ot_full"
	out := h.mustRun("issues", "sync", "7f3a")
	if strings.TrimSpace(out) != "created 3, completed 1, reopened 0, renamed 2" || len(synced) != 1 || synced[0] != "/api/v1/issues/connections/7f3a1111-aaaa/sync" {
		t.Fatalf("out = %q, synced %v", out, synced)
	}
	synced = nil
	out = h.mustRun("issues", "sync")
	if len(synced) != 2 || !strings.Contains(out, "Home: created 3") {
		t.Fatalf("every connection: %q %v", out, synced)
	}
}
