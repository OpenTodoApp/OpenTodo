package rules

import "testing"

// TestNoteOpsFireNoRule (notes-overview): automation rules act on tasks only; a
// standalone note's ops (created, labelled, moved into a project, edited, appended to, deleted) and a
// task's pending append fire no rule.
func TestNoteOpsFireNoRule(t *testing.T) {
	h := newHarness(t)
	h.write("alice", "laptop", "label", "lw", map[string]any{"name": "waiting", "created_at": 1, "deleted_at": nil})
	h.rule("alice", "created", "Created", `{"kind":"task.created"}`, "", `{"priority":1}`)
	h.rule("alice", "labelled", "Labelled", `{"kind":"label.added","label_id":"lw"}`, "", `{"priority":2}`)
	h.write("alice", "laptop", "project", "work", map[string]any{"name": "Work", "created_at": 1, "deleted_at": nil})
	h.rule("alice", "moved", "Moved", `{"kind":"task.moved","project_id":"work"}`, "", `{"priority":3}`)
	h.task("alice", "t1", nil)
	h.e.Drain(h.ctx)
	if len(h.runs("created")) != 1 {
		t.Fatal("the task itself fired no rule: the harness is not observing")
	}

	h.write("alice", "phone", "note", "n1", map[string]any{"title": "Meeting", "description": "text", "labels": []string{}, "position": 1, "created_at": 1, "deleted_at": nil})
	h.e.Drain(h.ctx)
	h.write("alice", "phone", "note", "n1", map[string]any{"labels": []string{"lw"}, "title": "Meeting 2", "project_id": "work"})
	h.e.Drain(h.ctx)
	h.write("alice", "phone", "note", "n1", map[string]any{"appends.a1": "more"})
	h.write("alice", "phone", "task", "t1", map[string]any{"appends.a2": "pending"})
	h.e.Drain(h.ctx)
	h.write("alice", "phone", "note", "n1", map[string]any{"deleted_at": 5})
	h.e.Drain(h.ctx)

	if n := len(h.runs("created")); n != 1 {
		t.Fatalf("task.created rule ran %d times", n)
	}
	for _, r := range []string{"labelled", "moved"} {
		if rs := h.runs(r); len(rs) != 0 {
			t.Fatalf("rule %s ran for a note or an append: %+v", r, rs)
		}
	}
	if len(h.sink.calls) != 0 {
		t.Fatalf("notifications: %+v", h.sink.calls)
	}
}
