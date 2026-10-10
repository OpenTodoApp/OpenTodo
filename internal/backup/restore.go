package backup

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/settings"
	"github.com/pixari/opentodo/internal/store"
)

// RestoreOptions configure Restore.
type RestoreOptions struct {
	DataDir    string
	Archive    string
	Passphrase string
	Now        func() time.Time
}

// RestoreResult describes a completed restore.
type RestoreResult struct {
	Manifest   Manifest
	SafetyCopy string // "" when there was no previous database
	Generation string // the new log generation
}

// ErrNewerSchema is returned for archives made by a newer schema version.
var ErrNewerSchema = errors.New("archive was made by a newer version of OpenTodo")

// Restore replaces the database in DataDir with the one in the archive. It must
// run while the server is stopped and refuses otherwise. Everything is verified
// (manifest, checksum, decryption, schema version, SQLite integrity) before the
// data directory is touched; the previous database is kept beside it as
// opentodo.db.pre-restore-<timestamp>, and the restored database gets a fresh
// log generation so devices re-seed it (see docs/sync.md). Pending migrations
// run on the next server start.
func Restore(o RestoreOptions) (RestoreResult, error) {
	var res RestoreResult
	if o.Now == nil {
		o.Now = time.Now
	}
	release, err := store.Lock(o.DataDir)
	if errors.Is(err, store.ErrLocked) {
		return res, fmt.Errorf("%w: stop the server before restoring", err)
	}
	if err != nil {
		return res, err
	}
	defer release()
	dbPath := store.DBPath(o.DataDir)
	if err := checkNotInUse(dbPath); err != nil {
		return res, err
	}

	f, err := os.Open(o.Archive)
	if err != nil {
		return res, fmt.Errorf("open archive: %w", err)
	}
	defer f.Close()
	tr, finish, _, err := openArchive(f, o.Passphrase)
	if err != nil {
		return res, err
	}

	// 1. The manifest comes first.
	h, err := tr.Next()
	if err != nil || h.Name != ManifestName {
		return res, fmt.Errorf("%w: %s is not the first entry (is this an OpenTodo backup?)", ErrIntegrity, ManifestName)
	}
	var m Manifest
	if err := json.NewDecoder(io.LimitReader(tr, 1<<20)).Decode(&m); err != nil {
		return res, fmt.Errorf("%w: manifest: %v", ErrIntegrity, err)
	}
	if m.Format != ManifestFormat || m.FormatVersion < 1 {
		return res, fmt.Errorf("%w: not an OpenTodo backup manifest", ErrIntegrity)
	}
	if m.FormatVersion > ManifestVersion {
		return res, fmt.Errorf("%w: archive format %d, this binary reads up to %d", ErrNewerSchema, m.FormatVersion, ManifestVersion)
	}
	if latest := store.LatestVersion(); m.SchemaVersion > latest {
		return res, fmt.Errorf("%w: archive schema version %d, this binary supports up to %d; restore with a newer opentodo", ErrNewerSchema, m.SchemaVersion, latest)
	}
	var want *ManifestFile
	for i := range m.Files {
		if m.Files[i].Name == store.DBFile {
			want = &m.Files[i]
		}
	}
	if want == nil {
		return res, fmt.Errorf("%w: manifest lists no %s", ErrIntegrity, store.DBFile)
	}

	// 2. Extract the database into the temp dir, hashing as we go.
	tmpDir := filepath.Join(o.DataDir, "tmp")
	if err := os.MkdirAll(tmpDir, 0o700); err != nil {
		return res, err
	}
	tmp, err := os.CreateTemp(tmpDir, "restore-*.db")
	if err != nil {
		return res, err
	}
	keep := false
	defer func() {
		tmp.Close()
		if !keep {
			os.Remove(tmp.Name())
		}
	}()
	h, err = tr.Next()
	if err != nil {
		return res, fmt.Errorf("%w: %s missing: %v", ErrIntegrity, store.DBFile, err)
	}
	if h.Name != store.DBFile {
		return res, fmt.Errorf("%w: unexpected entry %q", ErrIntegrity, h.Name)
	}
	sum := sha256.New()
	n, err := io.Copy(io.MultiWriter(tmp, sum), tr)
	if err != nil {
		return res, fmt.Errorf("%w: %v", ErrIntegrity, err)
	}
	if err := finish(); err != nil {
		return res, err
	}
	if n != want.Size || hex.EncodeToString(sum.Sum(nil)) != want.SHA256 {
		return res, fmt.Errorf("%w: %s checksum does not match the manifest", ErrIntegrity, store.DBFile)
	}
	if err := tmp.Sync(); err != nil {
		return res, err
	}
	if err := tmp.Close(); err != nil {
		return res, err
	}

	// 3. Check the database itself and give it a new generation.
	gen, err := prepareRestored(tmp.Name(), m.SchemaVersion, filepath.Base(o.Archive))
	if err != nil {
		return res, err
	}

	// 4. Safety copy of the current database (consistent, WAL included).
	stamp := o.Now().UTC().Format(archiveTimeLayout)
	if _, err := os.Stat(dbPath); err == nil {
		res.SafetyCopy = dbPath + ".pre-restore-" + stamp
		if err := vacuumInto(dbPath, res.SafetyCopy); err != nil {
			return res, fmt.Errorf("safety copy: %w", err)
		}
	} else if !errors.Is(err, fs.ErrNotExist) {
		return res, err
	}

	// 5. Swap.
	for _, suffix := range []string{"-wal", "-shm"} {
		if err := os.Remove(dbPath + suffix); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return res, err
		}
	}
	if err := os.Rename(tmp.Name(), dbPath); err != nil {
		return res, fmt.Errorf("replace database: %w", err)
	}
	keep = true
	if d, err := os.Open(o.DataDir); err == nil {
		_ = d.Sync()
		d.Close()
	}
	res.Manifest, res.Generation = m, gen
	return res, nil
}

