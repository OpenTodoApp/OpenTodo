package httpapi

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
)

// keyRecord builds a well-formed record body: random-looking wrapped material
// of the right sizes (the server cannot tell it from real AES-KW output).
func keyRecord(version int, fill byte) map[string]any {
	b := func(n int) string { return base64.RawURLEncoding.EncodeToString(bytes.Repeat([]byte{fill}, n)) }
	return map[string]any{"version": version, "kdf": 1, "salt": b(16), "iterations": 600000,
		"wrappedByPassphrase": b(40), "wrappedByRecovery": b(40)}
}

// staleSessions makes every session older than the step-up freshness window.
func (e *env) staleSessions() {
	e.t.Helper()
	if _, err := e.db.Exec("UPDATE session_auth SET reauth_at = ?", time.Now().Add(-FreshWindow-time.Minute).UnixMilli()); err != nil {
		e.t.Fatal(err)
	}
}

// ct is a syntactically valid ciphertext envelope; the server never decrypts.
func ct(tag string) string {
	return e2ee.PrefixV1 + base64.RawURLEncoding.EncodeToString([]byte("nonce-12byte"+tag+"0123456789abcdef"))
}

func TestEncryptionKeysRoutesAuthAndConflict(t *testing.T) {
	e := ownerEnv(t)
	anon := newClientAt(e, "10.9.9.9")
	anon.client = &http.Client{}
	for _, r := range [][2]string{{"GET", "/api/v1/encryption/keys"}, {"PUT", "/api/v1/encryption/keys"}, {"DELETE", "/api/v1/encryption/keys"}, {"POST", "/api/v1/encryption/purge-history"}} {
		resp, out := anon.do(r[0], r[1], keyRecord(1, 1))
		anon.mustStatus(resp, 401, out)
		if errCode(out) != "unauthorized" {
			t.Fatalf("%s %s: %v", r[0], r[1], out)
		}
	}

	resp, out := e.do("GET", "/api/v1/encryption/keys", nil)
	e.mustStatus(resp, 404, out)
	if errCode(out) != "encryption_disabled" {
		t.Fatalf("GET without record: %v", out)
	}
	resp, out = e.do("GET", "/api/v1/me", nil)
	e.mustStatus(resp, 200, out)
	if enc := out["encryption"].(map[string]any); enc["enabled"] != false || out["minClientVersion"] != float64(MinClientVersion) {
		t.Fatalf("profile before: %v", out)
	}

	// Malformed records never reach the table.
	for _, bad := range []map[string]any{
		func() map[string]any { r := keyRecord(1, 1); r["iterations"] = 1000; return r }(),
		func() map[string]any { r := keyRecord(1, 1); r["kdf"] = 9; return r }(),
		func() map[string]any { r := keyRecord(1, 1); r["salt"] = "short"; return r }(),
		func() map[string]any {
			r := keyRecord(1, 1)
			r["wrappedByRecovery"] = base64.RawURLEncoding.EncodeToString(make([]byte, 32))
			return r
		}(),
	} {
		resp, out = e.do("PUT", "/api/v1/encryption/keys", bad)
		e.mustStatus(resp, 400, out)
	}

	// Creating the record needs no step-up: it grants nothing.
	e.staleSessions()
	resp, out = e.do("PUT", "/api/v1/encryption/keys", keyRecord(1, 1))
	e.mustStatus(resp, 201, out)
	for _, p := range []string{"/api/v1/me", "/api/v1/auth/status"} {
		resp, out = e.do("GET", p, nil)
		e.mustStatus(resp, 200, out)
		enc := out["encryption"].(map[string]any)
		if enc["enabled"] != true || enc["keyVersion"] != float64(1) {
			t.Fatalf("%s after enabling: %v", p, out)
		}
	}

	// A second device racing to create its own record is told to unlock instead.
	resp, out = e.do("PUT", "/api/v1/encryption/keys", keyRecord(1, 2))
	e.mustStatus(resp, 409, out)
	if errCode(out) != "encryption_conflict" {
		t.Fatalf("second create: %v", out)
	}
	// Re-wrapping (passphrase change) needs a fresh re-authentication...
	resp, out = e.do("PUT", "/api/v1/encryption/keys", keyRecord(2, 3))
	e.mustStatus(resp, 403, out)
	if errCode(out) != "reauth_required" {
		t.Fatalf("stale re-wrap: %v", out)
	}
	resp, out = e.do("POST", "/api/v1/auth/reauth", map[string]string{"password": "correct horse battery"})
	e.mustStatus(resp, 200, out)
	// ...and the next version number.
	resp, out = e.do("PUT", "/api/v1/encryption/keys", keyRecord(3, 3))
	e.mustStatus(resp, 409, out)
	resp, out = e.do("PUT", "/api/v1/encryption/keys", keyRecord(2, 3))
	e.mustStatus(resp, 200, out)
	resp, out = e.do("GET", "/api/v1/encryption/keys", nil)
	e.mustStatus(resp, 200, out)
	keys := out["keys"].(map[string]any)
	if keys["version"] != float64(2) || keys["wrappedByPassphrase"] != keyRecord(2, 3)["wrappedByPassphrase"] {
		t.Fatalf("record after re-wrap: %v", keys)
	}

	// The table holds wrapped material and parameters only.
	var cols []string
	rows, err := e.db.Query(`SELECT name FROM pragma_table_info('encryption_keys') ORDER BY cid`)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var c string
		_ = rows.Scan(&c)
		cols = append(cols, c)
	}
	rows.Close()
	if got := strings.Join(cols, ","); got != "user_id,version,kdf,salt,iterations,wrapped_passphrase,wrapped_recovery,created_at,updated_at" {
		t.Fatalf("columns = %s", got)
	}

	e.staleSessions()
	resp, out = e.do("DELETE", "/api/v1/encryption/keys", nil)
	e.mustStatus(resp, 403, out)
	resp, out = e.do("POST", "/api/v1/auth/reauth", map[string]string{"password": "correct horse battery"})
	e.mustStatus(resp, 200, out)
	resp, out = e.do("DELETE", "/api/v1/encryption/keys", nil)
	e.mustStatus(resp, 204, out)
	resp, out = e.do("GET", "/api/v1/encryption/keys", nil)
	e.mustStatus(resp, 404, out)
	resp, out = e.do("DELETE", "/api/v1/encryption/keys", nil)
	e.mustStatus(resp, 404, out)
}

