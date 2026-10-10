package httpapi

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	opsync "github.com/pixari/opentodo/internal/sync"
)

// shareEnv: alice (server owner) owns project "Home" with a task; bob and carol
// have accounts. Each person has their own signed-in client.
type shareEnv struct {
	alice, bob, carol *env
	project, task     string
	ids               map[string]string // name -> user id
}

func newShareEnv(t *testing.T) *shareEnv {
	t.Helper()
	alice := newEnv(t, true)
	se := &shareEnv{alice: alice, ids: map[string]string{}}
	register := func(c *env, name string) {
		resp, out := c.do("POST", "/api/v1/auth/register", map[string]string{"email": name + "@example.com", "name": name, "password": "correct horse battery"})
		c.mustStatus(resp, 201, out)
		se.ids[name] = out["user"].(map[string]any)["id"].(string)
	}
	register(alice, "alice")
	se.bob = newClientAt(alice, "10.0.0.2")
	se.bob.sync, se.bob.hooks = alice.sync, alice.hooks
	register(se.bob, "bob")
	se.carol = newClientAt(alice, "10.0.0.3")
	register(se.carol, "carol")
	resp, out := alice.do("POST", "/api/v1/projects", map[string]any{"name": "Home"})
	alice.mustStatus(resp, 201, out)
	se.project = out["id"].(string)
	resp, out = alice.do("POST", "/api/v1/tasks", map[string]any{"title": "Milk", "project_id": se.project})
	alice.mustStatus(resp, 201, out)
	se.task = out["id"].(string)
	return se
}

func (se *shareEnv) share(by *env, email, role string) map[string]any {
	by.t.Helper()
	resp, out := by.do("POST", "/api/v1/projects/"+se.project+"/members", map[string]any{"email": email, "role": role})
	by.mustStatus(resp, 201, out)
	return out
}

func syncOnce(c *env, device string, cursor float64, ops []map[string]any) map[string]any {
	c.t.Helper()
	if ops == nil {
		ops = []map[string]any{}
	}
	resp, out := c.do("POST", "/api/v1/sync", map[string]any{"device": device, "cursor": cursor, "ops": ops})
	c.mustStatus(resp, 200, out)
	return out
}

// syncAll drains the exchange like a device and returns every op received.
func syncAll(c *env, device string, cursor float64) ([]any, float64, map[string]any) {
	c.t.Helper()
	var all []any
	var last map[string]any
	for i := 0; i < 50; i++ {
		last = syncOnce(c, device, cursor, nil)
		all = append(all, last["ops"].([]any)...)
		cursor = last["cursor"].(float64)
		if last["hasMore"] != true {
			return all, cursor, last
		}
	}
	c.t.Fatal("sync never finished")
	return nil, 0, nil
}

func syncOp(id, entity, entityID, field string, value any) map[string]any {
	return map[string]any{"id": id, "entity": entity, "entityId": entityID, "field": field, "value": value, "ts": time.Now().UnixMilli(), "device": "dev"}
}

