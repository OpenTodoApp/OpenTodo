package backup

import (
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/ids"
	"github.com/pixari/opentodo/internal/settings"
	"github.com/pixari/opentodo/internal/store"
)

// ErrRunning is returned when a backup is requested while one is in progress.
var ErrRunning = errors.New("a backup is already running")

// StartRun begins a backup in the background and returns at once. The run lock
// is taken before returning, so a second caller gets ErrRunning immediately.
// actorID is the account that asked for it (recorded in the audit log).
func (s *Service) StartRun(ctx context.Context, kind, actorID string) error {
	if !s.runMu.TryLock() {
		return ErrRunning
	}
	// Visible as running before this returns, so a status request right after a
	// 202 already shows the run in progress.
	s.setRunning(&Run{Kind: kind, StartedAt: s.now().UnixMilli(), Status: StatusRunning})
	// The run outlives the request but not the server: shutdown cancels it and
	// waits for its outcome (Stop).
	runCtx, cancel := context.WithCancel(context.WithoutCancel(ctx))
	unhook := context.AfterFunc(s.life, cancel)
	started := s.spawn(func() {
		defer s.runMu.Unlock()
		defer cancel()
		defer unhook()
		s.execute(runCtx, kind, actorID)
	})
	if !started {
		unhook()
		cancel()
		s.setRunning(nil)
		s.runMu.Unlock()
		return ErrStopping
	}
	return nil
}

// RunNow performs a backup synchronously (used by the scheduler and tests).
func (s *Service) RunNow(ctx context.Context, kind string) (Run, error) {
	if !s.runMu.TryLock() {
		return Run{}, ErrRunning
	}
	defer s.runMu.Unlock()
	return s.execute(ctx, kind, ""), nil
}

// Running returns the run in progress, if any.
func (s *Service) Running() *Run {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	if s.running == nil {
		return nil
	}
	r := *s.running
	return &r
}

func (s *Service) setRunning(r *Run) {
	s.stateMu.Lock()
	s.running = r
	s.stateMu.Unlock()
}

// execute runs one backup with the run lock held and records the outcome.
func (s *Service) execute(ctx context.Context, kind, actorID string) Run {
	start := s.now()
	r := Run{ID: ids.New(), Kind: kind, StartedAt: start.UnixMilli(), Status: StatusRunning}
	set, err := s.LoadSettings(ctx)
	var sec settings.Secrets
	if err == nil {
		sec, err = s.secrets.Load()
	}
	var dest Destination
	if err == nil {
		if err = set.Validate(sec); err == nil {
			dest, err = s.destination(set, sec)
		}
	}
	if dest != nil {
		r.Destination = dest.Kind() + ": " + dest.Describe()
	}
	if ierr := s.insertRun(ctx, &r); ierr != nil {
		s.log.Error("backup: record run", "err", ierr)
	}
	s.setRunning(&r)
	defer s.setRunning(nil)

	var warn error
	if err == nil {
		warn, err = s.backupTo(ctx, dest, set, sec, &r)
	}
	fin := s.now().UnixMilli()
	r.FinishedAt = &fin
	d := fin - r.StartedAt
	r.DurationMs = &d
	if err != nil {
		r.Status, r.Error = StatusFailed, err.Error()
		s.log.Warn("backup failed", "kind", kind, "destination", r.Destination, "err", err)
	} else {
		r.Status = StatusSucceeded
		if warn != nil {
			r.Error = warn.Error()
			s.log.Warn("backup retention failed", "err", warn)
		}
		s.log.Info("backup succeeded", "kind", kind, "archive", r.ArchiveName, "bytes", r.Bytes, "destination", r.Destination)
	}
	if ferr := s.finishRun(context.WithoutCancel(ctx), &r); ferr != nil {
		s.log.Error("backup: record run", "err", ferr)
	}
	ev := audit.BackupCreated(actorID, r.ID)
	if r.Status == StatusFailed {
		ev = ev.Failed("run_failed")
	}
	s.audit.Record(context.WithoutCancel(ctx), ev)
	return r
}

