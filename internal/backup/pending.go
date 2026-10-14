package backup

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	"github.com/pixari/opentodo/internal/store"
)

// ApplyPendingRestore applies a restore confirmed in the web app (design D1).
// The server calls it at start, before it takes the shared data-directory lock
// and opens the database. With no restore-pending.json it does nothing.
//
// The outcome goes to restore-last.json either way; on success the restored
// database also carries the marker for the backup.restored audit event. A
// failure leaves the previous database in place and the server starts on it.
// When another process holds the data directory, the staged files are kept so
// the owner can confirm again (design D2).
func ApplyPendingRestore(dataDir string, log *slog.Logger, now func() time.Time) error {
	if log == nil {
		log = slog.Default()
	}
	if now == nil {
		now = time.Now
	}
	path := filepath.Join(dataDir, PendingRestoreFile)
	raw, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read %s: %w", PendingRestoreFile, err)
	}
	var p pendingMarker
	if err := json.Unmarshal(raw, &p); err != nil || p.FormatVersion != stagingFormat || !stagedIDRE.MatchString(p.ID) {
		// A marker this binary does not understand (or a damaged one): leave the
		// database alone and say so instead of guessing.
		os.Remove(path)
		log.Error("restore: ignoring a pending restore in an unknown format", "file", PendingRestoreFile)
		return writeLastRestore(dataDir, LastRestore{Source: p.Source, Archive: p.Archive, ActorID: p.ActorID, RequestedAt: p.RequestedAt,
			FinishedAt: now().UnixMilli(), Error: "the pending restore was written by a different OpenTodo version"})
	}
	dir := filepath.Join(dataDir, "tmp", "restore", p.ID)
	last := LastRestore{Source: p.Source, Archive: p.Archive, ActorID: p.ActorID, RequestedAt: p.RequestedAt}
	res, err := applyStaged(dataDir, dir, p, now)
	last.FinishedAt = now().UnixMilli()
	if err != nil {
		last.Error = err.Error()
		if errors.Is(err, store.ErrLocked) {
			last.Error = "another OpenTodo process is using the data directory; confirm the restore again once it has stopped"
			last.RetryID = p.ID
		} else {
			os.RemoveAll(dir)
		}
		log.Error("restore failed: starting on the previous database", "archive", p.Archive, "err", err)
	} else {
		last.OK = true
		last.SafetyCopy = filepath.Base(res.SafetyCopy)
		if res.SafetyCopy == "" {
			last.SafetyCopy = ""
		}
		os.RemoveAll(dir)
		log.Info("restore applied", "archive", p.Archive, "source", p.Source, "safety_copy", last.SafetyCopy)
	}
	if err := writeLastRestore(dataDir, last); err != nil {
		return err
	}
	return os.Remove(path)
}

func applyStaged(dataDir, dir string, p pendingMarker, now func() time.Time) (RestoreResult, error) {
	raw, err := os.ReadFile(filepath.Join(dir, stagedMetaName))
	if err != nil {
		return RestoreResult{}, fmt.Errorf("the staged restore is gone: %w", err)
	}
	var meta stagedMeta
	if err := json.Unmarshal(raw, &meta); err != nil || meta.FormatVersion != stagingFormat || meta.Restore.Manifest == nil {
		return RestoreResult{}, fmt.Errorf("%w: unreadable staged restore", ErrIntegrity)
	}
	st := Staged{Dir: dir, Archive: p.Archive, Manifest: *meta.Restore.Manifest}
	marker, _ := json.Marshal(restoreMarker{Archive: p.Archive, ActorID: p.ActorID})
	return Apply(dataDir, st, string(marker), now)
}
