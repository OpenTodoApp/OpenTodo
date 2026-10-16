package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSMTPConfig(t *testing.T) {
	keys := []string{"OPENTODO_SMTP_HOST", "OPENTODO_SMTP_SECURITY", "OPENTODO_SMTP_USER", "OPENTODO_SMTP_PASSWORD", "OPENTODO_SMTP_PASSWORD_FILE", "OPENTODO_SMTP_FROM"}
	pwFile := filepath.Join(t.TempDir(), "pw")
	if err := os.WriteFile(pwFile, []byte("from-file\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name string
		env  map[string]string
		want SMTPConfig
		err  string
	}{
		{name: "unset", env: nil},
		{name: "bare host gets 587 and starttls", env: map[string]string{"OPENTODO_SMTP_HOST": "smtp.example.com", "OPENTODO_SMTP_FROM": "todo@example.com"},
			want: SMTPConfig{Host: "smtp.example.com", Port: 587, Security: "starttls", From: "todo@example.com"}},
		{name: "port 465 defaults to tls", env: map[string]string{"OPENTODO_SMTP_HOST": "smtp.example.com:465", "OPENTODO_SMTP_FROM": "OpenTodo <todo@example.com>", "OPENTODO_SMTP_USER": "u", "OPENTODO_SMTP_PASSWORD": "p"},
			want: SMTPConfig{Host: "smtp.example.com", Port: 465, Security: "tls", User: "u", Password: "p", From: "OpenTodo <todo@example.com>"}},
		{name: "password file", env: map[string]string{"OPENTODO_SMTP_HOST": "h:25", "OPENTODO_SMTP_FROM": "a@b.c", "OPENTODO_SMTP_USER": "u", "OPENTODO_SMTP_PASSWORD_FILE": pwFile},
			want: SMTPConfig{Host: "h", Port: 25, Security: "starttls", User: "u", Password: "from-file", From: "a@b.c"}},
		{name: "none without user", env: map[string]string{"OPENTODO_SMTP_HOST": "relay:25", "OPENTODO_SMTP_FROM": "a@b.c", "OPENTODO_SMTP_SECURITY": "none"},
			want: SMTPConfig{Host: "relay", Port: 25, Security: "none", From: "a@b.c"}},
		{name: "host without from", env: map[string]string{"OPENTODO_SMTP_HOST": "h"}, err: "OPENTODO_SMTP_FROM"},
		{name: "from without host", env: map[string]string{"OPENTODO_SMTP_FROM": "a@b.c"}, err: "OPENTODO_SMTP_HOST"},
		{name: "user without password", env: map[string]string{"OPENTODO_SMTP_HOST": "h", "OPENTODO_SMTP_FROM": "a@b.c", "OPENTODO_SMTP_USER": "u"}, err: "OPENTODO_SMTP_PASSWORD"},
		{name: "password without user", env: map[string]string{"OPENTODO_SMTP_HOST": "h", "OPENTODO_SMTP_FROM": "a@b.c", "OPENTODO_SMTP_PASSWORD": "p"}, err: "OPENTODO_SMTP_USER"},
		{name: "both password variants", env: map[string]string{"OPENTODO_SMTP_PASSWORD": "p", "OPENTODO_SMTP_PASSWORD_FILE": pwFile}, err: "only one"},
		{name: "none with user", env: map[string]string{"OPENTODO_SMTP_HOST": "h", "OPENTODO_SMTP_FROM": "a@b.c", "OPENTODO_SMTP_USER": "u", "OPENTODO_SMTP_PASSWORD": "p", "OPENTODO_SMTP_SECURITY": "none"}, err: "credentials need tls or starttls"},
		{name: "unknown security", env: map[string]string{"OPENTODO_SMTP_HOST": "h", "OPENTODO_SMTP_FROM": "a@b.c", "OPENTODO_SMTP_SECURITY": "ssl"}, err: "OPENTODO_SMTP_SECURITY"},
		{name: "bad port", env: map[string]string{"OPENTODO_SMTP_HOST": "h:99999", "OPENTODO_SMTP_FROM": "a@b.c"}, err: "OPENTODO_SMTP_HOST"},
		{name: "two addresses", env: map[string]string{"OPENTODO_SMTP_HOST": "h", "OPENTODO_SMTP_FROM": "a@b.c, d@e.f"}, err: "OPENTODO_SMTP_FROM"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			for _, k := range keys {
				t.Setenv(k, tc.env[k])
			}
			got, err := loadSMTP()
			if tc.err != "" {
				if err == nil || !strings.Contains(err.Error(), tc.err) {
					t.Fatalf("err = %v, want %q", err, tc.err)
				}
				return
			}
			if err != nil || got != tc.want {
				t.Fatalf("got %+v %v, want %+v", got, err, tc.want)
			}
		})
	}
}
