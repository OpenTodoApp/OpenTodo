package httpapi

import (
	"crypto/ecdh"
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/push"
	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// pushEnv is newEnv with the push service wired, registered as the owner.
func pushEnv(t *testing.T, disabled bool) (*env, *push.Service) {
	t.Helper()
	dir := t.TempDir()
	db, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	cfg := config.Config{SessionTTL: time.Hour, PushDisabled: disabled}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	syncSvc := opsync.NewService(db)
	p := push.New(db, syncSvc, dir, push.Options{AllowHTTP: true, Client: http.DefaultClient})
	h := New(cfg, auth.NewService(db, cfg.SessionTTL, false), syncSvc, nil, log, "test", WithPush(p))
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	t.Cleanup(syncSvc.Notifier().CloseAll)
	jar, _ := cookiejar.New(nil)
	e := &env{t: t, srv: srv, client: &http.Client{Jar: jar}, db: db, handler: h, sync: syncSvc}
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	return e, p
}

func subscriptionBody(device string) map[string]any {
	ua, _ := ecdh.P256().GenerateKey(nil)
	return map[string]any{
		"deviceId": device,
		"endpoint": "https://push.example.net/send/" + device,
		"keys": map[string]string{
			"p256dh": base64.RawURLEncoding.EncodeToString(ua.PublicKey().Bytes()),
			"auth":   base64.RawURLEncoding.EncodeToString([]byte("0123456789abcdef")),
		},
	}
}

func TestPushRoutesRequireAuth(t *testing.T) {
	e, _ := pushEnv(t, false)
	anon := newClientFor(e)
	for _, c := range []struct{ method, path string }{
		{"GET", "/api/v1/push/vapid-key"},
		{"POST", "/api/v1/push/subscriptions"},
		{"DELETE", "/api/v1/push/subscriptions/abc"},
	} {
		resp, out := anon.do(c.method, c.path, subscriptionBody("d"))
		anon.mustStatus(resp, 401, out)
		if errCode(out) != "unauthorized" {
			t.Fatalf("%s %s: code %q", c.method, c.path, errCode(out))
		}
	}
	// Signed in: key, subscribe (201), status by device, unsubscribe (204), 404 after.
	resp, out := e.do("GET", "/api/v1/push/vapid-key", nil)
	e.mustStatus(resp, 200, out)
	key, _ := base64.RawURLEncoding.DecodeString(out["publicKey"].(string))
	if len(key) != 65 {
		t.Fatalf("publicKey = %v", out["publicKey"])
	}
	resp, out = e.do("POST", "/api/v1/push/subscriptions", subscriptionBody("phone"))
	e.mustStatus(resp, 201, out)
	sub := out["subscription"].(map[string]any)
	id := sub["id"].(string)
	if _, leaks := sub["endpoint"]; leaks {
		t.Fatalf("response leaks the endpoint: %v", sub)
	}
	resp, out = e.do("POST", "/api/v1/push/subscriptions", subscriptionBody("phone"))
	e.mustStatus(resp, 200, out)
	if out["subscription"].(map[string]any)["id"] != id {
		t.Fatal("re-subscribing the same device created a second subscription")
	}
	resp, out = e.do("GET", "/api/v1/push/vapid-key?device=phone", nil)
	e.mustStatus(resp, 200, out)
	if s, _ := out["subscription"].(map[string]any); s == nil || s["id"] != id || s["needsRenewal"] != false {
		t.Fatalf("device status = %v", out)
	}
	resp, out = e.do("DELETE", "/api/v1/push/subscriptions/"+id, nil)
	e.mustStatus(resp, 204, out)
	resp, out = e.do("DELETE", "/api/v1/push/subscriptions/"+id, nil)
	e.mustStatus(resp, 404, out)
	resp, out = e.do("GET", "/api/v1/push/vapid-key?device=phone", nil)
	e.mustStatus(resp, 200, out)
	if v, present := out["subscription"]; !present || v != nil {
		t.Fatalf("status after delete = %v", out)
	}
}

func TestPushSubscribeRejectsMissingKeys(t *testing.T) {
	e, p := pushEnv(t, false)
	for name, mutate := range map[string]func(map[string]any){
		"no endpoint":  func(b map[string]any) { delete(b, "endpoint") },
		"no keys":      func(b map[string]any) { delete(b, "keys") },
		"short auth":   func(b map[string]any) { b["keys"].(map[string]string)["auth"] = "AAAA" },
		"bad p256dh":   func(b map[string]any) { b["keys"].(map[string]string)["p256dh"] = "bm90IGEga2V5" },
		"no device":    func(b map[string]any) { delete(b, "deviceId") },
		"relative url": func(b map[string]any) { b["endpoint"] = "/send/x" },
	} {
		b := subscriptionBody("phone")
		mutate(b)
		resp, out := e.do("POST", "/api/v1/push/subscriptions", b)
		e.mustStatus(resp, 400, out)
		if errCode(out) != "invalid_input" {
			t.Fatalf("%s: code %q", name, errCode(out))
		}
	}
	var n int
	_ = e.db.QueryRow(`SELECT COUNT(*) FROM push_subscriptions`).Scan(&n)
	if n != 0 {
		t.Fatalf("%d subscriptions stored from invalid bodies", n)
	}
	_ = p
}

func TestPushDisabledReturnsNotFound(t *testing.T) {
	e, _ := pushEnv(t, true)
	for _, c := range []struct{ method, path string }{
		{"GET", "/api/v1/push/vapid-key"},
		{"POST", "/api/v1/push/subscriptions"},
		{"DELETE", "/api/v1/push/subscriptions/abc"},
	} {
		resp, out := e.do(c.method, c.path, subscriptionBody("d"))
		e.mustStatus(resp, 404, out)
		if errCode(out) != "not_found" {
			t.Fatalf("%s %s: code %q", c.method, c.path, errCode(out))
		}
	}
}

func TestSignOutRemovesPushSubscription(t *testing.T) {
	e, p := pushEnv(t, false)
	resp, out := e.do("POST", "/api/v1/push/subscriptions", subscriptionBody("phone"))
	e.mustStatus(resp, 201, out)
	// A second browser of the same user keeps its own subscription.
	other := newClientFor(e)
	resp, out = other.do("POST", "/api/v1/auth/login", map[string]string{"email": "owner@example.com", "password": "correct horse battery"})
	other.mustStatus(resp, 200, out)
	resp, out = other.do("POST", "/api/v1/push/subscriptions", subscriptionBody("laptop"))
	other.mustStatus(resp, 201, out)

	resp, out = e.do("POST", "/api/v1/auth/logout", nil)
	e.mustStatus(resp, 204, out)
	var devices []string
	rows, err := e.db.Query(`SELECT device_id FROM push_subscriptions`)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var d string
		_ = rows.Scan(&d)
		devices = append(devices, d)
	}
	rows.Close()
	if len(devices) != 1 || devices[0] != "laptop" {
		t.Fatalf("subscriptions after sign-out = %v, want only laptop", devices)
	}
	// Revoking the remaining session (any path that deletes the row) removes its subscription too.
	if _, err := e.db.Exec(`DELETE FROM sessions`); err != nil {
		t.Fatal(err)
	}
	var n int
	_ = e.db.QueryRow(`SELECT COUNT(*) FROM push_subscriptions`).Scan(&n)
	if n != 0 {
		t.Fatalf("%d subscriptions left after session revocation", n)
	}
	_ = p
}

