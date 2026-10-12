package httpapi

import (
	"net/http/httptest"
	"testing"

	"github.com/pixari/opentodo/internal/config"
)

// TestClientAddressBehindTrustedProxies: with OPENTODO_TRUSTED_PROXIES the
// trailing hops of the listed proxies are skipped, and "cloudflare" lets a
// request from a Cloudflare edge name the client with CF-Connecting-IP.
func TestClientAddressBehindTrustedProxies(t *testing.T) {
	t.Cleanup(func() { setTrustedProxies(nil, false) })
	req := func(xff, cf string) string {
		r := httptest.NewRequest("GET", "/", nil)
		r.RemoteAddr = "10.0.1.5:4000"
		if xff != "" {
			r.Header.Set("X-Forwarded-For", xff)
		}
		if cf != "" {
			r.Header.Set("CF-Connecting-IP", cf)
		}
		return clientIP(r)
	}

	// Default: the nearest hop, even when it is a CDN edge.
	setTrustedProxies(nil, false)
	if got := req("198.51.100.7, 172.70.1.1", "198.51.100.7"); got != "172.70.1.1" {
		t.Fatalf("default: %q", got)
	}

	tp := config.ParseTrustedProxies("cloudflare, 192.0.2.0/24")
	if len(tp.Invalid) != 0 || !tp.Cloudflare {
		t.Fatalf("parse: %+v", tp)
	}
	p, cf := tp.Prefixes, tp.Cloudflare
	setTrustedProxies(p, cf)
	cases := []struct{ name, xff, cf, want string }{
		{"proxy keeps the chain", "6.6.6.6, 198.51.100.7, 172.70.1.1", "", "198.51.100.7"},
		{"own proxy then edge", "198.51.100.7, 172.70.1.1, 192.0.2.10", "", "198.51.100.7"},
		{"proxy dropped the chain", "172.70.1.1", "198.51.100.7", "198.51.100.7"},
		{"edge vouches over a forged chain", "6.6.6.6, 172.70.1.1", "198.51.100.9", "198.51.100.9"},
		{"header ignored without an edge hop", "203.0.113.4", "6.6.6.6", "203.0.113.4"},
		{"no header", "", "6.6.6.6", "10.0.1.5"},
		{"all trusted", "192.0.2.1, 192.0.2.2", "", "192.0.2.1"},
	}
	for _, c := range cases {
		if got := req(c.xff, c.cf); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
	// Own proxy listed without the keyword: CF-Connecting-IP is never read.
	p = config.ParseTrustedProxies("192.0.2.0/24").Prefixes
	setTrustedProxies(p, false)
	if got := req("198.51.100.7, 192.0.2.10", "6.6.6.6"); got != "198.51.100.7" {
		t.Fatalf("own proxy: %q", got)
	}
	if got := req("192.0.2.10", "6.6.6.6"); got != "192.0.2.10" {
		t.Fatalf("own proxy, forged CF header: %q", got)
	}
}

// TestInvalidTrustedProxyEntriesNeverWidenTrust (trusted-proxies-lenient): an
// invalid entry is dropped, the valid ones still apply, and with every entry
// invalid the client address is the same as with the variable unset.
func TestInvalidTrustedProxyEntriesNeverWidenTrust(t *testing.T) {
	t.Cleanup(func() { setTrustedProxies(nil, false) })
	req := func(xff, cf string) string {
		r := httptest.NewRequest("GET", "/", nil)
		r.RemoteAddr = "10.0.1.5:4000"
		r.Header.Set("X-Forwarded-For", xff)
		if cf != "" {
			r.Header.Set("CF-Connecting-IP", cf)
		}
		return clientIP(r)
	}
	// Mixed: the CIDR applies, the typo does not trust Cloudflare.
	tp := config.ParseTrustedProxies("cloudflar, 192.0.2.0/24")
	setTrustedProxies(tp.Prefixes, tp.Cloudflare)
	if got := req("198.51.100.7, 192.0.2.10", ""); got != "198.51.100.7" {
		t.Fatalf("valid entry not applied: %q", got)
	}
	if got := req("198.51.100.7, 172.70.1.1", "6.6.6.6"); got != "172.70.1.1" {
		t.Fatalf("typo trusted Cloudflare: %q", got)
	}
	// All invalid: same as unset.
	for _, raw := range []string{"cloudflar", "nope, 10.0.0.0/99, 1.2.3"} {
		tp = config.ParseTrustedProxies(raw)
		setTrustedProxies(tp.Prefixes, tp.Cloudflare)
		for _, c := range []struct{ xff, cf string }{{"198.51.100.7, 172.70.1.1", "198.51.100.7"}, {"6.6.6.6, 192.0.2.10", ""}} {
			got := req(c.xff, c.cf)
			setTrustedProxies(nil, false)
			want := req(c.xff, c.cf)
			setTrustedProxies(tp.Prefixes, tp.Cloudflare)
			if got != want {
				t.Errorf("%q with %q: got %q, unset gives %q", raw, c.xff, got, want)
			}
		}
	}
}
