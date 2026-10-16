package httpapi

import (
	"fmt"
	"net/http"
	"strings"
	gosync "sync"
	"testing"
)

// Tests for project invite links (OpenSpec change `project-invite-links`).

// projectLink creates a project invite link as by and returns its id and secret.
func projectLink(by *env, projectID string, body map[string]any) (string, string, map[string]any) {
	by.t.Helper()
	resp, out := by.do("POST", "/api/v1/projects/"+projectID+"/invites", body)
	by.mustStatus(resp, 201, out)
	link := out["link"].(string)
	i := strings.LastIndex(link, "/invite/p/")
	if i < 0 {
		by.t.Fatalf("link = %q", link)
	}
	inv := out["invite"].(map[string]any)
	return inv["id"].(string), link[i+len("/invite/p/"):], out
}

func previewLink(c *env, secret string) (*http.Response, map[string]any) {
	c.t.Helper()
	return c.do("GET", "/api/v1/project-invites/"+secret, nil)
}

func acceptLink(c *env, secret string) (*http.Response, map[string]any) {
	c.t.Helper()
	return c.do("POST", "/api/v1/project-invites/"+secret+"/accept", map[string]any{})
}

func memberRoleOf(t *testing.T, c *env, projectID, userID string) string {
	t.Helper()
	resp, out := c.do("GET", "/api/v1/projects/"+projectID+"/members", nil)
	c.mustStatus(resp, 200, out)
	for _, m := range out["members"].([]any) {
		mm := m.(map[string]any)
		if mm["userId"] == userID {
			return mm["role"].(string)
		}
	}
	return ""
}

