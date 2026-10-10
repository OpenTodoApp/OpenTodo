package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func clearEmailEnv(t *testing.T) {
	for _, k := range []string{"OPENTODO_EMAIL_ADDRESS", "OPENTODO_EMAIL_IMAP_HOST", "OPENTODO_EMAIL_IMAP_USER",
		"OPENTODO_EMAIL_IMAP_PASSWORD", "OPENTODO_EMAIL_IMAP_PASSWORD_FILE", "OPENTODO_EMAIL_IMAP_MAILBOX",
		"OPENTODO_EMAIL_POLL_SECONDS", "OPENTODO_EMAIL_PROCESSED"} {
		t.Setenv(k, "")
	}
}

func TestEmailConfigDisabledByDefault(t *testing.T) {
	clearEmailEnv(t)
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if c.Email.Enabled() {
		t.Fatalf("email enabled without configuration: %+v", c.Email)
	}
}

func TestEmailConfigDefaults(t *testing.T) {
	clearEmailEnv(t)
	t.Setenv("OPENTODO_EMAIL_ADDRESS", "Todo@Example.com")
	t.Setenv("OPENTODO_EMAIL_IMAP_HOST", "imap.example.com")
	t.Setenv("OPENTODO_EMAIL_IMAP_USER", "todo@example.com")
	t.Setenv("OPENTODO_EMAIL_IMAP_PASSWORD", "s3cret")
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	e := c.Email
	if !e.Enabled() || e.Address != "todo@example.com" || e.IMAPHost != "imap.example.com:993" ||
		e.Mailbox != "INBOX" || e.PollInterval != time.Minute || e.Processed != "move" ||
		e.ProcessedFolder != "OpenTodo/Processed" || e.IMAPPassword != "s3cret" {
		t.Fatalf("defaults = %+v", e)
	}
	if got := e.AddressFor("abc"); got != "todo+abc@example.com" {
		t.Fatalf("AddressFor = %q", got)
	}
}

func TestEmailConfigPartialFails(t *testing.T) {
	cases := []struct {
		env     map[string]string
		mention string
	}{
		{map[string]string{"OPENTODO_EMAIL_IMAP_HOST": "imap.example.com:993"}, "OPENTODO_EMAIL_ADDRESS"},
		{map[string]string{"OPENTODO_EMAIL_ADDRESS": "todo@example.com", "OPENTODO_EMAIL_IMAP_HOST": "h:993", "OPENTODO_EMAIL_IMAP_USER": "u"}, "OPENTODO_EMAIL_IMAP_PASSWORD"},
		{map[string]string{"OPENTODO_EMAIL_POLL_SECONDS": "30"}, "OPENTODO_EMAIL_ADDRESS"},
	}
	for _, tc := range cases {
		clearEmailEnv(t)
		for k, v := range tc.env {
			t.Setenv(k, v)
		}
		_, err := Load()
		if err == nil || !strings.Contains(err.Error(), tc.mention) {
			t.Fatalf("env %v: err = %v, want mention of %s", tc.env, err, tc.mention)
		}
	}
}

func TestEmailConfigValidation(t *testing.T) {
	base := map[string]string{
		"OPENTODO_EMAIL_ADDRESS":       "todo@example.com",
		"OPENTODO_EMAIL_IMAP_HOST":     "imap.example.com:143",
		"OPENTODO_EMAIL_IMAP_USER":     "u",
		"OPENTODO_EMAIL_IMAP_PASSWORD": "p",
	}
	bad := map[string]string{
		"OPENTODO_EMAIL_ADDRESS":      "todo+x@example.com",
		"OPENTODO_EMAIL_POLL_SECONDS": "5",
		"OPENTODO_EMAIL_PROCESSED":    "archive",
		"OPENTODO_EMAIL_IMAP_HOST":    "imap.example.com:0",
	}
	for k, v := range bad {
		clearEmailEnv(t)
		for bk, bv := range base {
			t.Setenv(bk, bv)
		}
		t.Setenv(k, v)
		if _, err := Load(); err == nil || !strings.Contains(err.Error(), k) {
			t.Fatalf("%s=%s: err = %v", k, v, err)
		}
	}
	clearEmailEnv(t)
	for bk, bv := range base {
		t.Setenv(bk, bv)
	}
	t.Setenv("OPENTODO_EMAIL_PROCESSED", "delete")
	t.Setenv("OPENTODO_EMAIL_POLL_SECONDS", "15")
	c, err := Load()
	if err != nil || c.Email.Processed != "delete" || c.Email.PollInterval != 15*time.Second {
		t.Fatalf("config = %+v, %v", c.Email, err)
	}
}

func TestEmailConfigPasswordFile(t *testing.T) {
	clearEmailEnv(t)
	f := filepath.Join(t.TempDir(), "pw")
	if err := os.WriteFile(f, []byte("from-file\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("OPENTODO_EMAIL_ADDRESS", "todo@example.com")
	t.Setenv("OPENTODO_EMAIL_IMAP_HOST", "imap.example.com:993")
	t.Setenv("OPENTODO_EMAIL_IMAP_USER", "u")
	t.Setenv("OPENTODO_EMAIL_IMAP_PASSWORD_FILE", f)
	c, err := Load()
	if err != nil || c.Email.IMAPPassword != "from-file" {
		t.Fatalf("password = %q, %v", c.Email.IMAPPassword, err)
	}
}
