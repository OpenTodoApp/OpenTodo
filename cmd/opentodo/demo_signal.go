//go:build !windows

package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/pixari/opentodo/internal/demo"
)

// resetOnSignal runs the nightly reset (every sandbox deleted, then VACUUM)
// whenever the process receives SIGUSR1 (`kill -USR1 <pid>`), so an operator or
// a smoke test can force it without an HTTP route (OpenSpec `demo-mode` D3,
// `demo-sandboxes` D4). Only the jobs leader listens.
func resetOnSignal(ctx context.Context, d *demo.Service, log *slog.Logger) {
	ch := make(chan os.Signal, 1)
	signal.Notify(ch, syscall.SIGUSR1)
	defer signal.Stop(ch)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ch:
			log.Info("demo reset requested by SIGUSR1")
			if err := d.Reset(ctx); err != nil && ctx.Err() == nil {
				log.Error("demo reset failed", "err", err)
			}
		}
	}
}
