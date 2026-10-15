package httpapi

import (
	"net/http"
	"os"
	"testing"
)

// The import preview tells the web app a file is a template (OpenSpec change
// project-templates, task 3.1).
func TestImportPreviewTemplateHint(t *testing.T) {
	data, err := os.ReadFile("../importer/testdata/template/trip.json")
	if err != nil {
		t.Fatal(err)
	}
	e := newEnv(t, false)
	e.register("o@example.com")
	resp, out := e.upload("/api/v1/import/preview", "opentodo-template-trip-to-rome.json", data, nil)
	e.mustStatus(resp, 200, out)
	tpl, _ := out["template"].(map[string]any)
	if out["format"] != "opentodo" || tpl == nil || tpl["day"] != "2026-10-14" {
		t.Fatalf("preview = %v", out)
	}
	anon := &env{t: t, srv: e.srv, client: &http.Client{}}
	resp, out = anon.upload("/api/v1/import/preview", "t.json", data, nil)
	anon.mustStatus(resp, 401, out)
}
