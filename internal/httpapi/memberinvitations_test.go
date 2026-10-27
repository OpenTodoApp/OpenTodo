package httpapi

import (
	"slices"
	"strings"
	"testing"
)

// Membership invitations (OpenSpec change member-add-consent).

func myInvitations(c *env) []map[string]any {
	c.t.Helper()
	resp, out := c.do("GET", "/api/v1/me/member-invitations", nil)
	c.mustStatus(resp, 200, out)
	var list []map[string]any
	for _, x := range out["invitations"].([]any) {
		list = append(list, x.(map[string]any))
	}
	return list
}

func pendingOf(t *testing.T, out map[string]any) []map[string]any {
	t.Helper()
	raw, ok := out["pending"].([]any)
	if !ok {
		t.Fatalf("no pending list in %v", out)
	}
	var list []map[string]any
	for _, x := range raw {
		list = append(list, x.(map[string]any))
	}
	return list
}

func memberIDs(out map[string]any) []string {
	var ids []string
	for _, m := range out["members"].([]any) {
		ids = append(ids, m.(map[string]any)["userId"].(string))
	}
	return ids
}

func auditCount(e *env, name, actor, target string) int {
	e.t.Helper()
	var n int
	if err := e.db.QueryRow(`SELECT COUNT(*) FROM audit_events WHERE name = ? AND actor_id = ? AND COALESCE(target_id,'') = ?`, name, actor, target).Scan(&n); err != nil {
		e.t.Fatal(err)
	}
	return n
}

