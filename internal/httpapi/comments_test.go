package httpapi

import (
	"fmt"
	"strings"
	"testing"
)

func TestCommentRoutesAuthAndScope(t *testing.T) {
	se := newShareEnv(t)
	se.share(se.alice, "bob@example.com", "viewer")
	anon := newClientFor(se.alice)
	for _, rt := range [][2]string{
		{"GET", "/api/v1/tasks/" + se.task + "/comments"}, {"POST", "/api/v1/tasks/" + se.task + "/comments"},
		{"PATCH", "/api/v1/comments/x"}, {"DELETE", "/api/v1/comments/x"},
	} {
		resp, out := anon.do(rt[0], rt[1], map[string]any{"body": "hi"})
		anon.mustStatus(resp, 401, out)
		if out["error"].(map[string]any)["code"] != "unauthorized" {
			t.Fatalf("%v: %v", rt, out)
		}
	}
	// Alice comments; bob (viewer) replies and mentions alice; carol is not a member.
	resp, out := se.alice.do("POST", "/api/v1/tasks/"+se.task+"/comments", map[string]any{"body": "Whole or skimmed?"})
	se.alice.mustStatus(resp, 201, out)
	root := out["id"].(string)
	if out["author_id"] != se.ids["alice"] || out["task_id"] != se.task || out["deleted_at"] != nil {
		t.Fatalf("created = %v", out)
	}
	resp, out = se.bob.do("POST", "/api/v1/tasks/"+se.task+"/comments",
		map[string]any{"body": "Whole, @alice", "parent_id": root, "mentions": []string{se.ids["alice"], se.ids["carol"]}})
	se.bob.mustStatus(resp, 201, out)
	reply := out["id"].(string)
	if ms := out["mentions"].([]any); len(ms) != 1 || ms[0] != se.ids["alice"] {
		t.Fatalf("mentions = %v", out["mentions"])
	}
	// Alice was notified of the mention.
	resp, out = se.alice.do("GET", "/api/v1/notifications", nil)
	se.alice.mustStatus(resp, 200, out)
	if out["unread"].(float64) != 1 || out["notifications"].([]any)[0].(map[string]any)["kind"] != "mentioned" {
		t.Fatalf("alice notifications = %v", out)
	}
	resp, out = se.carol.do("POST", "/api/v1/tasks/"+se.task+"/comments", map[string]any{"body": "let me in"})
	se.carol.mustStatus(resp, 404, out)
	resp, out = se.carol.do("GET", "/api/v1/tasks/"+se.task+"/comments", nil)
	se.carol.mustStatus(resp, 404, out)
	resp, out = se.carol.do("PATCH", "/api/v1/comments/"+root, map[string]any{"body": "x"})
	se.carol.mustStatus(resp, 404, out)
	// Thread order and validation.
	resp, out = se.bob.do("GET", "/api/v1/tasks/"+se.task+"/comments", nil)
	se.bob.mustStatus(resp, 200, out)
	if list := out["comments"].([]any); len(list) != 2 || list[0].(map[string]any)["id"] != root || list[1].(map[string]any)["id"] != reply {
		t.Fatalf("thread = %v", out)
	}
	for _, body := range []map[string]any{{"body": "  "}, {}, {"body": 3}, {"body": "x", "author_id": "y"}, {"body": "x", "parent_id": "nope"}} {
		resp, out = se.alice.do("POST", "/api/v1/tasks/"+se.task+"/comments", body)
		se.alice.mustStatus(resp, 400, out)
	}
	// Only the author edits; the owner may delete anyone's comment, a viewer only their own.
	resp, out = se.alice.do("PATCH", "/api/v1/comments/"+reply, map[string]any{"body": "hijack"})
	se.alice.mustStatus(resp, 403, out)
	resp, out = se.bob.do("PATCH", "/api/v1/comments/"+reply, map[string]any{"body": "Whole milk, @alice"})
	se.bob.mustStatus(resp, 200, out)
	if out["body"] != "Whole milk, @alice" || out["edited_at"] == nil {
		t.Fatalf("edited = %v", out)
	}
	resp, out = se.bob.do("DELETE", "/api/v1/comments/"+root, nil)
	se.bob.mustStatus(resp, 403, out)
	resp, out = se.alice.do("DELETE", "/api/v1/comments/"+reply, nil)
	se.alice.mustStatus(resp, 204, out)
	resp, out = se.alice.do("DELETE", "/api/v1/comments/"+reply, nil)
	se.alice.mustStatus(resp, 404, out)
	resp, out = se.bob.do("GET", "/api/v1/tasks/"+se.task+"/comments", nil)
	se.bob.mustStatus(resp, 200, out)
	if list := out["comments"].([]any); len(list) != 1 {
		t.Fatalf("after delete = %v", out)
	}
	// The export carries comments, deleted ones included.
	resp, out = se.alice.do("GET", "/api/v1/export", nil)
	se.alice.mustStatus(resp, 200, out)
	if list := out["comments"].([]any); len(list) != 2 {
		t.Fatalf("export comments = %v", out["comments"])
	}
}

