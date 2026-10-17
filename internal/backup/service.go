// Package backup takes consistent snapshots of the database, packages them as
// (optionally compressed and encrypted) archives, ships them to a local
// directory, an S3-compatible bucket or a WebDAV collection on a schedule,
// applies retention, and restores them. See docs/backups.md.
package backup

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"path/filepath"
	"sync"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/settings"
)

// Service owns backup settings, runs and the scheduler.
type Service struct {
	db       *sql.DB
	dataDir  string
	version  string
	log      *slog.Logger
	settings *settings.Store
	secrets  *settings.SecretsFile
	// audit records backup.created / backup.restored; nil disables it.
	audit *audit.Recorder

	// now is the injectable clock; tests replace it.
	now func() time.Time
	// loc is the zone schedules are evaluated in (the server's local zone).
	loc *time.Location
	// client performs outbound requests, only ever to the configured destination.
	client *http.Client
	// startupDelay is how long after Start the first due-check runs.
	startupDelay time.Duration

	runMu   sync.Mutex // held for the duration of a run
	stateMu sync.Mutex
	running *Run // the run in progress, if any
	wakeCh  chan struct{}

	// Web restore (staging.go): the one staged restore and the restart hook.
	restoreMu sync.Mutex
	stagedID  string
	restart   func()
	// freeSpace reports free bytes on a filesystem; tests replace it.
	freeSpace func(dir string) (int64, bool)
	// sameFS reports whether two directories share a filesystem; tests replace it.
	sameFS func(a, b string) bool

	// Lifecycle (reliable-background-jobs): every goroutine the service starts
	// is counted in wg, and life is cancelled by Stop (or when Start's context
	// ends), so shutdown cancels a run in progress and waits for its outcome to
	// be recorded before the database closes.
	life     context.Context
	lifeStop context.CancelFunc
	lifeMu   sync.Mutex
	stopped  bool
	wg       sync.WaitGroup
}

// ErrStopping is returned for a backup requested while the server shuts down.
var ErrStopping = errors.New("the server is shutting down")

// Options configure New; zero values pick defaults.
type Options struct {
	Version string
	Log     *slog.Logger
	Now     func() time.Time
	Loc     *time.Location
	Client  *http.Client
	Audit   *audit.Recorder
	// FreeSpace overrides the free-disk-space probe used by restores (tests).
	FreeSpace func(dir string) (int64, bool)
}

// New wires a Service for the database in dataDir.
func New(db *sql.DB, dataDir string, o Options) *Service {
	s := &Service{
		db: db, dataDir: dataDir, version: o.Version, log: o.Log,
		settings: settings.New(db), secrets: settings.NewSecretsFile(dataDir, "backup"),
		now: o.Now, loc: o.Loc, client: o.Client, audit: o.Audit, startupDelay: 10 * time.Second,
		wakeCh: make(chan struct{}, 1), freeSpace: o.FreeSpace,
	}
	s.life, s.lifeStop = context.WithCancel(context.Background())
	s.sameFS = sameFilesystem
	if s.freeSpace == nil {
		s.freeSpace = freeBytes
	}
	if s.version == "" {
		s.version = "dev"
	}
	if s.log == nil {
		s.log = slog.Default()
	}
	if s.now == nil {
		s.now = time.Now
	}
	if s.loc == nil {
		s.loc = time.Local
	}
	if s.client == nil {
		// No client-wide timeout: each request has a progress deadline
		// (requestIdle), so large archives are not cut off at a fixed time.
		s.client = &http.Client{}
	}
	return s
}

// tmpDir holds snapshots and archives while a run is in progress.
func (s *Service) tmpDir() string { return filepath.Join(s.dataDir, "tmp") }

// defaultLocalDir is where the local destination writes when no dir is set.
func (s *Service) defaultLocalDir() string { return filepath.Join(s.dataDir, "backups") }

// wake nudges the scheduler to re-read settings.
func (s *Service) wake() {
	select {
	case s.wakeCh <- struct{}{}:
	default:
	}
}

// spawn runs f in a goroutine counted by Stop; it reports false (and runs
// nothing) once the service is stopping.
func (s *Service) spawn(f func()) bool {
	s.lifeMu.Lock()
	defer s.lifeMu.Unlock()
	if s.stopped {
		return false
	}
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		f()
	}()
	return true
}

// Stop cancels the scheduler, the restore housekeeping and any backup in
// progress, and waits until they have returned (a cancelled run records itself
// as failed first). It is safe to call more than once; nothing starts after it.
func (s *Service) Stop() {
	s.lifeMu.Lock()
	s.stopped = true
	s.lifeMu.Unlock()
	s.lifeStop()
	s.wg.Wait()
}
