package cli

import (
	"strings"
	"testing"
)

// TestReusableListAdd (OpenSpec reusable-lists, task 3.2): `ot project edit`
// turns the mode on, `ot add` in a reusable list reopens a ticked-off item or
// finds it open and says so, and --new adds another.
func TestReusableListAdd(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.mustRun("project", "add", "Groceries")
	out := h.mustRun("project", "edit", "Groceries", "--reusable", "--aisles", "--json")
	if !strings.Contains(out, `"reusable":true`) || !strings.Contains(out, `"aisles":true`) {
		t.Fatalf("project edit = %s", out)
	}
	if code, _, _ := h.run("project", "edit", "Groceries", "--reusable", "--no-reusable"); code != ExitUsage {
		t.Fatalf("contradictory flags = %d", code)
	}
	if code, _, _ := h.run("project", "edit", "Groceries"); code != ExitUsage {
		t.Fatalf("no flags = %d", code)
	}

	milk := strings.TrimSpace(h.mustRun("add", "Milk", "--project", "Groceries"))
	h.mustRun("done", milk)
	code, stdout, stderr := h.run("add", "milk", "--project", "Groceries")
	if code != 0 || strings.TrimSpace(stdout) != milk || !strings.Contains(stderr, "reopened") {
		t.Fatalf("reopen: %d %q %q", code, stdout, stderr)
	}
	if got := h.task(milk); got["completed_at"] != nil {
		t.Fatalf("still completed: %v", got)
	}
	code, stdout, stderr = h.run("add", "Milk", "--project", "Groceries")
	if code != 0 || strings.TrimSpace(stdout) != milk || !strings.Contains(stderr, "already on the list") {
		t.Fatalf("open: %d %q %q", code, stdout, stderr)
	}
	other := strings.TrimSpace(h.mustRun("add", "Milk", "--project", "Groceries", "--new"))
	if other == milk || other == "" {
		t.Fatalf("--new = %q", other)
	}

	// An ordinary project never asks for reuse.
	h.mustRun("project", "add", "Work")
	a := strings.TrimSpace(h.mustRun("add", "Report", "--project", "Work"))
	b := strings.TrimSpace(h.mustRun("add", "Report", "--project", "Work"))
	if a == b {
		t.Fatal("an ordinary project reused a task")
	}
	h.mustRun("project", "edit", "Groceries", "--no-reusable")
	if c := strings.TrimSpace(h.mustRun("add", "Milk", "--project", "Groceries")); c == milk || c == other {
		t.Fatal("reuse after the mode was turned off")
	}
}
