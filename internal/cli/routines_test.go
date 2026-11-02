package cli

import (
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// `ot routine` (OpenSpec change routines-engine, task 3.3).
func TestRoutineCommands(t *testing.T) {
	h := newHarness(t)
	h.loginAdmin()
	h.apiJSON("POST", "/api/v1/projects", map[string]any{"name": "Groceries", "description": "- oat milk\n- bread"})
	h.apiJSON("POST", "/api/v1/projects", map[string]any{"name": "Errands"})
	file := writeTemp(t, "groceries.yaml", `name: Groceries
trigger: {kind: manual}
steps:
  - id: a
    kind: note_text
    in: {of: {ref: p}}
`)
	// A reference to a step that does not exist is the server's refusal.
	if code, _, _ := h.run("routine", "create", "--file", file); code != ExitServer {
		t.Fatalf("invalid routine: exit %d", code)
	}
	// "Unknown name": nothing is sent.
	bad := writeTemp(t, "bad.yaml", "name: X\ntrigger: {kind: manual}\nsteps:\n  - {id: a, kind: create_tasks, in: {title: {literal: x}, project: {literal: {project: Erands}}}}\n")
	h.requestLog()
	code, _, errb := h.run("routine", "create", "--file", bad)
	if code != ExitUsage || !strings.Contains(errb, "project Erands not found") || len(writesIn(h.requestLog())) != 0 {
		t.Fatalf("unknown name: exit %d %q", code, errb)
	}
	// "Create from YAML" with names resolved.
	file = writeTemp(t, "groceries2.yaml", `name: Groceries
trigger: {kind: manual}
steps:
  - {id: a, kind: split_lines, in: {text: {literal: "oat milk\nbread\napples"}}}
  - {id: b, kind: create_tasks, in: {text: {ref: a}, project: {literal: {project: Errands}}}}
  - {id: c, kind: count, in: {list: {ref: b}}}
`)
	id := strings.TrimSpace(h.mustRun("routine", "create", "--file", file))
	if id == "" {
		t.Fatal("no id")
	}
	if out := h.mustRun("routine", "show", "Groceries"); !strings.Contains(out, "1. [a] split lines") || !strings.Contains(out, "3. [c] count") {
		t.Fatalf("show %q", out)
	}
	if out := h.mustRun("routines", "list"); !strings.Contains(out, "Groceries") || !strings.Contains(out, "manual") {
		t.Fatalf("list %q", out)
	}
	// "Test from the CLI": the run record with test: true, nothing written.
	var res struct {
		Run   struct{ Outcome, Source string }
		Steps []struct{ Status string }
		Test  bool
	}
	if err := json.Unmarshal([]byte(h.mustRun("routine", "run", "Groceries", "--test", "--json")), &res); err != nil || !res.Test || len(res.Steps) != 3 || res.Run.Source != "test" {
		t.Fatalf("test run %+v %v", res, err)
	}
	if n := len(h.apiJSON("GET", "/api/v1/tasks", nil)["tasks"].([]any)); n != 0 {
		t.Fatalf("a test wrote %d tasks", n)
	}
	if out := h.mustRun("routine", "run", "Groceries"); !strings.Contains(out, "Groceries: applied, wrote 3 items") {
		t.Fatalf("run %q", out)
	}
	if out := h.mustRun("routine", "runs", "Groceries"); !strings.Contains(out, "manual") || !strings.Contains(out, "test") {
		t.Fatalf("runs %q", out)
	}
	// A failed run exits 6.
	failing := writeTemp(t, "fail.json", `{"name": "Fails", "trigger": {"kind": "manual"}, "steps": [{"id": "a", "kind": "find_project", "in": {"name": {"literal": "Nowhere"}}}]}`)
	h.mustRun("routine", "create", "--file", failing)
	if code, out, _ := h.run("routine", "run", "Fails", "--json"); code != ExitRunFailed || !strings.Contains(out, `"outcome":"failed"`) {
		t.Fatalf("failed run: exit %d %q", code, out)
	}
	// "Read token": refused with exit 5.
	h.setToken(strings.TrimSpace(h.mustRun("token", "create", "reader", "--scope", "read")))
	h.mustRun("routine", "list")
	if code, _, _ := h.run("routine", "disable", "Groceries"); code != ExitNotPermitted {
		t.Fatalf("read token disable: exit %d", code)
	}
}

// The YAML reader is linked into ot only (routines-engine D16), as the vault is.
func TestServerDoesNotLinkYAML(t *testing.T) {
	gobin, err := exec.LookPath("go")
	if err != nil {
		if gobin, err = exec.LookPath(filepath.Join(os.Getenv("GOROOT"), "bin", "go")); err != nil {
			t.Skip("the go command is not on PATH")
		}
	}
	out, err := exec.Command(gobin, "list", "-deps", "../../cmd/opentodo").CombinedOutput()
	if err != nil {
		t.Fatalf("go list: %v\n%s", err, out)
	}
	if bytes.Contains(out, []byte("go.yaml.in/yaml/v3")) {
		t.Fatal("the server binary links the CLI's YAML reader")
	}
	out, err = exec.Command(gobin, "list", "-deps", "../../cmd/ot").CombinedOutput()
	if err != nil {
		t.Fatalf("go list ot: %v\n%s", err, out)
	}
	if !bytes.Contains(out, []byte("go.yaml.in/yaml/v3")) {
		t.Fatal("ot does not link the YAML reader")
	}
}

// `ot routine create --project` (OpenSpec change routines-shared, D11): the
// routine belongs to the project, and list and show name it.
func TestRoutineProject(t *testing.T) {
	h := newHarness(t)
	h.loginAdmin()
	h.apiJSON("POST", "/api/v1/projects", map[string]any{"name": "Household"})
	file := writeTemp(t, "chores.yaml", "name: Chores\ntrigger: {kind: manual}\nsteps:\n  - {id: a, kind: find_tasks, in: {condition: {literal: {}}}}\n")
	h.mustRun("routine", "create", "--project", "household", "--file", file)
	if out := h.mustRun("routine", "list"); !strings.Contains(out, "PROJECT") || !strings.Contains(out, "Household") {
		t.Fatalf("list %q", out)
	}
	if out := h.mustRun("routine", "show", "Chores"); !strings.Contains(out, "Project: Household") {
		t.Fatalf("show %q", out)
	}
	if code, _, errb := h.run("routine", "create", "--project", "Nowhere", "--file", file); code != ExitUsage || !strings.Contains(errb, "project Nowhere not found") {
		t.Fatalf("unknown project: exit %d %q", code, errb)
	}
}