func inviteRows(t *testing.T, e *env, q string, args ...any) int {
	t.Helper()
	var n int
	if err := e.db.QueryRow(q, args...).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestProjectInviteRoutesAuthAndRoles(t *testing.T) {
	se := newShareEnv(t)
	p := "/api/v1/projects/" + se.project
	anon := newClientAt(se.alice, "10.0.0.9")
	for _, rt := range [][2]string{
		{"GET", p + "/invites"}, {"POST", p + "/invites"}, {"DELETE", p + "/invites/x"},
		{"POST", "/api/v1/project-invites/otp_x/accept"}, {"GET", "/api/v1/settings/project-invites"}, {"PUT", "/api/v1/settings/project-invites"},
	} {
		resp, out := anon.do(rt[0], rt[1], map[string]any{"role": "viewer"})
		if resp.StatusCode != 401 || errCode(out) != "unauthorized" {
			t.Fatalf("anonymous %s %s = %d %v", rt[0], rt[1], resp.StatusCode, out)
		}
	}

	// A non-member gets 404 (the project's existence is not revealed).
	resp, out := se.bob.do("POST", p+"/invites", map[string]any{"role": "viewer"})
	if resp.StatusCode != 404 || errCode(out) != "not_found" {
		t.Fatalf("non-member create = %d %v", resp.StatusCode, out)
	}

	// Owner: invalid input names the field.
	for _, body := range []map[string]any{
		{"role": "owner"}, {"role": "boss"},
		{"role": "viewer", "expiresInHours": 0}, {"role": "viewer", "expiresInHours": 721}, {"role": "viewer", "expiresInHours": 1.5},
		{"role": "viewer", "email": "not an email"},
	} {
		resp, out := se.alice.do("POST", p+"/invites", body)
		if resp.StatusCode != 400 || errCode(out) != "invalid_input" {
			t.Fatalf("create %v = %d %v", body, resp.StatusCode, out)
		}
	}
	// The owner may grant every member role, including admin, on an unshared project.
	id, secret, created := projectLink(se.alice, se.project, map[string]any{"role": "admin", "email": "Dora@Example.com", "expiresInHours": 24})
	inv := created["invite"].(map[string]any)
	if !strings.HasPrefix(secret, "otp_") || inv["role"] != "admin" || inv["email"] != "dora@example.com" || created["newAccounts"] != true {
		t.Fatalf("created = %v secret=%q", created, secret)
	}
	if exp := inv["expiresAt"].(float64) - inv["createdAt"].(float64); exp != 24*3600*1000 {
		t.Fatalf("expiry = %v ms", exp)
	}

	// Viewer and editor are refused; an admin may not grant admin.
	se.share(se.alice, "bob@example.com", "editor")
	se.share(se.alice, "carol@example.com", "admin")
	resp, out = se.bob.do("POST", p+"/invites", map[string]any{"role": "viewer"})
	if resp.StatusCode != 403 || errCode(out) != "forbidden" {
		t.Fatalf("editor create = %d %v", resp.StatusCode, out)
	}
	resp, out = se.bob.do("GET", p+"/invites", nil)
	se.bob.mustStatus(resp, 403, out)
	resp, out = se.bob.do("DELETE", p+"/invites/"+id, nil)
	se.bob.mustStatus(resp, 403, out)
	resp, out = se.carol.do("POST", p+"/invites", map[string]any{"role": "admin"})
	if resp.StatusCode != 403 || errCode(out) != "forbidden" {
		t.Fatalf("admin granting admin = %d %v", resp.StatusCode, out)
	}
	_, _, byAdmin := projectLink(se.carol, se.project, map[string]any{"role": "editor"})
	// Carol is a plain server member on a server with open sign-up: her link may create accounts.
	if byAdmin["newAccounts"] != true {
		t.Fatalf("admin link newAccounts = %v", byAdmin["newAccounts"])
	}

	// The list carries no secret and shows the creator.
	resp, out = se.carol.do("GET", p+"/invites", nil)
	se.carol.mustStatus(resp, 200, out)
	list := out["invites"].([]any)
	if len(list) != 2 {
		t.Fatalf("list = %v", list)
	}
	for _, it := range list {
		m := it.(map[string]any)
		for k := range m {
			if k == "link" || k == "secret" || k == "token" || k == "tokenHash" {
				t.Fatalf("list leaks %q", k)
			}
		}
		if m["createdByName"] == "" {
			t.Fatalf("no creator name: %v", m)
		}
	}
	if n := inviteRows(t, se.alice, "SELECT COUNT(*) FROM audit_events WHERE name = 'project_invite.created' AND details NOT LIKE '%otp_%'"); n != 2 {
		t.Fatalf("project_invite.created events without secrets = %d", n)
	}
}

func TestProjectInvitePreviewAndJoin(t *testing.T) {
	se := newShareEnv(t)
	_, secret, _ := projectLink(se.alice, se.project, map[string]any{"role": "editor"})

	anon := newClientAt(se.alice, "10.0.0.9")
	resp, out := previewLink(anon, secret)
	anon.mustStatus(resp, 200, out)
	if out["inviterName"] != "alice" || out["projectName"] != "Home" || out["role"] != "editor" || out["email"] != nil || out["canCreateAccount"] != true {
		t.Fatalf("preview = %v", out)
	}
	for _, k := range []string{"id", "projectId", "createdBy", "alreadyMember"} {
		if _, ok := out[k]; ok {
			t.Fatalf("preview leaks %q: %v", k, out)
		}
	}
	// A signed-in visitor learns whether they are on the project.
	_, out = previewLink(se.bob, secret)
	if out["alreadyMember"] != false {
		t.Fatalf("bob preview = %v", out)
	}

	// Bob joins; the link is spent and his devices learn the membership.
	resp, out = acceptLink(se.bob, secret)
	se.bob.mustStatus(resp, 200, out)
	if out["projectId"] != se.project || out["role"] != "editor" {
		t.Fatalf("accept = %v", out)
	}
	if r := memberRoleOf(t, se.alice, se.project, se.ids["bob"]); r != "editor" {
		t.Fatalf("bob role = %q", r)
	}
	_, _, last := syncAll(se.bob, "B", 0)
	found := false
	for _, m := range last["memberships"].([]any) {
		if m.(map[string]any)["projectId"] == se.project {
			found = true
		}
	}
	if !found {
		t.Fatalf("bob's sync has no membership: %v", last["memberships"])
	}
	resp, out = previewLink(anon, secret)
	if resp.StatusCode != 404 || errCode(out) != "invitation_invalid" {
		t.Fatalf("spent preview = %d %v", resp.StatusCode, out)
	}
	resp, out = acceptLink(se.carol, secret)
	if resp.StatusCode != 404 || errCode(out) != "invitation_invalid" {
		t.Fatalf("second accept = %d %v", resp.StatusCode, out)
	}
	if n := inviteRows(t, se.alice, "SELECT COUNT(*) FROM audit_events WHERE name = 'project_invite.accepted' AND actor_id = ? AND details LIKE '%editor%'", se.ids["bob"]); n != 1 {
		t.Fatalf("project_invite.accepted events = %d", n)
	}

	// An existing member gets already_member and the link stays pending.
	_, again, _ := projectLink(se.alice, se.project, map[string]any{"role": "viewer"})
	_, out = previewLink(se.bob, again)
	if out["alreadyMember"] != true {
		t.Fatalf("member preview = %v", out)
	}
	resp, out = acceptLink(se.bob, again)
	if resp.StatusCode != 409 || errCode(out) != "already_member" {
		t.Fatalf("member accept = %d %v", resp.StatusCode, out)
	}
	resp, out = acceptLink(se.alice, again)
	if resp.StatusCode != 409 || errCode(out) != "already_member" {
		t.Fatalf("creator accept = %d %v", resp.StatusCode, out)
	}
	resp, out = previewLink(anon, again)
	anon.mustStatus(resp, 200, out)
	if r := memberRoleOf(t, se.alice, se.project, se.ids["bob"]); r != "editor" {
		t.Fatalf("bob role after second link = %q", r)
	}

	// Unknown and malformed secrets look the same.
	for _, s := range []string{"otp_unknown", "oti_wrongkind", "nonsense"} {
		resp, out := previewLink(anon, s)
		if resp.StatusCode != 404 || errCode(out) != "invitation_invalid" {
			t.Fatalf("preview %q = %d %v", s, resp.StatusCode, out)
		}
	}
}

func TestProjectInviteEmailBinding(t *testing.T) {
	se := newShareEnv(t)
	_, secret, _ := projectLink(se.alice, se.project, map[string]any{"role": "viewer", "email": "CAROL@example.com"})
	resp, out := acceptLink(se.bob, secret)
	if resp.StatusCode != 403 || errCode(out) != "invitation_email_mismatch" {
		t.Fatalf("wrong email = %d %v", resp.StatusCode, out)
	}
	if r := memberRoleOf(t, se.alice, se.project, se.ids["bob"]); r != "" {
		t.Fatalf("bob was added: %q", r)
	}
	resp, out = acceptLink(se.carol, secret)
	se.carol.mustStatus(resp, 200, out)
	if r := memberRoleOf(t, se.alice, se.project, se.ids["carol"]); r != "viewer" {
		t.Fatalf("carol role = %q", r)
	}
}

func TestProjectInviteCreatorLostRights(t *testing.T) {
	se := newShareEnv(t)
	se.share(se.alice, "bob@example.com", "admin")
	_, secret, _ := projectLink(se.bob, se.project, map[string]any{"role": "editor"})
	anon := newClientAt(se.alice, "10.0.0.9")

	// Bob is demoted to editor: his link no longer works.
	resp, out := se.alice.do("PATCH", "/api/v1/projects/"+se.project+"/members/"+se.ids["bob"], map[string]any{"role": "editor"})
	se.alice.mustStatus(resp, 200, out)
	resp, out = previewLink(anon, secret)
	if resp.StatusCode != 404 || errCode(out) != "invitation_invalid" {
		t.Fatalf("preview after demotion = %d %v", resp.StatusCode, out)
	}
	resp, out = acceptLink(se.carol, secret)
	if resp.StatusCode != 404 || errCode(out) != "invitation_invalid" {
		t.Fatalf("accept after demotion = %d %v", resp.StatusCode, out)
	}
	if r := memberRoleOf(t, se.alice, se.project, se.ids["carol"]); r != "" {
		t.Fatalf("carol added by a demoted admin's link: %q", r)
	}
	// Rights are checked at use time: promoted again, the still pending link works.
	resp, out = se.alice.do("PATCH", "/api/v1/projects/"+se.project+"/members/"+se.ids["bob"], map[string]any{"role": "admin"})
	se.alice.mustStatus(resp, 200, out)
	_, secret2, _ := projectLink(se.bob, se.project, map[string]any{"role": "viewer"})
	// Removed from the project: both links stop working.
	resp, out = se.alice.do("DELETE", "/api/v1/projects/"+se.project+"/members/"+se.ids["bob"], nil)
	se.alice.mustStatus(resp, 204, out)
	for _, s := range []string{secret, secret2} {
		resp, out = acceptLink(se.carol, s)
		if resp.StatusCode != 404 || errCode(out) != "invitation_invalid" {
			t.Fatalf("accept after removal = %d %v", resp.StatusCode, out)
		}
	}
}

func TestProjectInviteRevocationAndDeletedProject(t *testing.T) {
	se := newShareEnv(t)
	p := "/api/v1/projects/" + se.project
	id, secret, _ := projectLink(se.alice, se.project, map[string]any{"role": "viewer"})
	resp, out := se.alice.do("DELETE", p+"/invites/"+id, nil)
	se.alice.mustStatus(resp, 204, out)
	resp, out = se.alice.do("DELETE", p+"/invites/"+id, nil)
	se.alice.mustStatus(resp, 204, out)
	resp, out = previewLink(se.bob, secret)
	if resp.StatusCode != 404 || errCode(out) != "invitation_invalid" {
		t.Fatalf("revoked preview = %d %v", resp.StatusCode, out)
	}
	resp, out = acceptLink(se.bob, secret)
	se.bob.mustStatus(resp, 404, out)
	resp, out = se.alice.do("GET", p+"/invites", nil)
	se.alice.mustStatus(resp, 200, out)
	if n := len(out["invites"].([]any)); n != 0 {
		t.Fatalf("revoked link still listed (%d)", n)
	}
	resp, out = se.alice.do("DELETE", p+"/invites/unknown", nil)
	se.alice.mustStatus(resp, 404, out)
	if n := inviteRows(t, se.alice, "SELECT COUNT(*) FROM audit_events WHERE name = 'project_invite.revoked'"); n != 1 {
		t.Fatalf("project_invite.revoked events = %d", n)
	}

	// An accepted link cannot be revoked.
	id2, secret2, _ := projectLink(se.alice, se.project, map[string]any{"role": "viewer"})
	resp, out = acceptLink(se.bob, secret2)
	se.bob.mustStatus(resp, 200, out)
	resp, out = se.alice.do("DELETE", p+"/invites/"+id2, nil)
	if resp.StatusCode != 409 || errCode(out) != "invitation_spent" {
		t.Fatalf("revoke accepted = %d %v", resp.StatusCode, out)
	}

	// A deleted project invalidates its links.
	_, secret3, _ := projectLink(se.alice, se.project, map[string]any{"role": "viewer"})
	resp, out = se.alice.do("DELETE", p, nil)
	se.alice.mustStatus(resp, 204, out)
	resp, out = previewLink(se.carol, secret3)
	if resp.StatusCode != 404 || errCode(out) != "invitation_invalid" {
		t.Fatalf("deleted project preview = %d %v", resp.StatusCode, out)
	}
	resp, out = acceptLink(se.carol, secret3)
	se.carol.mustStatus(resp, 404, out)
}

// closedEnv: sign-up closed; alice is the server owner with project "Trip";
// bob is a plain member (admitted by a server invitation) and an admin of Trip.
type closedEnv struct {
	alice, bob *env
	project    string
}

func newClosedEnv(t *testing.T) *closedEnv {
	t.Helper()
	alice := ownerEnv(t)
	_, invSecret, _ := alice.invite(map[string]any{})
	bob := newClientAt(alice, "10.0.1.2")
	resp, out := bob.do("POST", "/api/v1/auth/register", map[string]string{"email": "bob@example.com", "name": "Bob", "password": "correct horse battery", "invitation": invSecret})
	bob.mustStatus(resp, 201, out)
	resp, out = alice.do("POST", "/api/v1/projects", map[string]any{"name": "Trip"})
	alice.mustStatus(resp, 201, out)
	project := out["id"].(string)
	resp, out = alice.do("POST", "/api/v1/projects/"+project+"/members", map[string]any{"email": "bob@example.com", "role": "admin"})
	alice.mustStatus(resp, 201, out)
	return &closedEnv{alice: alice, bob: bob, project: project}
}

func TestProjectInviteRegisterNewAccount(t *testing.T) {
	ce := newClosedEnv(t)
	_, secret, created := projectLink(ce.alice, ce.project, map[string]any{"role": "editor", "email": "dora@example.com"})
	if created["newAccounts"] != true {
		t.Fatalf("owner link newAccounts = %v", created["newAccounts"])
	}
	dora := newClientAt(ce.alice, "10.0.1.3")
	_, out := previewLink(dora, secret)
	if out["canCreateAccount"] != true {
		t.Fatalf("preview = %v", out)
	}
	// Both an invitation and a project link: refused.
	resp, out := dora.do("POST", "/api/v1/auth/register", map[string]string{"email": "dora@example.com", "password": "correct horse battery", "projectInvite": secret, "invitation": "oti_x"})
	dora.mustStatus(resp, 400, out)
	// Email mismatch: no account.
	resp, out = dora.do("POST", "/api/v1/auth/register", map[string]string{"email": "eve@example.com", "password": "correct horse battery", "projectInvite": secret})
	if resp.StatusCode != 403 || errCode(out) != "invitation_email_mismatch" {
		t.Fatalf("mismatch = %d %v", resp.StatusCode, out)
	}
	// Weak password: no account, link pending.
	resp, out = dora.do("POST", "/api/v1/auth/register", map[string]string{"email": "dora@example.com", "password": "short", "projectInvite": secret})
	dora.mustStatus(resp, 400, out)
	if n := inviteRows(t, ce.alice, "SELECT COUNT(*) FROM users"); n != 2 {
		t.Fatalf("users = %d", n)
	}
	resp, out = dora.do("POST", "/api/v1/auth/register", map[string]string{"email": "dora@example.com", "name": "Dora", "password": "correct horse battery", "projectInvite": secret})
	dora.mustStatus(resp, 201, out)
	user := out["user"].(map[string]any)
	if user["role"] != "member" || out["projectId"] != ce.project || out["role"] != "editor" {
		t.Fatalf("register = %v", out)
	}
	if r := memberRoleOf(t, ce.alice, ce.project, user["id"].(string)); r != "editor" {
		t.Fatalf("dora role = %q", r)
	}
	// The session works.
	resp, out = dora.do("GET", "/api/v1/projects/"+ce.project+"/members", nil)
	dora.mustStatus(resp, 200, out)
	// Spent.
	resp, out = newClientAt(ce.alice, "10.0.1.4").do("POST", "/api/v1/auth/register", map[string]string{"email": "dora2@example.com", "password": "correct horse battery", "projectInvite": secret})
	if resp.StatusCode != 404 || errCode(out) != "invitation_invalid" {
		t.Fatalf("reuse = %d %v", resp.StatusCode, out)
	}
	// Email already taken: email_taken, link stays pending.
	_, s2, _ := projectLink(ce.alice, ce.project, map[string]any{"role": "viewer"})
	resp, out = newClientAt(ce.alice, "10.0.1.5").do("POST", "/api/v1/auth/register", map[string]string{"email": "bob@example.com", "password": "correct horse battery", "projectInvite": s2})
	if resp.StatusCode != 409 || errCode(out) != "email_taken" {
		t.Fatalf("taken = %d %v", resp.StatusCode, out)
	}
	resp, out = previewLink(dora, s2)
	dora.mustStatus(resp, 200, out)
}

func TestProjectInviteOwnerSwitch(t *testing.T) {
	ce := newClosedEnv(t)
	_, secret, created := projectLink(ce.bob, ce.project, map[string]any{"role": "viewer"})
	if created["newAccounts"] != false {
		t.Fatalf("member link newAccounts = %v", created["newAccounts"])
	}
	anon := newClientAt(ce.alice, "10.0.1.6")
	_, out := previewLink(anon, secret)
	if out["canCreateAccount"] != false {
		t.Fatalf("preview with switch off = %v", out)
	}
	register := func(email string) (*http.Response, map[string]any) {
		return anon.do("POST", "/api/v1/auth/register", map[string]string{"email": email, "password": "correct horse battery", "projectInvite": secret})
	}
	resp, out := register("eve@example.com")
	if resp.StatusCode != 403 || errCode(out) != "project_invite_not_allowed" {
		t.Fatalf("register with switch off = %d %v", resp.StatusCode, out)
	}
	if n := inviteRows(t, ce.alice, "SELECT COUNT(*) FROM users WHERE email = 'eve@example.com'"); n != 0 {
		t.Fatal("account created with switch off")
	}

	// Only the owner changes the switch; everyone signed in reads it.
	resp, out = ce.bob.do("PUT", "/api/v1/settings/project-invites", map[string]any{"membersCanInviteNewPeople": true})
	if resp.StatusCode != 403 || errCode(out) != "forbidden" {
		t.Fatalf("member PUT = %d %v", resp.StatusCode, out)
	}
	resp, out = ce.bob.do("GET", "/api/v1/settings/project-invites", nil)
	ce.bob.mustStatus(resp, 200, out)
	if out["membersCanInviteNewPeople"] != false {
		t.Fatalf("GET = %v", out)
	}
	resp, out = ce.alice.do("PUT", "/api/v1/settings/project-invites", map[string]any{})
	ce.alice.mustStatus(resp, 400, out)
	resp, out = ce.alice.do("PUT", "/api/v1/settings/project-invites", map[string]any{"membersCanInviteNewPeople": true})
	ce.alice.mustStatus(resp, 200, out)
	if n := inviteRows(t, ce.alice, "SELECT COUNT(*) FROM audit_events WHERE name = 'settings.changed' AND details LIKE '%project_invites.members_create_accounts%'"); n != 1 {
		t.Fatalf("settings.changed events = %d", n)
	}

	_, out = previewLink(anon, secret)
	if out["canCreateAccount"] != true {
		t.Fatalf("preview with switch on = %v", out)
	}
	resp, out = register("eve@example.com")
	anon.mustStatus(resp, 201, out)
	if out["role"] != "viewer" {
		t.Fatalf("register = %v", out)
	}
}

func TestProjectInviteConcurrentAcceptance(t *testing.T) {
	ce := newClosedEnv(t)
	_, secret, _ := projectLink(ce.alice, ce.project, map[string]any{"role": "editor"})
	const n = 8
	var wg gosync.WaitGroup
	codes := make([]int, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			c := newClientAt(ce.alice, fmt.Sprintf("10.0.2.%d", i+1))
			resp, _ := c.do("POST", "/api/v1/auth/register", map[string]string{"email": fmt.Sprintf("racer%d@example.com", i), "password": "correct horse battery", "projectInvite": secret})
			codes[i] = resp.StatusCode
		}(i)
	}
	wg.Wait()
	created := 0
	for _, c := range codes {
		switch c {
		case 201:
			created++
		case 404:
		default:
			t.Fatalf("unexpected status %d in %v", c, codes)
		}
	}
	if created != 1 {
		t.Fatalf("%d registrations succeeded: %v", created, codes)
	}
	if got := inviteRows(t, ce.alice, "SELECT COUNT(*) FROM users WHERE email LIKE 'racer%'"); got != 1 {
		t.Fatalf("accounts created = %d", got)
	}
	if got := inviteRows(t, ce.alice, "SELECT COUNT(*) FROM project_members WHERE project_id = ?", ce.project); got != 3 {
		t.Fatalf("members = %d, want owner, bob and one racer", got)
	}

	// Signed-in acceptances race too: exactly one joins.
	_, secret2, _ := projectLink(ce.alice, ce.project, map[string]any{"role": "viewer"})
	clients := make([]*env, 4)
	for i := range clients {
		_, inv, _ := ce.alice.invite(map[string]any{})
		c := newClientAt(ce.alice, fmt.Sprintf("10.0.3.%d", i+1))
		resp, out := c.do("POST", "/api/v1/auth/register", map[string]string{"email": fmt.Sprintf("m%d@example.com", i), "password": "correct horse battery", "invitation": inv})
		c.mustStatus(resp, 201, out)
		clients[i] = c
	}
	joined := make([]int, len(clients))
	for i, c := range clients {
		wg.Add(1)
		go func(i int, c *env) {
			defer wg.Done()
			resp, _ := c.do("POST", "/api/v1/project-invites/"+secret2+"/accept", map[string]any{})
			joined[i] = resp.StatusCode
		}(i, c)
	}
	wg.Wait()
	ok := 0
	for _, c := range joined {
		if c == 200 {
			ok++
		} else if c != 404 {
			t.Fatalf("accept status %d in %v", c, joined)
		}
	}
	if ok != 1 {
		t.Fatalf("%d acceptances succeeded: %v", ok, joined)
	}
}

