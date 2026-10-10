package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	gosync "sync"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/webhook"
)

// memberEnv returns the owner env plus a signed-in member admitted by invitation.
func memberEnv(t *testing.T) (owner, member *env) {
	t.Helper()
	owner = ownerEnv(t)
	_, secret, _ := owner.invite(map[string]any{})
	member = newClientAt(owner, "10.9.9.9")
	member.hooks, member.clock = owner.hooks, owner.clock
	resp, out := member.do("POST", "/api/v1/auth/register", map[string]string{"email": "m@example.com", "password": "another long password", "invitation": secret})
	member.mustStatus(resp, 201, out)
	return owner, member
}

// hookReceiver records deliveries and answers with scripted status codes.
type hookReceiver struct {
	srv   *httptest.Server
	mu    gosync.Mutex
	codes []int
	got   []*http.Request
	body  [][]byte
}

func newHookReceiver(t *testing.T, codes ...int) *hookReceiver {
	r := &hookReceiver{codes: codes}
	r.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		b, _ := io.ReadAll(req.Body)
		r.mu.Lock()
		r.got = append(r.got, req)
		r.body = append(r.body, b)
		code := 200
		if len(r.codes) > 0 {
			code = r.codes[0]
			if len(r.codes) > 1 {
				r.codes = r.codes[1:]
			}
		}
		r.mu.Unlock()
		w.WriteHeader(code)
		_, _ = w.Write([]byte("ok"))
	}))
	t.Cleanup(r.srv.Close)
	return r
}

func (r *hookReceiver) requests() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.got)
}

func (e *env) allowPrivate(allow bool) {
	e.t.Helper()
	resp, out := e.do("PUT", "/api/v1/settings/webhooks", map[string]any{"allowPrivate": allow})
	e.mustStatus(resp, 200, out)
}

func (e *env) createHook(body map[string]any) map[string]any {
	e.t.Helper()
	resp, out := e.do("POST", "/api/v1/webhooks", body)
	e.mustStatus(resp, 201, out)
	return out["webhook"].(map[string]any)
}

func TestWebhookRoutesRequireAuth(t *testing.T) {
	e := ownerEnv(t)
	anon := newClientFor(e)
	routes := [][2]string{
		{"GET", "/api/v1/webhooks"},
		{"POST", "/api/v1/webhooks"},
		{"GET", "/api/v1/webhooks/x"},
		{"PATCH", "/api/v1/webhooks/x"},
		{"DELETE", "/api/v1/webhooks/x"},
		{"POST", "/api/v1/webhooks/x/test"},
		{"GET", "/api/v1/webhooks/x/deliveries"},
		{"POST", "/api/v1/webhooks/x/deliveries/y/redeliver"},
		{"GET", "/api/v1/settings/webhooks"},
		{"PUT", "/api/v1/settings/webhooks"},
	}
	for _, rt := range routes {
		resp, out := anon.do(rt[0], rt[1], map[string]any{"url": "https://example.com", "events": []string{"task.created"}, "allowPrivate": true})
		anon.mustStatus(resp, 401, out)
		if errCode(out) != "unauthorized" {
			t.Fatalf("%s %s: %v", rt[0], rt[1], out)
		}
	}
	// A wrong bearer token is refused too.
	bare := &env{t: t, srv: e.srv, client: &http.Client{}}
	resp, out := bare.do("GET", "/api/v1/webhooks", nil, "Authorization", "Bearer ot_nope")
	bare.mustStatus(resp, 401, out)
	// Nothing was created by the anonymous POST.
	resp, out = e.do("GET", "/api/v1/webhooks", nil)
	e.mustStatus(resp, 200, out)
	if len(out["webhooks"].([]any)) != 0 {
		t.Fatalf("webhooks = %v", out["webhooks"])
	}
}

