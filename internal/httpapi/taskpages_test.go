package httpapi

import (
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/ids"
)

// publishPage publishes taskID as by and returns the page's secret and response.
func publishPage(t *testing.T, by *env, taskID string, body map[string]any) (string, map[string]any) {
	t.Helper()
	resp, out := by.do("POST", "/api/v1/tasks/"+taskID+"/page", body)
	by.mustStatus(resp, 201, out)
	link := out["link"].(string)
	i := strings.Index(link, "/t/")
	if i < 0 {
		t.Fatalf("link = %q", link)
	}
	secret, _, _ := strings.Cut(link[i+3:], "/")
	return secret, out
}

// personalTask creates a personal task for e and returns its id.
func personalTask(t *testing.T, e *env, body map[string]any) string {
	t.Helper()
	resp, out := e.do("POST", "/api/v1/tasks", body)
	e.mustStatus(resp, 201, out)
	return out["id"].(string)
}

func TestTaskPagePublishing(t *testing.T) {
	se := newShareEnv(t)
	task := personalTask(t, se.alice, map[string]any{"title": "Paint the fence"})
	sub := personalTask(t, se.alice, map[string]any{"title": "Buy primer", "parent_id": task})
	p := "/api/v1/tasks/" + task + "/page"
	anon := newClientAt(se.alice, "10.7.0.1")
	for _, m := range []string{"POST", "GET", "DELETE"} {
		if resp, _ := anon.do(m, p, map[string]any{"rights": "view"}); resp.StatusCode != 401 {
			t.Fatalf("anonymous %s = %d", m, resp.StatusCode)
		}
	}
	read := se.alice.token("read")
	if resp, out := se.alice.bearerClient().do("POST", p, map[string]any{"rights": "view"}, bearer(read)...); resp.StatusCode != 403 || errCode(out) != "insufficient_scope" {
		t.Fatalf("read token = %d %v", resp.StatusCode, out)
	}
	if resp, out := se.bob.do("POST", p, map[string]any{"rights": "view"}); resp.StatusCode != 404 || errCode(out) != "not_found" {
		t.Fatalf("stranger = %d %v", resp.StatusCode, out)
	}
	for _, body := range []map[string]any{{"rights": "edit"}, {"rights": "view", "label": "Paint Fence"}, {"rights": "view", "label": strings.Repeat("a", 41)},
		{"rights": "view", "expiresInDays": 0}, {"rights": "view", "expiresInDays": 91}} {
		if resp, out := se.alice.do("POST", p, body); resp.StatusCode != 400 || errCode(out) != "invalid_input" {
			t.Fatalf("%v = %d %v", body, resp.StatusCode, out)
		}
	}
	if resp, out := se.alice.do("POST", "/api/v1/tasks/"+sub+"/page", map[string]any{"rights": "view"}); resp.StatusCode != 400 || !strings.Contains(out["error"].(map[string]any)["message"].(string), "task") {
		t.Fatalf("subtask = %d %v", resp.StatusCode, out)
	}
	first, created := publishPage(t, se.alice, task, map[string]any{"rights": "reply", "label": "paint-the-fence", "expiresInDays": 30})
	if len(first) != 22 || !strings.HasSuffix(created["link"].(string), "/t/"+first+"/paint-the-fence") || created["expiresAt"] == nil || created["rights"] != "reply" {
		t.Fatalf("created = %v (secret %q)", created, first)
	}
	// Republishing replaces the page: the old link is gone.
	second, _ := publishPage(t, se.alice, task, map[string]any{"rights": "tick"})
	if resp, out := anon.do("GET", "/api/v1/pages/"+first, nil); resp.StatusCode != 404 || errCode(out) != "page_invalid" {
		t.Fatalf("old link = %d %v", resp.StatusCode, out)
	}
	resp, out := anon.do("POST", "/api/v1/pages/"+second+"/replies", map[string]any{"name": "Marco", "body": "First coat done"})
	anon.mustStatus(resp, 201, out)
	resp, out = anon.do("POST", "/api/v1/pages/"+second+"/replies", map[string]any{"name": "Marco", "body": "Need more paint"})
	anon.mustStatus(resp, 201, out)
	resp, out = se.alice.do("GET", p, nil)
	se.alice.mustStatus(resp, 200, out)
	if out["rights"] != "tick" || out["replies"].(float64) != 2 || out["secret"] != nil || out["link"] != nil || out["wrappedKey"] != nil {
		t.Fatalf("status = %v", out)
	}
	resp, out = se.alice.do("DELETE", p, nil)
	se.alice.mustStatus(resp, 204, out)
	if resp, out := anon.do("GET", "/api/v1/pages/"+second, nil); resp.StatusCode != 404 || errCode(out) != "page_invalid" {
		t.Fatalf("revoked = %d %v", resp.StatusCode, out)
	}
	if resp, out := se.alice.do("GET", p, nil); resp.StatusCode != 404 || errCode(out) != "not_found" {
		t.Fatalf("no page = %d %v", resp.StatusCode, out)
	}
	var n int
	se.alice.db.QueryRow(`SELECT COUNT(*) FROM audit_events WHERE name IN ('task_page.published','task_page.revoked')`).Scan(&n)
	if n != 4 {
		t.Fatalf("audit = %d", n)
	}
	// In a shared project: the owner and admins may publish, editors may not.
	se.share(se.alice, "bob@example.com", "admin")
	se.share(se.alice, "carol@example.com", "editor")
	publishPage(t, se.bob, se.task, map[string]any{"rights": "view"})
	for _, m := range []string{"POST", "GET", "DELETE"} {
		if resp, out := se.carol.do(m, "/api/v1/tasks/"+se.task+"/page", map[string]any{"rights": "view"}); resp.StatusCode != 403 || errCode(out) != "forbidden" {
			t.Fatalf("editor %s = %d %v", m, resp.StatusCode, out)
		}
	}
}

