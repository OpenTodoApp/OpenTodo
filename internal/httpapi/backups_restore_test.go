package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/backup"
	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// restoreEnv is backupEnv with a settable free-space probe and a restart hook.
type restoreEnv struct {
	*env
	bk        *backup.Service
	dir       string
	free      int64 // -1: unknown
	restarted bool
}

func newRestoreEnv(t *testing.T) *restoreEnv {
	t.Helper()
	re := &restoreEnv{dir: t.TempDir(), free: -1}
	db, err := store.Open(re.dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	cfg := config.Config{SessionTTL: time.Hour}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	syncSvc := opsync.NewService(db)
	re.bk = backup.New(db, re.dir, backup.Options{Version: "test", Log: log, FreeSpace: func(string) (int64, bool) {
		return re.free, re.free >= 0
	}})
	re.bk.SetRestartFunc(func() { re.restarted = true })
	h := New(cfg, auth.NewService(db, cfg.SessionTTL, false), syncSvc, nil, log, "test", WithBackups(re.bk))
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	t.Cleanup(syncSvc.Notifier().CloseAll)
	jar, _ := cookiejar.New(nil)
	re.env = &env{t: t, srv: srv, client: &http.Client{Jar: jar}, db: db, handler: h, sync: syncSvc}
	resp, out := re.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"})
	re.mustStatus(resp, 201, out)
	return re
}

// archive makes a backup to the local destination and returns its file name.
func (re *restoreEnv) archive(passphrase string) string {
	re.t.Helper()
	ctx := context.Background()
	if _, err := re.bk.SaveSettings(ctx, backup.DefaultSettings(), backup.SecretUpdate{Passphrase: &passphrase}); err != nil {
		re.t.Fatal(err)
	}
	r, err := re.bk.RunNow(ctx, backup.KindManual)
	if err != nil || r.Status != backup.StatusSucceeded {
		re.t.Fatalf("backup: %+v %v", r, err)
	}
	return r.ArchiveName
}

func (re *restoreEnv) member() *env {
	_, secret, _ := re.invite(map[string]any{})
	m := newClientFor(re.env)
	resp, out := m.do("POST", "/api/v1/auth/register", map[string]string{"email": "m@example.com", "password": "another long password", "invitation": secret})
	m.mustStatus(resp, 201, out)
	return m
}

func (e *env) uploadArchive(body []byte, headers ...string) (*http.Response, map[string]any) {
	e.t.Helper()
	req, _ := http.NewRequest("POST", e.srv.URL+"/api/v1/backups/restore/uploads", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/octet-stream")
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	resp, err := e.client.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer resp.Body.Close()
	var out map[string]any
	raw, _ := io.ReadAll(resp.Body)
	_ = json.Unmarshal(raw, &out)
	return resp, out
}

func (re *restoreEnv) staleSession() {
	if _, err := re.db.Exec("UPDATE session_auth SET reauth_at = ?", time.Now().Add(-FreshWindow-time.Minute).UnixMilli()); err != nil {
		re.t.Fatal(err)
	}
}

var restoreRoutes = []struct{ method, path string }{
	{"GET", "/api/v1/backups/archives"},
	{"GET", "/api/v1/backups/restore"},
	{"POST", "/api/v1/backups/restore"},
	{"POST", "/api/v1/backups/restore/uploads"},
	{"POST", "/api/v1/backups/restore/prepare"},
	{"DELETE", "/api/v1/backups/restore/0123456789abcdef0123456789abcdef"},
	{"DELETE", "/api/v1/backups/restore/safety-copies/opentodo.db.pre-restore-20261013-030000"},
}

// 4.1–4.5: no session is 401, a member is 403 and nothing is touched.
func TestRestoreRoutesAuth(t *testing.T) {
	re := newRestoreEnv(t)
	anon := newClientFor(re.env)
	for _, r := range restoreRoutes {
		resp, out := anon.do(r.method, r.path, map[string]any{})
		anon.mustStatus(resp, 401, out)
	}
	copyPath := filepath.Join(re.dir, "opentodo.db.pre-restore-20261013-030000")
	os.WriteFile(copyPath, []byte("x"), 0o600)
	m := re.member()
	for _, r := range restoreRoutes {
		resp, out := m.do(r.method, r.path, map[string]any{"source": map[string]string{"archive": "x"}})
		m.mustStatus(resp, 403, out)
		if errCode(out) != "forbidden" {
			t.Fatalf("%s %s code = %s", r.method, r.path, errCode(out))
		}
	}
	if resp, out := m.uploadArchive([]byte("archive bytes")); resp.StatusCode != 403 {
		t.Fatalf("member upload = %d %v", resp.StatusCode, out)
	}
	if _, err := os.Stat(copyPath); err != nil {
		t.Fatal("a member deleted the safety copy")
	}
	if left, _ := os.ReadDir(filepath.Join(re.dir, "tmp", "restore")); len(left) != 0 {
		t.Fatalf("a member's upload was stored: %v", left)
	}
}

func TestRestoreArchivesList(t *testing.T) {
	re := newRestoreEnv(t)
	name := re.archive("pw")
	os.WriteFile(filepath.Join(re.dir, "backups", "notes.txt"), []byte("x"), 0o600)
	resp, out := re.do("GET", "/api/v1/backups/archives", nil)
	re.mustStatus(resp, 200, out)
	list := out["archives"].([]any)
	if len(list) != 1 || list[0].(map[string]any)["name"] != name || list[0].(map[string]any)["encrypted"] != true {
		t.Fatalf("archives = %v", out)
	}
	// An unreachable WebDAV destination: 502 naming it, without credentials.
	set := backup.DefaultSettings()
	set.Destination = backup.DestWebDAV
	set.WebDAV = backup.WebDAVSettings{URL: "http://127.0.0.1:1/dav/", Username: "me", AllowHTTP: true}
	pw := "hunter2-secret"
	if _, err := re.bk.SaveSettings(context.Background(), set, backup.SecretUpdate{WebDAVPassword: &pw}); err != nil {
		t.Fatal(err)
	}
	resp, out = re.do("GET", "/api/v1/backups/archives", nil)
	re.mustStatus(resp, 502, out)
	msg := out["error"].(map[string]any)["message"].(string)
	if errCode(out) != "destination_error" || !strings.Contains(msg, "127.0.0.1:1/dav/") || strings.Contains(msg, pw) {
		t.Fatalf("unreachable = %v", out)
	}
}

func TestRestoreUploadRoute(t *testing.T) {
	re := newRestoreEnv(t)
	name := re.archive("")
	raw, _ := os.ReadFile(filepath.Join(re.dir, "backups", name))
	resp, out := re.uploadArchive(raw)
	re.mustStatus(resp, 201, out)
	if out["id"] == "" || out["manifest"] == nil || out["encrypted"] != false {
		t.Fatalf("upload = %v", out)
	}
	// A photo: 400 integrity, nothing kept.
	resp, out = re.uploadArchive(append([]byte{0xff, 0xd8, 0xff, 0xe0}, bytes.Repeat([]byte("j"), 2048)...))
	re.mustStatus(resp, 400, out)
	if errCode(out) != "integrity" {
		t.Fatalf("jpeg code = %s", errCode(out))
	}
	if left, _ := os.ReadDir(filepath.Join(re.dir, "tmp", "restore")); len(left) != 0 {
		t.Fatalf("files kept after a jpeg: %v", left)
	}
	// Too little disk: 507, partial removed.
	re.free = int64(2*len(raw)) + 64<<20 // the DB (twice) plus the margin leave less than the archive
	if fi, _ := os.Stat(store.DBPath(re.dir)); fi != nil {
		re.free = 2*fi.Size() + 64<<20 + int64(len(raw)/2)
	}
	resp, out = re.uploadArchive(raw)
	re.mustStatus(resp, 507, out)
	if errCode(out) != "insufficient_storage" {
		t.Fatalf("over cap code = %s", errCode(out))
	}
	if left, _ := os.ReadDir(filepath.Join(re.dir, "tmp", "restore")); len(left) != 0 {
		t.Fatalf("partial upload kept: %v", left)
	}
}

func TestRestorePrepareRoute(t *testing.T) {
	re := newRestoreEnv(t)
	name := re.archive("secret")
	prep := func(body map[string]any) (*http.Response, map[string]any) {
		return re.do("POST", "/api/v1/backups/restore/prepare", body)
	}
	// The stored passphrase opens it: a preview with counts.
	resp, out := prep(map[string]any{"source": map[string]string{"archive": name}})
	re.mustStatus(resp, 200, out)
	counts := out["counts"].(map[string]any)
	if out["verified"] != true || counts["accounts"].(float64) != 1 {
		t.Fatalf("preview = %v", out)
	}
	// Without the stored passphrase.
	empty := ""
	if _, err := re.bk.SaveSettings(context.Background(), backup.DefaultSettings(), backup.SecretUpdate{Passphrase: &empty}); err != nil {
		t.Fatal(err)
	}
	for _, c := range []struct {
		body       map[string]any
		status     int
		code, desc string
	}{
		{map[string]any{"source": map[string]string{"archive": name}}, 422, "passphrase_required", "none given"},
		{map[string]any{"source": map[string]string{"archive": name}, "passphrase": "wrong"}, 422, "passphrase_invalid", "wrong one"},
		{map[string]any{"source": map[string]string{"archive": "../opentodo.db"}}, 400, "invalid_input", "path"},
		{map[string]any{"source": map[string]string{}}, 400, "invalid_input", "no source"},
		{map[string]any{"source": map[string]string{"archive": "opentodo-20200101-000000-00000000.tar"}}, 404, "not_found", "missing"},
	} {
		resp, out := prep(c.body)
		if resp.StatusCode != c.status || errCode(out) != c.code {
			t.Fatalf("%s: %d %v", c.desc, resp.StatusCode, out)
		}
	}
	// A damaged archive: 400 integrity.
	plainName := re.archiveAt(time.Second, "")
	raw, _ := os.ReadFile(filepath.Join(re.dir, "backups", plainName))
	raw = damageGzip(t, raw)
	bad := "opentodo-20200101-000000-11111111.tar.gz"
	os.WriteFile(filepath.Join(re.dir, "backups", bad), raw, 0o600)
	resp, out = prep(map[string]any{"source": map[string]string{"archive": bad}})
	if resp.StatusCode != 400 || errCode(out) != "integrity" {
		t.Fatalf("damaged: %d %v", resp.StatusCode, out)
	}
}

// archiveAt waits d of wall clock so the next archive gets another name.
func (re *restoreEnv) archiveAt(d time.Duration, pass string) string {
	time.Sleep(d)
	return re.archive(pass)
}

func TestRestoreConfirmRoute(t *testing.T) {
	re := newRestoreEnv(t)
	name := re.archive("")
	resp, out := re.do("POST", "/api/v1/backups/restore/prepare", map[string]any{"source": map[string]string{"archive": name}})
	re.mustStatus(resp, 200, out)
	id := out["id"].(string)
	confirm := func(body map[string]any, headers ...string) (*http.Response, map[string]any) {
		return re.do("POST", "/api/v1/backups/restore", body, headers...)
	}
	// Wrong word.
	resp, out = confirm(map[string]any{"id": id, "confirm": "restore"})
	if resp.StatusCode != 400 || errCode(out) != "invalid_input" || out["error"].(map[string]any)["field"] != "confirm" {
		t.Fatalf("wrong word: %d %v", resp.StatusCode, out)
	}
	// Unknown id.
	resp, out = confirm(map[string]any{"id": "0123456789abcdef0123456789abcdef", "confirm": "RESTORE"})
	re.mustStatus(resp, 404, out)
	// An API token, even a full one.
	resp, out = re.do("POST", "/api/v1/tokens", map[string]string{"name": "cli"})
	re.mustStatus(resp, 201, out)
	tok := out["secret"].(string)
	anon := newClientFor(re.env)
	resp, out = anon.do("POST", "/api/v1/backups/restore", map[string]any{"id": id, "confirm": "RESTORE"}, "Authorization", "Bearer "+tok)
	if resp.StatusCode != 403 || errCode(out) != "session_required" {
		t.Fatalf("token: %d %v", resp.StatusCode, out)
	}
	// A stale session must re-authenticate.
	re.staleSession()
	resp, out = confirm(map[string]any{"id": id, "confirm": "RESTORE"})
	if resp.StatusCode != 403 || errCode(out) != "reauth_required" {
		t.Fatalf("stale: %d %v", resp.StatusCode, out)
	}
	if _, err := re.db.Exec("UPDATE session_auth SET reauth_at = ?", time.Now().UnixMilli()); err != nil {
		t.Fatal(err)
	}
	if re.restarted {
		t.Fatal("restarted before a valid confirmation")
	}
	resp, out = confirm(map[string]any{"id": id, "confirm": "RESTORE"})
	re.mustStatus(resp, 202, out)
	if !re.restarted {
		t.Fatal("no restart requested")
	}
	if _, err := os.Stat(filepath.Join(re.dir, backup.PendingRestoreFile)); err != nil {
		t.Fatal("pending marker missing")
	}
	// Once confirmed, no backup can start (the process is about to restart).
	resp, out = re.do("POST", "/api/v1/backups/run", nil)
	re.mustStatus(resp, 409, out)
}

func TestRestoreConfirmDuringBackup(t *testing.T) {
	re := newRestoreEnv(t)
	name := re.archive("")
	resp, out := re.do("POST", "/api/v1/backups/restore/prepare", map[string]any{"source": map[string]string{"archive": name}})
	re.mustStatus(resp, 200, out)
	id := out["id"].(string)
	// Hold the run lock as a running backup does.
	if err := re.bk.StartRun(context.Background(), backup.KindManual, ""); err != nil {
		t.Fatal(err)
	}
	// The run keeps writing under the data directory: cancel it and wait before
	// the temporary directory is removed (cleanups run last-registered first).
	t.Cleanup(re.bk.Stop)
	resp, out = re.do("POST", "/api/v1/backups/restore", map[string]any{"id": id, "confirm": "RESTORE"})
	if resp.StatusCode == 202 {
		t.Skip("the backup finished before the confirmation")
	}
	if resp.StatusCode != 409 || errCode(out) != "conflict" {
		t.Fatalf("during a run: %d %v", resp.StatusCode, out)
	}
}

func TestRestoreStateCancelAndSafetyCopies(t *testing.T) {
	re := newRestoreEnv(t)
	name := re.archive("")
	resp, out := re.do("POST", "/api/v1/backups/restore/prepare", map[string]any{"source": map[string]string{"archive": name}})
	re.mustStatus(resp, 200, out)
	id := out["id"].(string)
	os.WriteFile(filepath.Join(re.dir, "opentodo.db.pre-restore-20261013-030000"), []byte("old database"), 0o600)
	resp, out = re.do("GET", "/api/v1/backups/restore", nil)
	re.mustStatus(resp, 200, out)
	if out["staged"].(map[string]any)["id"] != id || len(out["safetyCopies"].([]any)) != 1 || out["undoAvailable"] != false {
		t.Fatalf("state = %v", out)
	}
	// Cancel removes the staged files.
	resp, _ = re.do("DELETE", "/api/v1/backups/restore/"+id, nil)
	if resp.StatusCode != 204 {
		t.Fatalf("cancel = %d", resp.StatusCode)
	}
	if left, _ := os.ReadDir(filepath.Join(re.dir, "tmp", "restore")); len(left) != 0 {
		t.Fatalf("cancel kept files: %v", left)
	}
	// Safety copies: invalid name, stale session, then a delete.
	resp, out = re.do("DELETE", "/api/v1/backups/restore/safety-copies/opentodo.db", nil)
	if resp.StatusCode != 400 || errCode(out) != "invalid_input" {
		t.Fatalf("invalid name: %d %v", resp.StatusCode, out)
	}
	re.staleSession()
	resp, out = re.do("DELETE", "/api/v1/backups/restore/safety-copies/opentodo.db.pre-restore-20261013-030000", nil)
	if resp.StatusCode != 403 || errCode(out) != "reauth_required" {
		t.Fatalf("stale delete: %d %v", resp.StatusCode, out)
	}
	if _, err := re.db.Exec("UPDATE session_auth SET reauth_at = ?", time.Now().UnixMilli()); err != nil {
		t.Fatal(err)
	}
	resp, _ = re.do("DELETE", "/api/v1/backups/restore/safety-copies/opentodo.db.pre-restore-20261013-030000", nil)
	if resp.StatusCode != 204 {
		t.Fatalf("delete = %d", resp.StatusCode)
	}
	resp, out = re.do("GET", "/api/v1/backups/restore", nil)
	re.mustStatus(resp, 200, out)
	if len(out["safetyCopies"].([]any)) != 0 {
		t.Fatalf("after delete = %v", out)
	}
}
