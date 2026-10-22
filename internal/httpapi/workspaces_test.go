package httpapi

import (
	"net/http"
	"strings"
	"testing"
	"time"
)

// Workspace routes, group grants and invite links (OpenSpec change
// workspaces, tasks 2.5, 2.8, 3.1 to 3.3).

// createWorkspace posts a workspace as c and returns its id.
func createWorkspace(c *env, name string) string {
	c.t.Helper()
	resp, out := c.do("POST", "/api/v1/workspaces", map[string]any{"name": name})
	c.mustStatus(resp, 201, out)
	return out["id"].(string)
}

func workspaceLink(by *env, ws string, body map[string]any) (string, map[string]any) {
	by.t.Helper()
	resp, out := by.do("POST", "/api/v1/workspaces/"+ws+"/invites", body)
	by.mustStatus(resp, 201, out)
	link := out["link"].(string)
	i := strings.LastIndex(link, "/invite/w/")
	if i < 0 {
		by.t.Fatalf("link = %q", link)
	}
	return link[i+len("/invite/w/"):], out
}

func TestWorkspaceRoutesAuthAndScopes(t *testing.T) {
	se := newShareEnv(t)
	anon := newClientAt(se.alice, "10.0.7.9")
	ws := createWorkspace(se.alice, "Family")
	for _, rt := range [][2]string{
		{"GET", "/api/v1/workspaces"}, {"POST", "/api/v1/workspaces"}, {"PATCH", "/api/v1/workspaces/" + ws},
		{"POST", "/api/v1/workspaces/" + ws + "/members"}, {"POST", "/api/v1/workspaces/" + ws + "/groups"},
		{"POST", "/api/v1/projects/" + se.project + "/grants"}, {"POST", "/api/v1/workspace-invites/otw_x/accept"},
	} {
		resp, out := anon.do(rt[0], rt[1], map[string]any{"name": "x"})
		if resp.StatusCode != 401 || errCode(out) != "unauthorized" {
			t.Fatalf("anonymous %s %s = %d %v", rt[0], rt[1], resp.StatusCode, out)
		}
	}
	for _, scope := range []string{"read", "agent"} {
		tok := se.alice.token(scope)
		c := se.alice.bearerClient()
		for _, rt := range [][2]string{{"GET", "/api/v1/workspaces"}, {"POST", "/api/v1/workspaces"}, {"POST", "/api/v1/workspaces/" + ws + "/invites"}} {
			resp, out := c.do(rt[0], rt[1], map[string]any{"name": "x"}, bearer(tok)...)
			if resp.StatusCode != 403 || errCode(out) != "insufficient_scope" {
				t.Fatalf("%s token %s %s = %d %v", scope, rt[0], rt[1], resp.StatusCode, out)
			}
		}
	}
	// A non-member gets 404 everywhere.
	for _, rt := range [][3]string{{"GET", "", ""}, {"GET", "/members", ""}, {"GET", "/groups", ""}, {"PATCH", "", "name"}, {"POST", "/members", "email"}} {
		var body any
		if rt[2] != "" {
			body = map[string]any{rt[2]: "carol@example.com"}
		}
		resp, out := se.bob.do(rt[0], "/api/v1/workspaces/"+ws+rt[1], body)
		if resp.StatusCode != 404 || errCode(out) != "not_found" {
			t.Fatalf("non-member %s %s = %d %v", rt[0], rt[1], resp.StatusCode, out)
		}
	}
	// Invalid input names the field.
	resp, out := se.alice.do("POST", "/api/v1/workspaces", map[string]any{"name": ""})
	if resp.StatusCode != 400 || errCode(out) != "invalid_input" || !strings.Contains(out["error"].(map[string]any)["message"].(string), "name") {
		t.Fatalf("empty name = %d %v", resp.StatusCode, out)
	}
	// The default workspace.
	resp, out = se.alice.do("GET", "/api/v1/workspaces", nil)
	se.alice.mustStatus(resp, 200, out)
	var def string
	for _, w := range out["workspaces"].([]any) {
		if m := w.(map[string]any); m["default"] == true {
			def = m["id"].(string)
			if m["name"] != "Personal" || m["role"] != "owner" {
				t.Fatalf("default = %v", m)
			}
		}
	}
	resp, out = se.alice.do("DELETE", "/api/v1/workspaces/"+def, nil)
	if resp.StatusCode != 409 || errCode(out) != "default_workspace" {
		t.Fatalf("delete default = %d %v", resp.StatusCode, out)
	}
	resp, out = se.alice.do("POST", "/api/v1/workspaces/"+def+"/members", map[string]any{"email": "bob@example.com"})
	if resp.StatusCode != 409 || errCode(out) != "default_workspace" {
		t.Fatalf("member of default = %d %v", resp.StatusCode, out)
	}
	// Unknown email; a member cannot manage.
	resp, out = se.alice.do("POST", "/api/v1/workspaces/"+ws+"/members", map[string]any{"email": "nobody@example.com"})
	if resp.StatusCode != 404 || errCode(out) != "user_not_found" {
		t.Fatalf("unknown email = %d %v", resp.StatusCode, out)
	}
	resp, out = se.alice.do("POST", "/api/v1/workspaces/"+ws+"/members", map[string]any{"email": "bob@example.com", "role": "member"})
	se.alice.mustStatus(resp, 201, out)
	resp, out = se.bob.do("POST", "/api/v1/workspaces/"+ws+"/groups", map[string]any{"name": "Kids"})
	if resp.StatusCode != 403 || errCode(out) != "forbidden" {
		t.Fatalf("member creates group = %d %v", resp.StatusCode, out)
	}
	resp, out = se.alice.do("POST", "/api/v1/workspaces/"+ws+"/leave", nil)
	if resp.StatusCode != 409 || errCode(out) != "owner_must_transfer" {
		t.Fatalf("owner leaves = %d %v", resp.StatusCode, out)
	}
	resp, out = se.alice.do("DELETE", "/api/v1/workspaces/"+ws, nil)
	if resp.StatusCode != 409 || errCode(out) != "workspace_not_empty" {
		t.Fatalf("delete with a member = %d %v", resp.StatusCode, out)
	}
	if n := inviteRows(t, se.alice, "SELECT COUNT(*) FROM audit_events WHERE name = 'workspace.member_added' AND details NOT LIKE '%Family%'"); n != 1 {
		t.Fatalf("member_added events without names = %d", n)
	}
}