func TestPurgeHistoryKeepsWinnersOnly(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/encryption/purge-history", nil)
	e.mustStatus(resp, 409, out)
	if errCode(out) != "encryption_disabled" {
		t.Fatalf("purge without record: %v", out)
	}

	const secret = "Dentist-appointment-PLAINTEXT"
	now := time.Now().UnixMilli()
	op := func(id, entity, eid, field string, value any, ts int64) map[string]any {
		return map[string]any{"id": id, "entity": entity, "entityId": eid, "field": field, "value": value, "ts": ts, "device": "devA"}
	}
	// Before encryption: plaintext title, description, a label name and two due dates.
	syncOnce(e, "devA", 0, []map[string]any{
		op("o1", "task", "t1", "title", secret, now-5000),
		op("o2", "task", "t1", "description", secret+" notes", now-5000),
		op("o3", "task", "t1", "due", map[string]any{"date": "2026-10-11"}, now-5000),
		op("o4", "label", "l1", "name", secret+"-label", now-5000),
		op("o5", "task", "t1", "due", map[string]any{"date": "2026-10-12"}, now-4000),
	})
	resp, out = e.do("PUT", "/api/v1/encryption/keys", keyRecord(1, 1))
	e.mustStatus(resp, 201, out)
	// The migration re-writes every content field as ciphertext with newer clocks.
	syncOnce(e, "devA", 0, []map[string]any{
		op("o6", "task", "t1", "title", ct("title"), now-1000),
		op("o7", "task", "t1", "description", ct("desc"), now-1000),
		op("o8", "label", "l1", "name", ct("label"), now-1000),
	})
	var before int
	_ = e.db.QueryRow(`SELECT COUNT(*) FROM ops`).Scan(&before)
	if !filesContain(t, e, "PLAINTEXT") {
		t.Fatal("sanity: the plaintext should be on disk before the purge")
	}

	resp, out = e.do("POST", "/api/v1/encryption/purge-history", nil)
	e.mustStatus(resp, 200, out)
	if out["purged"] != float64(3) || !strings.Contains(out["notice"].(string), "Backups") {
		t.Fatalf("purge = %v", out)
	}
	var after int
	_ = e.db.QueryRow(`SELECT COUNT(*) FROM ops`).Scan(&after)
	if before-after != 3 {
		t.Fatalf("ops %d -> %d", before, after)
	}
	// Superseded non-content ops stay (history of due dates is metadata).
	var dueOps int
	_ = e.db.QueryRow(`SELECT COUNT(*) FROM ops WHERE field = 'due'`).Scan(&dueOps)
	if dueOps != 2 {
		t.Fatalf("due ops = %d, want 2", dueOps)
	}
	// Nothing in the op log, the materialized values or the database files still
	// holds the plaintext (secure_delete, VACUUM and the WAL truncation).
	var n int
	_ = e.db.QueryRow(`SELECT COUNT(*) FROM ops WHERE value LIKE '%PLAINTEXT%'`).Scan(&n)
	if n != 0 {
		t.Fatalf("%d plaintext ops survived", n)
	}
	if filesContain(t, e, "PLAINTEXT") {
		t.Fatal("the database files still contain the plaintext")
	}

	// A fresh device converges on the ciphertext winners and the latest due date.
	fresh := syncOnce(e, "devB", 0, nil)
	got := map[string]any{}
	for _, o := range fresh["ops"].([]any) {
		m := o.(map[string]any)
		got[m["entityId"].(string)+"."+m["field"].(string)] = m["value"]
	}
	var due map[string]any
	_ = json.Unmarshal(mustJSONBytes(got["t1.due"]), &due)
	if got["t1.title"] != ct("title") || got["l1.name"] != ct("label") || got["t1.description"] != ct("desc") {
		t.Fatalf("fresh device got %v", got)
	}
	// The pull applies ops in order, so the device ends on the later due op.
	resp, out = e.do("GET", "/api/v1/tasks/t1", nil)
	e.mustStatus(resp, 200, out)
	if out["title"] != ct("title") || out["due"].(map[string]any)["date"] != "2026-10-12" {
		t.Fatalf("REST read after purge: %v", out)
	}
}

