package httpapi

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/relay"
)

// routines-ai-step 3.2, 3.4: an encrypted account's routine runs on a
// synthetic device over the real relay stream and commits ciphertext.

// routineDevice opens a relay stream that announces caps and returns the
// stream and its key.
func (e *env) routineDevice(device, caps string) (*stream, cipher.AEAD) {
	e.t.Helper()
	priv, _ := ecdh.P256().GenerateKey(rand.Reader)
	key := base64.RawURLEncoding.EncodeToString(priv.PublicKey().Bytes())
	st := e.openStream(e.srv.URL, "/api/v1/relay/events?device="+device+"&key="+key+"&caps="+caps)
	if st.status != 200 {
		return st, nil
	}
	ev, ok := st.next(e.t, "hello", 3*time.Second)
	if !ok {
		e.t.Fatal("no hello")
	}
	var hello struct{ Stream, Key string }
	_ = json.Unmarshal([]byte(ev.data), &hello)
	serverPub, _ := base64.RawURLEncoding.DecodeString(hello.Key)
	peer, err := ecdh.P256().NewPublicKey(serverPub)
	if err != nil {
		e.t.Fatal(err)
	}
	shared, _ := priv.ECDH(peer)
	k, _ := hkdf.Key(sha256.New, shared, []byte(hello.Stream), relay.HKDFInfo, 32)
	blk, _ := aes.NewCipher(k)
	aead, _ := cipher.NewGCM(blk)
	return st, aead
}

func nextRoutine(t *testing.T, st *stream, aead cipher.AEAD) relay.RoutineRun {
	t.Helper()
	ev, ok := st.next(t, "routine", 5*time.Second)
	if !ok {
		t.Fatal("no routine.run request")
	}
	var env struct{ ID, Box string }
	_ = json.Unmarshal([]byte(ev.data), &env)
	raw, _ := base64.RawURLEncoding.DecodeString(env.Box)
	n := aead.NonceSize()
	plain, err := aead.Open(nil, raw[:n], raw[n:], []byte(env.ID))
	if err != nil {
		t.Fatalf("routine request does not open: %v", err)
	}
	// Ids and numbers only: no content in the request.
	if strings.Contains(string(plain), "Milk") {
		t.Fatalf("content in the request: %s", plain)
	}
	var run relay.RoutineRun
	_ = json.Unmarshal(plain, &run)
	return run
}

func encryptedRulesEnv(t *testing.T) *env {
	e := rulesEnv(t, nil)
	resp, out := e.do("PUT", "/api/v1/encryption/keys", keyRecord(1, 7))
	if resp.StatusCode >= 300 {
		t.Fatalf("enable encryption: %d %v", resp.StatusCode, out)
	}
	return e
}

const sealedTitle = "enc:v1:QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFB"

