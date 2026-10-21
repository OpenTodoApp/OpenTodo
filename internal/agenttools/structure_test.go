package agenttools

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/ids"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Project and section structure tools (OpenSpec change mcp-projects).

func (f *fixture) entity(uid, kind, id string) opsync.Entity {
	f.t.Helper()
	e, err := f.sync.Get(context.Background(), uid, kind, id)
	if err != nil {
		f.t.Fatal(err)
	}
	return e
}

// later moves the fixture's device clock past the server clock, so the next
// device write is newer than an agent write made just before.
func (f *fixture) later() { f.ts = time.Now().UnixMilli() + 60_000 }

// envelope is a well-formed ciphertext envelope (the server cannot open it).
func envelope(seed string) string {
	return "enc:v1:" + strings.Repeat(seed, 40)
}

// TestListIcons (1.2): search order, limit bounds, unknown arguments.
func TestListIcons(t *testing.T) {
	f := newFixture(t)
	out := f.mustCall(agent("u1"), "list_icons", map[string]any{"query": "plant"})
	icons := out["icons"].([]iconOut)
	if len(icons) == 0 {
		t.Fatal("no icon for plant")
	}
	names := map[string]bool{}
	for _, i := range icons {
		names[i.Name] = true
	}
	if !names["sprout"] && !names["flower"] && !names["leaf"] {
		t.Fatalf("plant found %v", names)
	}
	if out["_notice"] != Notice {
		t.Fatal("read result without the notice")
	}
	if all := f.mustCall(Caller{UserID: "u1", Scope: "read"}, "list_icons", nil); len(all["icons"].([]iconOut)) != iconLimit || all["truncated"] != true {
		t.Fatalf("default page = %d", len(all["icons"].([]iconOut)))
	}
	for _, bad := range []map[string]any{{"limit": 1000}, {"limit": 0}, {"limit": 2.5}, {"colour": "red"}} {
		if _, err := f.call(agent("u1"), "list_icons", bad); !isArgErr(err) {
			t.Fatalf("%v: %v", bad, err)
		}
	}
	if _, err := f.call(agent("u1"), "list_icons", map[string]any{"limit": 1000}); !strings.Contains(err.Error(), "limit") {
		t.Fatalf("bad limit error does not name limit: %v", err)
	}
}

// TestUpdateProjectStructure (1.3, 2.1): colour and icon, catalogue check,
// parent cycle, refused arguments, concurrent device rename keeps both.
func TestUpdateProjectStructure(t *testing.T) {
	f := newFixture(t)
	c := agent("u1")
	f.put("u1", "project", "home", map[string]any{"name": "Home", "color": "#64748b", "archived": false, "parent_id": nil})
	f.put("u1", "project", "kitchen", map[string]any{"name": "Kitchen", "color": "#64748b", "archived": false, "parent_id": "home"})
	f.put("u1", "project", "garden", map[string]any{"name": "Garden", "color": "#64748b", "archived": false, "parent_id": nil})

	f.mustCall(c, "update_project", map[string]any{"id": "garden", "color": "#16A34A", "icon": "sprout"})
	// A phone renamed Garden offline at the same time: both survive (per field).
	f.put("u1", "project", "garden", map[string]any{"name": "Vegetable garden"})
	g := f.entity("u1", "project", "garden")
	if str(g, "color") != "#16a34a" || str(g, "icon") != "sprout" || str(g, "name") != "Vegetable garden" {
		t.Fatalf("garden = %v", g)
	}
	if _, err := f.call(c, "update_project", map[string]any{"id": "garden", "icon": "unicorn-rainbow"}); !isArgErr(err) || !strings.Contains(err.Error(), "icon") {
		t.Fatalf("unknown icon: %v", err)
	}
	if _, err := f.call(c, "update_project", map[string]any{"id": "home", "parent_id": "kitchen"}); toolCode(err) != "invalid" {
		t.Fatalf("cycle: %v", err)
	}
	if _, err := f.call(c, "update_project", map[string]any{"id": "home", "parent_id": "home"}); toolCode(err) != "invalid" {
		t.Fatalf("own parent: %v", err)
	}
	for _, bad := range []string{"archived", "deleted", "description"} {
		if _, err := f.call(c, "update_project", map[string]any{"id": "home", bad: true}); !isArgErr(err) || !strings.Contains(err.Error(), bad) {
			t.Fatalf("%s: %v", bad, err)
		}
	}
	f.mustCall(c, "update_project", map[string]any{"id": "garden", "parent_id": "home", "position": 5})
	if g := f.entity("u1", "project", "garden"); rawStr(g, "parent_id") != "home" || num(g, "position") != 5 {
		t.Fatalf("moved garden = %v", g)
	}
	f.mustCall(c, "update_project", map[string]any{"id": "garden", "parent_id": nil, "icon": nil})
	if g := f.entity("u1", "project", "garden"); string(g["parent_id"]) != "null" || string(g["icon"]) != "null" {
		t.Fatalf("cleared garden = %v", g)
	}
}

