package httpapi

import (
	"bytes"
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/ids"
)

// publishNote publishes noteID as by and returns the page's secret and response.
func publishNote(t *testing.T, by *env, noteID string, body map[string]any) (string, map[string]any) {
	t.Helper()
	resp, out := by.do("POST", "/api/v1/notes/"+noteID+"/page", body)
	by.mustStatus(resp, 201, out)
	link := out["link"].(string)
	i := strings.Index(link, "/n/")
	if i < 0 {
		t.Fatalf("link = %q", link)
	}
	secret, _, _ := strings.Cut(link[i+3:], "/")
	return secret, out
}

func newNote(t *testing.T, e *env, body map[string]any) string {
	t.Helper()
	resp, out := e.do("POST", "/api/v1/notes", body)
	e.mustStatus(resp, 201, out)
	return out["id"].(string)
}

func TestNotePagePublishing(t *testing.T) {
	se := newShareEnv(t)
	note := newNote(t, se.alice, map[string]any{"title": "Wi-Fi for guests", "description": "Network: home"})
	p := "/api/v1/notes/" + note + "/page"
	anon := newClientAt(se.alice, "10.8.0.1")
	for _, m := range []string{"POST", "GET", "DELETE"} {
		if resp, _ := anon.do(m, p, map[string]any{}); resp.StatusCode != 401 {
			t.Fatalf("anonymous %s = %d", m, resp.StatusCode)
		}
	}
	for _, scope := range []string{"read", "agent"} {
		tok := se.alice.token(scope)
		if resp, out := se.alice.bearerClient().do("POST", p, map[string]any{}, bearer(tok)...); resp.StatusCode != 403 || errCode(out) != "insufficient_scope" {
			t.Fatalf("%s token = %d %v", scope, resp.StatusCode, out)
		}
	}
	if resp, out := se.bob.do("POST", p, map[string]any{}); resp.StatusCode != 404 || errCode(out) != "not_found" {
		t.Fatalf("stranger = %d %v", resp.StatusCode, out)
	}
	for _, body := range []map[string]any{{"label": "Wi Fi"}, {"label": "WIFI"}, {"label": strings.Repeat("a", 41)},
		{"expiresInDays": 0}, {"expiresInDays": 91}, {"rights": "view"}} {
		resp, out := se.alice.do("POST", p, body)
		if resp.StatusCode != 400 || errCode(out) != "invalid_input" {
			t.Fatalf("%v = %d %v", body, resp.StatusCode, out)
		}
		msg := out["error"].(map[string]any)["message"].(string)
		for field := range body {
			if !strings.Contains(msg, field) {
				t.Fatalf("%v: message %q does not name %s", body, msg, field)
			}
		}
	}
	first, created := publishNote(t, se.alice, note, map[string]any{"label": "wifi", "expiresInDays": 30})
	if len(first) != 22 || !strings.HasSuffix(created["link"].(string), "/n/"+first+"/wifi") || created["expiresAt"] == nil || created["id"] == nil || created["label"] != "wifi" {
		t.Fatalf("created = %v (secret %q)", created, first)
	}
	// Republishing replaces the page.
	second, _ := publishNote(t, se.alice, note, map[string]any{})
	if resp, out := anon.do("GET", "/api/v1/pages/"+first, nil); resp.StatusCode != 404 || errCode(out) != "page_invalid" {
		t.Fatalf("old link = %d %v", resp.StatusCode, out)
	}
	resp, out := se.alice.do("GET", p, nil)
	se.alice.mustStatus(resp, 200, out)
	if out["noteId"] != note || out["secret"] != nil || out["link"] != nil || out["wrappedKey"] != nil || out["encrypted"] != false {
		t.Fatalf("status = %v", out)
	}
	var active int
	se.alice.db.QueryRow(`SELECT COUNT(*) FROM task_pages WHERE note_id = ? AND revoked_at IS NULL`, note).Scan(&active)
	if active != 1 {
		t.Fatalf("active pages for the note = %d", active)
	}
	// A note page is read-only: no replies, no ticks, no map.
	for _, path := range []string{"/replies", "/tick"} {
		if resp, out := anon.do("POST", "/api/v1/pages/"+second+path, map[string]any{"name": "Marco", "body": "Hi", "taskId": note, "completed": true}); resp.StatusCode != 403 || errCode(out) != "forbidden" {
			t.Fatalf("%s = %d %v", path, resp.StatusCode, out)
		}
	}
	if resp, _ := anon.do("GET", "/api/v1/pages/"+second+"/maps/style", nil); resp.StatusCode != 404 {
		t.Fatalf("map style = %d", resp.StatusCode)
	}
	resp, out = se.alice.do("DELETE", p, nil)
	se.alice.mustStatus(resp, 204, out)
	if resp, out := anon.do("GET", "/api/v1/pages/"+second, nil); resp.StatusCode != 404 || errCode(out) != "page_invalid" {
		t.Fatalf("revoked = %d %v", resp.StatusCode, out)
	}
	for _, m := range []string{"GET", "DELETE"} {
		if resp, out := se.alice.do(m, p, nil); resp.StatusCode != 404 || errCode(out) != "not_found" {
			t.Fatalf("no page %s = %d %v", m, resp.StatusCode, out)
		}
	}
	// In a shared project: the owner and admins may publish its notes, editors not.
	se.share(se.alice, "bob@example.com", "admin")
	se.share(se.alice, "carol@example.com", "editor")
	shared := newNote(t, se.alice, map[string]any{"title": "Renovation plan", "project_id": se.project})
	publishNote(t, se.bob, shared, map[string]any{})
	for _, m := range []string{"POST", "GET", "DELETE"} {
		if resp, out := se.carol.do(m, "/api/v1/notes/"+shared+"/page", map[string]any{}); resp.StatusCode != 403 || errCode(out) != "forbidden" {
			t.Fatalf("editor %s = %d %v", m, resp.StatusCode, out)
		}
	}
	// The pages reach the publisher's devices through the shared list, with their kind.
	resp, out = se.bob.do("GET", "/api/v1/task-pages", nil)
	se.bob.mustStatus(resp, 200, out)
	if pages := out["pages"].([]any); len(pages) != 1 || pages[0].(map[string]any)["kind"] != "note" || pages[0].(map[string]any)["noteId"] != shared {
		t.Fatalf("list = %v", out)
	}
}

