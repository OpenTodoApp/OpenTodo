package backup

import (
	"archive/tar"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"math"
	"os"
	"path/filepath"
	"strings"
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
	Manifest    Manifest
	SafetyCopy  string // "" when there was no previous database
	Generation  string // the new log generation
	Attachments int    // attachment files put back (OpenSpec attachments)
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
//
// It is Stage, then Apply: the web restore (backup-restore-web) runs the same
// two steps with a server restart in between, so both paths give the same result.
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
	if err := checkNotInUse(store.DBPath(o.DataDir)); err != nil {
		return res, err
	}

	f, err := os.Open(o.Archive)
	if err != nil {
		return res, fmt.Errorf("open archive: %w", err)
	}
	defer f.Close()
	tmpDir := filepath.Join(o.DataDir, "tmp")
	if err := os.MkdirAll(tmpDir, 0o700); err != nil {
		return res, err
	}
	dir, err := os.MkdirTemp(tmpDir, "restore-*")
	if err != nil {
		return res, err
	}
	defer os.RemoveAll(dir)
	st, err := Stage(dir, f, o.Passphrase, filepath.Base(o.Archive))
	if err != nil {
		return res, err
	}
	return applyLocked(o.DataDir, st, st.Archive, o.Now)
}

// Files of a staged restore inside its directory.
const (
	stagedDBName    = "extracted.db"
	stagedExtrasDir = "extras"
)

// Staged is an archive that passed every check and was extracted into Dir: the
// database (with its original generation) and the extra files listed in the
// manifest. Nothing in the data directory has changed yet.
type Staged struct {
	Dir      string
	Archive  string // archive file name, for the audit log
	Manifest Manifest
}

// DBPath is the extracted database.
func (st Staged) DBPath() string { return filepath.Join(st.Dir, stagedDBName) }

// Stage verifies the archive read from r and extracts it into dir, which is
// created if needed. It runs every check of the restore procedure: manifest,
// decryption, checksums, schema version and SQLite integrity. Memory stays
// constant; the database is streamed to disk while it is hashed.
func Stage(dir string, r io.Reader, passphrase, archiveName string) (Staged, error) {
	return stage(dir, r, passphrase, archiveName, freeBytes)
}

// stage is Stage with the free-space probe given (tests). Before extracting
// anything it checks that dir's filesystem holds every file the manifest
// lists; each entry must then have exactly its listed size and is copied with
// that bound, so a crafted archive cannot fill the disk.
func stage(dir string, r io.Reader, passphrase, archiveName string, freeFn func(string) (int64, bool)) (Staged, error) {
	st := Staged{Dir: dir, Archive: archiveName}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return st, err
	}
	tr, finish, _, err := openArchive(r, passphrase)
	if err != nil {
		return st, err
	}

	// 1. The manifest comes first.
	m, err := readManifest(tr)
	if err != nil {
		return st, err
	}
	var want *ManifestFile
	for i := range m.Files {
		if m.Files[i].Name == store.DBFile {
			want = &m.Files[i]
		}
	}
	if want == nil {
		return st, fmt.Errorf("%w: manifest lists no %s", ErrIntegrity, store.DBFile)
	}
	need, err := manifestBytes(m)
	if err != nil {
		return st, err
	}
	if err := ensureFreeSpaceWith(freeFn, dir, need); err != nil {
		return st, err
	}

	// 2. Extract the database, hashing as we go.
	h, err := tr.Next()
	if err != nil {
		return st, fmt.Errorf("%w: %s missing: %v", ErrIntegrity, store.DBFile, err)
	}
	if h.Name != store.DBFile {
		return st, fmt.Errorf("%w: unexpected entry %q", ErrIntegrity, h.Name)
	}
	if h.Size != want.Size {
		return st, fmt.Errorf("%w: %s size does not match the manifest", ErrIntegrity, store.DBFile)
	}
	out, err := os.OpenFile(st.DBPath(), os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		return st, err
	}
	sum := sha256.New()
	n, err := io.CopyN(io.MultiWriter(out, sum), tr, want.Size)
	if err != nil {
		out.Close()
		return st, fmt.Errorf("%w: %v", ErrIntegrity, err)
	}
	if err := out.Sync(); err != nil {
		out.Close()
		return st, err
	}
	if err := out.Close(); err != nil {
		return st, err
	}
	extras, err := readExtras(tr, m, dir)
	if err != nil {
		return st, err
	}
	if err := finish(); err != nil {
		return st, err
	}
	if n != want.Size || hex.EncodeToString(sum.Sum(nil)) != want.SHA256 {
		return st, fmt.Errorf("%w: %s checksum does not match the manifest", ErrIntegrity, store.DBFile)
	}
	if len(extras) > 0 {
		if err := os.MkdirAll(filepath.Join(dir, stagedExtrasDir), 0o700); err != nil {
			return st, err
		}
		for name, raw := range extras {
			if err := writeFileAtomic(filepath.Join(dir, stagedExtrasDir, name), raw); err != nil {
				return st, err
			}
		}
	}

	// 3. Check the database itself.
	if err := verifyRestored(st.DBPath(), m.SchemaVersion); err != nil {
		return st, err
	}
	st.Manifest = m
	return st, nil
}