func TestWorkspaceDirectoryInSyncAndWake(t *testing.T) {
	se := newShareEnv(t)
	ws := createWorkspace(se.alice, "Family")
	sub := se.alice.sync.Notifier().Subscribe(se.ids["bob"], "bob-phone")
	defer se.alice.sync.Notifier().Unsubscribe(sub)
	resp, out := se.alice.do("POST", "/api/v1/workspaces/"+ws+"/members", map[string]any{"email": "bob@example.com"})
	se.alice.mustStatus(resp, 201, out)
	select {
	case <-sub.C():
	case <-time.After(2 * time.Second):
		t.Fatal("bob's device was not woken")
	}
	got := syncOnce(se.bob, "bob-phone", 0, nil)
	list := got["workspaces"].([]any)
	if len(list) != 2 {
		t.Fatalf("bob's workspaces = %v", list)
	}
	var fam map[string]any
	for _, w := range list {
		if m := w.(map[string]any); m["id"] == ws {
			fam = m
		}
	}
	if fam == nil || fam["role"] != "member" || fam["default"] != false || len(fam["members"].([]any)) != 2 {
		t.Fatalf("Family on bob's device = %v", fam)
	}
	for _, m := range fam["members"].([]any) {
		if _, has := m.(map[string]any)["email"]; has {
			t.Fatal("the directory carries emails")
		}
	}
}

