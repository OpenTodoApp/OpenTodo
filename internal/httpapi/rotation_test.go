package httpapi

import (
	"fmt"
	"strings"
	"testing"
)

// Rotating assignees through the API (OpenSpec change chore-rotation, design D6).

// rotatingHouse shares the project with bob (editor) and carol (viewer) and
// makes the task a weekly series assigned to alice.
func rotatingHouse(t *testing.T) *shareEnv {
	t.Helper()
	se := newShareEnv(t)
	se.share(se.alice, "bob@example.com", "editor")
	se.share(se.alice, "carol@example.com", "viewer")
	resp, out := se.alice.do("PATCH", "/api/v1/tasks/"+se.task, map[string]any{
		"recurrence": "every monday", "due": map[string]any{"date": "2026-11-09"}, "assignee_id": se.ids["alice"]})
	se.alice.mustStatus(resp, 200, out)
	return se
}

func TestRotationThroughTheAPI(t *testing.T) {
	se := rotatingHouse(t)
	task := "/api/v1/tasks/" + se.task
	if got := fmt.Sprint(se.alice.task(se.task)["rotation"]); got != "[]" {
		t.Fatalf("unset rotation reads %s", got)
	}
	// Without credentials: 401, nothing changes.
	anon := newClientFor(se.alice)
	resp, out := anon.do("PATCH", task, map[string]any{"rotation": []string{se.ids["alice"], se.ids["bob"]}})
	anon.mustStatus(resp, 401, out)
	if errCode(out) != "unauthorized" {
		t.Fatalf("anon: %v", out)
	}
	// A viewer: 403.
	resp, out = se.carol.do("PATCH", task, map[string]any{"rotation": []string{se.ids["alice"], se.ids["bob"]}})
	se.carol.mustStatus(resp, 403, out)
	if errCode(out) != "forbidden" {
		t.Fatalf("viewer: %v", out)
	}
	// Duplicates, too many people: 400 invalid_rotation.
	for _, bad := range [][]string{{se.ids["alice"], se.ids["alice"]}, strings.Split(strings.Repeat("x,", 20)+"y", ",")} {
		resp, out = se.alice.do("PATCH", task, map[string]any{"rotation": bad})
		se.alice.mustStatus(resp, 400, out)
		if errCode(out) != "invalid_rotation" {
			t.Fatalf("bad %v: %v", bad, out)
		}
	}
	// A non-member: 409 not_a_member.
	resp, out = se.alice.do("PATCH", task, map[string]any{"rotation": []string{se.ids["alice"], "stranger"}})
	se.alice.mustStatus(resp, 409, out)
	if errCode(out) != "not_a_member" {
		t.Fatalf("stranger: %v", out)
	}
	// Set: 200 with the rotation, and every member sees it.
	resp, out = se.alice.do("PATCH", task, map[string]any{"rotation": []string{se.ids["alice"], se.ids["bob"]}})
	se.alice.mustStatus(resp, 200, out)
	want := fmt.Sprint([]any{se.ids["alice"], se.ids["bob"]})
	if fmt.Sprint(out["rotation"]) != want || fmt.Sprint(se.bob.task(se.task)["rotation"]) != want {
		t.Fatalf("rotation = %v", out["rotation"])
	}
	// Completing through the API passes the turn.
	resp, out = se.alice.do("PATCH", task, map[string]any{"completed_at": 1})
	se.alice.mustStatus(resp, 200, out)
	if out["assignee_id"] != se.ids["bob"] || out["completed_at"] != nil {
		t.Fatalf("after completion: %v", out)
	}
	// The assignee's own write keeps its choice.
	resp, out = se.bob.do("PATCH", task, map[string]any{"completed_at": 2, "assignee_id": se.ids["bob"]})
	se.bob.mustStatus(resp, 200, out)
	if out["assignee_id"] != se.ids["bob"] {
		t.Fatalf("explicit assignee: %v", out["assignee_id"])
	}
	// Clearing is always allowed.
	resp, out = se.alice.do("PATCH", task, map[string]any{"rotation": []string{}})
	se.alice.mustStatus(resp, 200, out)
	if fmt.Sprint(out["rotation"]) != "[]" {
		t.Fatalf("cleared = %v", out["rotation"])
	}
}

func TestRotationNeedsARecurringSharedTask(t *testing.T) {
	se := newShareEnv(t)
	two := []string{se.ids["alice"], se.ids["bob"]}
	// Not shared yet: one member.
	se.alice.do("PATCH", "/api/v1/tasks/"+se.task, map[string]any{"recurrence": "every day"})
	resp, out := se.alice.do("PATCH", "/api/v1/tasks/"+se.task, map[string]any{"rotation": []string{se.ids["alice"]}})
	se.alice.mustStatus(resp, 400, out)
	if errCode(out) != "invalid_rotation" {
		t.Fatalf("single member: %v", out)
	}
	se.share(se.alice, "bob@example.com", "editor")
	// Not recurring.
	resp, out = se.alice.do("POST", "/api/v1/tasks", map[string]any{"title": "Lamp", "project_id": se.project, "rotation": two})
	se.alice.mustStatus(resp, 400, out)
	if errCode(out) != "invalid_rotation" {
		t.Fatalf("no rule: %v", out)
	}
	// A subtask of a series.
	resp, out = se.alice.do("POST", "/api/v1/tasks", map[string]any{"title": "Sub", "project_id": se.project, "parent_id": se.task,
		"recurrence": "every day", "rotation": two})
	se.alice.mustStatus(resp, 400, out)
	if errCode(out) != "invalid_rotation" {
		t.Fatalf("subtask: %v", out)
	}
	// A recurring task created with a rotation is fine.
	resp, out = se.alice.do("POST", "/api/v1/tasks", map[string]any{"title": "Bins", "project_id": se.project, "recurrence": "every monday", "rotation": two})
	se.alice.mustStatus(resp, 201, out)
}

// TestCaldavCompletionRotates: a calendar app completing the occurrence
// rotates the assignee on the server, as the app would.
func TestCaldavCompletionRotates(t *testing.T) {
	se := rotatingHouse(t)
	se.alice.do("PATCH", "/api/v1/tasks/"+se.task, map[string]any{"rotation": []string{se.ids["alice"], se.ids["bob"]}})
	se.alice.do("PUT", "/api/v1/settings/caldav", map[string]any{"enabled": true})
	c := newDavClient(se.alice, "alice@example.com", se.ids["alice"])
	_, ics := c.must("GET", c.cal(se.project)+se.task+".ics", "", 200)
	if strings.Contains(ics, se.ids["bob"]) {
		t.Fatal("rotation leaked into the VTODO")
	}
	done := strings.Replace(ics, "STATUS:NEEDS-ACTION", "STATUS:COMPLETED\r\nCOMPLETED:20261109T090000Z", 1)
	c.must("PUT", c.cal(se.project)+se.task+".ics", done, 204)
	task := se.alice.task(se.task)
	if task["assignee_id"] != se.ids["bob"] || task["completed_at"] != nil {
		t.Fatalf("after CalDAV completion: %v", task)
	}
}
