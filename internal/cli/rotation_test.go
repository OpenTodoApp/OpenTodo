package cli

import (
	"context"
	"fmt"
	"strings"
	"testing"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// TestRotateFlags (OpenSpec change chore-rotation, task 4.2): --rotate sets
// the people who take turns by name or email, in order, and prints the
// rotation; --no-rotate clears it; an unknown person is a usage error that
// writes nothing.
func TestRotateFlags(t *testing.T) {
	h := newHarness(t)
	h.login()
	owner := h.apiJSON("GET", "/api/v1/me", nil)["user"].(map[string]any)["id"].(string)
	for _, u := range []string{"bob", "carol"} {
		if _, err := h.db.Exec(`INSERT INTO users(id,email,name,password_hash,created_at) VALUES(?,?,?,'h',1)`, u, u+"@example.com", strings.ToUpper(u[:1])+u[1:]); err != nil {
			t.Fatal(err)
		}
	}
	h.put("project", "house", map[string]any{"name": "House"})
	h.put("task", "bins", map[string]any{"title": "Bins", "project_id": "house", "recurrence": "every monday",
		"due": map[string]any{"date": "2026-10-12"}, "assignee_id": owner})
	for _, u := range []string{"bob", "carol"} {
		if _, err := h.sync.AddMember(context.Background(), owner, "house", u, opsync.RoleEditor); err != nil {
			t.Fatal(err)
		}
	}
	out := h.mustRun("edit", "bins", "--rotate", "owner@example.com,carol,Bob")
	if !strings.Contains(out, "Takes turns: Owner* → Carol → Bob") {
		t.Fatalf("edit output:\n%s", out)
	}
	if got := fmt.Sprint(h.task("bins")["rotation"]); got != fmt.Sprint([]any{owner, "carol", "bob"}) {
		t.Fatalf("rotation = %s", got)
	}
	// Completing passes the turn.
	h.mustRun("done", "bins")
	if got := h.task("bins")["assignee_id"]; got != "carol" {
		t.Fatalf("after done: assignee %v", got)
	}
	h.requestLog()
	if code, _, errb := h.run("edit", "bins", "--rotate", "dave"); code != ExitUsage || !strings.Contains(errb, "Members:") {
		t.Fatalf("unknown person: %d %s", code, errb)
	}
	if w := writesIn(h.requestLog()); len(w) != 0 {
		t.Fatalf("unknown person wrote %v", w)
	}
	h.mustRun("edit", "bins", "--no-rotate")
	if got := fmt.Sprint(h.task("bins")["rotation"]); got != "[]" {
		t.Fatalf("cleared rotation = %s", got)
	}
}

func TestTurnsLine(t *testing.T) {
	bob := "bob"
	members := []projectMember{{UserID: "alice", Name: "Alice"}, {UserID: "bob", Email: "bob@example.com"}}
	if got := turnsLine([]string{"alice", "bob", "gone"}, &bob, members); got != "Takes turns: Alice → bob@example.com* → (left the project)" {
		t.Fatalf("line = %q", got)
	}
}
