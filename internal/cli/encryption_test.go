package cli

import (
	"bytes"
	"crypto/sha256"
	"encoding/base32"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/agenttools"
	"github.com/pixari/opentodo/internal/e2ee"
	"github.com/pixari/opentodo/internal/e2ee/crypt"
)

// `ot encryption` and `ot mcp --decrypt` (OpenSpec change mcp-projects).

const testPassphrase = "a long enough test passphrase"

func seqBytes(start byte, n int) []byte {
	b := make([]byte, n)
	for i := range b {
		b[i] = start + byte(i)
	}
	return b
}

// recoveryText formats a recovery key like the web app shows it.
func recoveryText(raw []byte) string {
	enc := base32.StdEncoding.WithPadding(base32.NoPadding)
	sum := sha256.Sum256(raw)
	text := enc.EncodeToString(raw) + enc.EncodeToString(sum[:3])[:4]
	var groups []string
	for i := 0; i < len(text); i += 4 {
		groups = append(groups, text[i:i+4])
	}
	return strings.Join(groups, "-")
}

// encrypted turns the harness account into an end-to-end encrypted one, as the
// web app would (the key record only), and returns the account key and the
// recovery key text.
func (h *harness) encrypted(version int, dek []byte) string {
	h.t.Helper()
	salt := seqBytes(byte(0x10+version), 16)
	kek, err := crypt.PassphraseKEK(testPassphrase, salt, 600_000)
	if err != nil {
		h.t.Fatal(err)
	}
	wp, _ := crypt.Wrap(kek, dek)
	raw := seqBytes(0x80, 32)
	rk, _ := crypt.RecoveryKEK(raw)
	wr, _ := crypt.Wrap(rk, dek)
	b64 := base64.RawURLEncoding
	h.apiJSON("PUT", "/api/v1/encryption/keys", map[string]any{"version": version, "kdf": 1, "salt": b64.EncodeToString(salt), "iterations": 600_000,
		"wrappedByPassphrase": b64.EncodeToString(wp), "wrappedByRecovery": b64.EncodeToString(wr)})
	return recoveryText(raw)
}

func (h *harness) seal(dek []byte, entity, id, field, plaintext string) string {
	h.t.Helper()
	v, err := crypt.Seal(dek, entity, id, field, plaintext)
	if err != nil {
		h.t.Fatal(err)
	}
	return v
}

// agentToken switches MCP and assistant writes on and returns an agent token.
func (h *harness) agentToken() string {
	h.t.Helper()
	h.apiJSON("PUT", "/api/v1/settings/mcp", map[string]any{"enabled": true, "writes_enabled": true})
	h.apiJSON("PUT", "/api/v1/me/agent-access", map[string]any{"allow_writes": true})
	out := h.apiJSON("POST", "/api/v1/tokens", map[string]any{"name": "Desk assistant", "scope": "agent"})
	return out["secret"].(string)
}

// putExact seeds an entity with exactly the given fields (put adds a position).
func (h *harness) putExact(entity, id string, fields map[string]any) {
	h.t.Helper()
	ts := time.Now().UnixMilli()
	ops := []map[string]any{}
	for f, v := range fields {
		ops = append(ops, map[string]any{"id": id + "/" + f, "entity": entity, "entityId": id, "field": f, "value": v, "ts": ts, "device": "seed"})
	}
	h.apiJSON("POST", "/api/v1/sync", map[string]any{"device": "seed", "cursor": 0, "ops": ops})
}

func (h *harness) ownerID() string {
	h.t.Helper()
	return h.apiJSON("GET", "/api/v1/me", nil)["user"].(map[string]any)["id"].(string)
}

func (h *harness) passphraseFile() string {
	h.t.Helper()
	p := filepath.Join(h.t.TempDir(), "pass")
	if err := os.WriteFile(p, []byte(testPassphrase+"\n"), 0o600); err != nil {
		h.t.Fatal(err)
	}
	return p
}