func TestTaskPageLiveRead(t *testing.T) {
	se := newShareEnv(t)
	task := personalTask(t, se.alice, map[string]any{"title": "Paint the fence", "description": "Two coats, **white**"})
	for _, title := range []string{"Buy primer", "Sand the boards", "First coat"} {
		personalTask(t, se.alice, map[string]any{"title": title, "parent_id": task})
	}
	resp, out := se.alice.do("POST", "/api/v1/tasks/"+task+"/comments", map[string]any{"body": "Before publishing"})
	se.alice.mustStatus(resp, 201, out)
	secret, _ := publishPage(t, se.alice, task, map[string]any{"rights": "tick"})
	guest := newClientAt(se.alice, "10.7.1.1")
	resp, out = guest.do("GET", "/api/v1/pages/"+secret, nil)
	guest.mustStatus(resp, 200, out)
	if out["title"] != "Paint the fence" || out["description"] != "Two coats, **white**" || len(out["subtasks"].([]any)) != 3 || len(out["comments"].([]any)) != 0 ||
		out["rights"] != "tick" || out["serverTime"] == nil || out["mode"] != "live" {
		t.Fatalf("page = %v", out)
	}
	for _, leak := range []string{"labels", "project_id", "assignee_id", "notes_doc", "secret"} {
		if _, ok := out[leak]; ok {
			t.Fatalf("page leaks %s: %v", leak, out)
		}
	}
	for h, want := range map[string]string{"X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer", "Cache-Control": "no-store"} {
		if got := resp.Header.Get(h); got != want {
			t.Fatalf("%s = %q", h, got)
		}
	}
	if resp.Header.Get("Set-Cookie") != "" {
		t.Fatal("a page set a cookie")
	}
	// A signed-in member gets the same answer as a guest.
	resp, signed := se.alice.do("GET", "/api/v1/pages/"+secret, nil)
	se.alice.mustStatus(resp, 200, signed)
	if signed["title"] != out["title"] || len(signed["comments"].([]any)) != 0 {
		t.Fatalf("signed in = %v", signed)
	}
	// After publishing, the owner's comment shows with their name.
	resp, c := se.alice.do("POST", "/api/v1/tasks/"+task+"/comments", map[string]any{"body": "Paint is in the shed"})
	se.alice.mustStatus(resp, 201, c)
	_, out = guest.do("GET", "/api/v1/pages/"+secret, nil)
	comments := out["comments"].([]any)
	if len(comments) != 1 || comments[0].(map[string]any)["name"] != "alice" || comments[0].(map[string]any)["guest"] != false {
		t.Fatalf("comments = %v", comments)
	}
	// Guest reply: a comment by the publisher from page:<id>, named by the guest.
	resp, out = guest.do("POST", "/api/v1/pages/"+secret+"/replies", map[string]any{"name": "Marco", "body": "Done the first coat, need more paint"})
	guest.mustStatus(resp, 201, out)
	replyID := out["id"].(string)
	var device, guestName string
	se.alice.db.QueryRow(`SELECT device FROM ops WHERE entity = 'comment' AND entity_id = ? AND field = 'body'`, replyID).Scan(&device)
	if !strings.HasPrefix(device, "page:") {
		t.Fatalf("reply device = %q", device)
	}
	resp, out = se.alice.do("GET", "/api/v1/tasks/"+task+"/comments", nil)
	se.alice.mustStatus(resp, 200, out)
	for _, x := range out["comments"].([]any) {
		if m := x.(map[string]any); m["id"] == replyID {
			guestName, _ = m["guest_name"].(string)
		}
	}
	if guestName != "Marco" {
		t.Fatalf("guest_name = %q", guestName)
	}
	for _, body := range []map[string]any{{"name": "Marco", "body": ""}, {"name": "", "body": "Hi"}, {"name": strings.Repeat("x", 41), "body": "Hi"},
		{"name": "Marco", "body": strings.Repeat("x", 4001)}} {
		if resp, out := guest.do("POST", "/api/v1/pages/"+secret+"/replies", body); resp.StatusCode != 400 || errCode(out) != "invalid_input" {
			t.Fatalf("%v = %d %v", body, resp.StatusCode, out)
		}
	}
	// Ticks: a subtask, then the task; a task outside the page is not found.
	_, page := guest.do("GET", "/api/v1/pages/"+secret, nil)
	primer := page["subtasks"].([]any)[0].(map[string]any)["id"].(string)
	resp, out = guest.do("POST", "/api/v1/pages/"+secret+"/tick", map[string]any{"taskId": primer, "completed": true, "name": "Marco"})
	guest.mustStatus(resp, 200, out)
	if out["completed_at"] == nil {
		t.Fatalf("tick = %v", out)
	}
	other := personalTask(t, se.alice, map[string]any{"title": "Private"})
	if resp, out := guest.do("POST", "/api/v1/pages/"+secret+"/tick", map[string]any{"taskId": other, "completed": true, "name": "Marco"}); resp.StatusCode != 404 || errCode(out) != "not_found" {
		t.Fatalf("outside = %d %v", resp.StatusCode, out)
	}
	resp, out = guest.do("POST", "/api/v1/pages/"+secret+"/tick", map[string]any{"taskId": task, "completed": true, "name": "Marco"})
	guest.mustStatus(resp, 200, out)
	// History names the guest; the publisher is notified.
	resp, out = se.alice.do("GET", "/api/v1/tasks/"+primer+"/history", nil)
	se.alice.mustStatus(resp, 200, out)
	label := ""
	for _, cs := range out["changeSets"].([]any) {
		if m := cs.(map[string]any); strings.HasPrefix(m["device"].(string), "page:") {
			label, _ = m["device_label"].(string)
		}
	}
	if label != "Marco (guest, task page)" {
		t.Fatalf("history label = %q", label)
	}
	var kinds []string
	rows, _ := se.alice.db.Query(`SELECT kind FROM notifications ORDER BY created_at`)
	for rows.Next() {
		var k string
		rows.Scan(&k)
		kinds = append(kinds, k)
	}
	rows.Close()
	if strings.Join(kinds, ",") != "page_replied,page_completed" {
		t.Fatalf("notifications = %v", kinds)
	}
	// Devices cannot forge guest ops.
	resp, out = se.alice.do("POST", "/api/v1/sync", map[string]any{"device": "page:abc", "cursor": 0, "ops": []any{}})
	if resp.StatusCode != 400 || errCode(out) != "invalid_op" {
		t.Fatalf("forged device = %d %v", resp.StatusCode, out)
	}
}

