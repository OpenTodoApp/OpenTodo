package httpapi

import (
	"bytes"
	"io"
	"mime/quotedprintable"
	"regexp"
	"strings"
	"testing"

	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/mail"
	"github.com/pixari/opentodo/internal/mail/smtptest"
	"github.com/pixari/opentodo/internal/settings"
)

// withTestMail wires a mail service whose transport trusts srv's certificate.
func withTestMail(srv *smtptest.Server) Option {
	return func(s *Server) {
		tr := &mail.Transport{}
		if srv != nil {
			tr.RootCAs = srv.RootCAs()
		}
		s.mail = mail.New(settings.New(s.sync.DB()), s.cfg.DataDir, mail.Options{Audit: s.audit, Log: s.log, Transport: tr})
	}
}

// mailEnv is an owner-signed-in environment with outgoing email wired (not yet configured).
func mailEnv(t *testing.T, allowSignup bool) (*env, *smtptest.Server) {
	t.Helper()
	srv := smtptest.New(t, smtptest.Options{User: "todo", Pass: "hunter2"})
	e := newEnvWith(t, allowSignup, withTestMail(srv))
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	return e, srv
}

func (e *env) configureMail(srv *smtptest.Server) {
	e.t.Helper()
	resp, out := e.do("PUT", "/api/v1/settings/smtp", map[string]any{"host": srv.Host, "port": srv.Port, "security": "starttls",
		"username": "todo", "password": "hunter2", "from": "OpenTodo <todo@example.com>"})
	e.mustStatus(resp, 200, out)
}

// mailBody decodes the quoted-printable body of a received message.
func mailBody(t *testing.T, m smtptest.Message) string {
	t.Helper()
	data := bytes.ReplaceAll(m.Data, []byte("\r\n"), []byte("\n"))
	_, body, _ := bytes.Cut(data, []byte("\n\n"))
	plain, err := io.ReadAll(quotedprintable.NewReader(bytes.NewReader(body)))
	if err != nil {
		t.Fatal(err)
	}
	return strings.ReplaceAll(string(plain), "\r\n", "\n")
}

var linkRe = regexp.MustCompile(`https?://\S+/(reset|invite|verify|join)/\S+`)

func mailLink(t *testing.T, m smtptest.Message) string {
	t.Helper()
	l := linkRe.FindString(mailBody(t, m))
	if l == "" {
		t.Fatalf("no link in %q", mailBody(t, m))
	}
	return l
}