func TestMembershipRoutesAuthAndErrors(t *testing.T) {
	se := newShareEnv(t)
	p := "/api/v1/projects/" + se.project
	anon := newClientFor(se.alice)
	for _, rt := range [][2]string{
		{"GET", p + "/members"}, {"POST", p + "/members"}, {"PATCH", p + "/members/x"}, {"DELETE", p + "/members/x"}, {"POST", p + "/transfer"},
	} {
		resp, out := anon.do(rt[0], rt[1], map[string]any{"email": "bob@example.com", "role": "viewer", "userId": "x"})
		anon.mustStatus(resp, 401, out)
		if errCode(out) != "unauthorized" {
			t.Fatalf("%s %s: %v", rt[0], rt[1], out)
		}
	}
	// Non-members get the same 404 as for a project that does not exist, also when probing emails.
	for _, rt := range [][2]string{{"GET", p + "/members"}, {"POST", p + "/members"}, {"PATCH", p + "/members/" + se.ids["alice"]}, {"DELETE", p + "/members/me"}, {"POST", p + "/transfer"}} {
		resp, out := se.bob.do(rt[0], rt[1], map[string]any{"email": "nobody@example.com", "role": "viewer", "userId": se.ids["bob"]})
		se.bob.mustStatus(resp, 404, out)
		if errCode(out) != "not_found" {
			t.Fatalf("non-member %s %s: %v", rt[0], rt[1], out)
		}
	}
	resp, out := se.bob.do("GET", "/api/v1/projects/does-not-exist/members", nil)
	se.bob.mustStatus(resp, 404, out)
	// The owner of an unshared project sees only themselves.
	resp, out = se.alice.do("GET", p+"/members", nil)
	se.alice.mustStatus(resp, 200, out)
	if ms := out["members"].([]any); len(ms) != 1 || out["role"] != "owner" {
		t.Fatalf("unshared members = %v", out)
	}
	// Unknown email: 404 user_not_found, nothing about other accounts in the answer.
	resp, out = se.alice.do("POST", p+"/members", map[string]any{"email": "nobody@example.com", "role": "editor"})
	se.alice.mustStatus(resp, 404, out)
	if errCode(out) != "user_not_found" || strings.Contains(fmt.Sprint(out), "bob@") {
		t.Fatalf("unknown email = %v", out)
	}
	resp, out = se.alice.do("POST", p+"/members", map[string]any{"email": "bob@example.com", "role": "owner"})
	se.alice.mustStatus(resp, 400, out)
	if errCode(out) != "invalid_input" {
		t.Fatalf("bad role = %v", out)
	}
	// Share with bob as editor: 201 with the member list.
	out = se.share(se.alice, "BOB@example.com", "editor")
	if out["ownerId"] != se.ids["alice"] || len(out["members"].([]any)) != 2 {
		t.Fatalf("after share = %v", out)
	}
	resp, out = se.alice.do("POST", p+"/members", map[string]any{"email": "bob@example.com", "role": "viewer"})
	se.alice.mustStatus(resp, 409, out)
	if errCode(out) != "already_member" {
		t.Fatalf("duplicate = %v", out)
	}
	// An editor cannot manage members.
	resp, out = se.bob.do("POST", p+"/members", map[string]any{"email": "carol@example.com", "role": "viewer"})
	se.bob.mustStatus(resp, 403, out)
	if errCode(out) != "forbidden" {
		t.Fatalf("editor adds = %v", out)
	}
	// Admin: manages viewers and editors, not the owner.
	resp, out = se.alice.do("PATCH", p+"/members/"+se.ids["bob"], map[string]any{"role": "admin"})
	se.alice.mustStatus(resp, 200, out)
	se.share(se.bob, "carol@example.com", "viewer")
	resp, out = se.bob.do("PATCH", p+"/members/"+se.ids["carol"], map[string]any{"role": "editor"})
	se.bob.mustStatus(resp, 200, out)
	resp, out = se.bob.do("PATCH", p+"/members/"+se.ids["alice"], map[string]any{"role": "viewer"})
	se.bob.mustStatus(resp, 403, out)
	if errCode(out) != "forbidden" {
		t.Fatalf("admin changes owner = %v", out)
	}
	resp, out = se.bob.do("PATCH", p+"/members/nobody", map[string]any{"role": "viewer"})
	se.bob.mustStatus(resp, 404, out)
	// The owner cannot leave.
	resp, out = se.alice.do("DELETE", p+"/members/me", nil)
	se.alice.mustStatus(resp, 409, out)
	if errCode(out) != "owner_must_transfer" {
		t.Fatalf("owner leaves = %v", out)
	}
	// Carol leaves; then the admin removes nobody else but can remove an editor.
	resp, out = se.carol.do("DELETE", p+"/members/me", nil)
	se.carol.mustStatus(resp, 204, out)
	resp, out = se.carol.do("GET", p+"/members", nil)
	se.carol.mustStatus(resp, 404, out)
	// Membership changes are recorded with the audit constructors.
	var n int
	_ = se.alice.db.QueryRow(`SELECT COUNT(*) FROM audit_events WHERE name = 'role.changed' AND details LIKE '%project.%'`).Scan(&n)
	if n < 4 {
		t.Fatalf("role.changed events = %d", n)
	}
}