func TestTaskPageRights(t *testing.T) {
	se := newShareEnv(t)
	task := personalTask(t, se.alice, map[string]any{"title": "Water the plants"})
	guest := newClientAt(se.alice, "10.7.2.1")
	view, _ := publishPage(t, se.alice, task, map[string]any{"rights": "view"})
	if resp, out := guest.do("POST", "/api/v1/pages/"+view+"/replies", map[string]any{"name": "Marco", "body": "Hi"}); resp.StatusCode != 403 || errCode(out) != "forbidden" {
		t.Fatalf("reply on view = %d %v", resp.StatusCode, out)
	}
	reply, _ := publishPage(t, se.alice, task, map[string]any{"rights": "reply"})
	if resp, out := guest.do("POST", "/api/v1/pages/"+reply+"/tick", map[string]any{"taskId": task, "completed": true, "name": "Marco"}); resp.StatusCode != 403 || errCode(out) != "forbidden" {
		t.Fatalf("tick on reply = %d %v", resp.StatusCode, out)
	}
	// Reopening only within 24 hours of completion.
	tick, _ := publishPage(t, se.alice, task, map[string]any{"rights": "tick"})
	old := time.Now().Add(-25 * time.Hour).UnixMilli()
	resp, out := se.alice.do("PATCH", "/api/v1/tasks/"+task, map[string]any{"completed_at": old})
	se.alice.mustStatus(resp, 200, out)
	if resp, out := guest.do("POST", "/api/v1/pages/"+tick+"/tick", map[string]any{"taskId": task, "completed": false, "name": "Marco"}); resp.StatusCode != 403 {
		t.Fatalf("late reopen = %d %v", resp.StatusCode, out)
	}
}

