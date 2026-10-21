package backup

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// backup-restore-web 1.2: a wrong passphrase is told apart from corruption
// later in the archive, and both still count as integrity failures.
func TestStageWrongPassphraseVsTruncation(t *testing.T) {
	e := newTestEnv(t)
	seed(t, e)
	snap, err := e.svc.snapshot(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	m := testManifest()
	m.Files = nil
	var buf bytes.Buffer
	// Small chunks, so the archive has many and truncation hits a later one.
	if err := writeArchive(&buf, snap, m, archiveOptions{passphrase: "right", chunkSize: 4096}); err != nil {
		t.Fatal(err)
	}
	raw := buf.Bytes()

	_, err = Stage(t.TempDir(), bytes.NewReader(raw), "wrong", "a")
	if !errors.Is(err, ErrPassphraseInvalid) || !errors.Is(err, ErrIntegrity) {
		t.Fatalf("wrong passphrase: %v", err)
	}
	_, err = Stage(t.TempDir(), bytes.NewReader(raw[:len(raw)-100]), "right", "a")
	if !errors.Is(err, ErrIntegrity) || errors.Is(err, ErrPassphraseInvalid) {
		t.Fatalf("truncated: %v", err)
	}
}

// backup-restore-web 1.3: preview counts come from the archive's own schema,
// for the current schema and for the very first one.
func TestPreviewCounts(t *testing.T) {
	e := newTestEnv(t)
	uid := seed(t, e) // one account, two tasks
	ctx := context.Background()
	if _, err := opsync.NewService(e.db).Apply(ctx, uid, []opsync.Op{
		{ID: "p1", Entity: "project", EntityID: "pr1", Field: "name", Value: json.RawMessage(`"Home"`), TS: 3, Device: "d"},
		{ID: "d1", Entity: "task", EntityID: "t2", Field: "deleted_at", Value: json.RawMessage(`5`), TS: 4, Device: "d"},
	}); err != nil {
		t.Fatal(err)
	}
	archive := backupOnce(t, e, "")
	f, _ := os.Open(archive)
	defer f.Close()
	st, err := Stage(t.TempDir(), f, "", filepath.Base(archive))
	if err != nil {
		t.Fatal(err)
	}
	c, err := Preview(st)
	if err != nil {
		t.Fatal(err)
	}
	if c != (Counts{Accounts: 1, Projects: 1, Tasks: 1, Ops: 4}) {
		t.Fatalf("current schema counts = %+v", c)
	}

	// Schema 0001: materialized values lived in `fields`.
	sqlInit, err := os.ReadFile("../store/migrations/0001_init.sql")
	if err != nil {
		t.Fatal(err)
	}
	old := filepath.Join(t.TempDir(), "old.db")
	db, err := store.OpenFile(old)
	if err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{string(sqlInit), `PRAGMA user_version = 1`,
		`INSERT INTO users(id, email, name, password_hash, created_at) VALUES('u', 'a@example.com', 'A', 'x', 0)`,
		`INSERT INTO fields VALUES('u', 'task', 't1', 'title', '"a"', 1, 'd'), ('u', 'task', 't2', 'title', '"b"', 1, 'd'),
		  ('u', 'task', 't2', 'deleted_at', 'null', 1, 'd'), ('u', 'task', 't3', 'deleted_at', '9', 1, 'd')`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatalf("%s: %v", q[:min(40, len(q))], err)
		}
	}
	db.Close()
	c, err = countDB(old)
	if err != nil {
		t.Fatal(err)
	}
	if c.Accounts != 1 || c.Tasks != 2 || c.Projects != 0 {
		t.Fatalf("schema 0001 counts = %+v", c)
	}
}

// prepared stages last night's archive the way the web app does.
func prepared(t *testing.T, e *testEnv, pass string) (StagedRestore, string) {
	t.Helper()
	uid := seed(t, e)
	archive := backupOnce(t, e, pass)
	r, err := e.svc.Prepare(context.Background(), PrepareSource{Archive: filepath.Base(archive)}, "", uid)
	if err != nil {
		t.Fatal(err)
	}
	return r, uid
}

