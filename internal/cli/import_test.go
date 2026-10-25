package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// `ot import` (OpenSpec change import-workspace, cli-client "Import command").

func writeTemp(t *testing.T, name, content string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(p, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestImportCommand(t *testing.T) {
	h := newHarness(t)
	h.loginAdmin()
	work := h.apiJSON("POST", "/api/v1/workspaces", map[string]any{"name": "Work"})["id"].(string)
	schemas := loadSchemas(t)
	file := writeTemp(t, "tasks.csv", "title,project\nShip it,Site\nInbox one,\n")

	// A dry run sends only the preview and prints it in the plan.
	h.requestLog()
	out := h.mustRun("import", file, "--workspace", "work", "--dry-run", "--json")
	mustMatch(t, schemas, "import --dry-run", out, schemas["dry_run"])
	var plan struct {
		Requests []plannedRequest
		Preview  struct {
			Totals struct{ Create, NewProjects int }
		}
	}
	if err := json.Unmarshal([]byte(out), &plan); err != nil || len(plan.Requests) != 1 || plan.Preview.Totals.NewProjects != 1 {
		t.Fatalf("dry run = %s", out)
	}
	if !strings.Contains(string(mustJSON(plan.Requests[0].Body)), work) {
		t.Fatalf("planned request names no workspace: %+v", plan.Requests[0])
	}
	if w := writesIn(h.requestLog()); len(w) != 0 {
		t.Fatalf("dry run sent writes: %v", w)
	}
	if n := len(h.apiJSON("GET", "/api/v1/projects", nil)["projects"].([]any)); n != 0 {
		t.Fatalf("dry run created %d projects", n)
	}

	// A real run waits for the job and prints it.
	out = h.mustRun("import", file, "--workspace", "Work", "--json")
	mustMatch(t, schemas, "import", out, schemas["import_job"])
	var job struct {
		Status  string
		Options map[string]any
	}
	if err := json.Unmarshal([]byte(out), &job); err != nil || job.Status != "done" || job.Options["workspace"] != work {
		t.Fatalf("import --json = %s", out)
	}
	for _, p := range h.apiJSON("GET", "/api/v1/projects", nil)["projects"].([]any) {
		if p.(map[string]any)["workspace_id"] != work {
			t.Fatalf("project not in Work: %v", p)
		}
	}
	// The human summary names the workspace; re-importing skips everything.
	if out := h.mustRun("import", file, "--workspace", "Work"); !strings.Contains(out, "into Work") || !strings.Contains(out, "0 created") {
		t.Fatalf("import = %q", out)
	}

	// Usage errors: an unknown workspace and a missing file send no file.
	h.requestLog()
	if code, _, errb := h.run("import", file, "--workspace", "Nowhere"); code != ExitUsage || !strings.Contains(errb, "Personal") {
		t.Fatalf("unknown workspace: %d %q", code, errb)
	}
	if code, _, errb := h.run("import", filepath.Join(t.TempDir(), "missing.csv")); code != ExitUsage || !strings.Contains(errb, "missing.csv") {
		t.Fatalf("missing file: %d %q", code, errb)
	}
	if w := writesIn(h.requestLog()); len(w) != 0 {
		t.Fatalf("refused imports sent: %v", w)
	}
}

func TestImportRefusedForAgentToken(t *testing.T) {
	h := newHarness(t)
	h.loginAdmin()
	_, secret := h.apiToken2("agent")
	h.setToken(secret)
	file := writeTemp(t, "tasks.csv", "title\nA\n")
	h.requestLog()
	code, out, _ := h.run("import", file, "--json")
	if code != ExitNotPermitted || !strings.Contains(out, "insufficient_scope") {
		t.Fatalf("agent token: %d %q", code, out)
	}
	if w := writesIn(h.requestLog()); len(w) != 0 {
		t.Fatalf("sent: %v", w)
	}
}

func mustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}
