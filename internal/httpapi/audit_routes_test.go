package httpapi

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/audit"
)

// member registers a member through an invitation and returns their client and id.
func (e *env) member(email, ip string) (*env, string) {
	e.t.Helper()
	_, secret, _ := e.invite(map[string]any{})
	m := newClientAt(e, ip)
	resp, out := m.do("POST", "/api/v1/auth/register", map[string]string{"email": email, "password": "member long password", "invitation": secret})
	m.mustStatus(resp, 201, out)
	return m, out["user"].(map[string]any)["id"].(string)
}

func (e *env) userID() string {
	e.t.Helper()
	resp, out := e.do("GET", "/api/v1/me", nil)
	e.mustStatus(resp, 200, out)
	return out["user"].(map[string]any)["id"].(string)
}

func eventsOf(t *testing.T, out map[string]any) []map[string]any {
	t.Helper()
	raw, ok := out["events"].([]any)
	if !ok {
		t.Fatalf("no events array in %v", out)
	}
	list := make([]map[string]any, len(raw))
	for i, r := range raw {
		list[i] = r.(map[string]any)
	}
	return list
}

func TestAuditRoutesRequireOwner(t *testing.T) {
	e := ownerEnv(t)
	m, _ := e.member("member@example.com", "10.1.0.1")
	anon := newClientAt(e, "10.1.0.2")
	routes := []struct{ method, path string }{
		{"GET", "/api/v1/audit"},
		{"GET", "/api/v1/audit/export"},
		{"GET", "/api/v1/settings/audit"},
		{"PUT", "/api/v1/settings/audit"},
	}
	for _, rt := range routes {
		resp, out := anon.do(rt.method, rt.path, map[string]any{"retentionDays": 30})
		anon.mustStatus(resp, 401, out)
		if errCode(out) != "unauthorized" {
			t.Fatalf("%s %s anonymous: %v", rt.method, rt.path, out)
		}
		resp, out = m.do(rt.method, rt.path, map[string]any{"retentionDays": 30})
		m.mustStatus(resp, 403, out)
		if errCode(out) != "forbidden" {
			t.Fatalf("%s %s member: %v", rt.method, rt.path, out)
		}
		resp, out = e.do(rt.method, rt.path, map[string]any{"retentionDays": 30})
		if resp.StatusCode != 200 {
			t.Fatalf("%s %s owner: %d %v", rt.method, rt.path, resp.StatusCode, out)
		}
	}
	// The member's settings write changed nothing.
	resp, out := e.do("GET", "/api/v1/settings/audit", nil)
	e.mustStatus(resp, 200, out)
	if out["retentionDays"] != float64(30) {
		t.Fatalf("settings = %v", out)
	}
	// Personal activity is open to every signed-in user but not to anonymous requests.
	resp, out = anon.do("GET", "/api/v1/me/activity", nil)
	anon.mustStatus(resp, 401, out)
	resp, out = m.do("GET", "/api/v1/me/activity", nil)
	m.mustStatus(resp, 200, out)
}

func TestAuditNoModifyOrDeleteRoutes(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("GET", "/api/v1/audit", nil)
	e.mustStatus(resp, 200, out)
	before := eventsOf(t, out)
	if len(before) == 0 {
		t.Fatal("expected at least the registration event")
	}
	id := fmt.Sprint(int64(before[0]["id"].(float64)))
	for _, method := range []string{"DELETE", "PATCH"} {
		resp, out := e.do(method, "/api/v1/audit/"+id, map[string]any{"outcome": "failure"})
		e.mustStatus(resp, 404, out)
		if errCode(out) != "not_found" {
			t.Fatalf("%s audit event: %v", method, out)
		}
	}
	resp, out = e.do("GET", "/api/v1/audit", nil)
	e.mustStatus(resp, 200, out)
	after := eventsOf(t, out)
	if after[len(after)-1]["id"] != before[len(before)-1]["id"] || after[len(after)-1]["outcome"] != "success" {
		t.Fatal("event changed or vanished")
	}
}