func TestTaskPageLifecycle(t *testing.T) {
	se := newShareEnv(t)
	task := personalTask(t, se.alice, map[string]any{"title": "Fix the gate"})
	secret, _ := publishPage(t, se.alice, task, map[string]any{"rights": "view", "expiresInDays": 7})
	guest := newClientAt(se.alice, "10.7.3.1")
	resp, out := se.alice.do("DELETE", "/api/v1/tasks/"+task, nil)
	se.alice.mustStatus(resp, 204, out)
	if resp, out := guest.do("GET", "/api/v1/pages/"+secret, nil); resp.StatusCode != 404 || errCode(out) != "page_invalid" {
		t.Fatalf("trashed = %d %v", resp.StatusCode, out)
	}
	resp, out = se.alice.do("POST", "/api/v1/trash/task/"+task+"/restore", nil)
	if resp.StatusCode >= 300 {
		resp, out = se.alice.do("PATCH", "/api/v1/tasks/"+task, map[string]any{"deleted_at": nil})
	}
	if resp.StatusCode >= 300 {
		t.Fatalf("restore = %d %v", resp.StatusCode, out)
	}
	resp, out = guest.do("GET", "/api/v1/pages/"+secret, nil)
	guest.mustStatus(resp, 200, out)
	// Expiry: the page stops on its last day.
	if _, err := se.alice.db.Exec(`UPDATE task_pages SET expires_at = ?`, time.Now().Add(-time.Minute).UnixMilli()); err != nil {
		t.Fatal(err)
	}
	if resp, out := guest.do("GET", "/api/v1/pages/"+secret, nil); resp.StatusCode != 404 || errCode(out) != "page_invalid" {
		t.Fatalf("expired = %d %v", resp.StatusCode, out)
	}
	// The publisher may no longer publish the task (an admin demoted to editor):
	// unavailable. (A move to a differently shared project makes a copy and
	// deletes the original, which the trash case above covers.)
	se.share(se.alice, "bob@example.com", "admin")
	bobSecret, _ := publishPage(t, se.bob, se.task, map[string]any{"rights": "view"})
	resp, out = guest.do("GET", "/api/v1/pages/"+bobSecret, nil)
	guest.mustStatus(resp, 200, out)
	resp, out = se.alice.do("PATCH", "/api/v1/projects/"+se.project+"/members/"+se.ids["bob"], map[string]any{"role": "editor"})
	se.alice.mustStatus(resp, 200, out)
	if resp, out := guest.do("GET", "/api/v1/pages/"+bobSecret, nil); resp.StatusCode != 404 || errCode(out) != "page_invalid" {
		t.Fatalf("demoted publisher = %d %v", resp.StatusCode, out)
	}
}