func TestProjectGroupGrants(t *testing.T) {
	se := newShareEnv(t)
	ws := createWorkspace(se.alice, "Family")
	for _, u := range []string{"bob", "carol"} {
		resp, out := se.alice.do("POST", "/api/v1/workspaces/"+ws+"/members", map[string]any{"email": u + "@example.com"})
		se.alice.mustStatus(resp, 201, out)
	}
	resp, out := se.alice.do("POST", "/api/v1/workspaces/"+ws+"/groups", map[string]any{"name": "Adults"})
	se.alice.mustStatus(resp, 201, out)
	group := out["id"].(string)
	resp, out = se.alice.do("POST", "/api/v1/workspaces/"+ws+"/groups", map[string]any{"name": "adults"})
	if resp.StatusCode != 409 || errCode(out) != "group_exists" {
		t.Fatalf("duplicate group = %d %v", resp.StatusCode, out)
	}
	for _, u := range []string{"bob", "carol"} {
		resp, out = se.alice.do("PUT", "/api/v1/workspaces/"+ws+"/groups/"+group+"/members/"+se.ids[u], nil)
		se.alice.mustStatus(resp, 200, out)
	}
	resp, out = se.alice.do("PATCH", "/api/v1/projects/"+se.project, map[string]any{"workspace_id": ws})
	se.alice.mustStatus(resp, 200, out)

	// Grant a group.
	resp, out = se.alice.do("POST", "/api/v1/projects/"+se.project+"/grants", map[string]any{"groupId": group, "role": "editor"})
	se.alice.mustStatus(resp, 201, out)
	if g := out["grants"].([]any); len(g) != 1 || g[0].(map[string]any)["name"] != "Adults" {
		t.Fatalf("grants = %v", out["grants"])
	}
	for _, m := range out["members"].([]any) {
		mm := m.(map[string]any)
		if mm["userId"] == se.ids["bob"] {
			via := mm["via"].([]any)
			if mm["role"] != "editor" || len(via) != 1 || via[0].(map[string]any)["name"] != "Adults" {
				t.Fatalf("bob = %v", mm)
			}
		}
	}
	// Outsider refused: dan has an account but is not in Family.
	dan := newClientAt(se.alice, "10.0.7.4")
	resp, out = dan.do("POST", "/api/v1/auth/register", map[string]string{"email": "dan@example.com", "name": "Dan", "password": "correct horse battery"})
	dan.mustStatus(resp, 201, out)
	resp, out = se.alice.do("POST", "/api/v1/projects/"+se.project+"/members", map[string]any{"email": "dan@example.com", "role": "viewer"})
	if resp.StatusCode != 409 || errCode(out) != "not_in_workspace" {
		t.Fatalf("outsider = %d %v", resp.StatusCode, out)
	}
	// Grant refused for the role: the editor; an admin granting admin.
	resp, out = se.bob.do("POST", "/api/v1/projects/"+se.project+"/grants", map[string]any{"groupId": group, "role": "viewer"})
	if resp.StatusCode != 403 || errCode(out) != "forbidden" {
		t.Fatalf("editor grants = %d %v", resp.StatusCode, out)
	}
	resp, out = se.alice.do("PATCH", "/api/v1/projects/"+se.project+"/members/"+se.ids["carol"], map[string]any{"role": "admin"})
	se.alice.mustStatus(resp, 200, out)
	resp, out = se.carol.do("PATCH", "/api/v1/projects/"+se.project+"/grants/"+group, map[string]any{"role": "admin"})
	if resp.StatusCode != 403 || errCode(out) != "forbidden" {
		t.Fatalf("admin grants admin = %d %v", resp.StatusCode, out)
	}
	// A group of another workspace: 404.
	other := createWorkspace(se.alice, "Work")
	resp, out = se.alice.do("POST", "/api/v1/workspaces/"+other+"/groups", map[string]any{"name": "Team"})
	se.alice.mustStatus(resp, 201, out)
	resp, out = se.alice.do("POST", "/api/v1/projects/"+se.project+"/grants", map[string]any{"groupId": out["id"], "role": "viewer"})
	if resp.StatusCode != 404 || errCode(out) != "not_found" {
		t.Fatalf("foreign group = %d %v", resp.StatusCode, out)
	}
	// Remove the grant: bob (group only) leaves.
	resp, out = se.alice.do("DELETE", "/api/v1/projects/"+se.project+"/grants/"+group, nil)
	se.alice.mustStatus(resp, 204, out)
	if r := memberRoleOf(t, se.alice, se.project, se.ids["bob"]); r != "" {
		t.Fatalf("bob after the grant went = %q", r)
	}
	if n := inviteRows(t, se.alice, "SELECT COUNT(*) FROM audit_events WHERE name IN ('project.grant_added','project.grant_removed')"); n != 2 {
		t.Fatalf("grant events = %d", n)
	}
}

