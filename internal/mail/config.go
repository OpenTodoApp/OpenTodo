// Package mail is the server's optional outgoing email (OpenSpec change
// `outgoing-email`): the owner's SMTP configuration with OPENTODO_SMTP_*
// overrides, a standard-library SMTP transport with an explicit TLS policy,
// plain-text templates in six languages, sending limits and audit events.
// Every message the server sends goes through Service.Send.
package mail

import (
	"context"
	"fmt"
	"strings"

	"github.com/pixari/opentodo/internal/config"
)

// Settings keys (design D1). The password is not among them: it lives in
// <data>/secrets/smtp.json, which backups never include.
const (
	KeyHost     = "smtp.host"
	KeyPort     = "smtp.port"
	KeySecurity = "smtp.security"
	KeyUser     = "smtp.user"
	KeyFrom     = "smtp.from"
	// KeyPassword names the password in the secrets file and audit events.
	KeyPassword = "smtp.password"
)

// Config is the effective SMTP configuration.
type Config struct {
	Host     string
	Port     int
	Security string // tls | starttls | none
	User     string
	Password string
	From     string
	// ManagedBy maps host, port, security, username, password and from to
	// "env" or "settings".
	ManagedBy map[string]string
}

// Enabled reports whether a host and a From address are configured.
func (c Config) Enabled() bool { return c.Host != "" && c.From != "" }

// PasswordSet reports whether a password is present.
func (c Config) PasswordSet() bool { return c.Password != "" }

// Update is the owner's change. A nil field is kept; Password "" removes the
// stored password.
type Update struct {
	Host     *string
	Port     *int
	Security *string
	User     *string
	Password *string
	From     *string
}

// Change is one changed setting for the audit log. The password is reported as
// "" or "set", never its value.
type Change struct{ Key, From, To string }

// InvalidError is a value the owner must fix; Field names it.
type InvalidError struct{ Field, Msg string }

func (e *InvalidError) Error() string { return e.Field + ": " + e.Msg }

// ManagedError is a change to a field set by an environment variable.
type ManagedError struct{ Field, Variable string }

func (e *ManagedError) Error() string {
	return e.Field + " is set by " + e.Variable + " and cannot be changed here"
}

// envVariable names the variable that locks each field.
var envVariable = map[string]string{
	"host": "OPENTODO_SMTP_HOST", "port": "OPENTODO_SMTP_HOST", "security": "OPENTODO_SMTP_SECURITY",
	"username": "OPENTODO_SMTP_USER", "password": "OPENTODO_SMTP_PASSWORD", "from": "OPENTODO_SMTP_FROM",
}

func (s *Service) envSet(field string) bool {
	e := s.env
	switch field {
	case "host", "port":
		return e.Host != ""
	case "security":
		return e.Security != ""
	case "username":
		return e.User != ""
	case "password":
		return e.Password != ""
	case "from":
		return e.From != ""
	}
	return false
}

// Config returns the stored values with the environment overrides applied.
func (s *Service) Config(ctx context.Context) (Config, error) {
	c := Config{ManagedBy: map[string]string{}}
	if s.settings == nil {
		return c, nil
	}
	var err error
	get := func(key string, dst any) {
		if err == nil {
			_, err = s.settings.Get(ctx, key, dst)
		}
	}
	get(KeyHost, &c.Host)
	get(KeyPort, &c.Port)
	get(KeySecurity, &c.Security)
	get(KeyUser, &c.User)
	get(KeyFrom, &c.From)
	if err != nil {
		return c, err
	}
	sec, err := s.secrets.Load()
	if err != nil {
		return c, err
	}
	c.Password = sec.Value(KeyPassword)
	for f := range envVariable {
		c.ManagedBy[f] = "settings"
		if s.envSet(f) {
			c.ManagedBy[f] = "env"
		}
	}
	e := s.env
	if e.Host != "" {
		c.Host, c.Port = e.Host, e.Port
	}
	if e.Security != "" {
		c.Security = e.Security
	}
	if e.User != "" {
		c.User = e.User
	}
	if e.Password != "" {
		c.Password = e.Password
	}
	if e.From != "" {
		c.From = e.From
	}
	if c.Port == 0 && c.Host != "" {
		c.Port = 587
	}
	if c.Security == "" && c.Host != "" {
		c.Security = config.DefaultSMTPSecurity(c.Port)
	}
	return c, nil
}

// Enabled reports whether outgoing email is configured.
func (s *Service) Enabled(ctx context.Context) bool {
	if s == nil {
		return false
	}
	c, err := s.Config(ctx)
	return err == nil && c.Enabled()
}

