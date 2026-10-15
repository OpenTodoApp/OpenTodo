package httpapi

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pixari/opentodo/internal/config"
)

// Calendar feeds over HTTP (OpenSpec change calendar-feeds, tasks 4.1–4.4).

const icsBody = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-WR-CALNAME:Work\r\nBEGIN:VEVENT\r\nUID:sync\r\nDTSTART;TZID=Europe/Berlin:20261019T100000\r\n" +
	"DTEND;TZID=Europe/Berlin:20261019T110000\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nSUMMARY:Team sync\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"

func feedsOn(t *testing.T, e *env) {
	t.Helper()
	resp, out := e.do("PUT", "/api/v1/settings/calendar-feeds", map[string]any{"enabled": true})
	e.mustStatus(resp, 200, out)
}

func TestCalendarFeedsSwitch(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("GET", "/api/v1/settings/calendar-feeds", nil)
	e.mustStatus(resp, 200, out)
	if out["enabled"] != false {
		t.Fatalf("default = %v", out)
	}
	resp, out = e.do("GET", "/api/v1/calendar-feeds/subscriptions", nil)
	if resp.StatusCode != 404 || errCode(out) != "feeds_disabled" {
		t.Fatalf("off = %d %v", resp.StatusCode, out)
	}
	m, _ := e.member("m@example.com", "198.51.100.20")
	resp, out = m.do("PUT", "/api/v1/settings/calendar-feeds", map[string]any{"enabled": true})
	if resp.StatusCode != 403 {
		t.Fatalf("member put = %d %v", resp.StatusCode, out)
	}
	feedsOn(t, e)
	resp, out = m.do("GET", "/api/v1/calendar-feeds/subscriptions", nil)
	m.mustStatus(resp, 200, out)
	// The preset applies on the first start only.
	on := true
	p := newEnvConfig(t, config.Config{CalendarFeeds: &on})
	resp, out = p.do("GET", "/api/v1/settings/calendar-feeds", nil)
	if resp.StatusCode == 200 && out["enabled"] != true {
		t.Fatalf("preset = %v", out)
	}
}

