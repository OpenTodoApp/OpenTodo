package httpapi

import (
	"net/http"
	"strings"
	"testing"
	"time"
)

func publicLink(t *testing.T, by *env, projectID string, body map[string]any) (string, map[string]any) {
	t.Helper()
	resp, out := by.do("POST", "/api/v1/projects/"+projectID+"/public-links", body)
	by.mustStatus(resp, 201, out)
	link := out["link"].(string)
	i := strings.LastIndex(link, "/public/")
	if i < 0 {
		t.Fatalf("link = %q", link)
	}
	return link[i+len("/public/"):], out
}

func TestPublicLinkManagement(t *testing.T) {
	se := newShareEnv(t)
	p := "/api/v1/projects/" + se.project
	anon := newClientAt(se.alice, "10.9.0.1")
	for _, rt := range [][2]string{{"GET", p + "/public-links"}, {"POST", p + "/public-links"}, {"DELETE", p + "/public-links/x"}} {
		if resp, _ := anon.do(rt[0], rt[1], map[string]any{"rights": "view"}); resp.StatusCode != 401 {
			t.Fatalf("anonymous %s = %d", rt[1], resp.StatusCode)
		}
	}
	if resp, out := se.bob.do("POST", p+"/public-links", map[string]any{"rights": "view"}); resp.StatusCode != 404 || errCode(out) != "not_found" {
		t.Fatalf("non-member = %d %v", resp.StatusCode, out)
	}
	for _, body := range []map[string]any{{"rights": "edit"}, {"rights": "view", "name": strings.Repeat("x", 61)}, {"rights": "view", "expiresInDays": 0}, {"rights": "view", "expiresInDays": 91}} {
		if resp, out := se.alice.do("POST", p+"/public-links", body); resp.StatusCode != 400 || errCode(out) != "invalid_input" {
			t.Fatalf("%v = %d %v", body, resp.StatusCode, out)
		}
	}
	secret, created := publicLink(t, se.alice, se.project, map[string]any{"rights": "tick", "name": "Grandma"})
	if !strings.HasPrefix(secret, "otl_") || created["rights"] != "tick" || created["name"] != "Grandma" || created["expiresAt"] != nil || created["id"] == nil {
		t.Fatalf("created = %v", created)
	}
	// An admin may create; an editor and a viewer may not.
	se.share(se.alice, "bob@example.com", "admin")
	se.share(se.alice, "carol@example.com", "editor")
	_, byBob := publicLink(t, se.bob, se.project, map[string]any{"rights": "view", "expiresInDays": 7})
	if byBob["createdBy"] != se.ids["bob"] || byBob["expiresAt"] == nil {
		t.Fatalf("admin link = %v", byBob)
	}
	if resp, out := se.carol.do("POST", p+"/public-links", map[string]any{"rights": "view"}); resp.StatusCode != 403 || errCode(out) != "forbidden" {
		t.Fatalf("editor = %d %v", resp.StatusCode, out)
	}
	resp, out := se.alice.do("GET", p+"/public-links", nil)
	se.alice.mustStatus(resp, 200, out)
	links := out["links"].([]any)
	if len(links) != 2 {
		t.Fatalf("links = %v", links)
	}
	for _, l := range links {
		m := l.(map[string]any)
		if _, leaked := m["link"]; leaked || m["createdByName"] == "" {
			t.Fatalf("list row = %v", m)
		}
	}
	// Revoke: 204, then the public route answers link_invalid.
	if resp, out := se.carol.do("DELETE", p+"/public-links/"+created["id"].(string), nil); resp.StatusCode != 403 {
		t.Fatalf("editor revoke = %d %v", resp.StatusCode, out)
	}
	if resp, _ := se.alice.do("DELETE", p+"/public-links/unknown", nil); resp.StatusCode != 404 {
		t.Fatalf("unknown revoke = %d", resp.StatusCode)
	}
	resp, out = se.alice.do("DELETE", p+"/public-links/"+created["id"].(string), nil)
	se.alice.mustStatus(resp, 204, out)
	if resp, out := anon.do("GET", "/api/v1/public/"+secret, nil); resp.StatusCode != 404 || errCode(out) != "link_invalid" {
		t.Fatalf("revoked = %d %v", resp.StatusCode, out)
	}
	var n int
	se.alice.db.QueryRow(`SELECT COUNT(*) FROM audit_events WHERE name IN ('public_link.created','public_link.revoked')`).Scan(&n)
	if n != 3 {
		t.Fatalf("audit = %d", n)
	}
}

