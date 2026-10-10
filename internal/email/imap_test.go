package email

import (
	"bufio"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"fmt"
	"io"
	"math/big"
	"net"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

// fakeIMAP is a small in-memory IMAP server that speaks the subset of RFC 3501
// IMAPSource uses, so the client is tested against real protocol bytes.
type fakeIMAP struct {
	t        *testing.T
	ln       net.Listener
	mu       sync.Mutex
	caps     []string // announced after TLS (or always when tlsCfg is nil)
	tlsCfg   *tls.Config
	user     string
	pass     string
	delim    string
	msgs     map[uint32]*fakeMsg
	folders  map[string]bool
	commands []string // verbs received, in order, with the TLS state
	logins   int
}

type fakeMsg struct {
	raw     []byte
	seen    bool
	deleted bool
	folder  string
}

func newFakeIMAP(t *testing.T, caps ...string) *fakeIMAP {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	f := &fakeIMAP{t: t, ln: ln, caps: caps, user: "todo@example.com", pass: "pässword \"q\"", delim: ".",
		msgs: map[uint32]*fakeMsg{}, folders: map[string]bool{"INBOX": true}}
	t.Cleanup(func() { ln.Close() })
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go f.serve(c)
		}
	}()
	return f
}

func (f *fakeIMAP) add(uid uint32, raw []byte) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.msgs[uid] = &fakeMsg{raw: raw, folder: "INBOX"}
}

func (f *fakeIMAP) source() *IMAPSource {
	return &IMAPSource{Addr: f.ln.Addr().String(), User: f.user, Password: f.pass, Mailbox: "INBOX",
		Folder: "OpenTodo/Processed", insecurePlaintext: f.tlsCfg == nil, Timeout: 5 * time.Second}
}

var reCmdLiteral = regexp.MustCompile(`\{(\d+)\}$`)

