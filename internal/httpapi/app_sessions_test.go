package httpapi

import (
	"context"
	"net/http/httptest"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/auth"
	"github.com/OpenTodoApp/opentodo/internal/httpapi/httpx"
)

// App sessions alongside other sessions (the account-access spec delta).

// appSessions lists the signed-in apps as the web app does.
func (e *env) appSessions() []map[string]any {
	e.t.Helper()
	resp, out := e.do("GET", appSessionsPath, nil)
	e.mustStatus(resp, 200, out)
	raw, _ := out["apps"].([]any)
	list := make([]map[string]any, 0, len(raw))
	for _, a := range raw {
		list = append(list, a.(map[string]any))
	}
	return list
}

// appRefused checks that every token of a signed-in app stopped working: the
// access token is refused with 401 and the refresh token with invalid_grant.
func (e *env) appRefused(name, access, refresh string) {
	e.t.Helper()
	if status, out := e.asApp(access, "GET", "/api/v1/me", nil); status != 401 {
		e.t.Fatalf("%s: the access token answered %d %v", name, status, out)
	}
	if status, out := e.appRefresh(refresh); status != 400 || errCode(out) != "invalid_grant" {
		e.t.Fatalf("%s: the refresh token answered %d %v", name, status, out)
	}
}

// Revoke from the web: the grant is listed as "OpenTodo app · iPhone" with its
// last use, and revoking it refuses the app's next request with 401.
func TestAppSessionsListAndRevoke(t *testing.T) {
	e := ownerEnv(t)
	access, refresh := e.appSignIn("iPhone")
	keepAccess, _ := e.appSignIn("iPad")
	list := e.appSessions()
	if len(list) != 2 {
		t.Fatalf("apps = %v", list)
	}
	var phone map[string]any
	for _, a := range list {
		if a["device"] == "iPhone" {
			phone = a
		}
	}
	if phone == nil || phone["lastUsedAt"].(float64) <= 0 || phone["id"] == "" {
		t.Fatalf("iPhone row = %v", phone)
	}
	// Another person cannot revoke it.
	m, _ := e.member("member@example.com", "198.51.100.9")
	if resp, out := m.do("DELETE", appSessionsPath+"/"+phone["id"].(string), nil); resp.StatusCode != 404 {
		t.Fatalf("another person's revoke: %d %v", resp.StatusCode, out)
	}
	resp, out := e.do("DELETE", appSessionsPath+"/"+phone["id"].(string), nil)
	e.mustStatus(resp, 204, out)
	e.appRefused("revoked", access, refresh)
	if status, _ := e.asApp(keepAccess, "GET", "/api/v1/me", nil); status != 200 {
		t.Fatalf("the other device was signed out too: %d", status)
	}
	if list := e.appSessions(); len(list) != 1 || list[0]["device"] != "iPad" {
		t.Fatalf("apps after revoke = %v", list)
	}
	resp, out = e.do("DELETE", appSessionsPath+"/"+phone["id"].(string), nil)
	e.mustStatus(resp, 404, out)
}

// Signing out in the app ends its own grant.
func TestAppSignOut(t *testing.T) {
	e := ownerEnv(t)
	access, refresh := e.appSignIn("iPhone")
	if status, out := e.asApp(access, "POST", appSignOutPath, nil); status != 204 {
		t.Fatalf("sign out: %d %v", status, out)
	}
	e.appRefused("signed out", access, refresh)
	if list := e.appSessions(); len(list) != 0 {
		t.Fatalf("apps = %v", list)
	}
	// Any other credential has no app grant to end.
	if status, out := e.asApp(e.token("full"), "POST", appSignOutPath, nil); status != 400 || errCode(out) != "invalid_request" {
		t.Fatalf("sign out with a full token: %d %v", status, out)
	}
}

// Sign out everywhere revokes the app's grant with the other sessions.
func TestAppSignOutEverywhere(t *testing.T) {
	e := ownerEnv(t)
	access, refresh := e.appSignIn("iPhone")
	resp, out := e.do("POST", "/api/v1/me/sign-out-everywhere", nil)
	e.mustStatus(resp, 204, out)
	e.appRefused("sign out everywhere", access, refresh)
}

// A password change ends the app's grant, like the other sessions.
func TestAppPasswordChange(t *testing.T) {
	e := ownerEnv(t)
	access, refresh := e.appSignIn("iPhone")
	resp, out := e.do("POST", "/api/v1/me/password", map[string]string{"currentPassword": "correct horse battery", "newPassword": "another long passphrase"})
	requireStatus(t, "password change", resp, 204, out)
	e.appRefused("password change", access, refresh)
}

// Deactivation ends a member's apps.
func TestAppDeactivation(t *testing.T) {
	e := ownerEnv(t)
	m, mid := e.member("member@example.com", "198.51.100.10")
	access, refresh := m.appSignIn("iPhone")
	resp, out := e.do("POST", "/api/v1/users/"+mid+"/deactivate", nil)
	e.mustStatus(resp, 200, out)
	m.appRefused("deactivated", access, refresh)
}

// Administration route with an app token: over the whole route table, an app
// token is admitted or refused exactly like a full token, and the credential
// and administration routes refuse both.
func TestAppScopeIsFullOverTheRouteTable(t *testing.T) {
	e := ownerEnv(t)
	resp, me := e.do("GET", "/api/v1/me", nil)
	e.mustStatus(resp, 200, me)
	u := &auth.User{ID: e.userID(), Role: auth.RoleOwner}
	checked, admin := 0, 0
	for _, entry := range e.server.routeTable {
		if entry.policy.Kind != httpx.KindAuth {
			continue
		}
		answer := func(scope string) (int, string) {
			ctx := httpx.WithUser(context.Background(), u, auth.TokenInfo{ID: "t", Scope: scope})
			r := httptest.NewRequest("GET", "/", nil).WithContext(ctx)
			w := httptest.NewRecorder()
			e.server.admits(w, r, entry.policy)
			return w.Code, w.Body.String()
		}
		fullCode, fullBody := answer(auth.ScopeFull)
		appCode, appBody := answer(auth.ScopeApp)
		if fullCode != appCode || fullBody != appBody {
			t.Errorf("%s: an app token gets %d %s, a full token %d %s", entry.pattern, appCode, appBody, fullCode, fullBody)
		}
		if entry.policy.Tokens == httpx.TokensAdmin {
			admin++
			if appCode != 403 {
				t.Errorf("%s: a credential route admitted an app token", entry.pattern)
			}
		}
		checked++
	}
	if checked < 150 || admin < 10 {
		t.Fatalf("checked %d routes, %d credential routes", checked, admin)
	}
	// End to end: the write check and two credential routes.
	access, _ := e.appSignIn("iPhone")
	full := e.token("full")
	for _, req := range []struct {
		method, path string
		body         any
	}{
		{"POST", "/api/v1/tokens", map[string]any{"name": "x"}},
		{"POST", "/api/v1/me/password", map[string]string{"currentPassword": "correct horse battery", "newPassword": "another long passphrase"}},
	} {
		fs, fo := e.asApp(full, req.method, req.path, req.body)
		as, ao := e.asApp(access, req.method, req.path, req.body)
		if as != 403 || as != fs || errCode(ao) != errCode(fo) || errCode(ao) != "insufficient_scope" {
			t.Errorf("%s %s: app %d %v, full %d %v", req.method, req.path, as, ao, fs, fo)
		}
	}
}
