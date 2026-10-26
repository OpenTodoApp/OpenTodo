package email

import (
	"net/mail"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/pixari/opentodo/internal/e2ee"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Fuzz targets for email to task (wave 2 of the 2026-10 audit, Z1). Every
// message in the operator's mailbox is parsed before it is routed, so these
// bytes come from anyone who knows the address.

func seedMessages(f *testing.F) {
	files, _ := filepath.Glob("testdata/*.eml")
	for _, p := range files {
		b, err := os.ReadFile(p)
		if err != nil {
			f.Fatal(err)
		}
		f.Add(b)
	}
	f.Add([]byte("Subject: =?utf-8?b?w7w=?=\r\nContent-Type: multipart/mixed; boundary=x\r\n\r\n--x\r\nContent-Type: message/rfc822\r\n\r\nSubject: inner\r\n\r\nbody\r\n--x--\r\n"))
	f.Add([]byte("Content-Type: text/html\r\nContent-Transfer-Encoding: base64\r\n\r\nPGI+aGk8L2I+\r\n"))
}

// FuzzParse: no panic, and whatever is accepted becomes a task the sync layer
// takes: a non-empty UTF-8 title within the cap, a description that fits one
// synced value (also once encrypted), and a usable Message-ID.
func FuzzParse(f *testing.F) {
	seedMessages(f)
	f.Fuzz(func(t *testing.T, raw []byte) {
		p, err := Parse(raw)
		if err != nil {
			return
		}
		if p.Title == "" || !utf8.ValidString(p.Title) || utf8.RuneCountInString(p.Title) > MaxTitleRunes {
			t.Fatalf("title %q", p.Title)
		}
		if !e2ee.FitsValue(p.Description, opsync.MaxValueBytes) {
			t.Fatalf("description of %d bytes does not fit a synced value", len(p.Description))
		}
		if p.MessageID == "" || len(p.MessageID) > 255 {
			t.Fatalf("message id %q", p.MessageID)
		}
		if p.HeaderMessageID != "" && p.HeaderMessageID != p.MessageID {
			t.Fatalf("header message id %q differs from %q", p.HeaderMessageID, p.MessageID)
		}
		if p.From != strings.ToLower(p.From) {
			t.Fatalf("sender %q not lowercased", p.From)
		}
		if len(p.Attachments) > maxParts {
			t.Fatalf("%d attachments listed", len(p.Attachments))
		}
		// Routing reads the same header; it must not panic either.
		Route(p.Header, "todo", "example.com")
	})
}

// FuzzHTMLToMarkdown: no panic, UTF-8 in gives UTF-8 out, and links in the
// result only ever point at http(s) targets.
func FuzzHTMLToMarkdown(f *testing.F) {
	if b, err := os.ReadFile("testdata/newsletter.eml"); err == nil {
		f.Add(string(b))
	}
	for _, s := range []string{
		`<p>Hi <b>there</b> <a href="https://x.example/a(b)">link</a></p>`,
		`<ul><li>a<ol><li>b</ol></ul><a href="javascript:alert(1)">x</a>`,
		`<div style="display:none">pre</div><pre>  code
 x</pre><h2>T</h2><br><table><tr><td>a<td>b</table>`,
		`<a x='"'>q</a><!-- c --><script>s</script>`,
	} {
		f.Add(s)
	}
	f.Fuzz(func(t *testing.T, in string) {
		out := HTMLToMarkdown(in)
		if utf8.ValidString(in) && !utf8.ValidString(out) {
			t.Fatalf("UTF-8 input gave invalid output %q", out)
		}
		// Every unescaped "](" is a link the converter wrote: http(s) only.
		for i := 0; i < len(out); i++ {
			if !strings.HasPrefix(out[i:], "](") {
				continue
			}
			slashes := 0
			for k := i - 1; k >= 0 && out[k] == '\\'; k-- {
				slashes++
			}
			if slashes%2 == 1 {
				continue
			}
			target := strings.ToLower(out[i+2:])
			if !strings.HasPrefix(target, "http://") && !strings.HasPrefix(target, "https://") {
				t.Fatalf("link to a non-http target in %q (input %q)", out, in)
			}
		}
	})
}

// FuzzRoute: the sub-address found is the configured address's, lowercased.
func FuzzRoute(f *testing.F) {
	f.Add("Todo+AbC@Example.com", "")
	f.Add(`"x" <todo+s1@example.com>, y@z`, "todo+s2@example.com")
	f.Add("todo+@example.com", "<todo+a@example.com.evil>")
	f.Fuzz(func(t *testing.T, to, delivered string) {
		h := mail.Header{"To": {to}, "Delivered-To": {delivered}}
		secret, ok := Route(h, "todo", "example.com")
		if !ok {
			return
		}
		if secret == "" || secret != strings.ToLower(secret) {
			t.Fatalf("secret %q", secret)
		}
	})
}
