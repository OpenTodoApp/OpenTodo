package main

import (
	"bytes"
	"context"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/store"
)

// TestResetOwnerPasswordCommand runs `opentodo reset-owner-password` against a
// data directory, with the server stopped and while it holds the directory;
// the printed link works once.
func TestResetOwnerPasswordCommand(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	var out, errOut bytes.Buffer
	if rc := resetOwnerPassword([]string{"--data-dir", dir}, &out, &errOut); rc != 1 {
		t.Fatalf("empty data dir: rc=%d", rc)
	}
	db, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	db.Close()
	errOut.Reset()
	if rc := resetOwnerPassword([]string{"--data-dir", dir}, &out, &errOut); rc != 1 || !strings.Contains(errOut.String(), "no owner") {
		t.Fatalf("no owner: rc=%d %q", rc, errOut.String())
	}
	db, _ = store.Open(dir)
	svc := auth.NewService(db, time.Hour, false)
	if _, err := svc.Register(ctx, "owner@example.com", "Owner", "correct horse battery", ""); err != nil {
		t.Fatal(err)
	}
	db.Close()
	if rc := resetOwnerPassword([]string{"--data-dir", dir, "extra"}, &out, &errOut); rc != 2 {
		t.Fatalf("extra argument: rc=%d", rc)
	}

	secretFrom := func(s string) string {
		i := strings.Index(s, "/reset/")
		if i < 0 {
			t.Fatalf("no link in %q", s)
		}
		return strings.Fields(s[i+len("/reset/"):])[0]
	}
	out.Reset()
	if rc := resetOwnerPassword([]string{"--data-dir", dir, "--base-url", "https://todo.example.com/"}, &out, &errOut); rc != 0 {
		t.Fatalf("stopped server: rc=%d %s", rc, errOut.String())
	}
	if !strings.Contains(out.String(), "https://todo.example.com/reset/otr_") {
		t.Fatalf("output = %q", out.String())
	}
	first := secretFrom(out.String())

	// While a server holds the directory the command still works.
	unlock, err := store.Lock(dir)
	if err != nil {
		t.Fatal(err)
	}
	out.Reset()
	if rc := resetOwnerPassword([]string{"--data-dir", dir}, &out, &errOut); rc != 0 {
		t.Fatalf("running server: rc=%d %s", rc, errOut.String())
	}
	unlock()
	second := secretFrom(out.String())

	db, _ = store.Open(dir)
	defer db.Close()
	svc = auth.NewService(db, time.Hour, false)
	if err := svc.ResetPassword(ctx, first, "the owner's new password"); err == nil {
		t.Fatal("the first link survived a newer one")
	}
	if err := svc.ResetPassword(ctx, second, "the owner's new password"); err != nil {
		t.Fatal(err)
	}
	if err := svc.ResetPassword(ctx, second, "another new password"); err == nil {
		t.Fatal("link worked twice")
	}
	if _, err := svc.Authenticate(ctx, "owner@example.com", "the owner's new password"); err != nil {
		t.Fatalf("new password: %v", err)
	}
}
