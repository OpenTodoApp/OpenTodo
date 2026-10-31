package cli

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/e2ee/crypt"
)

// Notes on end-to-end encrypted accounts (notes-overview, requirement "Notes
// in the CLI and MCP on encrypted accounts"): the CLI part (2.8) and `ot mcp
// --decrypt` (2.9).

func (h *harness) seedSealedNotes(dek []byte) {
	h.t.Helper()
	s := func(entity, id, field, pt string) string { return h.seal(dek, entity, id, field, pt) }
	h.put("note", "meet0001", map[string]any{"title": s("note", "meet0001", "title", "Meeting"), "description": s("note", "meet0001", "description", "Agenda"),
		"notes_doc": s("note", "meet0001", "notes_doc", "doc-bytes"), "labels": []string{}, "project_id": nil, "deleted_at": nil})
	h.put("note", "pass0001", map[string]any{"title": s("note", "pass0001", "title", "Passport numbers"), "description": s("note", "pass0001", "description", "Renew in May"),
		"labels": []string{}, "project_id": nil, "deleted_at": nil})
	h.put("task", "8c2a0001", map[string]any{"title": s("task", "8c2a0001", "title", "Call the bank"), "description": s("task", "8c2a0001", "description", "Ask about the card")})
}

// lastAppend returns the id and stored text of an entity's last pending append.
func lastAppend(t *testing.T, e map[string]any) (string, string) {
	t.Helper()
	apps, _ := e["appends"].([]any)
	if len(apps) == 0 {
		t.Fatalf("no pending append: %v", e)
	}
	a := apps[len(apps)-1].(map[string]any)
	return a["id"].(string), a["text"].(string)
}

// Scenarios "Locked CLI" and "Unlocked CLI".
func TestNotesEncryptedCLI(t *testing.T) {
	h := newHarness(t)
	h.login()
	dek := seqBytes(0x40, 32)
	h.encrypted(1, dek)
	h.seedSealedNotes(dek)

	// Locked: text writes stop before anything is sent; reads say encrypted.
	h.requestLog()
	for _, args := range [][]string{
		{"notes", "append", "Meeting", "call back"},
		{"notes", "add", "Secret"},
		{"notes", "edit", "meet", "--body", "x"},
		{"notes", "to-task", "meet"},
		{"task", "note", "8c2a", "--set", "x"},
		{"task", "note", "8c2a", "--append", "x"},
	} {
		code, out, _ := h.run(append(args, "--json")...)
		if code != ExitNotPermitted || !strings.Contains(out, `"code":"encryption_enabled"`) {
			t.Fatalf("locked %v: %d %s", args, code, out)
		}
	}
	if w := writesIn(h.requestLog()); len(w) != 0 {
		t.Fatalf("locked writes sent: %v", w)
	}
	if out := h.mustRun("notes"); !strings.Contains(out, encryptedText) || strings.Contains(out, "enc:v1:") {
		t.Fatalf("locked list:\n%s", out)
	}
	if out := h.mustRun("notes", "show", "meet"); !strings.Contains(out, "encrypted") {
		t.Fatalf("locked show: %q", out)
	}
	// rm still works without the key.
	h.put("note", "gone0001", map[string]any{"title": h.seal(dek, "note", "gone0001", "title", "Old"), "labels": []string{}, "project_id": nil, "deleted_at": nil})
	h.mustRun("notes", "rm", "gone", "--yes")
	if h.note("gone0001")["deleted_at"] == nil {
		t.Fatal("locked rm did not delete")
	}

	// Unlocked: the append reaches the server as ciphertext for its field.
	h.mustRun("encryption", "unlock", "--passphrase-file", h.passphraseFile())
	out := h.mustRun("notes", "append", "Meeting", "call back", "--json")
	var res map[string]any
	_ = json.Unmarshal([]byte(out), &res)
	aid, stored := lastAppend(t, h.note("meet0001"))
	if aid != res["append_id"] || !e2ee.IsCiphertext(stored) {
		t.Fatalf("stored append %q %q (%s)", aid, stored, out)
	}
	if pt, err := crypt.Open(dek, "note", "meet0001", "appends."+aid, stored); err != nil || pt != "call back" {
		t.Fatalf("append opens to %q, %v", pt, err)
	}
	if out := h.mustRun("notes", "show", "Meeting"); out != "Agenda\n\ncall back\n" {
		t.Fatalf("unlocked show = %q", out)
	}
	if out := h.mustRun("notes", "search", "passport"); !strings.Contains(out, "Passport numbers") {
		t.Fatalf("unlocked search:\n%s", out)
	}

	// A new note: created without text, then its title and text sealed for its id.
	var added map[string]any
	_ = json.Unmarshal([]byte(h.mustRun("notes", "add", "Locker code", "--body", "4711", "--json")), &added)
	id := added["id"].(string)
	n := h.note(id)
	if pt, err := crypt.Open(dek, "note", id, "title", n["title"].(string)); err != nil || pt != "Locker code" {
		t.Fatalf("added title %v: %q %v", n["title"], pt, err)
	}
	if pt, err := crypt.Open(dek, "note", id, "description", n["description"].(string)); err != nil || pt != "4711" {
		t.Fatalf("added description: %q %v", pt, err)
	}

	// A task's note replaced and appended to.
	h.mustRun("task", "note", "8c2a", "--set", "New plan")
	tk := h.task("8c2a0001")
	if pt, err := crypt.Open(dek, "task", "8c2a0001", "description", tk["description"].(string)); err != nil || pt != "New plan" {
		t.Fatalf("task description: %q %v", pt, err)
	}
	h.mustRun("task", "note", "Call the bank", "--append", "- called")
	aid, stored = lastAppend(t, h.task("8c2a0001"))
	if pt, err := crypt.Open(dek, "task", "8c2a0001", "appends."+aid, stored); err != nil || pt != "- called" {
		t.Fatalf("task append: %q %v", pt, err)
	}

	// to-task seals the title, text and document for the task id it chose.
	tid := strings.TrimSpace(h.mustRun("notes", "to-task", "Passport"))
	tk = h.task(tid)
	if pt, err := crypt.Open(dek, "task", tid, "title", tk["title"].(string)); err != nil || pt != "Passport numbers" {
		t.Fatalf("to-task title: %q %v", pt, err)
	}
	if pt, err := crypt.Open(dek, "task", tid, "description", tk["description"].(string)); err != nil || pt != "Renew in May" {
		t.Fatalf("to-task description: %q %v", pt, err)
	}
	// A note with an append no device merged yet is refused (its appends are
	// sealed for the note).
	if code, _, errb := h.run("notes", "to-task", "Meeting"); code != ExitUsage || !strings.Contains(errb, "appended") {
		t.Fatalf("to-task with appends: %d %s", code, errb)
	}
}