func TestOwnerTransferDemotesPreviousOwner(t *testing.T) {
	se := newShareEnv(t)
	p := "/api/v1/projects/" + se.project
	se.share(se.alice, "bob@example.com", "editor")
	resp, out := se.alice.do("POST", p+"/transfer", map[string]any{"userId": se.ids["carol"]})
	se.alice.mustStatus(resp, 400, out)
	if errCode(out) != "invalid_input" {
		t.Fatalf("transfer to non-member = %v", out)
	}
	resp, out = se.bob.do("POST", p+"/transfer", map[string]any{"userId": se.ids["bob"]})
	se.bob.mustStatus(resp, 403, out)
	resp, out = se.alice.do("POST", p+"/transfer", map[string]any{"userId": se.ids["bob"]})
	se.alice.mustStatus(resp, 200, out)
	if out["ownerId"] != se.ids["bob"] || out["role"] != "admin" {
		t.Fatalf("after transfer = %v", out)
	}
	// Both learn the new roles on their next sync.
	a := syncOnce(se.alice, "A", 0, nil)["memberships"].([]any)[0].(map[string]any)
	b := syncOnce(se.bob, "B", 0, nil)["memberships"].([]any)[0].(map[string]any)
	if a["role"] != "admin" || b["role"] != "owner" || a["ownerId"] != se.ids["bob"] {
		t.Fatalf("memberships alice=%v bob=%v", a, b)
	}
	// The new owner may delete; the previous owner may not.
	resp, out = se.alice.do("DELETE", p, nil)
	se.alice.mustStatus(resp, 403, out)
	resp, out = se.bob.do("DELETE", p, nil)
	se.bob.mustStatus(resp, 204, out)
}

func TestRestReadsUnionScopes(t *testing.T) {
	se := newShareEnv(t)
	resp, out := se.bob.do("POST", "/api/v1/tasks", map[string]any{"title": "Bob's own"})
	se.bob.mustStatus(resp, 201, out)
	resp, out = se.alice.do("POST", "/api/v1/tasks", map[string]any{"title": "Alice's private"})
	se.alice.mustStatus(resp, 201, out)
	// Before sharing bob cannot see alice's project at all.
	resp, out = se.bob.do("GET", "/api/v1/tasks/"+se.task, nil)
	se.bob.mustStatus(resp, 404, out)
	se.share(se.alice, "bob@example.com", "editor")
	resp, out = se.bob.do("GET", "/api/v1/tasks", nil)
	se.bob.mustStatus(resp, 200, out)
	titles := []string{}
	for _, x := range out["tasks"].([]any) {
		titles = append(titles, x.(map[string]any)["title"].(string))
	}
	if strings.Join(titles, ",") != "Milk,Bob's own" && strings.Join(titles, ",") != "Bob's own,Milk" {
		t.Fatalf("bob's tasks = %v", titles)
	}
	resp, out = se.bob.do("GET", "/api/v1/projects/"+se.project, nil)
	se.bob.mustStatus(resp, 200, out)
	if out["role"] != "editor" || out["owner_id"] != se.ids["alice"] {
		t.Fatalf("shared project annotations = %v", out)
	}
	// Editor writes tasks through REST; alice sees the result.
	resp, out = se.bob.do("PATCH", "/api/v1/tasks/"+se.task, map[string]any{"priority": 1})
	se.bob.mustStatus(resp, 200, out)
	resp, out = se.bob.do("POST", "/api/v1/tasks", map[string]any{"title": "Eggs", "project_id": se.project})
	se.bob.mustStatus(resp, 201, out)
	resp, out = se.alice.do("GET", "/api/v1/tasks/"+se.task, nil)
	se.alice.mustStatus(resp, 200, out)
	if out["priority"] != float64(1) {
		t.Fatalf("alice sees priority %v", out["priority"])
	}
	// A PATCH that echoes the read-only annotations back is accepted (they are dropped).
	resp, out = se.alice.do("PATCH", "/api/v1/projects/"+se.project, map[string]any{"name": "House", "role": "owner", "owner_id": "x"})
	se.alice.mustStatus(resp, 200, out)
	// Editor may not rename; moving a task across scopes is a 400 scope_change.
	resp, out = se.bob.do("PATCH", "/api/v1/projects/"+se.project, map[string]any{"name": "Mine"})
	se.bob.mustStatus(resp, 403, out)
	resp, out = se.bob.do("PATCH", "/api/v1/tasks/"+se.task, map[string]any{"project_id": nil})
	se.bob.mustStatus(resp, 400, out)
	if errCode(out) != "scope_change" {
		t.Fatalf("cross-scope patch = %v", out)
	}
}