func TestAddMemberAsksStrangers(t *testing.T) {
	se := newShareEnv(t)
	p := "/api/v1/projects/" + se.project
	// Bob shares nothing with alice: an invitation, not a membership.
	resp, out := se.alice.do("POST", p+"/members", map[string]any{"email": "bob@example.com", "role": "editor"})
	se.alice.mustStatus(resp, 202, out)
	if len(out) != 1 || out["pending"] != true {
		t.Fatalf("answer = %v", out)
	}
	resp, out = se.alice.do("GET", p+"/members", nil)
	se.alice.mustStatus(resp, 200, out)
	if ids := memberIDs(out); len(ids) != 1 {
		t.Fatalf("bob is a member before answering: %v", out)
	}
	pending := pendingOf(t, out)
	if len(pending) != 1 || pending[0]["email"] != "bob@example.com" || pending[0]["role"] != "editor" || pending[0]["invitedBy"] != se.ids["alice"] {
		t.Fatalf("pending = %v", pending)
	}
	// Bob sees it in his list and as an unread notification naming the project.
	mine := myInvitations(se.bob)
	if len(mine) != 1 || mine[0]["kind"] != "project" || mine[0]["targetId"] != se.project || mine[0]["targetName"] != "Home" ||
		mine[0]["inviterName"] != "alice" || mine[0]["role"] != "editor" {
		t.Fatalf("bob's invitations = %v", mine)
	}
	resp, out = se.bob.do("GET", "/api/v1/notifications", nil)
	se.bob.mustStatus(resp, 200, out)
	ns := out["notifications"].([]any)
	if len(ns) != 1 || out["unread"].(float64) != 1 {
		t.Fatalf("bob's notifications = %v", out)
	}
	n := ns[0].(map[string]any)
	if pl := n["payload"].(map[string]any); n["kind"] != "member_invitation" || pl["invitationId"] != mine[0]["id"] || pl["target"] != "project" || pl["targetName"] != "Home" {
		t.Fatalf("notification = %v", n)
	}
	// Nothing synced to bob yet.
	if ms := syncOnce(se.bob, "bob-phone", 0, nil)["memberships"]; ms != nil && len(ms.([]any)) != 0 {
		t.Fatalf("bob's memberships before accepting = %v", ms)
	}
	// Carol cannot answer bob's invitation.
	id := mine[0]["id"].(string)
	for _, a := range []string{"accept", "decline"} {
		resp, out = se.carol.do("POST", "/api/v1/me/member-invitations/"+id+"/"+a, nil)
		if resp.StatusCode != 404 || errCode(out) != "not_found" {
			t.Fatalf("carol %s = %d %v", a, resp.StatusCode, out)
		}
	}
	// Accept: bob is an editor, the project syncs to him, the notification is read.
	resp, out = se.bob.do("POST", "/api/v1/me/member-invitations/"+id+"/accept", nil)
	se.bob.mustStatus(resp, 200, out)
	if out["kind"] != "project" || out["targetId"] != se.project || out["role"] != "editor" {
		t.Fatalf("accept = %v", out)
	}
	resp, out = se.alice.do("GET", p+"/members", nil)
	se.alice.mustStatus(resp, 200, out)
	if !slices.Contains(memberIDs(out), se.ids["bob"]) || len(pendingOf(t, out)) != 0 {
		t.Fatalf("after accept = %v", out)
	}
	got := syncOnce(se.bob, "bob-phone", 0, nil)
	if ms := got["memberships"].([]any); len(ms) != 1 || ms[0].(map[string]any)["role"] != "editor" {
		t.Fatalf("bob's memberships = %v", got["memberships"])
	}
	resp, out = se.bob.do("GET", "/api/v1/notifications", nil)
	se.bob.mustStatus(resp, 200, out)
	if out["unread"].(float64) != 0 {
		t.Fatalf("the invitation stays unread: %v", out)
	}
	resp, out = se.bob.do("POST", "/api/v1/me/member-invitations/"+id+"/accept", nil)
	if resp.StatusCode != 404 {
		t.Fatalf("second accept = %d %v", resp.StatusCode, out)
	}
	// Audit: created and accepted, and the add recorded with alice as actor.
	for _, c := range []struct{ name, actor, target string }{
		{"member_invitation.created", se.ids["alice"], se.ids["bob"]},
		{"member_invitation.accepted", se.ids["bob"], se.ids["alice"]},
		{"project.member_added", se.ids["alice"], se.ids["bob"]},
	} {
		if n := auditCount(se.alice, c.name, c.actor, c.target); n != 1 {
			t.Fatalf("%s events = %d", c.name, n)
		}
	}
	var leaked int
	_ = se.alice.db.QueryRow(`SELECT COUNT(*) FROM audit_events WHERE name LIKE 'member_invitation.%' AND (details LIKE '%@%' OR details LIKE '%Home%')`).Scan(&leaked)
	if leaked != 0 {
		t.Fatal("an invitation event carries an address or a name")
	}

	// Now acquainted: a second project shares with bob at once.
	resp, out = se.alice.do("POST", "/api/v1/projects", map[string]any{"name": "Garden"})
	se.alice.mustStatus(resp, 201, out)
	resp, out = se.alice.do("POST", "/api/v1/projects/"+out["id"].(string)+"/members", map[string]any{"email": "bob@example.com", "role": "viewer"})
	se.alice.mustStatus(resp, 201, out)
	if len(memberIDs(out)) != 2 {
		t.Fatalf("co-member add = %v", out)
	}
}

