package importer

import (
	"context"
	"encoding/json"
	"testing"
)

// task-locations "Places", scenario "Export round trip": an own export's places
// and the tasks' links to them are restored in a fresh account.
func TestRoundTripKeepsPlacesAndLocations(t *testing.T) {
	h := newHarness(t)
	file := `{"format":"opentodo-export","version":1,"userId":"exporter",
		"places":[
			{"id":"pl1","name":"Office","address":"Via Roma 1, Torino","geo":{"lat":45.07,"lon":7.68},"position":1,"created_at":1,"deleted_at":null},
			{"id":"pl2","name":"Old gym","address":"","geo":null,"position":2,"created_at":1,"deleted_at":1700000000000}],
		"tasks":[{"id":"t1","title":"Print the slides","project_id":null,"priority":4,"labels":[],"position":1,"created_at":1,"completed_at":null,"deleted_at":null,
			"location":{"name":"Office","address":"Via Roma 1, Torino","lat":45.07,"lon":7.68,"place_id":"pl1"}}]}`
	plan, err := h.svc.Preview(context.Background(), h.uid, []byte(file), Options{})
	if err != nil {
		t.Fatal(err)
	}
	if plan.Totals.Places != 1 {
		t.Fatalf("totals = %+v", plan.Totals)
	}
	if job := h.run(file, Options{}); job.Status != StatusDone {
		t.Fatalf("job = %+v", job)
	}
	places, err := h.sync.List(context.Background(), h.uid, "place", true)
	if err != nil || len(places) != 2 {
		t.Fatalf("places = %d, %v", len(places), err)
	}
	task, err := h.sync.Get(context.Background(), h.uid, "task", "t1")
	if err != nil {
		t.Fatal(err)
	}
	var loc struct {
		Name    string `json:"name"`
		PlaceID string `json:"place_id"`
	}
	if err := json.Unmarshal(task["location"], &loc); err != nil || loc.Name != "Office" || loc.PlaceID != "pl1" {
		t.Fatalf("location = %s, %v", task["location"], err)
	}
}

// An invalid location in a file is a row error, not a write.
func TestImportRefusesInvalidLocation(t *testing.T) {
	h := newHarness(t)
	file := `{"format":"opentodo-export","version":1,"userId":"exporter",
		"tasks":[{"id":"t1","title":"x","project_id":null,"priority":4,"labels":[],"position":1,"created_at":1,"completed_at":null,"deleted_at":null,"location":{"lat":45}}]}`
	plan, err := h.svc.Preview(context.Background(), h.uid, []byte(file), Options{})
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Rows) != 1 || plan.Rows[0].Outcome != OutcomeError {
		t.Fatalf("rows = %+v", plan.Rows)
	}
}