// TestSetFavourite (2.2): appended after existing entries, idempotent, removal
// keeps the order, and a device writing Favourites later wins as a whole.
func TestSetFavourite(t *testing.T) {
	f := newFixture(t)
	c := agent("u1")
	f.put("u1", "project", "garden", map[string]any{"name": "Garden", "color": "#64748b", "archived": false})
	f.put("u1", "user_prefs", "me", map[string]any{"favourites": "view:v1,view:v2"})
	f.mustCall(c, "set_favourite", map[string]any{"kind": "project", "id": "garden", "favourite": true})
	if got := str(f.entity("u1", "user_prefs", "me"), "favourites"); got != "view:v1,view:v2,project:garden" {
		t.Fatalf("favourites = %q", got)
	}
	again := f.mustCall(c, "set_favourite", map[string]any{"kind": "project", "id": "garden", "favourite": true})
	if again["changed"] != 0 {
		t.Fatalf("second pin changed %v", again["changed"])
	}
	f.mustCall(c, "set_favourite", map[string]any{"kind": "project", "id": "garden", "favourite": false})
	if got := str(f.entity("u1", "user_prefs", "me"), "favourites"); got != "view:v1,view:v2" {
		t.Fatalf("after removal = %q", got)
	}
	f.mustCall(c, "set_favourite", map[string]any{"kind": "project", "id": "garden", "favourite": true})
	f.later()
	f.put("u1", "user_prefs", "me", map[string]any{"favourites": "view:v2"})
	if got := str(f.entity("u1", "user_prefs", "me"), "favourites"); got != "view:v2" {
		t.Fatalf("later device write = %q", got)
	}
	for _, bad := range []map[string]any{{"kind": "label", "id": "garden", "favourite": true}, {"kind": "project", "id": "garden"}} {
		if _, err := f.call(c, "set_favourite", bad); !isArgErr(err) {
			t.Fatalf("%v: %v", bad, err)
		}
	}
	if _, err := f.call(c, "set_favourite", map[string]any{"kind": "project", "id": "nope", "favourite": true}); toolCode(err) != "not_found" {
		t.Fatalf("unknown project: %v", err)
	}
}

// TestSections (2.3): create, reorder with a concurrent device move into a
// section, update per field.
func TestSections(t *testing.T) {
	f := newFixture(t)
	c := agent("u1")
	f.put("u1", "project", "garden", map[string]any{"name": "Garden", "color": "#64748b", "archived": false})
	f.put("u1", "section", "old", map[string]any{"name": "Ideas", "project_id": "garden", "position": 10})
	out := f.mustCall(c, "create_sections", map[string]any{"project_id": "garden", "items": []any{
		map[string]any{"name": "To buy"}, map[string]any{"name": "To plant", "icon": "shovel"}, map[string]any{"name": "Done", "color": "#16A34A"},
	}})
	res := out["results"].([]map[string]any)
	buy, plant, done := res[0]["id"].(string), res[1]["id"].(string), res[2]["id"].(string)
	if s := f.entity("u1", "section", plant); str(s, "icon") != "shovel" || num(s, "position") <= 10 {
		t.Fatalf("to plant = %v", s)
	}
	f.task("u1", "t1", "Seeds", map[string]any{"project_id": "garden", "section_id": buy})
	f.mustCall(c, "reorder_sections", map[string]any{"project_id": "garden", "ids": []string{done, buy, plant}})
	order := func() []string {
		live, _ := f.reg.liveSections(context.Background(), "u1", "garden")
		var out []string
		for _, s := range live {
			out = append(out, str(s, "name"))
		}
		return out
	}
	if got := strings.Join(order(), ","); got != "Done,To buy,To plant,Ideas" {
		t.Fatalf("order = %s", got)
	}
	if rawStr(f.get("u1", "t1"), "section_id") != buy {
		t.Fatal("reordering moved a task out of its section")
	}
	f.mustCall(c, "update_sections", map[string]any{"updates": []any{map[string]any{"id": done, "name": "Harvested", "color": nil, "icon": "check"}}})
	// A phone reordered the same section offline at the same time.
	f.later()
	f.put("u1", "section", done, map[string]any{"position": 99999})
	if s := f.entity("u1", "section", done); str(s, "name") != "Harvested" || string(s["color"]) != "null" || str(s, "icon") != "check" || num(s, "position") != 99999 {
		t.Fatalf("done = %v", s)
	}
	if _, err := f.call(c, "update_sections", map[string]any{"updates": []any{map[string]any{"id": "nope", "name": "x"}}}); toolCode(err) != "not_found" {
		t.Fatalf("unknown section: %v", err)
	}
	if _, err := f.call(c, "reorder_sections", map[string]any{"project_id": "garden", "ids": []string{"nope"}}); toolCode(err) != "not_found" {
		t.Fatalf("unknown section in reorder: %v", err)
	}
	if _, err := f.call(c, "create_sections", map[string]any{"project_id": "garden", "items": []any{map[string]any{"name": "x", "icon": "not-an-icon"}}}); !isArgErr(err) {
		t.Fatalf("bad icon: %v", err)
	}
}

