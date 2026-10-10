package httpapi

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

// joinAs registers an account through an invitation from e (the owner or an
// admin) and returns its client (own address, so rate limits stay apart) and id.
func (e *env) joinAs(email string) (*env, string) {
	e.t.Helper()
	_, secret, _ := e.invite(map[string]any{})
	c := newClientAt(e, "ip-"+email)
	resp, out := c.do("POST", "/api/v1/auth/register", map[string]string{"email": email, "name": strings.Split(email, "@")[0], "password": "correct horse battery", "invitation": secret})
	c.mustStatus(resp, 201, out)
	return c, out["user"].(map[string]any)["id"].(string)
}

func (e *env) ownerID() string {
	e.t.Helper()
	resp, out := e.do("GET", "/api/v1/me", nil)
	e.mustStatus(resp, 200, out)
	return out["user"].(map[string]any)["id"].(string)
}

func (e *env) userEntry(id string) map[string]any {
	e.t.Helper()
	resp, out := e.do("GET", "/api/v1/users", nil)
	e.mustStatus(resp, 200, out)
	for _, u := range out["users"].([]any) {
		if m := u.(map[string]any); m["id"] == id {
			return m
		}
	}
	return nil
}

func (e *env) expect(method, path string, body any, status int, code string) map[string]any {
	e.t.Helper()
	resp, out := e.do(method, path, body)
	if resp.StatusCode != status || (code != "" && errCode(out) != code) {
		e.t.Fatalf("%s %s: %d %v, want %d %s", method, path, resp.StatusCode, out, status, code)
	}
	return out
}