func TestPublicListRead(t *testing.T) {
	se := newShareEnv(t)
	resp, out := se.alice.do("POST", "/api/v1/tasks", map[string]any{"title": "Bread https://example.com", "project_id": se.project, "description": "secret notes", "priority": 2})
	se.alice.mustStatus(resp, 201, out)
	bread := out["id"].(string)
	resp, out = se.alice.do("POST", "/api/v1/tasks", map[string]any{"title": "Done long ago", "project_id": se.project, "completed_at": time.Now().Add(-48 * time.Hour).UnixMilli()})
	se.alice.mustStatus(resp, 201, out)
	resp, out = se.alice.do("POST", "/api/v1/tasks", map[string]any{"title": "Just done", "project_id": se.project, "completed_at": time.Now().Add(-2 * time.Hour).UnixMilli()})
	se.alice.mustStatus(resp, 201, out)
	resp, out = se.alice.do("POST", "/api/v1/tasks", map[string]any{"title": "Elsewhere"})
	se.alice.mustStatus(resp, 201, out)
	secret, _ := publicLink(t, se.alice, se.project, map[string]any{"rights": "view"})

	anon := newClientAt(se.alice, "10.9.0.2")
	req, _ := http.NewRequest("GET", se.alice.srv.URL+"/api/v1/public/"+secret, nil)
	raw, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	raw.Body.Close()
	if raw.Header.Get("Set-Cookie") != "" || raw.Header.Get("X-Robots-Tag") != "noindex, nofollow" || raw.Header.Get("Referrer-Policy") != "no-referrer" || raw.Header.Get("Cache-Control") != "no-store" {
		t.Fatalf("headers = %v", raw.Header)
	}
	resp, out = anon.do("GET", "/api/v1/public/"+secret, nil)
	anon.mustStatus(resp, 200, out)
	if out["projectName"] != "Home" || out["rights"] != "view" || out["serverTime"] == nil {
		t.Fatalf("list = %v", out)
	}
	var titles []string
	for _, x := range out["tasks"].([]any) {
		task := x.(map[string]any)
		titles = append(titles, task["title"].(string))
		for _, hidden := range []string{"description", "notes_doc", "labels", "assignee_id"} {
			if _, ok := task[hidden]; ok {
				t.Fatalf("task carries %s: %v", hidden, task)
			}
		}
		if task["id"] == bread && task["priority"] != float64(2) {
			t.Fatalf("bread = %v", task)
		}
	}
	if got := strings.Join(titles, ","); !strings.Contains(got, "Milk") || !strings.Contains(got, "Bread") || !strings.Contains(got, "Just done") || strings.Contains(got, "long ago") || strings.Contains(got, "Elsewhere") {
		t.Fatalf("titles = %s", got)
	}
	// A signed-in member of another project gets the same answer.
	resp, other := se.carol.do("GET", "/api/v1/public/"+secret, nil)
	se.carol.mustStatus(resp, 200, other)
	if len(other["tasks"].([]any)) != len(out["tasks"].([]any)) {
		t.Fatal("a session changes the answer")
	}
	// The page itself carries the same headers.
	page, err := http.Get(se.alice.srv.URL + "/public/" + secret)
	if err == nil {
		page.Body.Close()
	}
	// Archived: invalid, unarchived: valid again.
	resp, out = se.alice.do("PATCH", "/api/v1/projects/"+se.project, map[string]any{"archived": true})
	se.alice.mustStatus(resp, 200, out)
	if resp, out := anon.do("GET", "/api/v1/public/"+secret, nil); resp.StatusCode != 404 || errCode(out) != "link_invalid" {
		t.Fatalf("archived = %d %v", resp.StatusCode, out)
	}
	resp, out = se.alice.do("PATCH", "/api/v1/projects/"+se.project, map[string]any{"archived": false})
	se.alice.mustStatus(resp, 200, out)
	if resp, _ := anon.do("GET", "/api/v1/public/"+secret, nil); resp.StatusCode != 200 {
		t.Fatalf("unarchived = %d", resp.StatusCode)
	}
	// Unknown secrets have their own window: the 11th is limited, sign-in from
	// the same address is not (trusted-client-identity).
	guesser := newClientAt(se.alice, "10.9.0.3")
	var last int
	for i := 0; i < 11; i++ {
		resp, _ := guesser.do("GET", "/api/v1/public/otl_guess"+strings.Repeat("x", i), nil)
		last = resp.StatusCode
	}
	if last != 429 {
		t.Fatalf("11th guess = %d", last)
	}
	if resp, _ := guesser.do("POST", "/api/v1/auth/login", map[string]string{"email": "alice@example.com", "password": "x"}); resp.StatusCode != 401 {
		t.Fatalf("sign-in after guessing = %d", resp.StatusCode)
	}
}