// Save validates and stores an update and returns what changed.
func (s *Service) Save(ctx context.Context, u Update) ([]Change, error) {
	cur, err := s.Config(ctx)
	if err != nil {
		return nil, err
	}
	next := cur
	str := func(field string, p *string, dst *string, max int) error {
		if p == nil {
			return nil
		}
		v := strings.TrimSpace(*p)
		if s.envSet(field) {
			if v != *dst {
				return &ManagedError{Field: field, Variable: envVariable[field]}
			}
			return nil
		}
		if len(v) > max || strings.ContainsAny(v, "\r\n\x00") {
			return &InvalidError{Field: field, Msg: fmt.Sprintf("must be one line of at most %d characters", max)}
		}
		*dst = v
		return nil
	}
	for _, f := range []error{
		str("host", u.Host, &next.Host, 253),
		str("security", u.Security, &next.Security, 10),
		str("username", u.User, &next.User, 320),
		str("from", u.From, &next.From, 320),
	} {
		if f != nil {
			return nil, f
		}
	}
	if u.Port != nil {
		if s.envSet("port") {
			if *u.Port != cur.Port {
				return nil, &ManagedError{Field: "port", Variable: envVariable["port"]}
			}
		} else {
			next.Port = *u.Port
		}
	}
	if u.Password != nil {
		if s.envSet("password") {
			if *u.Password != "" && *u.Password != cur.Password {
				return nil, &ManagedError{Field: "password", Variable: envVariable["password"]}
			}
		} else {
			if len(*u.Password) > 1000 || strings.ContainsAny(*u.Password, "\r\n\x00") {
				return nil, &InvalidError{Field: "password", Msg: "must be one line"}
			}
			next.Password = *u.Password
		}
	}
	if strings.Contains(next.Host, ":") || strings.ContainsAny(next.Host, " /") {
		return nil, &InvalidError{Field: "host", Msg: "must be a host name without a port (the port is its own field)"}
	}
	if u.Port == nil && next.Port == 0 && next.Host != "" {
		next.Port = 587
	}
	if next.Host != "" || u.Port != nil {
		if next.Port < 1 || next.Port > 65535 {
			return nil, &InvalidError{Field: "port", Msg: "must be from 1 to 65535"}
		}
	}
	switch next.Security {
	case "":
		if next.Host != "" {
			next.Security = config.DefaultSMTPSecurity(next.Port)
		}
	case config.SMTPSecurityTLS, config.SMTPSecurityStartTLS, config.SMTPSecurityNone:
	default:
		return nil, &InvalidError{Field: "security", Msg: "must be tls, starttls or none"}
	}
	if next.From != "" && !config.ValidSMTPFrom(next.From) {
		return nil, &InvalidError{Field: "from", Msg: "must be one address such as todo@example.com or OpenTodo <todo@example.com>"}
	}
	if (next.Host == "") != (next.From == "") {
		if next.Host == "" {
			return nil, &InvalidError{Field: "host", Msg: "is required with a From address"}
		}
		return nil, &InvalidError{Field: "from", Msg: "is required with a host"}
	}
	if next.User != "" && next.Password == "" {
		return nil, &InvalidError{Field: "password", Msg: "is required with a username"}
	}
	if next.Security == config.SMTPSecurityNone && next.User != "" {
		return nil, &InvalidError{Field: "security", Msg: "credentials need tls or starttls; none is only for a relay without a username"}
	}

	var changes []Change
	set := func(field, key string, from, to any) error {
		if s.envSet(field) || fmt.Sprint(from) == fmt.Sprint(to) {
			return nil
		}
		changes = append(changes, Change{Key: key, From: fmt.Sprint(from), To: fmt.Sprint(to)})
		return s.settings.Set(ctx, key, to)
	}
	for _, err := range []error{
		set("host", KeyHost, cur.Host, next.Host),
		set("port", KeyPort, cur.Port, next.Port),
		set("security", KeySecurity, cur.Security, next.Security),
		set("username", KeyUser, cur.User, next.User),
		set("from", KeyFrom, cur.From, next.From),
	} {
		if err != nil {
			return nil, err
		}
	}
	if !s.envSet("password") && next.Password != cur.Password {
		v := next.Password
		if err := s.secrets.Update(map[string]*string{KeyPassword: &v}); err != nil {
			return nil, err
		}
		mark := func(p string) string {
			if p == "" {
				return ""
			}
			return "set"
		}
		changes = append(changes, Change{Key: KeyPassword, From: mark(cur.Password), To: mark(next.Password)})
	}
	return changes, nil
}
