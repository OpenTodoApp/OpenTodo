package httpapi

import (
	"testing"
)

func TestNotificationRoutesAuthAndOwnership(t *testing.T) {
	se := newShareEnv(t)
	anon := newClientFor(se.alice)
	for _, rt := range [][2]string{{"GET", "/api/v1/notifications"}, {"POST", "/api/v1/notifications/x/read"}} {
		resp, out := anon.do(rt[0], rt[1], nil)
		anon.mustStatus(resp, 401, out)
		if errCode(out) != "unauthorized" {
			t.Fatalf("%s %s: %v", rt[0], rt[1], out)
		}
	}
	se.share(se.alice, "bob@example.com", "editor")
	task := "/api/v1/tasks/" + se.task
	// REST assignment is validated like sync: carol is not a member.
	resp, out := se.alice.do("PATCH", task, map[string]any{"assignee_id": se.ids["carol"]})
	se.alice.mustStatus(resp, 400, out)
	if errCode(out) != "not_a_member" {
		t.Fatalf("non-member = %v", out)
	}
	resp, out = se.alice.do("PATCH", task, map[string]any{"assignee_id": se.ids["bob"]})
	se.alice.mustStatus(resp, 200, out)
	if out["assignee_id"] != se.ids["bob"] {
		t.Fatalf("patched = %v", out)
	}
	// Bob has one unread notification naming alice, the task and the project.
	resp, out = se.bob.do("GET", "/api/v1/notifications", nil)
	se.bob.mustStatus(resp, 200, out)
	list := out["notifications"].([]any)
	if len(list) != 1 || out["unread"].(float64) != 1 {
		t.Fatalf("bob's notifications = %v", out)
	}
	n := list[0].(map[string]any)
	p := n["payload"].(map[string]any)
	if n["kind"] != "assigned" || n["readAt"] != nil || p["actorName"] != "alice" || p["taskTitle"] != "Milk" || p["projectName"] != "Home" || p["taskId"] != se.task {
		t.Fatalf("notification = %v", n)
	}
	id := n["id"].(string)
	// Alice sees none; carol (and alice) cannot mark bob's notification read.
	resp, out = se.alice.do("GET", "/api/v1/notifications", nil)
	se.alice.mustStatus(resp, 200, out)
	if len(out["notifications"].([]any)) != 0 {
		t.Fatalf("alice = %v", out)
	}
	for _, c := range []*env{se.carol, se.alice} {
		resp, out = c.do("POST", "/api/v1/notifications/"+id+"/read", nil)
		c.mustStatus(resp, 404, out)
		if errCode(out) != "not_found" {
			t.Fatalf("foreign mark = %v", out)
		}
	}
	resp, out = se.bob.do("GET", "/api/v1/notifications", nil)
	if out["unread"].(float64) != 1 {
		t.Fatalf("foreign mark changed state: %v", out)
	}
	// Bob marks it read (twice: idempotent).
	for i := 0; i < 2; i++ {
		resp, out = se.bob.do("POST", "/api/v1/notifications/"+id+"/read", nil)
		se.bob.mustStatus(resp, 204, out)
	}
	resp, out = se.bob.do("GET", "/api/v1/notifications", nil)
	if out["unread"].(float64) != 0 || out["notifications"].([]any)[0].(map[string]any)["readAt"] == nil {
		t.Fatalf("after read = %v", out)
	}
	// Removing bob unassigns the task through a server-written op.
	resp, out = se.alice.do("DELETE", "/api/v1/projects/"+se.project+"/members/"+se.ids["bob"], nil)
	se.alice.mustStatus(resp, 204, out)
	resp, out = se.alice.do("GET", task, nil)
	se.alice.mustStatus(resp, 200, out)
	if v, has := out["assignee_id"]; !has || v != nil {
		t.Fatalf("after removal = %v", out)
	}
}
