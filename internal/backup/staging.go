package backup

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/store"
)

// Web restore (OpenSpec backup-restore-web, design D1, D6, D7). A restore is
// staged under <data>/tmp/restore/<id>/ while the server runs, confirmed by the
// owner, and applied by the next start (ApplyPendingRestore) after an in-place
// restart. Only one staged restore exists at a time.

const (
	// stagingTTL is how long an unconfirmed staged restore is kept.
	stagingTTL = 30 * time.Minute
	// sweepEvery is how often expired staging directories are removed.
	sweepEvery = 5 * time.Minute
	// PendingRestoreFile names the confirmed restore the next start applies.
	PendingRestoreFile = "restore-pending.json"
	// LastRestoreFile records the outcome of the last web restore.
	LastRestoreFile = "restore-last.json"
	// stagingFormat versions meta.json and the pending marker; a binary only
	// applies markers in a format it knows.
	stagingFormat = 1

	stagedArchiveName = "archive"
	stagedMetaName    = "meta.json"
)

// Restore sources.
const (
	SourceArchive    = "archive"     // an archive in the configured destination
	SourceUpload     = "upload"      // an archive uploaded from the browser
	SourceSafetyCopy = "safety-copy" // a database kept by an earlier restore (undo)
)

// ConfirmWord must be typed to confirm a restore.
const ConfirmWord = "RESTORE"

var (
	// ErrStagedNotFound means the staged restore id is unknown or expired.
	ErrStagedNotFound = errors.New("this restore is no longer prepared: prepare the archive again")
	// ErrNotSafetyCopy is returned for a name that is not a safety copy.
	ErrNotSafetyCopy = errors.New("not a safety copy name")

	stagedIDRE   = regexp.MustCompile(`^[0-9a-f]{32}$`)
	safetyCopyRE = regexp.MustCompile(`^opentodo\.db\.pre-restore-(\d{8}-\d{6})$`)
)

// StagedRestore is what the restore section shows about a prepared or uploaded archive.
type StagedRestore struct {
	ID        string    `json:"id"`
	Source    string    `json:"source"`
	Archive   string    `json:"archive"`
	Size      int64     `json:"size"`
	Encrypted bool      `json:"encrypted"`
	Manifest  *Manifest `json:"manifest,omitempty"` // nil for an encrypted upload not opened yet
	Counts    *Counts   `json:"counts,omitempty"`   // set once verified
	Verified  bool      `json:"verified"`
	CreatedAt int64     `json:"createdAt"`
	ExpiresAt int64     `json:"expiresAt"`
}

// stagedMeta is meta.json inside a staging directory.
type stagedMeta struct {
	FormatVersion int           `json:"formatVersion"`
	OwnerID       string        `json:"ownerId"`
	Restore       StagedRestore `json:"restore"`
}

// pendingMarker is restore-pending.json.
type pendingMarker struct {
	FormatVersion int    `json:"formatVersion"`
	ID            string `json:"id"`
	Source        string `json:"source"`
	Archive       string `json:"archive"`
	ActorID       string `json:"actorId"`
	RequestedAt   int64  `json:"requestedAt"`
}

// LastRestore is restore-last.json: the outcome of the last web restore.
type LastRestore struct {
	FormatVersion int    `json:"formatVersion"`
	Source        string `json:"source"`
	Archive       string `json:"archive"`
	ActorID       string `json:"actorId"`
	RequestedAt   int64  `json:"requestedAt"`
	FinishedAt    int64  `json:"finishedAt"`
	OK            bool   `json:"ok"`
	Error         string `json:"error,omitempty"`
	SafetyCopy    string `json:"safetyCopy,omitempty"` // file name in the data directory
	// RetryID keeps a staged restore that could not be applied because another
	// process held the data directory, so the owner can confirm it again.
	RetryID string `json:"retryId,omitempty"`
	// Audited is set once the next start recorded the request (and a failure).
	Audited bool `json:"audited"`
}