func TestSMTPSettingsRoutes(t *testing.T) {
	e, srv := mailEnv(t, false)
	resp, out := e.do("GET", "/api/v1/auth/status", nil)
	if out["outgoingEmail"].(map[string]any)["enabled"] != false {
		t.Fatalf("status = %v", out["outgoingEmail"])
	}
	resp, out = e.do("GET", "/api/v1/settings/smtp", nil)
	e.mustStatus(resp, 200, out)
	if out["configured"] != false || out["passwordSet"] != false {
		t.Fatalf("empty = %v", out)
	}
	resp, out = e.do("POST", "/api/v1/settings/smtp/test", nil)
	if resp.StatusCode != 404 || errCode(out) != "smtp_disabled" {
		t.Fatalf("test while unconfigured = %d %v", resp.StatusCode, out)
	}
	// Invalid values are refused naming the field, and nothing is stored.
	for _, body := range []map[string]any{
		{"host": "h", "from": "a@b.c", "port": 0},
		{"host": "h", "from": "a@b.c", "security": "ssl"},
		{"host": "h", "from": "a@b.c, d@e.f"},
		{"host": "h", "from": "a@b.c", "username": "u"},
		{"host": "h", "from": "a@b.c", "username": "u", "password": "p", "security": "none"},
	} {
		resp, out = e.do("PUT", "/api/v1/settings/smtp", body)
		if resp.StatusCode != 400 || errCode(out) != "invalid_input" {
			t.Fatalf("%v = %d %v", body, resp.StatusCode, out)
		}
	}
	e.configureMail(srv)
	resp, out = e.do("GET", "/api/v1/settings/smtp", nil)
	if out["configured"] != true || out["passwordSet"] != true || out["password"] != nil || out["username"] != "todo" {
		t.Fatalf("configured = %v", out)
	}
	resp, out = e.do("GET", "/api/v1/auth/status", nil)
	if out["outgoingEmail"].(map[string]any)["enabled"] != true {
		t.Fatalf("status = %v", out["outgoingEmail"])
	}
	// A settings.changed per field; the password entry says only "set".
	var n int
	e.db.QueryRow(`SELECT COUNT(*) FROM audit_events WHERE name = 'settings.changed' AND details LIKE '%smtp.%'`).Scan(&n)
	var pw string
	e.db.QueryRow(`SELECT details FROM audit_events WHERE details LIKE '%smtp.password%'`).Scan(&pw)
	if n != 6 || strings.Contains(pw, "hunter2") || !strings.Contains(pw, `"to":"set"`) {
		t.Fatalf("audit: %d entries, password entry %s", n, pw)
	}

	// Test message delivered to the owner, in the browser's language.
	resp, out = e.do("POST", "/api/v1/settings/smtp/test", nil, "Accept-Language", "it-IT,it;q=0.9")
	e.mustStatus(resp, 200, out)
	if out["outcome"] != "sent" {
		t.Fatalf("test = %v", out)
	}
	msgs := srv.Messages()
	if len(msgs) != 1 || msgs[0].To[0] != "owner@example.com" || !strings.Contains(mailBody(t, msgs[0]), "messaggio di prova") {
		t.Fatalf("received %+v", msgs)
	}
	resp, out = e.do("GET", "/api/v1/settings/smtp", nil)
	if lt, _ := out["lastTest"].(map[string]any); lt["outcome"] != "sent" {
		t.Fatalf("lastTest = %v", out["lastTest"])
	}
	// Wrong password: a failed outcome at stage auth, recorded.
	resp, out = e.do("PUT", "/api/v1/settings/smtp", map[string]any{"password": "wrong"})
	e.mustStatus(resp, 200, out)
	resp, out = e.do("POST", "/api/v1/settings/smtp/test", nil)
	e.mustStatus(resp, 200, out)
	if out["outcome"] != "failed" || out["stage"] != "auth" || !strings.HasPrefix(out["reply"].(string), "535") {
		t.Fatalf("auth failure = %v", out)
	}
	e.db.QueryRow(`SELECT COUNT(*) FROM audit_events WHERE name = 'email.failed' AND details LIKE '%"reason":"auth"%'`).Scan(&n)
	if n != 1 || len(srv.Messages()) != 1 {
		t.Fatalf("failed audit %d, messages %d", n, len(srv.Messages()))
	}
	// Five tests per ten minutes.
	for i := 0; i < 3; i++ {
		e.do("POST", "/api/v1/settings/smtp/test", nil)
	}
	resp, out = e.do("POST", "/api/v1/settings/smtp/test", nil)
	if resp.StatusCode != 429 || errCode(out) != "rate_limited" {
		t.Fatalf("sixth test = %d %v", resp.StatusCode, out)
	}
	// Removing the password (and the username) is recorded as unset.
	resp, out = e.do("PUT", "/api/v1/settings/smtp", map[string]any{"username": "", "password": ""})
	e.mustStatus(resp, 200, out)
	if out["passwordSet"] != false {
		t.Fatalf("after unset = %v", out)
	}
	// Anonymous and non-owners see nothing.
	anon := newClientFor(e)
	for _, r := range [][2]string{{"GET", "/api/v1/settings/smtp"}, {"PUT", "/api/v1/settings/smtp"}, {"POST", "/api/v1/settings/smtp/test"}} {
		resp, out = anon.do(r[0], r[1], map[string]any{})
		if resp.StatusCode != 401 {
			t.Fatalf("anonymous %s = %d", r[1], resp.StatusCode)
		}
	}
	_, secret, _ := e.invite(map[string]any{})
	member := newClientFor(e)
	resp, out = member.do("POST", "/api/v1/auth/register", map[string]string{"email": "m@example.com", "password": "another long password", "invitation": secret})
	member.mustStatus(resp, 201, out)
	for _, r := range [][2]string{{"GET", "/api/v1/settings/smtp"}, {"PUT", "/api/v1/settings/smtp"}, {"POST", "/api/v1/settings/smtp/test"}} {
		resp, out = member.do(r[0], r[1], map[string]any{})
		if resp.StatusCode != 403 || out["host"] != nil {
			t.Fatalf("member %s = %d %v", r[1], resp.StatusCode, out)
		}
	}
	// An API token of the owner cannot read the configuration.
	resp, out = e.do("POST", "/api/v1/tokens", map[string]any{"name": "script"})
	e.mustStatus(resp, 201, out)
	tok := out["secret"].(string)
	resp, out = anon.do("GET", "/api/v1/settings/smtp", nil, "Authorization", "Bearer "+tok)
	if resp.StatusCode != 403 {
		t.Fatalf("token read = %d %v", resp.StatusCode, out)
	}
}

func TestSMTPManagedByEnvironment(t *testing.T) {
	srv := smtptest.New(t, smtptest.Options{})
	e := newEnvWith(t, false, func(s *Server) {
		s.mail = mail.New(settings.New(s.sync.DB()), s.cfg.DataDir, mail.Options{Audit: s.audit, Log: s.log,
			Env: configSMTP(srv.Host, srv.Port), Transport: &mail.Transport{RootCAs: srv.RootCAs()}})
	})
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("GET", "/api/v1/settings/smtp", nil)
	if mb := out["managedBy"].(map[string]any); mb["host"] != "env" || mb["username"] != "settings" {
		t.Fatalf("managedBy = %v", mb)
	}
	resp, out = e.do("PUT", "/api/v1/settings/smtp", map[string]any{"host": "other.example.com"})
	if resp.StatusCode != 409 || errCode(out) != "managed_by_env" || !strings.Contains(out["error"].(map[string]any)["message"].(string), "OPENTODO_SMTP_HOST") {
		t.Fatalf("locked = %d %v", resp.StatusCode, out)
	}
}

func TestOutgoingEmailOffOnDemoAndUnwired(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("GET", "/api/v1/auth/status", nil)
	if out["outgoingEmail"].(map[string]any)["enabled"] != false {
		t.Fatalf("unwired status = %v", out)
	}
	resp, out = e.do("GET", "/api/v1/settings/smtp", nil)
	if resp.StatusCode != 404 || errCode(out) != "smtp_disabled" {
		t.Fatalf("unwired settings = %d %v", resp.StatusCode, out)
	}
}

func configSMTP(host string, port int) config.SMTPConfig {
	return config.SMTPConfig{Host: host, Port: port, Security: "starttls", From: "todo@example.com"}
}
