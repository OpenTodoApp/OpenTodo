package email

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net/mail"
	"net/textproto"
	"regexp"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/pixari/opentodo/internal/e2ee"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Message limits (design D5, Risks).
const (
	// MaxMessageBytes: larger messages are discarded unread.
	MaxMessageBytes = 10 << 20
	// MaxTitleRunes caps the task title.
	MaxTitleRunes = 500
	// maxAttachmentLines caps the attachment list in the description.
	maxAttachmentLines = 50
	// maxDepth bounds MIME nesting (multipart inside multipart, forwarded mail).
	maxDepth = 12
	// maxParts bounds the number of MIME parts walked in one message.
	maxParts = 500
)

// maxEncryptableBytes is the longest description an end-to-end encrypted account's
// devices can still re-encrypt (encrypt-on-sight): its ciphertext, "enc:v1:" +
// base64url(nonce(12) || ciphertext || tag(16)) between JSON quotes, must fit
// sync.MaxValueBytes. About 48 KB of text.
const maxEncryptableBytes = (opsync.MaxValueBytes-2-len(e2ee.PrefixV1))*3/4 - 12 - 16

// TruncatedNote ends a description whose body did not fit in one synced value.
const TruncatedNote = "[Message truncated: the rest did not fit in the task's notes]"

// NoSubject is the title of a message with neither subject nor body text.
const NoSubject = "(no subject)"

// ErrTooLarge reports a message over MaxMessageBytes.
var ErrTooLarge = errors.New("message larger than 10 MB")

// ErrMalformed reports a message whose header cannot be read.
var ErrMalformed = errors.New("malformed message")

// Attachment is a part that is not body text: listed by name and size only.
type Attachment struct {
	Name string
	Size int64
}

// Parsed is everything the server keeps from a message, plus what routing
// and filtering need. Header is the top-level header (routing reads it).
type Parsed struct {
	Header      mail.Header
	MessageID   string
	From        string // sender address, lowercased; "" when unreadable
	Subject     string // decoded subject
	Title       string
	Body        string // body text before truncation and the attachment list
	Attachments []Attachment
	Description string
}

var wordDecoder = &mime.WordDecoder{CharsetReader: charsetReader}

// Parse reads an RFC 5322 message: decodes the subject, prefers the
// text/plain body (HTML converted to text when there is none), lists
// attachments, and builds the task title and description. It uses the
// standard library only and never interprets content as anything but text.
func Parse(raw []byte) (*Parsed, error) {
	if len(raw) > MaxMessageBytes {
		return nil, ErrTooLarge
	}
	msg, err := mail.ReadMessage(bytes.NewReader(raw))
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrMalformed, err)
	}
	p := &Parsed{Header: msg.Header}
	p.MessageID = messageID(msg.Header.Get("Message-Id"), raw)
	if list, err := msg.Header.AddressList("From"); err == nil && len(list) > 0 {
		p.From = strings.ToLower(list[0].Address)
	} else if m := angleAddr.FindStringSubmatch(msg.Header.Get("From")); m != nil {
		p.From = strings.ToLower(m[1])
	}
	p.Subject = decodeHeader(msg.Header.Get("Subject"))

	w := &walker{}
	w.walk(textproto.MIMEHeader(msg.Header), msg.Body, 0)
	p.Body = w.text()
	p.Attachments = w.attachments

	p.Title = StripSubjectPrefixes(p.Subject)
	if p.Title == "" {
		p.Title = firstLine(p.Body)
	}
	if p.Title == "" {
		p.Title = NoSubject
	}
	p.Title = truncateRunes(p.Title, MaxTitleRunes)
	p.Description = description(p.Body, p.Attachments)
	return p, nil
}

var angleAddr = regexp.MustCompile(`<([^<>@\s]+@[^<>\s]+)>`)

// messageID returns the trimmed Message-ID, or a digest of the whole message
// when there is none, so deduplication works either way.
func messageID(v string, raw []byte) string {
	v = strings.TrimSpace(v)
	if v != "" && len(v) <= 255 {
		return v
	}
	sum := sha256.Sum256(raw)
	return "sha256:" + hex.EncodeToString(sum[:16])
}

func decodeHeader(v string) string {
	if d, err := wordDecoder.DecodeHeader(v); err == nil {
		v = d
	}
	return strings.Join(strings.Fields(strings.ToValidUTF8(v, "�")), " ")
}