func TestWebhookValidation400(t *testing.T) {
	e := ownerEnv(t)
	cases := []struct {
		body  map[string]any
		field string
	}{
		{map[string]any{"url": "ftp://example.com/x", "events": []string{"task.created"}}, "url"},
		{map[string]any{"url": "javascript:alert(1)", "events": []string{"task.created"}}, "url"},
		{map[string]any{"events": []string{"task.created"}}, "url"},
		{map[string]any{"url": "https://example.com/" + strings.Repeat("a", 2100), "events": []string{"task.created"}}, "url"},
		{map[string]any{"url": "https://93.184.216.34/h", "events": []string{"task.exploded"}}, "events"},
		{map[string]any{"url": "https://93.184.216.34/h", "events": []string{}}, "events"},
		{map[string]any{"url": "https://93.184.216.34/h"}, "events"},
		{map[string]any{"url": "https://93.184.216.34/h", "events": "task.created"}, "events"},
		{map[string]any{"url": "https://93.184.216.34/h", "events": []string{"task.created"}, "projectId": 7}, "projectId"},
		{map[string]any{"url": "https://93.184.216.34/h", "events": []string{"task.created"}, "enabled": "yes"}, "enabled"},
	}
	for i, c := range cases {
		resp, out := e.do("POST", "/api/v1/webhooks", c.body)
		e.mustStatus(resp, 400, out)
		msg := out["error"].(map[string]any)["message"].(string)
		if errCode(out) != "invalid_input" || !strings.HasPrefix(msg, c.field+":") {
			t.Fatalf("case %d: %v", i, out)
		}
	}
	resp, out := e.do("GET", "/api/v1/webhooks", nil)
	e.mustStatus(resp, 200, out)
	if len(out["webhooks"].([]any)) != 0 {
		t.Fatal("an invalid webhook was stored")
	}
	// PATCH validates too.
	hook := e.createHook(map[string]any{"url": "https://93.184.216.34/h", "events": []string{"task.created"}})
	resp, out = e.do("PATCH", "/api/v1/webhooks/"+hook["id"].(string), map[string]any{"events": []string{}})
	e.mustStatus(resp, 400, out)
	// The 21st webhook is refused.
	for i := 1; i < webhook.MaxWebhooksPerUser; i++ {
		e.createHook(map[string]any{"url": "https://93.184.216.34/h", "events": []string{"task.created"}})
	}
	resp, out = e.do("POST", "/api/v1/webhooks", map[string]any{"url": "https://93.184.216.34/h", "events": []string{"task.created"}})
	e.mustStatus(resp, 409, out)
	if errCode(out) != "limit_reached" {
		t.Fatalf("limit: %v", out)
	}
}

func TestPrivateTargetRefused400(t *testing.T) {
	e := ownerEnv(t)
	for _, u := range []string{"http://192.168.1.10:8123/api/webhook/plants", "http://127.0.0.1:9/x", "http://[::1]/x", "http://169.254.169.254/latest/meta-data", "http://[::ffff:10.0.0.1]/x", "http://100.100.1.1/x"} {
		resp, out := e.do("POST", "/api/v1/webhooks", map[string]any{"url": u, "events": []string{"task.completed"}})
		e.mustStatus(resp, 400, out)
		if errCode(out) != "private_target" || !strings.Contains(out["error"].(map[string]any)["message"].(string), "owner") {
			t.Fatalf("%s: %v", u, out)
		}
	}
	// PATCHing an existing webhook to a private target is refused as well.
	hook := e.createHook(map[string]any{"url": "https://93.184.216.34/h", "events": []string{"task.created"}})
	resp, out := e.do("PATCH", "/api/v1/webhooks/"+hook["id"].(string), map[string]any{"url": "http://10.0.0.8/x"})
	e.mustStatus(resp, 400, out)
	if errCode(out) != "private_target" {
		t.Fatalf("patch: %v", out)
	}
	// Once the owner allows private targets the same webhook is accepted.
	e.allowPrivate(true)
	e.createHook(map[string]any{"url": "http://192.168.1.10:8123/api/webhook/plants", "events": []string{"task.completed"}})
}

