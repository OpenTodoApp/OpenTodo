package mail

import (
	"context"
	"database/sql"
	"errors"
	"io"
	"mime"
	"mime/quotedprintable"
	"net"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/mail/smtptest"
	"github.com/pixari/opentodo/internal/settings"
	"github.com/pixari/opentodo/internal/store"
)

func newService(t *testing.T, env config.SMTPConfig, tr Sender) (*Service, *sql.DB, string) {
	t.Helper()
	dir := t.TempDir()
	db, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return New(settings.New(db), dir, Options{Env: env, Audit: audit.New(db, nil), Transport: tr}), db, dir
}

func ptr[T any](v T) *T { return &v }

func TestSaveAndConfig(t *testing.T) {
	s, db, dir := newService(t, config.SMTPConfig{}, nil)
	ctx := context.Background()
	if s.Enabled(ctx) {
		t.Fatal("enabled without configuration")
	}
	changes, err := s.Save(ctx, Update{Host: ptr("smtp.example.com"), Port: ptr(587), Security: ptr("starttls"),
		User: ptr("todo"), Password: ptr("hunter2"), From: ptr("OpenTodo <todo@example.com>")})
	if err != nil {
		t.Fatal(err)
	}
	keys := map[string]Change{}
	for _, c := range changes {
		keys[c.Key] = c
	}
	if len(keys) != 6 || keys[KeyPassword].To != "set" || keys[KeyPassword].From != "" {
		t.Fatalf("changes = %+v", changes)
	}
	c, _ := s.Config(ctx)
	if !c.Enabled() || c.Password != "hunter2" || c.ManagedBy["host"] != "settings" {
		t.Fatalf("config = %+v", c)
	}
	// The password never reaches the database; it lives under <data>/secrets.
	var n int
	db.QueryRow(`SELECT COUNT(*) FROM settings WHERE value LIKE '%hunter2%' OR key = ?`, KeyPassword).Scan(&n)
	if n != 0 {
		t.Fatal("password in the settings table")
	}
	if rel, _ := filepath.Rel(dir, s.SecretsPath()); !strings.HasPrefix(rel, settings.SecretsDir+string(filepath.Separator)) {
		t.Fatalf("secrets path %s", s.SecretsPath())
	}
	raw, _ := os.ReadFile(s.SecretsPath())
	if !strings.Contains(string(raw), "hunter2") {
		t.Fatal("password not in the secrets file")
	}
	// Removing the password is recorded as unset; then the username needs one.
	if _, err := s.Save(ctx, Update{Password: ptr("")}); err == nil {
		t.Fatal("username without password accepted")
	}
	changes, err = s.Save(ctx, Update{User: ptr(""), Password: ptr("")})
	if err != nil || len(changes) != 2 {
		t.Fatalf("unset = %+v %v", changes, err)
	}
	for _, ch := range changes {
		if ch.Key == KeyPassword && (ch.From != "set" || ch.To != "") {
			t.Fatalf("unset change = %+v", ch)
		}
	}
}

func TestSaveValidation(t *testing.T) {
	s, _, _ := newService(t, config.SMTPConfig{}, nil)
	ctx := context.Background()
	for _, tc := range []struct {
		u     Update
		field string
	}{
		{Update{Host: ptr("h"), From: ptr("a@b.c"), Port: ptr(70000)}, "port"},
		{Update{Host: ptr("h"), From: ptr("a@b.c"), Security: ptr("ssl")}, "security"},
		{Update{Host: ptr("h"), From: ptr("a@b.c, d@e.f")}, "from"},
		{Update{Host: ptr("h"), From: ptr("a@b.c"), User: ptr("u")}, "password"},
		{Update{Host: ptr("h"), From: ptr("a@b.c"), User: ptr("u"), Password: ptr("p"), Security: ptr("none")}, "security"},
		{Update{Host: ptr("h")}, "from"},
		{Update{Host: ptr("h:25"), From: ptr("a@b.c")}, "host"},
	} {
		_, err := s.Save(ctx, tc.u)
		var ie *InvalidError
		if !errors.As(err, &ie) || ie.Field != tc.field {
			t.Errorf("%+v: err = %v, want field %s", tc.u, err, tc.field)
		}
	}
	if c, _ := s.Config(ctx); c.Host != "" {
		t.Fatalf("stored after refusals: %+v", c)
	}
}