func TestTaskPageLimits(t *testing.T) {
	se := newShareEnv(t)
	task := personalTask(t, se.alice, map[string]any{"title": "Flood"})
	secret, _ := publishPage(t, se.alice, task, map[string]any{"rights": "reply"})
	last := 0
	for i := 0; i < 21; i++ {
		c := newClientAt(se.alice, "10.6."+string(rune('0'+i/10))+"."+string(rune('0'+i%10)))
		resp, _ := c.do("POST", "/api/v1/pages/"+secret+"/replies", map[string]any{"name": "Spam", "body": "hello"})
		last = resp.StatusCode
	}
	if last != 429 {
		t.Fatalf("21st reply = %d", last)
	}
	// Guessing pages costs sign-in attempts.
	guesser := newClientAt(se.alice, "10.5.0.1")
	for i := 0; i < 10; i++ {
		guesser.do("GET", "/api/v1/pages/"+strings.Repeat("a", 21)+string(rune('a'+i)), nil)
	}
	if resp, out := guesser.do("GET", "/api/v1/pages/"+strings.Repeat("b", 22), nil); resp.StatusCode != 429 || errCode(out) != "rate_limited" {
		t.Fatalf("11th guess = %d %v", resp.StatusCode, out)
	}
	if resp, _ := guesser.do("POST", "/api/v1/auth/login", map[string]string{"email": "alice@example.com", "password": "wrong password!"}); resp.StatusCode != 429 {
		t.Fatalf("login after guessing = %d", resp.StatusCode)
	}
	// 100 active pages per account.
	for i := 0; i < 100; i++ {
		if _, err := se.alice.db.Exec(`INSERT INTO task_pages(id,task_id,user_id,secret_hash,rights,published_at) VALUES(?,?,?,?,?,?)`,
			ids.New(), ids.New(), se.ids["alice"], ids.New(), "view", time.Now().UnixMilli()); err != nil {
			t.Fatal(err)
		}
	}
	another := personalTask(t, se.alice, map[string]any{"title": "One too many"})
	if resp, out := se.alice.do("POST", "/api/v1/tasks/"+another+"/page", map[string]any{"rights": "view"}); resp.StatusCode != 409 || errCode(out) != "limit_reached" {
		t.Fatalf("101st page = %d %v", resp.StatusCode, out)
	}
}