func TestPublicTick(t *testing.T) {
	se := newShareEnv(t)
	se.share(se.alice, "bob@example.com", "admin")
	tick, _ := publicLink(t, se.bob, se.project, map[string]any{"rights": "tick", "name": "Fridge"})
	view, _ := publicLink(t, se.alice, se.project, map[string]any{"rights": "view"})
	anon := newClientAt(se.alice, "10.9.1.1")
	if resp, out := anon.do("POST", "/api/v1/public/"+view+"/tick", map[string]any{"taskId": se.task, "completed": true}); resp.StatusCode != 403 || errCode(out) != "forbidden" {
		t.Fatalf("view tick = %d %v", resp.StatusCode, out)
	}
	if resp, out := anon.do("POST", "/api/v1/public/"+tick+"/tick", map[string]any{"taskId": se.task}); resp.StatusCode != 400 || errCode(out) != "invalid_input" {
		t.Fatalf("missing completed = %d %v", resp.StatusCode, out)
	}
	resp, out := se.alice.do("POST", "/api/v1/tasks", map[string]any{"title": "Personal"})
	se.alice.mustStatus(resp, 201, out)
	if resp, out := anon.do("POST", "/api/v1/public/"+tick+"/tick", map[string]any{"taskId": out["id"], "completed": true}); resp.StatusCode != 404 || errCode(out) != "not_found" {
		t.Fatalf("other task = %d %v", resp.StatusCode, out)
	}
	resp, out = anon.do("POST", "/api/v1/public/"+tick+"/tick", map[string]any{"taskId": se.task, "completed": true})
	anon.mustStatus(resp, 200, out)
	if out["completed_at"] == nil {
		t.Fatalf("tick = %v", out)
	}
	var device, actor string
	se.alice.db.QueryRow(`SELECT device, user_id FROM ops WHERE entity = 'task' AND entity_id = ? AND field = 'completed_at' ORDER BY seq DESC LIMIT 1`, se.task).Scan(&device, &actor)
	if !strings.HasPrefix(device, "public:") || actor != se.ids["bob"] {
		t.Fatalf("op device %q actor %q", device, actor)
	}
	resp, out = anon.do("POST", "/api/v1/public/"+tick+"/tick", map[string]any{"taskId": se.task, "completed": false})
	anon.mustStatus(resp, 200, out)
	if out["completed_at"] != nil {
		t.Fatalf("reopen = %v", out)
	}
	// A repeating task rolls forward.
	resp, out = se.alice.do("POST", "/api/v1/tasks", map[string]any{"title": "Water plants", "project_id": se.project, "due": map[string]string{"date": "2026-10-12"}, "recurrence": "every week"})
	se.alice.mustStatus(resp, 201, out)
	plants := out["id"].(string)
	resp, out = anon.do("POST", "/api/v1/public/"+tick+"/tick", map[string]any{"taskId": plants, "completed": true})
	anon.mustStatus(resp, 200, out)
	resp, out = se.alice.do("GET", "/api/v1/tasks/"+plants, nil)
	if out["completed_at"] != nil || out["due"].(map[string]any)["date"] == "2026-10-12" {
		t.Fatalf("recurring after tick = %v", out)
	}
	// Bob demoted to editor: his link stops working.
	resp, out = se.alice.do("PATCH", "/api/v1/projects/"+se.project+"/members/"+se.ids["bob"], map[string]any{"role": "editor"})
	se.alice.mustStatus(resp, 200, out)
	if resp, out := anon.do("POST", "/api/v1/public/"+tick+"/tick", map[string]any{"taskId": se.task, "completed": true}); resp.StatusCode != 404 || errCode(out) != "link_invalid" {
		t.Fatalf("after demotion = %d %v", resp.StatusCode, out)
	}
	// Devices cannot forge guest ops.
	resp, out = se.alice.do("POST", "/api/v1/sync", map[string]any{"device": "public:abc", "cursor": 0, "ops": []any{}})
	if resp.StatusCode != 400 || errCode(out) != "invalid_op" {
		t.Fatalf("forged device = %d %v", resp.StatusCode, out)
	}
}

