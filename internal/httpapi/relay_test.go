package httpapi

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"os"
	"strings"
	gosync "sync"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/relay"
)

// Device relay through the real HTTP stack (OpenSpec change mcp-device-relay).

// withLog replaces the server's logger (tests only), to search what it wrote.
func withLog(l *slog.Logger) Option { return func(s *Server) { s.log = l } }

// syncBuf is a goroutine-safe log sink.
type syncBuf struct {
	mu gosync.Mutex
	b  bytes.Buffer
}

func (s *syncBuf) Write(p []byte) (int, error) { s.mu.Lock(); defer s.mu.Unlock(); return s.b.Write(p) }
func (s *syncBuf) String() string              { s.mu.Lock(); defer s.mu.Unlock(); return s.b.String() }

// relayDevice is a device's side of a relay stream.
type relayDevice struct {
	t    *testing.T
	e    *env
	priv *ecdh.PrivateKey
	aead cipher.AEAD
	st   *stream
}

func (e *env) relayDevice(device string) *relayDevice {
	e.t.Helper()
	priv, _ := ecdh.P256().GenerateKey(rand.Reader)
	key := base64.RawURLEncoding.EncodeToString(priv.PublicKey().Bytes())
	d := &relayDevice{t: e.t, e: e, priv: priv}
	d.st = e.openStream(e.srv.URL, "/api/v1/relay/events?device="+device+"&key="+key)
	if d.st.status != 200 {
		return d
	}
	ev, ok := d.st.next(e.t, "hello", 3*time.Second)
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
	d.aead, _ = cipher.NewGCM(blk)
	return d
}

type relayReq struct {
	Op    relay.Op     `json:"op"`
	Items []relay.Item `json:"items"`
	Call  relay.Call   `json:"call"`
}

// serve answers the next request with answer(items) and returns the request.
func (d *relayDevice) serve(answer func(relayReq) []relay.Result) (string, relayReq) {
	d.t.Helper()
	ev, ok := d.st.next(d.t, "request", 5*time.Second)
	if !ok {
		d.t.Fatal("no relay request")
	}
	var env struct{ ID, Box string }
	_ = json.Unmarshal([]byte(ev.data), &env)
	raw, _ := base64.RawURLEncoding.DecodeString(env.Box)
	n := d.aead.NonceSize()
	plain, err := d.aead.Open(nil, raw[:n], raw[n:], []byte(env.ID))
	if err != nil {
		d.t.Fatalf("request does not open: %v", err)
	}
	var req relayReq
	_ = json.Unmarshal(plain, &req)
	body, _ := json.Marshal(map[string]any{"results": answer(req)})
	nonce := make([]byte, n)
	_, _ = rand.Read(nonce)
	box := base64.RawURLEncoding.EncodeToString(d.aead.Seal(nonce, nonce, body, []byte(env.ID)))
	resp, out := d.e.do("POST", "/api/v1/relay/answers/"+env.ID, map[string]any{"box": box})
	d.e.mustStatus(resp, 204, out)
	resp, out = d.e.do("POST", "/api/v1/relay/answers/"+env.ID, map[string]any{"box": box})
	d.e.mustStatus(resp, 404, out)
	return env.ID, req
}

// encryptedOwner is an owner with an encrypted account, MCP writes allowed and
// an agent token.
func encryptedOwner(t *testing.T, opts ...Option) (e *env, secret string, c *env) {
	t.Helper()
	e = newEnvWith(t, false, opts...)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	e.allowWrites(true)
	e.allowMyAssistants(true)
	_, secret = e.namedToken("Desk assistant", "agent")
	resp, out = e.do("PUT", "/api/v1/encryption/keys", keyRecord(1, 7))
	if resp.StatusCode != 200 && resp.StatusCode != 201 && resp.StatusCode != 204 {
		t.Fatalf("enable encryption: %d %v", resp.StatusCode, out)
	}
	return e, secret, e.bearerClient()
}