func TestEnvironmentWinsAndLocks(t *testing.T) {
	env := config.SMTPConfig{Host: "relay.internal", Port: 25, Security: "none", From: "todo@example.com"}
	s, _, _ := newService(t, env, nil)
	ctx := context.Background()
	c, _ := s.Config(ctx)
	if !c.Enabled() || c.ManagedBy["host"] != "env" || c.ManagedBy["from"] != "env" || c.ManagedBy["username"] != "settings" {
		t.Fatalf("config = %+v", c)
	}
	_, err := s.Save(ctx, Update{Host: ptr("other.example.com")})
	var me *ManagedError
	if !errors.As(err, &me) || me.Variable != "OPENTODO_SMTP_HOST" {
		t.Fatalf("err = %v", err)
	}
	// Sending the env value back unchanged is not a change.
	if ch, err := s.Save(ctx, Update{Host: ptr("relay.internal"), From: ptr("todo@example.com")}); err != nil || len(ch) != 0 {
		t.Fatalf("unchanged = %+v %v", ch, err)
	}
}

func TestTransportStages(t *testing.T) {
	ctx := context.Background()
	msg := []byte("Subject: hi\r\n\r\nbody\r\n")
	cfg := func(srv *smtptest.Server, sec, user, pass string) Config {
		return Config{Host: srv.Host, Port: srv.Port, Security: sec, User: user, Password: pass, From: "OpenTodo <todo@example.com>"}
	}
	t.Run("starttls with PLAIN", func(t *testing.T) {
		srv := smtptest.New(t, smtptest.Options{User: "u", Pass: "p"})
		tr := &Transport{RootCAs: srv.RootCAs()}
		if err := tr.Send(ctx, cfg(srv, "starttls", "u", "p"), "bob@example.com", msg); err != nil {
			t.Fatal(err)
		}
		m := srv.Messages()
		if len(m) != 1 || m[0].From != "todo@example.com" || m[0].To[0] != "bob@example.com" || !m[0].TLS || m[0].AuthUser != "u" {
			t.Fatalf("got %+v", m)
		}
	})
	t.Run("implicit tls with LOGIN only", func(t *testing.T) {
		srv := smtptest.New(t, smtptest.Options{ImplicitTLS: true, AuthMechs: []string{"LOGIN"}, User: "u", Pass: "p"})
		tr := &Transport{RootCAs: srv.RootCAs()}
		if err := tr.Send(ctx, cfg(srv, "tls", "u", "p"), "bob@example.com", msg); err != nil {
			t.Fatal(err)
		}
		if m := srv.Messages(); len(m) != 1 || m[0].AuthUser != "u" {
			t.Fatalf("got %+v", m)
		}
	})
	t.Run("no STARTTLS means no credentials", func(t *testing.T) {
		srv := smtptest.New(t, smtptest.Options{NoSTARTTLS: true})
		tr := &Transport{RootCAs: srv.RootCAs()}
		err := tr.Send(ctx, cfg(srv, "starttls", "u", "p"), "bob@example.com", msg)
		var se *SendError
		if !errors.As(err, &se) || se.Stage != StageTLS || !strings.Contains(se.Reply, "STARTTLS") {
			t.Fatalf("err = %v", err)
		}
		if srv.AuthWithoutTLS() != 0 || len(srv.Messages()) != 0 {
			t.Fatal("credentials or message sent without TLS")
		}
	})
	t.Run("untrusted certificate", func(t *testing.T) {
		srv := smtptest.New(t, smtptest.Options{})
		err := (&Transport{}).Send(ctx, cfg(srv, "starttls", "", ""), "bob@example.com", msg)
		var se *SendError
		if !errors.As(err, &se) || se.Stage != StageTLS {
			t.Fatalf("err = %v", err)
		}
	})
	t.Run("wrong password", func(t *testing.T) {
		srv := smtptest.New(t, smtptest.Options{User: "u", Pass: "p"})
		err := (&Transport{RootCAs: srv.RootCAs()}).Send(ctx, cfg(srv, "starttls", "u", "wrong"), "bob@example.com", msg)
		var se *SendError
		if !errors.As(err, &se) || se.Stage != StageAuth || !strings.HasPrefix(se.Reply, "535") {
			t.Fatalf("err = %v", err)
		}
		if len(srv.Messages()) != 0 {
			t.Fatal("message sent after a failed sign-in")
		}
	})
	t.Run("plaintext relay without credentials", func(t *testing.T) {
		srv := smtptest.New(t, smtptest.Options{NoSTARTTLS: true, NoAuth: true})
		if err := (&Transport{}).Send(ctx, cfg(srv, "none", "", ""), "bob@example.com", msg); err != nil {
			t.Fatal(err)
		}
		if m := srv.Messages(); len(m) != 1 || m[0].TLS {
			t.Fatalf("got %+v", m)
		}
	})
	t.Run("plaintext with credentials refused", func(t *testing.T) {
		srv := smtptest.New(t, smtptest.Options{NoSTARTTLS: true})
		err := (&Transport{}).Send(ctx, cfg(srv, "none", "u", "p"), "bob@example.com", msg)
		var se *SendError
		if !errors.As(err, &se) || srv.AuthWithoutTLS() != 0 {
			t.Fatalf("err = %v", err)
		}
	})
	t.Run("connection refused", func(t *testing.T) {
		ln, _ := net.Listen("tcp", "127.0.0.1:0")
		port := ln.Addr().(*net.TCPAddr).Port
		ln.Close()
		err := (&Transport{}).Send(ctx, Config{Host: "127.0.0.1", Port: port, Security: "starttls", From: "a@b.c"}, "x@y.z", msg)
		var se *SendError
		if !errors.As(err, &se) || se.Stage != StageConnect {
			t.Fatalf("err = %v", err)
		}
	})
	t.Run("silent server times out at connect", func(t *testing.T) {
		srv := smtptest.New(t, smtptest.Options{Silent: true})
		start := time.Now()
		err := (&Transport{Timeout: 300 * time.Millisecond}).Send(ctx, cfg(srv, "starttls", "", ""), "x@y.z", msg)
		var se *SendError
		if !errors.As(err, &se) || se.Stage != StageConnect || se.Reply != "timed out" {
			t.Fatalf("err = %v", err)
		}
		if time.Since(start) > 2*time.Second {
			t.Fatalf("took %v", time.Since(start))
		}
	})
}