func TestForeignWebhook404(t *testing.T) {
	owner, member := memberEnv(t)
	hook := owner.createHook(map[string]any{"url": "https://93.184.216.34/h", "events": []string{"task.created"}})
	id := hook["id"].(string)
	for _, rt := range [][2]string{
		{"GET", "/api/v1/webhooks/" + id},
		{"PATCH", "/api/v1/webhooks/" + id},
		{"DELETE", "/api/v1/webhooks/" + id},
		{"POST", "/api/v1/webhooks/" + id + "/test"},
		{"GET", "/api/v1/webhooks/" + id + "/deliveries"},
	} {
		resp, out := member.do(rt[0], rt[1], map[string]any{"enabled": false})
		member.mustStatus(resp, 404, out)
		if errCode(out) != "not_found" {
			t.Fatalf("%s %s: %v", rt[0], rt[1], out)
		}
	}
	resp, out := member.do("GET", "/api/v1/webhooks", nil)
	member.mustStatus(resp, 200, out)
	if len(out["webhooks"].([]any)) != 0 {
		t.Fatal("member sees the owner's webhook")
	}
	resp, out = owner.do("GET", "/api/v1/webhooks/"+id, nil)
	owner.mustStatus(resp, 200, out)
	if out["webhook"].(map[string]any)["enabled"] != true {
		t.Fatal("member changed the owner's webhook")
	}
}

func TestRedeliverUnknown404(t *testing.T) {
	owner, member := memberEnv(t)
	owner.allowPrivate(true)
	rcv := newHookReceiver(t, 200)
	a := owner.createHook(map[string]any{"url": rcv.srv.URL, "events": []string{"task.created"}})
	b := owner.createHook(map[string]any{"url": rcv.srv.URL, "events": []string{"task.created"}})
	resp, out := owner.do("POST", "/api/v1/webhooks/"+a["id"].(string)+"/test", nil)
	owner.mustStatus(resp, 200, out)
	did := out["delivery"].(map[string]any)["id"].(string)

	// Unknown id, and a real delivery id that belongs to another webhook.
	resp, out = owner.do("POST", "/api/v1/webhooks/"+a["id"].(string)+"/deliveries/nope/redeliver", nil)
	owner.mustStatus(resp, 404, out)
	resp, out = owner.do("POST", "/api/v1/webhooks/"+b["id"].(string)+"/deliveries/"+did+"/redeliver", nil)
	owner.mustStatus(resp, 404, out)
	if errCode(out) != "not_found" {
		t.Fatalf("error = %v", out)
	}
	// Another account cannot redeliver it either.
	resp, out = member.do("POST", "/api/v1/webhooks/"+a["id"].(string)+"/deliveries/"+did+"/redeliver", nil)
	member.mustStatus(resp, 404, out)
	// The right pair works: 202 with a new delivery id.
	resp, out = owner.do("POST", "/api/v1/webhooks/"+a["id"].(string)+"/deliveries/"+did+"/redeliver", nil)
	owner.mustStatus(resp, 202, out)
	if out["delivery"].(map[string]any)["id"] == did {
		t.Fatal("redelivery must get a new id")
	}
}

func TestSecretNotInReads(t *testing.T) {
	e := ownerEnv(t)
	hook := e.createHook(map[string]any{"url": "https://93.184.216.34/h", "events": []string{"task.completed", "task.created"}})
	secret, _ := hook["secret"].(string)
	if !strings.HasPrefix(secret, "whsec_") {
		t.Fatalf("create response = %v", hook)
	}
	if ev := hook["events"].([]any); len(ev) != 2 || ev[0] != "task.created" {
		t.Fatalf("events = %v", ev)
	}
	id := hook["id"].(string)
	check := func(path string, method string, body any) {
		t.Helper()
		resp, raw := e.rawDo(method, path, body)
		if resp.StatusCode != 200 {
			t.Fatalf("%s %s: %d", method, path, resp.StatusCode)
		}
		if strings.Contains(raw, secret) || strings.Contains(raw, `"secret"`) {
			t.Fatalf("%s %s leaks the secret: %s", method, path, raw)
		}
	}
	check("/api/v1/webhooks", "GET", nil)
	check("/api/v1/webhooks/"+id, "GET", nil)
	check("/api/v1/webhooks/"+id, "PATCH", map[string]any{"enabled": false})
	check("/api/v1/webhooks/"+id+"/deliveries", "GET", nil)
	resp, out := e.do("DELETE", "/api/v1/webhooks/"+id, nil)
	e.mustStatus(resp, 204, out)
	resp, out = e.do("GET", "/api/v1/webhooks/"+id, nil)
	e.mustStatus(resp, 404, out)
}