func TestUserAdminRoutes(t *testing.T) {
	e := ownerEnv(t)
	owner := e.ownerID()
	admin, adminID := e.joinAs("admin@example.com")
	member, memberID := e.joinAs("member@example.com")
	_, admin2ID := e.joinAs("admin2@example.com")
	e.expect("PUT", "/api/v1/users/"+adminID+"/role", map[string]string{"role": "admin"}, 200, "")
	e.expect("PUT", "/api/v1/users/"+admin2ID+"/role", map[string]string{"role": "admin"}, 200, "")
	anon := newClientAt(e, "10.9.9.9")

	type route struct {
		method, path string
		body         map[string]any
		okStatus     int
	}
	routes := func(id string) []route {
		return []route{
			{"PUT", "/api/v1/users/" + id + "/role", map[string]any{"role": "member"}, 200},
			{"POST", "/api/v1/users/" + id + "/deactivate", nil, 200},
			{"POST", "/api/v1/users/" + id + "/reactivate", nil, 200},
			{"POST", "/api/v1/users/" + id + "/password-reset", map[string]any{}, 201},
			{"POST", "/api/v1/users/" + id + "/transfer-ownership", map[string]any{"password": "correct horse battery"}, 200},
			{"DELETE", "/api/v1/users/" + id, map[string]any{"confirmEmail": "x"}, 204},
		}
	}
	// Anonymous: 401 everywhere, including the list.
	anon.expect("GET", "/api/v1/users", nil, 401, "unauthorized")
	for _, r := range routes(memberID) {
		anon.expect(r.method, r.path, r.body, 401, "unauthorized")
	}
	// Member: 403 everywhere.
	member.expect("GET", "/api/v1/users", nil, 403, "forbidden")
	for _, r := range routes(adminID) {
		member.expect(r.method, r.path, r.body, 403, "forbidden")
	}
	// Admin on an admin and on the owner: 403.
	for _, target := range []string{admin2ID, owner} {
		for _, r := range routes(target) {
			admin.expect(r.method, r.path, r.body, 403, "forbidden")
		}
	}
	// Owner on self: 409 self_action.
	for _, r := range routes(owner) {
		e.expect(r.method, r.path, r.body, 409, "self_action")
	}
	// Unknown id: 404.
	for _, r := range routes("nope") {
		e.expect(r.method, r.path, r.body, 404, "not_found")
	}

	// Success cases. The list has no credentials.
	out := e.expect("GET", "/api/v1/users", nil, 200, "")
	for _, u := range out["users"].([]any) {
		for k := range u.(map[string]any) {
			if strings.Contains(k, "assword") || strings.Contains(k, "oken") || k == "secret" {
				t.Fatalf("list leaks %q", k)
			}
		}
	}
	admin.expect("GET", "/api/v1/users", nil, 200, "")
	// Admin manages a member.
	out = admin.expect("POST", "/api/v1/users/"+memberID+"/deactivate", nil, 200, "")
	if out["user"].(map[string]any)["status"] != "deactivated" {
		t.Fatalf("deactivate = %v", out)
	}
	admin.expect("POST", "/api/v1/users/"+memberID+"/deactivate", nil, 409, "account_deactivated")
	admin.expect("POST", "/api/v1/users/"+memberID+"/password-reset", map[string]any{}, 409, "account_deactivated")
	e.expect("PUT", "/api/v1/users/"+memberID+"/role", map[string]any{"role": "admin"}, 409, "account_deactivated")
	admin.expect("POST", "/api/v1/users/"+memberID+"/reactivate", nil, 200, "")
	admin.expect("POST", "/api/v1/users/"+memberID+"/reactivate", nil, 409, "account_active")
	out = admin.expect("POST", "/api/v1/users/"+memberID+"/password-reset", map[string]any{"expiresInHours": 2}, 201, "")
	if link, _ := out["link"].(string); !strings.Contains(link, "/reset/otr_") || out["expiresAt"] == nil {
		t.Fatalf("reset = %v", out)
	}
	admin.expect("POST", "/api/v1/users/"+memberID+"/password-reset", map[string]any{"expiresInHours": 73}, 400, "invalid_input")
	// Roles: owner value and unknown value refused; promote and demote.
	e.expect("PUT", "/api/v1/users/"+memberID+"/role", map[string]any{"role": "owner"}, 400, "invalid_input")
	e.expect("PUT", "/api/v1/users/"+memberID+"/role", map[string]any{"role": "root"}, 400, "invalid_input")
	admin.expect("PUT", "/api/v1/users/"+memberID+"/role", map[string]any{"role": "admin"}, 403, "forbidden")
	e.expect("PUT", "/api/v1/users/"+adminID+"/role", map[string]any{"role": "member"}, 200, "")
	admin.expect("GET", "/api/v1/users", nil, 403, "forbidden") // demotion takes effect at once
	e.expect("PUT", "/api/v1/users/"+adminID+"/role", map[string]any{"role": "admin"}, 200, "")
	// Deletion needs the email.
	e.expect("DELETE", "/api/v1/users/"+memberID, map[string]any{"confirmEmail": "wrong@example.com"}, 400, "confirmation_mismatch")
	e.expect("DELETE", "/api/v1/users/"+memberID, nil, 400, "confirmation_mismatch")
	e.expect("DELETE", "/api/v1/users/"+memberID, map[string]any{"confirmEmail": "MEMBER@example.com"}, 204, "")
	member.expect("GET", "/api/v1/me", nil, 401, "unauthorized")
	if e.userEntry(memberID) != nil {
		t.Fatal("deleted account still listed")
	}
	// Transfer: wrong password, then success.
	e.expect("POST", "/api/v1/users/"+adminID+"/transfer-ownership", map[string]any{"password": "nope nope nope"}, 403, "invalid_credentials")
	out = e.expect("POST", "/api/v1/users/"+adminID+"/transfer-ownership", map[string]any{"password": "correct horse battery"}, 200, "")
	if out["user"].(map[string]any)["role"] != "owner" {
		t.Fatalf("transfer = %v", out)
	}
	if got := admin.userEntry(owner); got["role"] != "admin" {
		t.Fatalf("previous owner = %v", got)
	}
	owners := 0
	resp, list := admin.do("GET", "/api/v1/users", nil)
	admin.mustStatus(resp, 200, list)
	for _, u := range list["users"].([]any) {
		if u.(map[string]any)["role"] == "owner" {
			owners++
		}
	}
	if owners != 1 {
		t.Fatalf("owners = %d", owners)
	}
	// The previous owner (now admin) cannot transfer again.
	e.expect("POST", "/api/v1/users/"+admin2ID+"/transfer-ownership", map[string]any{"password": "correct horse battery"}, 403, "forbidden")
}