func TestRelayRoutesAuthAndConflicts(t *testing.T) {
	e := ownerEnv(t)
	anon := newClientAt(e, "10.9.9.9")
	for _, r := range [][2]string{{"GET", "/api/v1/relay/devices"}, {"PUT", "/api/v1/relay/devices/laptop"}, {"DELETE", "/api/v1/relay/devices/laptop"}, {"GET", "/api/v1/relay/events?device=laptop&key=x"}, {"POST", "/api/v1/relay/answers/abc"}} {
		resp, out := anon.do(r[0], r[1], map[string]any{})
		anon.mustStatus(resp, 401, out)
	}
	// Not encrypted: refused.
	e.allowWrites(true)
	resp, out := e.do("PUT", "/api/v1/relay/devices/laptop", map[string]any{"label": "Laptop"})
	e.mustStatus(resp, 409, out)
	if errCode(out) != "not_encrypted" {
		t.Fatalf("unencrypted: %v", out)
	}
	resp, out = e.do("PUT", "/api/v1/encryption/keys", keyRecord(1, 7))
	if resp.StatusCode >= 300 {
		t.Fatalf("enable encryption: %v", out)
	}
	// Stale confirmation: refused, nothing stored.
	e.staleSessions()
	resp, out = e.do("PUT", "/api/v1/relay/devices/laptop", map[string]any{"label": "Laptop"})
	if resp.StatusCode == 204 {
		t.Fatalf("stale session opted in: %v", out)
	}
	resp, out = e.do("GET", "/api/v1/relay/devices", nil)
	e.mustStatus(resp, 200, out)
	if len(out["devices"].([]any)) != 0 {
		t.Fatalf("devices after a refused opt-in: %v", out)
	}
	// A stream for a device that never opted in is refused.
	st := e.openStream(e.srv.URL, "/api/v1/relay/events?device=laptop&key="+base64.RawURLEncoding.EncodeToString(make([]byte, 65)))
	if st.status != 403 {
		t.Fatalf("stream without opt-in = %d", st.status)
	}
}

func TestRelayEndToEndNoPlaintextLeft(t *testing.T) {
	logs := &syncBuf{}
	e, secret, c := encryptedOwner(t, withLog(slog.New(slog.NewTextHandler(logs, &slog.HandlerOptions{Level: slog.LevelDebug}))))
	const title, note = "Call the plumber about the leak", "Ask for the boiler too"

	// No opted-in device: plaintext is refused as before.
	if _, isErr := c.toolCall(secret, "create_tasks", map[string]any{"items": []any{map[string]any{"title": title}}}); !isErr {
		t.Fatal("create without a device was accepted")
	}

	resp, out := e.do("PUT", "/api/v1/relay/devices/laptop", map[string]any{"label": "Laptop"})
	e.mustStatus(resp, 204, out)
	if evs := e.events(audit.RelayEnabledName); len(evs) != 1 || evs[0].Details["relay_device_id"] != "laptop" {
		t.Fatalf("relay.enabled = %+v", evs)
	}
	// Opted in but not connected: device_unavailable.
	sc, isErr := c.toolCall(secret, "create_tasks", map[string]any{"items": []any{map[string]any{"title": title}}})
	if !isErr || !strings.Contains(toJSON(sc), "device_unavailable") {
		t.Fatalf("offline device: %v", sc)
	}

	dev := e.relayDevice("laptop")
	if dev.st.status != 200 {
		t.Fatalf("stream = %d %v", dev.st.status, dev.st.body)
	}
	envelopes := map[string]string{}
	done := make(chan struct{})
	go func() {
		defer close(done)
		_, req := dev.serve(func(r relayReq) []relay.Result {
			res := make([]relay.Result, len(r.Items))
			for i, it := range r.Items {
				env := ct(it.ID + it.Field)
				envelopes[it.Entity+"/"+it.Field] = env
				res[i] = relay.Result{Value: env}
			}
			return res
		})
		if req.Op != relay.Encrypt || req.Call.Tool != "create_tasks" || !req.Call.Write {
			t.Errorf("request = %+v", req)
		}
	}()
	sc = c.mustTool(secret, "create_tasks", map[string]any{"items": []any{map[string]any{"title": title, "description": note}}})
	<-done
	created := sc["results"].([]any)[0].(map[string]any)["id"].(string)
	var stored string
	_ = e.db.QueryRow(`SELECT value FROM ops WHERE entity_id = ? AND field = 'title'`, created).Scan(&stored)
	if stored != `"`+envelopes["task/title"]+`"` {
		t.Fatalf("stored title %s, device made %s", stored, envelopes["task/title"])
	}

	// A read: the device decrypts exactly the shown values.
	done = make(chan struct{})
	go func() {
		defer close(done)
		dev.serve(func(r relayReq) []relay.Result {
			res := make([]relay.Result, len(r.Items))
			for i, it := range r.Items {
				switch it.Field {
				case "title":
					res[i] = relay.Result{Value: title}
				case "description":
					res[i] = relay.Result{Value: note}
				default:
					res[i] = relay.Result{Error: "decrypt_failed"}
				}
			}
			return res
		})
	}()
	got := c.mustTool(secret, "get_task", map[string]any{"id": created})
	<-done
	if !strings.Contains(toJSON(got), title) {
		t.Fatalf("get_task = %v", got)
	}

	// Nothing relayed is left behind: database file, audit export, logs.
	e.do("GET", "/api/v1/sync?cursor=0", nil)
	main := dbPath(t, e)
	var all []byte
	for _, f := range []string{main, main + "-wal"} {
		raw, err := os.ReadFile(f)
		if err != nil && f == main {
			t.Fatal(err)
		}
		all = append(all, raw...)
	}
	if !bytes.Contains(all, []byte(envelopes["task/title"])) {
		t.Fatal("the database scan does not see the stored ciphertext; the check would prove nothing")
	}
	if bytes.Contains(all, []byte(title)) || bytes.Contains(all, []byte(note)) {
		t.Fatal("the database holds relayed plaintext")
	}
	evs := e.events("")
	if len(evs) == 0 {
		t.Fatal("no audit events read")
	}
	for _, ev := range evs {
		if strings.Contains(toJSON(ev), title) {
			t.Fatal("audit log holds relayed plaintext")
		}
	}
	if !strings.Contains(logs.String(), "/mcp") {
		t.Fatal("the captured log saw no request; the check would prove nothing")
	}
	if strings.Contains(logs.String(), title) || strings.Contains(logs.String(), note) {
		t.Fatal("server log holds relayed plaintext")
	}

	// Signing out ends the opt-in.
	resp, out = e.do("POST", "/api/v1/auth/logout", nil)
	if resp.StatusCode >= 300 {
		t.Fatalf("logout: %v", out)
	}
	evs = e.events(audit.RelayDisabledName)
	if len(evs) != 1 || evs[0].Details["reason"] != "signed_out" {
		t.Fatalf("relay.disabled = %+v", evs)
	}
}

