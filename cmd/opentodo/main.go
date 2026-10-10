// Command opentodo runs the OpenTodo server: API, sync and the embedded web app.
//
//	opentodo              start the server (configured via OPENTODO_* env vars)
//	opentodo healthcheck  exit 0 when a local server answers /healthz (used by Docker)
//	opentodo restore      replace the database with a backup archive (server stopped)
//	opentodo version      print the version
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/backup"
	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/httpapi"
	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
	"github.com/pixari/opentodo/internal/web"
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
		case "restore":
			os.Exit(restore(os.Args[2:]))
		case "help", "--help", "-h":
			fmt.Print("usage: opentodo [healthcheck|restore|version]\n\nConfiguration is read from OPENTODO_* environment variables; see .env.example.\nRun `opentodo restore -h` for the restore procedure (docs/backups.md).\n")
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
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: cfg.LogLevel}))
	slog.SetDefault(log)

	// Hold the data directory for the life of the process: a second server, or
	// `opentodo restore`, refuses to touch it while we run.
	unlock, err := store.Lock(cfg.DataDir)
	if err != nil {
		return fmt.Errorf("%s: %w", cfg.DataDir, err)
	}
	defer unlock()

	db, err := store.Open(cfg.DataDir)
	if err != nil {
		return err
	}
	defer db.Close()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	authSvc := auth.NewService(db, cfg.SessionTTL, cfg.AllowSignup)
	syncSvc := opsync.NewService(db)
	backups := backup.New(db, cfg.DataDir, backup.Options{Version: version, Log: log})
	if seeded, err := backups.ApplyPreset(ctx, cfg.Backup); err != nil {
		return err
	} else if seeded {
		log.Info("backup settings seeded from OPENTODO_BACKUP_* variables")
	}
	backups.Start(ctx)
	handler := httpapi.New(cfg, authSvc, syncSvc, web.Handler(), log, version, httpapi.WithBackups(backups))

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		// The live-update stream (GET /api/v1/sync/events) lifts these two deadlines
		// for its own connection via http.ResponseController; every other route keeps them.
		ReadTimeout:  60 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}
	// Close open live-update streams first so Shutdown is not held up by them and
	// clients reconnect to the new process.
	srv.RegisterOnShutdown(syncSvc.Notifier().CloseAll)

	errCh := make(chan error, 1)
	go func() {
		log.Info("opentodo listening", "addr", cfg.Addr, "data_dir", cfg.DataDir, "version", version, "signup_open", cfg.AllowSignup)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
	}
	log.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return srv.Shutdown(shutdownCtx)
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
