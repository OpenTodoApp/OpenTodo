package email

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	opsync "github.com/pixari/opentodo/internal/sync"
)

func fixture(t *testing.T, name string) []byte {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestParseMessage(t *testing.T) {
	cases := []struct {
		file        string
		title       string
		from        string
		messageID   string
		contains    []string
		notContains []string
		attachments []Attachment
	}{
		{
			file: "plain.eml", title: "Call the plumber", from: "alice@example.org", messageID: "<plain-1@example.org>",
			contains:    []string{"can you call the plumber before Friday? The number is 555-0100.\n\nThanks\nAlice"},
			notContains: []string{"\n\n\n", "Attachments:"},
		},
		{
			file: "html_only.eml", title: "This week: café openings ☕", from: "news@news.example.net",
			contains: []string{
				"Café openings",
				"Three new places opened this week & one closed.",
				"- North – espresso bar\n- South",
				"Read more: full article (https://news.example.net/cafes?id=7)\nOr visit https://news.example.net/",
				"<script> stays text",
			},
			notContains: []string{"alert", "color: red", "Newsletter", "tracking comment", "<p>", "<h1>", "pixel.gif"},
		},
		{
			file: "multipart_pdf.eml", title: "Invoice 2026-10", from: "joerg@example.org", messageID: "<CAF=pdf-1@mail.example.org>",
			contains: []string{
				"Please pay the invoice by the end of the month. Grüße, Jörg",
				"Total: 120,00 €",
				"Attachments:\n- invoice-2026-10.pdf (136 B)\n- résumé.png (8 B)",
			},
			notContains: []string{"<p>"},
			attachments: []Attachment{{"invoice-2026-10.pdf", 136}, {"résumé.png", 8}},
		},
		{
			file: "no_subject.eml", title: "Buy milk and eggs", from: "bob@example.org",
			contains: []string{"Buy milk and eggs\nAnd bread"},
		},
		{
			file: "forwarded_attachment.eml", title: "Tickets for Köln 🎟", from: "alice@example.org",
			contains: []string{
				"See below.\n\n---------- Forwarded message ----------\nFrom: Events <tickets@events.example>",
				"Subject: Your tickets",
				"Concert on 2026-11-02, doors 19:30. Seats 12 and 13.",
				"Attachments:\n- tickets.pdf (9 B)",
			},
		},
	}
	for _, tc := range cases {
		t.Run(tc.file, func(t *testing.T) {
			raw := fixture(t, tc.file)
			for _, variant := range []struct {
				name string
				raw  []byte
			}{{"lf", raw}, {"crlf", bytes.ReplaceAll(raw, []byte("\n"), []byte("\r\n"))}} {
				p, err := Parse(variant.raw)
				if err != nil {
					t.Fatalf("%s: %v", variant.name, err)
				}
				if p.Title != tc.title {
					t.Errorf("%s: title = %q, want %q", variant.name, p.Title, tc.title)
				}
				if p.From != tc.from {
					t.Errorf("%s: from = %q, want %q", variant.name, p.From, tc.from)
				}
				if tc.messageID != "" && p.MessageID != tc.messageID {
					t.Errorf("%s: message id = %q", variant.name, p.MessageID)
				}
				for _, s := range tc.contains {
					if !strings.Contains(p.Description, s) {
						t.Errorf("%s: description lacks %q:\n%s", variant.name, s, p.Description)
					}
				}
				for _, s := range tc.notContains {
					if strings.Contains(p.Description, s) {
						t.Errorf("%s: description contains %q:\n%s", variant.name, s, p.Description)
					}
				}
				if tc.attachments != nil && !equalAttachments(p.Attachments, tc.attachments) {
					t.Errorf("%s: attachments = %+v", variant.name, p.Attachments)
				}
			}
		})
	}
}

func equalAttachments(a, b []Attachment) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestParseNoSubjectNoBody(t *testing.T) {
	p, err := Parse([]byte("From: x@example.org\nTo: todo+a@example.com\n\n"))
	if err != nil {
		t.Fatal(err)
	}
	if p.Title != NoSubject || p.Description != "" || !strings.HasPrefix(p.MessageID, "sha256:") {
		t.Fatalf("parsed = %+v", p)
	}
}

// A long message is kept whole as long as one synced value holds it (OpenSpec
// change email-body-limit, issue #161: it used to be cut at 16 KB).
func TestParseKeepsLongBody(t *testing.T) {
	body := strings.Repeat("äbcdefghij\n", 3600) // about 43 KB
	p, err := Parse([]byte("Subject: long\nContent-Type: text/plain; charset=utf-8\n\n" + body))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(p.Description, TruncatedNote) || p.Description != strings.TrimSpace(body) {
		t.Fatalf("a %d byte body was not kept whole (%d bytes)", len(body), len(p.Description))
	}
}

// checkCut asserts d was cut with the note, at a rune boundary, as late as the limits allow.
func checkCut(t *testing.T, d string) {
	t.Helper()
	if !strings.Contains(d, TruncatedNote) {
		t.Fatalf("no truncation note: ...%q", d[len(d)-80:])
	}
	if !utf8.ValidString(d) || strings.ContainsRune(d, '\uFFFD') {
		t.Fatal("truncation split a rune")
	}
	enc, _ := json.Marshal(d)
	if len(enc) > opsync.MaxValueBytes || len(d) > maxEncryptableBytes {
		t.Fatalf("description is %d bytes, %d encoded", len(d), len(enc))
	}
	// Late: within a few runes of a limit.
	if len(enc) < opsync.MaxValueBytes-64 && len(d) < maxEncryptableBytes-64 {
		t.Fatalf("cut too early: %d bytes, %d encoded", len(d), len(enc))
	}
}

func TestDescriptionCutsAtTheValueLimit(t *testing.T) {
	atts := []Attachment{{Name: "report.pdf", Size: 2 << 20}, {Name: "photo.jpg", Size: 300 << 10}}
	// Multi-byte runes: the encrypted-size limit binds.
	d := description(strings.Repeat("äbc € 😀 defghij\n", 12000), atts)
	checkCut(t, d)
	if !strings.HasSuffix(d, "- photo.jpg (300.0 KB)") {
		t.Fatalf("the attachment list is missing: ...%q", d[len(d)-120:])
	}
	// Characters JSON escapes into six bytes: the JSON limit binds.
	checkCut(t, description(strings.Repeat("<a href=\"x\">&\x01</a>\n", 8000), nil))
}

// The ops of a task from a very long message pass the server's validation.
func TestLongMessageOpsAreValid(t *testing.T) {
	body := strings.Repeat("Ein langer Absatz mit Umlauten: äöü, Zeichen <>&\"\\ und Emoji 😀.\n", 4000) // about 270 KB
	p, err := Parse([]byte("Subject: long\nContent-Type: text/plain; charset=utf-8\n\n" + body))
	if err != nil {
		t.Fatal(err)
	}
	checkCut(t, p.Description)
	for _, op := range taskOps("u1", p, time.Unix(1_760_000_000, 0), 1_760_000_000_000) {
		if err := opsync.Validate(op); err != nil {
			t.Fatalf("%s: %v", op.Field, err)
		}
	}
}

func TestParseRejectsHugeMessage(t *testing.T) {
	raw := append([]byte("Subject: x\n\n"), bytes.Repeat([]byte("a"), MaxMessageBytes)...)
	if _, err := Parse(raw); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("err = %v", err)
	}
}

