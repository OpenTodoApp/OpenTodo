package agenttools

import (
	"bytes"
	"encoding/json"
	"testing"
)

// TestOriginURLInWriteTools covers "Origin URL in write tools" (OpenSpec change
// task-origin): a recognised issue URL becomes an issue origin written with the
// agent device, an unsafe URL refuses the whole call, update_tasks sets and
// clears it, and the REST bridge's origin object is validated like sync.
func TestOriginURLInWriteTools(t *testing.T) {
	f := newFixture(t)
	c := agent("u1")
	out := f.mustCall(c, "create_tasks", map[string]any{"items": []any{
		map[string]any{"title": "Fix the login timeout", "origin_url": "https://gitlab.com/g/p/-/issues/12"},
	}})
	raw, _ := json.Marshal(out)
	var res struct {
		Items []struct{ ID string } `json:"results"`
	}
	_ = json.Unmarshal(raw, &res)
	if len(res.Items) != 1 || res.Items[0].ID == "" {
		t.Fatalf("result = %s", raw)
	}
	id := res.Items[0].ID
	want := `{"kind":"issue","provider":"gitlab","id":"g/p#12","url":"https://gitlab.com/g/p/-/issues/12"}`
	if got := string(f.get("u1", id)["origin"]); got != want {
		t.Fatalf("origin = %s", got)
	}
	var device string
	_ = f.sync.DB().QueryRow(`SELECT device FROM ops WHERE entity_id=? AND field='origin'`, id).Scan(&device)
	if device != "agent:"+c.TokenID {
		t.Fatalf("device = %q", device)
	}

	count := func() int {
		var n int
		_ = f.sync.DB().QueryRow(`SELECT COUNT(*) FROM ops`).Scan(&n)
		return n
	}
	before := count()
	for _, bad := range []map[string]any{
		{"items": []any{map[string]any{"title": "A"}, map[string]any{"title": "B", "origin_url": "javascript:alert(1)"}}},
		{"items": []any{map[string]any{"title": "A", "origin_url": "ftp://files.example/x"}}},
		{"items": []any{map[string]any{"title": "A", "origin": map[string]any{"kind": "ticket", "id": "1"}}}},
		{"items": []any{map[string]any{"title": "A", "origin_url": "https://a.example", "origin": map[string]any{"kind": "url", "url": "https://a.example"}}}},
	} {
		if _, err := f.call(c, "create_tasks", bad); !isArgErr(err) {
			t.Fatalf("%v: %v", bad, err)
		}
	}
	if count() != before {
		t.Fatal("a refused call wrote ops")
	}

	f.mustCall(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": id, "origin_url": "https://example.org/post"}}})
	if got := string(f.get("u1", id)["origin"]); got != `{"kind":"url","url":"https://example.org/post"}` {
		t.Fatalf("updated origin = %s", got)
	}
	f.mustCall(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": id, "origin_url": nil}}})
	if got := string(f.get("u1", id)["origin"]); got != "null" {
		t.Fatalf("cleared origin = %s", got)
	}
	f.mustCall(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": id, "origin": map[string]any{"kind": "email", "id": "<a1@mail.example>"}}}})
	var got map[string]string
	if json.Unmarshal(f.get("u1", id)["origin"], &got) != nil || got["kind"] != "email" || got["id"] != "<a1@mail.example>" || len(got) != 2 {
		t.Fatalf("object origin = %v", got)
	}
}

// TestOriginInToolResults covers "Task origin in tool results": kind, provider
// and id outside the untrusted marking, title and URL inside it, null when
// unset, and nothing at all for an encrypted origin.
func TestOriginInToolResults(t *testing.T) {
	f := newFixture(t)
	f.task("u1", "t1", "Read the article", map[string]any{"origin": map[string]any{"kind": "url", "url": "https://example.org/post", "title": "Interesting article"}})
	f.task("u1", "t2", "Plain", nil)
	out := f.mustCall(agent("u1"), "get_task", map[string]any{"id": "t1"})
	raw, _ := json.Marshal(out)
	var shape struct {
		Task struct {
			Origin    map[string]any `json:"origin"`
			Untrusted struct {
				Origin map[string]any `json:"origin"`
			} `json:"untrusted_text"`
		} `json:"task"`
	}
	_ = json.Unmarshal(raw, &shape)
	if shape.Task.Origin["kind"] != "url" || shape.Task.Origin["url"] != nil || shape.Task.Origin["title"] != nil {
		t.Fatalf("origin outside the marking = %v (%s)", shape.Task.Origin, raw)
	}
	if shape.Task.Untrusted.Origin["title"] != "Interesting article" || shape.Task.Untrusted.Origin["url"] != "https://example.org/post" {
		t.Fatalf("origin text not marked: %s", raw)
	}
	plain := f.mustCall(agent("u1"), "get_task", map[string]any{"id": "t2"})
	raw, _ = json.Marshal(plain)
	if !bytes.Contains(raw, []byte(`"origin":null`)) {
		t.Fatalf("unset origin not null: %s", raw)
	}

	f.task("u1", "t3", "enc:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", map[string]any{"origin": "enc:v1:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"})
	c := agent("u1")
	c.Encrypted = true
	enc := f.mustCall(c, "get_task", map[string]any{"id": "t3"})
	raw, _ = json.Marshal(enc)
	if bytes.Contains(raw, []byte("enc:v1:")) || !bytes.Contains(raw, []byte(`"encrypted":true`)) || !bytes.Contains(raw, []byte(`"origin":null`)) {
		t.Fatalf("encrypted origin leaked or unmarked: %s", raw)
	}
	if _, err := f.call(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": "t3", "origin_url": "https://example.org"}}}); toolCode(err) != "encryption_enabled" {
		t.Fatalf("encrypted origin write: %v", err)
	}
}
