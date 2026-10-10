package httpapi

import (
	"testing"
)

func TestHistoryRequiresAuthAnd404(t *testing.T) {
	e := ownerEnv(t)
	anon := newClientFor(e)
	resp, out := anon.do("GET", "/api/v1/tasks/t1/history", nil)
	anon.mustStatus(resp, 401, out)
	if out["error"].(map[string]any)["code"] != "unauthorized" {
		t.Fatalf("anon history = %v", out)
	}

	e.syncOps("laptop", map[string]any{"id": "o1", "entity": "task", "entityId": "t1", "field": "title", "value": "Draft", "ts": 100, "device": "laptop"})
	e.syncOps("phone", map[string]any{"id": "o2", "entity": "task", "entityId": "t1", "field": "title", "value": "Final", "ts": 200, "device": "phone"})
	resp, out = e.do("PATCH", "/api/v1/tasks/t1", map[string]any{"due": map[string]any{"date": "2026-10-11"}})
	e.mustStatus(resp, 200, out)

	resp, out = e.do("GET", "/api/v1/tasks/t1/history", nil)
	e.mustStatus(resp, 200, out)
	sets := out["changeSets"].([]any)
	if len(sets) != 3 {
		t.Fatalf("change sets = %v", sets)
	}
	for i, want := range []string{"laptop", "phone", "server"} {
		if d := sets[i].(map[string]any)["device"]; d != want {
			t.Fatalf("set %d device = %v, want %s", i, d, want)
		}
	}
	phone := sets[1].(map[string]any)["changes"].([]any)[0].(map[string]any)
	if phone["from"] != "Draft" || phone["to"] != "Final" {
		t.Fatalf("phone change = %v", phone)
	}

	resp, out = e.do("GET", "/api/v1/tasks/nope/history", nil)
	e.mustStatus(resp, 404, out)
	resp, out = e.do("GET", "/api/v1/projects/t1/history", nil)
	e.mustStatus(resp, 404, out)
	resp, out = e.do("GET", "/api/v1/tasks/t1/history?before=soon", nil)
	e.mustStatus(resp, 400, out)

	// Another account cannot read it.
	if _, err := e.sync.History(t.Context(), "someone-else", "task", "t1", 0, 0); err == nil {
		t.Fatal("another account read the history")
	}
}

func TestPurgeRejectsLiveEntity(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Keep me"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)

	resp, out = e.do("DELETE", "/api/v1/tasks/"+id+"/purge", nil)
	e.mustStatus(resp, 409, out)
	if out["error"].(map[string]any)["code"] != "not_deleted" {
		t.Fatalf("purge live = %v", out)
	}
	resp, out = e.do("GET", "/api/v1/tasks/"+id, nil)
	e.mustStatus(resp, 200, out)

	resp, out = e.do("DELETE", "/api/v1/tasks/missing/purge", nil)
	e.mustStatus(resp, 404, out)

	// Delete then purge: gone from export and history.
	resp, out = e.do("DELETE", "/api/v1/tasks/"+id, nil)
	e.mustStatus(resp, 204, out)
	resp, out = e.do("DELETE", "/api/v1/tasks/"+id+"/purge", nil)
	e.mustStatus(resp, 200, out)
	if out["purged"].(map[string]any)["tasks"] != float64(1) {
		t.Fatalf("purge = %v", out)
	}
	resp, out = e.do("GET", "/api/v1/tasks/"+id+"/history", nil)
	e.mustStatus(resp, 404, out)
	resp, out = e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, 200, out)
	if tasks := out["tasks"].([]any); len(tasks) != 0 {
		t.Fatalf("export still has %v", tasks)
	}
	// The sync response reports the purge to devices.
	resp, out = e.do("POST", "/api/v1/sync", map[string]any{"device": "d2", "cursor": 0, "ops": []any{}})
	e.mustStatus(resp, 200, out)
	purged := out["purged"].([]any)
	if len(purged) != 1 || purged[0].(map[string]any)["entityId"] != id {
		t.Fatalf("sync purged = %v", out["purged"])
	}
	if _, ok := out["trashRetentionDays"]; !ok {
		t.Fatal("sync response lacks trashRetentionDays")
	}
	// A stale offline edit is discarded as a duplicate.
	resp, out = e.do("POST", "/api/v1/sync", map[string]any{"device": "d2", "cursor": 0, "ops": []any{
		map[string]any{"id": "stale", "entity": "task", "entityId": id, "field": "title", "value": "back", "ts": 1, "device": "d2"},
	}})
	e.mustStatus(resp, 200, out)
	if out["applied"] != float64(0) || out["duplicates"] != float64(1) {
		t.Fatalf("stale edit = %v", out)
	}
}

func TestTrashPurgeRequiresAuth(t *testing.T) {
	e := ownerEnv(t)
	anon := newClientFor(e)
	for _, r := range [][2]string{{"POST", "/api/v1/trash/purge"}, {"DELETE", "/api/v1/tasks/x/purge"}, {"DELETE", "/api/v1/projects/x/purge"}, {"GET", "/api/v1/projects/x/history"}} {
		resp, out := anon.do(r[0], r[1], nil)
		anon.mustStatus(resp, 401, out)
	}
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "a"})
	e.mustStatus(resp, 201, out)
	a := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "b"})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("DELETE", "/api/v1/tasks/"+a, nil)
	e.mustStatus(resp, 204, out)
	resp, out = e.do("POST", "/api/v1/trash/purge", nil)
	e.mustStatus(resp, 200, out)
	if out["purged"].(map[string]any)["tasks"] != float64(1) {
		t.Fatalf("empty trash = %v", out)
	}
	resp, out = e.do("GET", "/api/v1/tasks", nil)
	e.mustStatus(resp, 200, out)
	if n := len(out["tasks"].([]any)); n != 1 {
		t.Fatalf("live tasks after emptying trash = %d", n)
	}
}

func TestProjectDeleteKeepsTaskReferences(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Garden"})
	e.mustStatus(resp, 201, out)
	pid := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Mow", "project_id": pid})
	e.mustStatus(resp, 201, out)
	tid := out["id"].(string)

	resp, out = e.do("DELETE", "/api/v1/projects/"+pid, nil)
	e.mustStatus(resp, 204, out)
	resp, out = e.do("GET", "/api/v1/tasks/"+tid, nil)
	e.mustStatus(resp, 200, out)
	if out["project_id"] != pid {
		t.Fatalf("task moved out of the trashed project: %v", out)
	}
	// Restoring the project is a single field write.
	resp, out = e.do("PATCH", "/api/v1/projects/"+pid, map[string]any{"deleted_at": nil})
	e.mustStatus(resp, 200, out)
	resp, out = e.do("GET", "/api/v1/projects/"+pid, nil)
	e.mustStatus(resp, 200, out)
	resp, out = e.do("GET", "/api/v1/tasks/"+tid, nil)
	e.mustStatus(resp, 200, out)
	if out["project_id"] != pid {
		t.Fatalf("task lost its project: %v", out)
	}
}
