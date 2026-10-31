package sync

import (
	"encoding/json"
	"strconv"
	"strings"
)

// Standalone notes (OpenSpec change notes-overview, design D1, D6).

// NoteToTask plans turning a standalone note into a task (design D6): the
// fields of the new task (the note's title, document, projection, project,
// labels, workspace and pending appends, a default priority, created now) and
// the note's tombstone. Both go in one batch so Undo and every device see one
// change. Content values are copied as they are, so a plaintext note gives a
// plaintext task; an encrypted account's caller passes sealed values instead
// (sealed for the new task id) through override.
func NoteToTask(note Entity, now int64, override map[string]json.RawMessage) (task, tombstone map[string]json.RawMessage) {
	task = map[string]json.RawMessage{
		"created_at": json.RawMessage(strconv.FormatInt(now, 10)),
		"position":   json.RawMessage(strconv.FormatInt(now, 10)),
		"priority":   json.RawMessage("4"),
	}
	for _, f := range []string{"title", "description", "notes_doc", "project_id", "labels", "workspace_id"} {
		if v, ok := note[f]; ok {
			task[f] = v
		}
	}
	for f, v := range note {
		if strings.HasPrefix(f, AppendPrefix) && string(v) != `""` {
			task[f] = v
		}
	}
	for f, v := range override {
		task[f] = v
	}
	if _, ok := task["title"]; !ok {
		task["title"] = json.RawMessage(`""`)
	}
	return task, map[string]json.RawMessage{"deleted_at": json.RawMessage(strconv.FormatInt(now, 10))}
}