// SafetyCopy is one opentodo.db.pre-restore-<ts> file.
type SafetyCopy struct {
	Name      string `json:"name"`
	Size      int64  `json:"size"`
	CreatedAt int64  `json:"createdAt"`
}

// RestoreState is GET /api/v1/backups/restore.
type RestoreState struct {
	Staged       *StagedRestore `json:"staged"`
	Last         *LastRestore   `json:"last"`
	SafetyCopies []SafetyCopy   `json:"safetyCopies"`
	// UndoAvailable: the safety copy written by the last restore still exists.
	UndoAvailable bool  `json:"undoAvailable"`
	FreeBytes     int64 `json:"freeBytes"` // -1 when unknown
	UploadLimit   int64 `json:"uploadLimit"`
}

// ArchiveInfo is one archive in the destination listing.
type ArchiveInfo struct {
	Name      string `json:"name"`
	Size      int64  `json:"size"`
	CreatedAt int64  `json:"createdAt"`
	Encrypted bool   `json:"encrypted"`
}

func (s *Service) restoreRoot() string { return filepath.Join(s.tmpDir(), "restore") }

func (s *Service) stagingDir(id string) string { return filepath.Join(s.restoreRoot(), id) }

// SetRestartFunc wires the function that restarts the server after a confirmed
// restore (cmd/opentodo). Without it, a confirmed restore waits for the next start.
func (s *Service) SetRestartFunc(f func()) { s.restart = f }

// Archives lists the archives in the configured destination, newest first.
// Objects that are not OpenTodo archives are left out.
func (s *Service) Archives(ctx context.Context) ([]ArchiveInfo, string, error) {
	d, err := s.configuredDestination(ctx)
	if err != nil {
		return nil, "", err
	}
	objs, err := d.List(ctx)
	if err != nil {
		return nil, d.Describe(), fmt.Errorf("%s: %w", d.Describe(), err)
	}
	out := []ArchiveInfo{}
	for _, o := range objs {
		t, ok := archiveTime(o.Name)
		if !ok {
			continue
		}
		out = append(out, ArchiveInfo{Name: o.Name, Size: o.Size, CreatedAt: t.UnixMilli(), Encrypted: strings.HasSuffix(o.Name, ".enc")})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt > out[j].CreatedAt })
	return out, d.Describe(), nil
}

func (s *Service) configuredDestination(ctx context.Context) (Destination, error) {
	set, err := s.LoadSettings(ctx)
	if err != nil {
		return nil, err
	}
	sec, err := s.secrets.Load()
	if err != nil {
		return nil, err
	}
	return s.destination(set, sec)
}

// fetchArchive streams a named archive from d into dst. limit caps the bytes
// written (-1: no cap); over it, the partial file is removed.
func fetchArchive(ctx context.Context, d Destination, name, dst string, limit int64) (int64, error) {
	body, size, err := d.Open(ctx, name)
	if err != nil {
		return 0, err
	}
	defer body.Close()
	if limit >= 0 && size > limit {
		return 0, fmt.Errorf("%w: the archive is %s", ErrInsufficientStorage, humanBytes(size))
	}
	return writeLimited(dst, body, limit)
}

// writeLimited copies r into a new file at dst (mode 0600), refusing more than
// limit bytes (-1: no cap). On any error the file is removed.
func writeLimited(dst string, r io.Reader, limit int64) (int64, error) {
	f, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		return 0, err
	}
	src := r
	if limit >= 0 {
		src = io.LimitReader(r, limit+1)
	}
	n, err := io.Copy(f, src)
	if err == nil && limit >= 0 && n > limit {
		err = fmt.Errorf("%w: the archive is larger than the %s the data directory can take", ErrInsufficientStorage, humanBytes(limit))
	}
	if err == nil {
		err = f.Sync()
	}
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		os.Remove(dst)
		return n, err
	}
	return n, nil
}

