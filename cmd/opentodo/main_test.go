package main

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/store"
)

// TestMFAResetSubcommand runs `opentodo mfa-reset` against a temporary data
// directory holding an enrolled owner.
func TestMFAResetSubcommand(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	db, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	svc := auth.NewService(db, time.Hour, false)
	u, err := svc.Register(ctx, "Owner@Example.com", "Owner", "correct horse battery", "")
	if err != nil {
		t.Fatal(err)
	}
	en, err := svc.BeginTOTPEnrollment(ctx, u)
	if err != nil {
		t.Fatal(err)
	}
	code, _ := auth.TOTPCodeAt(en.Secret, time.Now())
	if _, err := svc.ConfirmTOTPEnrollment(ctx, u, code, ""); err != nil {
		t.Fatal(err)
	}
	db.Close()

	var out, errOut bytes.Buffer
	if rc := mfaReset([]string{"--data-dir", dir, "nobody@example.com"}, &out, &errOut); rc != 1 || !strings.Contains(errOut.String(), "no account") {
		t.Fatalf("unknown email: rc=%d %q", rc, errOut.String())
	}
	if rc := mfaReset([]string{"--data-dir", dir}, &out, &errOut); rc != 2 {
		t.Fatalf("missing email: rc=%d", rc)
	}
	if rc := mfaReset([]string{"--data-dir", t.TempDir(), "owner@example.com"}, &out, &errOut); rc != 1 {
		t.Fatalf("empty data dir: rc=%d", rc)
	}
	// Refuses while the data directory is held (a running server).
	unlock, err := store.Lock(dir)
	if err != nil {
		t.Fatal(err)
	}
	errOut.Reset()
	if rc := mfaReset([]string{"--data-dir", dir, "owner@example.com"}, &out, &errOut); rc != 1 || !strings.Contains(errOut.String(), "stop the server") {
		t.Fatalf("locked dir: rc=%d %q", rc, errOut.String())
	}
	unlock()

	out.Reset()
	if rc := mfaReset([]string{"--data-dir", dir, "owner@example.com"}, &out, &errOut); rc != 0 {
		t.Fatalf("reset: rc=%d %s", rc, errOut.String())
	}
	if !strings.Contains(out.String(), "owner@example.com") {
		t.Fatalf("output = %q", out.String())
	}
	db, err = store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var n int
	if err := db.QueryRow("SELECT COUNT(*) FROM mfa_totp").Scan(&n); err != nil || n != 0 {
		t.Fatalf("mfa_totp rows = %d %v", n, err)
	}
	if err := db.QueryRow("SELECT COUNT(*) FROM audit_events WHERE name = 'mfa.reset' AND target_id = ?", u.ID).Scan(&n); err != nil || n != 1 {
		t.Fatalf("mfa.reset events = %d %v", n, err)
	}
}

// TestDebugNoteShowsTheLevel: with OPENTODO_LOG_LEVEL=debug the log shows it at
// startup, before any request (#128); at info the note stays out of the log.
func TestDebugNoteShowsTheLevel(t *testing.T) {
	for _, tc := range []struct {
		level slog.Level
		want  bool
	}{{slog.LevelDebug, true}, {slog.LevelInfo, false}} {
		var buf bytes.Buffer
		log := slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: tc.level}))
		logDebugNote(log)
		if got := strings.Contains(buf.String(), "level=DEBUG msg=\"debug logging is on"); got != tc.want {
			t.Fatalf("level %v: note logged %v: %q", tc.level, got, buf.String())
		}
	}
	if logLevelName(slog.LevelDebug) != "debug" || logLevelName(slog.LevelWarn) != "warn" {
		t.Fatal("level names")
	}
}