// rawDo returns the response body as a string.
func (e *env) rawDo(method, path string, body any) (*http.Response, string) {
	e.t.Helper()
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = strings.NewReader(string(b))
	}
	req, _ := http.NewRequest(method, e.srv.URL+path, rd)
	req.Header.Set("Content-Type", "application/json")
	resp, err := e.client.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	return resp, string(raw)
}

func TestWebhookPolicyForbidsMembers(t *testing.T) {
	owner, member := memberEnv(t)
	resp, out := member.do("PUT", "/api/v1/settings/webhooks", map[string]any{"allowPrivate": true})
	member.mustStatus(resp, 403, out)
	if errCode(out) != "forbidden" {
		t.Fatalf("error = %v", out)
	}
	resp, out = member.do("GET", "/api/v1/settings/webhooks", nil)
	member.mustStatus(resp, 403, out)
	resp, out = owner.do("GET", "/api/v1/settings/webhooks", nil)
	owner.mustStatus(resp, 200, out)
	if out["allowPrivate"] != false {
		t.Fatalf("policy changed by member: %v", out)
	}
	resp, out = owner.do("PUT", "/api/v1/settings/webhooks", map[string]any{})
	owner.mustStatus(resp, 400, out)
	owner.allowPrivate(true)
	resp, out = owner.do("GET", "/api/v1/settings/webhooks", nil)
	if out["allowPrivate"] != true {
		t.Fatalf("policy = %v", out)
	}
	// Members can still manage their own webhooks.
	member.createHook(map[string]any{"url": "https://93.184.216.34/h", "events": []string{"task.created"}})
}

func TestWebhookPolicyPresetSeedsOnce(t *testing.T) {
	e := ownerEnv(t)
	ctx := context.Background()
	yes := true
	// First start with OPENTODO_WEBHOOKS_ALLOW_PRIVATE=true seeds the policy.
	if err := e.hooks.SeedAllowPrivate(ctx, &yes); err != nil {
		t.Fatal(err)
	}
	resp, out := e.do("GET", "/api/v1/settings/webhooks", nil)
	e.mustStatus(resp, 200, out)
	if out["allowPrivate"] != true {
		t.Fatalf("seeded policy = %v", out)
	}
	// The owner turns it off in Settings; a restart with the same preset keeps it off.
	e.allowPrivate(false)
	restarted := webhook.New(e.db, nil, webhook.Options{})
	if err := restarted.SeedAllowPrivate(ctx, &yes); err != nil {
		t.Fatal(err)
	}
	resp, out = e.do("GET", "/api/v1/settings/webhooks", nil)
	if out["allowPrivate"] != false {
		t.Fatalf("preset overrode the owner's choice: %v", out)
	}
}