func TestAuditFiltersAndCursor(t *testing.T) {
	e := ownerEnv(t)
	ownerID := e.userID()
	m, memberID := e.member("member@example.com", "10.2.0.1")
	bad := newClientAt(e, "10.2.0.9")
	for i := 0; i < 5; i++ {
		resp, out := bad.do("POST", "/api/v1/auth/login", map[string]string{"email": "member@example.com", "password": "wrong wrong wrong"})
		bad.mustStatus(resp, 401, out)
	}
	resp, out := m.do("POST", "/api/v1/tokens", map[string]string{"name": "member script"})
	m.mustStatus(resp, 201, out)

	// Filter by name + target, paginated by 2.
	q := url.Values{"name": {"login.failed"}, "target": {memberID}, "limit": {"2"}}
	var seen []map[string]any
	for page := 0; ; page++ {
		resp, out := e.do("GET", "/api/v1/audit?"+q.Encode(), nil)
		e.mustStatus(resp, 200, out)
		list := eventsOf(t, out)
		seen = append(seen, list...)
		if out["cursor"] == nil {
			break
		}
		if len(list) != 2 {
			t.Fatalf("page %d has %d events with a cursor", page, len(list))
		}
		q.Set("cursor", fmt.Sprint(int64(out["cursor"].(float64))))
	}
	if len(seen) != 5 {
		t.Fatalf("paged through %d login.failed events, want 5", len(seen))
	}
	for i, ev := range seen {
		if ev["name"] != "login.failed" || ev["targetId"] != memberID || ev["targetEmail"] != "member@example.com" || ev["outcome"] != "failure" {
			t.Fatalf("event %d = %v", i, ev)
		}
		if i > 0 && ev["id"].(float64) >= seen[i-1]["id"].(float64) {
			t.Fatal("not newest first")
		}
	}

	// Actor by email, within the last seven days.
	week := fmt.Sprint(time.Now().Add(-7 * 24 * time.Hour).UnixMilli())
	resp, out = e.do("GET", "/api/v1/audit?actor=MEMBER@example.com&from="+week, nil)
	e.mustStatus(resp, 200, out)
	for _, ev := range eventsOf(t, out) {
		if ev["actorId"] != memberID {
			t.Fatalf("actor filter leaked %v", ev)
		}
	}
	if n := len(eventsOf(t, out)); n != 3 { // registration sign-in, invitation.accepted, token.created
		t.Fatalf("member actor events = %d, want 3", n)
	}
	resp, out = e.do("GET", "/api/v1/audit?actor="+ownerID+"&outcome=failure", nil)
	e.mustStatus(resp, 200, out)
	if n := len(eventsOf(t, out)); n != 0 {
		t.Fatalf("owner failures = %d", n)
	}
	// A range in the future matches nothing.
	future := time.Now().Add(time.Hour).UTC().Format(time.RFC3339)
	resp, out = e.do("GET", "/api/v1/audit?from="+url.QueryEscape(future), nil)
	e.mustStatus(resp, 200, out)
	if n := len(eventsOf(t, out)); n != 0 || out["cursor"] != nil {
		t.Fatalf("future range = %d events", n)
	}

	// Invalid filters name the parameter.
	for param, value := range map[string]string{"from": "yesterday", "to": "2026-13-45", "limit": "201", "outcome": "maybe", "name": "task.updated", "cursor": "-3"} {
		resp, out := e.do("GET", "/api/v1/audit?"+param+"="+url.QueryEscape(value), nil)
		e.mustStatus(resp, 400, out)
		if errCode(out) != "invalid_input" || !strings.HasPrefix(out["error"].(map[string]any)["message"].(string), param+":") {
			t.Fatalf("%s=%s: %v", param, value, out)
		}
	}
}