func TestActivityRoutesAuthScopeAndPagination(t *testing.T) {
	se := newShareEnv(t)
	se.share(se.alice, "bob@example.com", "editor")
	anon := newClientFor(se.alice)
	for _, p := range []string{"/api/v1/tasks/" + se.task + "/activity", "/api/v1/projects/" + se.project + "/activity"} {
		resp, out := anon.do("GET", p, nil)
		anon.mustStatus(resp, 401, out)
		resp, out = se.carol.do("GET", p, nil)
		se.carol.mustStatus(resp, 404, out)
		if out["error"].(map[string]any)["code"] != "not_found" {
			t.Fatalf("carol %s = %v", p, out)
		}
	}
	resp, out := se.carol.do("GET", "/api/v1/projects/does-not-exist/activity", nil)
	se.carol.mustStatus(resp, 404, out)
	// Bob completes the task, alice comments, bob adds tasks: one event each
	// (the clock between writes is the server's, so space them past the window
	// with distinct entities instead of waiting).
	resp, out = se.bob.do("PATCH", "/api/v1/tasks/"+se.task, map[string]any{"completed_at": 1_760_000_000_000})
	se.bob.mustStatus(resp, 200, out)
	resp, out = se.alice.do("POST", "/api/v1/tasks/"+se.task+"/comments", map[string]any{"body": "thanks"})
	se.alice.mustStatus(resp, 201, out)
	for i := 0; i < 5; i++ {
		resp, out = se.bob.do("POST", "/api/v1/tasks", map[string]any{"title": fmt.Sprintf("Task %d", i), "project_id": se.project})
		se.bob.mustStatus(resp, 201, out)
	}
	resp, out = se.alice.do("GET", "/api/v1/tasks/"+se.task+"/activity", nil)
	se.alice.mustStatus(resp, 200, out)
	events := out["events"].([]any)
	var kinds []string
	for _, e := range events {
		ev := e.(map[string]any)
		kinds = append(kinds, ev["kind"].(string)+"/"+ev["actorName"].(string))
		if ev["taskTitle"] != "Milk" {
			t.Fatalf("event without task title: %v", ev)
		}
	}
	// Newest first: alice's comment, bob's completion, alice's creation.
	if got := strings.Join(kinds, ","); got != "commented/alice,completed/bob,created/alice" {
		t.Fatalf("task activity = %s", got)
	}
	// The project's activity pages without overlap: 1 project + 6 tasks + 1 completion + 1 comment.
	seen := map[string]bool{}
	cursor := ""
	pages := 0
	for {
		path := "/api/v1/projects/" + se.project + "/activity?limit=4"
		if cursor != "" {
			path += "&before=" + cursor
		}
		resp, out = se.bob.do("GET", path, nil)
		se.bob.mustStatus(resp, 200, out)
		pages++
		for _, e := range out["events"].([]any) {
			id := e.(map[string]any)["id"].(string)
			if seen[id] {
				t.Fatalf("event %s on two pages", id)
			}
			seen[id] = true
		}
		if out["more"] != true {
			break
		}
		cursor = out["cursor"].(string)
		if pages > 10 {
			t.Fatal("pagination does not end")
		}
	}
	if len(seen) != 9 || pages != 3 {
		t.Fatalf("project activity: %d events in %d pages", len(seen), pages)
	}
	for _, q := range []string{"?limit=0", "?limit=500", "?before=junk"} {
		resp, out = se.bob.do("GET", "/api/v1/projects/"+se.project+"/activity"+q, nil)
		se.bob.mustStatus(resp, 400, out)
	}
	// A personal project's activity covers its tasks, for its owner only.
	resp, out = se.carol.do("POST", "/api/v1/projects", map[string]any{"name": "Mine"})
	se.carol.mustStatus(resp, 201, out)
	mine := out["id"].(string)
	resp, out = se.carol.do("POST", "/api/v1/tasks", map[string]any{"title": "Mine 1", "project_id": mine})
	se.carol.mustStatus(resp, 201, out)
	resp, out = se.carol.do("GET", "/api/v1/projects/"+mine+"/activity", nil)
	se.carol.mustStatus(resp, 200, out)
	if n := len(out["events"].([]any)); n != 2 {
		t.Fatalf("personal project events = %v", out)
	}
	resp, out = se.alice.do("GET", "/api/v1/projects/"+mine+"/activity", nil)
	se.alice.mustStatus(resp, 404, out)
}
