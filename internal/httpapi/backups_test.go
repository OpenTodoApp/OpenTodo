package httpapi

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/backup"
	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// backupEnv is newEnv plus the backup service, with the owner signed in.
func backupEnv(t *testing.T) (*env, *backup.Service, string) {
	t.Helper()
	dir := t.TempDir()
	db, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	cfg := config.Config{SessionTTL: time.Hour}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	syncSvc := opsync.NewService(db)
	bk := backup.New(db, dir, backup.Options{Version: "test", Log: log})
	h := New(cfg, auth.NewService(db, cfg.SessionTTL, false), syncSvc, nil, log, "test", WithBackups(bk))
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	t.Cleanup(syncSvc.Notifier().CloseAll)
	jar, _ := cookiejar.New(nil)
	e := &env{t: t, srv: srv, client: &http.Client{Jar: jar}, db: db, handler: h, sync: syncSvc}
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	return e, bk, dir
}

var backupRoutes = []struct{ method, path string }{
	{"GET", "/api/v1/backups"},
	{"GET", "/api/v1/backups/settings"},
	{"PUT", "/api/v1/backups/settings"},
	{"POST", "/api/v1/backups/run"},
	{"POST", "/api/v1/backups/test"},
}

func TestBackupRoutesRequireAuth(t *testing.T) {
	e, _, _ := backupEnv(t)
	anon := newClientFor(e)
	for _, r := range backupRoutes {
		resp, out := anon.do(r.method, r.path, map[string]any{})
		anon.mustStatus(resp, 401, out)
		if errCode(out) != "unauthorized" {
			t.Fatalf("%s %s code = %s", r.method, r.path, errCode(out))
		}
	}
	// A bearer token of the owner works like the session.
	resp, out := e.do("POST", "/api/v1/tokens", map[string]string{"name": "cli"})
	e.mustStatus(resp, 201, out)
	tok := out["secret"].(string)
	resp, out = anon.do("GET", "/api/v1/backups", nil, "Authorization", "Bearer "+tok)
	anon.mustStatus(resp, 200, out)
}

func TestBackupRoutesForbidMembers(t *testing.T) {
	e, _, _ := backupEnv(t)
	_, secret, _ := e.invite(map[string]any{})
	member := newClientFor(e)
	resp, out := member.do("POST", "/api/v1/auth/register", map[string]string{"email": "m@example.com", "password": "another long password", "invitation": secret})
	member.mustStatus(resp, 201, out)
	for _, r := range backupRoutes {
		resp, out := member.do(r.method, r.path, map[string]any{"settings": backup.DefaultSettings()})
		member.mustStatus(resp, 403, out)
		if errCode(out) != "forbidden" {
			t.Fatalf("%s %s code = %s", r.method, r.path, errCode(out))
		}
	}
	// Nothing ran and nothing was written.
	var n int
	e.db.QueryRow(`SELECT COUNT(*) FROM backup_runs`).Scan(&n)
	var s int
	e.db.QueryRow(`SELECT COUNT(*) FROM settings WHERE key = 'backup'`).Scan(&s)
	if n != 0 || s != 0 {
		t.Fatalf("member caused runs=%d settings=%d", n, s)
	}
}

func putSettings(e *env, set backup.Settings, secrets map[string]any) (*http.Response, map[string]any) {
	return e.do("PUT", "/api/v1/backups/settings", map[string]any{"settings": set, "secrets": secrets})
}

