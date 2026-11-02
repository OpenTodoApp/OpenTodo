package httpapi

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Count checks of the performance budgets (OpenSpec change performance-10k):
// counts, not times, so they cannot flake on a slow runner.

// seedTasks writes n tasks of five fields into project (or the Inbox) for the
// signed-in user, through the op log.
func (e *env) seedTasks(user, project string, from, n int) {
	e.t.Helper()
	for start := from; start < from+n; start += 150 {
		var ops []opsync.Op
		for i := start; i < min(start+150, from+n); i++ {
			id := fmt.Sprintf("t%06d", i)
			add := func(f, v string) {
				ops = append(ops, opsync.Op{ID: fmt.Sprintf("%s-%s", id, f), Entity: "task", EntityID: id, Field: f, Value: []byte(v), TS: int64(1_000_000 + i), Device: "seed"})
			}
			add("title", fmt.Sprintf(`"Task %d"`, i))
			add("position", fmt.Sprint(i))
			add("created_at", "1")
			add("description", `"Some notes about the task, a sentence or two long."`)
			if project != "" {
				add("project_id", fmt.Sprintf("%q", project))
			}
		}
		if _, err := e.sync.ApplyStrict(context.Background(), user, ops); err != nil {
			e.t.Fatal(err)
		}
	}
}

// TestExportAllocationsPerTask: the JSON export's allocations grow by a bounded
// number per task, so a change that allocates per field or re-reads per task
// fails here.
func TestExportAllocationsPerTask(t *testing.T) {
	e := newEnv(t, false)
	e.register("a@example.com")
	uid := e.ownerID()
	secret := e.token("full")
	allocs := func() float64 {
		return testing.AllocsPerRun(3, func() {
			req := httptest.NewRequest("GET", "/api/v1/export", nil)
			req.Header.Set("Authorization", "Bearer "+secret)
			rec := httptest.NewRecorder()
			e.handler.ServeHTTP(rec, req)
			if rec.Code != http.StatusOK {
				t.Fatalf("export: %d %s", rec.Code, rec.Body.String())
			}
		})
	}
	e.seedTasks(uid, "", 0, 500)
	small := allocs()
	e.seedTasks(uid, "", 500, 1500)
	large := allocs()
	per := (large - small) / 1500
	t.Logf("export allocations: %.0f with 500 tasks, %.0f with 2,000: %.1f per task", small, large, per)
	// Measured 2026-11-02: about 113 per task of five fields (reading the
	// rows, the entity map, the JSON encoding). The bound leaves room for a
	// field or two, not for a per-task query or a per-field copy of the list.
	if per > 200 {
		t.Fatalf("the export allocates %.1f times per task, want at most 200", per)
	}
}

// TestListOneProject: GET /api/v1/tasks?project_id= lists that project's tasks
// only, and refuses the parameter where items have no project.
func TestListOneProject(t *testing.T) {
	e := newEnv(t, false)
	e.register("a@example.com")
	uid := e.ownerID()
	big := e.newProject(map[string]any{"name": "Big"})
	other := e.newProject(map[string]any{"name": "Other"})
	e.seedTasks(uid, big, 0, 40)
	e.seedTasks(uid, other, 40, 10)
	e.seedTasks(uid, "", 50, 5)
	resp, out := e.do("DELETE", "/api/v1/tasks/t000003", nil)
	e.mustStatus(resp, 204, out)
	resp, out = e.do("GET", "/api/v1/tasks?project_id="+big, nil)
	e.mustStatus(resp, 200, out)
	tasks := out["tasks"].([]any)
	if len(tasks) != 39 {
		t.Fatalf("listed %d tasks of the project, want 39", len(tasks))
	}
	for i, x := range tasks {
		if x.(map[string]any)["project_id"] != big {
			t.Fatalf("task %d is in %v", i, x.(map[string]any)["project_id"])
		}
	}
	if first := tasks[0].(map[string]any)["id"]; first != "t000000" {
		t.Fatalf("first task %v: the list keeps its order", first)
	}
	resp, out = e.do("GET", "/api/v1/tasks?project_id="+big+"&include_deleted=true", nil)
	e.mustStatus(resp, 200, out)
	if n := len(out["tasks"].([]any)); n != 40 {
		t.Fatalf("with deleted: %d", n)
	}
	for _, path := range []string{"/api/v1/tasks?project_id=", "/api/v1/labels?project_id=" + big} {
		resp, out = e.do("GET", path, nil)
		e.mustStatus(resp, 400, out)
	}
	resp, out = e.do("GET", "/api/v1/tasks?project_id=nope", nil)
	e.mustStatus(resp, 200, out)
	if n := len(out["tasks"].([]any)); n != 0 {
		t.Fatalf("unknown project lists %d", n)
	}
}
