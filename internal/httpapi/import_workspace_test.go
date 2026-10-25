package httpapi

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"testing"
)

// Import into a chosen workspace (OpenSpec change import-workspace).
func TestImportIntoWorkspaceHTTP(t *testing.T) {
	e := newEnv(t, false)
	e.register("a@example.com")
	resp, out := e.do("POST", "/api/v1/workspaces", map[string]any{"name": "Work"})
	e.mustStatus(resp, 201, out)
	work := out["id"].(string)

	csv := []byte("title,project\nShip it,Site\nInbox one,\n")
	// The workspace as one JSON options part.
	job := e.importAndWait("a.csv", csv, map[string]any{"workspace": work})
	if job["status"] != "done" || job["options"].(map[string]any)["workspace"] != work {
		t.Fatalf("job = %v", job)
	}
	resp, out = e.do("GET", "/api/v1/projects", nil)
	e.mustStatus(resp, 200, out)
	for _, p := range out["projects"].([]any) {
		if p.(map[string]any)["workspace_id"] != work {
			t.Fatalf("project = %v", p)
		}
	}

	// The workspace as an individual form field, as the CLI may send it.
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	_ = mw.WriteField("workspace", "not-mine")
	fw, _ := mw.CreateFormFile("file", "a.csv")
	_, _ = fw.Write(csv)
	_ = mw.Close()
	req, _ := http.NewRequest("POST", e.srv.URL+"/api/v1/import/preview", &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	res, err := e.client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 400 {
		t.Fatalf("unknown workspace field: %d", res.StatusCode)
	}

	// Undo of the job into Work removes its projects.
	resp, out = e.do("POST", "/api/v1/import/jobs/"+job["id"].(string)+"/undo", nil)
	e.mustStatus(resp, 200, out)
	resp, out = e.do("GET", "/api/v1/projects", nil)
	e.mustStatus(resp, 200, out)
	if n := len(out["projects"].([]any)); n != 0 {
		t.Fatalf("projects after undo: %d", n)
	}
}
