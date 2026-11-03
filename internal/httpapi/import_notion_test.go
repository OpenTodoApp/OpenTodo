package httpapi

import (
	"archive/zip"
	"bytes"
	"net/http"
	"os"
	"strings"
	"testing"
)

// notionZip is a Notion export of one task database with the columns Name,
// Status, Due, Do date, Tags and Assignee.
func notionZip(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	w, _ := zw.Create("Private & Shared/Tasks 29d4c1a8e2f380a1b6c4d2e0f1a2b3c4_all.csv")
	_, _ = w.Write([]byte("\ufeffName,Assignee,Do date,Due,Status,Tags\r\n" +
		"Plan the garden,Sam Example,\"November 3, 2026\",\"October 29, 2026\",Done,\"Home, Outdoor\"\r\n" +
		"Book the venue,,\"November 4, 2026\",,Not started,Work"))
	_ = zw.Close()
	return buf.Bytes()
}

func notionTaskDue(e *env, title string) string {
	resp, out := e.do("GET", "/api/v1/tasks", nil)
	e.mustStatus(resp, 200, out)
	for _, x := range out["tasks"].([]any) {
		task := x.(map[string]any)
		if task["title"] == title {
			if due, ok := task["due"].(map[string]any); ok {
				return due["date"].(string)
			}
			return ""
		}
	}
	e.t.Fatalf("no task %q", title)
	return ""
}

func TestImportNotionColumns(t *testing.T) {
	e := newEnv(t, false)
	e.register("owner@example.test")
	data := notionZip(t)

	// Guessed: Status, Due and Tags; Assignee is named as not imported.
	resp, out := e.upload("/api/v1/import/preview", "Export.zip", data, nil)
	e.mustStatus(resp, 200, out)
	if out["format"] != "notion-csv" {
		t.Fatalf("preview = %v", out)
	}
	roles := out["columns"].(map[string]any)["roles"].(map[string]any)
	if roles["status"] != "Status" || roles["due"] != "Due" || roles["labels"] != "Tags" || roles["priority"] != nil {
		t.Fatalf("roles = %v", roles)
	}
	if notes := strings.Join(toStrings(out["notes"]), "|"); !strings.Contains(notes, "Assignee") {
		t.Fatalf("notes = %v", out["notes"])
	}

	// Changed: the due date comes from Do date, in the preview and the commit.
	opts := map[string]any{"columns": map[string]any{"due": "Do date"}}
	resp, out = e.upload("/api/v1/import/preview", "Export.zip", data, opts)
	e.mustStatus(resp, 200, out)
	if r := out["columns"].(map[string]any)["roles"].(map[string]any); r["due"] != "Do date" || r["status"] != "Status" {
		t.Fatalf("changed roles = %v", r)
	}
	job := e.importAndWait("Export.zip", data, opts)
	if job["status"] != "done" {
		t.Fatalf("job = %v", job)
	}
	if got := notionTaskDue(e, "Book the venue"); got != "2026-11-04" {
		t.Fatalf("due = %q, want the Do date", got)
	}

	// Unknown column: 400 invalid_input naming it.
	resp, out = e.upload("/api/v1/import/preview", "Export.zip", data, map[string]any{"columns": map[string]any{"due": "Deadline"}})
	e.mustStatus(resp, http.StatusBadRequest, out)
	if errCode(out) != "invalid_input" || !strings.Contains(errMessage(out), `"Deadline"`) {
		t.Fatalf("unknown column = %v", out)
	}
	// An unknown role too.
	resp, out = e.upload("/api/v1/import/preview", "Export.zip", data, map[string]any{"columns": map[string]any{"colour": "Tags"}})
	e.mustStatus(resp, http.StatusBadRequest, out)

	// Without credentials nothing is read.
	anon := &env{t: t, srv: e.srv, client: &http.Client{}}
	resp, out = anon.upload("/api/v1/import/preview", "Export.zip", data, map[string]any{"format": "notion-csv"})
	anon.mustStatus(resp, 401, out)
}

// A file chosen for one app but made by another is previewed as chosen and
// names the format it looks like.
func TestImportNotionWrongFileNamesDetected(t *testing.T) {
	e := newEnv(t, false)
	e.register("owner@example.test")
	data, err := os.ReadFile("../importer/testdata/todoist-backup/backup.zip")
	if err != nil {
		t.Fatal(err)
	}
	resp, out := e.upload("/api/v1/import/preview", "backup.zip", data, map[string]any{"format": "notion-csv"})
	e.mustStatus(resp, 200, out)
	if out["format"] != "notion-csv" || out["detected"] != "todoist-backup" {
		t.Fatalf("preview = format %v, detected %v", out["format"], out["detected"])
	}
}