func TestRestDueChangeMovesRelativeReminders(t *testing.T) {
	e, _ := pushEnv(t, false)
	// The device reports UTC+2; REST writes then compute in that zone.
	e.do("POST", "/api/v1/sync", map[string]any{"device": "devA", "cursor": 0, "ops": []any{}, "tzOffset": 120})
	resp, task := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Call", "due": map[string]any{"date": "2026-10-11", "time": "10:00"}})
	e.mustStatus(resp, 201, task)
	id := task["id"].(string)
	resp, rel := e.do("POST", "/api/v1/reminders", map[string]any{"task_id": id, "kind": "relative", "offset_minutes": -30})
	e.mustStatus(resp, 201, rel)
	want := time.Date(2026, 10, 11, 9, 30, 0, 0, time.FixedZone("", 7200)).UnixMilli()
	if int64(rel["fire_at"].(float64)) != want {
		t.Fatalf("created fire_at = %v, want %d", rel["fire_at"], want)
	}
	resp, abs := e.do("POST", "/api/v1/reminders", map[string]any{"task_id": id, "kind": "absolute", "fire_at": 1_000})
	e.mustStatus(resp, 201, abs)
	resp, out := e.do("POST", "/api/v1/reminders", map[string]any{"task_id": "nope", "kind": "absolute", "fire_at": 1_000})
	e.mustStatus(resp, 400, out)

	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"due": map[string]any{"date": "2026-10-16", "time": "15:00"}})
	e.mustStatus(resp, 200, out)
	resp, rel = e.do("GET", "/api/v1/reminders/"+rel["id"].(string), nil)
	e.mustStatus(resp, 200, rel)
	want = time.Date(2026, 10, 16, 14, 30, 0, 0, time.FixedZone("", 7200)).UnixMilli()
	if int64(rel["fire_at"].(float64)) != want {
		t.Fatalf("moved fire_at = %v, want %d", rel["fire_at"], want)
	}
	resp, abs = e.do("GET", "/api/v1/reminders/"+abs["id"].(string), nil)
	e.mustStatus(resp, 200, abs)
	if abs["fire_at"].(float64) != 1_000 {
		t.Fatalf("absolute reminder moved: %v", abs)
	}
	// The due op and the reminder op share a timestamp.
	var dueTS, fireTS int64
	_ = e.db.QueryRow(`SELECT ts FROM scope_fields WHERE entity='task' AND field='due'`).Scan(&dueTS)
	_ = e.db.QueryRow(`SELECT ts FROM scope_fields WHERE entity='reminder' AND entity_id=? AND field='fire_at'`, rel["id"]).Scan(&fireTS)
	if dueTS != fireTS {
		t.Fatalf("due ts %d != fire_at ts %d", dueTS, fireTS)
	}
	// Clearing the due date keeps the reminder without a firing time.
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"due": nil})
	e.mustStatus(resp, 200, out)
	resp, rel = e.do("GET", "/api/v1/reminders/"+rel["id"].(string), nil)
	e.mustStatus(resp, 200, rel)
	if rel["fire_at"] != nil {
		t.Fatalf("fire_at after clearing due = %v", rel["fire_at"])
	}
	// A recurring series completed over REST rolls forward and its reminders follow.
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"due": map[string]any{"date": "2026-10-12", "time": "09:30"}, "recurrence": "every day"})
	e.mustStatus(resp, 200, out)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"completed_at": time.Now().UnixMilli()})
	e.mustStatus(resp, 200, out)
	var d due
	raw, _ := json.Marshal(out["due"])
	_ = json.Unmarshal(raw, &d)
	resp, rel = e.do("GET", "/api/v1/reminders/"+rel["id"].(string), nil)
	e.mustStatus(resp, 200, rel)
	at, _ := dueInstantMs(&d, time.FixedZone("", 7200))
	if d.Date == "2026-10-12" || int64(rel["fire_at"].(float64)) != at-30*60_000 {
		t.Fatalf("after roll: due %+v, fire_at %v", d, rel["fire_at"])
	}
}