func (f *fakeIMAP) serve(conn net.Conn) {
	defer conn.Close()
	r, w := bufio.NewReader(conn), bufio.NewWriter(conn)
	secure := false
	send := func(format string, a ...any) { fmt.Fprintf(w, format+"\r\n", a...); w.Flush() }
	send("* OK fake IMAP ready")
	// readCmd returns the command line with literals inlined as quoted strings.
	readCmd := func() (string, error) {
		var sb strings.Builder
		for {
			line, err := r.ReadString('\n')
			if err != nil {
				return "", err
			}
			line = strings.TrimRight(line, "\r\n")
			m := reCmdLiteral.FindStringSubmatch(line)
			if m == nil {
				sb.WriteString(line)
				return sb.String(), nil
			}
			n, _ := strconv.Atoi(m[1])
			sb.WriteString(line[:len(line)-len(m[0])])
			send("+ go ahead")
			buf := make([]byte, n)
			if _, err := io.ReadFull(r, buf); err != nil {
				return "", err
			}
			sb.WriteString(strconv.Quote(string(buf)))
		}
	}
	authed := false
	for {
		line, err := readCmd()
		if err != nil {
			return
		}
		tag, rest, _ := strings.Cut(line, " ")
		verb := strings.ToUpper(strings.Fields(rest + " x")[0])
		if verb == "UID" {
			verb += " " + strings.ToUpper(strings.Fields(rest)[1])
		}
		f.mu.Lock()
		f.commands = append(f.commands, fmt.Sprintf("%s secure=%v", verb, secure))
		f.mu.Unlock()
		ok := func() { send("%s OK done", tag) }
		switch verb {
		case "CAPABILITY":
			caps := "IMAP4rev1"
			if f.tlsCfg != nil && !secure {
				caps += " STARTTLS LOGINDISABLED"
			} else {
				caps += " " + strings.Join(f.caps, " ")
			}
			send("* CAPABILITY %s", caps)
			ok()
		case "STARTTLS":
			if f.tlsCfg == nil {
				send("%s BAD no tls", tag)
				continue
			}
			ok()
			tc := tls.Server(conn, f.tlsCfg)
			if err := tc.Handshake(); err != nil {
				return
			}
			conn, secure = tc, true
			r, w = bufio.NewReader(tc), bufio.NewWriter(tc)
		case "LOGIN":
			f.mu.Lock()
			f.logins++
			f.mu.Unlock()
			args := rest[len("LOGIN "):]
			want := strconv.Quote(f.user) + " " + strconv.Quote(f.pass)
			wantQuoted := `"` + f.user + `" ` + strconv.Quote(f.pass)
			if args != want && args != wantQuoted {
				send("%s NO [AUTHENTICATIONFAILED] bad credentials", tag)
				continue
			}
			authed = true
			ok()
		case "SELECT":
			if !authed {
				send("%s NO not authenticated", tag)
				continue
			}
			f.mu.Lock()
			send("* %d EXISTS", len(f.msgs))
			f.mu.Unlock()
			send("%s OK [READ-WRITE] selected", tag)
		case "UID SEARCH":
			f.mu.Lock()
			var ids []string
			for _, uid := range f.sortedUIDs() {
				m := f.msgs[uid]
				if !m.seen && !m.deleted && m.folder == "INBOX" {
					ids = append(ids, strconv.Itoa(int(uid)))
				}
			}
			f.mu.Unlock()
			send("* SEARCH %s", strings.Join(ids, " "))
			ok()
		case "UID FETCH":
			set, items := strings.Fields(rest)[2], strings.Join(strings.Fields(rest)[3:], " ")
			f.mu.Lock()
			for i, uid := range parseSet(set) {
				m := f.msgs[uid]
				if m == nil || m.folder != "INBOX" {
					continue
				}
				if strings.Contains(items, "BODY.PEEK[]") {
					fmt.Fprintf(w, "* %d FETCH (UID %d BODY[] {%d}\r\n", i+1, uid, len(m.raw))
					w.Write(m.raw)
					w.WriteString(")\r\n")
					fmt.Fprintf(w, "* %d FETCH (FLAGS (\\Recent))\r\n", i+1) // unsolicited extra
				} else {
					fmt.Fprintf(w, "* %d FETCH (RFC822.SIZE %d UID %d)\r\n", i+1, len(m.raw), uid)
				}
			}
			f.mu.Unlock()
			w.Flush()
			ok()
		case "UID STORE":
			parts := strings.Fields(rest)
			f.mu.Lock()
			for _, uid := range parseSet(parts[2]) {
				if m := f.msgs[uid]; m != nil {
					m.seen = m.seen || strings.Contains(rest, `\Seen`)
					m.deleted = m.deleted || strings.Contains(rest, `\Deleted`)
				}
			}
			f.mu.Unlock()
			ok()
		case "UID MOVE", "UID COPY":
			parts := strings.Fields(rest)
			folder, _ := strconv.Unquote(parts[3])
			f.mu.Lock()
			if !f.folders[folder] {
				f.mu.Unlock()
				send("%s NO [TRYCREATE] no such folder", tag)
				continue
			}
			for _, uid := range parseSet(parts[2]) {
				m := f.msgs[uid]
				if m == nil {
					continue
				}
				if verb == "UID MOVE" {
					m.folder = folder
				} else {
					f.msgs[uid+10000] = &fakeMsg{raw: m.raw, seen: m.seen, folder: folder}
				}
			}
			f.mu.Unlock()
			ok()
		case "EXPUNGE", "UID EXPUNGE":
			f.mu.Lock()
			for uid, m := range f.msgs {
				if m.deleted {
					delete(f.msgs, uid)
				}
			}
			f.mu.Unlock()
			ok()
		case "LIST":
			send(`* LIST (\Noselect) "%s" ""`, f.delim)
			ok()
		case "CREATE":
			name, _ := strconv.Unquote(strings.TrimSpace(rest[len("CREATE "):]))
			f.mu.Lock()
			exists := f.folders[name]
			f.folders[name] = true
			f.mu.Unlock()
			if exists {
				send("%s NO [ALREADYEXISTS] exists", tag)
			} else {
				ok()
			}
		case "LOGOUT":
			send("* BYE bye")
			ok()
			return
		default:
			send("%s BAD unknown command", tag)
		}
	}
}