// D2: an address without an account gets the same answer and the same kind
// of pending row; nobody is notified.
func TestAddMemberSameAnswerForUnknown(t *testing.T) {
	se := newShareEnv(t)
	p := "/api/v1/projects/" + se.project
	answers := map[string]map[string]any{}
	for _, email := range []string{"carol@example.com", "nobody@example.com"} {
		resp, out := se.alice.do("POST", p+"/members", map[string]any{"email": email, "role": "viewer"})
		se.alice.mustStatus(resp, 202, out)
		answers[email] = out
	}
	if len(answers["carol@example.com"]) != len(answers["nobody@example.com"]) {
		t.Fatalf("answers differ: %v", answers)
	}
	resp, out := se.alice.do("GET", p+"/members", nil)
	se.alice.mustStatus(resp, 200, out)
	pending := pendingOf(t, out)
	if len(pending) != 2 {
		t.Fatalf("pending = %v", pending)
	}
	keys := func(m map[string]any) string {
		var k []string
		for x := range m {
			k = append(k, x)
		}
		slices.Sort(k)
		return strings.Join(k, ",")
	}
	if keys(pending[0]) != keys(pending[1]) {
		t.Fatalf("rows differ in shape: %v", pending)
	}
	if n := auditCount(se.alice, "member_invitation.created", se.ids["alice"], ""); n != 1 {
		t.Fatalf("placeholder created events = %d", n)
	}
	var notified int
	_ = se.alice.db.QueryRow(`SELECT COUNT(*) FROM notifications WHERE kind = 'member_invitation'`).Scan(&notified)
	if notified != 1 {
		t.Fatalf("notifications = %d, want carol's only", notified)
	}
	// Not an address: 400, as for anyone.
	resp, out = se.alice.do("POST", p+"/members", map[string]any{"email": "Carol <carol@example.com>", "role": "viewer"})
	if resp.StatusCode != 400 || errCode(out) != "invalid_input" {
		t.Fatalf("named address = %d %v", resp.StatusCode, out)
	}
	// An editor and a non-member still learn nothing.
	resp, out = se.carol.do("POST", p+"/members", map[string]any{"email": "nobody@example.com", "role": "viewer"})
	if resp.StatusCode != 404 {
		t.Fatalf("non-member = %d %v", resp.StatusCode, out)
	}
}

func TestMemberInvitationDeclineCancelStale(t *testing.T) {
	se := newShareEnv(t)
	p := "/api/v1/projects/" + se.project
	se.share(se.alice, "bob@example.com", "admin")
	// Decline: no membership; asking again changes nothing for 14 days.
	resp, out := se.alice.do("POST", p+"/members", map[string]any{"email": "carol@example.com", "role": "viewer"})
	se.alice.mustStatus(resp, 202, out)
	id := myInvitations(se.carol)[0]["id"].(string)
	resp, out = se.carol.do("POST", "/api/v1/me/member-invitations/"+id+"/decline", nil)
	se.carol.mustStatus(resp, 204, out)
	resp, out = se.alice.do("POST", p+"/members", map[string]any{"email": "carol@example.com", "role": "viewer"})
	se.alice.mustStatus(resp, 202, out)
	if len(myInvitations(se.carol)) != 0 {
		t.Fatal("asked again after declining")
	}
	resp, out = se.alice.do("GET", p+"/members", nil)
	se.alice.mustStatus(resp, 200, out)
	if len(pendingOf(t, out)) != 0 || len(memberIDs(out)) != 2 {
		t.Fatalf("after decline = %v", out)
	}
	var unread int
	_ = se.alice.db.QueryRow(`SELECT COUNT(*) FROM notifications WHERE kind = 'member_invitation' AND read_at IS NULL AND user_id = ?`, se.ids["carol"]).Scan(&unread)
	if unread != 0 {
		t.Fatal("the declined invitation's notification is unread")
	}
	if n := auditCount(se.alice, "member_invitation.declined", se.ids["carol"], se.ids["alice"]); n != 1 {
		t.Fatalf("declined events = %d", n)
	}

	// Cancel: an editor cannot, the admin can; the invitee's notification is read.
	resp, out = se.bob.do("POST", p+"/members", map[string]any{"email": "dan@example.com", "role": "editor"})
	se.bob.mustStatus(resp, 202, out)
	resp, out = se.alice.do("GET", p+"/members", nil)
	se.alice.mustStatus(resp, 200, out)
	invID := pendingOf(t, out)[0]["id"].(string)
	resp, out = se.alice.do("PATCH", p+"/members/"+se.ids["bob"], map[string]any{"role": "editor"})
	se.alice.mustStatus(resp, 200, out)
	resp, out = se.bob.do("DELETE", p+"/member-invitations/"+invID, nil)
	if resp.StatusCode != 403 || errCode(out) != "forbidden" {
		t.Fatalf("editor cancels = %d %v", resp.StatusCode, out)
	}
	resp, out = se.bob.do("GET", p+"/members", nil)
	se.bob.mustStatus(resp, 200, out)
	if _, has := out["pending"]; has {
		t.Fatalf("an editor sees pending invitations: %v", out)
	}
	resp, out = se.alice.do("DELETE", p+"/member-invitations/"+invID, nil)
	se.alice.mustStatus(resp, 204, out)
	resp, out = se.alice.do("DELETE", p+"/member-invitations/"+invID, nil)
	if resp.StatusCode != 404 {
		t.Fatalf("second cancel = %d %v", resp.StatusCode, out)
	}

	// Stale: bob, an admin of a second project, invites carol there and then
	// loses the right to grant the role.
	resp, out = se.alice.do("PATCH", p+"/members/"+se.ids["bob"], map[string]any{"role": "admin"})
	se.alice.mustStatus(resp, 200, out)
	resp, out = se.alice.do("POST", "/api/v1/projects", map[string]any{"name": "Garden"})
	se.alice.mustStatus(resp, 201, out)
	garden := "/api/v1/projects/" + out["id"].(string)
	resp, out = se.alice.do("POST", garden+"/members", map[string]any{"email": "bob@example.com", "role": "admin"})
	se.alice.mustStatus(resp, 201, out)
	resp, out = se.bob.do("POST", garden+"/members", map[string]any{"email": "carol@example.com", "role": "editor"})
	se.bob.mustStatus(resp, 202, out)
	resp, out = se.alice.do("PATCH", garden+"/members/"+se.ids["bob"], map[string]any{"role": "viewer"})
	se.alice.mustStatus(resp, 200, out)
	mine := myInvitations(se.carol)
	if len(mine) != 1 {
		t.Fatalf("carol's invitations = %v", mine)
	}
	resp, out = se.carol.do("POST", "/api/v1/me/member-invitations/"+mine[0]["id"].(string)+"/accept", nil)
	if resp.StatusCode != 410 || errCode(out) != "invitation_stale" {
		t.Fatalf("stale accept = %d %v", resp.StatusCode, out)
	}
	resp, out = se.alice.do("GET", garden+"/members", nil)
	se.alice.mustStatus(resp, 200, out)
	if slices.Contains(memberIDs(out), se.ids["carol"]) || len(myInvitations(se.carol)) != 0 {
		t.Fatalf("after a stale accept = %v", out)
	}
}

