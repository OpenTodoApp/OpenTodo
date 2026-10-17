package httpapi

import (
	"bytes"
	"database/sql"
	"io"
	"mime/quotedprintable"
	"net"
	"net/url"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/mail"
	"github.com/pixari/opentodo/internal/mail/smtptest"
	"github.com/pixari/opentodo/internal/oidc"
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

// testBaseURL is the OPENTODO_BASE_URL of mailEnv: emailed links are built from it only.
const testBaseURL = "http://todo.example.test"

// withBaseURL sets OPENTODO_BASE_URL.
func withBaseURL(raw string) Option {
	return func(s *Server) {
		u, err := url.Parse(raw)
		if err != nil {
			panic(err)
		}
		s.cfg.BaseURL = u
	}
}

// mailEnv is an owner-signed-in environment with outgoing email wired (not yet
// configured) and a base URL, so emailed links can be built.
func mailEnv(t *testing.T, allowSignup bool, opts ...Option) (*env, *smtptest.Server) {
	t.Helper()
	srv := smtptest.New(t, smtptest.Options{User: "todo", Pass: "hunter2"})
	e := newEnvWith(t, allowSignup, append([]Option{withTestMail(srv), withBaseURL(testBaseURL)}, opts...)...)
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
	e.mustStatus(resp, 200, out)
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
	e.mustStatus(resp, 200, out)
	if out["configured"] != true || out["passwordSet"] != true || out["password"] != nil || out["username"] != "todo" {
		t.Fatalf("configured = %v", out)
	}
	resp, out = e.do("GET", "/api/v1/auth/status", nil)
	e.mustStatus(resp, 200, out)
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
	e.mustStatus(resp, 200, out)
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
			t.Fatalf("anonymous %s = %d %v", r[1], resp.StatusCode, out)
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
	e.mustStatus(resp, 200, out)
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
	e.mustStatus(resp, 200, out)
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

func TestSelfServicePasswordReset(t *testing.T) {
	resetMinDuration = 0
	defer func() { resetMinDuration = 200 * time.Millisecond }()
	e, srv := mailEnv(t, false)
	anon := newClientFor(e)
	// Unconfigured: 404 smtp_disabled.
	resp, out := anon.do("POST", "/api/v1/auth/password-reset", map[string]string{"email": "owner@example.com"})
	if resp.StatusCode != 404 || errCode(out) != "smtp_disabled" {
		t.Fatalf("unconfigured = %d %v", resp.StatusCode, out)
	}
	e.configureMail(srv)
	_, secret, _ := e.invite(map[string]any{})
	member := newClientFor(e)
	resp, out = member.do("POST", "/api/v1/auth/register", map[string]string{"email": "m@example.com", "name": "M", "password": "another long password", "invitation": secret})
	member.mustStatus(resp, 201, out)
	memberID := out["user"].(map[string]any)["id"].(string)

	resp, out = anon.do("POST", "/api/v1/auth/password-reset", map[string]string{"email": "nobody@example.com"})
	anon.mustStatus(resp, 202, out)
	neutral := out
	resp, out = anon.do("POST", "/api/v1/auth/password-reset", map[string]string{"email": "M@Example.com"}, "Accept-Language", "de-CH, fr;q=0.8")
	anon.mustStatus(resp, 202, out)
	if !reflect.DeepEqual(out, neutral) {
		t.Fatalf("answers differ: %v vs %v", out, neutral)
	}
	msgs := srv.Messages()
	if len(msgs) != 1 || msgs[0].To[0] != "m@example.com" {
		t.Fatalf("messages = %+v", msgs)
	}
	body := mailBody(t, msgs[0])
	if !strings.Contains(body, "Passwort") || strings.Contains(body, "owner@example.com") {
		t.Fatalf("body = %q", body)
	}
	var actor sql.NullString
	var target string
	e.db.QueryRow(`SELECT actor_id, target_id FROM audit_events WHERE name = 'password.reset_issued'`).Scan(&actor, &target)
	if actor.Valid && actor.String != "" || target != memberID {
		t.Fatalf("reset_issued actor %v target %s", actor, target)
	}
	// The mailed link works through the existing reset routes.
	link := mailLink(t, msgs[0])
	token := link[strings.LastIndex(link, "/")+1:]
	resp, out = anon.do("POST", "/api/v1/password-resets/"+token, map[string]string{"password": "a brand new password"}, "Origin", testBaseURL)
	if resp.StatusCode >= 300 {
		t.Fatalf("use link = %d %v", resp.StatusCode, out)
	}
	resp, out = newClientFor(e).do("POST", "/api/v1/auth/login", map[string]string{"email": "m@example.com", "password": "a brand new password"})
	if resp.StatusCode != 200 {
		t.Fatalf("sign in with new password = %d %v", resp.StatusCode, out)
	}
	// Invalid body.
	resp, out = newClientAt(e, "10.0.0.2").do("POST", "/api/v1/auth/password-reset", map[string]string{"email": "not an address"})
	if resp.StatusCode != 400 || errCode(out) != "invalid_input" {
		t.Fatalf("invalid = %d %v", resp.StatusCode, out)
	}
	// A deactivated account gets nothing.
	resp, out = e.do("POST", "/api/v1/users/"+memberID+"/deactivate", nil)
	e.mustStatus(resp, 200, out)
	before := len(srv.Messages())
	resp, out = newClientAt(e, "10.0.0.3").do("POST", "/api/v1/auth/password-reset", map[string]string{"email": "m@example.com"})
	if resp.StatusCode != 202 || len(srv.Messages()) != before {
		t.Fatalf("deactivated = %d, %d messages (%v)", resp.StatusCode, len(srv.Messages()), out)
	}
}

func TestPasswordResetLimitsAndFailures(t *testing.T) {
	resetMinDuration = 0
	defer func() { resetMinDuration = 200 * time.Millisecond }()
	e, srv := mailEnv(t, false)
	e.configureMail(srv)
	// Six requests for the owner's address from different clients: five messages.
	for i := 0; i < 6; i++ {
		c := newClientAt(e, "10.1.0."+strconv.Itoa(i+1))
		resp, out := c.do("POST", "/api/v1/auth/password-reset", map[string]string{"email": "owner@example.com"})
		c.mustStatus(resp, 202, out)
	}
	if n := len(srv.Messages()); n != 5 {
		t.Fatalf("messages = %d", n)
	}
	var n int
	e.db.QueryRow(`SELECT COUNT(*) FROM audit_events WHERE name = 'email.failed' AND details LIKE '%rate_limited%'`).Scan(&n)
	if n != 1 {
		t.Fatalf("rate_limited events = %d", n)
	}
	// The fifth link still works: the refused sixth request revoked nothing.
	link := mailLink(t, srv.Messages()[4])
	resp, out := newClientFor(e).do("GET", "/api/v1/password-resets/"+link[strings.LastIndex(link, "/")+1:], nil)
	if resp.StatusCode != 200 {
		t.Fatalf("fifth link = %d %v", resp.StatusCode, out)
	}
	// Relay down: still 202, no pending link, the stage recorded.
	resp, out = e.do("PUT", "/api/v1/settings/smtp", map[string]any{"port": closedPort(t)})
	e.mustStatus(resp, 200, out)
	_, secret, _ := e.invite(map[string]any{})
	m := newClientFor(e)
	resp, out = m.do("POST", "/api/v1/auth/register", map[string]string{"email": "m@example.com", "password": "another long password", "invitation": secret})
	m.mustStatus(resp, 201, out)
	resp, out = newClientAt(e, "10.2.0.1").do("POST", "/api/v1/auth/password-reset", map[string]string{"email": "m@example.com"})
	if resp.StatusCode != 202 {
		t.Fatalf("relay down = %d %v", resp.StatusCode, out)
	}
	e.db.QueryRow(`SELECT COUNT(*) FROM password_resets r JOIN users u ON u.id = r.user_id WHERE u.email = 'm@example.com' AND r.revoked_at IS NULL AND r.used_at IS NULL`).Scan(&n)
	if n != 0 {
		t.Fatalf("pending links after failure = %d", n)
	}
	e.db.QueryRow(`SELECT COUNT(*) FROM audit_events WHERE name = 'email.failed' AND details LIKE '%"reason":"connect"%'`).Scan(&n)
	if n != 1 {
		t.Fatalf("connect failures = %d", n)
	}
}

func TestAdminResetSend(t *testing.T) {
	e, srv := mailEnv(t, false)
	_, secret, _ := e.invite(map[string]any{})
	m := newClientFor(e)
	resp, out := m.do("POST", "/api/v1/auth/register", map[string]string{"email": "m@example.com", "password": "another long password", "invitation": secret})
	m.mustStatus(resp, 201, out)
	id := out["user"].(map[string]any)["id"].(string)
	resp, out = e.do("POST", "/api/v1/users/"+id+"/password-reset", map[string]any{"send": true})
	if resp.StatusCode != 409 || errCode(out) != "smtp_disabled" {
		t.Fatalf("unconfigured send = %d %v", resp.StatusCode, out)
	}
	e.configureMail(srv)
	resp, out = e.do("POST", "/api/v1/users/"+id+"/password-reset", map[string]any{"send": true})
	e.mustStatus(resp, 201, out)
	if out["sent"] != true || out["link"] != nil || out["expiresAt"] == nil {
		t.Fatalf("sent = %v", out)
	}
	if msgs := srv.Messages(); len(msgs) != 1 || msgs[0].To[0] != "m@example.com" {
		t.Fatalf("messages = %+v", msgs)
	}
	// A send failure revokes the new link and answers 502.
	resp, out = e.do("PUT", "/api/v1/settings/smtp", map[string]any{"password": "wrong"})
	e.mustStatus(resp, 200, out)
	resp, out = e.do("POST", "/api/v1/users/"+id+"/password-reset", map[string]any{"send": true})
	if resp.StatusCode != 502 || errCode(out) != "email_failed" {
		t.Fatalf("failed send = %d %v", resp.StatusCode, out)
	}
	var n int
	e.db.QueryRow(`SELECT COUNT(*) FROM password_resets WHERE user_id = ? AND revoked_at IS NULL AND used_at IS NULL`, id).Scan(&n)
	if n != 0 {
		t.Fatalf("pending = %d", n)
	}
	// Without send the link variant is unchanged.
	resp, out = e.do("POST", "/api/v1/users/"+id+"/password-reset", nil)
	e.mustStatus(resp, 201, out)
	if out["link"] == nil {
		t.Fatalf("link variant = %v", out)
	}
}

func TestPasswordResetTiming(t *testing.T) {
	e, srv := mailEnv(t, false)
	e.configureMail(srv)
	timed := func(ip, email string) time.Duration {
		start := time.Now()
		resp, out := newClientAt(e, ip).do("POST", "/api/v1/auth/password-reset", map[string]string{"email": email})
		e.mustStatus(resp, 202, out)
		return time.Since(start)
	}
	known, unknown := timed("10.3.0.1", "owner@example.com"), timed("10.3.0.2", "nobody@example.com")
	if known < resetMinDuration || unknown < resetMinDuration {
		t.Fatalf("answered before the minimum: known %v unknown %v", known, unknown)
	}
	if d := known - unknown; d > 150*time.Millisecond || d < -150*time.Millisecond {
		t.Fatalf("timing differs: known %v unknown %v", known, unknown)
	}
}

func TestPasswordResetSSOOnlySendsNothing(t *testing.T) {
	resetMinDuration = 0
	defer func() { resetMinDuration = 200 * time.Millisecond }()
	ssoOnly := false
	srv := smtptest.New(t, smtptest.Options{User: "todo", Pass: "hunter2"})
	e := newEnvWith(t, false, withTestMail(srv), withBaseURL(testBaseURL), func(s *Server) {
		s.oidc = oidc.New(settings.New(s.sync.DB()), s.cfg.DataDir, oidc.Options{Env: oidc.Env{Issuer: "https://idp.example", ClientID: "c", SSOOnly: &ssoOnly}})
	})
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	e.configureMail(srv)
	ssoOnly = true
	resp, out = newClientAt(e, "10.4.0.1").do("POST", "/api/v1/auth/password-reset", map[string]string{"email": "owner@example.com"})
	if resp.StatusCode != 202 || len(srv.Messages()) != 0 {
		t.Fatalf("SSO-only = %d, %d messages (%v)", resp.StatusCode, len(srv.Messages()), out)
	}
}

func TestVerifiedOpenSignup(t *testing.T) {
	e, srv := mailEnv(t, true)
	e.configureMail(srv)
	visitor := newClientAt(e, "10.5.0.1")
	resp, out := visitor.do("POST", "/api/v1/auth/register", map[string]string{"email": "New@Example.com", "name": "New", "password": "a long enough password"},
		"Origin", testBaseURL, "Accept-Language", "fr")
	visitor.mustStatus(resp, 202, out)
	if out["verificationRequired"] != true || hasCookie(resp, sessionCookie) {
		t.Fatalf("register = %v", out)
	}
	var n int
	e.db.QueryRow(`SELECT COUNT(*) FROM users WHERE email = 'new@example.com'`).Scan(&n)
	if n != 0 {
		t.Fatal("account created before verification")
	}
	msgs := srv.Messages()
	if len(msgs) != 1 || msgs[0].To[0] != "new@example.com" || !strings.Contains(mailBody(t, msgs[0]), "inscription") {
		t.Fatalf("messages = %+v", msgs)
	}
	link := mailLink(t, msgs[0])
	token := link[strings.LastIndex(link, "/")+1:]
	if !strings.Contains(link, "/verify/otv_") {
		t.Fatalf("link = %s", link)
	}
	// The preview never creates the account (a scanner fetching the link).
	resp, out = visitor.do("GET", "/api/v1/auth/verify/"+token, nil)
	visitor.mustStatus(resp, 200, out)
	if out["email"] != "new@example.com" {
		t.Fatalf("preview = %v", out)
	}
	e.db.QueryRow(`SELECT COUNT(*) FROM users WHERE email = 'new@example.com'`).Scan(&n)
	if n != 0 {
		t.Fatal("preview created the account")
	}
	resp, out = visitor.do("POST", "/api/v1/auth/verify/"+token, nil, "Origin", testBaseURL)
	visitor.mustStatus(resp, 201, out)
	if !hasCookie(resp, sessionCookie) || out["user"].(map[string]any)["role"] != "member" {
		t.Fatalf("complete = %v", out)
	}
	e.db.QueryRow(`SELECT COUNT(*) FROM audit_events WHERE name = 'login.succeeded' AND details LIKE '%"method":"register"%' AND details LIKE '%new@example.com%'`).Scan(&n)
	if n != 1 {
		t.Fatalf("login.succeeded = %d", n)
	}
	// Used, unknown: the same 404.
	for _, tok := range []string{token, "otv_unknown"} {
		resp, out = visitor.do("POST", "/api/v1/auth/verify/"+tok, nil, "Origin", testBaseURL)
		if resp.StatusCode != 404 || errCode(out) != "verification_invalid" {
			t.Fatalf("%s = %d %v", tok, resp.StatusCode, out)
		}
	}
	// An address with an account: the same 202, the other message, nothing stored.
	other := newClientAt(e, "10.5.0.2")
	resp, out = other.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "password": "a long enough password"}, "Origin", testBaseURL)
	other.mustStatus(resp, 202, out)
	msgs = srv.Messages()
	last := mailBody(t, msgs[len(msgs)-1])
	if !strings.Contains(last, "already has an account") || linkRe.MatchString(last) {
		t.Fatalf("existing message = %q", last)
	}
	e.db.QueryRow(`SELECT COUNT(*) FROM signup_verifications`).Scan(&n)
	if n != 0 {
		t.Fatalf("pending rows = %d", n)
	}
	// Invitations skip verification even with mail configured.
	_, secret, _ := e.invite(map[string]any{})
	inv := newClientAt(e, "10.5.0.3")
	resp, out = inv.do("POST", "/api/v1/auth/register", map[string]string{"email": "invited@example.com", "password": "a long enough password", "invitation": secret}, "Origin", testBaseURL)
	inv.mustStatus(resp, 201, out)
}

