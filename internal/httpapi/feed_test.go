package httpapi

import (
	"fmt"
	"net/url"
	"testing"
)

// TestFeedRouteAuthFiltersAndIsolation covers GET /api/v1/activity
// (activity-feed): authentication, scope isolation, filters and pagination.
func TestFeedRouteAuthFiltersAndIsolation(t *testing.T) {
	se := newShareEnv(t)
	se.share(se.alice, "bob@example.com", "editor")

	anon := newClientFor(se.alice)
	resp, out := anon.do("GET", "/api/v1/activity", nil)
	anon.mustStatus(resp, 401, out)
	if out["error"].(map[string]any)["code"] != "unauthorized" {
		t.Fatalf("anonymous = %v", out)
	}

	// Personal data of alice's never reaches the feed; carol's project neither.
	resp, out = se.alice.do("POST", "/api/v1/tasks", map[string]any{"title": "Private"})
	se.alice.mustStatus(resp, 201, out)
	resp, out = se.carol.do("POST", "/api/v1/projects", map[string]any{"name": "Carol's"})
	se.carol.mustStatus(resp, 201, out)
	carolProject := out["id"].(string)
	resp, out = se.carol.do("POST", "/api/v1/tasks", map[string]any{"title": "Hidden", "project_id": carolProject})
	se.carol.mustStatus(resp, 201, out)

	resp, out = se.bob.do("PATCH", "/api/v1/tasks/"+se.task, map[string]any{"completed_at": 1_760_000_000_000})
	se.bob.mustStatus(resp, 200, out)
	resp, out = se.bob.do("POST", "/api/v1/tasks/"+se.task+"/comments", map[string]any{"body": "done"})
	se.bob.mustStatus(resp, 201, out)
	for i := 0; i < 3; i++ {
		resp, out = se.bob.do("POST", "/api/v1/tasks", map[string]any{"title": fmt.Sprintf("Bob %d", i), "project_id": se.project})
		se.bob.mustStatus(resp, 201, out)
	}

	feed := func(c *env, q string) []map[string]any {
		t.Helper()
		resp, out := c.do("GET", "/api/v1/activity"+q, nil)
		c.mustStatus(resp, 200, out)
		var evs []map[string]any
		for _, e := range out["events"].([]any) {
			evs = append(evs, e.(map[string]any))
		}
		return evs
	}

	// Alice: project created, Milk created (both alice), Bob's completion,
	// comment and three creations = 7 events, all in the shared project.
	all := feed(se.alice, "")
	if len(all) != 7 {
		t.Fatalf("alice feed = %d events: %v", len(all), all)
	}
	for _, e := range all {
		if e["projectId"] != se.project || e["projectName"] != "Home" {
			t.Fatalf("event outside the shared project: %v", e)
		}
		if e["taskTitle"] == "Private" || e["taskTitle"] == "Hidden" {
			t.Fatalf("leaked event: %v", e)
		}
	}
	if all[0]["kind"] != "created" || all[0]["actorName"] != "bob" {
		t.Fatalf("newest first expected bob's creation, got %v", all[0])
	}

	// Carol is a member of nothing shared: empty, even filtered by the project id.
	if evs := feed(se.carol, ""); len(evs) != 0 {
		t.Fatalf("carol feed = %v", evs)
	}
	if evs := feed(se.carol, "?project="+url.QueryEscape(se.project)); len(evs) != 0 {
		t.Fatalf("carol filtered feed = %v", evs)
	}
	// Alice filtering by carol's project id sees nothing of it.
	if evs := feed(se.alice, "?project="+url.QueryEscape(carolProject)); len(evs) != 0 {
		t.Fatalf("alice sees carol's project: %v", evs)
	}

	// Filters.
	if evs := feed(se.alice, "?kind=commented"); len(evs) != 1 || evs[0]["kind"] != "commented" {
		t.Fatalf("kind=commented = %v", evs)
	}
	if evs := feed(se.alice, "?kind=completed"); len(evs) != 1 || evs[0]["kind"] != "completed" {
		t.Fatalf("kind=completed = %v", evs)
	}
	if evs := feed(se.alice, "?actor="+se.ids["bob"]); len(evs) != 5 {
		t.Fatalf("actor=bob = %d events", len(evs))
	}
	if evs := feed(se.alice, "?actor="+se.ids["alice"]+"&kind=created"); len(evs) != 2 {
		t.Fatalf("actor=alice&kind=created = %v", evs)
	}
	if evs := feed(se.bob, "?project="+url.QueryEscape(se.project)); len(evs) != 7 {
		t.Fatalf("bob project filter = %d events", len(evs))
	}

	// Pagination without overlap, through `cursor`.
	seen := map[string]bool{}
	cursor := ""
	for pages := 0; ; pages++ {
		if pages > 10 {
			t.Fatal("pagination does not end")
		}
		q := "?limit=3"
		if cursor != "" {
			q += "&cursor=" + url.QueryEscape(cursor)
		}
		resp, out := se.alice.do("GET", "/api/v1/activity"+q, nil)
		se.alice.mustStatus(resp, 200, out)
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
	}
	if len(seen) != 7 {
		t.Fatalf("paged %d events, want 7", len(seen))
	}

	for _, q := range []string{"?cursor=junk", "?before=junk", "?kind=everything", "?limit=0", "?limit=201"} {
		resp, out := se.alice.do("GET", "/api/v1/activity"+q, nil)
		se.alice.mustStatus(resp, 400, out)
		if out["error"].(map[string]any)["code"] != "invalid_input" {
			t.Fatalf("%s = %v", q, out)
		}
	}
}