func TestRelayAnswerFromAnotherSession(t *testing.T) {
	e, secret, c := encryptedOwner(t)
	resp, out := e.do("PUT", "/api/v1/relay/devices/laptop", map[string]any{"label": "Laptop"})
	e.mustStatus(resp, 204, out)
	dev := e.relayDevice("laptop")
	other := newClientAt(e, "10.1.1.1")
	resp, out = other.do("POST", "/api/v1/auth/login", map[string]string{"email": "owner@example.com", "password": "correct horse battery"})
	other.mustStatus(resp, 200, out)
	// The other session cannot hold the laptop's stream.
	st := other.openStream(e.srv.URL, "/api/v1/relay/events?device=laptop&key="+base64.RawURLEncoding.EncodeToString(dev.priv.PublicKey().Bytes()))
	if st.status != 403 {
		t.Fatalf("other session's stream = %d", st.status)
	}
	go func() {
		ev, ok := dev.st.next(t, "request", 5*time.Second)
		if !ok {
			return
		}
		var env struct{ ID, Box string }
		_ = json.Unmarshal([]byte(ev.data), &env)
		// The request's own sealed box replayed by another session: refused.
		resp, out := other.do("POST", "/api/v1/relay/answers/"+env.ID, map[string]any{"box": env.Box})
		other.mustStatus(resp, 404, out)
	}()
	old := relay.ReadDeadline
	relay.ReadDeadline = 300 * time.Millisecond
	defer func() { relay.ReadDeadline = old }()
	seedOps(t, e, e.userID(), "task", "t1", map[string]any{"title": ct("t1title"), "project_id": nil, "priority": 4, "labels": []string{}})
	sc, isErr := c.toolCall(secret, "get_task", map[string]any{"id": "t1"})
	if !isErr || !strings.Contains(toJSON(sc), "device_timeout") {
		t.Fatalf("unanswered read = %v", sc)
	}
}

func TestRelayEndsWithEncryptionAndOnLock(t *testing.T) {
	e, _, _ := encryptedOwner(t)
	for _, d := range []string{"laptop", "phone"} {
		resp, out := e.do("PUT", "/api/v1/relay/devices/"+d, map[string]any{"label": d})
		e.mustStatus(resp, 204, out)
	}
	resp, out := e.do("DELETE", "/api/v1/relay/devices/phone?reason=locked", nil)
	e.mustStatus(resp, 204, out)
	resp, out = e.do("DELETE", "/api/v1/relay/devices/phone?reason=bogus", nil)
	e.mustStatus(resp, 400, out)
	resp, out = e.do("DELETE", "/api/v1/encryption/keys", nil)
	if resp.StatusCode >= 300 {
		t.Fatalf("turn encryption off: %v", out)
	}
	reasons := map[string]string{}
	for _, ev := range e.events(audit.RelayDisabledName) {
		reasons[ev.Details["relay_device_id"]] = ev.Details["reason"]
	}
	if reasons["phone"] != "locked" || reasons["laptop"] != "encryption_off" {
		t.Fatalf("relay.disabled reasons = %v", reasons)
	}
	resp, out = e.do("GET", "/api/v1/relay/devices", nil)
	e.mustStatus(resp, 200, out)
	if len(out["devices"].([]any)) != 0 {
		t.Fatalf("devices after encryption off: %v", out)
	}
}

func toJSON(v any) string {
	raw, _ := json.Marshal(v)
	return string(raw)
}