// backup-restore-web 3.1: one staged restore at a time, expiry, and cleanup at start.
func TestStagingLifecycle(t *testing.T) {
	e := newTestEnv(t)
	ctx := context.Background()
	r, uid := prepared(t, e, "pw") // the stored passphrase opens it
	if !r.Verified || r.Counts == nil || r.Counts.Tasks != 2 || r.Manifest == nil || !r.Encrypted {
		t.Fatalf("prepared = %+v", r)
	}
	// Preparing another source replaces the first.
	e.clock.Advance(time.Second)
	archive2 := backupOnce(t, e, "pw")
	r2, err := e.svc.Prepare(ctx, PrepareSource{Archive: filepath.Base(archive2)}, "", uid)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(e.svc.stagingDir(r.ID)); !os.IsNotExist(err) {
		t.Fatal("the replaced staged restore was kept")
	}
	if err := e.svc.ConfirmRestore(ctx, r.ID, uid); !errors.Is(err, ErrStagedNotFound) {
		t.Fatalf("confirm replaced id: %v", err)
	}
	// 30 minutes later it has expired.
	e.clock.Advance(31 * time.Minute)
	if err := e.svc.ConfirmRestore(ctx, r2.ID, uid); !errors.Is(err, ErrStagedNotFound) {
		t.Fatalf("confirm expired id: %v", err)
	}
	if _, err := os.Stat(e.svc.stagingDir(r2.ID)); !os.IsNotExist(err) {
		t.Fatal("expired staged files kept")
	}
	// Leftovers are removed when the server starts.
	stray := e.svc.stagingDir(randomHex(16))
	os.MkdirAll(stray, 0o700)
	e.svc.sweepStaging("", true)
	if _, err := os.Stat(stray); !os.IsNotExist(err) {
		t.Fatal("startup kept a stray staging dir")
	}
	// Cancel removes the files at once.
	r3, err := e.svc.Prepare(ctx, PrepareSource{Archive: filepath.Base(archive2)}, "", uid)
	if err != nil {
		t.Fatal(err)
	}
	e.svc.CancelRestore(r3.ID)
	if _, err := os.Stat(e.svc.stagingDir(r3.ID)); !os.IsNotExist(err) {
		t.Fatal("cancel kept the files")
	}
}

func TestPrepareErrors(t *testing.T) {
	e := newTestEnv(t)
	ctx := context.Background()
	uid := seed(t, e)
	archive := backupOnce(t, e, "secret")
	// Forget the stored passphrase: an archive from "another server".
	empty := ""
	if _, err := e.svc.SaveSettings(ctx, DefaultSettings(), SecretUpdate{Passphrase: &empty}); err != nil {
		t.Fatal(err)
	}
	src := PrepareSource{Archive: filepath.Base(archive)}
	if _, err := e.svc.Prepare(ctx, src, "", uid); !errors.Is(err, ErrPassphraseRequired) {
		t.Fatalf("no passphrase: %v", err)
	}
	if _, err := e.svc.Prepare(ctx, src, "nope", uid); !errors.Is(err, ErrPassphraseInvalid) {
		t.Fatalf("wrong passphrase: %v", err)
	}
	if r, err := e.svc.Prepare(ctx, src, "secret", uid); err != nil || !r.Verified {
		t.Fatalf("right passphrase: %+v %v", r, err)
	}
	if _, err := e.svc.Prepare(ctx, PrepareSource{Archive: "../opentodo.db"}, "", uid); !errors.Is(err, ErrNotArchiveName) {
		t.Fatalf("path name: %v", err)
	}
	// A damaged archive is refused and nothing stays staged.
	e.clock.Advance(time.Second)
	plain := backupOnce(t, e, "")
	raw, _ := os.ReadFile(plain)
	raw = tamper(t, raw)
	bad := filepath.Join(e.dir, "backups", "opentodo-20200101-000000-00000000.tar.gz")
	os.WriteFile(bad, raw, 0o600)
	if _, err := e.svc.Prepare(ctx, PrepareSource{Archive: filepath.Base(bad)}, "", uid); !errors.Is(err, ErrIntegrity) || errors.Is(err, ErrPassphraseInvalid) {
		t.Fatalf("damaged: %v", err)
	}
	if left, _ := os.ReadDir(e.svc.restoreRoot()); len(left) != 0 {
		t.Fatalf("staged files left after a damaged archive: %v", left)
	}
}

