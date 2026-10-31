package httpapi

import (
	"encoding/json"
	"reflect"
	"testing"
)

// Standalone notes travel in the JSON export and its import (OpenSpec change
// notes-overview, D9; standalone-notes "Notes in the export and import").
func TestNotesRoundTripExportImport(t *testing.T) {
	a := newEnv(t, false)
	a.register("a@example.com")
	mk := func(path string, body map[string]any) string {
		resp, out := a.do("POST", path, body)
		a.mustStatus(resp, 201, out)
		return out["id"].(string)
	}
	ideas := mk("/api/v1/labels", map[string]any{"name": "ideas"})
	home := mk("/api/v1/projects", map[string]any{"name": "Home"})
	mk("/api/v1/notes", map[string]any{"title": "Wi-Fi", "description": "- network: home", "notes_doc": "ydoc:v1:AQID", "project_id": home})
	mk("/api/v1/notes", map[string]any{"title": "Gift ideas", "description": "a book", "labels": []string{ideas}})
	gone := mk("/api/v1/notes", map[string]any{"title": "Old draft", "description": "never mind"})
	meeting := mk("/api/v1/notes", map[string]any{"title": "Meeting", "description": "Agenda"})
	mk("/api/v1/notes", map[string]any{"title": "Plain", "description": "just text"})
	resp, out := a.do("DELETE", "/api/v1/notes/"+gone, nil)
	a.mustStatus(resp, 204, out)
	resp, out = a.do("POST", "/api/v1/notes/"+meeting+"/append", map[string]any{"text": "- decided: ship Friday"})
	a.mustStatus(resp, 201, out)
	task := mk("/api/v1/tasks", map[string]any{"title": "Call", "description": "number"})
	resp, out = a.do("POST", "/api/v1/tasks/"+task+"/note/append", map[string]any{"text": "- called, no answer"})
	a.mustStatus(resp, 201, out)

	exportA := exportEntities(a)
	if notes, _ := exportA["notes"].([]any); len(notes) != 5 {
		t.Fatalf("exported notes = %v", exportA["notes"])
	}
	fileA, _ := json.Marshal(exportA)

	b := newEnv(t, false)
	b.register("b@example.com")
	resp, out = b.upload("/api/v1/import/preview", "opentodo-export.json", fileA, nil)
	b.mustStatus(resp, 200, out)
	if totals := out["totals"].(map[string]any); totals["error"] != float64(0) || totals["warnings"] != float64(0) || totals["notes"] != float64(4) {
		t.Fatalf("preview totals = %v rows = %v", totals, out["rows"])
	}
	job := b.importAndWait("opentodo-export.json", fileA, nil)
	if job["status"] != "done" {
		t.Fatalf("job = %v", job)
	}
	exportB := exportEntities(b)
	for _, k := range []string{"notes", "tasks", "labels", "projects"} {
		if !reflect.DeepEqual(exportA[k], exportB[k]) {
			ja, _ := json.MarshalIndent(exportA[k], "", " ")
			jb, _ := json.MarshalIndent(exportB[k], "", " ")
			t.Fatalf("%s differ after round trip:\nA=%s\nB=%s", k, ja, jb)
		}
	}
	// The pending appends are still pending on B: a device folds them.
	resp, out = b.do("GET", "/api/v1/notes/"+meeting, nil)
	b.mustStatus(resp, 200, out)
	if ap := out["appends"].([]any); len(ap) != 1 || ap[0].(map[string]any)["text"] != "- decided: ship Friday" {
		t.Fatalf("note on B = %v", out)
	}
	// Importing the same file again changes nothing.
	job = b.importAndWait("opentodo-export.json", fileA, nil)
	if job["totals"].(map[string]any)["written"] != float64(0) {
		t.Fatalf("second import = %v", job)
	}
}
