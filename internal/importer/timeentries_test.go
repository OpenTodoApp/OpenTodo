package importer

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

// ownExportWithEntries is an own export holding 40 entries of the exporting
// account (one deleted, one running) and 3 another member wrote (time-tracking D11).
func ownExportWithEntries() string {
	var entries []string
	for i := 0; i < 40; i++ {
		end, del := fmt.Sprint(1792396800000+int64(i)*3600000+1800000), "null"
		if i == 0 {
			del = "1792400000000"
		}
		if i == 39 {
			end = "null"
		}
		entries = append(entries, fmt.Sprintf(`{"id":"e%d","task_id":"t1","user_id":"exporter","started_at":%d,"ended_at":%s,"device_id":"laptop","note":"n%d","created_at":1,"deleted_at":%s}`,
			i, 1792396800000+int64(i)*3600000, end, i, del))
	}
	for i := 0; i < 3; i++ {
		entries = append(entries, fmt.Sprintf(`{"id":"f%d","task_id":"t1","user_id":"someone-else","started_at":1792396800000,"ended_at":1792398600000,"device_id":"x","note":"","created_at":1,"deleted_at":null}`, i))
	}
	return `{"format":"opentodo-export","version":1,"userId":"exporter",
		"tasks":[{"id":"t1","title":"Offer","project_id":null,"priority":4,"labels":[],"position":1,"created_at":1,"completed_at":null,"deleted_at":null}],
		"time_entries":[` + strings.Join(entries, ",") + `]}`
}

func TestRoundTripKeepsTimeEntries(t *testing.T) {
	h := newHarness(t)
	file := ownExportWithEntries()
	plan, err := h.svc.Preview(context.Background(), h.uid, []byte(file), Options{})
	if err != nil {
		t.Fatal(err)
	}
	if plan.Totals.TimeEntries != 40 {
		t.Fatalf("totals = %+v", plan.Totals)
	}
	found := false
	for _, n := range plan.Notes {
		found = found || strings.HasPrefix(n, "3 time entries of other accounts are not imported")
	}
	if !found {
		t.Fatalf("notes = %v", plan.Notes)
	}
	job := h.run(file, Options{})
	if job.Status != StatusDone {
		t.Fatalf("job = %+v", job)
	}
	list, err := h.sync.List(context.Background(), h.uid, "time_entry", true)
	if err != nil || len(list) != 40 {
		t.Fatalf("entries = %d, %v", len(list), err)
	}
	deleted, running := 0, 0
	for _, e := range list {
		var who string
		_ = json.Unmarshal(e["user_id"], &who)
		if who != h.uid {
			t.Fatalf("entry under %q, want the importing account", who)
		}
		if !isNull(e["deleted_at"]) {
			deleted++
		}
		if isNull(e["ended_at"]) {
			running++
		}
	}
	if deleted != 1 || running != 1 {
		t.Fatalf("deleted %d running %d", deleted, running)
	}
	if e, _ := h.sync.Get(context.Background(), h.uid, "time_entry", "e5"); str(e, "note") != "n5" || string(e["started_at"]) != "1792414800000" {
		t.Fatalf("e5 = %v", e)
	}
}
