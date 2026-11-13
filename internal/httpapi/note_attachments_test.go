package httpapi

import (
	"bytes"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/ids"
)

// note-attachments 1.3: a note's attachments through REST, refused without a
// session, for a read token and on a note the caller cannot read.
func TestNoteAttachmentRoutes(t *testing.T) {
	e, _, _ := attachmentSetup(t)
	resp, out := e.do("POST", "/api/v1/notes", map[string]any{"title": "Recipe"})
	e.mustStatus(resp, 201, out)
	note := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/notes/"+note+"/attachments", map[string]any{"url": "https://example.com/booking.pdf", "name": "Booking"})
	e.mustStatus(resp, 201, out)
	if out["note_id"] != note || out["task_id"] != nil {
		t.Fatalf("created %v", out)
	}
	resp, out = e.do("GET", "/api/v1/notes/"+note+"/attachments", nil)
	e.mustStatus(resp, 200, out)
	if list := out["attachments"].([]any); len(list) != 1 {
		t.Fatalf("list %v", list)
	}
	resp, out = e.do("GET", "/api/v1/notes/nope/attachments", nil)
	e.mustStatus(resp, 404, out)
	c := e.bearerClient()
	resp, out = c.do("POST", "/api/v1/notes/"+note+"/attachments", map[string]any{"url": "https://example.com/x"}, bearer(e.token("read"))...)
	if resp.StatusCode != 403 {
		t.Fatalf("read token: %d %v", resp.StatusCode, out)
	}
	anon := newClientAt(e, "203.0.113.11")
	resp, out = anon.do("GET", "/api/v1/notes/"+note+"/attachments", nil)
	anon.mustStatus(resp, 401, out)
}

// noteRow creates a note attachment row through sync like a device does; file
// names the original a copy shares (note-attachments D3).
func noteRow(e *env, id, note, author, file string, content []byte) {
	e.t.Helper()
	ts := deviceNow()
	fields := map[string]any{
		"note_id": note, "author_id": author, "comment_id": nil, "name": "photo.png", "mime": "image/png",
		"size": len(content), "sha256": digestOf(content), "url": nil, "encrypted": false, "created_at": ts, "uploaded_at": nil, "deleted_at": nil,
	}
	if file != "" {
		fields["file_id"] = file
	}
	var ops []map[string]any
	for f, v := range fields {
		ops = append(ops, map[string]any{"id": ids.New(), "entity": "attachment", "entityId": id, "field": f, "value": v, "ts": ts, "device": "laptop"})
	}
	out := syncOnce(e, "laptop", 0, ops)
	if rej, _ := out["rejected"].([]any); len(rej) > 0 {
		e.t.Fatalf("rejected %v", rej)
	}
}

// "Move to a shared project" without uploading again: a copy made before the
// original's upload is stored with it, and serves the original's bytes.
func TestNoteAttachmentCopyServesTheOriginal(t *testing.T) {
	e, uid, _ := attachmentSetup(t)
	png := append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{9}, 64)...)
	notes := []string{}
	for _, n := range []string{"Trip", "Trip (shared)"} {
		resp, out := e.do("POST", "/api/v1/notes", map[string]any{"title": n})
		e.mustStatus(resp, 201, out)
		notes = append(notes, out["id"].(string))
	}
	noteRow(e, "a1", notes[0], uid, "", png)
	noteRow(e, "c1", notes[1], uid, "a1", png)
	// The copy has nothing to receive until the original is stored.
	if resp, _ := e.raw("PUT", "/api/v1/attachments/c1/content", nil); resp.StatusCode != 404 {
		t.Fatalf("copy before the original: %d", resp.StatusCode)
	}
	if resp, body := e.raw("PUT", "/api/v1/attachments/a1/content", png); resp.StatusCode != 204 {
		t.Fatalf("upload: %d %s", resp.StatusCode, body)
	}
	resp, out := e.do("GET", "/api/v1/notes/"+notes[1]+"/attachments", nil)
	e.mustStatus(resp, 200, out)
	if list := out["attachments"].([]any); len(list) != 1 || list[0].(map[string]any)["uploaded"] != true {
		t.Fatalf("copy %v", list)
	}
	resp, body := e.raw("GET", "/api/v1/attachments/c1/content", nil)
	if resp.StatusCode != 200 || !bytes.Equal(body, png) {
		t.Fatalf("copy content: %d", resp.StatusCode)
	}
}