func TestCalendarFeedsSubscriptionsAndEvents(t *testing.T) {
	e := ownerEnv(t)
	feedsOn(t, e)
	src := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, icsBody) }))
	defer src.Close()
	// A local address is a private target until the owner allows them.
	resp, out := e.do("POST", "/api/v1/calendar-feeds/subscriptions", map[string]any{"url": src.URL})
	if resp.StatusCode != 400 || errCode(out) != "private_target" {
		t.Fatalf("private = %d %v", resp.StatusCode, out)
	}
	yes := true
	if err := e.hooks.SeedAllowPrivate(context.Background(), &yes); err != nil {
		t.Fatal(err)
	}
	resp, out = e.do("POST", "/api/v1/calendar-feeds/subscriptions", map[string]any{"url": strings.Replace(src.URL, "http://", "webcal://", 1)})
	// webcal becomes https, which the test server does not speak: stored, with the failure.
	e.mustStatus(resp, 201, out)
	if ws := out["subscription"].(map[string]any); !strings.HasPrefix(ws["url"].(string), "https://") || ws["lastError"] != "connection_failed" {
		t.Fatalf("webcal = %v", ws)
	}
	resp, _ = e.do("DELETE", "/api/v1/calendar-feeds/subscriptions/"+out["subscription"].(map[string]any)["id"].(string), nil)
	e.mustStatus(resp, 204, nil)
	resp, out = e.do("POST", "/api/v1/calendar-feeds/subscriptions", map[string]any{"url": src.URL, "color": "#3b82f6"})
	e.mustStatus(resp, 201, out)
	sub := out["subscription"].(map[string]any)
	id := sub["id"].(string)
	if sub["name"] != "Work" || sub["eventCount"].(float64) != 3 || sub["lastError"] != "" {
		t.Fatalf("subscription = %v", sub)
	}
	resp, out = e.do("GET", "/api/v1/calendar-feeds/events?from=2026-10-19&to=2026-10-26", nil)
	e.mustStatus(resp, 200, out)
	events := out["events"].([]any)
	if len(events) != 2 {
		t.Fatalf("events = %v", events)
	}
	first := events[0].(map[string]any)
	start := first["start"].(map[string]any)
	if first["summary"] != "Team sync" || start["date"] != "2026-10-19" || start["time"] != "10:00" || start["tz"] != "Europe/Berlin" {
		t.Fatalf("event = %v", first)
	}
	resp, out = e.do("GET", "/api/v1/calendar-feeds/events?from=2026-10-01&to=2027-01-15", nil)
	if resp.StatusCode != 400 || errCode(out) != "invalid_input" {
		t.Fatalf("100 days = %d %v", resp.StatusCode, out)
	}
	// Another account cannot see or touch it.
	m, _ := e.member("m@example.com", "198.51.100.21")
	resp, _ = m.do("PATCH", "/api/v1/calendar-feeds/subscriptions/"+id, map[string]any{"name": "x"})
	if resp.StatusCode != 404 {
		t.Fatalf("foreign patch = %d", resp.StatusCode)
	}
	// A read token reads but cannot write.
	read := e.token("read")
	c := e.bearerClient()
	resp, out = c.do("GET", "/api/v1/calendar-feeds/subscriptions", nil, bearer(read)...)
	c.mustStatus(resp, 200, out)
	resp, out = c.do("POST", "/api/v1/calendar-feeds/subscriptions/"+id+"/refresh", nil, bearer(read)...)
	if resp.StatusCode != 403 || errCode(out) != "insufficient_scope" {
		t.Fatalf("read token write = %d %v", resp.StatusCode, out)
	}
	// Rename, disable, delete.
	resp, out = e.do("PATCH", "/api/v1/calendar-feeds/subscriptions/"+id, map[string]any{"name": "Team", "enabled": false})
	e.mustStatus(resp, 200, out)
	if s := out["subscription"].(map[string]any); s["name"] != "Team" || s["enabled"] != false {
		t.Fatalf("patched = %v", s)
	}
	resp, out = e.do("GET", "/api/v1/calendar-feeds/events?from=2026-10-19&to=2026-10-26", nil)
	if len(out["events"].([]any)) != 0 {
		t.Fatal("a disabled subscription's events are listed")
	}
	// Hand-triggered fetches are limited per user: 12 per hour (two used by the creates).
	for i := 0; i < 10; i++ {
		resp, _ = e.do("POST", "/api/v1/calendar-feeds/subscriptions/"+id+"/refresh", nil)
		e.mustStatus(resp, 200, nil)
	}
	resp, out = e.do("POST", "/api/v1/calendar-feeds/subscriptions/"+id+"/refresh", nil)
	if resp.StatusCode != 429 || errCode(out) != "rate_limited" {
		t.Fatalf("13th = %d %v", resp.StatusCode, out)
	}
	resp, _ = e.do("DELETE", "/api/v1/calendar-feeds/subscriptions/"+id, nil)
	e.mustStatus(resp, 204, nil)
	anon := newClientAt(e, "10.9.9.10")
	resp, _ = anon.do("GET", "/api/v1/calendar-feeds/subscriptions", nil)
	if resp.StatusCode != 401 {
		t.Fatalf("anonymous = %d", resp.StatusCode)
	}
}

func TestCalendarFeedsLimit(t *testing.T) {
	e := ownerEnv(t)
	feedsOn(t, e)
	yes := true
	_ = e.hooks.SeedAllowPrivate(context.Background(), &yes)
	src := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, icsBody) }))
	defer src.Close()
	if _, err := e.db.Exec(`UPDATE calendar_subscriptions SET user_id = user_id`); err != nil {
		t.Fatal(err)
	}
	uid := e.userID()
	for i := 0; i < 10; i++ {
		if _, err := e.db.Exec(`INSERT INTO calendar_subscriptions(id,user_id,url,interval_seconds,next_fetch_at,created_at,updated_at) VALUES(?,?,?,3600,0,1,1)`,
			fmt.Sprintf("s%d", i), uid, src.URL); err != nil {
			t.Fatal(err)
		}
	}
	resp, out := e.do("POST", "/api/v1/calendar-feeds/subscriptions", map[string]any{"url": src.URL})
	if resp.StatusCode != 400 || errCode(out) != "limit_reached" {
		t.Fatalf("eleventh = %d %v", resp.StatusCode, out)
	}
}

