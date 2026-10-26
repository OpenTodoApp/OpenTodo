package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/calsync"
	"github.com/pixari/opentodo/internal/calsync/calsynctest"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Calendar sync over HTTP (OpenSpec change calendar-two-way, tasks 3.1–3.3).
// The calendar server and Google's token endpoint are in-process fakes on
// loopback; nothing leaves the machine.

// calsyncEnv is the owner's env with the server reachable for tests.
func calsyncEnv(t *testing.T) (*env, *Server) {
	t.Helper()
	var srv *Server
	e := newEnvWith(t, false, func(s *Server) { srv = s })
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	return e, srv
}

func calsyncOn(t *testing.T, e *env) {
	t.Helper()
	resp, out := e.do("PUT", "/api/v1/settings/calendar-sync", map[string]any{"enabled": true})
	e.mustStatus(resp, 200, out)
}

func TestCalendarSyncSwitch(t *testing.T) {
	t.Parallel()
	e, _ := calsyncEnv(t)
	resp, out := e.do("GET", "/api/v1/settings/calendar-sync", nil)
	e.mustStatus(resp, 200, out)
	if out["enabled"] != false || out["google"] != false {
		t.Fatalf("default = %v", out)
	}
	resp, out = e.do("GET", "/api/v1/calendar-sync/connections", nil)
	if resp.StatusCode != 404 || errCode(out) != "calendar_sync_disabled" {
		t.Fatalf("off = %d %v", resp.StatusCode, out)
	}
	m, _ := e.member("m@example.com", "198.51.100.31")
	if resp, out := m.do("PUT", "/api/v1/settings/calendar-sync", map[string]any{"enabled": true}); resp.StatusCode != 403 || errCode(out) != "forbidden" {
		t.Fatalf("member put = %d %v", resp.StatusCode, out)
	}
	if resp, out := m.do("PUT", "/api/v1/settings/calendar-sync/google", map[string]any{"client_id": "x"}); resp.StatusCode != 403 {
		t.Fatalf("member google = %d %v", resp.StatusCode, out)
	}
	anon := newClientAt(e, "10.9.9.11")
	for _, p := range []string{"/api/v1/settings/calendar-sync", "/api/v1/calendar-sync/connections", "/api/v1/calendar-feeds/events?from=2026-01-01&to=2026-01-02"} {
		if resp, out := anon.do("GET", p, nil); resp.StatusCode != 401 || errCode(out) != "unauthorized" {
			t.Fatalf("anonymous %s = %d %v", p, resp.StatusCode, out)
		}
	}
	calsyncOn(t, e)
	resp, out = m.do("GET", "/api/v1/calendar-sync/connections", nil)
	m.mustStatus(resp, 200, out)
	var n int
	e.db.QueryRow(`SELECT COUNT(*) FROM audit_events WHERE name = 'settings.changed' AND details LIKE '%calendar_sync.enabled%'`).Scan(&n)
	if n != 1 {
		t.Fatalf("%d settings.changed events", n)
	}
	// The events route answers with calendar feeds off.
	resp, out = e.do("GET", "/api/v1/calendar-feeds/events?from=2026-01-01&to=2026-01-02", nil)
	e.mustStatus(resp, 200, out)
	if resp, _ := e.do("GET", "/api/v1/calendar-feeds/subscriptions", nil); resp.StatusCode != 404 {
		t.Fatalf("subscriptions with feeds off = %d", resp.StatusCode)
	}
}