// TestEncryptedStructure (3.1, 3.2): structural writes in plaintext, content
// only as an envelope stored unchanged, plaintext content refused.
func TestEncryptedStructure(t *testing.T) {
	f := newFixture(t)
	c := agent("u1")
	c.Encrypted = true
	name := envelope("Ab")
	f.put("u1", "project", "p1", map[string]any{"name": name, "color": "#64748b", "archived": false})
	f.put("u1", "section", "s1", map[string]any{"name": envelope("Cd"), "project_id": "p1", "position": 1})

	f.mustCall(c, "update_project", map[string]any{"id": "p1", "color": "#16a34a", "icon": "sprout"})
	if p := f.entity("u1", "project", "p1"); str(p, "color") != "#16a34a" || rawStr(p, "name") != name {
		t.Fatalf("recoloured = %v", p)
	}
	if _, err := f.call(c, "update_project", map[string]any{"id": "p1", "name": "Garden"}); toolCode(err) != "encryption_enabled" {
		t.Fatalf("plaintext name: %v", err)
	}
	renamed := envelope("Ef")
	f.mustCall(c, "update_sections", map[string]any{"updates": []any{map[string]any{"id": "s1", "name": renamed}}})
	if s := f.entity("u1", "section", "s1"); rawStr(s, "name") != renamed {
		t.Fatalf("envelope not stored as given: %v", s)
	}
	// A long title's envelope is longer than the plaintext cap; still accepted.
	long := envelope(strings.Repeat("x", 30))
	out := f.mustCall(c, "create_tasks", map[string]any{"items": []any{map[string]any{"title": long}}})
	id := out["results"].([]map[string]any)[0]["id"].(string)
	if rawStr(f.get("u1", id), "title") != long {
		t.Fatal("encrypted title not stored unchanged")
	}
	for _, bad := range []map[string]any{
		{"items": []any{map[string]any{"title": "enc:v1:short"}}},
		{"items": []any{map[string]any{"title": long, "description": "plain"}}},
		{"items": []any{map[string]any{"title": long, "origin_url": "https://example.org"}}},
	} {
		if _, err := f.call(c, "create_tasks", bad); toolCode(err) != "encryption_enabled" {
			t.Fatalf("%v: %v", bad, err)
		}
	}
	f.mustCall(c, "reorder_sections", map[string]any{"project_id": "p1", "ids": []string{"s1"}})
	f.mustCall(c, "set_favourite", map[string]any{"kind": "project", "id": "p1", "favourite": true})
}

// TestChosenIDs (3.3): the chosen id is used, a taken id is a conflict, a
// malformed one an argument error, and a retry with the same pair a replay.
func TestChosenIDs(t *testing.T) {
	f := newFixture(t)
	c := agent("u1")
	f.put("u1", "project", "garden", map[string]any{"name": "Garden", "color": "#64748b", "archived": false})
	f.task("u1", "t-existing", "Existing", nil)

	sid := ids.New()
	out := f.mustCall(c, "create_sections", map[string]any{"project_id": "garden", "items": []any{map[string]any{"id": sid, "name": "Beds"}}})
	if got := out["results"].([]map[string]any)[0]["id"]; got != sid || str(f.entity("u1", "section", sid), "name") != "Beds" {
		t.Fatalf("chosen id: %v", got)
	}
	if _, err := f.call(c, "create_project", map[string]any{"id": "t-existing", "name": "X"}); !isArgErr(err) {
		t.Fatalf("non-uuid id: %v", err)
	}
	taken := ids.New()
	f.task("u1", taken, "Taken", nil)
	if _, err := f.call(c, "create_project", map[string]any{"id": taken, "name": "X"}); toolCode(err) != "conflict" {
		t.Fatalf("taken id: %v", err)
	}
	if _, err := f.call(c, "create_tasks", map[string]any{"items": []any{map[string]any{"id": "not-a-uuid", "title": "x"}}}); !isArgErr(err) || !strings.Contains(err.Error(), "id") {
		t.Fatalf("malformed id: %v", err)
	}
	// Retry with the same id and client_request_id: same result, nothing new.
	tid := ids.New()
	call := map[string]any{"client_request_id": "r1", "items": []any{map[string]any{"id": tid, "title": "Plumber"}}}
	first := f.mustCall(c, "create_tasks", call)
	var before int
	_ = f.sync.DB().QueryRow(`SELECT COUNT(*) FROM ops`).Scan(&before)
	second := f.mustCall(c, "create_tasks", call)
	var after int
	_ = f.sync.DB().QueryRow(`SELECT COUNT(*) FROM ops`).Scan(&after)
	a, _ := json.Marshal(first["results"])
	b, _ := json.Marshal(second["results"])
	if string(a) != string(b) || before != after {
		t.Fatalf("retry: %s vs %s, ops %d -> %d", a, b, before, after)
	}
	// Same id, another request: conflict.
	if _, err := f.call(c, "create_tasks", map[string]any{"client_request_id": "r2", "items": []any{map[string]any{"id": tid, "title": "Plumber"}}}); toolCode(err) != "conflict" {
		t.Fatalf("same id, other request: %v", err)
	}
}
