package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/host"
)

// runHost serves many tenants from this process (OpenSpec `multi-tenant-host`):
// tenants on cfg.Addr chosen by host name, the operator interface on its own
// address, idle tenants closed in every process and the shared scheduler in
// the process that leads the background jobs (rolling updates as for one
// tenant: a new process serves beside the old one and takes the jobs over).
func runHost(cfg config.Config, log *slog.Logger) error {
	if cfg.BaseURL != nil {
		log.Warn("OPENTODO_BASE_URL is ignored in host mode: each tenant's address derives from OPENTODO_HOST_URL")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	h, err := host.Open(cfg, host.Options{Version: version, Log: log})
	if err != nil {
		return err
	}
	defer h.Close()

	srv := &http.Server{Addr: cfg.Addr, Handler: h, ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout: 60 * time.Second, WriteTimeout: 60 * time.Second, IdleTimeout: 120 * time.Second}
	srv.RegisterOnShutdown(h.CloseStreams)
	// Archives move through the operator interface: no write deadline there.
	op := &http.Server{Addr: cfg.Host.OperatorAddr, Handler: h.OperatorHandler(), ReadHeaderTimeout: 10 * time.Second}

	go h.RunSweeper(ctx)
	schedDone := make(chan struct{})
	jobsStarted, releaseJobs := runJobsWhenLeader(ctx, cfg.DataDir, log, jobsRetry, func() {
		go func() {
			defer close(schedDone)
			h.RunScheduler(ctx)
		}()
	})
	defer releaseJobs()

	errCh := make(chan error, 2)
	for _, s := range []*http.Server{srv, op} {
		go func() {
			if err := s.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
				errCh <- err
			}
		}()
	}
	log.Info("opentodo host listening", "addr", cfg.Addr, "operator_addr", cfg.Host.OperatorAddr, "host_url", cfg.Host.URL.String(),
		"data_dir", cfg.DataDir, "version", version, "max_open", cfg.Host.MaxOpen, "idle", cfg.Host.IdleTimeout)
	select {
	case err = <-errCh:
		stop()
	case <-ctx.Done():
	}
	log.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	serr := srv.Shutdown(shutdownCtx)
	_ = op.Shutdown(shutdownCtx)
	if jobsStarted() {
		select {
		case <-schedDone:
		case <-time.After(15 * time.Second):
			log.Warn("host scheduler did not stop in time")
		}
	}
	if err != nil {
		return err
	}
	return serr
}
