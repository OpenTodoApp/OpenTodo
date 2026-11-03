package importer

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// The export format guarantee (OpenSpec change `stability-contract`, design D6;
// docs/stability.md "The export format"): every version 1 export a released
// version wrote still imports. The upgrade fixtures keep each minor version's
// own export (internal/store/testdata/upgrade/<minor>/export.json, written by
// scripts/release/upgrade-fixture.sh); each is imported into an empty account
// and everything in it must arrive through the operation log. Comments are the
// one exception data-import makes on purpose (a comment keeps its author, an
// account of the exporting server): the import names them in its notes.

func TestReleasedExportsImport(t *testing.T) {
	files, err := filepath.Glob("../store/testdata/upgrade/*/export.json")
	if err != nil || len(files) == 0 {
		t.Fatal("no released exports under internal/store/testdata/upgrade")
	}
	for _, f := range files {
		t.Run(filepath.Base(filepath.Dir(f)), func(t *testing.T) { checkReleasedExport(t, f) })
	}
}

func checkReleasedExport(t *testing.T, file string) {
	raw, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	var doc map[string]json.RawMessage
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	var format string
	var version int
	_ = json.Unmarshal(doc["format"], &format)
	_ = json.Unmarshal(doc["version"], &version)
	if format != "opentodo-export" || version != 1 {
		t.Fatalf("%s: format %q version %d, want opentodo-export 1", file, format, version)
	}
	h := newHarness(t)
	plan, err := h.svc.Preview(context.Background(), h.uid, raw, Options{})
	if err != nil {
		t.Fatalf("%s: preview: %v", file, err)
	}
	if n := liveIn(t, doc["comments"]); n > 0 && !slices.ContainsFunc(plan.Notes, func(s string) bool { return strings.Contains(s, fmt.Sprintf("%d comments are not imported", n)) }) {
		t.Errorf("%s: the preview does not report the %d comments it leaves out: %v", file, n, plan.Notes)
	}
	job := h.run(string(raw), Options{})
	if job.Status != "done" {
		t.Fatalf("%s: import %s: %+v", file, job.Status, job)
	}
	// Every live (not deleted) entity of the file arrives.
	for key, entity := range map[string]string{
		"projects": "project", "sections": "section", "labels": "label", "tasks": "task",
		"time_entries": "time_entry", "reminders": "reminder",
	} {
		want := liveIn(t, doc[key])
		if want < 0 {
			continue // the version did not export this list
		}
		if got := len(h.list(entity, false)); got != want {
			t.Errorf("%s: %d %s imported, the file has %d", filepath.Dir(file), got, key, want)
		}
	}
	// The default workspace's items land in the importing account's default;
	// every other workspace is the account's own afterwards.
	var exported []ExportedWorkspace
	_ = json.Unmarshal(doc["workspaces"], &exported)
	mine, err := h.sync.Workspaces(context.Background(), h.uid)
	if err != nil {
		t.Fatal(err)
	}
	for _, w := range exported {
		if !w.Default && !slices.ContainsFunc(mine, func(m opsync.Workspace) bool { return strings.EqualFold(m.Name, w.Name) }) {
			t.Errorf("%s: workspace %q did not arrive", filepath.Dir(file), w.Name)
		}
	}
	// Nothing arrived around the operation log: every imported row has ops.
	for _, entity := range []string{"project", "section", "label", "task"} {
		for _, e := range h.list(entity, false) {
			if h.count(`SELECT COUNT(*) FROM ops WHERE entity = ? AND entity_id = ?`, entity, idOf(e)) == 0 {
				t.Errorf("%s: %s %s has no ops", filepath.Dir(file), entity, idOf(e))
			}
		}
	}
}

// liveIn counts the entries of an export list without deleted_at; -1 when the
// list is absent.
func liveIn(t *testing.T, raw json.RawMessage) int {
	t.Helper()
	if raw == nil {
		return -1
	}
	var list []map[string]any
	if err := json.Unmarshal(raw, &list); err != nil {
		t.Fatal(err)
	}
	n := 0
	for _, e := range list {
		if e["deleted_at"] == nil {
			n++
		}
	}
	return n
}

func idOf(e opsync.Entity) string {
	var id string
	_ = json.Unmarshal(e["id"], &id)
	return id
}