// filesContain reports whether any file next to the database (main file, WAL,
// shared memory) contains needle.
func filesContain(t *testing.T, e *env, needle string) bool {
	t.Helper()
	files, _ := filepath.Glob(filepath.Join(filepath.Dir(dbPath(t, e)), "*"))
	if len(files) == 0 {
		t.Fatal("no database files found")
	}
	for _, f := range files {
		raw, _ := os.ReadFile(f)
		if bytes.Contains(raw, []byte(needle)) {
			return true
		}
	}
	return false
}

func mustJSONBytes(v any) []byte { b, _ := json.Marshal(v); return b }

// dbPath finds the SQLite file behind the test env.
func dbPath(t *testing.T, e *env) string {
	t.Helper()
	var file string
	if err := e.db.QueryRow(`SELECT file FROM pragma_database_list WHERE name = 'main'`).Scan(&file); err != nil || file == "" {
		t.Fatalf("database path: %v", err)
	}
	return file
}

func TestExportIncludesKeyRecord(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, 200, out)
	if v, ok := out["encryption"]; !ok || v != nil {
		t.Fatalf("export before enabling: encryption = %v (present %v)", v, ok)
	}
	resp, out = e.do("PUT", "/api/v1/encryption/keys", keyRecord(1, 7))
	e.mustStatus(resp, 201, out)
	syncOnce(e, "devA", 0, []map[string]any{
		{"id": "x1", "entity": "task", "entityId": "t1", "field": "title", "value": ct("t"), "ts": time.Now().UnixMilli(), "device": "devA"},
		{"id": "x2", "entity": "task", "entityId": "t1", "field": "due", "value": map[string]any{"date": "2026-10-11"}, "ts": time.Now().UnixMilli(), "device": "devA"},
	})
	resp, out = e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, 200, out)
	rec := out["encryption"].(map[string]any)
	if rec["wrappedByPassphrase"] != keyRecord(1, 7)["wrappedByPassphrase"] || rec["iterations"] != float64(600000) {
		t.Fatalf("export key record = %v", rec)
	}
	task := out["tasks"].([]any)[0].(map[string]any)
	if task["title"] != ct("t") || task["due"].(map[string]any)["date"] != "2026-10-11" {
		t.Fatalf("export task = %v", task)
	}
}

func TestSharingRefusedForEncryptedAccount(t *testing.T) {
	se := newShareEnv(t)
	resp, out := se.alice.do("PUT", "/api/v1/encryption/keys", keyRecord(1, 1))
	se.alice.mustStatus(resp, 201, out)
	resp, out = se.alice.do("POST", "/api/v1/projects/"+se.project+"/members", map[string]any{"email": "bob@example.com", "role": "editor"})
	se.alice.mustStatus(resp, 409, out)
	if errCode(out) != "encryption_enabled" {
		t.Fatalf("share by encrypted account: %v", out)
	}
	// Bob (not encrypted) can still share his own project with alice.
	resp, out = se.bob.do("POST", "/api/v1/projects", map[string]any{"name": "Bob's"})
	se.bob.mustStatus(resp, 201, out)
	addByEmail(se.bob, se.alice, "/api/v1/projects/"+out["id"].(string)+"/members", "alice@example.com", "editor")
}

