package importer

import (
	"context"
	"testing"
)

// TestProjectDescriptionImport (project-notes 5.2): a created project gets the
// file's description; an existing project keeps its own; undo removes it.
func TestProjectDescriptionImport(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	h.write("phone", 1, "project", "home", map[string]any{"name": "Home", "description": "My own note"})
	file := `{"projects":[{"name":"Trip","description":"Flights booked, hotel pending"},{"name":"Home","notes":"From the file"}],"tasks":[{"title":"Pack","project":"Trip"}]}`
	job := h.run(file, Options{})
	if job.Status != StatusDone {
		t.Fatalf("job = %+v", job)
	}
	var trip string
	for _, p := range h.list("project", false) {
		switch str(p, "name") {
		case "Trip":
			trip = str(p, "id")
			if str(p, "description") != "Flights booked, hotel pending" {
				t.Fatalf("trip = %v", p)
			}
		case "Home":
			if str(p, "description") != "My own note" {
				t.Fatalf("existing project changed: %v", p)
			}
		}
	}
	if trip == "" {
		t.Fatal("Trip not created")
	}
	if _, err := h.svc.Undo(ctx, h.uid, job.ID); err != nil {
		t.Fatal(err)
	}
	p, _ := h.sync.Get(ctx, h.uid, "project", trip)
	if p == nil || len(p["deleted_at"]) == 0 || string(p["deleted_at"]) == "null" {
		t.Fatalf("undo left the project: %v", p)
	}
}
