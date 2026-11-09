package agenttools

import (
	"encoding/json"
	"strings"
	"testing"
)

// Links in get_note and get_task (OpenSpec change note-links, design D6).

func linkKeys(t *testing.T, out map[string]any, field string) []string {
	t.Helper()
	raw, ok := asJSON(t, out)[field].([]any)
	if !ok {
		t.Fatalf("%s missing: %v", field, out)
	}
	var keys []string
	for _, it := range raw {
		m := it.(map[string]any)
		k := m["kind"].(string) + ":" + m["id"].(string) + ":" + untrusted(m)["title"].(string)
		if a, ok := m["available"]; ok && a == false {
			k += ":unavailable"
		}
		keys = append(keys, k)
	}
	return keys
}

func TestNoteLinksOnPlaintextAccount(t *testing.T) {
	f := newFixture(t)
	f.put("u1", "project", "p1", map[string]any{"name": "Renovation", "description": "Plan in [Trip](?note=trip)", "position": 1, "created_at": 1})
	f.note("u1", "trip", "Trip", "Ferry: [Book](?task=ferry), budget [old name](?project=p1), [Gone](?note=gone), [Ghost](?note=elsewhere)", nil)
	f.task("u1", "ferry", "Book ferry", map[string]any{"description": "For [Trip](?note=trip) and again [Trip](?note=trip)"})
	f.task("u1", "plain", "Unrelated", map[string]any{"description": "`[Trip](?note=trip)` in code"})
	f.note("u1", "gone", "Old", "[Trip](?note=trip)", map[string]any{"deleted_at": 7})
	// Another user's note: not the caller's to read.
	f.note("u2", "elsewhere", "Private", "[Trip](?note=trip)", nil)
	c := agent("u1")

	out := f.mustCall(c, "get_note", map[string]any{"id": "trip"})
	if got := strings.Join(linkKeys(t, out, "links"), " "); got != "task:ferry:Book ferry project:p1:Renovation note:gone:Gone:unavailable note:elsewhere:Ghost:unavailable" {
		t.Fatalf("links = %s", got)
	}
	from := linkKeys(t, out, "linked_from")
	if len(from) != 2 || !contains(from, "task:ferry:Book ferry") || !contains(from, "project:p1:Renovation") {
		t.Fatalf("linked_from = %v", from)
	}

	task := f.mustCall(c, "get_task", map[string]any{"id": "ferry"})
	if got := strings.Join(linkKeys(t, task, "links"), " "); got != "note:trip:Trip" {
		t.Fatalf("get_task links = %s", got)
	}
	if got := strings.Join(linkKeys(t, task, "linked_from"), " "); got != "note:trip:Trip" {
		t.Fatalf("get_task linked_from = %s", got)
	}
	// A task nothing links to and with no links: both lists empty, not missing.
	none := f.mustCall(c, "get_task", map[string]any{"id": "plain"})
	if len(linkKeys(t, none, "links")) != 0 || len(linkKeys(t, none, "linked_from")) != 0 {
		t.Fatalf("plain task = %v", none)
	}
	// The project's note, through get_note kind project.
	proj := f.mustCall(c, "get_note", map[string]any{"id": "p1", "kind": "project"})
	if got := strings.Join(linkKeys(t, proj, "linked_from"), " "); got != "note:trip:Trip" {
		t.Fatalf("project linked_from = %s", got)
	}
}

func TestNoteLinksAbsentOnEncryptedAccount(t *testing.T) {
	f := newFixture(t)
	f.note("u1", "trip", fakeSeal("note", "trip", "title", "Trip"), fakeSeal("note", "trip", "description", "[x](?task=t1)"), nil)
	f.task("u1", "t1", fakeSeal("task", "t1", "title", "Ferry"), map[string]any{"description": fakeSeal("task", "t1", "description", "[Trip](?note=trip)")})
	c := agent("u1")
	c.Encrypted = true
	for _, call := range []struct {
		tool string
		args map[string]any
	}{{"get_note", map[string]any{"id": "trip"}}, {"get_task", map[string]any{"id": "t1"}}} {
		out := f.mustCall(c, call.tool, call.args)
		raw, _ := json.Marshal(out)
		if _, ok := out["links"]; ok || strings.Contains(string(raw), "linked_from") {
			t.Fatalf("%s on an encrypted account = %s", call.tool, raw)
		}
	}
	relayed := c
	relayed.Relay = &fakeRelay{}
	if out := f.mustCall(relayed, "get_note", map[string]any{"id": "trip"}); out["links"] != nil || out["linked_from"] != nil {
		t.Fatalf("relayed get_note = %v", out)
	}
}

func TestLinkFormInWriteToolDescriptions(t *testing.T) {
	r := newFixture(t).reg
	for _, name := range []string{"create_note", "update_note", "append_to_note", "create_tasks", "update_tasks"} {
		d, ok := r.Lookup(name, agent("u1"))
		if !ok || !strings.Contains(d.Description, "[title](?note=<id>)") {
			t.Errorf("%s description lacks the link form: %q", name, d.Description)
		}
	}
	for _, name := range []string{"get_note", "get_task"} {
		d, _ := r.Lookup(name, agent("u1"))
		if !strings.Contains(d.Description, "linked_from") {
			t.Errorf("%s description lacks linked_from", name)
		}
	}
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}
