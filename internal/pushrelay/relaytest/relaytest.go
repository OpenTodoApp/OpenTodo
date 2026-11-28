// Package relaytest runs the real push relay in-process against a fake APNs,
// for the relay's own tests and the server's (OpenSpec change ios-push-relay,
// design D11). Test-only.
package relaytest

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/pushrelay"
)

// Push is one request the fake APNs received.
type Push struct {
	Path   string
	Header http.Header
	Body   string
	Proto  string
}

// APNs is a fake of Apple's push service over HTTP/2 and TLS.
type APNs struct {
	Server *httptest.Server
	mu     sync.Mutex
	pushes []Push
	// Answer, when set, chooses the status and reason of the next answers.
	answer func(p Push) (int, string)
}

// NewAPNs starts a fake APNs.
func NewAPNs(t testing.TB) *APNs {
	a := &APNs{}
	srv := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		p := Push{Path: r.URL.Path, Header: r.Header.Clone(), Body: string(b), Proto: r.Proto}
		a.mu.Lock()
		a.pushes = append(a.pushes, p)
		answer := a.answer
		a.mu.Unlock()
		status, reason := http.StatusOK, ""
		if answer != nil {
			status, reason = answer(p)
		}
		if reason != "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(status)
			_, _ = io.WriteString(w, `{"reason":"`+reason+`"}`)
			return
		}
		w.WriteHeader(status)
	}))
	srv.EnableHTTP2 = true
	srv.StartTLS()
	t.Cleanup(srv.Close)
	a.Server = srv
	return a
}

// Answer sets how the fake answers from now on.
func (a *APNs) Answer(f func(p Push) (int, string)) {
	a.mu.Lock()
	a.answer = f
	a.mu.Unlock()
}

// Pushes returns what the fake received so far.
func (a *APNs) Pushes() []Push {
	a.mu.Lock()
	defer a.mu.Unlock()
	return append([]Push(nil), a.pushes...)
}

// Clock is a settable clock.
type Clock struct{ ns atomic.Int64 }

// NewClock starts at t.
func NewClock(t time.Time) *Clock {
	c := &Clock{}
	c.Set(t)
	return c
}

// Now reads the clock.
func (c *Clock) Now() time.Time { return time.Unix(0, c.ns.Load()) }

// Set moves the clock to t.
func (c *Clock) Set(t time.Time) { c.ns.Store(t.UnixNano()) }

// Add moves the clock by d.
func (c *Clock) Add(d time.Duration) { c.ns.Add(int64(d)) }

// Env is a running relay with its fake APNs.
type Env struct {
	Relay  *pushrelay.Relay
	Server *httptest.Server // the relay, over plain HTTP
	APNs   *APNs
	Clock  *Clock
	Keys   *pushrelay.Keyring
	Key    *ecdsa.PrivateKey
	// IP is the client address every request appears to come from.
	IP atomic.Value
}

// SealKey makes a random sealing key with id.
func SealKey(id byte) pushrelay.SealKey {
	k := make([]byte, 32)
	_, _ = rand.Read(k)
	return pushrelay.SealKey{ID: id, Key: k}
}

// New starts a relay with one sealing key, a fake APNs for both environments
// and a clock at start.
func New(t testing.TB, start time.Time, keys ...pushrelay.SealKey) *Env {
	t.Helper()
	if len(keys) == 0 {
		keys = []pushrelay.SealKey{SealKey(1)}
	}
	ring, err := pushrelay.NewKeyring(keys)
	if err != nil {
		t.Fatal(err)
	}
	e := &Env{APNs: NewAPNs(t), Clock: NewClock(start), Keys: ring}
	e.IP.Store("203.0.113.7")
	e.Key, _ = ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	apns, err := pushrelay.NewAPNs(pushrelay.APNsConfig{Key: e.Key, KeyID: "KEYID12345", TeamID: "TEAMID1234", Now: e.Clock.Now,
		Hosts:  map[pushrelay.Environment]string{pushrelay.Production: e.APNs.Server.URL, pushrelay.Development: e.APNs.Server.URL},
		Client: e.APNs.Server.Client()})
	if err != nil {
		t.Fatal(err)
	}
	e.Relay = pushrelay.New(pushrelay.Options{Keys: ring, APNs: apns, Now: e.Clock.Now,
		ClientIP: func(*http.Request) string { return e.IP.Load().(string) }})
	e.Server = httptest.NewServer(e.Relay)
	t.Cleanup(e.Server.Close)
	return e
}
