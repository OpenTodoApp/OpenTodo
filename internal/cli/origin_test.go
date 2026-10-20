package cli

import (
	"encoding/json"
	"strings"
	"testing"
)

// --origin-url on add and edit (OpenSpec change task-origin, cli-client "Add and
// edit tasks"): derived locally through internal/origin, validated before any
// request, cleared with none, carried in --json, --dry-run and the table.
func TestOriginURL(t *testing.T) {
	h := newHarness(t)
	h.login()
	issue := map[string]any{"kind": "issue", "provider": "github", "id": "o/r#7", "url": "https://github.com/o/r/issues/7"}

	var created struct {
		ID     string         `json:"id"`
		Origin map[string]any `json:"origin"`
	}
	out := h.mustRun("add", "Fix the login timeout", "--origin-url", "https://github.com/o/r/issues/7", "--json")
	if err := json.Unmarshal([]byte(out), &created); err != nil || !sameMap(created.Origin, issue) {
		t.Fatalf("add --json = %s (%v)", out, err)
	}
	if !sameMap(h.task(created.ID)["origin"].(map[string]any), issue) {
		t.Fatalf("server origin = %v", h.task(created.ID)["origin"])
	}
	// No request went to the issue's host: every request was to the API.
	for _, r := range h.requestLog() {
		if !strings.Contains(r, " /api/") {
			t.Fatalf("unexpected request %q", r)
		}
	}

	id := strings.TrimSpace(h.mustRun("add", "Read this", "--origin-url", "https://example.org/post"))
	if o := h.task(id)["origin"].(map[string]any); !sameMap(o, map[string]any{"kind": "url", "url": "https://example.org/post"}) {
		t.Fatalf("page origin = %v", o)
	}

	h.requestLog()
	if code, _, errb := h.run("add", "Nope", "--origin-url", "ftp://files.example/x"); code != ExitUsage || !strings.Contains(errb, "--origin-url") {
		t.Fatalf("ftp: %d %q", code, errb)
	}
	if code, _, _ := h.run("add", "Nope", "--origin-url", "none"); code != ExitUsage {
		t.Fatalf("add none: %d", code)
	}
	if w := writesIn(h.requestLog()); len(w) != 0 {
		t.Fatalf("a refused add sent %v", w)
	}

	// The table shows the origin column only when a listed task has one.
	if list := h.mustRun("list"); !strings.Contains(list, "ORIGIN") || !strings.Contains(list, "o/r#7") || !strings.Contains(list, "example.org") {
		t.Fatalf("list = %q", list)
	}

	// Dry run prints the request with the origin.
	dry := h.mustRun("add", "Planned", "--origin-url", "https://linear.app/acme/issue/ENG-9", "--dry-run", "--json")
	if !strings.Contains(dry, `"provider": "linear"`) && !strings.Contains(dry, `"provider":"linear"`) {
		t.Fatalf("dry run = %s", dry)
	}

	out = h.mustRun("edit", created.ID, "--origin-url", "none", "--json")
	var edited map[string]any
	_ = json.Unmarshal([]byte(out), &edited)
	if edited["origin"] != nil || edited["title"] != "Fix the login timeout" {
		t.Fatalf("cleared = %v", edited)
	}
	h.mustRun("edit", id, "--origin-url", "none")
	if list := h.mustRun("list"); strings.Contains(list, "ORIGIN") {
		t.Fatalf("a list without origins has an origin column: %q", list)
	}
}

func sameMap(got, want map[string]any) bool {
	if len(got) != len(want) {
		return false
	}
	for k, v := range want {
		if got[k] != v {
			return false
		}
	}
	return true
}
