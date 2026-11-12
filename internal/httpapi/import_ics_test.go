package httpapi

import (
	"net/http"
	"os"
	"testing"
)

// An iCalendar file of tasks is detected, imported and refused without
// credentials (OpenSpec change ics-import).
func TestImportICS(t *testing.T) {
	e := newEnv(t, false)
	e.register("owner@example.test")
	data, err := os.ReadFile("../importer/testdata/ics/nextcloud.ics")
	if err != nil {
		t.Fatal(err)
	}
	resp, out := e.upload("/api/v1/import/preview", "Groceries.ics", data, nil)
	e.mustStatus(resp, 200, out)
	if out["format"] != "ics" {
		t.Fatalf("preview = %v", out)
	}
	job := e.importAndWait("Groceries.ics", data, nil)
	if job["status"] != "done" {
		t.Fatalf("job = %v", job)
	}
	resp, out = e.do("GET", "/api/v1/tasks", nil)
	e.mustStatus(resp, 200, out)
	parents := map[string]string{}
	ids := map[string]string{}
	for _, x := range out["tasks"].([]any) {
		task := x.(map[string]any)
		ids[task["title"].(string)] = task["id"].(string)
		if p, ok := task["parent_id"].(string); ok {
			parents[task["title"].(string)] = p
		}
	}
	if parents["Buy flour"] == "" || parents["Buy flour"] != ids["Bake a cake"] {
		t.Fatalf("subtask parents = %v, ids = %v", parents, ids)
	}

	resp, out = e.upload("/api/v1/import/preview", "notes.ics", []byte("hello"), map[string]any{"format": "ics"})
	e.mustStatus(resp, http.StatusBadRequest, out)
	if code := out["error"].(map[string]any)["code"]; code != "invalid_file" {
		t.Fatalf("not a calendar: code %v", code)
	}

	anon := &env{t: t, srv: e.srv, client: &http.Client{}}
	resp, out = anon.upload("/api/v1/import/preview", "Groceries.ics", data, nil)
	anon.mustStatus(resp, 401, out)
}