func TestWorkspaceInviteLinks(t *testing.T) {
	se := newShareEnv(t)
	ws := createWorkspace(se.alice, "Family")
	secret, created := workspaceLink(se.alice, ws, map[string]any{"role": "member"})
	if !strings.HasPrefix(secret, "otw_") || created["invite"].(map[string]any)["workspaceId"] != ws {
		t.Fatalf("created = %v", created)
	}
	anon := newClientAt(se.alice, "10.0.8.1")
	resp, out := anon.do("GET", "/api/v1/workspace-invites/"+secret, nil)
	anon.mustStatus(resp, 200, out)
	if out["workspaceName"] != "Family" || out["role"] != "member" {
		t.Fatalf("preview = %v", out)
	}
	resp, out = se.bob.do("POST", "/api/v1/workspace-invites/"+secret+"/accept", map[string]any{})
	se.bob.mustStatus(resp, 200, out)
	if out["workspaceId"] != ws {
		t.Fatalf("accept = %v", out)
	}
	// Spent.
	resp, out = se.carol.do("POST", "/api/v1/workspace-invites/"+secret+"/accept", map[string]any{})
	if resp.StatusCode != 404 || errCode(out) != "invitation_invalid" {
		t.Fatalf("spent = %d %v", resp.StatusCode, out)
	}
	// Already a member: 409 and the link stays pending.
	s2, _ := workspaceLink(se.alice, ws, map[string]any{"role": "member"})
	resp, out = se.bob.do("POST", "/api/v1/workspace-invites/"+s2+"/accept", map[string]any{})
	if resp.StatusCode != 409 || errCode(out) != "already_member" {
		t.Fatalf("already = %d %v", resp.StatusCode, out)
	}
	resp, out = anon.do("GET", "/api/v1/workspace-invites/"+s2, nil)
	anon.mustStatus(resp, 200, out)
	// A member cannot create links.
	resp, out = se.bob.do("POST", "/api/v1/workspaces/"+ws+"/invites", map[string]any{"role": "member"})
	if resp.StatusCode != 403 || errCode(out) != "forbidden" {
		t.Fatalf("member creates link = %d %v", resp.StatusCode, out)
	}
	// Account created through the link has its own default workspace.
	s3, _ := workspaceLink(se.alice, ws, map[string]any{"role": "member"})
	dora := newClientAt(se.alice, "10.0.8.3")
	resp, out = dora.do("POST", "/api/v1/auth/register", map[string]string{"email": "dora@example.com", "name": "Dora", "password": "correct horse battery", "workspaceInvite": s3})
	dora.mustStatus(resp, 201, out)
	resp, out = dora.do("GET", "/api/v1/workspaces", nil)
	dora.mustStatus(resp, 200, out)
	if n := len(out["workspaces"].([]any)); n != 2 {
		t.Fatalf("dora's workspaces = %d", n)
	}
	// Revoke and the rate limit.
	resp, out = se.alice.do("GET", "/api/v1/workspaces/"+ws+"/invites", nil)
	se.alice.mustStatus(resp, 200, out)
	pending := out["invites"].([]any)
	if len(pending) != 1 {
		t.Fatalf("pending = %v", pending)
	}
	resp, out = se.alice.do("DELETE", "/api/v1/workspaces/"+ws+"/invites/"+pending[0].(map[string]any)["id"].(string), nil)
	se.alice.mustStatus(resp, http.StatusNoContent, out)
	for i := 0; i < 17; i++ {
		workspaceLink(se.alice, ws, map[string]any{"role": "member"})
	}
	resp, out = se.alice.do("POST", "/api/v1/workspaces/"+ws+"/invites", map[string]any{"role": "member"})
	if resp.StatusCode != 429 || errCode(out) != "rate_limited" {
		t.Fatalf("21st link = %d %v", resp.StatusCode, out)
	}
}