// newStaging replaces the current staged restore with a fresh directory.
func (s *Service) newStaging() (string, string, error) {
	s.restoreMu.Lock()
	prev := s.stagedID
	s.stagedID = ""
	s.restoreMu.Unlock()
	if prev != "" {
		os.RemoveAll(s.stagingDir(prev))
	}
	id := randomHex(16)
	dir := s.stagingDir(id)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", "", err
	}
	return id, dir, nil
}

func (s *Service) saveStaged(dir, ownerID string, r StagedRestore) error {
	raw, err := json.Marshal(stagedMeta{FormatVersion: stagingFormat, OwnerID: ownerID, Restore: r})
	if err != nil {
		return err
	}
	if err := writeFileAtomic(filepath.Join(dir, stagedMetaName), raw); err != nil {
		return err
	}
	s.restoreMu.Lock()
	s.stagedID = r.ID
	s.restoreMu.Unlock()
	return nil
}

// loadStaged returns the current staged restore if it has not expired.
func (s *Service) loadStaged(id string) (stagedMeta, error) {
	var m stagedMeta
	if !stagedIDRE.MatchString(id) {
		return m, ErrStagedNotFound
	}
	s.restoreMu.Lock()
	cur := s.stagedID
	s.restoreMu.Unlock()
	if id != cur {
		return m, ErrStagedNotFound
	}
	raw, err := os.ReadFile(filepath.Join(s.stagingDir(id), stagedMetaName))
	if err != nil {
		return m, ErrStagedNotFound
	}
	if err := json.Unmarshal(raw, &m); err != nil || m.FormatVersion != stagingFormat {
		return m, ErrStagedNotFound
	}
	if s.now().UnixMilli() > m.Restore.ExpiresAt {
		s.discard(id)
		return m, ErrStagedNotFound
	}
	return m, nil
}

func (s *Service) discard(id string) {
	s.restoreMu.Lock()
	if s.stagedID == id {
		s.stagedID = ""
	}
	s.restoreMu.Unlock()
	os.RemoveAll(s.stagingDir(id))
}

// ReceiveUpload streams an uploaded archive into a new staging directory and
// reads what it can of the manifest: everything for a plain archive or one the
// stored passphrase opens, only the encrypted flag otherwise. Anything that is
// not an OpenTodo archive is refused with ErrIntegrity and nothing is kept.
func (s *Service) ReceiveUpload(ctx context.Context, body io.Reader, ownerID string) (StagedRestore, error) {
	id, dir, err := s.newStaging()
	if err != nil {
		return StagedRestore{}, err
	}
	keep := false
	defer func() {
		if !keep {
			os.RemoveAll(dir)
		}
	}()
	path := filepath.Join(dir, stagedArchiveName)
	n, err := writeLimited(path, body, uploadCap(s.freeSpace, s.dataDir))
	if err != nil {
		return StagedRestore{}, err
	}
	now := s.now()
	r := StagedRestore{ID: id, Source: SourceUpload, Archive: "upload", Size: n, CreatedAt: now.UnixMilli(), ExpiresAt: now.Add(stagingTTL).UnixMilli()}
	m, encrypted, err := s.peekManifest(path)
	if err != nil {
		return StagedRestore{}, err
	}
	r.Encrypted, r.Manifest = encrypted, m
	if m != nil {
		r.Archive = ArchiveName(mustTime(m.CreatedAt, now), m.Generation, m.Compression == CompressionGzip, encrypted)
	}
	if err := s.saveStaged(dir, ownerID, r); err != nil {
		return StagedRestore{}, err
	}
	keep = true
	return r, nil
}

func mustTime(rfc string, fallback time.Time) time.Time {
	if t, err := time.Parse(time.RFC3339, rfc); err == nil {
		return t
	}
	return fallback
}