func TestProjectInviteCreationRateLimit(t *testing.T) {
	se := newShareEnv(t)
	for i := 0; i < 20; i++ {
		projectLink(se.alice, se.project, map[string]any{"role": "viewer"})
	}
	resp, out := se.alice.do("POST", "/api/v1/projects/"+se.project+"/invites", map[string]any{"role": "viewer"})
	if resp.StatusCode != 429 || errCode(out) != "rate_limited" {
		t.Fatalf("21st link = %d %v", resp.StatusCode, out)
	}
}

func TestProjectInvitePreviewRateLimit(t *testing.T) {
	se := newShareEnv(t)
	anon := newClientAt(se.alice, "10.0.4.1")
	var last int
	for i := 0; i < 11; i++ {
		resp, _ := previewLink(anon, "otp_guess")
		last = resp.StatusCode
	}
	if last != 429 {
		t.Fatalf("11th preview = %d, want 429", last)
	}
}

func TestProjectInviteTokenScopes(t *testing.T) {
	se := newShareEnv(t)
	_, secret, _ := projectLink(se.alice, se.project, map[string]any{"role": "viewer"})
	for _, scope := range []string{"read", "agent"} {
		tok := se.alice.token(scope)
		c := se.alice.bearerClient()
		resp, out := c.do("POST", "/api/v1/projects/"+se.project+"/invites", map[string]any{"role": "viewer"}, bearer(tok)...)
		if resp.StatusCode != 403 || errCode(out) != "insufficient_scope" {
			t.Fatalf("%s token create = %d %v", scope, resp.StatusCode, out)
		}
		bobTok := se.bob.token(scope)
		resp, out = c.do("POST", "/api/v1/project-invites/"+secret+"/accept", map[string]any{}, bearer(bobTok)...)
		if resp.StatusCode != 403 || errCode(out) != "insufficient_scope" {
			t.Fatalf("%s token accept = %d %v", scope, resp.StatusCode, out)
		}
	}
	// A full token may create links.
	full := se.alice.token("")
	resp, out := se.alice.bearerClient().do("POST", "/api/v1/projects/"+se.project+"/invites", map[string]any{"role": "viewer"}, bearer(full)...)
	if resp.StatusCode != 201 {
		t.Fatalf("full token create = %d %v", resp.StatusCode, out)
	}
}