func TestMemberInvitationRoutesAuth(t *testing.T) {
	se := newShareEnv(t)
	anon := newClientFor(se.alice)
	routes := [][2]string{
		{"GET", "/api/v1/me/member-invitations"}, {"POST", "/api/v1/me/member-invitations/x/accept"}, {"POST", "/api/v1/me/member-invitations/x/decline"},
		{"DELETE", "/api/v1/projects/" + se.project + "/member-invitations/x"},
	}
	for _, rt := range routes {
		resp, out := anon.do(rt[0], rt[1], nil)
		if resp.StatusCode != 401 || errCode(out) != "unauthorized" {
			t.Fatalf("anonymous %s %s = %d %v", rt[0], rt[1], resp.StatusCode, out)
		}
	}
	read := se.bob.token("read")
	c := se.bob.bearerClient()
	for _, rt := range routes[:3] {
		resp, out := c.do(rt[0], rt[1], nil, bearer(read)...)
		if resp.StatusCode != 403 || errCode(out) != "insufficient_scope" {
			t.Fatalf("read token %s %s = %d %v", rt[0], rt[1], resp.StatusCode, out)
		}
	}
	// A non-member cannot cancel (the project's existence stays hidden).
	resp, out := se.carol.do("DELETE", "/api/v1/projects/"+se.project+"/member-invitations/x", nil)
	if resp.StatusCode != 404 {
		t.Fatalf("non-member cancel = %d %v", resp.StatusCode, out)
	}
}