func TestResetRoutesPublicAndUniform404(t *testing.T) {
	e := ownerEnv(t)
	member, memberID := e.joinAs("m@example.com")
	out := e.expect("POST", "/api/v1/users/"+memberID+"/password-reset", nil, 201, "")
	link := out["link"].(string)
	token := link[strings.LastIndex(link, "/")+1:]
	anon := newClientAt(e, "10.1.1.1")
	out = anon.expect("GET", "/api/v1/password-resets/"+token, nil, 200, "")
	if out["email"] != "m@example.com" || out["expiresAt"] == nil || len(out) != 2 {
		t.Fatalf("preview = %v", out)
	}
	anon.expect("POST", "/api/v1/password-resets/"+token, map[string]string{"password": "short"}, 400, "invalid_input")
	resp, o := anon.do("POST", "/api/v1/password-resets/"+token, map[string]string{"password": "a brand new password"}, "Origin", "https://evil.example")
	if resp.StatusCode != 403 || errCode(o) != "bad_origin" {
		t.Fatalf("cross-site = %d %v", resp.StatusCode, o)
	}
	anon.expect("POST", "/api/v1/password-resets/"+token, map[string]string{"password": "a brand new password"}, 204, "")
	member.expect("GET", "/api/v1/me", nil, 401, "unauthorized")
	// Used, unknown and revoked tokens all give the same 404.
	var shapes []string
	for _, tok := range []string{token, "otr_unknown"} {
		for _, m := range []string{"GET", "POST"} {
			o := anon.expect(m, "/api/v1/password-resets/"+tok, map[string]string{"password": "a brand new password"}, 404, "reset_invalid")
			shapes = append(shapes, fmt.Sprint(o))
		}
	}
	for _, s := range shapes {
		if s != shapes[0] {
			t.Fatalf("responses differ: %v", shapes)
		}
	}
	// Sign-in with the new password works; the old one does not.
	c := newClientAt(e, "10.1.1.2")
	c.expect("POST", "/api/v1/auth/login", map[string]string{"email": "m@example.com", "password": "correct horse battery"}, 401, "invalid_credentials")
	c.expect("POST", "/api/v1/auth/login", map[string]string{"email": "m@example.com", "password": "a brand new password"}, 200, "")
}

func TestResetRoutesRateLimited(t *testing.T) {
	e := ownerEnv(t)
	anon := newClientAt(e, "10.2.2.2")
	for i := 0; i < 10; i++ {
		anon.expect("GET", "/api/v1/password-resets/otr_guess", nil, 404, "reset_invalid")
	}
	anon.expect("POST", "/api/v1/password-resets/otr_guess", map[string]string{"password": "a brand new password"}, 429, "rate_limited")
	anon.expect("GET", "/api/v1/password-resets/otr_guess", nil, 429, "rate_limited")
}

func TestMePasswordRoute(t *testing.T) {
	e := ownerEnv(t)
	member, _ := e.joinAs("m@example.com")
	second := newClientAt(e, "10.3.3.3")
	second.expect("POST", "/api/v1/auth/login", map[string]string{"email": "m@example.com", "password": "correct horse battery"}, 200, "")
	newClientAt(e, "10.3.3.4").expect("POST", "/api/v1/me/password", map[string]string{"currentPassword": "x", "newPassword": "y"}, 401, "unauthorized")
	member.expect("POST", "/api/v1/me/password", map[string]string{"currentPassword": "wrong password!", "newPassword": "another long password"}, 403, "invalid_credentials")
	out := member.expect("POST", "/api/v1/me/password", map[string]string{"currentPassword": "correct horse battery", "newPassword": "short"}, 400, "invalid_input")
	if !strings.Contains(out["error"].(map[string]any)["message"].(string), "10") {
		t.Fatalf("message does not name the minimum: %v", out)
	}
	member.expect("POST", "/api/v1/me/password", map[string]string{"currentPassword": "correct horse battery", "newPassword": "another long password"}, 204, "")
	member.expect("GET", "/api/v1/me", nil, 200, "")
	second.expect("GET", "/api/v1/me", nil, 401, "unauthorized")
}

func TestAdminRateLimit(t *testing.T) {
	e := ownerEnv(t)
	_, memberID := e.joinAs("m@example.com")
	for i := 0; i < 60; i++ {
		e.expect("POST", "/api/v1/users/"+memberID+"/password-reset", nil, 201, "")
	}
	e.expect("POST", "/api/v1/users/"+memberID+"/deactivate", nil, 429, "rate_limited")
	if got := e.userEntry(memberID); got["status"] != "active" {
		t.Fatalf("changed despite the limit: %v", got)
	}
}

func TestPasswordChangeRateLimit(t *testing.T) {
	e := ownerEnv(t)
	for i := 0; i < 10; i++ {
		e.expect("POST", "/api/v1/me/password", map[string]string{"currentPassword": "wrong password!", "newPassword": "another long password"}, 403, "invalid_credentials")
	}
	e.expect("POST", "/api/v1/me/password", map[string]string{"currentPassword": "correct horse battery", "newPassword": "another long password"}, 429, "rate_limited")
}