func TestProjectInviteSSOOnly(t *testing.T) {
	o := newOIDCEnv(t, false)
	resp, out := o.do("POST", "/api/v1/projects", map[string]any{"name": "Team"})
	o.mustStatus(resp, 201, out)
	project := out["id"].(string)
	_, secret, _ := projectLink(o.env, project, map[string]any{"role": "editor"})
	o.configure(map[string]any{"ssoOnly": true})
	c := o.client("203.0.113.60")
	_, out = previewLink(c, secret)
	if out["canCreateAccount"] != false {
		t.Fatalf("preview in SSO-only = %v", out)
	}
	resp, out = c.do("POST", "/api/v1/auth/register", map[string]string{"email": "n@example.com", "password": "another password 1", "projectInvite": secret})
	if resp.StatusCode != 403 || errCode(out) != "sso_required" {
		t.Fatalf("register in SSO-only = %d %v", resp.StatusCode, out)
	}
}

func TestProjectInviteDeactivatedCreator(t *testing.T) {
	ce := newClosedEnv(t)
	_, secret, _ := projectLink(ce.bob, ce.project, map[string]any{"role": "viewer"})
	_, out := ce.bob.do("GET", "/api/v1/me", nil)
	bobID := out["user"].(map[string]any)["id"].(string)
	resp, out := ce.alice.do("POST", "/api/v1/users/"+bobID+"/deactivate", map[string]any{})
	ce.alice.mustStatus(resp, 200, out)
	resp, out = previewLink(newClientAt(ce.alice, "10.0.5.1"), secret)
	if resp.StatusCode != 404 || errCode(out) != "invitation_invalid" {
		t.Fatalf("preview after deactivation = %d %v", resp.StatusCode, out)
	}
	if n := inviteRows(t, ce.alice, "SELECT COUNT(*) FROM project_invites WHERE revoked_at IS NULL"); n != 0 {
		t.Fatalf("pending links after deactivation = %d", n)
	}
}

func TestRedactPath(t *testing.T) {
	for in, want := range map[string]string{
		"/api/v1/project-invites/otp_abc/accept": "/api/v1/project-invites/[redacted]/accept",
		"/api/v1/invitations/oti_xyz":            "/api/v1/invitations/[redacted]",
		"/api/v1/tasks/01HX":                     "/api/v1/tasks/01HX",
		"/api/v1/public/otl_secret/tick":         "/api/v1/public/[redacted]/tick",
	} {
		if got := redactPath(in); got != want {
			t.Errorf("redactPath(%q) = %q, want %q", in, got, want)
		}
	}
}