// checkNotInUse is a second line of defence next to the directory lock (and the
// only one where flock is unavailable): a live server keeps a read transaction
// or the WAL busy, which makes a truncating checkpoint report busy.
func checkNotInUse(dbPath string) error {
	if _, err := os.Stat(dbPath); errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	db, err := store.OpenFile(dbPath)
	if err != nil {
		return err
	}
	defer db.Close()
	if _, err := db.Exec("PRAGMA busy_timeout = 0"); err != nil {
		return err
	}
	var busy, logFrames, checkpointed int
	if err := db.QueryRow("PRAGMA wal_checkpoint(TRUNCATE)").Scan(&busy, &logFrames, &checkpointed); err != nil {
		return fmt.Errorf("%w: database is busy (%v): stop the server before restoring", store.ErrLocked, err)
	}
	if busy != 0 {
		return fmt.Errorf("%w: database is busy: stop the server before restoring", store.ErrLocked)
	}
	return nil
}

func vacuumInto(src, dst string) error {
	db, err := store.OpenFile(src)
	if err != nil {
		return err
	}
	defer db.Close()
	_, err = db.Exec(`VACUUM INTO ?`, dst)
	return err
}

// prepareRestored verifies the extracted database and stamps a new generation.
func prepareRestored(path string, schema int, archiveName string) (string, error) {
	db, err := store.OpenFile(path)
	if err != nil {
		return "", err
	}
	defer db.Close()
	var ok string
	if err := db.QueryRow("PRAGMA integrity_check").Scan(&ok); err != nil || ok != "ok" {
		return "", fmt.Errorf("%w: database integrity check: %s %v", ErrIntegrity, ok, err)
	}
	var v int
	if err := db.QueryRow("PRAGMA user_version").Scan(&v); err != nil {
		return "", err
	}
	if v != schema {
		return "", fmt.Errorf("%w: database schema %d differs from the manifest (%d)", ErrIntegrity, v, schema)
	}
	gen := randomHex(16)
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL DEFAULT 0)`); err != nil {
		return "", err
	}
	if _, err := db.Exec(`INSERT INTO settings(key, value, updated_at) VALUES(?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		settings.GenerationKey, gen, time.Now().UnixMilli()); err != nil {
		return "", err
	}
	// The restore runs without the server, so the audit event is recorded by the
	// server on its next start (Service.recordPendingRestore).
	if _, err := db.Exec(`INSERT INTO settings(key, value, updated_at) VALUES(?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		pendingRestoreKey, archiveName, time.Now().UnixMilli()); err != nil {
		return "", err
	}
	// Runs that were in progress when the snapshot was taken did not finish in
	// this timeline.
	_, _ = db.Exec(`UPDATE backup_runs SET status = 'failed', finished_at = started_at, error = 'outcome unknown: this database was restored from the backup taken during this run' WHERE status = 'running'`)
	return gen, nil
}

// pendingRestoreKey marks a restore that the server has not audited yet.
const pendingRestoreKey = "backup_restored_pending"

// recordPendingRestore writes the backup.restored audit event for a restore
// performed by `opentodo restore` while the server was stopped.
func (s *Service) recordPendingRestore(ctx context.Context) {
	name, err := s.settings.GetString(ctx, pendingRestoreKey)
	if err != nil || name == "" {
		return
	}
	s.audit.Record(ctx, audit.BackupRestored("", name))
	if err := s.settings.Delete(ctx, pendingRestoreKey); err != nil {
		s.log.Error("backup: clear restore marker", "err", err)
	}
	s.log.Info("database was restored from a backup", "archive", name)
}
