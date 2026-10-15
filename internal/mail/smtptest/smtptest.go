// Package smtptest is an in-process SMTP server for tests (like oidctest): it
// records what it receives and can refuse STARTTLS or credentials.
package smtptest

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"math/big"
	"net"
	"net/textproto"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

// Options shape the server's behaviour.
type Options struct {
	// ImplicitTLS serves TLS from the first byte (port 465 style).
	ImplicitTLS bool
	// NoSTARTTLS stops the server advertising STARTTLS.
	NoSTARTTLS bool
	// AuthMechs advertised (default PLAIN LOGIN). Empty with NoAuth set means no AUTH.
	AuthMechs []string
	NoAuth    bool
	// User and Pass are the accepted credentials; empty accepts any.
	User, Pass string
	// Silent accepts connections and never greets (timeout tests).
	Silent bool
}

// Message is one received envelope.
type Message struct {
	From     string
	To       []string
	Data     []byte
	AuthUser string
	TLS      bool
}

// Server is a running test server.
type Server struct {
	Host string
	Port int
	opts Options
	ln   net.Listener
	cert tls.Certificate
	pool *x509.CertPool

	mu       sync.Mutex
	messages []Message
	// AuthWithoutTLS counts AUTH commands received on a plain connection.
	authWithoutTLS int
}

// New starts a server on 127.0.0.1 and stops it at the end of the test.
func New(t testing.TB, o Options) *Server {
	t.Helper()
	if len(o.AuthMechs) == 0 && !o.NoAuth {
		o.AuthMechs = []string{"PLAIN", "LOGIN"}
	}
	s := &Server{opts: o}
	s.cert, s.pool = selfSigned(t)
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	s.ln = ln
	addr := ln.Addr().(*net.TCPAddr)
	s.Host, s.Port = "127.0.0.1", addr.Port
	go s.serve()
	t.Cleanup(func() { ln.Close() })
	return s
}

// RootCAs trusts the server's certificate.
func (s *Server) RootCAs() *x509.CertPool { return s.pool }

// Messages returns what was received so far.
func (s *Server) Messages() []Message {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]Message(nil), s.messages...)
}

// AuthWithoutTLS reports how many AUTH commands arrived unencrypted.
func (s *Server) AuthWithoutTLS() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.authWithoutTLS
}

func (s *Server) serve() {
	for {
		c, err := s.ln.Accept()
		if err != nil {
			return
		}
		go s.handle(c)
	}
}

func (s *Server) handle(c net.Conn) {
	defer c.Close()
	_ = c.SetDeadline(time.Now().Add(30 * time.Second))
	if s.opts.Silent {
		buf := make([]byte, 1)
		_, _ = c.Read(buf)
		return
	}
	secure := false
	if s.opts.ImplicitTLS {
		tc := tls.Server(c, &tls.Config{Certificates: []tls.Certificate{s.cert}})
		if err := tc.Handshake(); err != nil {
			return
		}
		c, secure = tc, true
	}
	tp := textproto.NewConn(c)
	reply := func(code int, msg string) { _ = tp.PrintfLine("%d %s", code, msg) }
	reply(220, "smtptest ESMTP")
	var cur Message
	authUser := ""
	for {
		line, err := tp.ReadLine()
		if err != nil {
			return
		}
		verb, arg, _ := strings.Cut(line, " ")
		switch strings.ToUpper(verb) {
		case "EHLO", "HELO":
			lines := []string{"smtptest"}
			if !secure && !s.opts.NoSTARTTLS {
				lines = append(lines, "STARTTLS")
			}
			if !s.opts.NoAuth {
				lines = append(lines, "AUTH "+strings.Join(s.opts.AuthMechs, " "))
			}
			lines = append(lines, "8BITMIME")
			for i, l := range lines {
				sep := "-"
				if i == len(lines)-1 {
					sep = " "
				}
				_ = tp.PrintfLine("250%s%s", sep, l)
			}
		case "STARTTLS":
			if secure || s.opts.NoSTARTTLS {
				reply(502, "not supported")
				continue
			}
			reply(220, "ready")
			tc := tls.Server(c, &tls.Config{Certificates: []tls.Certificate{s.cert}})
			if err := tc.Handshake(); err != nil {
				return
			}
			c, secure = tc, true
			tp = textproto.NewConn(c)
		case "AUTH":
			if !secure {
				s.mu.Lock()
				s.authWithoutTLS++
				s.mu.Unlock()
			}
			mech, initial, _ := strings.Cut(arg, " ")
			var user, pass string
			switch strings.ToUpper(mech) {
			case "PLAIN":
				if initial == "" {
					reply(334, "")
					if initial, err = tp.ReadLine(); err != nil {
						return
					}
				}
				raw, _ := base64.StdEncoding.DecodeString(initial)
				parts := strings.Split(string(raw), "\x00")
				if len(parts) == 3 {
					user, pass = parts[1], parts[2]
				}
			case "LOGIN":
				reply(334, base64.StdEncoding.EncodeToString([]byte("Username:")))
				u, err := tp.ReadLine()
				if err != nil {
					return
				}
				reply(334, base64.StdEncoding.EncodeToString([]byte("Password:")))
				p, err := tp.ReadLine()
				if err != nil {
					return
				}
				ub, _ := base64.StdEncoding.DecodeString(u)
				pb, _ := base64.StdEncoding.DecodeString(p)
				user, pass = string(ub), string(pb)
			default:
				reply(504, "unknown mechanism")
				continue
			}
			if s.opts.User != "" && (user != s.opts.User || pass != s.opts.Pass) {
				reply(535, "5.7.8 Authentication credentials invalid")
				continue
			}
			authUser = user
			reply(235, "2.7.0 Authentication successful")
		case "MAIL":
			cur = Message{From: addr(arg), AuthUser: authUser, TLS: secure}
			reply(250, "ok")
		case "RCPT":
			cur.To = append(cur.To, addr(arg))
			reply(250, "ok")
		case "DATA":
			reply(354, "go ahead")
			data, err := tp.ReadDotBytes()
			if err != nil {
				return
			}
			cur.Data = data
			s.mu.Lock()
			s.messages = append(s.messages, cur)
			s.mu.Unlock()
			reply(250, "queued as "+strconv.Itoa(len(data)))
		case "RSET", "NOOP":
			reply(250, "ok")
		case "QUIT":
			reply(221, "bye")
			return
		default:
			reply(500, "unknown command")
		}
	}
}

func addr(arg string) string {
	if i := strings.IndexByte(arg, '<'); i >= 0 {
		if j := strings.IndexByte(arg[i:], '>'); j > 0 {
			return arg[i+1 : i+j]
		}
	}
	return arg
}

func selfSigned(t testing.TB) (tls.Certificate, *x509.CertPool) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "smtptest"},
		NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour),
		IPAddresses: []net.IP{net.ParseIP("127.0.0.1")}, DNSNames: []string{"localhost"},
		KeyUsage: x509.KeyUsageDigitalSignature, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	leaf, _ := x509.ParseCertificate(der)
	pool := x509.NewCertPool()
	pool.AddCert(leaf)
	return tls.Certificate{Certificate: [][]byte{der}, PrivateKey: key, Leaf: leaf}, pool
}
