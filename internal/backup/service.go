// Package backup takes consistent snapshots of the database, packages them as
// (optionally compressed and encrypted) archives, ships them to a local
// directory, an S3-compatible bucket or a WebDAV collection on a schedule,
// applies retention, and restores them. See docs/backups.md.
package backup

import (
	"database/sql"
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
}

// Options configure New; zero values pick defaults.
type Options struct {
	Version string
	Log     *slog.Logger
	Now     func() time.Time
	Loc     *time.Location
	Client  *http.Client
	Audit   *audit.Recorder
}

// New wires a Service for the database in dataDir.
func New(db *sql.DB, dataDir string, o Options) *Service {
	s := &Service{
		db: db, dataDir: dataDir, version: o.Version, log: o.Log,
		settings: settings.New(db), secrets: settings.NewSecretsFile(dataDir, "backup"),
		now: o.Now, loc: o.Loc, client: o.Client, audit: o.Audit, startupDelay: 10 * time.Second,
		wakeCh: make(chan struct{}, 1),
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
		s.client = &http.Client{Timeout: 30 * time.Minute}
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