// Workspaces follow the same rule (workspaces "Add a stranger by email").
func TestWorkspaceAddAsksStrangers(t *testing.T) {
	se := newShareEnv(t)
	ws := createWorkspace(se.alice, "Family")
	path := "/api/v1/workspaces/" + ws
	resp, out := se.alice.do("POST", path+"/members", map[string]any{"email": "bob@example.com", "role": "member"})
	se.alice.mustStatus(resp, 202, out)
	resp, out = se.alice.do("GET", path, nil)
	se.alice.mustStatus(resp, 200, out)
	if len(out["members"].([]any)) != 1 || len(pendingOf(t, out)) != 1 {
		t.Fatalf("workspace before accepting = %v", out)
	}
	resp, out = se.alice.do("GET", path+"/members", nil)
	se.alice.mustStatus(resp, 200, out)
	if len(pendingOf(t, out)) != 1 {
		t.Fatalf("members route = %v", out)
	}
	mine := myInvitations(se.bob)
	if len(mine) != 1 || mine[0]["kind"] != "workspace" || mine[0]["targetName"] != "Family" {
		t.Fatalf("bob's invitations = %v", mine)
	}
	resp, out = se.bob.do("POST", "/api/v1/me/member-invitations/"+mine[0]["id"].(string)+"/accept", nil)
	se.bob.mustStatus(resp, 200, out)
	resp, out = se.bob.do("GET", path, nil)
	se.bob.mustStatus(resp, 200, out)
	if out["role"] != "member" {
		t.Fatalf("bob's workspace = %v", out)
	}
	if _, has := out["pending"]; has {
		t.Fatalf("a plain member sees pending invitations: %v", out)
	}
	// Bob now shares Family with alice: her project adds him at once.
	resp, out = se.alice.do("POST", "/api/v1/projects/"+se.project+"/members", map[string]any{"email": "bob@example.com", "role": "editor"})
	se.alice.mustStatus(resp, 201, out)
	// An unknown address gets the same answer; cancel works for the workspace.
	resp, out = se.alice.do("POST", path+"/members", map[string]any{"email": "nobody@example.com"})
	se.alice.mustStatus(resp, 202, out)
	resp, out = se.alice.do("GET", path, nil)
	se.alice.mustStatus(resp, 200, out)
	pending := pendingOf(t, out)
	if len(pending) != 1 {
		t.Fatalf("pending = %v", pending)
	}
	resp, out = se.alice.do("DELETE", path+"/member-invitations/"+pending[0]["id"].(string), nil)
	se.alice.mustStatus(resp, 204, out)
	// In a project of the created workspace, an outsider's address answers
	// 409 whether or not it has an account.
	resp, out = se.alice.do("PATCH", "/api/v1/projects/"+se.project, map[string]any{"workspace_id": ws})
	se.alice.mustStatus(resp, 200, out)
	for _, email := range []string{"carol@example.com", "nobody@example.com"} {
		resp, out = se.alice.do("POST", "/api/v1/projects/"+se.project+"/members", map[string]any{"email": email, "role": "viewer"})
		if resp.StatusCode != 409 || errCode(out) != "not_in_workspace" {
			t.Fatalf("outsider %s = %d %v", email, resp.StatusCode, out)
		}
	}
}

// D5: with outgoing email on, the invitee gets a message after the answer
// that names the inviter and the role but never the project.
func TestMemberInvitationEmail(t *testing.T) {
	e, srv := mailEnv(t, false)
	e.configureMail(srv)
	e.member("dan@example.com", "10.4.0.2")
	pid := e.newProject(map[string]any{"name": "Secret garden"})
	before := len(srv.Messages())
	resp, out := e.do("POST", "/api/v1/projects/"+pid+"/members", map[string]any{"email": "dan@example.com", "role": "editor"})
	e.mustStatus(resp, 202, out)
	resp, out = e.do("POST", "/api/v1/projects/"+pid+"/members", map[string]any{"email": "nobody@example.com", "role": "editor"})
	e.mustStatus(resp, 202, out)
	e.server.background.Wait()
	msgs := srv.Messages()[before:]
	if len(msgs) != 1 || msgs[0].To[0] != "dan@example.com" {
		t.Fatalf("messages = %+v", msgs)
	}
	body := mailBody(t, msgs[0])
	if !strings.Contains(body, testBaseURL+"/settings/account/invitations") || !strings.Contains(body, "Owner") || !strings.Contains(body, "editor") ||
		strings.Contains(body, "Secret garden") {
		t.Fatalf("body = %q", body)
	}
}