func TestRestPatchByViewerIsForbidden(t *testing.T) {
	se := newShareEnv(t)
	se.share(se.alice, "carol@example.com", "viewer")
	resp, out := se.carol.do("GET", "/api/v1/tasks/"+se.task, nil)
	se.carol.mustStatus(resp, 200, out)
	for _, rt := range []struct {
		method, path string
		body         any
	}{
		{"PATCH", "/api/v1/tasks/" + se.task, map[string]any{"title": "x"}},
		{"DELETE", "/api/v1/tasks/" + se.task, nil},
		{"POST", "/api/v1/tasks", map[string]any{"title": "x", "project_id": se.project}},
		{"PATCH", "/api/v1/projects/" + se.project, map[string]any{"name": "x"}},
	} {
		resp, out := se.carol.do(rt.method, rt.path, rt.body)
		se.carol.mustStatus(resp, 403, out)
		if errCode(out) != "forbidden" {
			t.Fatalf("%s %s: %v", rt.method, rt.path, out)
		}
	}
	resp, out = se.alice.do("GET", "/api/v1/tasks/"+se.task, nil)
	se.alice.mustStatus(resp, 200, out)
	if out["title"] != "Milk" || out["deleted_at"] != nil {
		t.Fatalf("viewer changed the task: %v", out)
	}
}

func TestExportIncludesSharedProjects(t *testing.T) {
	se := newShareEnv(t)
	resp, out := se.bob.do("POST", "/api/v1/projects", map[string]any{"name": "Bob's"})
	se.bob.mustStatus(resp, 201, out)
	se.share(se.alice, "bob@example.com", "viewer")
	resp, out = se.bob.do("GET", "/api/v1/export", nil)
	se.bob.mustStatus(resp, 200, out)
	projects := out["projects"].([]any)
	if len(projects) != 2 {
		t.Fatalf("export projects = %v", projects)
	}
	found := false
	for _, x := range projects {
		p := x.(map[string]any)
		if p["id"] == se.project {
			found = true
			if p["role"] != "viewer" || p["owner_id"] != se.ids["alice"] {
				t.Fatalf("shared project in export = %v", p)
			}
		} else if _, has := p["role"]; has {
			t.Fatalf("personal project annotated: %v", p)
		}
	}
	if !found || len(out["tasks"].([]any)) != 1 {
		t.Fatalf("export = %v", out)
	}
}

func TestSyncReportsRejectionsAndMemberships(t *testing.T) {
	se := newShareEnv(t)
	// Old-style exchange before sharing: memberships empty, rejected empty.
	out := syncOnce(se.bob, "B", 0, nil)
	if len(out["memberships"].([]any)) != 0 || len(out["rejected"].([]any)) != 0 {
		t.Fatalf("unshared exchange = %v", out)
	}
	_, cursor, _ := syncAll(se.bob, "B", 0)
	se.share(se.alice, "bob@example.com", "viewer")
	// Catch-up: the project's history arrives behind bob's cursor.
	ops, next, last := syncAll(se.bob, "B", cursor)
	if len(ops) < 3 || next < cursor {
		t.Fatalf("catch-up = %d ops, cursor %v -> %v", len(ops), cursor, next)
	}
	ms := last["memberships"].([]any)
	if len(ms) != 1 || ms[0].(map[string]any)["role"] != "viewer" || len(ms[0].(map[string]any)["members"].([]any)) != 2 {
		t.Fatalf("memberships = %v", ms)
	}
	// A refused op is reported in a 200 response with the server's value attached.
	out = syncOnce(se.bob, "B", next, []map[string]any{
		syncOp("r1", "task", se.task, "title", "Hacked"),
		syncOp("ok1", "task", "own-task", "title", "Mine"),
	})
	rej := out["rejected"].([]any)
	if len(rej) != 1 || rej[0].(map[string]any)["id"] != "r1" || rej[0].(map[string]any)["reason"] != "forbidden" || out["applied"] != float64(1) {
		t.Fatalf("exchange = %v", out)
	}
	restored := false
	for _, x := range out["ops"].([]any) {
		o := x.(map[string]any)
		if o["entityId"] == se.task && o["field"] == "title" && o["value"] == "Milk" {
			restored = true
		}
	}
	if !restored {
		t.Fatalf("server value not returned: %v", out["ops"])
	}
	// Removal: bob's devices stop receiving and his queued edits are refused.
	resp, o := se.alice.do("DELETE", "/api/v1/projects/"+se.project+"/members/"+se.ids["bob"], nil)
	se.alice.mustStatus(resp, 204, o)
	resp, o = se.alice.do("PATCH", "/api/v1/tasks/"+se.task, map[string]any{"title": "After"})
	se.alice.mustStatus(resp, 200, o)
	out = syncOnce(se.bob, "B", out["cursor"].(float64), []map[string]any{syncOp("q1", "task", se.task, "title", "Queued")})
	if len(out["ops"].([]any)) != 0 || len(out["rejected"].([]any)) != 1 || len(out["memberships"].([]any)) != 0 {
		t.Fatalf("after removal = %v", out)
	}
}

