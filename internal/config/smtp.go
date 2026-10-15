package config

import (
	"fmt"
	"net"
	"net/mail"
	"os"
	"strconv"
	"strings"
)

// SMTPConfig holds the optional OPENTODO_SMTP_* variables of outgoing email
// (OpenSpec change `outgoing-email`, design D1). Each set value overrides the
// owner's stored setting and locks that field in Settings. Empty means unset.
type SMTPConfig struct {
	Host     string // host name without the port
	Port     int    // 0 when OPENTODO_SMTP_HOST is unset
	Security string // tls | starttls | none; "" when neither HOST nor SECURITY is set
	User     string
	Password string
	From     string // "addr" or "Name <addr>"
}

// Any reports whether any OPENTODO_SMTP_* value is set.
func (c SMTPConfig) Any() bool {
	return c.Host != "" || c.Security != "" || c.User != "" || c.Password != "" || c.From != ""
}

// SMTP security modes.
const (
	SMTPSecurityTLS      = "tls"
	SMTPSecurityStartTLS = "starttls"
	SMTPSecurityNone     = "none"
)

// DefaultSMTPSecurity is implicit TLS on 465 and STARTTLS on every other port.
func DefaultSMTPSecurity(port int) string {
	if port == 465 {
		return SMTPSecurityTLS
	}
	return SMTPSecurityStartTLS
}

// ValidSMTPFrom reports whether v is exactly one address, optionally with a display name.
func ValidSMTPFrom(v string) bool {
	if strings.ContainsAny(v, "\r\n") {
		return false
	}
	a, err := mail.ParseAddress(v)
	return err == nil && a.Address != "" && strings.Contains(a.Address, "@")
}

// loadSMTP parses OPENTODO_SMTP_*. Every variable is optional; the rules are
// all-or-nothing per pair: host and From together, user and password together,
// and `none` never with a user.
func loadSMTP() (SMTPConfig, error) {
	var c SMTPConfig
	host := strings.TrimSpace(os.Getenv("OPENTODO_SMTP_HOST"))
	sec := strings.ToLower(strings.TrimSpace(os.Getenv("OPENTODO_SMTP_SECURITY")))
	c.User = strings.TrimSpace(os.Getenv("OPENTODO_SMTP_USER"))
	c.Password = os.Getenv("OPENTODO_SMTP_PASSWORD")
	c.From = strings.TrimSpace(os.Getenv("OPENTODO_SMTP_FROM"))
	if f := strings.TrimSpace(os.Getenv("OPENTODO_SMTP_PASSWORD_FILE")); f != "" {
		if c.Password != "" {
			return c, fmt.Errorf("set only one of OPENTODO_SMTP_PASSWORD and OPENTODO_SMTP_PASSWORD_FILE")
		}
		raw, err := os.ReadFile(f)
		if err != nil {
			return c, fmt.Errorf("OPENTODO_SMTP_PASSWORD_FILE: %w", err)
		}
		c.Password = strings.TrimRight(string(raw), "\r\n")
		if c.Password == "" {
			return c, fmt.Errorf("OPENTODO_SMTP_PASSWORD_FILE: file %s is empty", f)
		}
	}
	if (host == "") != (c.From == "") {
		if host == "" {
			return c, fmt.Errorf("OPENTODO_SMTP_HOST is required when OPENTODO_SMTP_FROM is set")
		}
		return c, fmt.Errorf("OPENTODO_SMTP_FROM is required when OPENTODO_SMTP_HOST is set")
	}
	if (c.User == "") != (c.Password == "") {
		if c.User == "" {
			return c, fmt.Errorf("OPENTODO_SMTP_USER is required when an SMTP password is set")
		}
		return c, fmt.Errorf("OPENTODO_SMTP_PASSWORD or OPENTODO_SMTP_PASSWORD_FILE is required when OPENTODO_SMTP_USER is set")
	}
	if strings.ContainsAny(c.User+c.Password, "\r\n\x00") {
		return c, fmt.Errorf("OPENTODO_SMTP_USER and the password must not contain line breaks")
	}
	if host != "" {
		if !strings.Contains(host, ":") || strings.HasSuffix(host, "]") {
			host = net.JoinHostPort(strings.Trim(host, "[]"), "587")
		}
		h, p, err := net.SplitHostPort(host)
		n, perr := strconv.Atoi(p)
		if err != nil || h == "" || perr != nil || n < 1 || n > 65535 {
			return c, fmt.Errorf("OPENTODO_SMTP_HOST must be host or host:port, got %q", host)
		}
		c.Host, c.Port = h, n
	}
	switch sec {
	case "", SMTPSecurityTLS, SMTPSecurityStartTLS, SMTPSecurityNone:
	default:
		return c, fmt.Errorf("OPENTODO_SMTP_SECURITY must be tls, starttls or none, got %q", sec)
	}
	if sec == "" && c.Host != "" {
		sec = DefaultSMTPSecurity(c.Port)
	}
	c.Security = sec
	if c.Security == SMTPSecurityNone && c.User != "" {
		return c, fmt.Errorf("OPENTODO_SMTP_SECURITY=none cannot be used with OPENTODO_SMTP_USER: credentials need tls or starttls")
	}
	if c.From != "" && !ValidSMTPFrom(c.From) {
		return c, fmt.Errorf("OPENTODO_SMTP_FROM must be one address such as todo@example.com or OpenTodo <todo@example.com>, got %q", c.From)
	}
	return c, nil
}
