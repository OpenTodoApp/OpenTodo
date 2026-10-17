package backup

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestBackupRefusedWithoutFreeSpace (reliable-background-jobs): a backup
// checks the free space for the snapshot and the archive first and fails with
// a clear error, leaving nothing behind.
func TestBackupRefusedWithoutFreeSpace(t *testing.T) {
	e := newTestEnv(t)
	ctx := context.Background()
	if _, err := e.svc.SaveSettings(ctx, DefaultSettings(), SecretUpdate{}); err != nil {
		t.Fatal(err)
	}
	e.svc.freeSpace = func(string) (int64, bool) { return 1 << 20, true }
	r, err := e.svc.RunNow(ctx, KindManual)
	if err != nil {
		t.Fatal(err)
	}
	if r.Status != StatusFailed || !strings.Contains(r.Error, "not enough free disk space for a backup") {
		t.Fatalf("run = %+v, want a failed run naming the missing space", r)
	}
	entries, _ := os.ReadDir(e.svc.tmpDir())
	if len(entries) != 0 {
		t.Fatalf("left in tmp: %v", entries)
	}
}

// TestLocalBackupNotStagedInDataDir: with the local destination on another
// filesystem, the archive is written in the destination directory, so the
// data directory only needs room for the snapshot.
func TestLocalBackupNotStagedInDataDir(t *testing.T) {
	e := newTestEnv(t)
	ctx := context.Background()
	destDir := t.TempDir()
	set := DefaultSettings()
	set.Local.Dir = destDir
	if _, err := e.svc.SaveSettings(ctx, set, SecretUpdate{}); err != nil {
		t.Fatal(err)
	}
	snap := fileSize(filepath.Join(e.dir, "opentodo.db")) + fileSize(filepath.Join(e.dir, "opentodo.db-wal"))
	e.svc.sameFS = func(a, b string) bool { return false }
	e.svc.freeSpace = func(dir string) (int64, bool) {
		if strings.HasPrefix(dir, destDir) {
			return 1 << 40, true
		}
		return restoreMargin + snap*3/2, true // the snapshot fits, not snapshot + archive
	}
	r, err := e.svc.RunNow(ctx, KindManual)
	if err != nil || r.Status != StatusSucceeded {
		t.Fatalf("run = %+v, %v", r, err)
	}
	entries, _ := os.ReadDir(destDir)
	if len(entries) != 1 || entries[0].Name() != r.ArchiveName {
		t.Fatalf("destination holds %v, want only %s", entries, r.ArchiveName)
	}
}

// TestStartSweepsStaleTempFiles: snapshots and archives left in data/tmp (and
// half-written archives in the local destination) by a crash are removed when
// the backup service starts; a staged web restore is left to its own sweep.
func TestStartSweepsStaleTempFiles(t *testing.T) {
	e := newTestEnv(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer func() {
		cancel()
		e.svc.Stop()
	}()
	if _, err := e.svc.SaveSettings(context.Background(), DefaultSettings(), SecretUpdate{}); err != nil {
		t.Fatal(err)
	}
	tmp, dest := e.svc.tmpDir(), e.svc.defaultLocalDir()
	stale := []string{
		filepath.Join(tmp, "snapshot-20261010-120000-abcd1234.db"),
		filepath.Join(tmp, "opentodo-20261010-120000-00000000.tar.gz.0a1b2c3d"),
		filepath.Join(dest, ".tmp-opentodo-20261010-120000-00000000.tar.gz-123456"),
	}
	keep := []string{
		filepath.Join(dest, "opentodo-20261009-120000-00000000.tar.gz"),
		filepath.Join(tmp, "restore", "x", "archive"),
	}
	for _, p := range append(append([]string{}, stale...), keep...) {
		if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	e.svc.Start(ctx)
	for _, p := range stale {
		if _, err := os.Stat(p); !errors.Is(err, os.ErrNotExist) {
			t.Errorf("%s not swept: %v", filepath.Base(p), err)
		}
	}
	if _, err := os.Stat(keep[0]); err != nil {
		t.Errorf("an archive was removed: %v", err)
	}
}