// peekManifest checks that path is an OpenTodo archive and returns its manifest
// when it can be read without a passphrase other than the stored one.
func (s *Service) peekManifest(path string) (*Manifest, bool, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, false, err
	}
	defer f.Close()
	head := make([]byte, len(encMagic))
	if _, err := io.ReadFull(f, head); err != nil {
		return nil, false, fmt.Errorf("%w: the file is not an OpenTodo backup", ErrIntegrity)
	}
	encrypted := bytes.Equal(head, []byte(encMagic))
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return nil, false, err
	}
	pass := ""
	if encrypted {
		pass = s.storedPassphrase()
		if pass == "" {
			return nil, true, nil
		}
	}
	tr, _, _, err := openArchive(bufio.NewReader(f), pass)
	if err != nil {
		if encrypted && errors.Is(err, ErrIntegrity) {
			return nil, true, nil // another server's passphrase: asked for at prepare
		}
		return nil, encrypted, fmt.Errorf("%w: the file is not an OpenTodo backup", ErrIntegrity)
	}
	m, err := readManifest(tr)
	if err != nil {
		if errors.Is(err, ErrNewerSchema) {
			return nil, encrypted, err
		}
		if encrypted {
			return nil, true, nil
		}
		return nil, false, fmt.Errorf("%w: the file is not an OpenTodo backup", ErrIntegrity)
	}
	return &m, encrypted, nil
}

func (s *Service) storedPassphrase() string {
	sec, err := s.secrets.Load()
	if err != nil {
		return ""
	}
	return sec.Value(SecretPassphrase)
}

// PrepareSource names what to restore: exactly one field is set.
type PrepareSource struct {
	Archive    string `json:"archive,omitempty"`
	Upload     string `json:"upload,omitempty"`
	SafetyCopy string `json:"safetyCopy,omitempty"`
}

// Prepare stages and verifies a restore without touching the live database and
// returns its preview. Encrypted archives are tried with passphrase, else the
// stored backup passphrase. Passphrase errors keep the downloaded archive so a
// retry with another passphrase does not fetch it again; other errors discard it.
func (s *Service) Prepare(ctx context.Context, src PrepareSource, passphrase, ownerID string) (StagedRestore, error) {
	if passphrase == "" {
		passphrase = s.storedPassphrase()
	}
	switch {
	case src.Upload != "":
		meta, err := s.loadStaged(src.Upload)
		if err != nil || meta.Restore.Source == SourceSafetyCopy {
			return StagedRestore{}, ErrStagedNotFound
		}
		return s.stageFromFile(meta.Restore, passphrase, ownerID)
	case src.Archive != "":
		if !IsArchiveName(src.Archive) {
			return StagedRestore{}, ErrNotArchiveName
		}
		// Retrying the archive that is already downloaded skips the download.
		s.restoreMu.Lock()
		cur := s.stagedID
		s.restoreMu.Unlock()
		if cur != "" {
			if meta, err := s.loadStaged(cur); err == nil && meta.Restore.Source == SourceArchive && meta.Restore.Archive == src.Archive {
				return s.stageFromFile(meta.Restore, passphrase, ownerID)
			}
		}
		d, err := s.configuredDestination(ctx)
		if err != nil {
			return StagedRestore{}, err
		}
		id, dir, err := s.newStaging()
		if err != nil {
			return StagedRestore{}, err
		}
		limit := uploadCap(s.freeSpace, s.dataDir)
		n, err := fetchArchive(ctx, d, src.Archive, filepath.Join(dir, stagedArchiveName), limit)
		if err != nil {
			os.RemoveAll(dir)
			if errors.Is(err, ErrNotArchiveName) || errors.Is(err, ErrArchiveNotFound) || errors.Is(err, ErrInsufficientStorage) {
				return StagedRestore{}, err
			}
			return StagedRestore{}, &DestinationError{Dest: d.Describe(), Err: err}
		}
		now := s.now()
		r := StagedRestore{ID: id, Source: SourceArchive, Archive: src.Archive, Size: n, Encrypted: strings.HasSuffix(src.Archive, ".enc"),
			CreatedAt: now.UnixMilli(), ExpiresAt: now.Add(stagingTTL).UnixMilli()}
		if err := s.saveStaged(dir, ownerID, r); err != nil {
			os.RemoveAll(dir)
			return StagedRestore{}, err
		}
		return s.stageFromFile(r, passphrase, ownerID)
	case src.SafetyCopy != "":
		return s.stageSafetyCopy(src.SafetyCopy, ownerID)
	}
	return StagedRestore{}, fmt.Errorf("%w: name an archive, an upload or a safety copy", ErrNotArchiveName)
}