func TestBackupSettingsValidation400(t *testing.T) {
	e, _, _ := backupEnv(t)
	good := backup.DefaultSettings()
	good.Schedule.Frequency = "daily"
	resp, out := putSettings(e, good, nil)
	e.mustStatus(resp, 200, out)

	bad := backup.DefaultSettings()
	bad.Destination = "s3"
	bad.S3 = backup.S3Settings{Endpoint: "https://s3.example.com", AccessKey: "AK"}
	resp, out = putSettings(e, bad, map[string]any{"s3SecretKey": "sk"})
	e.mustStatus(resp, 400, out)
	errObj := out["error"].(map[string]any)
	if errObj["code"] != "invalid_input" || errObj["field"] != "s3.bucket" || !strings.Contains(errObj["message"].(string), "s3.bucket") {
		t.Fatalf("error = %v", errObj)
	}
	zero := backup.DefaultSettings()
	zero.Retention.KeepLast = 0
	resp, out = putSettings(e, zero, nil)
	e.mustStatus(resp, 400, out)
	if out["error"].(map[string]any)["field"] != "retention.keepLast" {
		t.Fatalf("error = %v", out)
	}
	resp, out = e.do("PUT", "/api/v1/backups/settings", map[string]any{})
	e.mustStatus(resp, 400, out)
	resp, out = e.do("PUT", "/api/v1/backups/settings", "not json")
	e.mustStatus(resp, 400, out)

	// The previous settings remain active and no secret was stored.
	resp, out = e.do("GET", "/api/v1/backups/settings", nil)
	e.mustStatus(resp, 200, out)
	set := out["settings"].(map[string]any)
	if set["destination"] != "local" || set["schedule"].(map[string]any)["frequency"] != "daily" {
		t.Fatalf("settings after failed update = %v", set)
	}
	if out["secrets"].(map[string]any)["hasS3SecretKey"] != false {
		t.Fatalf("secret stored despite 400: %v", out["secrets"])
	}
}

func TestSettingsResponseHasNoSecrets(t *testing.T) {
	e, _, _ := backupEnv(t)
	set := backup.DefaultSettings()
	set.Destination = "webdav"
	set.WebDAV = backup.WebDAVSettings{URL: "https://dav.example.com/backups", Username: "me"}
	const pw, phrase = "WEBDAV-PASSWORD-xyz", "PASSPHRASE-abc-123"
	resp, out := putSettings(e, set, map[string]any{"webdavPassword": pw, "passphrase": phrase})
	e.mustStatus(resp, 200, out)
	for _, path := range []string{"/api/v1/backups/settings", "/api/v1/backups"} {
		req, _ := http.NewRequest("GET", e.srv.URL+path, nil)
		r, err := e.client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		raw, _ := io.ReadAll(r.Body)
		r.Body.Close()
		if strings.Contains(string(raw), pw) || strings.Contains(string(raw), phrase) {
			t.Fatalf("%s leaks a secret: %s", path, raw)
		}
	}
	resp, out = e.do("GET", "/api/v1/backups/settings", nil)
	e.mustStatus(resp, 200, out)
	flags := out["secrets"].(map[string]any)
	if flags["hasWebdavPassword"] != true || flags["hasPassphrase"] != true || flags["hasS3SecretKey"] != false {
		t.Fatalf("flags = %v", flags)
	}
	// Omitting a secret keeps it; an empty string clears it.
	resp, out = putSettings(e, set, map[string]any{"passphrase": ""})
	e.mustStatus(resp, 200, out)
	flags = out["secrets"].(map[string]any)
	if flags["hasWebdavPassword"] != true || flags["hasPassphrase"] != false {
		t.Fatalf("flags after clear = %v", flags)
	}
	resp, out = e.do("GET", "/api/v1/backups", nil)
	e.mustStatus(resp, 200, out)
	if out["encrypted"] != false {
		t.Fatalf("status = %v", out)
	}
}