func TestLangFrom(t *testing.T) {
	for h, want := range map[string]string{"de-CH, fr;q=0.8": "de", "ja": "en", "": "en", "ja, it;q=0.5": "it",
		"fr;q=0.3, pt-BR;q=0.9": "pt", "es;q=0, en": "en", "EN-gb": "en"} {
		if got := LangFrom(h); got != want {
			t.Errorf("LangFrom(%q) = %s, want %s", h, got, want)
		}
	}
}

func TestTemplatesEveryKindAndLanguage(t *testing.T) {
	link := "https://todo.example.com/reset/otr_SECRET"
	for _, lang := range Languages {
		for _, kind := range Kinds {
			for _, existing := range []bool{false, true} {
				if existing && kind != KindVerifySignup {
					continue
				}
				m := Message{Kind: kind, To: "bob@example.com", Lang: lang, Origin: "https://todo.example.com",
					Vars: Vars{Link: link, Expiry: 24 * time.Hour, Inviter: "Alice", Role: "editor", Existing: existing}}
				subj, body, err := Render(m, m.Origin)
				if err != nil {
					t.Fatalf("%s %s: %v", kind, lang, err)
				}
				if subj == "" || strings.Contains(subj, "{{") || strings.Contains(body, "{{") || !strings.Contains(body, "https://todo.example.com") {
					t.Fatalf("%s %s: %q / %q", kind, lang, subj, body)
				}
				withLink := kind != KindTest && kind != KindEmailChangeNotice && !existing
				if strings.Contains(body, "\n"+link+"\n") != withLink {
					t.Fatalf("%s %s: link on its own line = %v", kind, lang, !withLink)
				}
				if withLink && kind != KindDigest && !strings.Contains(body, "24 ") {
					t.Fatalf("%s %s: no expiry: %q", kind, lang, body)
				}
				if kind == KindInvitation && !strings.Contains(body, "Alice") {
					t.Fatalf("%s %s: no inviter", kind, lang)
				}
			}
		}
	}
	// The German reset is in German and the link is unchanged.
	_, body, _ := Render(Message{Kind: KindPasswordReset, To: "a@b.c", Lang: LangFrom("de-CH, fr;q=0.8"), Vars: Vars{Link: link, Expiry: 24 * time.Hour}}, "https://todo.example.com")
	if !strings.Contains(body, "Passwort") || !strings.Contains(body, link) || !strings.Contains(body, "24 Stunden") {
		t.Fatalf("german reset: %q", body)
	}
	if got := formatExpiry(7*24*time.Hour, "en"); got != "7 days" {
		t.Fatalf("7 days = %q", got)
	}
}