// Scenario "Decrypting bridge searches locally", and the note tools'
// attribution: the server receives only ciphertext and no query text.
func TestMCPBridgeDecryptsNotes(t *testing.T) {
	h := newHarness(t)
	h.env["OPENTODO_URL"] = h.srv.URL
	h.env["OPENTODO_TOKEN"] = h.agentToken()
	dek := seqBytes(0x40, 32)
	h.encrypted(1, dek)
	h.seedSealedNotes(dek)
	h.putExact("note", "meet0001", map[string]any{"appends.a1": h.seal(dek, "note", "meet0001", "appends.a1", "bring the slides")})
	h.mustRun("encryption", "unlock", "--passphrase-file", h.passphraseFile())
	h.reqMu.Lock()
	h.bodies = nil
	h.reqMu.Unlock()

	code, lines, errb := h.bridge([]string{"--decrypt"},
		toolCall("search_notes", map[string]any{"query": "passport"}),
		toolCall("list_notes", map[string]any{}),
		toolCall("get_note", map[string]any{"id": "meet0001"}),
		map[string]any{"method": "resources/read", "params": map[string]any{"uri": "opentodo://notes"}},
		map[string]any{"method": "resources/read", "params": map[string]any{"uri": "opentodo://notes/meet0001"}},
		toolCall("create_note", map[string]any{"title": "Safe combination", "description": "12-34-56"}),
		toolCall("append_to_note", map[string]any{"note_id": "meet0001", "text": "decided: Friday"}),
		toolCall("update_note", map[string]any{"id": "pass0001", "title": "Passports"}),
		toolCall("note_to_task", map[string]any{"id": "meet0001"}),
	)
	if code != 0 || len(lines) != 9 {
		t.Fatalf("bridge: %d %d lines %s", code, len(lines), errb)
	}
	search := structured(t, lines[0])
	found, _ := json.Marshal(search)
	if notes := search["notes"].([]any); len(notes) != 1 || !bytes.Contains(found, []byte("Passport numbers")) || !bytes.Contains(found, []byte("Renew in May")) {
		t.Fatalf("search_notes = %s", found)
	}
	reads, _ := json.Marshal(lines[1:5])
	if bytes.Contains(reads, []byte(e2ee.Placeholder)) || bytes.Contains(reads, []byte("enc:v1:")) {
		t.Fatalf("placeholder or ciphertext left: %s", reads)
	}
	for _, want := range []string{"Meeting", "Agenda", "bring the slides", "Passport numbers"} {
		if !bytes.Contains(reads, []byte(want)) {
			t.Fatalf("%q not decrypted: %s", want, reads)
		}
	}
	created := structured(t, lines[5])["results"].([]any)[0].(map[string]any)["id"].(string)
	if pt, err := crypt.Open(dek, "note", created, "title", h.note(created)["title"].(string)); err != nil || pt != "Safe combination" {
		t.Fatalf("create_note title: %q %v", pt, err)
	}
	aid := structured(t, lines[6])["results"].([]any)[0].(map[string]any)["append_id"].(string)
	var stored string
	for _, a := range h.note("meet0001")["appends"].([]any) {
		if a.(map[string]any)["id"] == aid {
			stored = a.(map[string]any)["text"].(string)
		}
	}
	if pt, err := crypt.Open(dek, "note", "meet0001", "appends."+aid, stored); err != nil || pt != "decided: Friday" {
		t.Fatalf("append_to_note: %q %v", pt, err)
	}
	if pt, err := crypt.Open(dek, "note", "pass0001", "title", h.note("pass0001")["title"].(string)); err != nil || pt != "Passports" {
		t.Fatalf("update_note: %q %v", pt, err)
	}
	if res := lines[8]["result"].(map[string]any); res["isError"] != true || !strings.Contains(res["content"].([]any)[0].(map[string]any)["text"].(string), "ot notes to-task") {
		t.Fatalf("note_to_task: %v", lines[8])
	}
	// What the server received: ciphertext, never the query or the plaintext.
	h.reqMu.Lock()
	sent := strings.ToLower(strings.Join(h.bodies, "\n"))
	h.reqMu.Unlock()
	for _, leak := range []string{"passport", "safe combination", "12-34-56", "decided: friday", "search_notes", "note_to_task"} {
		if strings.Contains(sent, leak) {
			t.Fatalf("the server received %q", leak)
		}
	}
}
