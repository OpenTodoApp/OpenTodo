package backup

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/settings"
	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// seed creates an owner, an API token and two tasks; it returns the owner id.
func seed(t *testing.T, e *testEnv) string {
	t.Helper()
	ctx := context.Background()
	a := auth.NewService(e.db, time.Hour, true)
	u, err := a.Register(ctx, "owner@example.com", "Owner", "correct horse battery", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := a.CreateToken(ctx, u.ID, "cli"); err != nil {
		t.Fatal(err)
	}
	s := opsync.NewService(e.db)
	if _, err := s.Apply(ctx, u.ID, []opsync.Op{taskOp("o1", "t1", "first", 1), taskOp("o2", "t2", "second", 2)}); err != nil {
		t.Fatal(err)
	}
	return u.ID
}

func count(t *testing.T, dir, query string) int {
	t.Helper()
	db, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var n int
	if err := db.QueryRow(query).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// backupOnce runs an (optionally encrypted) backup to <data>/backups and returns the archive path.
func backupOnce(t *testing.T, e *testEnv, passphrase string) string {
	t.Helper()
	ctx := context.Background()
	upd := SecretUpdate{Passphrase: &passphrase} // "" clears a previously set passphrase
	if _, err := e.svc.SaveSettings(ctx, DefaultSettings(), upd); err != nil {
		t.Fatal(err)
	}
	r, err := e.svc.RunNow(ctx, KindManual)
	if err != nil || r.Status != StatusSucceeded {
		t.Fatalf("backup: %+v %v", r, err)
	}
	return filepath.Join(e.dir, "backups", r.ArchiveName)
}

func TestRestoreRoundTrip(t *testing.T) {
	e := newTestEnv(t)
	ctx := context.Background()
	uid := seed(t, e)
	oldGen, _ := e.svc.generation(ctx)
	archive := backupOnce(t, e, "restore me")
	if !strings.HasSuffix(archive, ".tar.gz.enc") {
		t.Fatalf("archive = %s", archive)
	}
	// Work done after the backup: lost on the server by the restore, kept in the safety copy.
	if _, err := opsync.NewService(e.db).Apply(ctx, uid, []opsync.Op{taskOp("o3", "t3", "after backup", 3)}); err != nil {
		t.Fatal(err)
	}
	e.db.Close() // the server is stopped

	res, err := Restore(RestoreOptions{DataDir: e.dir, Archive: archive, Passphrase: "restore me"})
	if err != nil {
		t.Fatal(err)
	}
	if res.SafetyCopy == "" || res.Generation == "" || res.Generation == oldGen || !res.Manifest.Encrypted {
		t.Fatalf("result = %+v", res)
	}
	// Accounts, tokens, tasks and the op log match the archive.
	if n := count(t, e.dir, "SELECT COUNT(*) FROM users"); n != 1 {
		t.Fatalf("users = %d", n)
	}
	if n := count(t, e.dir, "SELECT COUNT(*) FROM api_tokens"); n != 1 {
		t.Fatalf("tokens = %d", n)
	}
	if n := count(t, e.dir, "SELECT COUNT(*) FROM ops"); n != 2 {
		t.Fatalf("ops = %d, want the 2 from before the backup", n)
	}
	// The safety copy holds the pre-restore state, including the later op.
	safety, err := store.OpenFile(res.SafetyCopy)
	if err != nil {
		t.Fatal(err)
	}
	var n int
	safety.QueryRow("SELECT COUNT(*) FROM ops").Scan(&n)
	safety.Close()
	if n != 3 {
		t.Fatalf("safety copy ops = %d, want 3", n)
	}
	// The server would see the new generation.
	db, err := store.Open(e.dir)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	gen, _ := settings.New(db).GetString(ctx, settings.GenerationKey)
	if gen != res.Generation {
		t.Fatalf("generation = %q, want %q", gen, res.Generation)
	}
	if left, _ := os.ReadDir(filepath.Join(e.dir, "tmp")); len(left) != 0 {
		t.Fatalf("temp files left: %v", left)
	}
}

func TestRestoreUnencryptedArchive(t *testing.T) {
	e := newTestEnv(t)
	seed(t, e)
	archive := backupOnce(t, e, "")
	e.db.Close()
	if _, err := Restore(RestoreOptions{DataDir: e.dir, Archive: archive}); err != nil {
		t.Fatal(err)
	}
	if n := count(t, e.dir, "SELECT COUNT(*) FROM ops"); n != 2 {
		t.Fatalf("ops = %d", n)
	}
}

// dbBytes snapshots the data directory's database bytes for later comparison.
func dbBytes(t *testing.T, dir string) []byte {
	t.Helper()
	b, err := os.ReadFile(store.DBPath(dir))
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func assertUntouched(t *testing.T, dir string, before []byte) {
	t.Helper()
	if !bytes.Equal(before, dbBytes(t, dir)) {
		t.Fatal("database changed")
	}
	matches, _ := filepath.Glob(store.DBPath(dir) + ".pre-restore-*")
	if len(matches) != 0 {
		t.Fatalf("safety copy written: %v", matches)
	}
}

func TestRestoreRefusesNewerSchema(t *testing.T) {
	e := newTestEnv(t)
	seed(t, e)
	snap, err := e.svc.snapshot(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	m := testManifest()
	m.SchemaVersion = store.LatestVersion() + 1
	archive := filepath.Join(t.TempDir(), "future.tar")
	f, _ := os.Create(archive)
	if err := writeArchive(f, snap, m, archiveOptions{}); err != nil {
		t.Fatal(err)
	}
	f.Close()
	e.db.Close()
	before := dbBytes(t, e.dir)
	_, err = Restore(RestoreOptions{DataDir: e.dir, Archive: archive})
	if !errors.Is(err, ErrNewerSchema) {
		t.Fatalf("err = %v", err)
	}
	for _, v := range []int{store.LatestVersion() + 1, store.LatestVersion()} {
		if !strings.Contains(err.Error(), fmt.Sprint(v)) {
			t.Fatalf("error %q does not name version %d", err, v)
		}
	}
	assertUntouched(t, e.dir, before)
}

func TestRestoreRefusesWhileLocked(t *testing.T) {
	e := newTestEnv(t)
	seed(t, e)
	archive := backupOnce(t, e, "")
	// A running server holds the data directory lock.
	release, err := store.Lock(e.dir)
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	e.db.Close()
	before := dbBytes(t, e.dir)
	_, err = Restore(RestoreOptions{DataDir: e.dir, Archive: archive})
	if !errors.Is(err, store.ErrLocked) || !strings.Contains(err.Error(), "stop the server") {
		t.Fatalf("err = %v", err)
	}
	assertUntouched(t, e.dir, before)
}

func TestRestoreEncryptedNeedsPassphrase(t *testing.T) {
	e := newTestEnv(t)
	seed(t, e)
	archive := backupOnce(t, e, "pw")
	e.db.Close()
	before := dbBytes(t, e.dir)
	if _, err := Restore(RestoreOptions{DataDir: e.dir, Archive: archive}); !errors.Is(err, ErrPassphraseRequired) || !strings.Contains(err.Error(), "passphrase") {
		t.Fatalf("missing passphrase: %v", err)
	}
	if _, err := Restore(RestoreOptions{DataDir: e.dir, Archive: archive, Passphrase: "wrong"}); !errors.Is(err, ErrIntegrity) {
		t.Fatalf("wrong passphrase: %v", err)
	}
	assertUntouched(t, e.dir, before)
}

func TestRestoreTamperedArchiveFails(t *testing.T) {
	e := newTestEnv(t)
	seed(t, e)
	for _, pass := range []string{"pw", ""} {
		archive := backupOnce(t, e, pass)
		e.clock.Advance(time.Second)
		raw, _ := os.ReadFile(archive)
		raw = tamper(t, raw)
		bad := filepath.Join(t.TempDir(), "bad")
		os.WriteFile(bad, raw, 0o600)
		_, err := Restore(RestoreOptions{DataDir: e.dir + "-other", Archive: bad, Passphrase: pass})
		if !errors.Is(err, ErrIntegrity) {
			t.Fatalf("pass=%q: tampered archive err = %v", pass, err)
		}
		if _, err := os.Stat(store.DBPath(e.dir + "-other")); err == nil {
			t.Fatalf("pass=%q: database written despite tampering", pass)
		}
	}
}

// TestRestoreBringsBackPushKey: the web push key pair travels with the archive
// (OpenSpec reminders), so restored subscriptions keep working on a new host.
func TestRestoreBringsBackPushKey(t *testing.T) {
	e := newTestEnv(t)
	seed(t, e)
	key := []byte("-----BEGIN EC PRIVATE KEY-----\nfake\n-----END EC PRIVATE KEY-----\n")
	keyPath := filepath.Join(e.dir, ExtraFiles[0])
	if err := os.WriteFile(keyPath, key, 0o600); err != nil {
		t.Fatal(err)
	}
	archive := backupOnce(t, e, "pw")
	e.db.Close()
	// A new host: the key file is gone.
	if err := os.Remove(keyPath); err != nil {
		t.Fatal(err)
	}
	res, err := Restore(RestoreOptions{DataDir: e.dir, Archive: archive, Passphrase: "pw"})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Manifest.Files) != 2 || res.Manifest.Files[1].Name != ExtraFiles[0] {
		t.Fatalf("manifest files = %+v", res.Manifest.Files)
	}
	got, err := os.ReadFile(keyPath)
	if err != nil || !bytes.Equal(got, key) {
		t.Fatalf("restored key = %q, %v", got, err)
	}
	if st, _ := os.Stat(keyPath); st.Mode().Perm() != 0o600 {
		t.Fatalf("restored key mode = %v", st.Mode().Perm())
	}
}