func TestTaskPageEncrypted(t *testing.T) {
	se := newShareEnv(t)
	e := se.alice
	resp, out := e.do("PUT", "/api/v1/encryption/keys", keyRecord(1, 3))
	e.mustStatus(resp, 201, out)
	now := time.Now().UnixMilli()
	task := ids.New()
	syncOnce(e, "devA", 0, []map[string]any{
		{"id": ids.New(), "entity": "task", "entityId": task, "field": "title", "value": ct("title"), "ts": now, "device": "devA"},
		{"id": ids.New(), "entity": "task", "entityId": task, "field": "created_at", "value": now, "ts": now, "device": "devA"},
	})
	p := "/api/v1/tasks/" + task + "/page"
	if resp, out := e.do("POST", p, map[string]any{"rights": "reply"}); resp.StatusCode != 400 || errCode(out) != "invalid_input" {
		t.Fatalf("no snapshot = %d %v", resp.StatusCode, out)
	}
	secret, created := publishPage(t, e, task, map[string]any{"rights": "tick", "snapshot": ct("snap-v1"), "wrappedKey": "wrapped-share-key"})
	if created["encrypted"] != true {
		t.Fatalf("created = %v", created)
	}
	guest := newClientAt(e, "10.7.4.1")
	resp, out = guest.do("GET", "/api/v1/pages/"+secret, nil)
	guest.mustStatus(resp, 200, out)
	if out["mode"] != "encrypted" || out["snapshot"] != ct("snap-v1") || out["title"] != nil {
		t.Fatalf("encrypted page = %v", out)
	}
	if resp, out := guest.do("POST", "/api/v1/pages/"+secret+"/replies", map[string]any{"name": "Marco", "body": "plain"}); resp.StatusCode != 400 {
		t.Fatalf("plaintext reply = %d %v", resp.StatusCode, out)
	}
	if resp, out := guest.do("POST", "/api/v1/pages/"+secret+"/replies", map[string]any{"ciphertext": strings.Repeat("x", 16<<10+1)}); resp.StatusCode != 400 {
		t.Fatalf("large reply = %d %v", resp.StatusCode, out)
	}
	resp, out = guest.do("POST", "/api/v1/pages/"+secret+"/replies", map[string]any{"ciphertext": ct("reply")})
	guest.mustStatus(resp, 201, out)
	resp, out = e.do("GET", p+"/replies", nil)
	e.mustStatus(resp, 200, out)
	replies := out["replies"].([]any)
	if len(replies) != 1 || replies[0].(map[string]any)["ciphertext"] != ct("reply") {
		t.Fatalf("replies = %v", replies)
	}
	resp, out = e.do("DELETE", p+"/replies/"+replies[0].(map[string]any)["id"].(string), nil)
	e.mustStatus(resp, 204, out)
	resp, out = e.do("GET", p+"/replies", nil)
	e.mustStatus(resp, 200, out)
	if len(out["replies"].([]any)) != 0 {
		t.Fatalf("after confirm = %v", out)
	}
	// The newest snapshot wins.
	for _, v := range []int{5, 4} {
		resp, out = e.do("PUT", p+"/snapshot", map[string]any{"ciphertext": ct("snap-v" + string(rune('0'+v))), "version": v})
		e.mustStatus(resp, 200, out)
	}
	_, out = guest.do("GET", "/api/v1/pages/"+secret, nil)
	if out["snapshot"] != ct("snap-v5") {
		t.Fatalf("snapshot = %v", out["snapshot"])
	}
	if resp, out := e.do("PUT", p+"/snapshot", map[string]any{"ciphertext": strings.Repeat("x", 256<<10+1), "version": 9}); resp.StatusCode != 400 {
		t.Fatalf("large snapshot = %d %v", resp.StatusCode, out)
	}
	// Not the publisher, a read token, nobody.
	if resp, out := se.bob.do("GET", p+"/replies", nil); resp.StatusCode != 404 || errCode(out) != "not_found" {
		t.Fatalf("other account = %d %v", resp.StatusCode, out)
	}
	read := e.token("read")
	if resp, out := e.bearerClient().do("GET", p+"/replies", nil, bearer(read)...); resp.StatusCode != 403 || errCode(out) != "insufficient_scope" {
		t.Fatalf("read token = %d %v", resp.StatusCode, out)
	}
	if resp, _ := newClientAt(e, "10.7.4.9").do("PUT", p+"/snapshot", map[string]any{"ciphertext": "x", "version": 10}); resp.StatusCode != 401 {
		t.Fatalf("anonymous = %d", resp.StatusCode)
	}
	// The wrapped key reaches the publisher's devices through the list only.
	resp, out = e.do("GET", "/api/v1/task-pages", nil)
	e.mustStatus(resp, 200, out)
	if pages := out["pages"].([]any); len(pages) != 1 || pages[0].(map[string]any)["wrappedKey"] != "wrapped-share-key" {
		t.Fatalf("list = %v", out)
	}
	// Ticks need no content: they work on an encrypted page.
	resp, out = guest.do("POST", "/api/v1/pages/"+secret+"/tick", map[string]any{"taskId": task, "completed": true})
	guest.mustStatus(resp, 200, out)
	// A live page takes no snapshot.
	live := ids.New()
	resp, out = se.bob.do("POST", "/api/v1/tasks", map[string]any{"id": live, "title": "Bob's"})
	se.bob.mustStatus(resp, 201, out)
	bobTask := out["id"].(string)
	publishPage(t, se.bob, bobTask, map[string]any{"rights": "view"})
	if resp, out := se.bob.do("PUT", "/api/v1/tasks/"+bobTask+"/page/snapshot", map[string]any{"ciphertext": ct("x"), "version": 1, "wrappedKey": "k"}); resp.StatusCode != 409 || errCode(out) != "page_not_encrypted" {
		t.Fatalf("live snapshot = %d %v", resp.StatusCode, out)
	}
}

