package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"
)

// deliveryCounts returns the queued deliveries per event.
func (e *env) deliveryCounts() map[string]int {
	e.t.Helper()
	rows, err := e.db.Query(`SELECT event, COUNT(*) FROM webhook_deliveries GROUP BY event`)
	if err != nil {
		e.t.Fatal(err)
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var ev string
		var n int
		if err := rows.Scan(&ev, &n); err != nil {
			e.t.Fatal(err)
		}
		out[ev] = n
	}
	return out
}

// waitDeliveries polls until event has n queued deliveries (the summary is
// queued right after the job's final state is stored).
func (e *env) waitDeliveries(event string, n int) map[string]int {
	e.t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for {
		got := e.deliveryCounts()
		if got[event] >= n || time.Now().After(deadline) {
			return got
		}
		time.Sleep(10 * time.Millisecond)
	}
}

// An import of N tasks produces one import.completed delivery per subscribed
// webhook instead of N task.created deliveries; undo produces one
// import.undone; an ordinary REST create still emits task.created
// (harden-server-edges).
func TestImportSendsOneWebhookSummary(t *testing.T) {
	e := ownerEnv(t)
	e.allowPrivate(true)
	rcv := newHookReceiver(t)
	all := e.createHook(map[string]any{"url": rcv.srv.URL, "events": []string{"task.created", "project.created", "import.completed", "import.undone"}})
	perTask := e.createHook(map[string]any{"url": rcv.srv.URL, "events": []string{"task.created"}})
	other := e.createHook(map[string]any{"url": rcv.srv.URL, "events": []string{"import.completed"}, "projectId": "not-touched"})
	_ = perTask
	_ = other

	const n = 120
	var b strings.Builder
	b.WriteString("title,project\n")
	for i := 1; i <= n; i++ {
		fmt.Fprintf(&b, "Task %d,Work\n", i)
	}
	job := e.importAndWait("tasks.csv", []byte(b.String()), nil)
	if job["status"] != "done" {
		t.Fatalf("job = %v", job)
	}
	got := e.waitDeliveries("import.completed", 1)
	if got["import.completed"] != 1 || got["task.created"] != 0 || got["project.created"] != 0 || len(got) != 1 {
		t.Fatalf("deliveries after import = %v", got)
	}
	var payload string
	if err := e.db.QueryRow(`SELECT payload FROM webhook_deliveries WHERE event = 'import.completed'`).Scan(&payload); err != nil {
		t.Fatal(err)
	}
	var body struct {
		Event     string `json:"event"`
		Source    string `json:"source"`
		WebhookID string `json:"webhook_id"`
		Data      struct {
			Import struct {
				ID         string                    `json:"id"`
				Status     string                    `json:"status"`
				Format     string                    `json:"format"`
				Counts     map[string]map[string]int `json:"counts"`
				ProjectIDs []string                  `json:"project_ids"`
				Totals     map[string]any            `json:"totals"`
			} `json:"import"`
		} `json:"data"`
	}
	if err := json.Unmarshal([]byte(payload), &body); err != nil {
		t.Fatal(err)
	}
	imp := body.Data.Import
	if body.Event != "import.completed" || body.Source != "import" || body.WebhookID != all["id"] || imp.ID != job["id"] || imp.Status != "done" || imp.Format != "csv" {
		t.Fatalf("payload = %s", payload)
	}
	if imp.Counts["task"]["created"] != n || imp.Counts["project"]["created"] != 1 || len(imp.ProjectIDs) != 1 || imp.Totals["written"] != float64(n+1) {
		t.Fatalf("summary = %+v", imp)
	}
	// The summary is delivered and signed like any other event.
	for e.hooks.ProcessDue(context.Background()) > 0 {
	}
	if rcv.requests() != 1 {
		t.Fatalf("receiver saw %d requests", rcv.requests())
	}

	// Undo: one import.undone, no task.deleted fan-out.
	resp, out := e.do("POST", "/api/v1/import/jobs/"+job["id"].(string)+"/undo", nil)
	e.mustStatus(resp, 200, out)
	got = e.waitDeliveries("import.undone", 1)
	if got["import.undone"] != 1 || got["task.deleted"] != 0 || got["task.created"] != 0 {
		t.Fatalf("deliveries after undo = %v", got)
	}

	// A normal REST create keeps its per-event delivery for both subscribed hooks.
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "By hand"})
	e.mustStatus(resp, 201, out)
	if got = e.deliveryCounts(); got["task.created"] != 2 {
		t.Fatalf("deliveries after REST create = %v", got)
	}
}