// DestinationError wraps a failure of the destination, named without credentials.
type DestinationError struct {
	Dest string
	Err  error
}

func (e *DestinationError) Error() string { return e.Dest + ": " + e.Err.Error() }
func (e *DestinationError) Unwrap() error { return e.Err }

// stageFromFile runs Stage over the archive already in r's staging directory.
func (s *Service) stageFromFile(r StagedRestore, passphrase, ownerID string) (StagedRestore, error) {
	dir := s.stagingDir(r.ID)
	f, err := os.Open(filepath.Join(dir, stagedArchiveName))
	if err != nil {
		s.discard(r.ID)
		return StagedRestore{}, ErrStagedNotFound
	}
	defer f.Close()
	if err := ensureFreeSpaceWith(s.freeSpace, s.dataDir, 2*fileSize(store.DBPath(s.dataDir))); err != nil {
		return StagedRestore{}, err
	}
	st, err := Stage(dir, f, passphrase, r.Archive)
	if err != nil {
		os.Remove(st.DBPath())
		os.RemoveAll(filepath.Join(dir, stagedExtrasDir))
		if !errors.Is(err, ErrPassphraseRequired) && !errors.Is(err, ErrPassphraseInvalid) {
			s.discard(r.ID)
		}
		return StagedRestore{}, err
	}
	c, err := Preview(st)
	if err != nil {
		s.discard(r.ID)
		return StagedRestore{}, fmt.Errorf("%w: %v", ErrIntegrity, err)
	}
	m := st.Manifest
	r.Manifest, r.Counts, r.Verified, r.Encrypted = &m, &c, true, m.Encrypted
	if r.Source == SourceUpload {
		r.Archive = ArchiveName(mustTime(m.CreatedAt, s.now()), m.Generation, m.Compression == CompressionGzip, m.Encrypted)
	}
	r.ExpiresAt = s.now().Add(stagingTTL).UnixMilli()
	if err := s.saveStaged(dir, ownerID, r); err != nil {
		return StagedRestore{}, err
	}
	return r, nil
}

// stageSafetyCopy stages a safety copy (undo): it skips the archive step but
// runs the same integrity and schema checks on a fresh consistent copy.
func (s *Service) stageSafetyCopy(name, ownerID string) (StagedRestore, error) {
	m := safetyCopyRE.FindStringSubmatch(name)
	if m == nil {
		return StagedRestore{}, ErrNotSafetyCopy
	}
	srcPath := filepath.Join(s.dataDir, name)
	fi, err := os.Stat(srcPath)
	if err != nil {
		return StagedRestore{}, ErrStagedNotFound
	}
	if err := ensureFreeSpaceWith(s.freeSpace, s.dataDir, fi.Size()+fileSize(store.DBPath(s.dataDir))); err != nil {
		return StagedRestore{}, err
	}
	id, dir, err := s.newStaging()
	if err != nil {
		return StagedRestore{}, err
	}
	st := Staged{Dir: dir, Archive: name}
	if err := vacuumInto(srcPath, st.DBPath()); err != nil {
		os.RemoveAll(dir)
		return StagedRestore{}, fmt.Errorf("%w: %v", ErrIntegrity, err)
	}
	v, err := schemaVersion(st.DBPath())
	if err != nil {
		os.RemoveAll(dir)
		return StagedRestore{}, err
	}
	if err := verifyRestored(st.DBPath(), v); err != nil {
		os.RemoveAll(dir)
		return StagedRestore{}, err
	}
	c, err := Preview(st)
	if err != nil {
		os.RemoveAll(dir)
		return StagedRestore{}, fmt.Errorf("%w: %v", ErrIntegrity, err)
	}
	created, _ := time.Parse(archiveTimeLayout, m[1])
	man := Manifest{Format: ManifestFormat, FormatVersion: ManifestVersion, AppVersion: "", SchemaVersion: v, CreatedAt: created.UTC().Format(time.RFC3339)}
	now := s.now()
	r := StagedRestore{ID: id, Source: SourceSafetyCopy, Archive: name, Size: fi.Size(), Manifest: &man, Counts: &c, Verified: true,
		CreatedAt: now.UnixMilli(), ExpiresAt: now.Add(stagingTTL).UnixMilli()}
	if err := s.saveStaged(dir, ownerID, r); err != nil {
		os.RemoveAll(dir)
		return StagedRestore{}, err
	}
	return r, nil
}