// subjectPrefix matches one reply or forward marker, in the spellings of the
// common mail clients and languages (Re, Fwd, Fw, AW, WG, SV, VS, TR, RV, Antw,
// Odp, Enc, PD), with an optional counter such as Re[2]: or Re(2):.
var subjectPrefix = regexp.MustCompile(`(?i)^\s*(re|fwd?|aw|wg|sv|vs|tr|rv|antw|odp|enc|pd|ynt|vb)\s*(\[\d+\]|\(\d+\))?\s*[:：]\s*`)

// StripSubjectPrefixes removes any number of leading reply and forward markers.
func StripSubjectPrefixes(s string) string {
	for {
		loc := subjectPrefix.FindStringIndex(s)
		if loc == nil {
			return strings.TrimSpace(s)
		}
		s = s[loc[1]:]
	}
}

func firstLine(body string) string {
	for _, l := range strings.Split(body, "\n") {
		if l = strings.TrimSpace(l); l != "" {
			return truncateRunes(l, 200)
		}
	}
	return ""
}

func truncateRunes(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	r := []rune(s)
	return strings.TrimSpace(string(r[:n])) + "…"
}

// description is the body followed by one line per attachment with its name and
// size. It keeps as much of the body as one synced value holds (OpenSpec change
// email-body-limit, issue #161): when the description's JSON encoding, as the
// task operation writes it, exceeds sync.MaxValueBytes, or it could not be
// re-encrypted (maxEncryptableBytes), the body is cut at the longest rune
// boundary that fits and ends with TruncatedNote.
func description(body string, atts []Attachment) string {
	if d := compose(body, false, atts); fitsValue(d) {
		return d
	}
	// Every byte encodes to at least one, so no longer prefix can fit.
	if len(body) > maxEncryptableBytes {
		body = body[:maxEncryptableBytes]
	}
	cuts := make([]int, 0, len(body))
	for i := range body {
		cuts = append(cuts, i)
	}
	// The first cut that no longer fits; longer prefixes encode longer.
	n := sort.Search(len(cuts), func(i int) bool { return !fitsValue(compose(body[:cuts[i]], true, atts)) })
	for n > 0 && !fitsValue(compose(body[:cuts[n-1]], true, atts)) {
		n--
	}
	if n == 0 {
		return compose("", true, atts)
	}
	return compose(body[:cuts[n-1]], true, atts)
}

// fitsValue reports whether d, encoded as the operation encodes it, is within the
// sync value limit, also once encrypted.
func fitsValue(d string) bool {
	if len(d) > maxEncryptableBytes {
		return false
	}
	b, err := json.Marshal(d)
	return err == nil && len(b) <= opsync.MaxValueBytes
}

func compose(body string, cut bool, atts []Attachment) string {
	var b strings.Builder
	if cut {
		b.WriteString(strings.TrimRight(body, " \n\t"))
		b.WriteString("\n\n")
		b.WriteString(TruncatedNote)
	} else {
		b.WriteString(body)
	}
	if len(atts) > 0 {
		if b.Len() > 0 {
			b.WriteString("\n\n")
		}
		b.WriteString("Attachments:")
		for i, a := range atts {
			if i == maxAttachmentLines {
				fmt.Fprintf(&b, "\n- and %d more", len(atts)-i)
				break
			}
			fmt.Fprintf(&b, "\n- %s (%s)", a.Name, humanSize(a.Size))
		}
	}
	return b.String()
}

func humanSize(n int64) string {
	switch {
	case n < 1024:
		return fmt.Sprintf("%d B", n)
	case n < 1024*1024:
		return fmt.Sprintf("%.1f KB", float64(n)/1024)
	default:
		return fmt.Sprintf("%.1f MB", float64(n)/(1024*1024))
	}
}

var reURL = regexp.MustCompile(`https?://[^\s)>\]]+`)

// letters counts the letters of s outside links, to compare a message's parts.
func letters(s string) int {
	n := 0
	for _, r := range reURL.ReplaceAllString(s, "") {
		if unicode.IsLetter(r) {
			n++
		}
	}
	return n
}

// walker collects the body text and attachments of a MIME tree.
type walker struct {
	plain, html []string
	forwarded   []string
	attachments []Attachment
	parts       int
}

// text is the body as notes Markdown: the HTML part when there is one (OpenSpec
// change email-html-notes: it keeps headings, lists and links, where a
// newsletter's plain part spells out every tracking link), else the plain part.
// A plain part with more than twice the words of the HTML wins: that HTML is a
// stub some mailers send next to the real text.
func (w *walker) text() string {
	plain := normalizeText(invisible.Replace(strings.Join(w.plain, "\n\n")))
	body := plain
	if len(w.html) > 0 {
		if md := HTMLToMarkdown(strings.Join(w.html, "\n")); md != "" && 2*letters(md) >= letters(plain) {
			body = md
		}
	}
	for _, f := range w.forwarded {
		if body != "" {
			body += "\n\n"
		}
		body += f
	}
	return body
}

