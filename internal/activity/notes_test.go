package activity

import (
	"encoding/json"
	"testing"
)

// TestNoteOpsDeriveNoEvent (notes-overview): a standalone note is not part of
// the activity feed, and a pending append (appends.<id>) on a task or a note is
// never an event of its own.
func TestNoteOpsDeriveNoEvent(t *testing.T) {
	fields := [][2]string{
		{"title", `"Meeting"`}, {"notes_doc", `"AAEC"`}, {"description", `"text"`}, {"project_id", `"p1"`},
		{"labels", `["x"]`}, {"position", `1`}, {"created_at", `1`}, {"workspace_id", `"w"`}, {"deleted_at", `2`},
	}
	var ops []Op
	for i, f := range fields {
		ops = append(ops, Op{ID: "n" + f[0], Actor: "a", Entity: "note", EntityID: "n1", Field: f[0], Value: json.RawMessage(f[1]), TS: int64(i + 1), Device: "d"})
	}
	ops = append(ops,
		Op{ID: "ta", Actor: "a", Entity: "task", EntityID: "t1", Field: "appends.ap1", Value: json.RawMessage(`{"text":"more"}`), TS: 20, Device: "d"},
		Op{ID: "na", Actor: "a", Entity: "note", EntityID: "n1", Field: "appends.ap2", Value: json.RawMessage(`{"text":"more"}`), TS: 21, Device: "d"},
	)
	if evs := Derive(ops, nil); len(evs) != 0 {
		t.Fatalf("note or append ops derived events: %+v", evs)
	}
}