func (f *fakeIMAP) sortedUIDs() []uint32 {
	var out []uint32
	for uid := range f.msgs {
		out = append(out, uid)
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

func parseSet(s string) []uint32 {
	var out []uint32
	for _, p := range strings.Split(s, ",") {
		n, _ := strconv.Atoi(p)
		out = append(out, uint32(n))
	}
	return out
}

func (f *fakeIMAP) snapshot() map[uint32]fakeMsg {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := map[uint32]fakeMsg{}
	for k, v := range f.msgs {
		out[k] = *v
	}
	return out
}

func TestIMAPSourceMoveFlow(t *testing.T) {
	for _, caps := range [][]string{{"MOVE", "UIDPLUS"}, {}} {
		t.Run(strings.Join(caps, "+")+"none", func(t *testing.T) {
			f := newFakeIMAP(t, caps...)
			f.add(1, []byte("Subject: one\r\n\r\nfirst\r\n"))
			f.add(2, []byte("Subject: two\r\n\r\nsecond\r\n"))
			ctx := context.Background()
			mb, err := f.source().Open(ctx)
			if err != nil {
				t.Fatal(err)
			}
			msgs, err := mb.Unseen(ctx)
			if err != nil || len(msgs) != 2 || msgs[0].UID != 1 || msgs[0].Size != 23 {
				t.Fatalf("unseen = %+v, %v", msgs, err)
			}
			raw, err := mb.Fetch(ctx, 2)
			if err != nil || string(raw) != "Subject: two\r\n\r\nsecond\r\n" {
				t.Fatalf("fetch = %q, %v", raw, err)
			}
			if err := mb.Done(ctx, []uint32{1, 2}); err != nil {
				t.Fatal(err)
			}
			mb.Close()
			for uid, m := range f.snapshot() {
				if m.folder != "OpenTodo.Processed" || !m.seen || m.deleted {
					t.Fatalf("message %d after Done: %+v", uid, m)
				}
			}
			// Nothing is left unseen in the inbox; a second session finds nothing.
			mb, err = f.source().Open(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer mb.Close()
			if msgs, _ := mb.Unseen(ctx); len(msgs) != 0 {
				t.Fatalf("still unseen: %+v", msgs)
			}
		})
	}
}

func TestIMAPSourceDelete(t *testing.T) {
	f := newFakeIMAP(t, "UIDPLUS")
	f.add(7, []byte("Subject: x\r\n\r\ny\r\n"))
	src := f.source()
	src.Delete = true
	ctx := context.Background()
	mb, err := src.Open(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer mb.Close()
	if err := mb.Done(ctx, []uint32{7}); err != nil {
		t.Fatal(err)
	}
	if n := len(f.snapshot()); n != 0 {
		t.Fatalf("%d messages left", n)
	}
}

func TestIMAPSourceBadLogin(t *testing.T) {
	f := newFakeIMAP(t)
	src := f.source()
	src.Password = "wrong-secret-value"
	_, err := src.Open(context.Background())
	if err == nil || strings.Contains(err.Error(), "wrong-secret-value") {
		t.Fatalf("err = %v", err)
	}
}

// selfSigned returns a server TLS config for 127.0.0.1 and a client config
// that trusts it.
func selfSigned(t *testing.T) (*tls.Config, *tls.Config) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "fake imap"},
		NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour),
		IPAddresses: []net.IP{net.ParseIP("127.0.0.1")}, KeyUsage: x509.KeyUsageDigitalSignature,
		ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	cert, _ := x509.ParseCertificate(der)
	pool := x509.NewCertPool()
	pool.AddCert(cert)
	return &tls.Config{Certificates: []tls.Certificate{{Certificate: [][]byte{der}, PrivateKey: key}}},
		&tls.Config{RootCAs: pool}
}

func TestIMAPSourceSTARTTLS(t *testing.T) {
	f := newFakeIMAP(t, "MOVE")
	serverTLS, clientTLS := selfSigned(t)
	f.tlsCfg = serverTLS
	f.add(1, []byte("Subject: x\r\n\r\ny\r\n"))
	src := f.source()
	src.TLSConfig = clientTLS
	mb, err := src.Open(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if msgs, err := mb.Unseen(context.Background()); err != nil || len(msgs) != 1 {
		t.Fatalf("unseen = %v, %v", msgs, err)
	}
	mb.Close()
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, c := range f.commands {
		if strings.HasPrefix(c, "LOGIN") && c != "LOGIN secure=true" {
			t.Fatalf("login sent without TLS: %v", f.commands)
		}
	}
	if f.logins != 1 {
		t.Fatalf("logins = %d", f.logins)
	}
}

func TestIMAPSourceRefusesPlaintextLogin(t *testing.T) {
	// A server on a non-993 port without STARTTLS: credentials are never sent.
	f := newFakeIMAP(t)
	src := f.source()
	src.insecurePlaintext = false
	_, err := src.Open(context.Background())
	if err == nil || !strings.Contains(err.Error(), "STARTTLS") {
		t.Fatalf("err = %v", err)
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.logins != 0 {
		t.Fatal("credentials sent over plaintext")
	}
}

func TestIMAPSourceUnreachable(t *testing.T) {
	ln, _ := net.Listen("tcp", "127.0.0.1:0")
	addr := ln.Addr().String()
	ln.Close()
	src := &IMAPSource{Addr: addr, User: "u", Password: "p", Mailbox: "INBOX", insecurePlaintext: true}
	if _, err := src.Open(context.Background()); err == nil {
		t.Fatal("connected to a closed port")
	}
}
