package mail

import (
	"bytes"
	"embed"
	"errors"
	"fmt"
	"mime"
	"mime/quotedprintable"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"text/template"
	"time"

	"github.com/pixari/opentodo/internal/ids"
)

// Kind is one of the closed set of messages the server sends (design D3).
type Kind string

const (
	KindVerifySignup  Kind = "verify_signup"
	KindPasswordReset Kind = "password_reset"
	KindInvitation    Kind = "invitation"
	KindProjectInvite Kind = "project_invite"
	KindTest          Kind = "test"
)

// Kinds lists every kind.
var Kinds = []Kind{KindVerifySignup, KindPasswordReset, KindInvitation, KindProjectInvite, KindTest}

// carriesContent marks kinds that include entity content and must never be
// built for an account with end-to-end encryption (design D8). None of the
// current kinds does; the digest in `stats-and-review` will.
var carriesContent = map[Kind]bool{}

// Languages are the supported message languages, English first.
var Languages = []string{"en", "de", "fr", "es", "it", "pt"}

// Vars are the only values a template sees: the server origin, the link and its
// expiry, the recipient address, the inviter's display name and a project
// role. No entity content ever enters a message.
type Vars struct {
	Link    string
	Expiry  time.Duration
	Inviter string
	Role    string
	// Existing selects the verify_signup variant for an address that already
	// has an account.
	Existing bool
}

// Message is one message to render and send.
type Message struct {
	Kind Kind
	To   string
	Lang string
	Vars Vars
	// UserID is the recipient's account when known (for the encryption check
	// and the audit target).
	UserID string
	// ActorID is the account that caused the message, if any.
	ActorID string
	// Origin is the server's public origin, named in the message.
	Origin string
}

//go:embed templates/*.txt
var templateFS embed.FS

var templates = func() map[string]*template.Template {
	out := map[string]*template.Template{}
	entries, _ := templateFS.ReadDir("templates")
	for _, e := range entries {
		raw, _ := templateFS.ReadFile("templates/" + e.Name())
		name := strings.TrimSuffix(e.Name(), ".txt")
		out[name] = template.Must(template.New(name).Option("missingkey=error").Parse(string(raw)))
	}
	return out
}()

// templateData is what a template is executed with.
type templateData struct {
	Origin, Email, Link, Expiry, Inviter, Role string
}

var units = map[string][2][2]string{ // lang → {hours {one, many}, days {one, many}}
	"en": {{"hour", "hours"}, {"day", "days"}},
	"de": {{"Stunde", "Stunden"}, {"Tag", "Tagen"}},
	"fr": {{"heure", "heures"}, {"jour", "jours"}},
	"es": {{"hora", "horas"}, {"día", "días"}},
	"it": {{"ora", "ore"}, {"giorno", "giorni"}},
	"pt": {{"hora", "horas"}, {"dia", "dias"}},
}

// formatExpiry writes a duration in hours up to two days and in whole days beyond.
func formatExpiry(d time.Duration, lang string) string {
	u := units[lang]
	h := int((d + 30*time.Minute) / time.Hour)
	if h < 1 {
		h = 1
	}
	if h > 48 {
		days := (h + 12) / 24
		if days == 1 {
			return "1 " + u[1][0]
		}
		return strconv.Itoa(days) + " " + u[1][1]
	}
	if h == 1 {
		return "1 " + u[0][0]
	}
	return strconv.Itoa(h) + " " + u[0][1]
}

var roleNames = map[string]map[string]string{
	"en": {"admin": "admin", "editor": "editor", "viewer": "viewer"},
	"de": {"admin": "Admin", "editor": "Bearbeiter", "viewer": "Betrachter"},
	"fr": {"admin": "administrateur", "editor": "éditeur", "viewer": "lecteur"},
	"es": {"admin": "administrador", "editor": "editor", "viewer": "lector"},
	"it": {"admin": "amministratore", "editor": "editor", "viewer": "lettore"},
	"pt": {"admin": "administrador", "editor": "editor", "viewer": "leitor"},
}

