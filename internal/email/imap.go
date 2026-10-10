package email

import (
	"bufio"
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"net"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Message is one unseen message in the polled mailbox.
type Message struct {
	UID  uint32
	Size int64
}

// Mailbox is one open session on the polled mailbox.
type Mailbox interface {
	// Unseen lists unseen messages (oldest first, at most MaxPerPoll) with sizes.
	Unseen(ctx context.Context) ([]Message, error)
	// Fetch returns the full message without marking it read.
	Fetch(ctx context.Context, uid uint32) ([]byte, error)
	// Done marks messages read and moves or deletes them as configured.
	Done(ctx context.Context, uids []uint32) error
	Close() error
}

// Source opens mailbox sessions. IMAPSource is the real one; tests use an
// in-memory Source.
type Source interface {
	Open(ctx context.Context) (Mailbox, error)
}

// MaxPerPoll bounds the messages handled in one poll; the rest wait for the next.
const MaxPerPoll = 100

// IMAPSource is a minimal IMAP4rev1 client (RFC 3501) built on the standard
// library: implicit TLS on port 993, STARTTLS on any other port, LOGIN, SELECT,
// UID SEARCH/FETCH/STORE and MOVE (RFC 6851) or COPY+EXPUNGE. It never sends
// credentials over an unencrypted connection and connects only to Addr.
type IMAPSource struct {
	Addr     string // host:port
	User     string
	Password string
	Mailbox  string
	// Delete removes processed messages; otherwise they move to Folder.
	Delete bool
	Folder string
	// TLSConfig overrides the TLS settings (tests); nil verifies the host name
	// against the system roots.
	TLSConfig *tls.Config
	// Timeout bounds each command round trip (default 2 minutes).
	Timeout time.Duration

	insecurePlaintext bool // tests only: no TLS at all
}

// Open connects, authenticates and selects the mailbox.
func (s *IMAPSource) Open(ctx context.Context) (Mailbox, error) {
	host, port, err := net.SplitHostPort(s.Addr)
	if err != nil {
		return nil, fmt.Errorf("imap: address: %w", err)
	}
	cfg := s.TLSConfig
	if cfg == nil {
		cfg = &tls.Config{MinVersion: tls.VersionTLS12}
	}
	cfg = cfg.Clone()
	if cfg.ServerName == "" {
		cfg.ServerName = host
	}
	timeout := s.Timeout
	if timeout <= 0 {
		timeout = 2 * time.Minute
	}
	d := net.Dialer{Timeout: 30 * time.Second}
	raw, err := d.DialContext(ctx, "tcp", s.Addr)
	if err != nil {
		return nil, fmt.Errorf("imap: connect: %w", err)
	}
	c := &imapConn{raw: raw, timeout: timeout, src: s}
	c.stop = context.AfterFunc(ctx, func() { raw.Close() })
	implicit := port == "993" && !s.insecurePlaintext
	if implicit {
		tc := tls.Client(raw, cfg)
		if err := tc.HandshakeContext(ctx); err != nil {
			c.closeConn()
			return nil, fmt.Errorf("imap: tls: %w", err)
		}
		c.setConn(tc)
	} else {
		c.setConn(raw)
	}
	if err := c.open(ctx, cfg, !implicit && !s.insecurePlaintext); err != nil {
		c.closeConn()
		return nil, err
	}
	return c, nil
}

type imapConn struct {
	raw     net.Conn
	conn    net.Conn
	r       *bufio.Reader
	w       *bufio.Writer
	tag     int
	timeout time.Duration
	caps    map[string]bool
	src     *IMAPSource
	stop    func() bool
	folder  string // resolved processed folder, once created
}

func (c *imapConn) setConn(conn net.Conn) {
	c.conn = conn
	c.r = bufio.NewReaderSize(conn, 64<<10)
	c.w = bufio.NewWriter(conn)
}

func (c *imapConn) closeConn() {
	if c.stop != nil {
		c.stop()
	}
	c.conn.Close()
}

func (c *imapConn) open(ctx context.Context, cfg *tls.Config, starttls bool) error {
	c.deadline()
	greet, err := c.readResp()
	if err != nil {
		return fmt.Errorf("imap: greeting: %w", err)
	}
	if !strings.HasPrefix(greet.line, "* OK") && !strings.HasPrefix(greet.line, "* PREAUTH") {
		return fmt.Errorf("imap: unexpected greeting")
	}
	if starttls {
		if err := c.capability(); err != nil {
			return err
		}
		if !c.caps["STARTTLS"] {
			return errors.New("imap: the server offers no STARTTLS on this port; refusing to send credentials unencrypted (use port 993 for implicit TLS)")
		}
		if _, err := c.run("STARTTLS"); err != nil {
			return err
		}
		tc := tls.Client(c.raw, cfg)
		if err := tc.HandshakeContext(ctx); err != nil {
			return fmt.Errorf("imap: starttls: %w", err)
		}
		c.setConn(tc)
	}
	if err := c.capability(); err != nil {
		return err
	}
	if !strings.HasPrefix(greet.line, "* PREAUTH") {
		if c.caps["LOGINDISABLED"] {
			return errors.New("imap: the server disabled LOGIN")
		}
		if _, err := c.run("LOGIN", astring(c.src.User), astring(c.src.Password)); err != nil {
			return errors.New("imap: login failed (check OPENTODO_EMAIL_IMAP_USER and the password)")
		}
		// Servers may announce more capabilities after authentication.
		if err := c.capability(); err != nil {
			return err
		}
	}
	if _, err := c.run("SELECT", astring(mailboxName(c.src.Mailbox))); err != nil {
		return err
	}
	return nil
}

func (c *imapConn) capability() error {
	resps, err := c.run("CAPABILITY")
	if err != nil {
		return err
	}
	c.caps = map[string]bool{}
	for _, r := range resps {
		if f := strings.Fields(r.line); len(f) > 1 && strings.EqualFold(f[1], "CAPABILITY") {
			for _, cp := range f[2:] {
				c.caps[strings.ToUpper(cp)] = true
			}
		}
	}
	return nil
}

var reUID = regexp.MustCompile(`(?i)\bUID (\d+)`)
var reSize = regexp.MustCompile(`(?i)\bRFC822\.SIZE (\d+)`)

func (c *imapConn) Unseen(ctx context.Context) ([]Message, error) {
	resps, err := c.run("UID SEARCH UNSEEN")
	if err != nil {
		return nil, err
	}
	var uids []uint32
	for _, r := range resps {
		f := strings.Fields(r.line)
		if len(f) < 2 || !strings.EqualFold(f[1], "SEARCH") {
			continue
		}
		for _, v := range f[2:] {
			if n, err := strconv.ParseUint(v, 10, 32); err == nil && n > 0 {
				uids = append(uids, uint32(n))
			}
		}
	}
	if len(uids) == 0 {
		return nil, nil
	}
	sort.Slice(uids, func(i, j int) bool { return uids[i] < uids[j] })
	if len(uids) > MaxPerPoll {
		uids = uids[:MaxPerPoll]
	}
	resps, err = c.run("UID FETCH " + uidSet(uids) + " (UID RFC822.SIZE)")
	if err != nil {
		return nil, err
	}
	sizes := map[uint32]int64{}
	for _, r := range resps {
		u, s := reUID.FindStringSubmatch(r.line), reSize.FindStringSubmatch(r.line)
		if u == nil || s == nil {
			continue
		}
		uid, _ := strconv.ParseUint(u[1], 10, 32)
		size, _ := strconv.ParseInt(s[1], 10, 64)
		sizes[uint32(uid)] = size
	}
	out := make([]Message, 0, len(uids))
	for _, u := range uids {
		if size, ok := sizes[u]; ok {
			out = append(out, Message{UID: u, Size: size})
		}
	}
	return out, nil
}

func (c *imapConn) Fetch(ctx context.Context, uid uint32) ([]byte, error) {
	resps, err := c.run("UID FETCH " + strconv.FormatUint(uint64(uid), 10) + " (UID BODY.PEEK[])")
	if err != nil {
		return nil, err
	}
	for _, r := range resps {
		if len(r.lits) == 0 || !strings.Contains(strings.ToUpper(r.line), "BODY[]") {
			continue
		}
		if m := reUID.FindStringSubmatch(r.line); m != nil && m[1] != strconv.FormatUint(uint64(uid), 10) {
			continue
		}
		return r.lits[len(r.lits)-1], nil
	}
	return nil, fmt.Errorf("imap: message %d has no body", uid)
}

func (c *imapConn) Done(ctx context.Context, uids []uint32) error {
	if len(uids) == 0 {
		return nil
	}
	set := uidSet(uids)
	if c.src.Delete {
		if _, err := c.run(`UID STORE ` + set + ` +FLAGS.SILENT (\Seen \Deleted)`); err != nil {
			return err
		}
		return c.expunge(set)
	}
	folder, err := c.processedFolder()
	if err != nil {
		return err
	}
	if _, err := c.run(`UID STORE ` + set + ` +FLAGS.SILENT (\Seen)`); err != nil {
		return err
	}
	if c.caps["MOVE"] {
		_, err := c.run("UID MOVE "+set, astring(folder))
		return err
	}
	if _, err := c.run("UID COPY "+set, astring(folder)); err != nil {
		return err
	}
	if _, err := c.run(`UID STORE ` + set + ` +FLAGS.SILENT (\Deleted)`); err != nil {
		return err
	}
	return c.expunge(set)
}

func (c *imapConn) expunge(set string) error {
	if c.caps["UIDPLUS"] {
		_, err := c.run("UID EXPUNGE " + set)
		return err
	}
	_, err := c.run("EXPUNGE")
	return err
}

var reDelim = regexp.MustCompile(`(?i)^\* LIST \([^)]*\) (?:"((?:[^"\\]|\\.)*)"|NIL)`)

// processedFolder resolves the configured folder with the server's hierarchy
// delimiter ("/" in the configuration) and creates it once per session.
func (c *imapConn) processedFolder() (string, error) {
	if c.folder != "" {
		return c.folder, nil
	}
	folder := c.src.Folder
	if resps, err := c.run(`LIST "" ""`); err == nil {
		for _, r := range resps {
			if m := reDelim.FindStringSubmatch(r.line); m != nil && m[1] != "" && m[1] != "/" {
				folder = strings.ReplaceAll(folder, "/", strings.ReplaceAll(m[1], `\`, ""))
			}
		}
	}
	folder = mailboxName(folder)
	// An existing folder answers NO [ALREADYEXISTS]; that is fine.
	_, _ = c.run("CREATE", astring(folder))
	c.folder = folder
	return folder, nil
}

func (c *imapConn) Close() error {
	c.deadline()
	_, _ = c.run("LOGOUT")
	c.closeConn()
	return nil
}

// ---- protocol ----

type resp struct {
	line string   // the response text with literal markers ({n}) kept in place
	lits [][]byte // literal data, in order
}

// literal is a command argument sent as a synchronizing literal (RFC 3501 4.3).
type literal []byte

// astring formats a string argument: quoted when it is printable ASCII,
// a literal otherwise.
func astring(s string) any {
	for i := 0; i < len(s); i++ {
		if s[i] < 0x20 || s[i] > 0x7e {
			return literal(s)
		}
	}
	return `"` + strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(s) + `"`
}

// mailboxName escapes "&" for modified UTF-7 (RFC 3501 5.1.3); configured
// names are printable ASCII.
func mailboxName(s string) string { return strings.ReplaceAll(s, "&", "&-") }

func uidSet(uids []uint32) string {
	parts := make([]string, len(uids))
	for i, u := range uids {
		parts[i] = strconv.FormatUint(uint64(u), 10)
	}
	return strings.Join(parts, ",")
}

func (c *imapConn) deadline() { _ = c.conn.SetDeadline(time.Now().Add(c.timeout)) }

// run sends one command and reads until its tagged completion. Arguments are
// strings (sent as is) or literals. Errors never contain the arguments, so a
// password cannot end up in a log line.
func (c *imapConn) run(args ...any) ([]resp, error) {
	c.deadline()
	c.tag++
	tag := "a" + strconv.Itoa(c.tag)
	verb := ""
	if s, ok := args[0].(string); ok {
		verb = s
		if strings.HasPrefix(verb, "UID ") {
			verb = strings.Join(strings.Fields(verb)[:2], " ")
		} else {
			verb = strings.Fields(verb)[0]
		}
	}
	c.w.WriteString(tag)
	for _, a := range args {
		c.w.WriteByte(' ')
		switch v := a.(type) {
		case string:
			c.w.WriteString(v)
		case literal:
			fmt.Fprintf(c.w, "{%d}\r\n", len(v))
			if err := c.w.Flush(); err != nil {
				return nil, fmt.Errorf("imap %s: %w", verb, err)
			}
			cont, err := c.readResp()
			if err != nil {
				return nil, fmt.Errorf("imap %s: %w", verb, err)
			}
			if !strings.HasPrefix(cont.line, "+") {
				return nil, fmt.Errorf("imap %s: literal refused", verb)
			}
			c.w.Write(v)
		}
	}
	c.w.WriteString("\r\n")
	if err := c.w.Flush(); err != nil {
		return nil, fmt.Errorf("imap %s: %w", verb, err)
	}
	var untagged []resp
	for {
		r, err := c.readResp()
		if err != nil {
			return nil, fmt.Errorf("imap %s: %w", verb, err)
		}
		if strings.HasPrefix(r.line, tag+" ") {
			status := strings.TrimPrefix(r.line, tag+" ")
			if strings.HasPrefix(strings.ToUpper(status), "OK") {
				return untagged, nil
			}
			return untagged, fmt.Errorf("imap %s: %s", verb, truncateRunes(status, 200))
		}
		if strings.HasPrefix(r.line, "* BYE") && verb != "LOGOUT" {
			return untagged, fmt.Errorf("imap %s: server closed the connection", verb)
		}
		untagged = append(untagged, r)
	}
}

const (
	maxLineBytes    = 4 << 20
	maxLiteralBytes = MaxMessageBytes + 1<<20
)

var reLiteral = regexp.MustCompile(`\{(\d+)\+?\}$`)

// readResp reads one response, including any literals it carries.
func (c *imapConn) readResp() (resp, error) {
	var r resp
	var sb strings.Builder
	for {
		line, err := c.readLine()
		if err != nil {
			return r, err
		}
		sb.WriteString(line)
		m := reLiteral.FindStringSubmatch(line)
		if m == nil {
			break
		}
		n, err := strconv.Atoi(m[1])
		if err != nil || n > maxLiteralBytes {
			return r, errors.New("literal too large")
		}
		buf := make([]byte, n)
		if _, err := io.ReadFull(c.r, buf); err != nil {
			return r, err
		}
		r.lits = append(r.lits, buf)
	}
	r.line = sb.String()
	return r, nil
}

func (c *imapConn) readLine() (string, error) {
	var buf []byte
	for {
		chunk, err := c.r.ReadSlice('\n')
		buf = append(buf, chunk...)
		if len(buf) > maxLineBytes {
			return "", errors.New("response line too long")
		}
		if err == nil {
			break
		}
		if !errors.Is(err, bufio.ErrBufferFull) {
			return "", err
		}
	}
	return strings.TrimRight(string(buf), "\r\n"), nil
}