// readManifest reads and checks the first archive entry.
func readManifest(tr *tar.Reader) (Manifest, error) {
	var m Manifest
	h, err := tr.Next()
	if err != nil || h.Name != ManifestName {
		return m, fmt.Errorf("%w: %s is not the first entry (is this an OpenTodo backup?)", ErrIntegrity, ManifestName)
	}
	if err := json.NewDecoder(io.LimitReader(tr, 1<<20)).Decode(&m); err != nil {
		return m, fmt.Errorf("%w: manifest: %v", ErrIntegrity, err)
	}
	if m.Format != ManifestFormat || m.FormatVersion < 1 {
		return m, fmt.Errorf("%w: not an OpenTodo backup manifest", ErrIntegrity)
	}
	if m.FormatVersion > ManifestVersion {
		return m, fmt.Errorf("%w: archive format %d, this binary reads up to %d", ErrNewerSchema, m.FormatVersion, ManifestVersion)
	}
	if latest := store.LatestVersion(); m.SchemaVersion > latest {
		return m, fmt.Errorf("%w: archive schema version %d, this binary supports up to %d; restore with a newer opentodo", ErrNewerSchema, m.SchemaVersion, latest)
	}
	return m, nil
}

// stagedExtras reads the extra files of a staged restore back.
func (st Staged) extras() (map[string][]byte, error) {
	out := map[string][]byte{}
	entries, err := os.ReadDir(filepath.Join(st.Dir, stagedExtrasDir))
	if errors.Is(err, fs.ErrNotExist) {
		return out, nil
	}
	if err != nil {
		return nil, err
	}
	allowed := map[string]bool{}
	for _, name := range ExtraFiles {
		allowed[name] = true
	}
	for _, e := range entries {
		if !allowed[e.Name()] {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(st.Dir, stagedExtrasDir, e.Name()))
		if err != nil {
			return nil, err
		}
		out[e.Name()] = raw
	}
	return out, nil
}

// Apply swaps a staged database into dataDir. It takes the exclusive data
// directory lock, so it only succeeds while no server holds it. marker is what
// the next server start records in the audit log (see recordPendingRestore).
func Apply(dataDir string, st Staged, marker string, now func() time.Time) (RestoreResult, error) {
	if now == nil {
		now = time.Now
	}
	release, err := store.Lock(dataDir)
	if err != nil {
		return RestoreResult{}, err
	}
	defer release()
	if err := checkNotInUse(store.DBPath(dataDir)); err != nil {
		return RestoreResult{}, err
	}
	return applyLocked(dataDir, st, marker, now)
}