func TestEncryptionUnlockLockStatus(t *testing.T) {
	h := newHarness(t)
	h.env["OPENTODO_URL"] = h.srv.URL
	h.env["OPENTODO_TOKEN"] = h.agentToken()

	// Not encrypted yet: nothing to unlock, nothing stored.
	if code, _, errb := h.run("encryption", "unlock", "--passphrase-file", h.passphraseFile()); code != ExitUsage || !strings.Contains(errb, "does not use end-to-end encryption") {
		t.Fatalf("unencrypted: %d %s", code, errb)
	}
	dek := seqBytes(0x40, 32)
	recovery := h.encrypted(1, dek)
	if out := h.mustRun("encryption", "status"); !strings.HasPrefix(out, "locked") {
		t.Fatalf("status = %q", out)
	}
	h.requestLog()
	h.mustRun("encryption", "unlock", "--passphrase-file", h.passphraseFile())
	if w := writesIn(h.requestLog()); len(w) != 0 {
		t.Fatalf("unlock sent writes: %v", w)
	}
	path := filepath.Join(filepath.Dir(h.configPath), "keys", "default.json")
	fi, err := os.Stat(path)
	if err != nil || fi.Mode().Perm() != 0o600 {
		t.Fatalf("key file %v %v", fi, err)
	}
	if di, _ := os.Stat(filepath.Dir(path)); di.Mode().Perm() != 0o700 {
		t.Fatalf("keys dir mode %v", di.Mode())
	}
	raw, _ := os.ReadFile(path)
	if bytes.Contains(raw, []byte(testPassphrase)) {
		t.Fatal("the passphrase was stored")
	}
	if out := h.mustRun("encryption", "status", "--json"); !strings.Contains(out, `"state":"unlocked"`) || strings.Contains(out, base64.RawURLEncoding.EncodeToString(dek)) {
		t.Fatalf("status = %q", out)
	}
	// A passphrase change elsewhere (key version 2) makes the stored key stale.
	h.encrypted(2, dek)
	if out := h.mustRun("encryption", "status"); !strings.HasPrefix(out, "stale") {
		t.Fatalf("status after a key change = %q", out)
	}
	h.stdin = recovery + "\n"
	h.mustRun("encryption", "unlock", "--recovery")
	h.stdin = ""
	if out := h.mustRun("encryption", "status"); !strings.HasPrefix(out, "unlocked") {
		t.Fatalf("status after recovery unlock = %q", out)
	}
	h.mustRun("encryption", "lock")
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("key file after lock: %v", err)
	}
	if out := h.mustRun("encryption", "status"); !strings.HasPrefix(out, "locked") {
		t.Fatalf("status after lock = %q", out)
	}
}

func TestEncryptionUnlockFailures(t *testing.T) {
	h := newHarness(t)
	h.env["OPENTODO_URL"] = h.srv.URL
	h.env["OPENTODO_TOKEN"] = h.agentToken()
	h.encrypted(1, seqBytes(0x40, 32))
	wrong := filepath.Join(t.TempDir(), "wrong")
	_ = os.WriteFile(wrong, []byte("not the passphrase at all"), 0o600)
	for i := 0; i < 5; i++ {
		if code, _, errb := h.run("encryption", "unlock", "--passphrase-file", wrong); code != ExitAuth || !strings.Contains(errb, "not correct") {
			t.Fatalf("attempt %d: %d %s", i, code, errb)
		}
	}
	if _, err := os.Stat(filepath.Join(filepath.Dir(h.configPath), "keys", "default.json")); !os.IsNotExist(err) {
		t.Fatal("a key was stored after a wrong passphrase")
	}
	// The sixth attempt within the minute waits first.
	var slept time.Duration
	var out, errb bytes.Buffer
	a := &App{Stdout: &out, Stderr: &errb, ConfigPath: h.configPath, Getenv: func(k string) string { return h.env[k] },
		Now: func() time.Time { return fixedNow }, Sleep: func(d time.Duration) { slept += d }, Stdin: strings.NewReader("")}
	a.Main([]string{"encryption", "unlock", "--passphrase-file", wrong})
	if slept <= 0 || !strings.Contains(errb.String(), "Too many failed attempts") {
		t.Fatalf("slept %v, stderr %q", slept, errb.String())
	}
	// A revoked token is an authentication problem.
	h.env["OPENTODO_TOKEN"] = "otp_revoked"
	if code, _, _ := h.run("encryption", "unlock", "--passphrase-file", h.passphraseFile()); code != ExitAuth {
		t.Fatalf("revoked token: %d", code)
	}
}

