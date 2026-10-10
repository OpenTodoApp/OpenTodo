package config

import (
	"fmt"
	"net"
	"net/mail"
	"os"
	"strconv"
	"strings"
	"time"
)

// EmailConfig holds the optional OPENTODO_EMAIL_* variables of email capture
// (OpenSpec change `email-to-task`, design D2). The feature is on only when the
// public address, the IMAP host, the IMAP user and a password are all set; any
// other non-empty subset stops startup with an error naming what is missing.
type EmailConfig struct {
	// Address is the public address pattern, e.g. todo@example.com. A user's
	// address is LocalPart + "+" + secret + "@" + Domain.
	Address   string
	LocalPart string
	Domain    string
	// IMAPHost is host:port. Port 993 means implicit TLS; any other port
	// requires STARTTLS. Credentials are sent only over TLS.
	IMAPHost     string
	IMAPUser     string
	IMAPPassword string
	Mailbox      string
	PollInterval time.Duration
	// Processed is what happens to a handled message: "move" to
	// ProcessedFolder (the default, OpenTodo/Processed) or "delete".
	Processed       string
	ProcessedFolder string
}

// Email capture defaults and bounds.
const (
	DefaultEmailMailbox         = "INBOX"
	DefaultEmailPollSeconds     = 60
	MinEmailPollSeconds         = 15
	DefaultEmailProcessedFolder = "OpenTodo/Processed"
)

// Enabled reports whether the operator configured email capture.
func (e EmailConfig) Enabled() bool { return e.Address != "" }

// AddressFor returns the inbox address carrying secret.
func (e EmailConfig) AddressFor(secret string) string {
	return e.LocalPart + "+" + secret + "@" + e.Domain
}

// loadEmail parses OPENTODO_EMAIL_*. Every variable is optional.
func loadEmail() (EmailConfig, error) {
	e := EmailConfig{
		Mailbox:         DefaultEmailMailbox,
		PollInterval:    DefaultEmailPollSeconds * time.Second,
		Processed:       "move",
		ProcessedFolder: DefaultEmailProcessedFolder,
	}
	addr := strings.TrimSpace(os.Getenv("OPENTODO_EMAIL_ADDRESS"))
	host := strings.TrimSpace(os.Getenv("OPENTODO_EMAIL_IMAP_HOST"))
	user := strings.TrimSpace(os.Getenv("OPENTODO_EMAIL_IMAP_USER"))
	pass := os.Getenv("OPENTODO_EMAIL_IMAP_PASSWORD")
	if f := strings.TrimSpace(os.Getenv("OPENTODO_EMAIL_IMAP_PASSWORD_FILE")); f != "" {
		if pass != "" {
			return e, fmt.Errorf("set only one of OPENTODO_EMAIL_IMAP_PASSWORD and OPENTODO_EMAIL_IMAP_PASSWORD_FILE")
		}
		raw, err := os.ReadFile(f)
		if err != nil {
			return e, fmt.Errorf("OPENTODO_EMAIL_IMAP_PASSWORD_FILE: %w", err)
		}
		pass = strings.TrimRight(string(raw), "\r\n")
		if pass == "" {
			return e, fmt.Errorf("OPENTODO_EMAIL_IMAP_PASSWORD_FILE: file %s is empty", f)
		}
	}
	optional := []string{"OPENTODO_EMAIL_IMAP_MAILBOX", "OPENTODO_EMAIL_POLL_SECONDS", "OPENTODO_EMAIL_PROCESSED"}
	anyOptional := false
	for _, k := range optional {
		if strings.TrimSpace(os.Getenv(k)) != "" {
			anyOptional = true
		}
	}
	if addr == "" && host == "" && user == "" && pass == "" {
		if anyOptional {
			return e, fmt.Errorf("OPENTODO_EMAIL_ADDRESS, OPENTODO_EMAIL_IMAP_HOST, OPENTODO_EMAIL_IMAP_USER and OPENTODO_EMAIL_IMAP_PASSWORD must be set to use the other OPENTODO_EMAIL_* variables")
		}
		return e, nil
	}
	for _, req := range []struct{ name, v string }{
		{"OPENTODO_EMAIL_ADDRESS", addr},
		{"OPENTODO_EMAIL_IMAP_HOST", host},
		{"OPENTODO_EMAIL_IMAP_USER", user},
		{"OPENTODO_EMAIL_IMAP_PASSWORD", pass},
	} {
		if req.v == "" {
			return e, fmt.Errorf("%s is required when any OPENTODO_EMAIL_* variable is set (email capture is all or nothing)", req.name)
		}
	}
	a, err := mail.ParseAddress(addr)
	if err != nil || a.Name != "" || !strings.EqualFold(a.Address, addr) {
		return e, fmt.Errorf("OPENTODO_EMAIL_ADDRESS must be a plain address such as todo@example.com, got %q", addr)
	}
	at := strings.LastIndexByte(a.Address, '@')
	e.LocalPart, e.Domain = strings.ToLower(a.Address[:at]), strings.ToLower(a.Address[at+1:])
	if strings.Contains(e.LocalPart, "+") || e.LocalPart == "" || e.Domain == "" {
		return e, fmt.Errorf("OPENTODO_EMAIL_ADDRESS must not contain '+' (the secret is added as +<secret>), got %q", addr)
	}
	e.Address = e.LocalPart + "@" + e.Domain

	if !strings.Contains(host, ":") || strings.HasSuffix(host, "]") {
		host = net.JoinHostPort(strings.Trim(host, "[]"), "993")
	}
	h, p, err := net.SplitHostPort(host)
	if n, perr := strconv.Atoi(p); err != nil || h == "" || perr != nil || n < 1 || n > 65535 {
		return e, fmt.Errorf("OPENTODO_EMAIL_IMAP_HOST must be host:port, got %q", host)
	}
	e.IMAPHost, e.IMAPUser, e.IMAPPassword = host, user, pass
	if strings.ContainsAny(user+pass, "\r\n\x00") {
		return e, fmt.Errorf("OPENTODO_EMAIL_IMAP_USER and the password must not contain line breaks")
	}

	if v := strings.TrimSpace(os.Getenv("OPENTODO_EMAIL_IMAP_MAILBOX")); v != "" {
		if !printableASCII(v) {
			return e, fmt.Errorf("OPENTODO_EMAIL_IMAP_MAILBOX must be printable ASCII, got %q", v)
		}
		e.Mailbox = v
	}
	if v := strings.TrimSpace(os.Getenv("OPENTODO_EMAIL_POLL_SECONDS")); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < MinEmailPollSeconds || n > 86400 {
			return e, fmt.Errorf("OPENTODO_EMAIL_POLL_SECONDS must be an integer from %d to 86400, got %q", MinEmailPollSeconds, v)
		}
		e.PollInterval = time.Duration(n) * time.Second
	}
	if v := strings.TrimSpace(os.Getenv("OPENTODO_EMAIL_PROCESSED")); v != "" {
		switch {
		case strings.EqualFold(v, "delete"):
			e.Processed, e.ProcessedFolder = "delete", ""
		case strings.HasPrefix(strings.ToLower(v), "move:") && len(v) > 5 && printableASCII(v[5:]):
			e.Processed, e.ProcessedFolder = "move", v[5:]
		default:
			return e, fmt.Errorf("OPENTODO_EMAIL_PROCESSED must be move:<folder> or delete, got %q", v)
		}
	}
	return e, nil
}

func printableASCII(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] < 0x20 || s[i] > 0x7e || s[i] == '"' || s[i] == '\\' {
			return false
		}
	}
	return s != ""
}