func (w *walker) walk(h textproto.MIMEHeader, body io.Reader, depth int) {
	w.parts++
	if depth > maxDepth || w.parts > maxParts {
		return
	}
	ct, params, err := mime.ParseMediaType(h.Get("Content-Type"))
	if err != nil || ct == "" {
		ct, params = "text/plain", map[string]string{}
	}
	disp, dparams, _ := mime.ParseMediaType(h.Get("Content-Disposition"))
	name := dparams["filename"]
	if name == "" {
		name = params["name"]
	}
	name = decodeHeader(name)

	if strings.HasPrefix(ct, "multipart/") {
		boundary := params["boundary"]
		if boundary == "" {
			return
		}
		mr := multipart.NewReader(body, boundary)
		for {
			part, err := mr.NextRawPart()
			if err != nil {
				return
			}
			w.walk(part.Header, part, depth+1)
			if w.parts > maxParts {
				return
			}
		}
	}

	decoded := decodeTransfer(h.Get("Content-Transfer-Encoding"), body)
	isAttachment := disp == "attachment" || (name != "" && disp != "inline")
	switch {
	case ct == "message/rfc822":
		// Forwarded as an attachment: keep the forwarded text, and list its own
		// attachments, as if it had been forwarded inline.
		inner, err := mail.ReadMessage(io.LimitReader(decoded, MaxMessageBytes))
		if err != nil {
			return
		}
		sub := &walker{parts: w.parts}
		sub.walk(textproto.MIMEHeader(inner.Header), inner.Body, depth+1)
		w.parts = sub.parts
		var b strings.Builder
		b.WriteString("---------- Forwarded message ----------")
		for _, k := range []string{"From", "Date", "Subject", "To"} {
			if v := decodeHeader(inner.Header.Get(k)); v != "" {
				fmt.Fprintf(&b, "\n%s: %s", k, v)
			}
		}
		if t := sub.text(); t != "" {
			b.WriteString("\n\n")
			b.WriteString(t)
		}
		w.forwarded = append(w.forwarded, b.String())
		w.attachments = append(w.attachments, sub.attachments...)
	case !isAttachment && (ct == "text/plain" || ct == "text/html"):
		data, _ := io.ReadAll(io.LimitReader(decoded, MaxMessageBytes))
		s := toUTF8(params["charset"], data)
		if ct == "text/plain" {
			w.plain = append(w.plain, s)
		} else {
			w.html = append(w.html, s)
		}
	default:
		n, _ := io.Copy(io.Discard, io.LimitReader(decoded, MaxMessageBytes))
		if name == "" {
			name = "unnamed " + ct
		}
		w.attachments = append(w.attachments, Attachment{Name: truncateRunes(name, 200), Size: n})
	}
}

// decodeTransfer undoes a Content-Transfer-Encoding. Decoding errors end the
// part early instead of failing the message.
func decodeTransfer(cte string, r io.Reader) io.Reader {
	switch strings.ToLower(strings.TrimSpace(cte)) {
	case "base64":
		return base64.NewDecoder(base64.StdEncoding, &spaceStripper{r: bufio.NewReader(r)})
	case "quoted-printable":
		return quotedprintable.NewReader(r)
	default:
		return r
	}
}

// spaceStripper drops whitespace from base64 text (line breaks, stray spaces
// and tabs that some senders add).
type spaceStripper struct{ r *bufio.Reader }

func (s *spaceStripper) Read(p []byte) (int, error) {
	n := 0
	for n < len(p) {
		c, err := s.r.ReadByte()
		if err != nil {
			if n > 0 {
				return n, nil
			}
			return 0, err
		}
		if c == ' ' || c == '\t' || c == '\r' || c == '\n' {
			continue
		}
		p[n] = c
		n++
	}
	return n, nil
}

var blankLines = regexp.MustCompile(`\n{3,}`)

// normalizeText unifies line endings, trims trailing spaces and collapses runs
// of blank lines.
func normalizeText(s string) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	lines := strings.Split(s, "\n")
	for i, l := range lines {
		lines[i] = strings.TrimRight(l, " \t ")
	}
	s = blankLines.ReplaceAllString(strings.Join(lines, "\n"), "\n\n")
	return strings.TrimSpace(s)
}