func TestAuditExportRecordsItself(t *testing.T) {
	e := ownerEnv(t)
	bad := newClientAt(e, "10.3.0.9")
	for i := 0; i < 3; i++ {
		bad.do("POST", "/api/v1/auth/login", map[string]string{"email": "owner@example.com", "password": "wrong wrong wrong"})
	}
	req, _ := http.NewRequest("GET", e.srv.URL+"/api/v1/audit/export?name=login.failed", nil)
	resp, err := e.client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("export: %d %s", resp.StatusCode, b)
	}
	if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "application/x-ndjson") {
		t.Fatalf("content type %q", ct)
	}
	if cd := resp.Header.Get("Content-Disposition"); !strings.HasPrefix(cd, "attachment;") || !strings.Contains(cd, ".ndjson") {
		t.Fatalf("content disposition %q", cd)
	}
	sc := bufio.NewScanner(resp.Body)
	lines := 0
	for sc.Scan() {
		var ev map[string]any
		if err := json.Unmarshal(sc.Bytes(), &ev); err != nil {
			t.Fatalf("line %d is not JSON: %q", lines, sc.Text())
		}
		if ev["name"] != "login.failed" {
			t.Fatalf("export ignored the filter: %v", ev)
		}
		lines++
	}
	if lines != 3 {
		t.Fatalf("export has %d lines, want 3", lines)
	}
	ex := e.events(audit.AuditExportedName)
	if len(ex) != 1 || ex[0].Details["count"] != "3" || ex[0].Details["format"] != "ndjson" {
		t.Fatalf("audit.exported = %+v", ex)
	}
	// Export filters are validated like the list's.
	r2, out := e.do("GET", "/api/v1/audit/export?from=nope", nil)
	e.mustStatus(r2, 400, out)
}

func TestAuditSettingsBounds(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("GET", "/api/v1/settings/audit", nil)
	e.mustStatus(resp, 200, out)
	if out["retentionDays"] != float64(90) || out["logIp"] != false {
		t.Fatalf("defaults = %v", out)
	}
	for _, v := range []any{3, 6, 3651, 30.5, "thirty"} {
		resp, out := e.do("PUT", "/api/v1/settings/audit", map[string]any{"retentionDays": v})
		e.mustStatus(resp, 400, out)
		if errCode(out) != "invalid_input" {
			t.Fatalf("retention %v: %v", v, out)
		}
	}
	// Old events exist; lowering retention prunes them right away and records the change.
	if _, err := e.db.Exec("INSERT INTO audit_events(ts,name,outcome) VALUES(?, 'logout', 'success')", time.Now().Add(-45*24*time.Hour).UnixMilli()); err != nil {
		t.Fatal(err)
	}
	resp, out = e.do("PUT", "/api/v1/settings/audit", map[string]any{"retentionDays": 30})
	e.mustStatus(resp, 200, out)
	if out["retentionDays"] != float64(30) {
		t.Fatalf("after PUT = %v", out)
	}
	if lo := e.events(audit.LogoutName); len(lo) != 0 {
		t.Fatalf("old event not pruned: %+v", lo)
	}
	ch := e.events(audit.SettingsChangedName)
	if len(ch) != 1 || ch[0].Details["setting"] != audit.KeyRetentionDays || ch[0].Details["from"] != "90" || ch[0].Details["to"] != "30" {
		t.Fatalf("settings.changed = %+v", ch)
	}

	// Address logging: on, sign-in carries the address, off scrubs it.
	resp, out = e.do("PUT", "/api/v1/settings/audit", map[string]any{"logIp": true})
	e.mustStatus(resp, 200, out)
	c := newClientAt(e, "192.0.2.44")
	resp, out = c.do("POST", "/api/v1/auth/login", map[string]string{"email": "owner@example.com", "password": "correct horse battery"})
	c.mustStatus(resp, 200, out)
	ok := e.events(audit.LoginSucceededName)
	if str(ok[0].IP) != "192.0.2.44" {
		t.Fatalf("address not recorded while enabled: %+v", ok[0])
	}
	resp, out = e.do("PUT", "/api/v1/settings/audit", map[string]any{"logIp": false})
	e.mustStatus(resp, 200, out)
	if ok := e.events(audit.LoginSucceededName); ok[0].IP != nil {
		t.Fatalf("address kept after disabling: %+v", ok[0])
	}
	// A PUT that changes nothing records nothing.
	resp, out = e.do("PUT", "/api/v1/settings/audit", map[string]any{"logIp": false, "retentionDays": 30})
	e.mustStatus(resp, 200, out)
	if n := len(e.events(audit.SettingsChangedName)); n != 3 {
		t.Fatalf("settings.changed events = %d, want 3", n)
	}
}