// backupTo snapshots, packages, uploads and applies retention. Local temp files
// are always removed. The returned warning is a retention failure after a
// successful upload. The archive is written in the local destination's
// directory and renamed into place there; for a remote destination it is
// staged in the data directory's tmp. Free space for both is checked first.
func (s *Service) backupTo(ctx context.Context, dest Destination, set Settings, sec settings.Secrets, r *Run) (warn, err error) {
	attachments, err := attachmentFiles(s.dataDir)
	if err != nil {
		return nil, fmt.Errorf("list attachments: %w", err)
	}
	local, _ := dest.(*localDest)
	stageDir := s.tmpDir()
	if local != nil {
		stageDir = local.dir
	}
	for _, d := range []string{s.tmpDir(), stageDir} {
		if err := os.MkdirAll(d, 0o700); err != nil {
			return nil, fmt.Errorf("create %s: %w", d, err)
		}
	}
	if err := s.checkBackupSpace(stageDir, attachments); err != nil {
		return nil, err
	}
	snap, err := s.snapshot(ctx)
	if err != nil {
		return nil, err
	}
	defer os.Remove(snap)

	gen, err := s.generation(ctx)
	if err != nil {
		return nil, err
	}
	var schema int
	if err := s.db.QueryRowContext(ctx, "PRAGMA user_version").Scan(&schema); err != nil {
		return nil, err
	}
	now := s.now()
	pass := sec.Value(SecretPassphrase)
	name := ArchiveName(now, gen, set.Compress, pass != "")
	m := Manifest{Format: ManifestFormat, FormatVersion: ManifestVersion, AppVersion: s.version, SchemaVersion: schema,
		CreatedAt: now.UTC().Format(time.RFC3339), Generation: gen}

	var f *os.File
	if local != nil {
		if err := validObjectName(name); err != nil {
			return nil, err
		}
		f, err = os.CreateTemp(stageDir, localTempPrefix+name+"-*")
	} else {
		f, err = os.OpenFile(filepath.Join(stageDir, name+"."+randomHex(4)), os.O_RDWR|os.O_CREATE|os.O_EXCL, 0o600)
	}
	if err != nil {
		return nil, fmt.Errorf("create archive: %w", err)
	}
	defer func() {
		f.Close()
		os.Remove(f.Name())
	}()
	if err := writeArchive(f, snap, m, archiveOptions{compress: set.Compress, passphrase: pass, extras: s.extraFiles(), attachments: attachments}); err != nil {
		return nil, fmt.Errorf("write archive: %w", err)
	}
	size, err := f.Seek(0, io.SeekCurrent)
	if err != nil {
		return nil, err
	}
	if local != nil {
		// Already in the destination directory: make it durable and rename it
		// into place, so a crash never leaves a half-written archive under
		// the final name.
		if err := f.Sync(); err != nil {
			return nil, fmt.Errorf("write to %s: %w", local.dir, err)
		}
		if err := os.Rename(f.Name(), filepath.Join(local.dir, name)); err != nil {
			return nil, fmt.Errorf("write to %s: %w", local.dir, err)
		}
	} else {
		if _, err := f.Seek(0, io.SeekStart); err != nil {
			return nil, err
		}
		if err := dest.Put(ctx, name, f, size); err != nil {
			return nil, err
		}
	}
	r.ArchiveName, r.Bytes = name, size
	return s.applyRetention(ctx, dest, set.Retention, name), nil
}

// localTempPrefix starts the name of an archive being written in the local
// destination directory; List skips such dot files and Start sweeps them.
const localTempPrefix = ".tmp-"

// archiveOverhead is added per archived file for tar headers and padding.
const archiveOverhead = 1024

// checkBackupSpace refuses a backup the disk cannot hold: the snapshot (the
// database and its WAL, VACUUM INTO writes at most that) in the data
// directory, and the archive (snapshot plus attachments, uncompressed as the
// worst case) in stageDir; both on the data directory's filesystem when they
// share it. restoreMargin is kept free on top.
func (s *Service) checkBackupSpace(stageDir string, attachments []archivedFile) error {
	dbPath := store.DBPath(s.dataDir)
	snap := fileSize(dbPath) + fileSize(dbPath+"-wal")
	archive := snap + archiveOverhead*int64(len(attachments)+len(ExtraFiles)+2)
	for _, a := range attachments {
		archive += fileSize(a.path)
	}
	for _, p := range s.extraFiles() {
		archive += fileSize(p)
	}
	if stageDir == s.tmpDir() || s.sameFS(s.dataDir, stageDir) {
		return ensureSpace(s.freeSpace, s.dataDir, snap+archive, ErrBackupStorage)
	}
	if err := ensureSpace(s.freeSpace, s.dataDir, snap, ErrBackupStorage); err != nil {
		return err
	}
	return ensureSpace(s.freeSpace, stageDir, archive, ErrBackupStorage)
}