// The values a template can see are only the ones the design allows: no field
// of a transactional message could carry a task, project, label or comment.
// Only the weekly digest (stats-and-review) carries content, and only it may use
// the digest placeholders.
func TestTemplateVariablesCarryNoContent(t *testing.T) {
	var got []string
	ty := reflect.TypeOf(templateData{})
	for i := 0; i < ty.NumField(); i++ {
		got = append(got, ty.Field(i).Name)
	}
	if strings.Join(got, ",") != "Origin,Email,Link,Expiry,Inviter,Role,digest" {
		t.Fatalf("template variables changed: %v", got)
	}
	for _, k := range Kinds {
		if carriesContent[k] != (k == KindDigest) {
			t.Fatalf("%s carries content = %v", k, carriesContent[k])
		}
	}
	for name, text := range templates {
		if strings.HasPrefix(name, "digest.") {
			continue
		}
		for _, f := range digestPlaceholders {
			if strings.Contains(text, "{{."+f+"}}") {
				t.Fatalf("%s uses the digest placeholder %s", name, f)
			}
		}
	}
}

func TestAssemble(t *testing.T) {
	data, err := Assemble("OpenTodo <todo@example.com>", "bob@example.com", "Setze dein Passwort zurück", "Zeile mit Umlaut ä\nhttps://x.example/reset/otr_abc\n", "https://todo.example.com", time.Unix(0, 0))
	if err != nil {
		t.Fatal(err)
	}
	head, body, _ := strings.Cut(string(data), "\r\n\r\n")
	for _, h := range []string{"Auto-Submitted: auto-generated", "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: quoted-printable", "@todo.example.com>", "MIME-Version: 1.0"} {
		if !strings.Contains(head, h) {
			t.Fatalf("missing %q in %s", h, head)
		}
	}
	dec := new(mime.WordDecoder)
	for _, l := range strings.Split(head, "\r\n") {
		if v, ok := strings.CutPrefix(l, "Subject: "); ok {
			if s, _ := dec.DecodeHeader(v); s != "Setze dein Passwort zurück" {
				t.Fatalf("subject %q", s)
			}
		}
	}
	plain, _ := io.ReadAll(quotedprintable.NewReader(strings.NewReader(body)))
	if !strings.Contains(string(plain), "Umlaut ä\r\nhttps://x.example/reset/otr_abc") {
		t.Fatalf("body %q", plain)
	}
	for _, bad := range []string{"bob@example.com\r\nBcc: eve@example.com", "x\nBcc: y"} {
		if _, err := Assemble("a@b.c", bad, "s", "b", "", time.Now()); !errors.Is(err, ErrHeader) {
			t.Fatalf("injection accepted: %v", err)
		}
		if _, err := Assemble("a@b.c", "b@c.d", bad, "b", "", time.Now()); !errors.Is(err, ErrHeader) {
			t.Fatalf("subject injection accepted: %v", err)
		}
	}
}