func TestReceiveUpload(t *testing.T) {
	e := newTestEnv(t)
	ctx := context.Background()
	uid := seed(t, e)
	archive := backupOnce(t, e, "")
	f, _ := os.Open(archive)
	r, err := e.svc.ReceiveUpload(ctx, f, uid)
	f.Close()
	if err != nil {
		t.Fatal(err)
	}
	if r.Manifest == nil || r.Manifest.SchemaVersion != store.LatestVersion() || r.Encrypted || !IsArchiveName(r.Archive) {
		t.Fatalf("upload = %+v", r)
	}
	p, err := e.svc.Prepare(ctx, PrepareSource{Upload: r.ID}, "", uid)
	if err != nil || !p.Verified || p.ID != r.ID {
		t.Fatalf("prepare upload: %+v %v", p, err)
	}
	// A photo is refused and nothing is kept.
	jpeg := append([]byte{0xff, 0xd8, 0xff, 0xe0}, bytes.Repeat([]byte("x"), 4096)...)
	if _, err := e.svc.ReceiveUpload(ctx, bytes.NewReader(jpeg), uid); !errors.Is(err, ErrIntegrity) {
		t.Fatalf("jpeg: %v", err)
	}
	if left, _ := os.ReadDir(e.svc.restoreRoot()); len(left) != 0 {
		t.Fatalf("files left after a jpeg: %v", left)
	}
}

// confirmAndStop confirms r and closes the database, like the restart does.
func confirmAndStop(t *testing.T, e *testEnv, id, uid string) {
	t.Helper()
	restarted := false
	e.svc.SetRestartFunc(func() { restarted = true })
	if err := e.svc.ConfirmRestore(context.Background(), id, uid); err != nil {
		t.Fatal(err)
	}
	if !restarted {
		t.Fatal("restart not requested")
	}
	if _, err := os.Stat(filepath.Join(e.dir, PendingRestoreFile)); err != nil {
		t.Fatal("pending marker missing")
	}
	e.db.Close()
}

// backup-restore-web 3.2: the next start applies the confirmed restore.
func TestApplyPendingRestore(t *testing.T) {
	e := newTestEnv(t)
	r, uid := prepared(t, e, "")
	if _, err := opsync.NewService(e.db).Apply(context.Background(), uid, []opsync.Op{taskOp("o3", "t3", "after backup", 3)}); err != nil {
		t.Fatal(err)
	}
	// A backup run in progress blocks the confirmation.
	e.svc.runMu.Lock()
	if err := e.svc.ConfirmRestore(context.Background(), r.ID, uid); !errors.Is(err, ErrRunning) {
		t.Fatalf("confirm during a run: %v", err)
	}
	e.svc.runMu.Unlock()
	confirmAndStop(t, e, r.ID, uid)

	if err := ApplyPendingRestore(e.dir, nil, nil); err != nil {
		t.Fatal(err)
	}
	if n := count(t, e.dir, "SELECT COUNT(*) FROM ops"); n != 2 {
		t.Fatalf("ops = %d, want the 2 from the archive", n)
	}
	last, err := readLastRestore(e.dir)
	if err != nil || !last.OK || last.SafetyCopy == "" || last.ActorID != uid || last.Source != SourceArchive {
		t.Fatalf("last = %+v %v", last, err)
	}
	if _, err := os.Stat(filepath.Join(e.dir, last.SafetyCopy)); err != nil {
		t.Fatal("safety copy missing")
	}
	for _, p := range []string{PendingRestoreFile, filepath.Join("tmp", "restore", r.ID)} {
		if _, err := os.Stat(filepath.Join(e.dir, p)); !os.IsNotExist(err) {
			t.Fatalf("%s left behind", p)
		}
	}
	// The restored database carries the marker with the actor.
	if n := count(t, e.dir, `SELECT COUNT(*) FROM settings WHERE key = 'backup_restored_pending' AND value LIKE '%"actorId":"`+uid+`"%'`); n != 1 {
		t.Fatal("restore marker without actor")
	}
}