func TestPublicLinkEncryptedCreator(t *testing.T) {
	se := newShareEnv(t)
	resp, out := se.alice.do("PUT", "/api/v1/encryption/keys", keyRecord(1, 7))
	se.alice.mustStatus(resp, 201, out)
	if resp, out := se.alice.do("POST", "/api/v1/projects/"+se.project+"/public-links", map[string]any{"rights": "view"}); resp.StatusCode != 409 || errCode(out) != "encryption_enabled" {
		t.Fatalf("encrypted = %d %v", resp.StatusCode, out)
	}
}

func TestPublicLinkLimits(t *testing.T) {
	se := newShareEnv(t)
	for i := 0; i < 20; i++ {
		publicLink(t, se.alice, se.project, map[string]any{"rights": "view"})
	}
	if resp, out := se.alice.do("POST", "/api/v1/projects/"+se.project+"/public-links", map[string]any{"rights": "view"}); resp.StatusCode != 429 || errCode(out) != "rate_limited" {
		t.Fatalf("21st = %d %v", resp.StatusCode, out)
	}
	se2 := newShareEnv(t)
	tick, _ := publicLink(t, se2.alice, se2.project, map[string]any{"rights": "tick"})
	var last int
	for i := 0; i < 61; i++ {
		c := newClientAt(se2.alice, "10.8."+string(rune('0'+i/10))+"."+string(rune('0'+i%10)))
		resp, _ := c.do("POST", "/api/v1/public/"+tick+"/tick", map[string]any{"taskId": se2.task, "completed": i%2 == 0})
		last = resp.StatusCode
	}
	if last != 429 {
		t.Fatalf("61st tick = %d", last)
	}
}

func TestPublicTickAttribution(t *testing.T) {
	se := newShareEnv(t)
	se.share(se.alice, "bob@example.com", "editor")
	tick, _ := publicLink(t, se.alice, se.project, map[string]any{"rights": "tick", "name": "Grandma"})
	anon := newClientAt(se.alice, "10.9.2.1")
	resp, out := anon.do("POST", "/api/v1/public/"+tick+"/tick", map[string]any{"taskId": se.task, "completed": true})
	anon.mustStatus(resp, 200, out)
	label := func(c *env) string {
		resp, out := c.do("GET", "/api/v1/tasks/"+se.task+"/history", nil)
		c.mustStatus(resp, 200, out)
		for _, cs := range out["changeSets"].([]any) {
			m := cs.(map[string]any)
			if d, _ := m["device"].(string); strings.HasPrefix(d, "public:") {
				l, _ := m["device_label"].(string)
				return l
			}
		}
		return ""
	}
	if got := label(se.alice); got != "Public link (Grandma)" {
		t.Fatalf("owner sees %q", got)
	}
	if got := label(se.bob); got != "Public link" {
		t.Fatalf("editor sees %q", got)
	}
	resp, out = se.bob.do("GET", "/api/v1/tasks/"+se.task+"/activity", nil)
	se.bob.mustStatus(resp, 200, out)
	found := false
	for _, ev := range out["events"].([]any) {
		m := ev.(map[string]any)
		if m["kind"] == "completed" {
			found = true
			if m["actorName"] != "Public link" || m["device"] == nil {
				t.Fatalf("activity = %v", m)
			}
		}
	}
	if !found {
		t.Fatalf("no completed event: %v", out)
	}
}