func schemaVersion(path string) (int, error) {
	db, err := store.OpenFile(path)
	if err != nil {
		return 0, err
	}
	defer db.Close()
	var v int
	err = db.QueryRow("PRAGMA user_version").Scan(&v)
	return v, err
}

// CancelRestore removes a staged restore. Unknown ids are not an error.
func (s *Service) CancelRestore(id string) {
	if stagedIDRE.MatchString(id) {
		s.discard(id)
	}
}

// ConfirmRestore records the confirmed restore for the next start and asks for
// the in-place restart. It fails with ErrRunning while a backup runs; once it
// succeeds, no backup can start until the process restarts.
func (s *Service) ConfirmRestore(ctx context.Context, id, actorID string) error {
	meta, err := s.loadStaged(id)
	if err != nil || !meta.Restore.Verified {
		return ErrStagedNotFound
	}
	if !s.runMu.TryLock() {
		return ErrRunning
	}
	marker := pendingMarker{FormatVersion: stagingFormat, ID: id, Source: meta.Restore.Source, Archive: meta.Restore.Archive, ActorID: actorID, RequestedAt: s.now().UnixMilli()}
	raw, _ := json.Marshal(marker)
	if err := writeFileAtomic(filepath.Join(s.dataDir, PendingRestoreFile), raw); err != nil {
		s.runMu.Unlock()
		return err
	}
	s.log.Info("restore confirmed: restarting to apply it", "archive", marker.Archive, "source", marker.Source)
	if s.restart != nil {
		s.restart()
	}
	return nil
}

// RestoreState reports the staged restore, the last outcome, safety copies and free space.
func (s *Service) RestoreState(ctx context.Context) (RestoreState, error) {
	st := RestoreState{SafetyCopies: []SafetyCopy{}, FreeBytes: -1, UploadLimit: uploadCap(s.freeSpace, s.dataDir)}
	if free, ok := s.freeSpace(s.dataDir); ok {
		st.FreeBytes = free
	}
	s.restoreMu.Lock()
	cur := s.stagedID
	s.restoreMu.Unlock()
	if cur != "" {
		if m, err := s.loadStaged(cur); err == nil {
			r := m.Restore
			st.Staged = &r
		}
	}
	if last, err := readLastRestore(s.dataDir); err == nil {
		st.Last = &last
	}
	copies, err := safetyCopies(s.dataDir)
	if err != nil {
		return st, err
	}
	st.SafetyCopies = copies
	if st.Last != nil && st.Last.OK && st.Last.SafetyCopy != "" {
		for _, c := range copies {
			if c.Name == st.Last.SafetyCopy {
				st.UndoAvailable = true
			}
		}
	}
	return st, nil
}

func safetyCopies(dataDir string) ([]SafetyCopy, error) {
	entries, err := os.ReadDir(dataDir)
	if err != nil {
		return nil, err
	}
	out := []SafetyCopy{}
	for _, e := range entries {
		m := safetyCopyRE.FindStringSubmatch(e.Name())
		if m == nil || !e.Type().IsRegular() {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		t, _ := time.Parse(archiveTimeLayout, m[1])
		out = append(out, SafetyCopy{Name: e.Name(), Size: info.Size(), CreatedAt: t.UnixMilli()})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt > out[j].CreatedAt })
	return out, nil
}

