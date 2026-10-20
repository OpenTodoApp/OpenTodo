package importer

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/origin"
)

// Imported origins (OpenSpec change task-origin, data-import "Linear attributes"
// and "Imported origins").

func parseFixture(t *testing.T, path string) *Parsed {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", path))
	if err != nil {
		t.Fatal(err)
	}
	opts := Options{}
	if err := opts.Normalize(); err != nil {
		t.Fatal(err)
	}
	opts.exportedAt = time.Date(2026, 9, 19, 22, 10, 0, 0, time.UTC)
	opts.tempDir = t.TempDir()
	p, err := Parse(data, opts)
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func TestNamedProfilesSetOrigins(t *testing.T) {
	cases := []struct {
		file, source string
		want         origin.Origin
	}{
		{"linear-csv/export.csv", "linear:ENG-5", origin.Origin{Kind: "issue", Provider: "linear", ID: "ENG-5"}},
		{"ticktick-csv/backup.csv", "ticktick:t000001", origin.Origin{Kind: "import", Provider: "ticktick", ID: "t000001"}},
		{"things-db/main.sqlite", "things:Xf9iTByDAUh3pJaDtiqMuu", origin.Origin{Kind: "import", Provider: "things", ID: "Xf9iTByDAUh3pJaDtiqMuu"}},
		{"todoist-backup/backup.zip", "todoist:bd82a86e61e4a41f:1", origin.Origin{Kind: "import", Provider: "todoist", ID: "bd82a86e61e4a41f:1"}},
	}
	for _, c := range cases {
		p := parseFixture(t, c.file)
		r := rowBySource(t, p, c.source)
		if r.Origin == nil || *r.Origin != c.want {
			t.Errorf("%s %s: origin = %+v, want %+v", c.file, c.source, r.Origin, c.want)
		}
		// Every task of a named profile with a source identity carries one; nothing else does.
		for _, row := range p.Rows {
			if row.Kind != KindTask && row.Origin != nil {
				t.Errorf("%s: %s %s has an origin", c.file, row.Kind, row.SourceID)
			}
		}
	}
	// The Linear description keeps its identifier prefix.
	if r := rowBySource(t, parseFixture(t, "linear-csv/export.csv"), "linear:ENG-5"); r.Description[:5] != "ENG-5" {
		t.Errorf("description = %q", r.Description)
	}
}

func TestLineNumberedRowsGetNoOrigin(t *testing.T) {
	if o := importedOrigin("ticktick", "ticktick:line:12"); o != nil {
		t.Fatalf("line fallback origin = %+v", o)
	}
	if o := importedOrigin("ticktick", "things:abc"); o != nil {
		t.Fatalf("foreign prefix origin = %+v", o)
	}
}

func TestGenericCSVHasNoOrigin(t *testing.T) {
	p := parse(t, []byte("title,notes\nBuy milk,two litres\nCall mum,\n"), Options{})
	for _, r := range p.Rows {
		if r.Origin != nil {
			t.Fatalf("generic row %q has origin %+v", r.Title, r.Origin)
		}
	}
	h := newHarness(t)
	if job := h.run("title\nBuy milk\n", Options{}); job.Status != StatusDone {
		t.Fatalf("job = %+v", job)
	}
	if n := h.count(`SELECT COUNT(*) FROM ops WHERE field = 'origin'`); n != 0 {
		t.Fatalf("%d origin ops", n)
	}
}

// The own-export round trip keeps a page, an email and an issue origin unchanged.
func TestOwnExportRoundTripKeepsOrigins(t *testing.T) {
	origins := map[string]string{
		"t-page":  `{"kind":"url","url":"https://example.org/post","title":"Interesting article"}`,
		"t-mail":  `{"kind":"email","id":"<a1@mail.example>"}`,
		"t-issue": `{"kind":"issue","provider":"linear","id":"ENG-123"}`,
	}
	var tasks []map[string]any
	for id, o := range origins {
		tasks = append(tasks, map[string]any{"id": id, "title": id, "description": "", "project_id": nil, "parent_id": nil, "priority": 4,
			"due": nil, "labels": []string{}, "position": 1, "created_at": 1760000000000, "completed_at": nil, "deleted_at": nil, "origin": json.RawMessage(o)})
	}
	tasks = append(tasks, map[string]any{"id": "t-plain", "title": "plain", "priority": 4, "labels": []string{}, "position": 2, "created_at": 1760000000000, "origin": nil})
	doc, _ := json.Marshal(map[string]any{"format": "opentodo-export", "version": 1, "tasks": tasks, "projects": []any{}, "labels": []any{}, "views": []any{}})
	h := newHarness(t)
	if job := h.run(string(doc), Options{}); job.Status != StatusDone {
		t.Fatalf("job = %+v", job)
	}
	for id, want := range origins {
		e, err := h.sync.Get(context.Background(), h.uid, "task", id)
		if err != nil || e == nil || !jsonEqual(e["origin"], json.RawMessage(want)) {
			t.Fatalf("%s origin = %s (%v), want %s", id, e["origin"], err, want)
		}
	}
	if e, _ := h.sync.Get(context.Background(), h.uid, "task", "t-plain"); e == nil || !isNull(e["origin"]) && e["origin"] != nil {
		t.Fatalf("plain origin = %s", e["origin"])
	}
}