func TestRoutineDeviceRunOverRelay(t *testing.T) {
	e := encryptedRulesEnv(t)
	anon := newClientAt(e, "10.9.9.8")
	for _, p := range []string{"/api/v1/me/rules/runs/x/commit", "/api/v1/me/rules/runs/x/fail", "/api/v1/relay/devices/laptop/routines"} {
		resp, out := anon.do("POST", p, map[string]any{})
		if resp.StatusCode != 401 && resp.StatusCode != 405 {
			t.Fatalf("%s: %d %v", p, resp.StatusCode, out)
		}
	}
	resp, out := anon.do("PUT", "/api/v1/relay/devices/laptop/routines", map[string]any{})
	anon.mustStatus(resp, 401, out)

	// No device opted in: the content routine is skipped as before.
	id := e.create("/api/v1/rules", map[string]any{"name": sealedTitle, "trigger": map[string]any{"kind": "manual"}, "actions": nil,
		"steps": []any{map[string]any{"id": "a", "kind": "create_tasks", "in": map[string]any{"title": map[string]any{"literal": "Milk"}}}}})
	resp, out = e.do("POST", "/api/v1/rules/"+id+"/run", map[string]any{"run_id": "r-0"})
	e.mustStatus(resp, 200, out)
	if run := out["run"].(map[string]any); run["outcome"] != "skipped" || run["reason"] != "encrypted" {
		t.Fatalf("no device: %v", run)
	}

	// "Run my routines on this device", then the device's stream.
	resp, out = e.do("PUT", "/api/v1/relay/devices/laptop/routines", map[string]any{"label": "Laptop"})
	e.mustStatus(resp, 204, out)
	resp, out = e.do("GET", "/api/v1/relay/devices", nil)
	e.mustStatus(resp, 200, out)
	if d := out["devices"].([]any)[0].(map[string]any); d["routines"] != true || d["mcp"] != false {
		t.Fatalf("device %v", d)
	}
	st, aead := e.routineDevice("laptop", "routines")
	defer st.cancel()
	if aead == nil {
		t.Fatalf("stream refused: %d", st.status)
	}
	resp, out = e.do("POST", "/api/v1/rules/"+id+"/run", map[string]any{"run_id": "r-1"})
	e.mustStatus(resp, 200, out)
	if run := out["run"].(map[string]any); run["outcome"] != "waiting_device" || run["device_id"] != "laptop" {
		t.Fatalf("dispatch: %v", run)
	}
	req := nextRoutine(t, st, aead)
	if req.RuleID != id || req.Op != relay.OpRoutineRun {
		t.Fatalf("request %+v", req)
	}
	commit := map[string]any{"outcome": "applied", "steps": []any{map[string]any{"step_id": "a", "kind": "create_tasks", "status": "ok", "items": 1, "output": "tasks", "ids": []string{"t-new"}}},
		"changes": []any{map[string]any{"entity": "task", "id": "t-new", "create": true, "fields": map[string]any{"title": sealedTitle, "priority": 4, "created_at": 1}}}}
	path := "/api/v1/me/rules/runs/" + req.RunID + "/commit"

	// Bearer tokens are refused (the device's own session only).
	c := e.bearerClient()
	resp, out = c.do("POST", path, commit, bearer(e.token(""))...)
	c.mustStatus(resp, 403, out)
	// Another device's session: forbidden.
	other := newClientAt(e, "10.9.9.7")
	resp, out = other.do("POST", "/api/v1/auth/login", map[string]string{"email": "owner@example.com", "password": "correct horse battery"})
	other.mustStatus(resp, 200, out)
	resp, out = other.do("POST", path, commit)
	other.mustStatus(resp, 403, out)
	if errCode(out) != "forbidden" {
		t.Fatalf("other device: %v", out)
	}
	resp, out = e.do("POST", path, map[string]any{"changes": "nope"})
	e.mustStatus(resp, 400, out)

	resp, out = e.do("POST", path, commit)
	e.mustStatus(resp, 200, out)
	if run := out["run"].(map[string]any); run["outcome"] != "applied" || run["writes"] != float64(1) {
		t.Fatalf("commit: %v", run)
	}
	resp, out = e.do("POST", path, commit)
	e.mustStatus(resp, 409, out)
	if errCode(out) != "run_closed" {
		t.Fatalf("twice: %v", out)
	}
	var device string
	if err := e.db.QueryRow(`SELECT device FROM ops WHERE entity_id = 't-new' AND field = 'title'`).Scan(&device); err != nil || device != "rule:"+id {
		t.Fatalf("written by %q: %v", device, err)
	}

	// The routine changes while a run waits: 409 routine_changed.
	resp, out = e.do("POST", "/api/v1/rules/"+id+"/run", map[string]any{"run_id": "r-2"})
	e.mustStatus(resp, 200, out)
	req = nextRoutine(t, st, aead)
	resp, out = e.do("PATCH", "/api/v1/rules/"+id, map[string]any{"steps": []any{map[string]any{"id": "a", "kind": "create_tasks", "in": map[string]any{"title": map[string]any{"literal": "Bread"}}}}})
	e.mustStatus(resp, 200, out)
	resp, out = e.do("POST", "/api/v1/me/rules/runs/"+req.RunID+"/commit", commit)
	e.mustStatus(resp, 409, out)
	if errCode(out) != "routine_changed" {
		t.Fatalf("changed: %v", out)
	}

	// Run now on the device in hand: nothing goes over the relay, the fail route records it.
	resp, out = e.do("POST", "/api/v1/rules/"+id+"/run", map[string]any{"run_id": "r-3", "device": "phone"})
	e.mustStatus(resp, 200, out)
	if out["device_run"] == nil {
		t.Fatalf("in hand: %v", out)
	}
	resp, out = e.do("POST", "/api/v1/me/rules/runs/r-3/fail", map[string]any{"step": 0, "code": "not_found"})
	if resp.StatusCode != 200 {
		// The run id is the client's: find it.
		t.Fatalf("fail: %d %v", resp.StatusCode, out)
	}
	if run := out["run"].(map[string]any); run["outcome"] != "failed" || run["reason"] != "not_found" {
		t.Fatalf("failed run %v", run)
	}

	// Turned off from any device.
	resp, out = other.do("DELETE", "/api/v1/relay/devices/laptop/routines", nil)
	other.mustStatus(resp, 204, out)
	resp, out = e.do("GET", "/api/v1/relay/devices", nil)
	e.mustStatus(resp, 200, out)
	if len(out["devices"].([]any)) != 0 {
		t.Fatalf("devices %v", out)
	}
}
