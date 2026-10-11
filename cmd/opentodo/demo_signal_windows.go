//go:build windows

package main

import (
	"context"
	"log/slog"

	"github.com/pixari/opentodo/internal/demo"
)

// resetOnSignal is a no-op on Windows (no SIGUSR1); the nightly reset still runs.
func resetOnSignal(context.Context, *demo.Service, *slog.Logger) {}