func TestApplyPendingRestoreIntegrityFailureKeepsDatabase(t *testing.T) {
	e := newTestEnv(t)
	r, uid := prepared(t, e, "")
	confirmAndStop(t, e, r.ID, uid)
	// The staged file is damaged between confirm and apply.
	os.WriteFile(filepath.Join(e.svc.stagingDir(r.ID), stagedDBName), []byte("not sqlite at all, sorry"), 0o600)
	before := dbBytes(t, e.dir)
	if err := ApplyPendingRestore(e.dir, nil, nil); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(before, dbBytes(t, e.dir)) {
		t.Fatal("database changed after a failed apply")
	}
	last, _ := readLastRestore(e.dir)
	if last.OK || last.Error == "" || last.RetryID != "" {
		t.Fatalf("last = %+v", last)
	}
	if _, err := os.Stat(e.svc.stagingDir(r.ID)); !os.IsNotExist(err) {
		t.Fatal("staged files kept after an integrity failure")
	}
	// The next start records the request and the failure.
	db, err := store.Open(e.dir)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	svc := New(db, e.dir, Options{Log: e.svc.log, Now: e.clock.Now, Audit: audit.New(db, e.svc.log)})
	svc.startRestoreHousekeeping(context.Background())
	if last, _ := readLastRestore(e.dir); !last.Audited {
		t.Fatal("outcome not marked as audited")
	}
	if n, out := auditRows(t, db, "backup.restore_requested"); n != 1 || out != "success" {
		t.Fatalf("restore_requested rows = %d %q", n, out)
	}
	if n, out := auditRows(t, db, "backup.restore_failed"); n != 1 || out != "failure" {
		t.Fatalf("restore_failed rows = %d %q", n, out)
	}
	// A second start does not record them again.
	svc.startRestoreHousekeeping(context.Background())
	if n, _ := auditRows(t, db, "backup.restore_failed"); n != 1 {
		t.Fatalf("restore_failed recorded %d times", n)
	}
}

func TestApplyPendingRestoreWhileAnotherServerRuns(t *testing.T) {
	e := newTestEnv(t)
	r, uid := prepared(t, e, "")
	confirmAndStop(t, e, r.ID, uid)
	release, err := store.LockShared(e.dir) // a second server during a rolling update
	if err != nil {
		t.Fatal(err)
	}
	before := dbBytes(t, e.dir)
	if err := ApplyPendingRestore(e.dir, nil, nil); err != nil {
		t.Fatal(err)
	}
	release()
	if !bytes.Equal(before, dbBytes(t, e.dir)) {
		t.Fatal("database changed while another server held the data directory")
	}
	last, _ := readLastRestore(e.dir)
	if last.OK || last.RetryID != r.ID || !strings.Contains(last.Error, "another OpenTodo process") {
		t.Fatalf("last = %+v", last)
	}
	if _, err := os.Stat(e.svc.stagingDir(r.ID)); err != nil {
		t.Fatal("staged files not kept for a retry")
	}
}

// backup-restore-web 7 (undo): a safety copy restores like an archive.
func TestUndoFromSafetyCopy(t *testing.T) {
	e := newTestEnv(t)
	r, uid := prepared(t, e, "")
	if _, err := opsync.NewService(e.db).Apply(context.Background(), uid, []opsync.Op{taskOp("o3", "t3", "after backup", 3)}); err != nil {
		t.Fatal(err)
	}
	confirmAndStop(t, e, r.ID, uid)
	if err := ApplyPendingRestore(e.dir, nil, nil); err != nil {
		t.Fatal(err)
	}
	last, _ := readLastRestore(e.dir)
	// Restart on the restored database.
	db, err := store.Open(e.dir)
	if err != nil {
		t.Fatal(err)
	}
	svc := New(db, e.dir, Options{Log: e.svc.log, Now: e.clock.Now})
	state, err := svc.RestoreState(context.Background())
	if err != nil || !state.UndoAvailable || len(state.SafetyCopies) != 1 {
		t.Fatalf("state = %+v %v", state, err)
	}
	e.clock.Advance(time.Minute)
	u, err := svc.Prepare(context.Background(), PrepareSource{SafetyCopy: last.SafetyCopy}, "", uid)
	if err != nil || u.Counts.Ops != 3 {
		t.Fatalf("undo prepare: %+v %v", u, err)
	}
	if err := svc.ConfirmRestore(context.Background(), u.ID, uid); err != nil {
		t.Fatal(err)
	}
	db.Close()
	if err := ApplyPendingRestore(e.dir, nil, e.clock.Now); err != nil {
		t.Fatal(err)
	}
	if n := count(t, e.dir, "SELECT COUNT(*) FROM ops"); n != 3 {
		t.Fatalf("ops after undo = %d, want 3", n)
	}
	copies, _ := safetyCopies(e.dir)
	if len(copies) != 2 {
		t.Fatalf("safety copies after undo = %+v", copies)
	}
	if _, err := svc.Prepare(context.Background(), PrepareSource{SafetyCopy: "../opentodo.db"}, "", uid); !errors.Is(err, ErrNotSafetyCopy) {
		t.Fatalf("bad safety copy name: %v", err)
	}
}
