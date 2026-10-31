package importer

import (
	"context"
	"strings"
	"testing"
	"time"
)

// OpenSpec change task-energy, design D7: the CSV column `energy` sets the
// level, ignoring case; any other value is reported and left out. The own
// export carries the field through.
func TestCSVEnergyColumn(t *testing.T) {
	p, err := parseWith(t, []byte("title,energy\nDraft,Deep\nFile,low\nClimb,HIGH\nRest,\n"), nil)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(strings.Join(p.Recognised, ","), "energy") {
		t.Fatalf("recognised = %v", p.Recognised)
	}
	if p.Rows[0].Energy != "deep" || p.Rows[1].Energy != "low" || p.Rows[3].Energy != "" {
		t.Fatalf("rows = %+v", p.Rows)
	}
	if r := p.Rows[2]; r.Energy != "" || r.Err != "" || len(r.Warnings) != 1 || !strings.Contains(r.Warnings[0], `"HIGH"`) {
		t.Fatalf("invalid row = %+v", r)
	}
}

func TestEnergyImportAndOwnRoundTrip(t *testing.T) {
	h := newHarness(t)
	h.fixedNow(time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC))
	if job := h.run("title,energy\nDraft,deep\nClimb,high\n", Options{TimeZone: "UTC"}); job.Status != StatusDone {
		t.Fatalf("job = %+v", job)
	}
	got := map[string]string{}
	for _, task := range h.list("task", false) {
		got[str(task, "title")] = str(task, "energy")
	}
	if got["Draft"] != "deep" || got["Climb"] != "" {
		t.Fatalf("tasks = %v", got)
	}
	own := `{"format":"opentodo-export","version":2,"projects":[],"labels":[],"tasks":[{"id":"t-own","title":"Own","priority":4,"labels":[],"position":1,"created_at":1,"completed_at":null,"deleted_at":null,"due":null,"energy":"medium","project_id":null,"parent_id":null,"description":""}]}`
	if job := h.run(own, Options{}); job.Status != StatusDone {
		t.Fatalf("own job = %+v", job)
	}
	e, err := h.sync.Get(context.Background(), h.uid, "task", "t-own")
	if err != nil || e == nil || str(e, "energy") != "medium" {
		t.Fatalf("own export task = %v %v", e, err)
	}
}