func TestLoginDeactivatedRoute(t *testing.T) {
	e := ownerEnv(t)
	_, memberID := e.joinAs("m@example.com")
	e.expect("POST", "/api/v1/users/"+memberID+"/deactivate", nil, 200, "")
	c := newClientAt(e, "10.4.4.4")
	resp, out := c.do("POST", "/api/v1/auth/login", map[string]string{"email": "m@example.com", "password": "correct horse battery"})
	if resp.StatusCode != 403 || errCode(out) != "account_deactivated" {
		t.Fatalf("login = %d %v", resp.StatusCode, out)
	}
	for _, ck := range resp.Cookies() {
		if ck.Name == sessionCookie && ck.Value != "" {
			t.Fatal("session cookie set for a deactivated account")
		}
	}
	c.expect("POST", "/api/v1/auth/login", map[string]string{"email": "m@example.com", "password": "wrong password!"}, 401, "invalid_credentials")
	var n int
	if err := e.db.QueryRow("SELECT COUNT(*) FROM audit_events WHERE name = 'login.failed' AND details LIKE '%deactivated%'").Scan(&n); err != nil || n != 1 {
		t.Fatalf("login.failed deactivated events = %d (%v)", n, err)
	}
}

func TestDeactivationClosesEventStream(t *testing.T) {
	e := ownerEnv(t)
	member, memberID := e.joinAs("m@example.com")
	resp, out := member.do("POST", "/api/v1/tokens", map[string]string{"name": "script"})
	member.mustStatus(resp, 201, out)
	token := out["secret"].(string)
	st := member.connected("phone")
	e.expect("POST", "/api/v1/users/"+memberID+"/deactivate", nil, 200, "")
	if !st.closed(5 * time.Second) {
		t.Fatal("stream stayed open after deactivation")
	}
	if again := member.openStream(e.srv.URL, "/api/v1/sync/events?device=phone"); again.status != 401 {
		t.Fatalf("reconnect: %d", again.status)
	}
	anon := newClientAt(e, "10.5.5.5")
	resp, out = anon.do("GET", "/api/v1/me", nil, "Authorization", "Bearer "+token)
	if resp.StatusCode != 401 {
		t.Fatalf("token after deactivation: %d %v", resp.StatusCode, out)
	}
	resp, out = member.do("POST", "/api/v1/sync", map[string]any{"device": "phone", "cursor": 0, "ops": []any{}})
	if resp.StatusCode != 401 {
		t.Fatalf("sync after deactivation: %d %v", resp.StatusCode, out)
	}
}

// TestPasswordChangeRequiresFreshSession: the password change and every
// administrative action need a recent re-authentication for cookie sessions
// (mfa-totp section 8 carried over); bearer tokens are never challenged.
func TestPasswordChangeRequiresFreshSession(t *testing.T) {
	m := newMFAEnv(t)
	_, secret, _ := m.invite(map[string]any{})
	c := newClientAt(m.env, "10.6.6.6")
	resp, out := c.do("POST", "/api/v1/auth/register", map[string]string{"email": "m@example.com", "password": "correct horse battery", "invitation": secret})
	c.mustStatus(resp, 201, out)
	id := out["user"].(map[string]any)["id"].(string)
	resp, out = m.do("POST", "/api/v1/tokens", map[string]string{"name": "script"})
	m.mustStatus(resp, 201, out)
	token := out["secret"].(string)

	m.clock.advance(FreshWindow + time.Second)
	for _, r := range []struct {
		method, path string
		body         any
	}{
		{"POST", "/api/v1/me/password", map[string]string{"currentPassword": "correct horse battery", "newPassword": "another long password"}},
		{"PUT", "/api/v1/users/" + id + "/role", map[string]string{"role": "admin"}},
		{"POST", "/api/v1/users/" + id + "/deactivate", nil},
		{"POST", "/api/v1/users/" + id + "/reactivate", nil},
		{"POST", "/api/v1/users/" + id + "/password-reset", nil},
		{"POST", "/api/v1/users/" + id + "/transfer-ownership", map[string]string{"password": "correct horse battery"}},
		{"DELETE", "/api/v1/users/" + id, map[string]string{"confirmEmail": "m@example.com"}},
	} {
		m.expect(r.method, r.path, r.body, 403, "reauth_required")
	}
	// The read-only list is not a sensitive action.
	m.expect("GET", "/api/v1/users", nil, 200, "")
	// A bearer token is never challenged.
	anon := newClientAt(m.env, "10.6.6.7")
	resp, out = anon.do("POST", "/api/v1/users/"+id+"/deactivate", nil, "Authorization", "Bearer "+token)
	anon.mustStatus(resp, 200, out)
	// After re-authentication the request succeeds.
	m.expect("POST", "/api/v1/auth/reauth", map[string]string{"password": "correct horse battery"}, 200, "")
	m.expect("POST", "/api/v1/me/password", map[string]string{"currentPassword": "correct horse battery", "newPassword": "another long password"}, 204, "")
}
