package httpapi

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

// Notification channels over HTTP (OpenSpec change notification-channels,
// tasks 2.1). The services are fakes on loopback; nothing leaves the machine.

func channelOf(out map[string]any) map[string]any {
	c, _ := out["channel"].(map[string]any)
	return c
}

func TestChannelsSwitch(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("GET", "/api/v1/settings/notification-channels", nil)
	e.mustStatus(resp, 200, out)
	if out["enabled"] != true {
		t.Fatalf("default = %v", out)
	}
	m, _ := e.member("m@example.com", "198.51.100.31")
	if resp, out := m.do("PUT", "/api/v1/settings/notification-channels", map[string]any{"enabled": false}); resp.StatusCode != 403 || errCode(out) != "forbidden" {
		t.Fatalf("member put = %d %v", resp.StatusCode, out)
	}
	anon := newClientAt(e, "10.9.9.11")
	for _, p := range []string{"/api/v1/settings/notification-channels", "/api/v1/notification-channels"} {
		if resp, out := anon.do("GET", p, nil); resp.StatusCode != 401 || errCode(out) != "unauthorized" {
			t.Fatalf("anonymous %s = %d %v", p, resp.StatusCode, out)
		}
	}
	resp, out = e.do("PUT", "/api/v1/settings/notification-channels", map[string]any{"enabled": false})
	e.mustStatus(resp, 200, out)
	if resp, out := m.do("GET", "/api/v1/notification-channels", nil); resp.StatusCode != 404 || errCode(out) != "channels_disabled" {
		t.Fatalf("off = %d %v", resp.StatusCode, out)
	}
	var n int
	e.db.QueryRow(`SELECT COUNT(*) FROM audit_events WHERE name = 'settings.changed' AND details LIKE '%notifications.channels%'`).Scan(&n)
	if n != 1 {
		t.Fatalf("%d settings.changed events", n)
	}
}

func TestChannelLifecycle(t *testing.T) {
	e := ownerEnv(t)
	var hits atomic.Int32
	var lastAuth atomic.Value
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		lastAuth.Store(r.Header.Get("X-Gotify-Key"))
		_, _ = io.Copy(io.Discard, r.Body)
		w.WriteHeader(200)
	}))
	t.Cleanup(srv.Close)
	body := map[string]any{"kind": "gotify", "name": "Home", "url": srv.URL, "token": "gotify-app-token", "events": []string{"reminder", "assigned"}, "lang": "de-DE", "origin": "https://todo.example.com/app"}
	// A loopback server is a private target until the owner allows them.
	resp, out := e.do("POST", "/api/v1/notification-channels", body)
	if resp.StatusCode != 400 || errCode(out) != "private_target" {
		t.Fatalf("private = %d %v", resp.StatusCode, out)
	}
	allowPrivateTargets(t, e)
	resp, out = e.do("POST", "/api/v1/notification-channels", body)
	e.mustStatus(resp, 201, out)
	c := channelOf(out)
	id := c["id"].(string)
	raw, _ := json.Marshal(out)
	if strings.Contains(string(raw), "gotify-app-token") || c["tokenSet"] != true || c["lang"] != "de" || c["includeTitles"] != false {
		t.Fatalf("created = %s", raw)
	}
	resp, out = e.do("GET", "/api/v1/notification-channels", nil)
	e.mustStatus(resp, 200, out)
	if raw, _ := json.Marshal(out); strings.Contains(string(raw), "gotify-app-token") || len(out["channels"].([]any)) != 1 {
		t.Fatalf("list = %s", raw)
	}
	// Invalid input names the field.
	resp, out = e.do("POST", "/api/v1/notification-channels", map[string]any{"kind": "ntfy", "url": srv.URL, "topic": "my topic!"})
	if resp.StatusCode != 400 || errCode(out) != "invalid_input" || out["error"].(map[string]any)["field"] != "topic" {
		t.Fatalf("invalid = %d %v", resp.StatusCode, out)
	}
	// Another account sees nothing of it.
	m, _ := e.member("m2@example.com", "198.51.100.32")
	for _, rq := range [][2]string{{"PATCH", "/api/v1/notification-channels/" + id}, {"DELETE", "/api/v1/notification-channels/" + id},
		{"POST", "/api/v1/notification-channels/" + id + "/test"}, {"GET", "/api/v1/notification-channels/" + id + "/deliveries"}} {
		var b any
		if rq[0] == "PATCH" {
			b = map[string]any{"name": "x"}
		}
		if resp, out := m.do(rq[0], rq[1], b); resp.StatusCode != 404 || errCode(out) != "not_found" {
			t.Fatalf("other %s %s = %d %v", rq[0], rq[1], resp.StatusCode, out)
		}
	}
	// Send test reaches the service with the stored token.
	resp, out = e.do("POST", "/api/v1/notification-channels/"+id+"/test", nil)
	e.mustStatus(resp, 200, out)
	if out["delivered"] != true || hits.Load() != 1 || lastAuth.Load() != "gotify-app-token" {
		t.Fatalf("test = %v hits %d", out, hits.Load())
	}
	// Replacing the token is audited by name, never by value.
	resp, out = e.do("PATCH", "/api/v1/notification-channels/"+id, map[string]any{"token": "new-token", "includeTitles": true})
	e.mustStatus(resp, 200, out)
	var details string
	e.db.QueryRow(`SELECT details FROM audit_events WHERE name = 'notification_channel.updated'`).Scan(&details)
	if !strings.Contains(details, "token") || strings.Contains(details, "new-token") {
		t.Fatalf("audit details = %s", details)
	}
	resp, out = e.do("DELETE", "/api/v1/notification-channels/"+id, nil)
	if resp.StatusCode != 204 {
		t.Fatalf("delete = %d %v", resp.StatusCode, out)
	}
	var n int
	e.db.QueryRow(`SELECT COUNT(*) FROM audit_events WHERE name IN ('notification_channel.created','notification_channel.deleted')`).Scan(&n)
	if n != 2 {
		t.Fatalf("%d create/delete events", n)
	}
}

func TestChannelWebhookSecretShownOnceAndLimits(t *testing.T) {
	e := ownerEnv(t)
	body := map[string]any{"kind": "webhook", "url": "https://hooks.example.com/opentodo"}
	resp, out := e.do("POST", "/api/v1/notification-channels", body)
	e.mustStatus(resp, 201, out)
	secret, _ := out["secret"].(string)
	if !strings.HasPrefix(secret, "whsec_") || channelOf(out)["secretSet"] != true {
		t.Fatalf("created = %v", out)
	}
	resp, out = e.do("GET", "/api/v1/notification-channels", nil)
	e.mustStatus(resp, 200, out)
	if raw, _ := json.Marshal(out); strings.Contains(string(raw), secret) {
		t.Fatalf("secret listed: %s", raw)
	}
	for range 4 {
		resp, out = e.do("POST", "/api/v1/notification-channels", body)
		e.mustStatus(resp, 201, out)
	}
	if resp, out := e.do("POST", "/api/v1/notification-channels", body); resp.StatusCode != 409 || errCode(out) != "limit_reached" {
		t.Fatalf("sixth = %d %v", resp.StatusCode, out)
	}
}