func TestWorkspacesForEncryptedAccount(t *testing.T) {
	se := newShareEnv(t)
	resp, out := se.alice.do("PUT", "/api/v1/encryption/keys", keyRecord(1, 1))
	se.alice.mustStatus(resp, 201, out)
	// Creating, renaming and moving still work.
	ws := createWorkspace(se.alice, "Work")
	resp, out = se.alice.do("PATCH", "/api/v1/workspaces/"+ws, map[string]any{"name": "Job"})
	se.alice.mustStatus(resp, 200, out)
	resp, out = se.alice.do("PATCH", "/api/v1/projects/"+se.project, map[string]any{"workspace_id": ws})
	se.alice.mustStatus(resp, 200, out)
	// Members, groups and links are refused.
	for _, rt := range []struct {
		path string
		body map[string]any
	}{{"/members", map[string]any{"email": "bob@example.com"}}, {"/groups", map[string]any{"name": "Team"}}, {"/invites", map[string]any{"role": "member"}}} {
		resp, out := se.alice.do("POST", "/api/v1/workspaces/"+ws+rt.path, rt.body)
		if resp.StatusCode != 409 || errCode(out) != "encryption_enabled" {
			t.Fatalf("encrypted %s = %d %v", rt.path, resp.StatusCode, out)
		}
	}
}

func TestWorkspacesOnDemo(t *testing.T) {
	d := newDemoServer(t)
	visitor := d.anonymous()
	resp, out := createSandbox(visitor, token(visitor))
	visitor.mustStatus(resp, http.StatusCreated, out)
	resp, out = visitor.do("POST", "/api/v1/workspaces", map[string]any{"name": "Work"})
	if resp.StatusCode != 403 || errCode(out) != "demo_restricted" {
		t.Fatalf("demo create = %d %v", resp.StatusCode, out)
	}
	resp, out = visitor.do("GET", "/api/v1/workspaces", nil)
	visitor.mustStatus(resp, 200, out)
	if n := len(out["workspaces"].([]any)); n != 1 {
		t.Fatalf("sandbox workspaces = %d", n)
	}
	resp, out = d.anonymous().do("GET", "/api/v1/workspace-invites/otw_x", nil)
	if resp.StatusCode != 404 || errCode(out) != "invitation_invalid" {
		t.Fatalf("demo preview = %d %v", resp.StatusCode, out)
	}
}

func TestWorkspacesInTheExport(t *testing.T) {
	se := newShareEnv(t)
	work := createWorkspace(se.alice, "Work")
	fam := createWorkspace(se.bob, "Family")
	resp, out := se.bob.do("POST", "/api/v1/workspaces/"+fam+"/members", map[string]any{"email": "alice@example.com"})
	se.bob.mustStatus(resp, 201, out)
	resp, out = se.alice.do("PATCH", "/api/v1/projects/"+se.project, map[string]any{"workspace_id": work})
	se.alice.mustStatus(resp, 200, out)
	resp, out = se.alice.do("GET", "/api/v1/export", nil)
	se.alice.mustStatus(resp, 200, out)
	byID := map[string]map[string]any{}
	for _, w := range out["workspaces"].([]any) {
		m := w.(map[string]any)
		byID[m["id"].(string)] = m
	}
	if len(byID) != 3 || byID[work]["role"] != "owner" || byID[work]["members"] == nil || byID[fam]["role"] != "member" || byID[fam]["members"] != nil {
		t.Fatalf("export workspaces = %v", out["workspaces"])
	}
	if p := out["projects"].([]any)[0].(map[string]any); p["workspace_id"] != work {
		t.Fatalf("project = %v", p)
	}
}
