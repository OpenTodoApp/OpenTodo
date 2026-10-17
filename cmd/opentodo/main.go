// Command opentodo runs the OpenTodo server: API, sync and the embedded web app.
//
//	opentodo              start the server (configured via OPENTODO_* env vars)
//	opentodo healthcheck  exit 0 when a local server answers /healthz (used by Docker)
//	opentodo restore      replace the database with a backup archive (server stopped)
//	opentodo mfa-reset    remove an account's second factor (server stopped)
//	opentodo reset-owner-password  print a single-use reset link for the owner
//	opentodo version      print the version
package main

import (
	"context"
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync/atomic"
	"syscall"
	"time"
	// Embedded IANA zone data: the distroless image has no /usr/share/zoneinfo,
	// and zoned due values (absolute-datetimes) are validated by zone name.
	_ "time/tzdata"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/backup"
	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/demo"
	"github.com/pixari/opentodo/internal/store"
	"github.com/pixari/opentodo/internal/tenant"
)

// version is set at build time with -ldflags "-X main.version=...".
var version = "dev"

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "version", "--version", "-v":
			fmt.Println("opentodo", version)
			return
		case "healthcheck":
			os.Exit(healthcheck())
		case "--print-formats":
			// Hidden: the import formats as JSON, for the site bundle manifest
			// (OpenSpec site-bundle D5).
			if err := printFormats(os.Stdout); err != nil {
				fmt.Fprintln(os.Stderr, "opentodo:", err)
				os.Exit(1)
			}
			return
		case "restore":
			os.Exit(restore(os.Args[2:]))
		case "mfa-reset":
			os.Exit(mfaReset(os.Args[2:], os.Stdout, os.Stderr))
		case "reset-owner-password":
			os.Exit(resetOwnerPassword(os.Args[2:], os.Stdout, os.Stderr))
		case "help", "--help", "-h":
			fmt.Print("usage: opentodo [healthcheck|restore|mfa-reset|reset-owner-password|version]\n\nConfiguration is read from OPENTODO_* environment variables; see .env.example.\nRun `opentodo restore -h` for the restore procedure (docs/backups.md).\nRun `opentodo mfa-reset -h` to rescue an account locked out of its second factor.\nRun `opentodo reset-owner-password -h` when the owner forgot their password.\n")
			return
		default:
			fmt.Fprintf(os.Stderr, "unknown command %q\n", os.Args[1])
			os.Exit(2)
		}
	}
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "opentodo:", err)
		os.Exit(1)
	}
	if restartRequested.Load() {
		// A restore was confirmed in the web app (backup-restore-web D1): start
		// again in the same process, so the next start applies it without relying
		// on a container restart policy.
		if err := reexec(); err != nil {
			slog.Error("could not restart in place: restart OpenTodo to finish the restore", "err", err)
		}
		os.Exit(0)
	}
}

// restartRequested is set when the server stops to apply a confirmed restore.
var restartRequested atomic.Bool

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: cfg.LogLevel}))
	slog.SetDefault(log)
	cfg.LogWarnings(log)

	if cfg.Host != nil {
		// Host mode (OpenSpec `multi-tenant-host`): many tenants in one process.
		return runHost(cfg, log)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	// A confirmed web restore stops the server like SIGTERM does, then main re-execs.
	ctx, requestRestart := context.WithCancel(ctx)
	defer requestRestart()

	// One tenant: the data directory, its services and its handler (OpenSpec
	// `multi-tenant-host` D1). Open applies a pending web restore and holds the
	// data directory shared until Close.
	t, err := tenant.Open(ctx, cfg, tenant.Options{Version: version, Log: log, Restart: func() {
		restartRequested.Store(true)
		requestRestart()
	}})
	if err != nil {
		return err
	}
	defer t.Close()

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           t.Handler,
		ReadHeaderTimeout: 10 * time.Second,
		// The live-update stream (GET /api/v1/sync/events) lifts these two deadlines
		// for its own connection via http.ResponseController; every other route keeps them.
		ReadTimeout:  60 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}
	// Close open live-update streams first so Shutdown is not held up by them and
	// clients reconnect to the new process.
	srv.RegisterOnShutdown(t.Sync.Notifier().CloseAll)

	// Background jobs run in one server process only: during a rolling update the
	// new container serves beside the old one and takes them over when it stops.
	var stopJobs func()
	jobsStarted, releaseJobs := runJobsWhenLeader(ctx, cfg.DataDir, log, jobsRetry, func() {
		stopJobs = t.StartJobs(ctx, func(ctx context.Context, d *demo.Service) { resetOnSignal(ctx, d, log) })
	})
	defer releaseJobs()
	// waitJobs stops the background jobs and waits for them (bounded), so the
	// database is closed only after the last of them has recorded its outcome.
	waitJobs := func() {
		if !jobsStarted() {
			return
		}
		done := make(chan struct{})
		go func() {
			stopJobs()
			close(done)
		}()
		select {
		case <-done:
		case <-time.After(jobsStopTimeout):
			log.Warn("background jobs did not stop in time; closing the database anyway", "waited", jobsStopTimeout)
		}
	}

	errCh := make(chan error, 1)
	go func() {
		log.Info("opentodo listening", "addr", cfg.Addr, "data_dir", cfg.DataDir, "version", version, "signup_open", t.Cfg.AllowSignup)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case err := <-errCh:
		stop()
		waitJobs()
		return err
	case <-ctx.Done():
	}
	log.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	err = srv.Shutdown(shutdownCtx)
	// Let the jobs in progress finish (a webhook delivery is capped at 10 s, a
	// backup is cancelled) so their outcome is recorded; anything still queued
	// runs after the next start.
	waitJobs()
	return err
}