func TestCalendarConnectionLifecycle(t *testing.T) {
	t.Parallel()
	e, srv := calsyncEnv(t)
	calsyncOn(t, e)
	cal := calsynctest.New()
	t.Cleanup(cal.Close)
	body := map[string]any{"server_url": cal.URL, "username": "me", "password": "app-pass"}
	// A loopback server is a private target until the owner allows them.
	resp, out := e.do("POST", "/api/v1/calendar-sync/connections", body)
	if resp.StatusCode != 400 || errCode(out) != "private_target" || cal.Count("PROPFIND") != 0 {
		t.Fatalf("private = %d %v", resp.StatusCode, out)
	}
	allowPrivateTargets(t, e)
	resp, out = e.do("POST", "/api/v1/calendar-sync/connections", map[string]any{"server_url": cal.URL, "username": "me", "password": "wrong"})
	if resp.StatusCode != 400 || errCode(out) != "unauthorized_remote" {
		t.Fatalf("wrong password = %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("POST", "/api/v1/calendar-sync/connections", body)
	e.mustStatus(resp, 201, out)
	c := connOf(out)
	raw, _ := json.Marshal(out)
	if c["state"] != "choose_calendar" || c["password_set"] != true || strings.Contains(string(raw), "app-pass") {
		t.Fatalf("created = %s", raw)
	}
	id := c["id"].(string)
	cals := c["calendars"].([]any)
	work := cals[0].(map[string]any)["url"].(string)
	if resp, out := e.do("PATCH", "/api/v1/calendar-sync/connections/"+id, map[string]any{"target": "https://elsewhere.example/cal/"}); resp.StatusCode != 400 {
		t.Fatalf("unknown target = %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("PATCH", "/api/v1/calendar-sync/connections/"+id, map[string]any{"target": work})
	e.mustStatus(resp, 200, out)
	if connOf(out)["state"] != "pending" {
		t.Fatalf("after choosing = %v", connOf(out))
	}
	// A task and a meeting someone else put in the calendar.
	ownerID := userIDOf(t, e)
	op := func(field string, v any) opsync.Op {
		b, _ := json.Marshal(v)
		return opsync.Op{ID: "o-" + field, Entity: "task", EntityID: "task-1", Field: field, Value: b, TS: time.Now().UnixMilli(), Device: "phone"}
	}
	tomorrow := time.Now().AddDate(0, 0, 1).Format("2006-01-02")
	if _, err := e.sync.ApplyStrict(context.Background(), ownerID, []opsync.Op{op("title", "Write report"), op("due", map[string]string{"date": tomorrow, "time": "09:00"})}); err != nil {
		t.Fatal(err)
	}
	stamp := strings.ReplaceAll(tomorrow, "-", "")
	cal.Put("work", "meeting.ics", "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:meeting\r\nSUMMARY:Team meeting\r\nDTSTART:"+stamp+"T120000Z\r\nDTEND:"+stamp+"T130000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n")
	resp, out = e.do("POST", "/api/v1/calendar-sync/connections/"+id+"/sync", nil)
	e.mustStatus(resp, 200, out)
	if out["ok"] != true || out["run"].(map[string]any)["written"] != float64(1) || !strings.Contains(cal.Get("work", "task-1.ics"), "SUMMARY:Write report") {
		t.Fatalf("sync = %v", out)
	}
	resp, out = e.do("GET", "/api/v1/calendar-feeds/events?from="+tomorrow+"&to="+tomorrow, nil)
	e.mustStatus(resp, 200, out)
	if evs := out["events"].([]any); len(evs) != 1 || evs[0].(map[string]any)["summary"] != "Team meeting" {
		t.Fatalf("events = %v", out)
	}
	if subs := out["subscriptions"].([]any); len(subs) != 1 {
		t.Fatalf("subscriptions = %v", subs)
	}
	// Another user cannot see or touch it.
	m, _ := e.member("m2@example.com", "198.51.100.32")
	if resp, _ := m.do("DELETE", "/api/v1/calendar-sync/connections/"+id, nil); resp.StatusCode != 404 {
		t.Fatalf("other user delete = %d", resp.StatusCode)
	}
	resp, out = e.do("DELETE", "/api/v1/calendar-sync/connections/"+id, nil)
	e.mustStatus(resp, 204, out)
	secrets, _ := os.ReadFile(srv.calsync.Secrets.Path())
	if strings.Contains(string(secrets), id) {
		t.Fatal("the password stayed in the secrets file")
	}
	for _, name := range []string{"calendar_connection.created", "calendar_connection.updated", "calendar_connection.deleted"} {
		var n int
		e.db.QueryRow(`SELECT COUNT(*) FROM audit_events WHERE name = ? AND details NOT LIKE '%app-pass%' AND details NOT LIKE '%127.0.0.1%'`, name).Scan(&n)
		if n != 1 {
			t.Fatalf("%d %s events", n, name)
		}
	}
}

func TestCalendarConnectionLimitsAndFreshness(t *testing.T) {
	t.Parallel()
	e, srv := calsyncEnv(t)
	calsyncOn(t, e)
	uid := userIDOf(t, e)
	for i := 0; i < calsync.MaxConnections; i++ {
		if _, err := srv.calsync.Store.Create(context.Background(), &calsync.Connection{UserID: uid, Provider: calsync.ProviderCalDAV, ServerURL: "https://x.example"}); err != nil {
			t.Fatal(err)
		}
	}
	body := map[string]any{"server_url": "https://x.example", "username": "me", "password": "p"}
	if resp, out := e.do("POST", "/api/v1/calendar-sync/connections", body); resp.StatusCode != 409 || errCode(out) != "limit_reached" {
		t.Fatalf("fourth = %d %v", resp.StatusCode, out)
	}
	e.staleSessions()
	if resp, out := e.do("POST", "/api/v1/calendar-sync/connections", body); resp.StatusCode != 403 || errCode(out) != "reauth_required" {
		t.Fatalf("stale create = %d %v", resp.StatusCode, out)
	}
	list, _ := srv.calsync.Store.List(context.Background(), uid)
	if resp, out := e.do("PATCH", "/api/v1/calendar-sync/connections/"+list[0].ID, map[string]any{"password": "new"}); resp.StatusCode != 403 || errCode(out) != "reauth_required" {
		t.Fatalf("stale password = %d %v", resp.StatusCode, out)
	}
	if resp, out := e.do("PATCH", "/api/v1/calendar-sync/connections/"+list[0].ID, map[string]any{"name": "Renamed"}); resp.StatusCode != 200 {
		t.Fatalf("stale rename = %d %v", resp.StatusCode, out)
	}
}

func TestGoogleConnectFlow(t *testing.T) {
	t.Parallel()
	e, srv := calsyncEnv(t)
	calsyncOn(t, e)
	allowPrivateTargets(t, e)
	cal := calsynctest.New()
	t.Cleanup(cal.Close)
	cal.Bearer = "access-1"
	tokens := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		if r.PostForm.Get("code") != "the-code" || r.PostForm.Get("code_verifier") == "" || r.PostForm.Get("client_secret") != "csecret" {
			w.WriteHeader(400)
			fmt.Fprint(w, `{"error":"invalid_grant"}`)
			return
		}
		fmt.Fprint(w, `{"access_token":"access-1","refresh_token":"refresh-1","expires_in":3600}`)
	}))
	t.Cleanup(tokens.Close)
	srv.calsync.Token.URL = tokens.URL
	srv.calsync.GoogleBase = cal.URL + "/dav/"

	if resp, out := e.do("POST", "/api/v1/calendar-sync/google/start", nil); resp.StatusCode != 409 || errCode(out) != "google_not_configured" {
		t.Fatalf("start without client = %d %v", resp.StatusCode, out)
	}
	resp, out := e.do("PUT", "/api/v1/settings/calendar-sync/google", map[string]any{"client_id": "cid", "client_secret": "csecret"})
	e.mustStatus(resp, 200, out)
	if out["secret_set"] != true || strings.Contains(fmt.Sprint(out), "csecret") || !strings.HasSuffix(out["redirect_uri"].(string), "/api/v1/calendar-sync/google/callback") {
		t.Fatalf("google client = %v", out)
	}
	resp, out = e.do("POST", "/api/v1/calendar-sync/google/start", nil)
	e.mustStatus(resp, 200, out)
	auth, _ := url.Parse(out["url"].(string))
	q := auth.Query()
	if q.Get("client_id") != "cid" || q.Get("code_challenge") == "" || q.Get("state") == "" {
		t.Fatalf("authorization url = %s", auth)
	}
	noFollow := &http.Client{Jar: e.client.Jar, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	callback := func(state string) string {
		req, _ := http.NewRequest("GET", e.srv.URL+"/api/v1/calendar-sync/google/callback?code=the-code&state="+url.QueryEscape(state), nil)
		resp, err := noFollow.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
		if resp.StatusCode != http.StatusSeeOther {
			t.Fatalf("callback = %d", resp.StatusCode)
		}
		return resp.Header.Get("Location")
	}
	if loc := callback(q.Get("state")); !strings.HasPrefix(loc, "/settings/integrations/calendar-sync?") || !strings.Contains(loc, "calendar-sync=connected") {
		t.Fatalf("location = %s", loc)
	}
	if loc := callback(q.Get("state")); !strings.Contains(loc, "invalid_state") {
		t.Fatalf("replayed state = %s", loc)
	}
	resp, out = e.do("GET", "/api/v1/calendar-sync/connections", nil)
	e.mustStatus(resp, 200, out)
	list := out["connections"].([]any)
	if len(list) != 1 || list[0].(map[string]any)["provider"] != "google" || list[0].(map[string]any)["state"] != "choose_calendar" {
		t.Fatalf("connections = %v", list)
	}
	resp, out = e.do("GET", "/api/v1/settings/calendar-sync", nil)
	e.mustStatus(resp, 200, out)
	if out["google"] != true {
		t.Fatalf("setting = %v", out)
	}
}