// TestWebhookEndToEnd: a fake device completes a task through /api/v1/sync and
// the in-process receiver gets one signed task.completed delivery; then a
// receiver outage (503) is retried on schedule and succeeds.
func TestWebhookEndToEnd(t *testing.T) {
	e := ownerEnv(t)
	e.allowPrivate(true) // the receiver listens on loopback
	rcv := newHookReceiver(t, 200, 200, 503, 200)

	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Water plants"})
	e.mustStatus(resp, 201, out)
	taskID := out["id"].(string)
	// Created before the webhook: no delivery for it.
	hook := e.createHook(map[string]any{"url": rcv.srv.URL, "events": []string{"task.completed", "task.updated"}})
	secret := hook["secret"].(string)
	hookID := hook["id"].(string)

	// The test ping reports success with status and duration, and is logged.
	resp, out = e.do("POST", "/api/v1/webhooks/"+hookID+"/test", nil)
	e.mustStatus(resp, 200, out)
	ping := out["delivery"].(map[string]any)
	if out["ok"] != true || ping["statusCode"] != float64(200) || ping["durationMs"] == nil || ping["event"] != "ping" {
		t.Fatalf("test = %v", out)
	}

	// A device that was offline syncs a completion an hour later.
	completedAt := time.Now().UnixMilli() - 3600_000
	resp, out = e.do("POST", "/api/v1/sync", map[string]any{"device": "phone-1", "cursor": 0, "ops": []any{
		map[string]any{"id": "phone-op-1", "entity": "task", "entityId": taskID, "field": "completed_at", "value": completedAt, "ts": time.Now().UnixMilli(), "device": "phone-1"},
	}})
	e.mustStatus(resp, 200, out)
	// Re-sending the same op (client retry) and a stale title op emit nothing.
	resp, out = e.do("POST", "/api/v1/sync", map[string]any{"device": "phone-1", "cursor": 0, "ops": []any{
		map[string]any{"id": "phone-op-1", "entity": "task", "entityId": taskID, "field": "completed_at", "value": completedAt, "ts": time.Now().UnixMilli(), "device": "phone-1"},
		map[string]any{"id": "phone-op-2", "entity": "task", "entityId": taskID, "field": "title", "value": "old title", "ts": 1, "device": "phone-1"},
	}})
	e.mustStatus(resp, 200, out)
	for e.hooks.ProcessDue(context.Background()) > 0 {
	}
	if rcv.requests() != 2 { // ping + task.completed
		t.Fatalf("receiver saw %d requests", rcv.requests())
	}
	rcv.mu.Lock()
	req, body := rcv.got[1], rcv.body[1]
	rcv.mu.Unlock()
	ts, _ := strconv.ParseInt(req.Header.Get("X-OpenTodo-Timestamp"), 10, 64)
	if !webhook.Verify(secret, ts, body, req.Header.Get("X-OpenTodo-Signature")) {
		t.Fatal("delivery signature does not verify")
	}
	if req.Header.Get("X-OpenTodo-Event") != "task.completed" || req.Header.Get("X-OpenTodo-Webhook") != hookID || req.Header.Get("Content-Type") != "application/json" {
		t.Fatalf("headers = %v", req.Header)
	}
	var payload struct {
		Version int    `json:"version"`
		ID      string `json:"id"`
		Event   string `json:"event"`
		Source  string `json:"source"`
		Device  string `json:"device"`
		Data    struct {
			Task map[string]any `json:"task"`
		} `json:"data"`
		Changes map[string]struct {
			From any `json:"from"`
			To   any `json:"to"`
		} `json:"changes"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Version != 1 || payload.Event != "task.completed" || payload.Source != "device" || payload.Device != "phone-1" || payload.ID != req.Header.Get("X-OpenTodo-Delivery") {
		t.Fatalf("payload = %+v", payload)
	}
	if len(payload.Changes) != 1 || payload.Changes["completed_at"].From != nil || payload.Changes["completed_at"].To != float64(completedAt) {
		t.Fatalf("changes = %+v", payload.Changes)
	}
	if payload.Data.Task["title"] != "Water plants" || payload.Data.Task["completed_at"] != float64(completedAt) {
		t.Fatalf("data = %v", payload.Data.Task)
	}

	// REST priority change 4 -> 1 while the receiver is down (503), then back (200).
	resp, out = e.do("PATCH", "/api/v1/tasks/"+taskID, map[string]any{"priority": 1})
	e.mustStatus(resp, 200, out)
	for e.hooks.ProcessDue(context.Background()) > 0 {
	}
	resp, out = e.do("GET", "/api/v1/webhooks/"+hookID+"/deliveries", nil)
	e.mustStatus(resp, 200, out)
	latest := out["deliveries"].([]any)[0].(map[string]any)
	if latest["event"] != "task.updated" || latest["status"] != "retry" || latest["statusCode"] != float64(503) || latest["attempts"] != float64(1) {
		t.Fatalf("after outage = %v", latest)
	}
	e.clock.Advance(webhook.RetrySchedule[0])
	for e.hooks.ProcessDue(context.Background()) > 0 {
	}
	resp, out = e.do("GET", "/api/v1/webhooks/"+hookID+"/deliveries", nil)
	list := out["deliveries"].([]any)
	latest = list[0].(map[string]any)
	if latest["status"] != "delivered" || latest["attempts"] != float64(2) || latest["statusCode"] != float64(200) || latest["responseExcerpt"] != "ok" {
		t.Fatalf("after retry = %v", latest)
	}
	if len(list) != 3 {
		t.Fatalf("log = %v", list)
	}
	rcv.mu.Lock()
	var upd map[string]any
	_ = json.Unmarshal(rcv.body[len(rcv.body)-1], &upd)
	rcv.mu.Unlock()
	if fmt.Sprint(upd["changes"]) != "map[priority:map[from:4 to:1]]" || upd["source"] != "server" {
		t.Fatalf("update payload = %v", upd)
	}
}