// DeleteSafetyCopy removes one safety copy and records it in the audit log.
func (s *Service) DeleteSafetyCopy(ctx context.Context, name, actorID string) error {
	if !safetyCopyRE.MatchString(name) {
		return ErrNotSafetyCopy
	}
	if err := os.Remove(filepath.Join(s.dataDir, name)); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return ErrStagedNotFound
		}
		return err
	}
	s.audit.Record(ctx, audit.BackupSafetyCopyDeleted(actorID, name))
	return nil
}

func readLastRestore(dataDir string) (LastRestore, error) {
	var l LastRestore
	raw, err := os.ReadFile(filepath.Join(dataDir, LastRestoreFile))
	if err != nil {
		return l, err
	}
	err = json.Unmarshal(raw, &l)
	return l, err
}

func writeLastRestore(dataDir string, l LastRestore) error {
	l.FormatVersion = stagingFormat
	raw, err := json.Marshal(l)
	if err != nil {
		return err
	}
	return writeFileAtomic(filepath.Join(dataDir, LastRestoreFile), raw)
}

// startRestoreHousekeeping runs at server start: it records the outcome of a
// web restore in the audit log, removes staging directories left over (except
// one kept for a retry), and sweeps expired ones every few minutes.
func (s *Service) startRestoreHousekeeping(ctx context.Context) {
	keep := ""
	if last, err := readLastRestore(s.dataDir); err == nil {
		if !last.Audited {
			s.audit.Record(ctx, audit.BackupRestoreRequested(last.ActorID, last.Archive, last.Source))
			if !last.OK {
				s.audit.Record(ctx, audit.BackupRestoreFailed(last.ActorID, last.Archive, failureReason(last.Error)))
			}
			last.Audited = true
			if err := writeLastRestore(s.dataDir, last); err != nil {
				s.log.Error("backup: record restore outcome", "err", err)
			}
		}
		keep = last.RetryID
	}
	if keep != "" {
		if m, err := os.ReadFile(filepath.Join(s.stagingDir(keep), stagedMetaName)); err == nil {
			var meta stagedMeta
			if json.Unmarshal(m, &meta) == nil && s.now().UnixMilli() <= meta.Restore.ExpiresAt {
				s.restoreMu.Lock()
				s.stagedID = keep
				s.restoreMu.Unlock()
			} else {
				keep = ""
			}
		}
	}
	s.sweepStaging(keep, true)
	s.spawn(func() {
		t := time.NewTicker(sweepEvery)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-s.life.Done():
				return
			case <-t.C:
				s.restoreMu.Lock()
				cur := s.stagedID
				s.restoreMu.Unlock()
				if cur != "" {
					_, _ = s.loadStaged(cur) // discards it once expired
				}
				s.sweepStaging(cur, false)
			}
		}
	})
}

// sweepStaging removes staging directories other than keep: all of them when
// all is set (startup), otherwise those older than the TTL.
func (s *Service) sweepStaging(keep string, all bool) {
	entries, err := os.ReadDir(s.restoreRoot())
	if err != nil {
		return
	}
	for _, e := range entries {
		if e.Name() == keep {
			continue
		}
		if !all {
			info, err := e.Info()
			if err != nil || s.now().Sub(info.ModTime()) < stagingTTL {
				continue
			}
		}
		os.RemoveAll(filepath.Join(s.restoreRoot(), e.Name()))
	}
}

// failureReason turns an apply error into a short reason code for the audit log.
func failureReason(msg string) string {
	switch {
	case strings.Contains(msg, store.ErrLocked.Error()):
		return "data_dir_in_use"
	case strings.Contains(msg, ErrInsufficientStorage.Error()):
		return "insufficient_storage"
	case strings.Contains(msg, ErrIntegrity.Error()):
		return "integrity"
	case strings.Contains(msg, ErrNewerSchema.Error()):
		return "newer_schema"
	}
	return "apply_failed"
}