func TestMembershipChangeWakesMemberDevices(t *testing.T) {
	se := newShareEnv(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", se.bob.srv.URL+"/api/v1/sync/events?device=B", nil)
	resp, err := se.bob.client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	rd := bufio.NewReader(resp.Body)
	if line, _ := rd.ReadString('\n'); !strings.HasPrefix(line, ": connected") {
		t.Fatalf("first line %q", line)
	}
	got := make(chan string, 4)
	go func() {
		for {
			line, err := rd.ReadString('\n')
			if err != nil {
				return
			}
			if strings.HasPrefix(line, "data:") {
				got <- strings.TrimSpace(strings.TrimPrefix(line, "data:"))
			}
		}
	}()
	time.Sleep(20 * time.Millisecond)
	se.share(se.alice, "bob@example.com", "editor")
	select {
	case d := <-got:
		if d != "{}" {
			t.Fatalf("membership wake-up = %q, want {}", d)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("bob's device was not woken by the share")
	}
	// An edit by alice in the shared project wakes bob with a cursor.
	resp2, out := se.alice.do("PATCH", "/api/v1/tasks/"+se.task, map[string]any{"title": "Oat milk"})
	se.alice.mustStatus(resp2, 200, out)
	select {
	case d := <-got:
		var v map[string]any
		if json.Unmarshal([]byte(d), &v) != nil || v["cursor"] == nil {
			t.Fatalf("edit wake-up = %q", d)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("bob's device was not woken by alice's edit")
	}
}

func TestWebhooksFireForEveryMemberOfASharedProject(t *testing.T) {
	se := newShareEnv(t)
	se.alice.allowPrivate(true)
	recv := newHookReceiver(t)
	hook := se.bob.createHook(map[string]any{"url": recv.srv.URL, "events": []string{"task.updated"}, "projectId": se.project})
	se.share(se.alice, "bob@example.com", "viewer")
	resp, out := se.alice.do("PATCH", "/api/v1/tasks/"+se.task, map[string]any{"title": "Oat milk"})
	se.alice.mustStatus(resp, 200, out)
	var n int
	var payload string
	if err := se.alice.db.QueryRow(`SELECT COUNT(*), COALESCE(MAX(payload),'') FROM webhook_deliveries WHERE webhook_id = ?`, hook["id"]).Scan(&n, &payload); err != nil {
		t.Fatal(err)
	}
	if n != 1 || !strings.Contains(payload, "Oat milk") {
		t.Fatalf("bob's deliveries = %d (%s)", n, payload)
	}
	// Personal changes of alice never reach bob's webhooks.
	resp, out = se.alice.do("POST", "/api/v1/tasks", map[string]any{"title": "private"})
	se.alice.mustStatus(resp, 201, out)
	resp, out = se.alice.do("PATCH", "/api/v1/tasks/"+out["id"].(string), map[string]any{"title": "still private"})
	se.alice.mustStatus(resp, 200, out)
	_ = se.alice.db.QueryRow(`SELECT COUNT(*) FROM webhook_deliveries WHERE webhook_id = ?`, hook["id"]).Scan(&n)
	if n != 1 {
		t.Fatalf("bob received alice's personal change: %d deliveries", n)
	}
}

func TestImportIntoSharedProjectRespectsRole(t *testing.T) {
	se := newShareEnv(t)
	se.share(se.alice, "carol@example.com", "viewer")
	// The importer refuses a shared project the caller cannot write to.
	resp, out := se.carol.upload("/api/v1/import/preview", "tasks.csv", []byte("title\nNew task\n"), map[string]any{"format": "csv", "targetProject": se.project})
	if resp.StatusCode != 400 || !strings.Contains(fmt.Sprint(out), "role") {
		t.Fatalf("viewer import preview = %d %v", resp.StatusCode, out)
	}
	// An editor imports into the shared project; the owner sees the task.
	se.share(se.alice, "bob@example.com", "editor")
	job := se.bob.importAndWait("tasks.csv", []byte("title\nImported\n"), map[string]any{"format": "csv", "targetProject": se.project})
	if job["status"] != "done" {
		t.Fatalf("editor import = %v", job)
	}
	resp, out = se.alice.do("GET", "/api/v1/tasks", nil)
	se.alice.mustStatus(resp, 200, out)
	found := false
	for _, x := range out["tasks"].([]any) {
		if x.(map[string]any)["title"] == "Imported" {
			found = true
		}
	}
	if !found {
		t.Fatalf("owner does not see the imported task: %v", out)
	}
	_ = opsync.RoleViewer
}