// applyLocked is Apply for a caller that already holds the exclusive lock.
func applyLocked(dataDir string, st Staged, marker string, now func() time.Time) (RestoreResult, error) {
	var res RestoreResult
	dbPath := store.DBPath(dataDir)
	extras, err := st.extras()
	if err != nil {
		return res, err
	}
	// The final check: the staged file may have sat on disk across a restart.
	if err := verifyRestored(st.DBPath(), st.Manifest.SchemaVersion); err != nil {
		return res, err
	}
	gen, err := stampRestored(st.DBPath(), marker)
	if err != nil {
		return res, err
	}
	if err := ensureFreeSpace(dataDir, fileSize(dbPath)); err != nil {
		return res, err
	}

	// Safety copy of the current database (consistent, WAL included).
	stamp := now().UTC().Format(archiveTimeLayout)
	if _, err := os.Stat(dbPath); err == nil {
		res.SafetyCopy = dbPath + ".pre-restore-" + stamp
		if err := vacuumInto(dbPath, res.SafetyCopy); err != nil {
			return res, fmt.Errorf("safety copy: %w", err)
		}
	} else if !errors.Is(err, fs.ErrNotExist) {
		return res, err
	}

	// Swap.
	for _, suffix := range []string{"-wal", "-shm"} {
		if err := os.Remove(dbPath + suffix); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return res, err
		}
	}
	if err := os.Rename(st.DBPath(), dbPath); err != nil {
		return res, fmt.Errorf("replace database: %w", err)
	}
	for name, raw := range extras {
		if err := writeFileAtomic(filepath.Join(dataDir, name), raw); err != nil {
			return res, fmt.Errorf("restore %s: %w", name, err)
		}
	}
	if res.Attachments, err = moveAttachments(st.Dir, dataDir); err != nil {
		return res, fmt.Errorf("restore attachments: %w", err)
	}
	if d, err := os.Open(dataDir); err == nil {
		_ = d.Sync()
		d.Close()
	}
	res.Manifest, res.Generation = st.Manifest, gen
	return res, nil
}

func fileSize(path string) int64 {
	if fi, err := os.Stat(path); err == nil {
		return fi.Size()
	}
	return 0
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

// verifyRestored checks an extracted database: SQLite integrity and the schema
// version the manifest promised.
func verifyRestored(path string, schema int) error {
	db, err := store.OpenFile(path)
	if err != nil {
		return err
	}
	defer db.Close()
	var ok string
	if err := db.QueryRow("PRAGMA integrity_check").Scan(&ok); err != nil || ok != "ok" {
		return fmt.Errorf("%w: database integrity check: %s %v", ErrIntegrity, ok, err)
	}
	var v int
	if err := db.QueryRow("PRAGMA user_version").Scan(&v); err != nil {
		return err
	}
	if v != schema {
		return fmt.Errorf("%w: database schema %d differs from the manifest (%d)", ErrIntegrity, v, schema)
	}
	if latest := store.LatestVersion(); v > latest {
		return fmt.Errorf("%w: database schema version %d, this binary supports up to %d", ErrNewerSchema, v, latest)
	}
	return nil
}

// stampRestored gives the database about to be restored a new log generation
// and the marker the next server start turns into the backup.restored event.
func stampRestored(path, marker string) (string, error) {
	db, err := store.OpenFile(path)
	if err != nil {
		return "", err
	}
	defer db.Close()
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
		pendingRestoreKey, marker, time.Now().UnixMilli()); err != nil {
		return "", err
	}
	// Runs that were in progress when the snapshot was taken did not finish in
	// this timeline.
	_, _ = db.Exec(`UPDATE backup_runs SET status = 'failed', finished_at = started_at, error = 'outcome unknown: this database was restored from the backup taken during this run' WHERE status = 'running'`)
	// Flush the WAL into the file so the rename moves everything.
	_, _ = db.Exec(`PRAGMA wal_checkpoint(TRUNCATE)`)
	return gen, nil
}

// pendingRestoreKey marks a restore that the server has not audited yet.
const pendingRestoreKey = "backup_restored_pending"

// restoreMarker is the value of pendingRestoreKey written by a web restore; the
// CLI writes the bare archive name.
type restoreMarker struct {
	Archive string `json:"archive"`
	ActorID string `json:"actorId,omitempty"`
}

func parseMarker(v string) restoreMarker {
	var m restoreMarker
	if strings.HasPrefix(v, "{") && json.Unmarshal([]byte(v), &m) == nil && m.Archive != "" {
		return m
	}
	return restoreMarker{Archive: v}
}

// recordPendingRestore writes the backup.restored audit event for a restore
// applied while the server was stopped: by `opentodo restore`, or by the web
// restore during its restart.
func (s *Service) recordPendingRestore(ctx context.Context) {
	v, err := s.settings.GetString(ctx, pendingRestoreKey)
	if err != nil || v == "" {
		return
	}
	m := parseMarker(v)
	s.audit.Record(ctx, audit.BackupRestored(m.ActorID, m.Archive))
	if err := s.settings.Delete(ctx, pendingRestoreKey); err != nil {
		s.log.Error("backup: clear restore marker", "err", err)
	}
	s.log.Info("database was restored from a backup", "archive", m.Archive)
}