func TestParseWindows1252AndUnknownCharset(t *testing.T) {
	p, err := Parse([]byte("Subject: =?windows-1252?Q?=93Quotes=94_=96_dash?=\nContent-Type: text/plain; charset=x-unknown\n\nok \xff\n"))
	if err != nil {
		t.Fatal(err)
	}
	if p.Title != "“Quotes” – dash" {
		t.Fatalf("title = %q", p.Title)
	}
	if p.Description != "ok \uFFFD" {
		t.Fatalf("description = %q", p.Description)
	}
}

func TestStripSubjectPrefixes(t *testing.T) {
	for in, want := range map[string]string{
		"Re: Fwd: RE[2]: hello":   "hello",
		"AW: WG: Termin":          "Termin",
		"Fw:Report":               "Report",
		"SV: VS: Möte":            "Möte",
		"Reply all: keep":         "Reply all: keep",
		"Recipe: soup":            "Recipe: soup",
		"  fwd :  spaced  ":       "spaced",
		"Re: ":                    "",
		"Tr: RV: Antw: Odp: x":    "x",
		"Regarding: no prefix":    "Regarding: no prefix",
		"re(3): counted":          "counted",
		"[list] Re: tag kept":     "[list] Re: tag kept",
		"Fwd: Fwd: Fwd: deep one": "deep one",
	} {
		if got := StripSubjectPrefixes(in); got != want {
			t.Errorf("StripSubjectPrefixes(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestHTMLToTextDropsActiveContent(t *testing.T) {
	got := HTMLToText(`<div onclick="steal()">Hi<SCRIPT type="x">document.cookie</SCRIPT><a href="javascript:alert(1)">click</a><iframe src="https://evil.example"></iframe></div>`)
	if got != "Hi\nclick" && got != "Hiclick" {
		t.Fatalf("got %q", got)
	}
	if strings.Contains(got, "javascript") || strings.Contains(got, "cookie") || strings.Contains(got, "evil") {
		t.Fatalf("active content leaked: %q", got)
	}
}
