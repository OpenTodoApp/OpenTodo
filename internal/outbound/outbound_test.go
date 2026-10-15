package outbound

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestDenyListTable(t *testing.T) {
	denied := []string{
		"127.0.0.1", "127.8.9.10", "::1", // loopback
		"169.254.169.254", "169.254.1.1", "fe80::1", // link-local and metadata
		"10.0.0.1", "172.16.5.4", "172.31.255.255", "192.168.1.10", // RFC 1918
		"100.64.0.1", "100.127.255.254", // CGNAT
		"fd00::1", "fd00:ec2::254", "fc00::1", // ULA incl. AWS IPv6 metadata
		"224.0.0.1", "239.255.255.250", "ff02::1", "ff05::2", // multicast
		"0.0.0.0", "::", "0.1.2.3", // unspecified / this network
		"255.255.255.255",                                               // broadcast
		"::ffff:127.0.0.1", "::ffff:10.1.2.3", "::ffff:169.254.169.254", // IPv4-mapped
		"64:ff9b::a00:1", // NAT64 of 10.0.0.1
	}
	allowed := []string{"93.184.216.34", "1.1.1.1", "8.8.8.8", "100.63.255.255", "100.128.0.1", "172.32.0.1", "2606:4700:4700::1111", "::ffff:93.184.216.34"}
	for _, s := range denied {
		if !IsDenied(netip.MustParseAddr(s)) {
			t.Errorf("%s should be denied", s)
		}
	}
	for _, s := range allowed {
		if IsDenied(netip.MustParseAddr(s)) {
			t.Errorf("%s should be allowed", s)
		}
	}
}

func TestValidateURL(t *testing.T) {
	for _, bad := range []string{"ftp://example.com/x", "file:///etc/passwd", "javascript:alert(1)", "http:///nohost", "example.com/hook", "https://" + strings.Repeat("a", MaxURLLength) + ".com"} {
		if _, err := ValidateURL(bad); !errors.Is(err, ErrBadURL) {
			t.Errorf("%q: err = %v", bad, err)
		}
	}
	for _, good := range []string{"https://example.com/hook", "http://192.168.1.10:8123/api/webhook/x", "https://user:pw@n8n.example.org/webhook/abc?x=1"} {
		if _, err := ValidateURL(good); err != nil {
			t.Errorf("%q: %v", good, err)
		}
	}
}

type fakeResolver struct {
	answers [][]netip.Addr
	calls   int
}

func (f *fakeResolver) LookupNetIP(_ context.Context, _, _ string) ([]netip.Addr, error) {
	i := f.calls
	if i >= len(f.answers) {
		i = len(f.answers) - 1
	}
	f.calls++
	return f.answers[i], nil
}

func addrs(s ...string) []netip.Addr {
	out := make([]netip.Addr, len(s))
	for i, a := range s {
		out[i] = netip.MustParseAddr(a)
	}
	return out
}

func TestDialerPinsCheckedAddress(t *testing.T) {
	var dialed []string
	recordDial := func(_ context.Context, _, address string) (net.Conn, error) {
		dialed = append(dialed, address)
		c1, c2 := net.Pipe()
		c2.Close()
		return c1, nil
	}
	// The host resolves to a private and a public address: only the public one is dialled,
	// and it is dialled by IP so no second lookup can happen in between.
	res := &fakeResolver{answers: [][]netip.Addr{addrs("10.0.0.5", "93.184.216.34"), addrs("127.0.0.1")}}
	d := &Dialer{Resolver: res, Dial: recordDial}
	conn, err := d.DialContext(context.Background(), "tcp", "hooks.example.com:443")
	if err != nil {
		t.Fatal(err)
	}
	conn.Close()
	if len(dialed) != 1 || dialed[0] != "93.184.216.34:443" || res.calls != 1 {
		t.Fatalf("dialed %v after %d lookups", dialed, res.calls)
	}

	// Later the name resolves only to private addresses: refused, nothing dialled.
	dialed = nil
	_, err = d.DialContext(context.Background(), "tcp", "hooks.example.com:443")
	if !errors.Is(err, ErrPrivateTarget) || len(dialed) != 0 {
		t.Fatalf("err = %v, dialed = %v", err, dialed)
	}

	// IP literals are checked without DNS, including bracketed IPv6.
	_, err = d.DialContext(context.Background(), "tcp", "[::ffff:169.254.169.254]:80")
	if !errors.Is(err, ErrPrivateTarget) || len(dialed) != 0 {
		t.Fatalf("metadata literal: err = %v, dialed = %v", err, dialed)
	}
}

func TestRedirectsNotFollowed(t *testing.T) {
	var followed atomic.Bool
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { followed.Store(true) }))
	defer target.Close()
	redirect := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, target.URL, http.StatusFound)
	}))
	defer redirect.Close()

	c := NewClient(&Dialer{AllowPrivate: func(context.Context) bool { return true }}, 10*time.Second)
	resp, err := c.Post(redirect.URL, "application/json", strings.NewReader("{}"))
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusFound || followed.Load() {
		t.Fatalf("status %d, followed %v", resp.StatusCode, followed.Load())
	}
}

func TestOwnerOverrideAllowsPrivate(t *testing.T) {
	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { hits.Add(1) }))
	defer srv.Close()
	var allow atomic.Bool
	c := NewClient(&Dialer{AllowPrivate: func(context.Context) bool { return allow.Load() }}, 10*time.Second)

	_, err := c.Post(srv.URL, "application/json", strings.NewReader("{}"))
	if !errors.Is(err, ErrPrivateTarget) || hits.Load() != 0 {
		t.Fatalf("default policy: err = %v, hits = %d", err, hits.Load())
	}
	allow.Store(true)
	resp, err := c.Post(srv.URL, "application/json", strings.NewReader("{}"))
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != 200 || hits.Load() != 1 {
		t.Fatalf("override: status %d, hits %d", resp.StatusCode, hits.Load())
	}
}

func TestClientIgnoresEnvironmentProxy(t *testing.T) {
	c := NewClient(&Dialer{}, 10*time.Second)
	if c.Transport.(*http.Transport).Proxy != nil {
		t.Fatal("an environment proxy would dial on our behalf and bypass the deny list")
	}
}