// sweepTemp removes what an interrupted run left behind: snapshots and
// archives in the data directory's tmp, and half-written archives in the
// local destination directory. Staged web restores (tmp/restore) have their
// own sweep.
func (s *Service) sweepTemp(ctx context.Context) {
	remove := func(dir string, match func(string) bool) {
		entries, err := os.ReadDir(dir)
		if err != nil {
			return
		}
		for _, e := range entries {
			if !e.Type().IsRegular() || !match(e.Name()) {
				continue
			}
			if err := os.Remove(filepath.Join(dir, e.Name())); err != nil && !errors.Is(err, fs.ErrNotExist) {
				s.log.Warn("backup: remove stale temp file", "file", e.Name(), "err", err)
			} else if err == nil {
				s.log.Info("backup: removed a temp file left by an interrupted run", "file", e.Name())
			}
		}
	}
	remove(s.tmpDir(), func(n string) bool {
		return strings.HasPrefix(n, "snapshot-") || strings.HasPrefix(n, "opentodo-")
	})
	set, err := s.LoadSettings(ctx)
	if err != nil || (set.Destination != DestLocal && set.Destination != "") {
		return
	}
	dir := set.Local.Dir
	if dir == "" {
		dir = s.defaultLocalDir()
	}
	remove(dir, func(n string) bool { return strings.HasPrefix(n, localTempPrefix+"opentodo-") })
}

// applyRetention deletes archives beyond the policy at the destination.
func (s *Service) applyRetention(ctx context.Context, dest Destination, pol Retention, justWritten string) error {
	objs, err := dest.List(ctx)
	if err != nil {
		return fmt.Errorf("retention: %w", err)
	}
	var errs []error
	for _, name := range retentionVictims(objs, pol, justWritten, s.now()) {
		if err := dest.Delete(ctx, name); err != nil {
			errs = append(errs, err)
		}
	}
	if len(errs) > 0 {
		return fmt.Errorf("retention: %w", errors.Join(errs...))
	}
	return nil
}

// retentionVictims picks the archives to delete: everything beyond the newest
// KeepLast, plus anything older than MaxAgeDays. The archive just written and
// the newest archive are never deleted; names that are not OpenTodo archives
// are never considered.
func retentionVictims(objs []Object, pol Retention, justWritten string, now time.Time) []string {
	type arch struct {
		name string
		t    time.Time
	}
	var list []arch
	seen := false
	for _, o := range objs {
		if t, ok := archiveTime(o.Name); ok {
			list = append(list, arch{o.Name, t})
			seen = seen || o.Name == justWritten
		}
	}
	if !seen && justWritten != "" {
		// Listings can lag behind a write; count the new archive anyway.
		if t, ok := archiveTime(justWritten); ok {
			list = append(list, arch{justWritten, t})
		}
	}
	sort.Slice(list, func(i, j int) bool {
		if !list[i].t.Equal(list[j].t) {
			return list[i].t.After(list[j].t)
		}
		return list[i].name > list[j].name
	})
	keep := max(pol.KeepLast, 1)
	var victims []string
	for i, a := range list {
		if i == 0 || a.name == justWritten {
			continue
		}
		tooOld := pol.MaxAgeDays > 0 && now.Sub(a.t) > time.Duration(pol.MaxAgeDays)*24*time.Hour
		if i >= keep || tooOld {
			victims = append(victims, a.name)
		}
	}
	return victims
}

// extraFiles lists the ExtraFiles present in the data directory.
func (s *Service) extraFiles() []string {
	var out []string
	for _, name := range ExtraFiles {
		p := filepath.Join(s.dataDir, name)
		if st, err := os.Stat(p); err == nil && st.Mode().IsRegular() {
			out = append(out, p)
		}
	}
	return out
}

// attachmentFiles lists the attachment files under <data>/attachments and the
// profile pictures under <data>/avatars, in a stable order (OpenSpec
// attachments, design D11; settings-refresh D10).
func attachmentFiles(dataDir string) ([]archivedFile, error) {
	var out []archivedFile
	for _, dir := range dataDirs {
		files, err := dataFiles(dataDir, dir)
		if err != nil {
			return nil, err
		}
		out = append(out, files...)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].name < out[j].name })
	return out, nil
}

// dataFiles lists the well-formed entries under <data>/<dir>.
func dataFiles(dataDir, dir string) ([]archivedFile, error) {
	root := filepath.Join(dataDir, dir)
	var out []archivedFile
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			if errors.Is(err, fs.ErrNotExist) {
				return nil
			}
			return err
		}
		if d.IsDir() || !d.Type().IsRegular() {
			return nil
		}
		rel, err := filepath.Rel(dataDir, path)
		if err != nil {
			return err
		}
		name := filepath.ToSlash(rel)
		if validDataEntry(name) {
			out = append(out, archivedFile{name: name, path: path})
		}
		return nil
	})
	return out, err
}
