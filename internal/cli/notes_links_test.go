package cli

import (
	"encoding/json"
	"strings"
	"testing"
)

// `ot notes links` (OpenSpec change note-links, task 4.2): outgoing links and
// linked references computed on this machine, plaintext and encrypted.

func linksOf(t *testing.T, out string) noteLinksOut {
	t.Helper()
	var v noteLinksOut
	if err := json.Unmarshal([]byte(out), &v); err != nil {
		t.Fatalf("%v: %s", err, out)
	}
	return v
}

func TestNotesLinks(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.put("project", "reno0001", map[string]any{"name": "Renovation", "color": "#10b981", "archived": false, "description": ""})
	h.put("note", "trip0001", map[string]any{"title": "Trip", "description": "Book [the ferry](?task=ferr0001), see [Reno](?project=reno0001) and [Lost](?note=gone0001)", "labels": []string{}, "project_id": nil, "deleted_at": nil})
	h.put("task", "ferr0001", map[string]any{"title": "Book ferry", "description": "For [Trip](?note=trip0001)"})
	h.put("task", "call0001", map[string]any{"title": "Call", "description": "`[Trip](?note=trip0001)` is code"})
	h.put("note", "gone0001", map[string]any{"title": "Gone", "description": "[Trip](?note=trip0001)", "labels": []string{}, "project_id": nil, "deleted_at": 5})

	v := linksOf(t, h.mustRun("notes", "links", "Trip", "--json"))
	if v.Kind != "note" || v.ID != "trip0001" || v.Title != "Trip" {
		t.Fatalf("item = %+v", v)
	}
	want := []noteLinkOut{{"task", "ferr0001", "Book ferry", true}, {"project", "reno0001", "Renovation", true}, {"note", "gone0001", "Lost", false}}
	if len(v.Links) != len(want) {
		t.Fatalf("links = %+v", v.Links)
	}
	for i := range want {
		if v.Links[i] != want[i] {
			t.Fatalf("links[%d] = %+v, want %+v", i, v.Links[i], want[i])
		}
	}
	if len(v.LinkedFrom) != 1 || v.LinkedFrom[0] != (noteLinkedFrom{"task", "ferr0001", "Book ferry"}) {
		t.Fatalf("linked_from = %+v", v.LinkedFrom)
	}
	// A project without a note is found too, and lists what links to it.
	p := linksOf(t, h.mustRun("notes", "links", "reno", "--json"))
	if p.Kind != "project" || len(p.LinkedFrom) != 1 || p.LinkedFrom[0].ID != "trip0001" || len(p.Links) != 0 {
		t.Fatalf("project = %+v", p)
	}
	table := h.mustRun("notes", "links", "trip")
	for _, s := range []string{"Links to (3)", "Book ferry", "note (not found)", "Linked references (1)"} {
		if !strings.Contains(table, s) {
			t.Fatalf("table lacks %q:\n%s", s, table)
		}
	}
	mustMatch(t, loadSchemas(t), "notes links", h.mustRun("notes", "links", "Trip", "--json"), specOutput(t, "notes links"))
}

func TestNotesLinksEncrypted(t *testing.T) {
	h := newHarness(t)
	h.login()
	dek := seqBytes(0x40, 32)
	h.encrypted(1, dek)
	s := func(entity, id, field, pt string) string { return h.seal(dek, entity, id, field, pt) }
	h.put("note", "trip0001", map[string]any{"title": s("note", "trip0001", "title", "Trip"), "description": s("note", "trip0001", "description", "x"), "labels": []string{}, "project_id": nil, "deleted_at": nil})
	h.put("task", "ferr0001", map[string]any{"title": s("task", "ferr0001", "title", "Book ferry"), "description": s("task", "ferr0001", "description", "For [Trip](?note=trip0001)")})

	// Locked: encryption_enabled, exit 5.
	code, out, _ := h.run("notes", "links", "trip0001", "--json")
	if code != ExitNotPermitted || !strings.Contains(out, `"code":"encryption_enabled"`) {
		t.Fatalf("locked: %d %s", code, out)
	}
	h.mustRun("encryption", "unlock", "--passphrase-file", h.passphraseFile())
	v := linksOf(t, h.mustRun("notes", "links", "Trip", "--json"))
	if len(v.LinkedFrom) != 1 || v.LinkedFrom[0] != (noteLinkedFrom{"task", "ferr0001", "Book ferry"}) {
		t.Fatalf("unlocked linked_from = %+v", v.LinkedFrom)
	}
}
