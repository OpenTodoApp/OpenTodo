package httpapi

import (
	"net/http"
	"strings"
	"testing"
	"time"
)

// ownerEnv returns an environment with sign-up closed and the owner signed in.
func ownerEnv(t *testing.T) *env {
	t.Helper()
	e := newEnv(t, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	return e
}

// invite creates an invitation as the owner and returns its id and secret.
func (e *env) invite(body map[string]any) (string, string, map[string]any) {
	e.t.Helper()
	resp, out := e.do("POST", "/api/v1/invitations", body)
	e.mustStatus(resp, 201, out)
	link := out["link"].(string)
	i := strings.LastIndex(link, "/invite/")
	if i < 0 {
		e.t.Fatalf("link = %q", link)
	}
	inv := out["invitation"].(map[string]any)
	return inv["id"].(string), link[i+len("/invite/"):], inv
}

func errCode(out map[string]any) string {
	errObj, _ := out["error"].(map[string]any)
	code, _ := errObj["code"].(string)
	return code
}

func TestInvitationRoutesRequireOwner(t *testing.T) {
	e := ownerEnv(t)

	// Anonymous: 401 on every management route.
	anon := newClientFor(e)
	resp, out := anon.do("GET", "/api/v1/invitations", nil)
	anon.mustStatus(resp, 401, out)
	resp, out = anon.do("POST", "/api/v1/invitations", map[string]any{})
	anon.mustStatus(resp, 401, out)
	resp, out = anon.do("DELETE", "/api/v1/invitations/some-id", nil)
	anon.mustStatus(resp, 401, out)

	// Owner: 201 create, 200 list, 204 revoke.
	id, secret, inv := e.invite(map[string]any{})
	if !strings.HasPrefix(secret, "oti_") || inv["status"] != "pending" || inv["email"] != nil {
		t.Fatalf("created = %v secret=%q", inv, secret)
	}
	resp, out = e.do("GET", "/api/v1/invitations", nil)
	e.mustStatus(resp, 200, out)
	list := out["invitations"].([]any)
	if len(list) != 1 {
		t.Fatalf("list = %v", list)
	}
	for k := range list[0].(map[string]any) {
		if k == "link" || k == "secret" || k == "token" || k == "tokenHash" {
			t.Fatalf("list leaks %q", k)
		}
	}

	// A member is admitted through a second invitation, then refused on every route.
	_, memberSecret, _ := e.invite(map[string]any{})
	member := newClientFor(e)
	resp, out = member.do("POST", "/api/v1/auth/register", map[string]string{"email": "m@example.com", "password": "another long password", "invitation": memberSecret})
	member.mustStatus(resp, 201, out)
	if out["user"].(map[string]any)["role"] != "member" {
		t.Fatalf("invited user = %v", out)
	}
	resp, out = member.do("GET", "/api/v1/invitations", nil)
	member.mustStatus(resp, 403, out)
	resp, out = member.do("POST", "/api/v1/invitations", map[string]any{})
	member.mustStatus(resp, 403, out)
	if errCode(out) != "forbidden" {
		t.Fatalf("code = %s", errCode(out))
	}
	resp, out = member.do("DELETE", "/api/v1/invitations/"+id, nil)
	member.mustStatus(resp, 403, out)

	// Nothing changed: the owner can still revoke the pending one.
	resp, out = e.do("DELETE", "/api/v1/invitations/"+id, nil)
	e.mustStatus(resp, 204, out)
	resp, out = e.do("GET", "/api/v1/invitations", nil)
	e.mustStatus(resp, 200, out)
	if n := len(out["invitations"].([]any)); n != 2 {
		t.Fatalf("members must not have created invitations, list = %d", n)
	}
	resp, out = e.do("DELETE", "/api/v1/invitations/does-not-exist", nil)
	e.mustStatus(resp, 404, out)
}

func TestInvitationPreviewAndAccept(t *testing.T) {
	e := ownerEnv(t)
	id, secret, inv := e.invite(map[string]any{"email": "Friend@Example.com", "expiresInHours": 48})
	if inv["email"] != "friend@example.com" {
		t.Fatalf("bound email = %v", inv["email"])
	}
	if got := inv["expiresAt"].(float64) - inv["createdAt"].(float64); got != float64(48*time.Hour.Milliseconds()) {
		t.Fatalf("expiry window = %v ms", got)
	}

	// Preview is public and reveals only inviter, email and expiry.
	anon := newClientAt(e, "10.0.0.2")
	resp, out := anon.do("GET", "/api/v1/invitations/"+secret, nil)
	anon.mustStatus(resp, 200, out)
	if out["inviterName"] != "Owner" || out["email"] != "friend@example.com" || out["expiresAt"] != inv["expiresAt"] {
		t.Fatalf("preview = %v", out)
	}
	if _, has := out["id"]; has {
		t.Fatalf("preview leaks the id: %v", out)
	}
	resp, out = anon.do("GET", "/api/v1/invitations/oti_unknown", nil)
	anon.mustStatus(resp, 404, out)
	if errCode(out) != "invitation_invalid" {
		t.Fatalf("code = %s", errCode(out))
	}

	// Sign-up is closed without an invitation.
	resp, out = anon.do("POST", "/api/v1/auth/register", map[string]string{"email": "friend@example.com", "password": "another long password"})
	anon.mustStatus(resp, 403, out)
	if errCode(out) != "signup_closed" {
		t.Fatalf("code = %s", errCode(out))
	}

	// Email binding is enforced and the invitation stays pending.
	resp, out = anon.do("POST", "/api/v1/auth/register", map[string]string{"email": "other@example.com", "password": "another long password", "invitation": secret})
	anon.mustStatus(resp, 403, out)
	if errCode(out) != "invitation_email_mismatch" {
		t.Fatalf("code = %s", errCode(out))
	}

	// Taken email leaves the invitation pending too (an open invitation, so the
	// binding does not get in the way).
	_, openSecret, openInv := e.invite(map[string]any{})
	resp, out = anon.do("POST", "/api/v1/auth/register", map[string]string{"email": "OWNER@example.com", "password": "another long password", "invitation": openSecret})
	anon.mustStatus(resp, 409, out)
	if errCode(out) != "email_taken" {
		t.Fatalf("code = %s", errCode(out))
	}
	resp, out = e.do("GET", "/api/v1/invitations", nil)
	e.mustStatus(resp, 200, out)
	for _, raw := range out["invitations"].([]any) {
		if raw.(map[string]any)["status"] != "pending" {
			t.Fatalf("expected both pending, got %v", raw)
		}
	}

	// Accept: member account, session cookie, status accepted with the account.
	resp, out = anon.do("POST", "/api/v1/auth/register", map[string]string{"email": "FRIEND@example.com", "name": "Friend", "password": "another long password", "invitation": secret})
	anon.mustStatus(resp, 201, out)
	user := out["user"].(map[string]any)
	if user["role"] != "member" || user["email"] != "friend@example.com" {
		t.Fatalf("accepted user = %v", user)
	}
	resp, out = anon.do("GET", "/api/v1/me", nil)
	anon.mustStatus(resp, 200, out)

	resp, out = e.do("GET", "/api/v1/invitations", nil)
	e.mustStatus(resp, 200, out)
	var accepted map[string]any
	for _, raw := range out["invitations"].([]any) {
		if m := raw.(map[string]any); m["id"] == id {
			accepted = m
		}
	}
	if accepted["status"] != "accepted" || accepted["acceptedBy"] == nil || accepted["acceptedBy"].(map[string]any)["id"] != user["id"] {
		t.Fatalf("accepted entry = %v", accepted)
	}

	// Single use: second registration and preview are refused; revoke is 409.
	again := newClientAt(e, "10.0.0.3")
	resp, out = again.do("POST", "/api/v1/auth/register", map[string]string{"email": "third@example.com", "password": "another long password", "invitation": secret})
	again.mustStatus(resp, 404, out)
	if errCode(out) != "invitation_invalid" {
		t.Fatalf("code = %s", errCode(out))
	}
	resp, out = again.do("GET", "/api/v1/invitations/"+secret, nil)
	again.mustStatus(resp, 404, out)
	resp, out = e.do("DELETE", "/api/v1/invitations/"+id, nil)
	e.mustStatus(resp, 409, out)
	if errCode(out) != "invitation_spent" {
		t.Fatalf("code = %s", errCode(out))
	}

	// Revoked: delete 204, then preview and accept are refused.
	resp, out = e.do("DELETE", "/api/v1/invitations/"+openInv["id"].(string), nil)
	e.mustStatus(resp, 204, out)
	resp, out = again.do("GET", "/api/v1/invitations/"+openSecret, nil)
	again.mustStatus(resp, 404, out)
	resp, out = again.do("POST", "/api/v1/auth/register", map[string]string{"email": "third@example.com", "password": "another long password", "invitation": openSecret})
	again.mustStatus(resp, 404, out)

	// Expired: backdate the row, then preview and accept are refused and the list says so.
	expID, expSecret, _ := e.invite(map[string]any{})
	if _, err := e.db.Exec("UPDATE invitations SET expires_at = ? WHERE id = ?", time.Now().Add(-time.Minute).UnixMilli(), expID); err != nil {
		t.Fatal(err)
	}
	resp, out = again.do("GET", "/api/v1/invitations/"+expSecret, nil)
	again.mustStatus(resp, 404, out)
	resp, out = again.do("POST", "/api/v1/auth/register", map[string]string{"email": "third@example.com", "password": "another long password", "invitation": expSecret})
	again.mustStatus(resp, 404, out)
	resp, out = e.do("GET", "/api/v1/invitations", nil)
	e.mustStatus(resp, 200, out)
	statuses := map[string]string{}
	for _, raw := range out["invitations"].([]any) {
		m := raw.(map[string]any)
		statuses[m["id"].(string)] = m["status"].(string)
	}
	if statuses[expID] != "expired" || statuses[openInv["id"].(string)] != "revoked" || statuses[id] != "accepted" {
		t.Fatalf("statuses = %v", statuses)
	}

	// Exactly one member was admitted.
	resp, out = anon.do("GET", "/api/v1/auth/status", nil)
	if out["signupAllowed"] != false {
		t.Fatalf("sign-up must stay closed: %v", out)
	}
}

func TestInvitationLinkUsesRequestOrigin(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/invitations", map[string]any{})
	e.mustStatus(resp, 201, out)
	if link := out["link"].(string); !strings.HasPrefix(link, e.srv.URL+"/invite/oti_") {
		t.Fatalf("link = %q, want prefix %s/invite/oti_", link, e.srv.URL)
	}
	resp, out = e.do("POST", "/api/v1/invitations", map[string]any{}, "X-Forwarded-Host", "todo.example.com", "X-Forwarded-Proto", "https")
	e.mustStatus(resp, 201, out)
	if link := out["link"].(string); !strings.HasPrefix(link, "https://todo.example.com/invite/oti_") {
		t.Fatalf("proxied link = %q", link)
	}
}

func TestInvitationPreviewRateLimited(t *testing.T) {
	e := ownerEnv(t)
	anon := newClientFor(e)
	var last int
	for i := 0; i < 12; i++ {
		resp, _ := anon.do("GET", "/api/v1/invitations/oti_guess", nil)
		last = resp.StatusCode
	}
	if last != http.StatusTooManyRequests {
		t.Fatalf("expected 429 after repeated previews, got %d", last)
	}
	// Acceptance shares the same per-IP window through the register route.
	resp, out := anon.do("POST", "/api/v1/auth/register", map[string]string{"email": "x@example.com", "password": "another long password", "invitation": "oti_guess"})
	anon.mustStatus(resp, 429, out)
	if errCode(out) != "rate_limited" {
		t.Fatalf("code = %s", errCode(out))
	}
}

func TestInvitationCreationRateLimit(t *testing.T) {
	e := ownerEnv(t)
	for i := 0; i < 20; i++ {
		resp, out := e.do("POST", "/api/v1/invitations", map[string]any{})
		e.mustStatus(resp, 201, out)
	}
	resp, out := e.do("POST", "/api/v1/invitations", map[string]any{})
	e.mustStatus(resp, 429, out)
	if errCode(out) != "rate_limited" {
		t.Fatalf("code = %s", errCode(out))
	}
	// Listing and revoking are not limited.
	resp, out = e.do("GET", "/api/v1/invitations", nil)
	e.mustStatus(resp, 200, out)
	if n := len(out["invitations"].([]any)); n != 20 {
		t.Fatalf("list = %d", n)
	}
}

func TestInvitationInvalidInput(t *testing.T) {
	e := ownerEnv(t)
	cases := []map[string]any{
		{"expiresInHours": 0},
		{"expiresInHours": 721},
		{"expiresInHours": 1.5},
		{"expiresInHours": -3},
		{"email": "not an address"},
		{"email": "also@bad@example.com"},
	}
	for _, body := range cases {
		resp, out := e.do("POST", "/api/v1/invitations", body)
		e.mustStatus(resp, 400, out)
		if errCode(out) != "invalid_input" {
			t.Fatalf("%v: code = %s", body, errCode(out))
		}
	}
	resp, out := e.do("POST", "/api/v1/invitations", map[string]any{"expiresInHours": "soon"})
	e.mustStatus(resp, 400, out)
	resp, out = e.do("GET", "/api/v1/invitations", nil)
	e.mustStatus(resp, 200, out)
	if n := len(out["invitations"].([]any)); n != 0 {
		t.Fatalf("invalid requests must not create invitations, list = %d", n)
	}
	// Boundaries are accepted.
	for _, h := range []int{1, 720} {
		resp, out := e.do("POST", "/api/v1/invitations", map[string]any{"expiresInHours": h})
		e.mustStatus(resp, 201, out)
	}
}
