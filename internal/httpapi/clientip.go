package httpapi

import (
	"net"
	"net/http"
	"net/netip"
	"strings"
	"sync/atomic"

	"github.com/pixari/opentodo/internal/config"
)

// proxyTrust is the operator's OPENTODO_TRUSTED_PROXIES, installed by New. With
// the variable unset (no prefixes) the default applies: loopback, private and
// link-local networks (OpenSpec change trusted-client-identity).
type proxyTrust struct {
	prefixes   []netip.Prefix
	cloudflare []netip.Prefix // Cloudflare's edges, when trusted
}

var trustedProxies atomic.Pointer[proxyTrust]

// privatePrefixes is config.PrivateRanges parsed once.
var privatePrefixes = func() []netip.Prefix {
	out := make([]netip.Prefix, len(config.PrivateRanges))
	for i, r := range config.PrivateRanges {
		out[i] = netip.MustParsePrefix(r)
	}
	return out
}()

func setTrustedProxies(p []netip.Prefix, cloudflare bool) {
	t := &proxyTrust{prefixes: p}
	if cloudflare {
		for _, r := range config.CloudflareRanges {
			t.cloudflare = append(t.cloudflare, netip.MustParsePrefix(r))
		}
	}
	trustedProxies.Store(t)
}

// trusted returns the prefixes whose X-Forwarded-* headers are believed: the
// configured list, or the default when none is configured.
func trusted() *proxyTrust {
	t := trustedProxies.Load()
	if t == nil || len(t.prefixes) == 0 {
		return &proxyTrust{prefixes: privatePrefixes}
	}
	return t
}

func within(hop string, prefixes []netip.Prefix) bool {
	a, err := netip.ParseAddr(hop)
	if err != nil {
		return false
	}
	a = a.Unmap()
	for _, p := range prefixes {
		if p.Contains(a) {
			return true
		}
	}
	return false
}

// peerAddr is the address of the connection itself.
func peerAddr(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// clientIP is the address every rate limiter, the demo sandbox limit, the
// setup-code check and the audit log use.
//
// X-Forwarded-For is believed only when the connection comes from a trusted
// proxy (OPENTODO_TRUSTED_PROXIES, by default loopback and private networks);
// any other peer is the client whatever it sends. From a trusted peer the
// client is the nearest untrusted hop, reading the chain from the right: each
// proxy appends the address it saw, while earlier entries come from the client
// and can be forged. With "cloudflare", a hop that is a Cloudflare edge and a
// request carrying CF-Connecting-IP is attributed to that address, which covers
// reverse proxies that drop the incoming X-Forwarded-For. When every hop is
// trusted the client is the first one.
func clientIP(r *http.Request) string {
	peer := peerAddr(r)
	t := trusted()
	if !within(peer, t.prefixes) {
		return peer
	}
	var hops []string
	for _, v := range r.Header.Values("X-Forwarded-For") {
		for _, part := range strings.Split(v, ",") {
			if hop := strings.TrimSpace(part); hop != "" {
				hops = append(hops, hop)
			}
		}
	}
	hops = append(hops, peer)
	for i := len(hops) - 1; i >= 0; i-- {
		if !within(hops[i], t.prefixes) {
			return hops[i]
		}
		if within(hops[i], t.cloudflare) {
			if cf, err := netip.ParseAddr(strings.TrimSpace(r.Header.Get("CF-Connecting-IP"))); err == nil {
				return cf.Unmap().String()
			}
		}
	}
	return hops[0]
}

// fromTrustedProxy reports whether the connection itself comes from a trusted
// proxy (see clientIP), the only peers whose X-Forwarded-Host and
// X-Forwarded-Proto are believed.
func fromTrustedProxy(r *http.Request) bool {
	return within(peerAddr(r), trusted().prefixes)
}

// isLocalAddr reports whether a client address is loopback, private or
// link-local: a first registration from there needs no setup code.
// Unparseable addresses are not local.
func isLocalAddr(ip string) bool { return within(ip, privatePrefixes) }

// addrKey is the rate-limit key for a client address: IPv6 addresses are
// grouped by their /64 (one subscriber usually holds a whole /64), IPv4 and
// IPv4-mapped addresses stay as they are, anything else is returned unchanged.
func addrKey(ip string) string {
	a, err := netip.ParseAddr(ip)
	if err != nil {
		return ip
	}
	a = a.Unmap()
	if a.Is4() {
		return a.String()
	}
	p, err := a.WithZone("").Prefix(64)
	if err != nil {
		return ip
	}
	return p.String()
}

// requestIsHTTPS reports whether the client reached us over https: TLS on
// this connection, or a trusted proxy saying so in X-Forwarded-Proto.
func requestIsHTTPS(r *http.Request) bool {
	return r.TLS != nil || fromTrustedProxy(r) && strings.EqualFold(firstHeaderValue(r, "X-Forwarded-Proto"), "https")
}