func TestActivityShowsOnlyOwnEvents(t *testing.T) {
	e := ownerEnv(t)
	m, memberID := e.member("member@example.com", "10.4.0.1")
	// Second browser for the member.
	m2 := newClientAt(e, "10.4.0.2")
	resp, out := m2.do("POST", "/api/v1/auth/login", map[string]string{"email": "member@example.com", "password": "member long password"}, "User-Agent", "Second Browser/1.0")
	m2.mustStatus(resp, 200, out)
	// Owner activity that the member must not see.
	resp, out = e.do("POST", "/api/v1/tokens", map[string]string{"name": "owner script"})
	e.mustStatus(resp, 201, out)
	newClientAt(e, "10.4.0.3").do("POST", "/api/v1/auth/login", map[string]string{"email": "owner@example.com", "password": "wrong wrong wrong"})
	// An old sign-in beyond 90 days is not listed.
	if _, err := e.db.Exec("INSERT INTO audit_events(ts,name,outcome,actor_id) VALUES(?, 'login.succeeded', 'success', ?)", time.Now().Add(-100*24*time.Hour).UnixMilli(), memberID); err != nil {
		t.Fatal(err)
	}

	resp, out = m.do("GET", "/api/v1/me/activity", nil)
	m.mustStatus(resp, 200, out)
	list := eventsOf(t, out)
	signIns := 0
	for _, ev := range list {
		if ev["actorId"] != memberID && ev["targetId"] != memberID {
			t.Fatalf("activity leaked another account's event: %v", ev)
		}
		if ev["name"] == "invitation.accepted" {
			t.Fatalf("activity lists a non-access event: %v", ev)
		}
		if ev["name"] == "login.succeeded" {
			signIns++
		}
	}
	if signIns != 2 {
		t.Fatalf("member sign-ins = %d, want 2 (registration and second browser)", signIns)
	}
	if list[0]["userAgent"] != "Second Browser/1.0" {
		t.Fatalf("latest event = %v", list[0])
	}
}

func TestUserExportExcludesAudit(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/tokens", map[string]string{"name": "x"})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, 200, out)
	for k := range out {
		switch k {
		// encryption: the wrapped key record or null (OpenSpec e2ee).
		// user_prefs: the caller's date and time preferences (date-time-preferences).
		// attachments: file and link metadata (attachments).
		// fields: custom field definitions (custom-fields); review: when the last
		// weekly review was finished (stats-and-review); project_prefs: personal
		// per-project preferences (activity-feed, open-loops-method).
		case "format", "version", "exportedAt", "projects", "tasks", "labels", "views", "reminders", "sections", "comments", "encryption", "user_prefs", "attachments", "fields", "review", "project_prefs",
			// time_entries and the exporting account's userId (time-tracking).
			"time_entries", "userId",
			// saved locations (task-locations).
			"places":
		default:
			t.Fatalf("user export has unexpected key %q", k)
		}
	}
	raw, _ := json.Marshal(out)
	for _, needle := range []string{"login.succeeded", "token.created", "audit"} {
		if strings.Contains(string(raw), needle) {
			t.Fatalf("user export contains %q", needle)
		}
	}
}

// TestAuditDocumentedShape keeps docs/api.md#audit-log honest: an event has
// exactly the documented keys, and every event name in the catalogue is listed.
func TestAuditDocumentedShape(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("GET", "/api/v1/audit", nil)
	e.mustStatus(resp, 200, out)
	ev := eventsOf(t, out)[0]
	want := []string{"id", "ts", "name", "outcome", "actorId", "actorEmail", "targetId", "targetEmail", "ip", "userAgent", "details"}
	if len(ev) != len(want) {
		t.Fatalf("event keys = %v, want %v", ev, want)
	}
	for _, k := range want {
		if _, ok := ev[k]; !ok {
			t.Fatalf("event lacks documented key %q: %v", k, ev)
		}
	}
	doc, err := os.ReadFile("../../docs/api.md")
	if err != nil {
		t.Fatal(err)
	}
	for _, n := range audit.Names {
		if !strings.Contains(string(doc), "`"+string(n)+"`") {
			t.Errorf("docs/api.md does not list event %s", n)
		}
	}
}
