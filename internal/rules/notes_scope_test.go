package rules

import (
	"strings"
	"testing"
)

// "Household notes": a shared routine finds only its project's notes.
func TestSharedRoutineFindsOnlyItsProjectsNotes(t *testing.T) {
	h, _ := sharedHarness(t)
	h.note("alice", "hn", "Chores", "x", map[string]any{"project_id": "p"})
	h.note("alice", "mn", "Mine", "x", nil)
	h.sharedRoutine("alice", "r1", `{"kind":"manual"}`, `[{"id":"a","kind":"find_notes","in":{}}]`)
	res := h.runNow("alice", "r1", "", true)
	if ids := res.Steps[0].IDs; len(ids) != 1 || ids[0] != "hn" {
		t.Fatalf("found %v %v", ids, statuses(res))
	}
	// A shared routine's note trigger fires on any member's change to the project's notes.
	h.sharedRoutine("alice", "r2", `{"kind":"note.created"}`, `[{"id":"a","kind":"append_to_note","in":{"of":{"ref":"trigger"},"text":{"literal":"seen"}}}]`)
	h.note("bob", "bn", "Bob's", "", map[string]any{"project_id": "p"})
	h.note("bob", "bp", "Bob's own", "", nil)
	h.e.Drain(h.ctx)
	if runs := h.runs("r2"); len(runs) != 1 || runs[0].NoteID != "bn" || runs[0].Outcome != OutcomeApplied {
		t.Fatalf("runs %+v", runs)
	}
}

// "Viewer's note": a personal routine that would add text to a note of a
// project where its person only views fails before writing, naming the project.
func TestNoteRoutineRefusesAViewersNote(t *testing.T) {
	h, _ := sharedHarness(t)
	h.note("alice", "hn", "Weekly", "x", map[string]any{"project_id": "p"})
	h.routine("carol", "c1", "Append", `{"kind":"manual"}`, "", `[
		{"id":"a","kind":"find_notes","in":{}},
		{"id":"b","kind":"append_to_note","in":{"of":{"ref":"a"},"text":{"literal":"line"}}}]`)
	res := h.runNow("carol", "c1", "", false)
	if res.Run.Outcome != OutcomeFailed || !strings.Contains(res.Run.Reason, "Household") || res.Run.Writes != 0 {
		t.Fatalf("run %+v %v", res.Run, statuses(res))
	}
}

// "Workspace": a routine of Work creates a note without a project in Work.
func TestWorkspaceRoutineCreatesItsNotesThere(t *testing.T) {
	h, work, _ := workspaceHarness(t)
	h.note("alice", "personal", "Personal note", "", nil)
	h.note("alice", "worknote", "Work note", "", map[string]any{"workspace_id": work})
	h.routine("alice", "r1", "Make", `{"kind":"manual"}`, "", `[
		{"id":"a","kind":"find_notes","in":{}},
		{"id":"b","kind":"create_note","in":{"title":{"literal":"Standup"}}}]`)
	h.inWorkspace("r1", work)
	res := h.runNow("alice", "r1", "", false)
	if res.Run.Outcome != OutcomeApplied || len(res.Steps[0].IDs) != 1 || res.Steps[0].IDs[0] != "worknote" {
		t.Fatalf("run %+v %v", res.Run, statuses(res))
	}
	for _, n := range h.notes("alice") {
		if strOf(n["title"]) == "Standup" && strOf(n["workspace_id"]) != work {
			t.Fatalf("created in %q", strOf(n["workspace_id"]))
		}
	}
}