func TestNotePageLiveRead(t *testing.T) {
	e, uid, _ := attachmentSetup(t)
	other := newNote(t, e, map[string]any{"title": "Door code"})
	text := "Ask about [Door code](?note=" + other + ") and `[code](?task=x1)`.\n\n- [ ] milk\n\n![photo](attachment:a1)"
	note := newNote(t, e, map[string]any{"title": "Babysitter how-to", "description": text})
	png := append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{9}, 64)...)
	noteRow(e, "a1", note, uid, "", png)
	if resp, body := e.raw("PUT", "/api/v1/attachments/a1/content", png); resp.StatusCode != 204 {
		t.Fatalf("upload: %d %s", resp.StatusCode, body)
	}
	secret, _ := publishNote(t, e, note, map[string]any{"label": "babysitter"})
	guest := newClientAt(e, "10.8.1.1")
	resp, out := guest.do("GET", "/api/v1/pages/"+secret, nil)
	guest.mustStatus(resp, 200, out)
	if out["kind"] != "note" || out["mode"] != "live" || out["rights"] != "view" || out["title"] != "Babysitter how-to" || out["serverTime"] == nil || out["changedAt"] == nil {
		t.Fatalf("page = %v", out)
	}
	got := out["text"].(string)
	if !strings.Contains(got, "Ask about Door code and `[code](?task=x1)`.") || strings.Contains(got, other) {
		t.Fatalf("text = %q", got)
	}
	files := out["files"].([]any)
	if len(files) != 1 || files[0].(map[string]any)["id"] != "a1" || files[0].(map[string]any)["image"] != true {
		t.Fatalf("files = %v", files)
	}
	for _, leak := range []string{"labels", "project_id", "notes_doc", "description", "workspace_id", "id", "noteId", "linkedFrom"} {
		if _, ok := out[leak]; ok {
			t.Fatalf("page leaks %s: %v", leak, out)
		}
	}
	for h, want := range map[string]string{"X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer", "Cache-Control": "no-store"} {
		if resp.Header.Get(h) != want {
			t.Fatalf("%s = %q", h, resp.Header.Get(h))
		}
	}
	if resp.Header.Get("Set-Cookie") != "" {
		t.Fatal("a page set a cookie")
	}
	// The photo is served inline so the embed renders, the download as a file.
	resp, body := guest.raw("GET", "/api/v1/pages/"+secret+"/files/a1", nil)
	if resp.StatusCode != 200 || !bytes.Equal(body, png) || resp.Header.Get("Content-Type") != "image/png" || !strings.HasPrefix(resp.Header.Get("Content-Disposition"), "inline") {
		t.Fatalf("image = %d %v", resp.StatusCode, resp.Header)
	}
	resp, _ = guest.raw("GET", "/api/v1/pages/"+secret+"/files/a1?download=1", nil)
	if resp.Header.Get("Content-Type") != "application/octet-stream" {
		t.Fatalf("download = %v", resp.Header)
	}
	if resp, _ := guest.raw("GET", "/api/v1/pages/"+secret+"/files/nope", nil); resp.StatusCode != 404 {
		t.Fatalf("unknown file = %d", resp.StatusCode)
	}
	// Edited after publishing: the guest sees the new text.
	resp, out = e.do("PATCH", "/api/v1/notes/"+note, map[string]any{"description": "New text"})
	e.mustStatus(resp, 200, out)
	_, out = guest.do("GET", "/api/v1/pages/"+secret, nil)
	if out["text"] != "New text" {
		t.Fatalf("after edit = %v", out)
	}
}