func TestEncryptionUnlockRefusesOutOfRangeRecord(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"keys":{"version":1,"kdf":1,"salt":"AAAAAAAAAAAAAAAAAAAAAA","iterations":50,"wrappedByPassphrase":"x","wrappedByRecovery":"y"}}`)
	}))
	defer srv.Close()
	cfg := filepath.Join(t.TempDir(), "config.json")
	var out, errb bytes.Buffer
	a := &App{Stdout: &out, Stderr: &errb, ConfigPath: cfg, Stdin: strings.NewReader(testPassphrase + "\n"),
		Getenv: func(k string) string {
			return map[string]string{"OPENTODO_URL": srv.URL, "OPENTODO_TOKEN": "t"}[k]
		}}
	if code := a.Main([]string{"encryption", "unlock"}); code == 0 || !strings.Contains(errb.String(), "outside the accepted range") {
		t.Fatalf("exit %d, stderr %q", code, errb.String())
	}
	if _, err := os.Stat(filepath.Join(filepath.Dir(cfg), "keys", "default.json")); !os.IsNotExist(err) {
		t.Fatal("a key was stored")
	}
}

// bridge runs `ot mcp` with the given messages and returns stdout lines and stderr.
func (h *harness) bridge(args []string, messages ...map[string]any) (int, []map[string]any, string) {
	h.t.Helper()
	var in strings.Builder
	for i, m := range messages {
		m["jsonrpc"] = "2.0"
		if _, ok := m["id"]; !ok && !strings.HasPrefix(m["method"].(string), "notifications/") {
			m["id"] = i + 1
		}
		b, _ := json.Marshal(m)
		in.Write(b)
		in.WriteString("\n")
	}
	h.stdin = in.String()
	code, out, errb := h.run(append([]string{"mcp"}, args...)...)
	h.stdin = ""
	var lines []map[string]any
	for _, l := range strings.Split(strings.TrimSpace(out), "\n") {
		if l == "" {
			continue
		}
		var m map[string]any
		if err := json.Unmarshal([]byte(l), &m); err != nil {
			h.t.Fatalf("stdout line %q: %v", l, err)
		}
		lines = append(lines, m)
	}
	return code, lines, errb
}

func toolCall(name string, args map[string]any) map[string]any {
	return map[string]any{"method": "tools/call", "params": map[string]any{"name": name, "arguments": args}}
}

func structured(t *testing.T, resp map[string]any) map[string]any {
	t.Helper()
	res, ok := resp["result"].(map[string]any)
	if !ok || res["isError"] == true {
		t.Fatalf("tool error: %v", resp)
	}
	return res["structuredContent"].(map[string]any)
}

func TestCiphertextOnlyNoteMatches(t *testing.T) {
	if ciphertextOnlyNote != agenttools.CiphertextOnlyNote {
		t.Fatal("ciphertextOnlyNote differs from agenttools.CiphertextOnlyNote")
	}
}

func TestMCPBridgeAgentTokenAndReadOnly(t *testing.T) {
	h := newHarness(t)
	h.env["OPENTODO_URL"] = h.srv.URL
	h.env["OPENTODO_TOKEN"] = h.agentToken()
	code, lines, errb := h.bridge(nil, map[string]any{"method": "tools/list", "params": map[string]any{}})
	if code != 0 || len(lines) != 1 {
		t.Fatalf("agent token: %d %v %s", code, lines, errb)
	}
	names := []string{}
	for _, tl := range lines[0]["result"].(map[string]any)["tools"].([]any) {
		names = append(names, tl.(map[string]any)["name"].(string))
	}
	if !strings.Contains(strings.Join(names, ","), "update_project") {
		t.Fatalf("write tools not listed for an agent token: %v", names)
	}
	h.env["OPENTODO_READ_ONLY"] = "1"
	if code, lines, errb := h.bridge([]string{"--allow-full-token"}, map[string]any{"method": "ping"}); code != ExitAuth || len(lines) != 0 || !strings.Contains(errb, "read-only mode requires a read-only token") {
		t.Fatalf("read-only with an agent token: %d %v %s", code, lines, errb)
	}
}

func TestMCPBridgeDecryptRefusesWithoutKey(t *testing.T) {
	h := newHarness(t)
	h.env["OPENTODO_URL"] = h.srv.URL
	h.env["OPENTODO_TOKEN"] = h.agentToken()
	h.encrypted(1, seqBytes(0x40, 32))
	code, lines, errb := h.bridge([]string{"--decrypt"}, map[string]any{"method": "tools/list", "params": map[string]any{}})
	if code == 0 || len(lines) != 0 || !strings.Contains(errb, "ot encryption unlock") {
		t.Fatalf("not unlocked: %d %v %s", code, lines, errb)
	}
}

// TestMCPBridgeDecrypts (5.3, 5.4): every content field an assistant can read
// comes back in plaintext through the bridge, while the server held only
// ciphertext; writes reach the server as envelopes for the right ids. A content
// field a read tool gains without the bridge knowing it fails here.
func TestMCPBridgeDecrypts(t *testing.T) {
	h := newHarness(t)
	h.env["OPENTODO_URL"] = h.srv.URL
	h.env["OPENTODO_TOKEN"] = h.agentToken()
	dek := seqBytes(0x40, 32)
	h.encrypted(1, dek)
	s := func(entity, id, field, pt string) string { return h.seal(dek, entity, id, field, pt) }
	h.put("project", "p1", map[string]any{"name": s("project", "p1", "name", "Garden"), "description": s("project", "p1", "description", "Gate code 4711"), "color": "#16a34a", "archived": false})
	h.put("section", "s1", map[string]any{"name": s("section", "s1", "name", "To plant"), "project_id": "p1"})
	h.put("label", "l1", map[string]any{"name": s("label", "l1", "name", "outdoors"), "color": "#16a34a"})
	h.put("field", "f1", map[string]any{"name": s("field", "f1", "name", "Supplier"), "type": "choice", "options": s("field", "f1", "options", "Acme\nGlobex"), "project_id": "p1"})
	h.put("task", "t1", map[string]any{"title": s("task", "t1", "title", "Plant tomatoes"), "description": s("task", "t1", "description", "Before the rain"),
		"project_id": "p1", "section_id": "s1", "labels": []string{"l1"}, "fields.f1": s("task", "t1", "fields.f1", "Acme"),
		"due": map[string]any{"date": "2026-10-10"}})
	h.putExact("comment", "c1", map[string]any{"created_at": fixedNow.UnixMilli(), "task_id": "t1", "body": s("comment", "c1", "body", "Use the blue pots"), "author_id": h.ownerID(), "parent_id": nil, "mentions": []string{}, "edited_at": nil, "deleted_at": nil})
	h.putExact("time_entry", "e1", map[string]any{"created_at": fixedNow.UnixMilli(), "task_id": "t1", "user_id": h.ownerID(), "started_at": fixedNow.Add(-time.Hour).UnixMilli(), "ended_at": fixedNow.Add(-30 * time.Minute).UnixMilli(),
		"device_id": "seed", "note": s("time_entry", "e1", "note", "Dug the bed"), "deleted_at": nil})
	h.mustRun("encryption", "unlock", "--passphrase-file", h.passphraseFile())

	code, lines, errb := h.bridge([]string{"--decrypt"},
		map[string]any{"method": "tools/list", "params": map[string]any{}},
		toolCall("list_tasks", map[string]any{}),
		toolCall("get_task", map[string]any{"id": "t1"}),
		toolCall("list_projects", map[string]any{}),
		toolCall("today_summary", map[string]any{}),
		toolCall("list_time_entries", map[string]any{}),
		map[string]any{"method": "resources/read", "params": map[string]any{"uri": "opentodo://projects/p1"}},
	)
	if code != 0 {
		t.Fatalf("bridge: %d %s", code, errb)
	}
	if !strings.HasPrefix(strings.TrimSpace(errb), PlaintextNotice) {
		t.Fatalf("stderr = %q", errb)
	}
	all, _ := json.Marshal(lines)
	if bytes.Contains(all, []byte(e2ee.Placeholder)) || bytes.Contains(all, []byte("[encrypted]")) || bytes.Contains(all, []byte("enc:v1:")) || bytes.Contains(all, []byte("ciphertext only")) {
		t.Fatalf("placeholder or ciphertext left: %s", all)
	}
	for _, want := range []string{"Plant tomatoes", "Before the rain", "Garden", "Gate code 4711", "To plant", "outdoors", "Supplier", "Globex", "Acme", "Use the blue pots", "Dug the bed"} {
		if !bytes.Contains(all, []byte(want)) {
			t.Fatalf("%q not decrypted: %s", want, all)
		}
	}

	// Writes: titles and names reach the server as envelopes for the right ids.
	code, lines, errb = h.bridge([]string{"--decrypt"},
		toolCall("create_tasks", map[string]any{"items": []any{map[string]any{"title": "Book the plumber", "project_id": "p1"}}}),
		toolCall("update_sections", map[string]any{"updates": []any{map[string]any{"id": "s1", "name": "Planted"}}}),
		toolCall("create_sections", map[string]any{"project_id": "p1", "items": []any{map[string]any{"name": "Harvest", "icon": "sprout"}}}),
		toolCall("add_comment", map[string]any{"task_id": "t1", "body": "Done by Friday"}),
		toolCall("update_project", map[string]any{"id": "p1", "name": "Vegetable garden", "color": "#22c55e"}),
	)
	if code != 0 || len(lines) != 5 {
		t.Fatalf("writes: %d %v %s", code, lines, errb)
	}
	tid := structured(t, lines[0])["results"].([]any)[0].(map[string]any)["id"].(string)
	stored := h.task(tid)["title"].(string)
	if pt, err := crypt.Open(dek, "task", tid, "title", stored); err != nil || pt != "Book the plumber" {
		t.Fatalf("stored title %q opens to %q, %v", stored, pt, err)
	}
	sec := h.apiJSON("GET", "/api/v1/sections/s1", nil)
	if pt, err := crypt.Open(dek, "section", "s1", "name", sec["name"].(string)); err != nil || pt != "Planted" {
		t.Fatalf("section name: %q %v", pt, err)
	}
	proj := h.apiJSON("GET", "/api/v1/projects/p1", nil)
	if pt, err := crypt.Open(dek, "project", "p1", "name", proj["name"].(string)); err != nil || pt != "Vegetable garden" || proj["color"] != "#22c55e" {
		t.Fatalf("project: %v %q %v", proj, pt, err)
	}

	// The owner turns writes off: the server's refusal comes back unchanged.
	h.apiJSON("PUT", "/api/v1/settings/mcp", map[string]any{"enabled": true, "writes_enabled": false})
	_, lines, _ = h.bridge([]string{"--decrypt"}, toolCall("update_project", map[string]any{"id": "p1", "name": "x"}))
	if res := lines[0]["result"].(map[string]any); res["isError"] != true || !strings.Contains(res["content"].([]any)[0].(map[string]any)["text"].(string), "writes_disabled_by_owner") {
		t.Fatalf("gate refusal: %v", lines[0])
	}
}

// TestMCPBridgeStaleKey: a key change during a session answers later requests
// with a stale-key error and forwards nothing.
func TestMCPBridgeStaleKey(t *testing.T) {
	h := newHarness(t)
	h.env["OPENTODO_URL"] = h.srv.URL
	h.env["OPENTODO_TOKEN"] = h.agentToken()
	dek := seqBytes(0x40, 32)
	h.encrypted(1, dek)
	h.mustRun("encryption", "unlock", "--passphrase-file", h.passphraseFile())
	pr, pw := io.Pipe()
	var out, errb bytes.Buffer
	a := &App{Stdin: pr, Stdout: &out, Stderr: &errb, ConfigPath: h.configPath, Getenv: func(k string) string { return h.env[k] }, Now: func() time.Time { return fixedNow }}
	done := make(chan int)
	go func() { done <- a.Main([]string{"mcp", "--decrypt"}) }()
	write := func(id int, name string) {
		b, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": id, "method": "tools/call", "params": map[string]any{"name": name, "arguments": map[string]any{}}})
		_, _ = pw.Write(append(b, '\n'))
	}
	write(1, "list_projects")
	for i := 0; i < 200 && !strings.Contains(out.String(), `"id":1`); i++ {
		time.Sleep(10 * time.Millisecond)
	}
	h.encrypted(2, dek)
	h.requestLog()
	write(2, "list_projects")
	_ = pw.Close()
	if code := <-done; code != 0 {
		t.Fatalf("exit %d: %s", code, errb.String())
	}
	if !strings.Contains(out.String(), "out of date") {
		t.Fatalf("no stale error: %s", out.String())
	}
	for _, r := range h.requestLog() {
		if strings.HasSuffix(r, "/mcp") {
			t.Fatalf("forwarded after the key changed: %v", r)
		}
	}
}