// TestTaskPageModeSwitch: a page follows its task between an encrypted personal
// scope and a readable one (lifecycle requirement, task 4.4).
func TestTaskPageModeSwitch(t *testing.T) {
	// Entering an encrypted scope: the owner turns encryption on; the live page is
	// unavailable until a device uploads a snapshot with the wrapped key.
	se := newShareEnv(t)
	task := personalTask(t, se.alice, map[string]any{"title": "Water the plants"})
	secret, _ := publishPage(t, se.alice, task, map[string]any{"rights": "reply"})
	guest := newClientAt(se.alice, "10.7.5.1")
	resp, out := guest.do("GET", "/api/v1/pages/"+secret, nil)
	guest.mustStatus(resp, 200, out)
	resp, out = se.alice.do("PUT", "/api/v1/encryption/keys", keyRecord(1, 4))
	se.alice.mustStatus(resp, 201, out)
	if resp, out := guest.do("GET", "/api/v1/pages/"+secret, nil); resp.StatusCode != 404 || errCode(out) != "page_invalid" {
		t.Fatalf("encrypted without snapshot = %d %v", resp.StatusCode, out)
	}
	p := "/api/v1/tasks/" + task + "/page/snapshot"
	if resp, out := se.alice.do("PUT", p, map[string]any{"ciphertext": ct("first"), "version": 1}); resp.StatusCode != 400 {
		t.Fatalf("first snapshot without a key = %d %v", resp.StatusCode, out)
	}
	resp, out = se.alice.do("PUT", p, map[string]any{"ciphertext": ct("first"), "version": 1, "wrappedKey": "wrapped"})
	se.alice.mustStatus(resp, 200, out)
	resp, out = guest.do("GET", "/api/v1/pages/"+secret, nil)
	guest.mustStatus(resp, 200, out)
	if out["mode"] != "encrypted" || out["snapshot"] != ct("first") {
		t.Fatalf("after the snapshot = %v", out)
	}

	// Leaving it: encryption is turned off (the key record goes; an encrypted
	// account cannot share a project), so the server reads the task again; the
	// page is served live and the snapshot and key are dropped.
	if _, err := se.alice.db.Exec(`DELETE FROM encryption_keys`); err != nil {
		t.Fatal(err)
	}
	resp, out = se.alice.do("PATCH", "/api/v1/tasks/"+task, map[string]any{"title": "Water the plants on the balcony"})
	se.alice.mustStatus(resp, 200, out)
	resp, out = guest.do("GET", "/api/v1/pages/"+secret, nil)
	guest.mustStatus(resp, 200, out)
	if out["mode"] != "live" || out["title"] != "Water the plants on the balcony" {
		t.Fatalf("after leaving = %v", out)
	}
	var snapshot, wrapped any
	se.alice.db.QueryRow(`SELECT snapshot, wrapped_key FROM task_pages WHERE revoked_at IS NULL`).Scan(&snapshot, &wrapped)
	if snapshot != nil || wrapped != nil {
		t.Fatalf("snapshot kept: %v %v", snapshot, wrapped)
	}
}

// TestTaskPageConcurrentEdit: a guest completes the task while its owner, offline,
// changes the due date; both changes survive (last writer wins per field).
func TestTaskPageConcurrentEdit(t *testing.T) {
	se := newShareEnv(t)
	task := personalTask(t, se.alice, map[string]any{"title": "Fix the gate", "due": map[string]any{"date": "2026-10-20"}})
	secret, _ := publishPage(t, se.alice, task, map[string]any{"rights": "tick"})
	// The owner's offline edit: after the task was created, before the guest's tick,
	// and it reaches the server only after the tick.
	time.Sleep(20 * time.Millisecond)
	offlineTS := time.Now().UnixMilli()
	time.Sleep(20 * time.Millisecond)
	guest := newClientAt(se.alice, "10.7.6.1")
	resp, out := guest.do("POST", "/api/v1/pages/"+secret+"/tick", map[string]any{"taskId": task, "completed": true, "name": "Marco"})
	guest.mustStatus(resp, 200, out)
	syncOnce(se.alice, "laptop", 0, []map[string]any{{"id": ids.New(), "entity": "task", "entityId": task, "field": "due", "value": map[string]any{"date": "2026-10-28"}, "ts": offlineTS, "device": "laptop"}})
	resp, out = se.alice.do("GET", "/api/v1/tasks/"+task, nil)
	se.alice.mustStatus(resp, 200, out)
	if out["completed_at"] == nil || out["due"].(map[string]any)["date"] != "2026-10-28" {
		t.Fatalf("converged = %v", out)
	}
}

func TestTaskPageShellAndLog(t *testing.T) {
	if got := redactPath("/t/abcdefghijklmnopqrstuv/paint-the-fence"); got != "/t/[redacted]" {
		t.Fatalf("redact page = %q", got)
	}
	if got := redactPath("/api/v1/pages/abcdefghijklmnopqrstuv/replies"); got != "/api/v1/pages/[redacted]/replies" {
		t.Fatalf("redact api = %q", got)
	}
}