func TestNotePageLifecycleAndLimits(t *testing.T) {
	se := newShareEnv(t)
	note := newNote(t, se.alice, map[string]any{"title": "Garden"})
	secret, _ := publishNote(t, se.alice, note, map[string]any{"expiresInDays": 7})
	guest := newClientAt(se.alice, "10.8.2.1")
	resp, out := se.alice.do("DELETE", "/api/v1/notes/"+note, nil)
	se.alice.mustStatus(resp, 204, out)
	if resp, out := guest.do("GET", "/api/v1/pages/"+secret, nil); resp.StatusCode != 404 || errCode(out) != "page_invalid" {
		t.Fatalf("trashed = %d %v", resp.StatusCode, out)
	}
	// Restored from the Trash on a device.
	syncOnce(se.alice, "laptop", 0, []map[string]any{{"id": ids.New(), "entity": "note", "entityId": note, "field": "deleted_at", "value": nil,
		"ts": time.Now().Add(time.Second).UnixMilli(), "device": "laptop"}})
	resp, out = guest.do("GET", "/api/v1/pages/"+secret, nil)
	guest.mustStatus(resp, 200, out)
	if _, err := se.alice.db.Exec(`UPDATE task_pages SET expires_at = ? WHERE note_id = ?`, time.Now().Add(-time.Minute).UnixMilli(), note); err != nil {
		t.Fatal(err)
	}
	if resp, out := guest.do("GET", "/api/v1/pages/"+secret, nil); resp.StatusCode != 404 || errCode(out) != "page_invalid" {
		t.Fatalf("expired = %d %v", resp.StatusCode, out)
	}
	// An admin who publishes and is then demoted: the page goes invalid.
	se.share(se.alice, "bob@example.com", "admin")
	shared := newNote(t, se.alice, map[string]any{"title": "Shared", "project_id": se.project})
	bobSecret, _ := publishNote(t, se.bob, shared, map[string]any{})
	resp, out = guest.do("GET", "/api/v1/pages/"+bobSecret, nil)
	guest.mustStatus(resp, 200, out)
	resp, out = se.alice.do("PATCH", "/api/v1/projects/"+se.project+"/members/"+se.ids["bob"], map[string]any{"role": "editor"})
	se.alice.mustStatus(resp, 200, out)
	if resp, out := guest.do("GET", "/api/v1/pages/"+bobSecret, nil); resp.StatusCode != 404 || errCode(out) != "page_invalid" {
		t.Fatalf("demoted publisher = %d %v", resp.StatusCode, out)
	}
	// Archiving the project: invalid.
	ownSecret, _ := publishNote(t, se.alice, shared, map[string]any{})
	resp, out = se.alice.do("PATCH", "/api/v1/projects/"+se.project, map[string]any{"archived": true})
	se.alice.mustStatus(resp, 200, out)
	if resp, out := guest.do("GET", "/api/v1/pages/"+ownSecret, nil); resp.StatusCode != 404 || errCode(out) != "page_invalid" {
		t.Fatalf("archived project = %d %v", resp.StatusCode, out)
	}
	// Task and note pages share the 100 active pages: 99 task pages and 1 note page.
	if _, err := se.alice.db.Exec(`DELETE FROM task_pages`); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 99; i++ {
		if _, err := se.alice.db.Exec(`INSERT INTO task_pages(id,task_id,user_id,secret_hash,rights,published_at) VALUES(?,?,?,?,?,?)`,
			ids.New(), ids.New(), se.ids["alice"], ids.New(), "view", time.Now().UnixMilli()); err != nil {
			t.Fatal(err)
		}
	}
	publishNote(t, se.alice, note, map[string]any{})
	another := newNote(t, se.alice, map[string]any{"title": "One too many"})
	if resp, out := se.alice.do("POST", "/api/v1/notes/"+another+"/page", map[string]any{}); resp.StatusCode != 409 || errCode(out) != "limit_reached" {
		t.Fatalf("101st page = %d %v", resp.StatusCode, out)
	}
	// Republishing the same note still works at the limit.
	publishNote(t, se.alice, note, map[string]any{})
	task := personalTask(t, se.alice, map[string]any{"title": "A task"})
	if resp, out := se.alice.do("POST", "/api/v1/tasks/"+task+"/page", map[string]any{"rights": "view"}); resp.StatusCode != 409 || errCode(out) != "limit_reached" {
		t.Fatalf("task page at the shared limit = %d %v", resp.StatusCode, out)
	}
}