// readExtras reads the ExtraFiles that follow the database in an archive,
// verifying each against the manifest, and streams attachment files into
// dir/attachments with the same check (OpenSpec attachments, design D11).
// Unknown entries are skipped so a newer archive still restores its database.
func readExtras(tr *tar.Reader, m Manifest, dir string) (map[string][]byte, error) {
	listed := map[string]ManifestFile{}
	for _, f := range m.Files {
		listed[f.Name] = f
	}
	allowed := map[string]bool{}
	for _, name := range ExtraFiles {
		allowed[name] = true
	}
	out := map[string][]byte{}
	for {
		h, err := tr.Next()
		if errors.Is(err, io.EOF) {
			return out, nil
		}
		if err != nil {
			return nil, fmt.Errorf("%w: %v", ErrIntegrity, err)
		}
		want, ok := listed[h.Name]
		if ok && h.Size != want.Size {
			return nil, fmt.Errorf("%w: %s size does not match the manifest", ErrIntegrity, h.Name)
		}
		if ok && validAttachmentEntry(h.Name) {
			if err := stageAttachment(tr, filepath.Join(dir, filepath.FromSlash(h.Name)), want); err != nil {
				return nil, err
			}
			continue
		}
		if !allowed[h.Name] || !ok {
			continue
		}
		raw, err := io.ReadAll(io.LimitReader(tr, maxExtraFileSize+1))
		if err != nil {
			return nil, fmt.Errorf("%w: %v", ErrIntegrity, err)
		}
		digest := sha256.Sum256(raw)
		if int64(len(raw)) != want.Size || hex.EncodeToString(digest[:]) != want.SHA256 {
			return nil, fmt.Errorf("%w: %s checksum does not match the manifest", ErrIntegrity, h.Name)
		}
		out[h.Name] = raw
	}
}

// manifestBytes is the disk space the files a manifest lists take once
// extracted; a negative or overflowing size makes the manifest invalid.
func manifestBytes(m Manifest) (int64, error) {
	var total int64
	for _, f := range m.Files {
		if f.Size < 0 || total > math.MaxInt64-f.Size {
			return 0, fmt.Errorf("%w: %s has an invalid size in the manifest", ErrIntegrity, f.Name)
		}
		total += f.Size
	}
	return total, nil
}

// stageAttachment streams one attachment entry to path, verifying its size and
// digest; a mismatch aborts the restore before anything is swapped.
func stageAttachment(r io.Reader, path string, want ManifestFile) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	out, err := os.OpenFile(path, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	sum := sha256.New()
	n, err := io.CopyN(io.MultiWriter(out, sum), r, want.Size)
	if cerr := out.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		return fmt.Errorf("%w: %v", ErrIntegrity, err)
	}
	if n != want.Size || hex.EncodeToString(sum.Sum(nil)) != want.SHA256 {
		return fmt.Errorf("%w: %s checksum does not match the manifest", ErrIntegrity, want.Name)
	}
	return nil
}

// moveAttachments renames staged attachment files into dataDir/attachments. Files
// already there that the archive does not list are kept (newer uploads; the
// orphan sweep handles ones whose rows never return).
func moveAttachments(stageDir, dataDir string) (int, error) {
	root := filepath.Join(stageDir, "attachments")
	moved := 0
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			if errors.Is(err, fs.ErrNotExist) {
				return nil
			}
			return err
		}
		if d.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(stageDir, path)
		if err != nil || !validAttachmentEntry(filepath.ToSlash(rel)) {
			return nil
		}
		dst := filepath.Join(dataDir, rel)
		if err := os.MkdirAll(filepath.Dir(dst), 0o700); err != nil {
			return err
		}
		if err := os.Rename(path, dst); err != nil {
			return err
		}
		moved++
		return nil
	})
	return moved, err
}

// writeFileAtomic replaces path with data (mode 0600) via a temp file and rename.
func writeFileAtomic(path string, data []byte) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), ".restore-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if err := tmp.Chmod(0o600); err != nil {
		tmp.Close()
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}