func TestCalendarFeedURL(t *testing.T) {
	e := ownerEnv(t)
	feedsOn(t, e)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Dentist", "due": map[string]any{"date": "2026-10-16", "time": "15:00"}, "estimate_minutes": 45})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("GET", "/api/v1/calendar-feeds/feed", nil)
	e.mustStatus(resp, 200, out)
	if out["feed"] != nil {
		t.Fatalf("feed before create = %v", out)
	}
	resp, out = e.do("POST", "/api/v1/calendar-feeds/feed", nil)
	e.mustStatus(resp, 201, out)
	url := out["url"].(string)
	path := url[strings.Index(url, "/feeds/"):]
	anon := newClientAt(e, "10.9.9.11")
	resp, body := anon.raw("GET", path, nil)
	if resp.StatusCode != 200 || !strings.Contains(string(body), "SUMMARY:Dentist") || !strings.HasPrefix(resp.Header.Get("Content-Type"), "text/calendar") {
		t.Fatalf("feed = %d %s", resp.StatusCode, body)
	}
	if resp2, _ := anon.raw("GET", path, nil, "If-None-Match", resp.Header.Get("ETag")); resp2.StatusCode != 304 {
		t.Fatalf("etag = %d", resp2.StatusCode)
	}
	// The URL is returned once: the GET only describes it.
	resp, out = e.do("GET", "/api/v1/calendar-feeds/feed", nil)
	if out["url"] != nil || out["feed"] == nil {
		t.Fatalf("describe = %v", out)
	}
	// The secret is no bearer token.
	secret := strings.TrimSuffix(strings.TrimPrefix(path, "/feeds/"), "/tasks.ics")
	if resp, _ := anon.do("GET", "/api/v1/me", nil, "Authorization", "Bearer "+secret); resp.StatusCode != 401 {
		t.Fatalf("secret as bearer = %d", resp.StatusCode)
	}
	// Rotation needs a fresh sign-in and invalidates the old URL.
	e.staleSessions()
	resp, out = e.do("POST", "/api/v1/calendar-feeds/feed", nil)
	if resp.StatusCode != 403 || errCode(out) != "reauth_required" {
		t.Fatalf("stale rotate = %d %v", resp.StatusCode, out)
	}
	if _, err := e.db.Exec("UPDATE session_auth SET reauth_at = ?", 1<<62); err != nil {
		t.Fatal(err)
	}
	resp, out = e.do("POST", "/api/v1/calendar-feeds/feed", nil)
	e.mustStatus(resp, 201, out)
	if resp, _ := anon.raw("GET", path, nil); resp.StatusCode != 404 {
		t.Fatalf("old url after rotation = %d", resp.StatusCode)
	}
	resp, _ = e.do("DELETE", "/api/v1/calendar-feeds/feed", nil)
	e.mustStatus(resp, 204, nil)
	resp, _ = e.do("DELETE", "/api/v1/calendar-feeds/feed", nil)
	if resp.StatusCode != 404 {
		t.Fatalf("second revoke = %d", resp.StatusCode)
	}
	// The rotation is in the user's own activity.
	resp, out = e.do("GET", "/api/v1/me/activity", nil)
	e.mustStatus(resp, 200, out)
	if !strings.Contains(fmt.Sprint(out), "calendar_feed.rotated") {
		t.Fatalf("activity = %v", out)
	}
	// Unknown secrets count per address: the 11th is refused.
	bad := newClientAt(e, "10.9.9.12")
	for i := 0; i < 10; i++ {
		bad.raw("GET", fmt.Sprintf("/feeds/otfeed_nope%d/tasks.ics", i), nil)
	}
	if resp, _ := bad.raw("GET", "/feeds/otfeed_nope/tasks.ics", nil); resp.StatusCode != 429 {
		t.Fatalf("11th unknown = %d", resp.StatusCode)
	}
}
