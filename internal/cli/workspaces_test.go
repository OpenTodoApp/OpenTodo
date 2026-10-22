package cli

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

// Workspaces in the CLI (OpenSpec change workspaces, task 4.4).
func TestWorkspaceForOneCommand(t *testing.T) {
	h := newHarness(t)
	h.loginAdmin()
	h.seedViews()
	h.apiJSON("POST", "/api/v1/workspaces", map[string]any{"name": "Work"})

	id := strings.TrimSpace(h.mustRun("add", "Call the client", "--workspace", "work"))
	if got := h.task(id)["workspace_id"]; got == nil || got == "" {
		t.Fatalf("task workspace_id = %v", got)
	}
	inWork := h.mustRun("list", "--workspace", "Work")
	if !strings.Contains(inWork, "Call the client") || strings.Contains(inWork, "Call the plumber") {
		t.Fatalf("ot list --workspace Work =\n%s", inWork)
	}
	if def := h.mustRun("list"); strings.Contains(def, "Call the client") || !strings.Contains(def, "Call the plumber") {
		t.Fatalf("ot list =\n%s", def)
	}
	// OPENTODO_WORKSPACE does the same.
	h.env["OPENTODO_WORKSPACE"] = "Work"
	if out := h.mustRun("inbox"); !strings.Contains(out, "Call the client") {
		t.Fatalf("inbox with OPENTODO_WORKSPACE =\n%s", out)
	}
	delete(h.env, "OPENTODO_WORKSPACE")

	// ot workspaces, table and JSON.
	if out := h.mustRun("workspaces"); !strings.Contains(out, "Work") || !strings.Contains(out, "Personal") {
		t.Fatalf("ot workspaces =\n%s", out)
	}
	var list []map[string]any
	if err := json.Unmarshal([]byte(h.mustRun("workspaces", "--json")), &list); err != nil || len(list) != 2 {
		t.Fatalf("ot workspaces --json: %v %v", list, err)
	}
	// Move a project and see the column.
	h.mustRun("project", "move", "Home", "--workspace", "Work")
	if out := h.mustRun("project", "list"); !strings.Contains(out, "WORKSPACE") || !strings.Contains(out, "Work") {
		t.Fatalf("project list =\n%s", out)
	}
	if out := h.mustRun("project", "list", "--workspace", "Personal"); strings.Contains(out, "Home") {
		t.Fatalf("Personal projects =\n%s", out)
	}
}

func TestUnknownWorkspace(t *testing.T) {
	h := newHarness(t)
	h.loginAdmin()
	code, _, errb := h.run("list", "--workspace", "Acme")
	if code != ExitUsage || !strings.Contains(errb, "Personal") {
		t.Fatalf("unknown workspace: exit %d %q", code, errb)
	}
	// ot login --workspace stores the profile's workspace.
	cfg, err := loadConfig(h.configPath)
	if err != nil {
		t.Fatal(err)
	}
	for name, p := range cfg.Profiles {
		p.Workspace = "Acme"
		cfg.Profiles[name] = p
	}
	if err := saveConfig(h.configPath, cfg); err != nil {
		t.Fatal(err)
	}
	if code, _, _ := h.run("list"); code != ExitUsage {
		t.Fatalf("profile workspace Acme: exit %d", code)
	}
	if _, err := os.Stat(h.configPath); err != nil {
		t.Fatal(err)
	}
}