// someone stands in for an inviter without a display name (the address is never shown).
var someone = map[string]string{"en": "Someone", "de": "Jemand", "fr": "Quelqu'un", "es": "Alguien", "it": "Qualcuno", "pt": "Alguém"}

// LangFrom picks the first supported language of an Accept-Language header,
// honouring q values; English when none matches.
func LangFrom(header string) string {
	type pref struct {
		lang string
		q    float64
		i    int
	}
	var prefs []pref
	for i, part := range strings.Split(header, ",") {
		fields := strings.Split(strings.TrimSpace(part), ";")
		tag := strings.ToLower(strings.TrimSpace(fields[0]))
		if tag == "" {
			continue
		}
		q := 1.0
		for _, f := range fields[1:] {
			f = strings.TrimSpace(f)
			if v, ok := strings.CutPrefix(f, "q="); ok {
				if n, err := strconv.ParseFloat(v, 64); err == nil {
					q = n
				}
			}
		}
		primary, _, _ := strings.Cut(tag, "-")
		prefs = append(prefs, pref{primary, q, i})
	}
	sort.SliceStable(prefs, func(a, b int) bool { return prefs[a].q > prefs[b].q })
	for _, p := range prefs {
		if p.q <= 0 {
			continue
		}
		for _, l := range Languages {
			if p.lang == l {
				return l
			}
		}
	}
	return "en"
}

// ErrHeader is a header value with a line break (header injection).
var ErrHeader = errors.New("mail: header value contains a line break")

// Render returns the subject and body of m for a server at origin.
func Render(m Message, origin string) (subject, body string, err error) {
	lang := m.Lang
	if _, ok := units[lang]; !ok {
		lang = "en"
	}
	name := string(m.Kind)
	if m.Kind == KindVerifySignup && m.Vars.Existing {
		name = "verify_signup_existing"
	}
	t := templates[name+"."+lang]
	if t == nil {
		return "", "", fmt.Errorf("mail: no template for %s", name)
	}
	role := m.Vars.Role
	if r, ok := roleNames[lang][role]; ok {
		role = r
	}
	inviter := strings.TrimSpace(m.Vars.Inviter)
	if inviter == "" {
		inviter = someone[lang]
	}
	data := templateData{Origin: origin, Email: m.To, Link: m.Vars.Link, Expiry: formatExpiry(m.Vars.Expiry, lang),
		Inviter: inviter, Role: role}
	var buf bytes.Buffer
	if err := t.Execute(&buf, data); err != nil {
		return "", "", err
	}
	subject, body, _ = strings.Cut(buf.String(), "\n")
	return strings.TrimSpace(subject), strings.TrimLeft(body, "\n"), nil
}

// Assemble builds the RFC 5322 message: plain text, quoted-printable, an
// encoded subject, a Message-ID on the origin's host and the headers that
// stop auto-replies.
func Assemble(from, to, subject, body, origin string, now time.Time) ([]byte, error) {
	for _, v := range []string{from, to, subject} {
		if strings.ContainsAny(v, "\r\n") {
			return nil, ErrHeader
		}
	}
	host := "localhost"
	if u, err := url.Parse(origin); err == nil && u.Hostname() != "" {
		host = u.Hostname()
	}
	var b bytes.Buffer
	h := func(k, v string) { b.WriteString(k + ": " + v + "\r\n") }
	h("From", from)
	h("To", to)
	h("Subject", mime.QEncoding.Encode("utf-8", subject))
	h("Date", now.Format(time.RFC1123Z))
	h("Message-ID", "<"+strings.ToLower(ids.Secret(16))+"@"+host+">")
	h("MIME-Version", "1.0")
	h("Content-Type", "text/plain; charset=utf-8")
	h("Content-Transfer-Encoding", "quoted-printable")
	h("Auto-Submitted", "auto-generated")
	h("X-Auto-Response-Suppress", "All")
	b.WriteString("\r\n")
	qp := quotedprintable.NewWriter(&b)
	if _, err := qp.Write([]byte(strings.ReplaceAll(strings.ReplaceAll(body, "\r\n", "\n"), "\n", "\r\n"))); err != nil {
		return nil, err
	}
	if err := qp.Close(); err != nil {
		return nil, err
	}
	return b.Bytes(), nil
}