func TestBackupRunConflict409(t *testing.T) {
	e, _, _ := backupEnv(t)
	// A WebDAV destination that holds every upload until released keeps the
	// first run in progress.
	release := make(chan struct{})
	var once sync.Once
	unblock := func() { once.Do(func() { close(release) }) }
	t.Cleanup(unblock)
	dav := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case "MKCOL":
			w.WriteHeader(201)
		case "PUT":
			io.Copy(io.Discard, r.Body)
			<-release
			w.WriteHeader(201)
		case "PROPFIND":
			w.WriteHeader(404)
		default:
			w.WriteHeader(204)
		}
	}))
	t.Cleanup(dav.Close)
	set := backup.DefaultSettings()
	set.Destination = "webdav"
	set.WebDAV = backup.WebDAVSettings{URL: dav.URL + "/dav/", AllowHTTP: true}
	resp, out := putSettings(e, set, nil)
	e.mustStatus(resp, 200, out)

	resp, out = e.do("POST", "/api/v1/backups/run", nil)
	e.mustStatus(resp, 202, out)
	// The status shows the run in progress ...
	_, out = e.do("GET", "/api/v1/backups", nil)
	if out["running"] == nil {
		t.Fatalf("status during run = %v", out)
	}
	// ... and a second request conflicts without starting another run.
	resp, out = e.do("POST", "/api/v1/backups/run", nil)
	e.mustStatus(resp, 409, out)
	if errCode(out) != "conflict" {
		t.Fatalf("code = %s", errCode(out))
	}
	var n int
	e.db.QueryRow(`SELECT COUNT(*) FROM backup_runs`).Scan(&n)
	if n != 1 {
		t.Fatalf("runs = %d, want 1", n)
	}
	unblock()
	// Then its outcome and size, with no other action.
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		_, out = e.do("GET", "/api/v1/backups", nil)
		if out["running"] == nil && out["lastRun"] != nil {
			last := out["lastRun"].(map[string]any)
			if last["status"] != "succeeded" || last["bytes"].(float64) <= 0 || !strings.HasPrefix(last["archiveName"].(string), "opentodo-") {
				t.Fatalf("last run = %v", last)
			}
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("run did not finish: %v", out)
}

func TestBackupTestEndpoint(t *testing.T) {
	e, _, _ := backupEnv(t)
	resp, out := e.do("POST", "/api/v1/backups/test", nil)
	e.mustStatus(resp, 200, out) // default local destination
	// An unreachable WebDAV destination reports the destination's error.
	srv := httptest.NewServer(http.NotFoundHandler())
	url := srv.URL
	srv.Close()
	set := backup.DefaultSettings()
	set.Destination = "webdav"
	set.WebDAV = backup.WebDAVSettings{URL: url + "/dav/", AllowHTTP: true}
	resp, out = putSettings(e, set, nil)
	e.mustStatus(resp, 200, out)
	resp, out = e.do("POST", "/api/v1/backups/test", nil)
	e.mustStatus(resp, 502, out)
	if errCode(out) != "destination_error" || !strings.Contains(out["error"].(map[string]any)["message"].(string), "connection refused") {
		t.Fatalf("test error = %v", out)
	}
}

// Every sync response carries the log generation; it is stable until a restore
// changes it (simulated here by rewriting the settings row, as restore does).
func TestSyncResponseCarriesGeneration(t *testing.T) {
	e := newEnv(t, true)
	e.register("a@example.com")
	resp, out := e.do("POST", "/api/v1/sync", map[string]any{"device": "d1", "cursor": 0, "ops": []any{}})
	e.mustStatus(resp, 200, out)
	gen, _ := out["generation"].(string)
	if len(gen) != 32 {
		t.Fatalf("generation = %v", out["generation"])
	}
	_, out = e.do("POST", "/api/v1/sync", map[string]any{"device": "d2", "cursor": 0, "ops": []any{}})
	if out["generation"] != gen {
		t.Fatalf("generation not stable: %v vs %s", out["generation"], gen)
	}
	if _, err := e.db.Exec(`UPDATE settings SET value = 'ffffffffffffffffffffffffffffffff' WHERE key = 'generation'`); err != nil {
		t.Fatal(err)
	}
	_, out = e.do("POST", "/api/v1/sync", map[string]any{"device": "d1", "cursor": 0, "ops": []any{}})
	if out["generation"] != "ffffffffffffffffffffffffffffffff" {
		t.Fatalf("generation after restore = %v", out["generation"])
	}
}