// restore implements `opentodo restore [--data-dir DIR] [--passphrase-file FILE] <archive>`.
func restore(args []string) int {
	fs := flag.NewFlagSet("restore", flag.ContinueOnError)
	dataDir := fs.String("data-dir", "", "data directory (default: $OPENTODO_DATA_DIR or ./data)")
	passFile := fs.String("passphrase-file", "", "file containing the passphrase of an encrypted archive")
	fs.Usage = func() {
		fmt.Fprint(fs.Output(), `usage: opentodo restore [--data-dir DIR] [--passphrase-file FILE] <archive>

Replaces the database with the one in a backup archive. Stop the server first.
The archive is verified (checksum, decryption, schema version) before anything
changes; the current database is kept as opentodo.db.pre-restore-<timestamp>.
Start the server afterwards: pending migrations run and devices re-sync.
See docs/backups.md.

`)
		fs.PrintDefaults()
	}
	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return 0
		}
		return 2
	}
	if fs.NArg() != 1 {
		fs.Usage()
		return 2
	}
	dir := *dataDir
	if dir == "" {
		dir = os.Getenv("OPENTODO_DATA_DIR")
	}
	if dir == "" {
		dir = "./data"
	}
	var pass string
	if *passFile != "" {
		raw, err := os.ReadFile(*passFile)
		if err != nil {
			fmt.Fprintln(os.Stderr, "opentodo restore:", err)
			return 1
		}
		pass = strings.TrimRight(string(raw), "\r\n")
	}
	res, err := backup.Restore(backup.RestoreOptions{DataDir: dir, Archive: fs.Arg(0), Passphrase: pass})
	if err != nil {
		fmt.Fprintln(os.Stderr, "opentodo restore:", err)
		return 1
	}
	m := res.Manifest
	fmt.Printf("restored %s into %s\n", filepath.Base(fs.Arg(0)), dir)
	fmt.Printf("  backup created %s by opentodo %s (schema %d)\n", m.CreatedAt, m.AppVersion, m.SchemaVersion)
	if res.SafetyCopy != "" {
		fmt.Printf("  previous database kept as %s\n", res.SafetyCopy)
	}
	fmt.Printf("  new log generation %s: devices re-send their local changes on their next sync\n", res.Generation)
	fmt.Println("start the server to apply pending migrations")
	return 0
}

// mfaReset implements `opentodo mfa-reset [--data-dir DIR] <email>`: the last
// resort for an owner who lost both their authenticator and their recovery
// codes (OpenSpec `mfa-totp`). It works on the data directory directly, so it
// needs shell access to the host and refuses to run while the server holds the
// directory. The reset is recorded in the audit log as mfa.reset.
func mfaReset(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("mfa-reset", flag.ContinueOnError)
	fs.SetOutput(stderr)
	dataDir := fs.String("data-dir", "", "data directory (default: $OPENTODO_DATA_DIR or ./data)")
	fs.Usage = func() {
		fmt.Fprint(fs.Output(), `usage: opentodo mfa-reset [--data-dir DIR] <email>

Removes the two-factor secret, recovery codes and remembered browsers of the
account with this email, so it can sign in with its password alone. If the
owner policy requires two-factor authentication for the account, it must enrol
again right after signing in. Stop the server first. See SECURITY.md.

`)
		fs.PrintDefaults()
	}
	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return 0
		}
		return 2
	}
	if fs.NArg() != 1 {
		fs.Usage()
		return 2
	}
	dir := *dataDir
	if dir == "" {
		dir = os.Getenv("OPENTODO_DATA_DIR")
	}
	if dir == "" {
		dir = "./data"
	}
	if _, err := os.Stat(store.DBPath(dir)); err != nil {
		fmt.Fprintf(stderr, "opentodo mfa-reset: no database in %s: %v\n", dir, err)
		return 1
	}
	unlock, err := store.Lock(dir)
	if err != nil {
		fmt.Fprintf(stderr, "opentodo mfa-reset: %s: %v (stop the server first)\n", dir, err)
		return 1
	}
	defer unlock()
	db, err := store.Open(dir)
	if err != nil {
		fmt.Fprintln(stderr, "opentodo mfa-reset:", err)
		return 1
	}
	defer db.Close()
	u, err := auth.NewService(db, time.Hour, false).ResetMFAByEmail(context.Background(), fs.Arg(0))
	if errors.Is(err, auth.ErrNotFound) {
		fmt.Fprintf(stderr, "opentodo mfa-reset: no account with email %q\n", fs.Arg(0))
		return 1
	}
	if err != nil {
		fmt.Fprintln(stderr, "opentodo mfa-reset:", err)
		return 1
	}
	fmt.Fprintf(stdout, "two-factor authentication removed for %s (%s); trusted browsers forgotten\n", u.Email, u.Role)
	fmt.Fprintln(stdout, "start the server and sign in with the password; enrol again in Settings > Security")
	return 0
}

