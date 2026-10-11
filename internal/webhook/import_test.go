package webhook

import (
	"context"
	"encoding/json"
	"slices"
	"testing"

	"github.com/pixari/opentodo/internal/importer"
)

// Import summaries (harden-server-edges): import ops never fan out per entity;
// one summary reaches the importer's webhooks and, for a shared project the
// import touched, the members' webhooks with only the projects they share. A
// project filter matches when its project is among them.
func TestImportSummaryAudienceAndFilter(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	rcv := newReceiver(t)
	// u1 shares project "shared" with u2; "private" stays u1's.
	h.apply("u1", setOp("project", "shared", "name", `"Team"`), setOp("project", "private", "name", `"Mine"`))
	if _, err := h.sync.AddMember(ctx, "u1", "shared", "u2", "editor"); err != nil {
		t.Fatal(err)
	}
	ev := []string{"task.created", importer.EventCompleted}
	mine := h.create("u1", rcv.srv.URL, ev, nil)
	privateOnly := "private"
	filtered := h.create("u1", rcv.srv.URL, ev, &privateOnly)
	theirs := h.create("u2", rcv.srv.URL, ev, nil)
	elsewhere := "elsewhere"
	theirsFiltered := h.create("u2", rcv.srv.URL, ev, &elsewhere)

	// Ops written by the importer produce no per-entity deliveries.
	op := setOp("task", "t1", "title", `"Imported"`)
	op.Device = importer.Device
	created := setOp("task", "t1", "created_at", `1`)
	created.Device = importer.Device
	h.apply("u1", op, created)
	for _, w := range []*Webhook{mine, filtered, theirs, theirsFiltered} {
		if n := len(h.deliveries(w.ID)); n != 0 {
			t.Fatalf("import op queued %d deliveries for %s", n, w.ID)
		}
	}

	h.hooks.ObserveImport(ctx, importer.Summary{UserID: "u1", JobID: "job1", Event: importer.EventCompleted, Format: "csv", Status: "done",
		Counts: map[string]map[string]int{"task": {"created": 2}}, ProjectIDs: []string{"private", "shared"}})
	want := map[string][]string{mine.ID: {"private", "shared"}, filtered.ID: {"private", "shared"}, theirs.ID: {"shared"}}
	for _, w := range []*Webhook{mine, filtered, theirs, theirsFiltered} {
		list := h.deliveries(w.ID)
		projects, expected := want[w.ID]
		if !expected {
			if len(list) != 0 {
				t.Fatalf("webhook %s got %d deliveries", w.ID, len(list))
			}
			continue
		}
		if len(list) != 1 || list[0].Event != importer.EventCompleted {
			t.Fatalf("webhook %s deliveries = %+v", w.ID, list)
		}
		var payload string
		if err := h.db.QueryRow(`SELECT payload FROM webhook_deliveries WHERE id = ?`, list[0].ID).Scan(&payload); err != nil {
			t.Fatal(err)
		}
		var body struct {
			Data struct {
				Import struct {
					ProjectIDs []string `json:"project_ids"`
				} `json:"import"`
			} `json:"data"`
		}
		if err := json.Unmarshal([]byte(payload), &body); err != nil {
			t.Fatal(err)
		}
		if !slices.Equal(body.Data.Import.ProjectIDs, projects) {
			t.Fatalf("webhook %s project_ids = %v, want %v", w.ID, body.Data.Import.ProjectIDs, projects)
		}
	}
	h.drain()
	if rcv.count() != 3 {
		t.Fatalf("receiver saw %d requests", rcv.count())
	}
}