func TestCaldavRefusedForEncryptedAccount(t *testing.T) {
	e, dav := davSetup(t)
	dav.must("PROPFIND", "/dav/", "", 207, "Depth", "0")
	resp, out := e.do("PUT", "/api/v1/encryption/keys", keyRecord(1, 1))
	e.mustStatus(resp, 201, out)
	r, body := dav.req("PROPFIND", "/dav/", "", "Depth", "0")
	if r.StatusCode != 403 || !strings.Contains(body, "end-to-end encryption") {
		t.Fatalf("dav for encrypted account: %d %s", r.StatusCode, body)
	}
	resp, out = e.do("POST", "/api/v1/app-passwords", map[string]any{"name": "x"})
	e.mustStatus(resp, 409, out)
	if errCode(out) != "encryption_enabled" {
		t.Fatalf("app password: %v", out)
	}
	resp, out = e.do("GET", "/api/v1/settings/caldav", nil)
	e.mustStatus(resp, 200, out)
	if out["encryption"] != true {
		t.Fatalf("caldav setting: %v", out)
	}
}

// TestRESTPlaintextWriteThenCiphertext: plaintext written through the REST API
// is accepted for an encrypted account (an unlocked device re-writes it later),
// and a REST read returns whatever is current, ciphertext included.
func TestRESTPlaintextWriteThenCiphertext(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("PUT", "/api/v1/encryption/keys", keyRecord(1, 1))
	e.mustStatus(resp, 201, out)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "From a script", "due": map[string]any{"date": "2026-10-11"}})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	syncOnce(e, "devA", 0, []map[string]any{{"id": "r1", "entity": "task", "entityId": id, "field": "title", "value": ct("s"), "ts": time.Now().UnixMilli() + 1000, "device": "devA"}})
	resp, out = e.do("GET", "/api/v1/tasks/"+id, nil)
	e.mustStatus(resp, 200, out)
	if out["title"] != ct("s") || out["due"].(map[string]any)["date"] != "2026-10-11" {
		t.Fatalf("REST read = %v", out)
	}
}

// ctV2 is a v2 envelope with the given stamp (e2ee-rollback D1); the server
// never decrypts, so the rest is filler.
func ctV2(stamp int64) string {
	body := binary.BigEndian.AppendUint64(nil, uint64(stamp))
	return e2ee.PrefixV2 + base64.RawURLEncoding.EncodeToString(append(body, []byte("nonce-12bytefiller-0123456789abcdef")...))
}

// TestStaleCiphertext (e2ee-rollback D3): a REST write of a v2 envelope takes
// its stamp as the op's timestamp. A stamp that would not win, such as an older
// ciphertext written again, answers 409 stale_ciphertext with the field's
// current timestamp; a stamp far ahead 400 clock_skew; without a credential 401.
func TestStaleCiphertext(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("PUT", "/api/v1/encryption/keys", keyRecord(1, 1))
	e.mustStatus(resp, 201, out)
	now := time.Now().UnixMilli()
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": ctV2(now - 60_000)})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"title": ctV2(now)})
	e.mustStatus(resp, 200, out)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"title": ctV2(now - 60_000)})
	e.mustStatus(resp, 409, out)
	if errCode(out) != "stale_ciphertext" || out["error"].(map[string]any)["currentTs"] != float64(now) {
		t.Fatalf("replay: %v", out)
	}
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"title": ctV2(now + 60*60_000)})
	e.mustStatus(resp, 400, out)
	if errCode(out) != "clock_skew" {
		t.Fatalf("far ahead: %v", out)
	}
	resp, out = e.do("GET", "/api/v1/tasks/"+id, nil)
	e.mustStatus(resp, 200, out)
	if out["title"] != ctV2(now) {
		t.Fatalf("title = %v", out["title"])
	}
	anon := newClientAt(e, "10.9.9.8")
	resp, out = anon.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"title": ctV2(now + 1)})
	anon.mustStatus(resp, 401, out)
}

// TestKeyRecordUploadOfLaterEnablement (e2ee-rollback D6): a replacing record
// keeps the stored creation time, unless the device uploads the record of a
// later enablement (a newer createdAt than the stored one, after the server was
// restored from an older backup): then it gets a fresh one, newer than both.
func TestKeyRecordUploadOfLaterEnablement(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("PUT", "/api/v1/encryption/keys", keyRecord(1, 1))
	e.mustStatus(resp, 201, out)
	created := out["keys"].(map[string]any)["createdAt"].(float64)
	next := keyRecord(2, 2)
	next["createdAt"] = created - 1000
	resp, out = e.do("PUT", "/api/v1/encryption/keys", next)
	e.mustStatus(resp, 200, out)
	if got := out["keys"].(map[string]any)["createdAt"].(float64); got != created {
		t.Fatalf("an older claim moved createdAt: %v, want %v", got, created)
	}
	later := keyRecord(3, 3)
	later["createdAt"] = created + 5
	time.Sleep(2 * time.Millisecond)
	resp, out = e.do("PUT", "/api/v1/encryption/keys", later)
	e.mustStatus(resp, 200, out)
	if got := out["keys"].(map[string]any)["createdAt"].(float64); got <= created {
		t.Fatalf("a later enablement kept createdAt %v", got)
	}
}
