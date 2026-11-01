package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

func instanceThemeDoc(kind, name string) []byte {
	return []byte(`{"opentodoTheme":1,"id":"house","name":"` + name + `","author":"Owner","licence":"MIT","kind":"` + kind + `","seeds":{"canvas":"#202020","surface":"#2a2a2a","text":"#eeeeee","accent":"#4c8bf5"}}`)
}

func (e *env) putTheme(id string, doc []byte) (*http.Response, map[string]any) {
	e.t.Helper()
	resp, raw := e.putBytes("PUT", "/api/v1/settings/themes/instance/"+id, doc)
	out := map[string]any{}
	_ = json.Unmarshal(raw, &out)
	return resp, out
}

func TestInstanceThemeRoutes(t *testing.T) {
	e := newEnv(t, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	member, _ := e.member("member@example.com", "203.0.113.20")
	anon := newClientFor(e)

	// Nothing set: version 0, no themes, OpenTodo's default.
	resp, out = member.do("GET", "/api/v1/themes/instance", nil)
	e.mustStatus(resp, 200, out)
	if out["version"].(float64) != 0 || len(out["themes"].([]any)) != 0 {
		t.Fatalf("empty: %v", out)
	}
	if resp, _ := anon.do("GET", "/api/v1/themes/instance", nil); resp.StatusCode != 401 {
		t.Fatalf("anonymous read: %d", resp.StatusCode)
	}

	// The owner adds a dark theme; the server gives it its id.
	resp, out = e.putTheme("new", instanceThemeDoc("dark", "House"))
	e.mustStatus(resp, 200, out)
	id := out["id"].(string)
	if id == "" || id == "house" || out["version"].(float64) != 1 {
		t.Fatalf("added: %v", out)
	}

	// Members and anonymous callers cannot change anything.
	if resp, raw := member.putBytes("PUT", "/api/v1/settings/themes/instance/new", instanceThemeDoc("dark", "X")); resp.StatusCode != 403 {
		t.Fatalf("member put: %d %s", resp.StatusCode, raw)
	}
	if resp, _ := member.do("DELETE", "/api/v1/settings/themes/instance/"+id, nil); resp.StatusCode != 403 {
		t.Fatalf("member delete: %d", resp.StatusCode)
	}
	if resp, _ := member.do("PUT", "/api/v1/settings/themes/default", map[string]string{"dark": "instance:" + id}); resp.StatusCode != 403 {
		t.Fatalf("member default: %d", resp.StatusCode)
	}
	if resp, _ := anon.do("PUT", "/api/v1/settings/themes/default", map[string]string{"dark": "instance:" + id}); resp.StatusCode != 401 {
		t.Fatalf("anonymous default: %d", resp.StatusCode)
	}

	// Defaults: the kind is checked.
	if resp, out := e.do("PUT", "/api/v1/settings/themes/default", map[string]string{"light": "builtin:nord"}); resp.StatusCode != 400 || errCode(out) != "invalid_input" {
		t.Fatalf("wrong kind: %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("PUT", "/api/v1/settings/themes/default", map[string]string{"light": "builtin:solarized-light", "dark": "instance:" + id})
	e.mustStatus(resp, 200, out)

	// Members read it, and auth/status reports the version.
	resp, out = member.do("GET", "/api/v1/themes/instance", nil)
	e.mustStatus(resp, 200, out)
	def := out["default"].(map[string]any)
	if def["light"] != "builtin:solarized-light" || def["dark"] != "instance:"+id || len(out["themes"].([]any)) != 1 {
		t.Fatalf("member read: %v", out)
	}
	resp, out = member.do("GET", "/api/v1/auth/status", nil)
	e.mustStatus(resp, 200, out)
	if v := out["themes"].(map[string]any)["version"].(float64); v != 2 {
		t.Fatalf("status version %v", v)
	}

	// Invalid, too large, unknown.
	if resp, out := e.putTheme("new", []byte(`{"opentodoTheme":1,"kind":"dark","seeds":{"accent":"var(--x)"}}`)); resp.StatusCode != 400 || errCode(out) != "invalid_input" {
		t.Fatalf("invalid: %d %v", resp.StatusCode, out)
	}
	big := bytes.Replace(instanceThemeDoc("dark", "Big"), []byte(`"Big"`), []byte(`"`+strings.Repeat("x", 17*1024)+`"`), 1)
	if resp, out := e.putTheme("new", big); resp.StatusCode != 413 || errCode(out) != "too_large" {
		t.Fatalf("too large: %d %v", resp.StatusCode, out)
	}
	if resp, out := e.putTheme("abcdef", instanceThemeDoc("dark", "X")); resp.StatusCode != 404 || errCode(out) != "not_found" {
		t.Fatalf("unknown: %d %v", resp.StatusCode, out)
	}

	// The limit.
	for range 19 {
		resp, out := e.putTheme("new", instanceThemeDoc("light", "More"))
		e.mustStatus(resp, 200, out)
	}
	if resp, out := e.putTheme("new", instanceThemeDoc("light", "Too many")); resp.StatusCode != 409 || errCode(out) != "limit_reached" {
		t.Fatalf("21st: %d %v", resp.StatusCode, out)
	}

	// Removing the dark default clears it.
	resp, out = e.do("DELETE", "/api/v1/settings/themes/instance/"+id, nil)
	e.mustStatus(resp, 200, out)
	if def := out["default"].(map[string]any); def["dark"] != "" || def["light"] != "builtin:solarized-light" {
		t.Fatalf("after remove: %v", def)
	}
	if resp, out := e.do("DELETE", "/api/v1/settings/themes/instance/"+id, nil); resp.StatusCode != 404 || errCode(out) != "not_found" {
		t.Fatalf("remove twice: %d %v", resp.StatusCode, out)
	}

	// Audited with ids only, never the document.
	rows, err := e.db.Query(`SELECT details FROM audit_events WHERE name = 'settings.changed'`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	n := 0
	for rows.Next() {
		var d string
		_ = rows.Scan(&d)
		if strings.Contains(d, "seeds") || strings.Contains(d, "House") {
			t.Errorf("audit details hold the document: %s", d)
		}
		n++
	}
	if n < 22 {
		t.Fatalf("audit events: %d", n)
	}
}

func TestInstanceThemesRefusedOnDemo(t *testing.T) {
	d := newDemoServer(t)
	e, _ := d.visitor()
	for _, c := range []struct{ method, path string }{
		{"PUT", "/api/v1/settings/themes/default"},
		{"PUT", "/api/v1/settings/themes/instance/new"},
		{"DELETE", "/api/v1/settings/themes/instance/x"},
	} {
		resp, out := e.do(c.method, c.path, map[string]string{"light": ""})
		if resp.StatusCode != http.StatusForbidden || errCode(out) != "demo_restricted" {
			t.Errorf("%s %s: %d %v", c.method, c.path, resp.StatusCode, out)
		}
	}
	// Reading stays.
	if resp, out := e.do("GET", "/api/v1/themes/instance", nil); resp.StatusCode != 200 {
		t.Fatalf("demo read: %d %v", resp.StatusCode, out)
	}
}
