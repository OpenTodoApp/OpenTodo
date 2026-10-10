package backup

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/pixari/opentodo/internal/ids"
	"github.com/pixari/opentodo/internal/settings"
)

// ErrRunning is returned when a backup is requested while one is in progress.
var ErrRunning = errors.New("a backup is already running")

// StartRun begins a backup in the background and returns at once. The run lock
// is taken before returning, so a second caller gets ErrRunning immediately.
func (s *Service) StartRun(ctx context.Context, kind string) error {
	if !s.runMu.TryLock() {
		return ErrRunning
	}
	// Visible as running before this returns, so a status request right after a
	// 202 already shows the run in progress.
	s.setRunning(&Run{Kind: kind, StartedAt: s.now().UnixMilli(), Status: StatusRunning})
	go func() {
		defer s.runMu.Unlock()
		s.execute(context.WithoutCancel(ctx), kind)
	}()
	return nil
}

// RunNow performs a backup synchronously (used by the scheduler and tests).
func (s *Service) RunNow(ctx context.Context, kind string) (Run, error) {
	if !s.runMu.TryLock() {
		return Run{}, ErrRunning
	}
	defer s.runMu.Unlock()
	return s.execute(ctx, kind), nil
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
func (s *Service) execute(ctx context.Context, kind string) Run {
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
	return r
}

// backupTo snapshots, packages, uploads and applies retention. Local temp files
// are always removed. The returned warning is a retention failure after a
// successful upload.
func (s *Service) backupTo(ctx context.Context, dest Destination, set Settings, sec settings.Secrets, r *Run) (warn, err error) {
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

	f, err := os.OpenFile(filepath.Join(s.tmpDir(), name+"."+randomHex(4)), os.O_RDWR|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return nil, fmt.Errorf("create archive: %w", err)
	}
	defer func() {
		f.Close()
		os.Remove(f.Name())
	}()
	if err := writeArchive(f, snap, m, archiveOptions{compress: set.Compress, passphrase: pass}); err != nil {
		return nil, fmt.Errorf("write archive: %w", err)
	}
	size, err := f.Seek(0, io.SeekCurrent)
	if err != nil {
		return nil, err
	}
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return nil, err
	}
	if err := dest.Put(ctx, name, f, size); err != nil {
		return nil, err
	}
	r.ArchiveName, r.Bytes = name, size
	return s.applyRetention(ctx, dest, set.Retention, name), nil
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
