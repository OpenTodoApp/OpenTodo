package httpapi

import (
	"strings"
	"testing"
)

// TestReactionRoutes covers comments "Reaction routes" (editor-everywhere D8).
func TestReactionRoutes(t *testing.T) {
	se := newShareEnv(t)
	se.share(se.alice, "bob@example.com", "viewer")
	resp, out := se.alice.do("POST", "/api/v1/tasks/"+se.task+"/comments", map[string]any{"body": "Whole or skimmed?"})
	se.alice.mustStatus(resp, 201, out)
	id := out["id"].(string)
	path := "/api/v1/comments/" + id + "/reactions"

	// Anonymous request.
	anon := newClientFor(se.alice)
	resp, out = anon.do("PUT", path, map[string]any{"reactions": []string{"heart"}})
	if resp.StatusCode != 401 || errCode(out) != "unauthorized" {
		t.Fatalf("anonymous = %d %v", resp.StatusCode, out)
	}
	// Read and agent tokens are refused and change nothing.
	for _, scope := range []string{"read", "agent"} {
		resp, out = anon.do("PUT", path, map[string]any{"reactions": []string{"heart"}}, bearer(se.alice.token(scope))...)
		if resp.StatusCode != 403 || errCode(out) != "insufficient_scope" {
			t.Fatalf("%s token = %d %v", scope, resp.StatusCode, out)
		}
	}
	// Script reacts with a full token.
	resp, out = anon.do("PUT", path, map[string]any{"reactions": []string{"thumbs_up"}}, bearer(se.alice.token("full"))...)
	anon.mustStatus(resp, 200, out)
	if mine := out["my_reactions"].([]any); len(mine) != 1 || mine[0] != "thumbs_up" {
		t.Fatalf("my_reactions = %v", out["my_reactions"])
	}
	// A viewer reacts too; the list shows both, each account under its names.
	resp, out = se.bob.do("PUT", path, map[string]any{"reactions": []string{"thumbs_up", "heart"}})
	se.bob.mustStatus(resp, 200, out)
	resp, out = se.alice.do("GET", "/api/v1/tasks/"+se.task+"/comments", nil)
	se.alice.mustStatus(resp, 200, out)
	c := out["comments"].([]any)[0].(map[string]any)
	r := c["reactions"].(map[string]any)
	if up := r["thumbs_up"].([]any); len(up) != 2 || len(r["heart"].([]any)) != 1 || len(r["party"].([]any)) != 0 {
		t.Fatalf("reactions = %v", r)
	}
	if mine := c["my_reactions"].([]any); len(mine) != 1 || mine[0] != "thumbs_up" {
		t.Fatalf("alice's my_reactions = %v", c["my_reactions"])
	}
	for k := range c {
		if strings.HasPrefix(k, "reactions.") {
			t.Fatalf("raw reaction field %q in the representation", k)
		}
	}
	// Invalid list names the unknown name.
	resp, out = se.alice.do("PUT", path, map[string]any{"reactions": []string{"thumbs_up", "fire"}})
	se.alice.mustStatus(resp, 400, out)
	if errCode(out) != "invalid_input" || !strings.Contains(out["error"].(map[string]any)["message"].(string), "fire") {
		t.Fatalf("invalid = %v", out)
	}
	for _, body := range []map[string]any{{}, {"reactions": "heart"}, {"reactions": []string{"heart", "heart"}}, {"reactions": []string{}, "author": "x"}} {
		resp, out = se.alice.do("PUT", path, body)
		se.alice.mustStatus(resp, 400, out)
	}
	// Unreadable (carol is not a member) and deleted comments answer 404.
	resp, out = se.carol.do("PUT", path, map[string]any{"reactions": []string{"heart"}})
	se.carol.mustStatus(resp, 404, out)
	resp, out = se.alice.do("DELETE", "/api/v1/comments/"+id, nil)
	se.alice.mustStatus(resp, 204, out)
	resp, out = se.bob.do("PUT", path, map[string]any{"reactions": []string{"heart"}})
	se.bob.mustStatus(resp, 404, out)
	if errCode(out) != "not_found" {
		t.Fatalf("deleted = %v", out)
	}
	// The export shows the folded form too.
	resp, out = se.alice.do("GET", "/api/v1/export", nil)
	se.alice.mustStatus(resp, 200, out)
	if _, ok := out["comments"].([]any)[0].(map[string]any)["reactions"].(map[string]any); !ok {
		t.Fatalf("export comment = %v", out["comments"])
	}
}