// resetOwnerPassword implements `opentodo reset-owner-password [--data-dir DIR]
// [--base-url URL]`: the owner is never a target of the HTTP reset route, so
// an operator with shell access to the data directory prints a single-use,
// 24-hour owner reset link here (OpenSpec `user-management`). It opens no
// listener and needs no configuration. It works while the server runs (SQLite
// handles the second writer) as long as the server already migrated the
// database to this binary's schema; with the server stopped it migrates first.
func resetOwnerPassword(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("reset-owner-password", flag.ContinueOnError)
	fs.SetOutput(stderr)
	dataDir := fs.String("data-dir", "", "data directory (default: $OPENTODO_DATA_DIR or ./data)")
	baseURL := fs.String("base-url", "", "address the link should start with (default: $OPENTODO_BASE_URL, else http://localhost:<port>)")
	fs.Usage = func() {
		fmt.Fprint(fs.Output(), `usage: opentodo reset-owner-password [--data-dir DIR] [--base-url URL]

Prints a single-use link, valid for 24 hours, that sets a new password for the
owner account. Open it in a browser and choose a new password; all of the
owner's sessions are signed out. Issuing a new link invalidates the previous
one. Nothing is sent anywhere. See docs/self-hosting/docker.md.

`)
		fs.PrintDefaults()
	}
	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return 0
		}
		return 2
	}
	if fs.NArg() != 0 {
		fs.Usage()
		return 2
	}
	dir := *dataDir
	if dir == "" {
		dir = os.Getenv("OPENTODO_DATA_DIR")
	}
	if dir == "" {
		dir = "./data"
	}
	if _, err := os.Stat(store.DBPath(dir)); err != nil {
		fmt.Fprintf(stderr, "opentodo reset-owner-password: no database in %s: %v\n", dir, err)
		return 1
	}
	var db *sql.DB
	if unlock, err := store.Lock(dir); err == nil {
		// Server stopped: open normally, applying pending migrations.
		defer unlock()
		if db, err = store.Open(dir); err != nil {
			fmt.Fprintln(stderr, "opentodo reset-owner-password:", err)
			return 1
		}
	} else {
		// Server running: never migrate underneath it.
		if db, err = store.OpenFile(store.DBPath(dir)); err != nil {
			fmt.Fprintln(stderr, "opentodo reset-owner-password:", err)
			return 1
		}
		var v int
		if err := db.QueryRow("PRAGMA user_version").Scan(&v); err != nil || v != store.LatestVersion() {
			db.Close()
			fmt.Fprintf(stderr, "opentodo reset-owner-password: the running server uses another schema version (%d, this binary %d); run this binary's server, or stop the server first\n", v, store.LatestVersion())
			return 1
		}
	}
	defer db.Close()
	u, pr, secret, err := auth.NewService(db, time.Hour, false).IssueOwnerPasswordReset(context.Background())
	if errors.Is(err, auth.ErrNotFound) {
		fmt.Fprintln(stderr, "opentodo reset-owner-password: this server has no owner yet; open it in a browser to create one")
		return 1
	}
	if err != nil {
		fmt.Fprintln(stderr, "opentodo reset-owner-password:", err)
		return 1
	}
	base := strings.TrimRight(*baseURL, "/")
	if base == "" {
		base = strings.TrimRight(os.Getenv("OPENTODO_BASE_URL"), "/")
	}
	if base == "" {
		port := "8080"
		if _, p, err := net.SplitHostPort(os.Getenv("OPENTODO_ADDR")); err == nil && p != "" {
			port = p
		}
		base = "http://localhost:" + port
	}
	fmt.Fprintf(stdout, "password reset link for the owner %s (valid until %s):\n\n  %s/reset/%s\n\n",
		u.Email, time.UnixMilli(pr.ExpiresAt).UTC().Format(time.RFC3339), base, secret)
	fmt.Fprintln(stdout, "it works once; if your server answers on another address, keep the /reset/... part and use that address")
	return 0
}

func healthcheck() int {
	addr := os.Getenv("OPENTODO_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		port = strings.TrimPrefix(addr, ":")
	}
	if host == "" || host == "0.0.0.0" || host == "::" {
		host = "127.0.0.1"
	}
	client := http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("http://" + net.JoinHostPort(host, port) + "/healthz")
	if err != nil {
		fmt.Fprintln(os.Stderr, "unhealthy:", err)
		return 1
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		fmt.Fprintln(os.Stderr, "unhealthy: status", resp.StatusCode)
		return 1
	}
	return 0
}