type fakeSender struct {
	err  error
	sent []string
}

func (f *fakeSender) Send(_ context.Context, _ Config, to string, data []byte) error {
	if f.err != nil {
		return f.err
	}
	f.sent = append(f.sent, to)
	return nil
}

type fakeE2EE map[string]bool

func (f fakeE2EE) Enabled(_ context.Context, id string) (bool, error) { return f[id], nil }

func auditRows(t *testing.T, db *sql.DB) []string {
	rows, err := db.Query(`SELECT name || ' ' || outcome || ' ' || details FROM audit_events ORDER BY rowid`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var s string
		rows.Scan(&s)
		out = append(out, s)
	}
	return out
}

func TestSendLimitsAuditAndEncryption(t *testing.T) {
	fs := &fakeSender{}
	s, db, _ := newService(t, config.SMTPConfig{}, fs)
	ctx := context.Background()
	m := Message{Kind: KindPasswordReset, To: "bob@example.com", Origin: "https://todo.example.com", Vars: Vars{Link: "https://todo.example.com/reset/otr_SECRET", Expiry: time.Hour}}
	if err := s.Send(ctx, m); !errors.Is(err, ErrDisabled) {
		t.Fatalf("unconfigured = %v", err)
	}
	if _, err := s.Save(ctx, Update{Host: ptr("smtp.example.com"), From: ptr("todo@example.com")}); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 5; i++ {
		if err := s.Send(ctx, m); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.Send(ctx, m); !errors.Is(err, ErrRateLimited) || len(fs.sent) != 5 {
		t.Fatalf("sixth = %v, sent %d", err, len(fs.sent))
	}
	// Another kind to the same address has its own window.
	if err := s.Send(ctx, Message{Kind: KindVerifySignup, To: "BOB@example.com", Vars: Vars{Link: "x", Expiry: time.Hour}}); err != nil {
		t.Fatal(err)
	}
	fs.err = &SendError{Stage: StageAuth, Reply: "535 no"}
	if err := s.Send(ctx, Message{Kind: KindInvitation, To: "carol@example.com", Vars: Vars{Link: "x", Expiry: time.Hour, Inviter: "A"}}); err == nil {
		t.Fatal("failure not returned")
	}
	rows := auditRows(t, db)
	joined := strings.Join(rows, "\n")
	if strings.Contains(joined, "otr_SECRET") {
		t.Fatal("the link reached the audit log")
	}
	if !strings.Contains(rows[5], "email.failed failure") || !strings.Contains(rows[5], `"reason":"rate_limited"`) || !strings.Contains(rows[7], `"reason":"auth"`) {
		t.Fatalf("audit = %v", rows)
	}
	// A content-bearing kind is refused for an encrypted account.
	carriesContent["digest_test"] = true
	defer delete(carriesContent, "digest_test")
	s.e2ee = fakeE2EE{"u1": true}
	fs.err = nil
	if err := s.Send(ctx, Message{Kind: "digest_test", To: "e@example.com", UserID: "u1"}); !errors.Is(err, ErrEncrypted) || len(fs.sent) != 6 {
		t.Fatalf("encrypted = %v", err)
	}
	if rows := auditRows(t, db); !strings.Contains(rows[len(rows)-1], "encrypted_account") {
		t.Fatalf("audit = %v", rows)
	}
}

func TestServerWideLimit(t *testing.T) {
	now := time.Unix(1_000_000, 0)
	l := NewLimiter(func() time.Time { return now })
	for i := 0; i < ServerLimit; i++ {
		if !l.Allow(KindInvitation, strings.Repeat("a", i+1)+"@example.com") {
			t.Fatalf("refused at %d", i)
		}
	}
	if l.Allow(KindInvitation, "new@example.com") {
		t.Fatal("101st allowed")
	}
	now = now.Add(LimitWindow + time.Second)
	if !l.Allow(KindInvitation, "new@example.com") {
		t.Fatal("window did not slide")
	}
}

func digestSample() *DigestVars {
	return &DigestVars{
		WeekStart: "2026-10-12", WeekEnd: "2026-10-18", Completed: 12, Created: 9, Late: 2, Slipped: 3,
		Overdue:    []DigestItem{{Title: "Renew passport", Due: "2026-10-20", Project: ""}, {Title: "File taxes\nnow", Due: "2026-10-21", Project: "Taxes"}},
		Ahead:      []DigestItem{{Title: "Dentist", Due: "2026-10-23", Project: "Health"}},
		AheadMore:  3,
		Idle:       []string{"Garage"},
		LastReview: "2026-10-16",
	}
}

// TestDigestGolden (stats-and-review, task 4.2): the digest in each language,
// compared with testdata/digest.<lang>.golden (UPDATE_GOLDEN=1 rewrites them).
func TestDigestGolden(t *testing.T) {
	for _, lang := range Languages {
		m := Message{Kind: KindDigest, To: "ana@example.com", Lang: lang, Origin: "https://todo.example.com",
			Vars: Vars{Link: "https://todo.example.com/review", Digest: digestSample()}}
		subj, body, err := Render(m, m.Origin)
		if err != nil {
			t.Fatal(err)
		}
		got := subj + "\n\n" + body
		path := "testdata/digest." + lang + ".golden"
		if os.Getenv("UPDATE_GOLDEN") != "" {
			if err := os.MkdirAll("testdata", 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(path, []byte(got), 0o644); err != nil {
				t.Fatal(err)
			}
		}
		want, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		if got != string(want) {
			t.Fatalf("%s digest differs from %s:\n%s", lang, path, got)
		}
		if strings.Contains(subj, "Renew") || !strings.Contains(subj, "12") {
			t.Fatalf("%s subject = %q", lang, subj)
		}
	}
	_, body, _ := Render(Message{Kind: KindDigest, Lang: "de", Vars: Vars{Digest: &DigestVars{WeekStart: "2026-10-23", WeekEnd: "2026-10-23"}}}, "")
	if !strings.Contains(body, "Fr. 23. Okt.") || !strings.Contains(body, "Nichts.") || !strings.Contains(body, "noch nie") {
		t.Fatalf("german empty digest: %q", body)
	}
}

func TestDigestIsPacedButLimitedPerRecipient(t *testing.T) {
	now := time.Unix(1_000_000, 0)
	l := NewLimiter(func() time.Time { return now })
	for i := 0; i < ServerLimit; i++ {
		if !l.Allow(KindInvitation, strings.Repeat("a", i+1)+"@example.com") {
			t.Fatalf("refused at %d", i)
		}
	}
	// The transactional window is full; digests do not wait for it.
	if !l.Allow(KindDigest, "ana@example.com") || l.Full(KindDigest, "bob@example.com") {
		t.Fatal("a digest waited for the server-wide window")
	}
	for i := 1; i < PerRecipientLimit; i++ {
		l.Allow(KindDigest, "ana@example.com")
	}
	if l.Allow(KindDigest, "ana@example.com") {
		t.Fatal("the per-recipient limit does not apply to digests")
	}
}
