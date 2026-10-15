package mail

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"net"
	"net/mail"
	"net/smtp"
	"net/textproto"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/config"
)

// Transport budget (design D2).
const (
	ConnectTimeout = 10 * time.Second
	SendTimeout    = 15 * time.Second
)

// Failure stages reported to the owner and recorded as the audit reason.
const (
	StageConnect = "connect"
	StageTLS     = "tls"
	StageAuth    = "auth"
	StageSend    = "send"
)

// SendError is a failed delivery: the stage it failed at and the server's
// reply (or a short description), never the message or its link.
type SendError struct {
	Stage string
	Reply string
}

func (e *SendError) Error() string { return e.Stage + ": " + e.Reply }

// Transport talks SMTP with net/smtp. smtp.SendMail is not used because it
// does not insist on STARTTLS before AUTH.
type Transport struct {
	// LocalName is the EHLO name (the server's public host); "localhost" when empty.
	LocalName string
	// RootCAs overrides the system pool (tests with smtptest).
	RootCAs *x509.CertPool
	// Timeout overrides SendTimeout (tests).
	Timeout time.Duration
}

func stageErr(stage string, err error) *SendError {
	var tp *textproto.Error
	reply := ""
	switch {
	case errors.As(err, &tp):
		reply = strconv.Itoa(tp.Code) + " " + tp.Msg
	case errors.Is(err, context.DeadlineExceeded) || isTimeout(err):
		reply = "timed out"
	default:
		reply = err.Error()
	}
	if len(reply) > 300 {
		reply = reply[:300]
	}
	return &SendError{Stage: stage, Reply: strings.TrimSpace(reply)}
}

func isTimeout(err error) bool {
	var ne net.Error
	return errors.As(err, &ne) && ne.Timeout()
}

// Envelope returns the bare address of a From value.
func Envelope(from string) (string, error) {
	a, err := mail.ParseAddress(from)
	if err != nil {
		return "", err
	}
	return a.Address, nil
}

// Send delivers data to one recipient with c, within the transport budget.
func (t *Transport) Send(ctx context.Context, c Config, to string, data []byte) (err error) {
	budget := t.Timeout
	if budget <= 0 {
		budget = SendTimeout
	}
	ctx, cancel := context.WithTimeout(ctx, budget)
	defer cancel()
	from, perr := Envelope(c.From)
	if perr != nil {
		return &SendError{Stage: StageSend, Reply: "the From address is not valid"}
	}
	if c.Security == config.SMTPSecurityNone && c.User != "" {
		return &SendError{Stage: StageTLS, Reply: "credentials are never sent without TLS"}
	}
	addr := net.JoinHostPort(c.Host, strconv.Itoa(c.Port))
	d := net.Dialer{Timeout: min(ConnectTimeout, budget)}
	conn, derr := d.DialContext(ctx, "tcp", addr)
	if derr != nil {
		return stageErr(StageConnect, derr)
	}
	deadline, _ := ctx.Deadline()
	_ = conn.SetDeadline(deadline)
	stop := context.AfterFunc(ctx, func() { conn.Close() })
	defer stop()
	defer conn.Close()
	tlsConf := &tls.Config{ServerName: c.Host, MinVersion: tls.VersionTLS12, RootCAs: t.RootCAs}
	if c.Security == config.SMTPSecurityTLS {
		tc := tls.Client(conn, tlsConf)
		if herr := tc.HandshakeContext(ctx); herr != nil {
			return stageErr(StageTLS, herr)
		}
		conn = tc
	}
	cl, cerr := smtp.NewClient(conn, c.Host)
	if cerr != nil {
		return stageErr(StageConnect, cerr)
	}
	defer cl.Close()
	name := t.LocalName
	if name == "" {
		name = "localhost"
	}
	if herr := cl.Hello(name); herr != nil {
		return stageErr(StageConnect, herr)
	}
	if c.Security == config.SMTPSecurityStartTLS {
		if ok, _ := cl.Extension("STARTTLS"); !ok {
			return &SendError{Stage: StageTLS, Reply: "the server does not offer STARTTLS"}
		}
		if serr := cl.StartTLS(tlsConf); serr != nil {
			return stageErr(StageTLS, serr)
		}
	}
	if c.User != "" {
		ok, mechs := cl.Extension("AUTH")
		if !ok {
			return &SendError{Stage: StageAuth, Reply: "the server does not offer authentication"}
		}
		list := strings.Fields(strings.ToUpper(mechs))
		var a smtp.Auth
		if !slices.Contains(list, "PLAIN") && slices.Contains(list, "LOGIN") {
			a = &loginAuth{user: c.User, pass: c.Password}
		} else {
			a = smtp.PlainAuth("", c.User, c.Password, c.Host)
		}
		if aerr := cl.Auth(a); aerr != nil {
			return stageErr(StageAuth, aerr)
		}
	}
	if merr := cl.Mail(from); merr != nil {
		return stageErr(StageSend, merr)
	}
	if rerr := cl.Rcpt(to); rerr != nil {
		return stageErr(StageSend, rerr)
	}
	w, werr := cl.Data()
	if werr != nil {
		return stageErr(StageSend, werr)
	}
	if _, werr := w.Write(data); werr != nil {
		return stageErr(StageSend, werr)
	}
	if werr := w.Close(); werr != nil {
		return stageErr(StageSend, werr)
	}
	_ = cl.Quit()
	return nil
}

// loginAuth is the LOGIN mechanism, which Microsoft 365 and some relays offer
// instead of PLAIN. It is only used over TLS (Send refuses credentials otherwise).
type loginAuth struct{ user, pass string }

func (a *loginAuth) Start(server *smtp.ServerInfo) (string, []byte, error) {
	if !server.TLS {
		return "", nil, errors.New("unencrypted connection")
	}
	return "LOGIN", nil, nil
}

func (a *loginAuth) Next(fromServer []byte, more bool) ([]byte, error) {
	if !more {
		return nil, nil
	}
	switch strings.ToLower(strings.TrimSpace(string(fromServer))) {
	case "username:", "user name:", "username":
		return []byte(a.user), nil
	case "password:", "password":
		return []byte(a.pass), nil
	}
	return nil, fmt.Errorf("unexpected LOGIN challenge %q", fromServer)
}