func TestOpenSignupWithoutMailUnchanged(t *testing.T) {
	e, _ := mailEnv(t, true)
	c := newClientAt(e, "10.6.0.1")
	resp, out := c.do("POST", "/api/v1/auth/register", map[string]string{"email": "direct@example.com", "password": "a long enough password"}, "Origin", testBaseURL)
	c.mustStatus(resp, 201, out)
	resp, out = newClientAt(e, "10.6.0.2").do("POST", "/api/v1/auth/register", map[string]string{"email": "direct@example.com", "password": "a long enough password"}, "Origin", testBaseURL)
	if resp.StatusCode != 409 || errCode(out) != "email_taken" {
		t.Fatalf("duplicate = %d %v", resp.StatusCode, out)
	}
}

func TestVerifyRateLimit(t *testing.T) {
	e, _ := mailEnv(t, true)
	c := newClientAt(e, "10.7.0.1")
	var last int
	for i := 0; i < 11; i++ {
		resp, _ := c.do("GET", "/api/v1/auth/verify/otv_x", nil)
		last = resp.StatusCode
	}
	if last != 429 {
		t.Fatalf("eleventh = %d", last)
	}
}

func TestInvitationsSentByEmail(t *testing.T) {
	e, srv := mailEnv(t, false)
	// Unconfigured: 409 and nothing created.
	resp, out := e.do("POST", "/api/v1/invitations", map[string]any{"email": "bob@example.com", "send": true})
	if resp.StatusCode != 409 || errCode(out) != "smtp_disabled" {
		t.Fatalf("unconfigured = %d %v", resp.StatusCode, out)
	}
	var n int
	e.db.QueryRow(`SELECT COUNT(*) FROM invitations`).Scan(&n)
	if n != 0 {
		t.Fatal("invitation created while unconfigured")
	}
	e.configureMail(srv)
	resp, out = e.do("POST", "/api/v1/invitations", map[string]any{"send": true})
	if resp.StatusCode != 400 || errCode(out) != "invalid_input" {
		t.Fatalf("no email = %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("POST", "/api/v1/invitations", map[string]any{"email": "bob@example.com", "send": true}, "Accept-Language", "it")
	e.mustStatus(resp, 201, out)
	if out["sent"] != true || out["link"] == nil {
		t.Fatalf("sent = %v", out)
	}
	msgs := srv.Messages()
	body := mailBody(t, msgs[len(msgs)-1])
	if msgs[len(msgs)-1].To[0] != "bob@example.com" || !strings.Contains(body, "Owner ha invitato bob@example.com") || strings.Contains(body, "owner@example.com") {
		t.Fatalf("invitation message = %q", body)
	}
	if mailLink(t, msgs[len(msgs)-1]) != out["link"] {
		t.Fatalf("mailed link differs from the returned one")
	}
	e.db.QueryRow(`SELECT COUNT(*) FROM audit_events WHERE name IN ('invitation.created','email.sent')`).Scan(&n)
	if n < 2 {
		t.Fatalf("audit = %d", n)
	}
	// A failing relay revokes the invitation and answers 502.
	resp, out = e.do("PUT", "/api/v1/settings/smtp", map[string]any{"password": "wrong"})
	e.mustStatus(resp, 200, out)
	resp, out = e.do("POST", "/api/v1/invitations", map[string]any{"email": "carol@example.com", "send": true})
	if resp.StatusCode != 502 || errCode(out) != "email_failed" {
		t.Fatalf("failing = %d %v", resp.StatusCode, out)
	}
	e.db.QueryRow(`SELECT COUNT(*) FROM invitations WHERE email = 'carol@example.com' AND revoked_at IS NULL`).Scan(&n)
	if n != 0 {
		t.Fatal("pending invitation after a failed send")
	}
}

func TestProjectInviteSentByEmail(t *testing.T) {
	e, srv := mailEnv(t, false)
	e.configureMail(srv)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Secret plans"})
	e.mustStatus(resp, 201, out)
	pid := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/projects/"+pid+"/invites", map[string]any{"role": "editor", "email": "bob@example.com", "send": true})
	e.mustStatus(resp, 201, out)
	if out["sent"] != true || out["link"] == nil {
		t.Fatalf("sent = %v", out)
	}
	msgs := srv.Messages()
	body := mailBody(t, msgs[len(msgs)-1])
	if !strings.Contains(body, "as editor") || strings.Contains(body, "Secret plans") || !strings.Contains(body, "/invite/p/") {
		t.Fatalf("project invite message = %q", body)
	}
	resp, out = e.do("POST", "/api/v1/projects/"+pid+"/invites", map[string]any{"role": "editor", "send": true})
	if resp.StatusCode != 400 {
		t.Fatalf("no email = %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("PUT", "/api/v1/settings/smtp", map[string]any{"port": closedPort(t)})
	e.mustStatus(resp, 200, out)
	resp, out = e.do("POST", "/api/v1/projects/"+pid+"/invites", map[string]any{"role": "viewer", "email": "carol@example.com", "send": true})
	if resp.StatusCode != 502 || errCode(out) != "email_failed" {
		t.Fatalf("failing = %d %v", resp.StatusCode, out)
	}
	var n int
	e.db.QueryRow(`SELECT COUNT(*) FROM project_invites WHERE email = 'carol@example.com' AND revoked_at IS NULL`).Scan(&n)
	if n != 0 {
		t.Fatal("pending project invite after a failed send")
	}
}

// closedPort is a local port nothing listens on (a refused connection).
func closedPort(t *testing.T) int {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	p := ln.Addr().(*net.TCPAddr).Port
	ln.Close()
	return p
}