// TestNotePageMovedIntoSharedProject: the client moves a note across scopes by
// copying it and deleting the original, so the original's page goes invalid and
// the copy has none.
func TestNotePageMovedIntoSharedProject(t *testing.T) {
	se := newShareEnv(t)
	se.share(se.alice, "bob@example.com", "editor")
	note := newNote(t, se.alice, map[string]any{"title": "Packing list"})
	secret, _ := publishNote(t, se.alice, note, map[string]any{})
	copyID := newNote(t, se.alice, map[string]any{"title": "Packing list", "project_id": se.project})
	resp, out := se.alice.do("DELETE", "/api/v1/notes/"+note, nil)
	se.alice.mustStatus(resp, 204, out)
	if resp, out := newClientAt(se.alice, "10.8.3.1").do("GET", "/api/v1/pages/"+secret, nil); resp.StatusCode != 404 || errCode(out) != "page_invalid" {
		t.Fatalf("moved = %d %v", resp.StatusCode, out)
	}
	if resp, out := se.alice.do("GET", "/api/v1/notes/"+copyID+"/page", nil); resp.StatusCode != 404 || errCode(out) != "not_found" {
		t.Fatalf("copy has a page = %d %v", resp.StatusCode, out)
	}
}

func TestNotePageEncrypted(t *testing.T) {
	se := newShareEnv(t)
	e := se.alice
	resp, out := e.do("PUT", "/api/v1/encryption/keys", keyRecord(1, 3))
	e.mustStatus(resp, 201, out)
	now := time.Now().UnixMilli()
	note := ids.New()
	syncOnce(e, "devA", 0, []map[string]any{
		{"id": ids.New(), "entity": "note", "entityId": note, "field": "title", "value": ct("title"), "ts": now, "device": "devA"},
		{"id": ids.New(), "entity": "note", "entityId": note, "field": "created_at", "value": now, "ts": now, "device": "devA"},
	})
	p := "/api/v1/notes/" + note + "/page"
	if resp, out := e.do("POST", p, map[string]any{}); resp.StatusCode != 400 || errCode(out) != "invalid_input" {
		t.Fatalf("no snapshot = %d %v", resp.StatusCode, out)
	}
	secret, created := publishNote(t, e, note, map[string]any{"snapshot": ct("snap-v1"), "wrappedKey": "wrapped-share-key"})
	if created["encrypted"] != true {
		t.Fatalf("created = %v", created)
	}
	guest := newClientAt(e, "10.8.4.1")
	resp, out = guest.do("GET", "/api/v1/pages/"+secret, nil)
	guest.mustStatus(resp, 200, out)
	if out["kind"] != "note" || out["mode"] != "encrypted" || out["snapshot"] != ct("snap-v1") || out["title"] != nil || out["files"] != nil {
		t.Fatalf("encrypted page = %v", out)
	}
	for _, v := range []int{5, 4} {
		resp, out = e.do("PUT", p+"/snapshot", map[string]any{"ciphertext": ct("snap-v" + string(rune('0'+v))), "version": v})
		e.mustStatus(resp, 200, out)
	}
	_, out = guest.do("GET", "/api/v1/pages/"+secret, nil)
	if out["snapshot"] != ct("snap-v5") {
		t.Fatalf("snapshot = %v", out["snapshot"])
	}
	if resp, out := e.do("PUT", p+"/snapshot", map[string]any{"ciphertext": strings.Repeat("x", 256<<10+1), "version": 9}); resp.StatusCode != 400 || errCode(out) != "invalid_input" {
		t.Fatalf("large snapshot = %d %v", resp.StatusCode, out)
	}
	if resp, out := se.bob.do("PUT", p+"/snapshot", map[string]any{"ciphertext": ct("x"), "version": 10}); resp.StatusCode != 404 || errCode(out) != "not_found" {
		t.Fatalf("other account = %d %v", resp.StatusCode, out)
	}
	read := e.token("read")
	if resp, out := e.bearerClient().do("PUT", p+"/snapshot", map[string]any{"ciphertext": ct("x"), "version": 10}, bearer(read)...); resp.StatusCode != 403 || errCode(out) != "insufficient_scope" {
		t.Fatalf("read token = %d %v", resp.StatusCode, out)
	}
	if resp, _ := newClientAt(e, "10.8.4.9").do("PUT", p+"/snapshot", map[string]any{"ciphertext": "x", "version": 10}); resp.StatusCode != 401 {
		t.Fatalf("anonymous = %d", resp.StatusCode)
	}
	resp, out = e.do("GET", "/api/v1/task-pages", nil)
	e.mustStatus(resp, 200, out)
	if pages := out["pages"].([]any); len(pages) != 1 || pages[0].(map[string]any)["wrappedKey"] != "wrapped-share-key" || pages[0].(map[string]any)["kind"] != "note" {
		t.Fatalf("list = %v", out)
	}
	// A live page takes no snapshot.
	bobNote := newNote(t, se.bob, map[string]any{"title": "Bob's"})
	publishNote(t, se.bob, bobNote, map[string]any{})
	if resp, out := se.bob.do("PUT", "/api/v1/notes/"+bobNote+"/page/snapshot", map[string]any{"ciphertext": ct("x"), "version": 1, "wrappedKey": "k"}); resp.StatusCode != 409 || errCode(out) != "page_not_encrypted" {
		t.Fatalf("live snapshot = %d %v", resp.StatusCode, out)
	}
}

func TestNotePageShellAndLog(t *testing.T) {
	if got := redactPath("/n/abcdefghijklmnopqrstuv/wifi"); got != "/n/[redacted]" {
		t.Fatalf("redact page = %q", got)
	}
}
