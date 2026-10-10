// Command opentodo runs the OpenTodo server: API, sync and the embedded web app.
//
//	opentodo              start the server (configured via OPENTODO_* env vars)
//	opentodo healthcheck  exit 0 when a local server answers /healthz (used by Docker)
//	opentodo version      print the version
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/auth"
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
		case "help", "--help", "-h":
			fmt.Print("usage: opentodo [healthcheck|version]\n\nConfiguration is read from OPENTODO_* environment variables; see .env.example.\n")
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

	db, err := store.Open(cfg.DataDir)
	if err != nil {
		return err
	}
	defer db.Close()

	authSvc := auth.NewService(db, cfg.SessionTTL, cfg.AllowSignup)
	syncSvc := opsync.NewService(db)
	handler := httpapi.New(cfg, authSvc, syncSvc, web.Handler(), log, version)

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

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Prune audit events past the owner's retention at startup and hourly.
	go authSvc.Audit().RunPruner(ctx, audit.PruneInterval)

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
