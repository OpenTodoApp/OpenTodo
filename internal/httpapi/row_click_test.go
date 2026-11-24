package httpapi

import "testing"

// The server's "Click a task to" default (click-default D2): members read it in
// auth/status, only the owner sets it, and an unknown value is refused.
func TestRowClickDefault(t *testing.T) {
	e := newEnv(t, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	member, _ := e.member("member@example.com", "203.0.113.20")
	admin, adminID := e.member("admin@example.com", "203.0.113.21")
	resp, out = e.do("PUT", "/api/v1/users/"+adminID+"/role", map[string]string{"role": "admin"})
	e.mustStatus(resp, 200, out)
	anon := newClientFor(e)

	status := func(c *env) string {
		t.Helper()
		resp, out := c.do("GET", "/api/v1/auth/status", nil)
		c.mustStatus(resp, 200, out)
		rc, _ := out["rowClick"].(map[string]any)
		s, _ := rc["default"].(string)
		return s
	}
	// Nothing stored: select, then edit the title.
	if got := status(member); got != "select" {
		t.Fatalf("initial default %q", got)
	}
	if resp, out := anon.do("GET", "/api/v1/auth/status", nil); resp.StatusCode != 200 || out["rowClick"] != nil {
		t.Fatalf("anonymous status carries the default: %d %v", resp.StatusCode, out)
	}

	// Only the owner sets it: an admin and a member are refused, anonymous callers too.
	for name, c := range map[string]*env{"admin": admin, "member": member} {
		if resp, out := c.do("PUT", "/api/v1/settings/row-click", map[string]string{"default": "open"}); resp.StatusCode != 403 {
			t.Fatalf("%s put: %d %v", name, resp.StatusCode, out)
		}
	}
	if resp, _ := anon.do("PUT", "/api/v1/settings/row-click", map[string]string{"default": "open"}); resp.StatusCode != 401 {
		t.Fatalf("anonymous put: %d", resp.StatusCode)
	}
	if got := status(member); got != "select" {
		t.Fatalf("a refused write changed the default to %q", got)
	}

	// Unknown values and bodies are refused.
	for _, body := range []any{map[string]string{"default": "expand"}, map[string]string{}, map[string]any{"default": "open", "other": 1}} {
		if resp, out := e.do("PUT", "/api/v1/settings/row-click", body); resp.StatusCode != 400 || errCode(out) != "invalid_input" {
			t.Fatalf("body %v: %d %v", body, resp.StatusCode, out)
		}
	}

	resp, out = e.do("PUT", "/api/v1/settings/row-click", map[string]string{"default": "open"})
	e.mustStatus(resp, 200, out)
	if out["default"] != "open" {
		t.Fatalf("put answer %v", out)
	}
	if got := status(member); got != "open" {
		t.Fatalf("member reads %q", got)
	}
	if got := status(admin); got != "open" {
		t.Fatalf("admin reads %q", got)
	}
}
