package httpapi

import (
	"net"
	"net/http"
	"net/netip"
	"strings"
	"sync/atomic"

	"github.com/pixari/opentodo/internal/config"
)

// proxyTrust is the operator's OPENTODO_TRUSTED_PROXIES, installed by New.
type proxyTrust struct {
	prefixes   []netip.Prefix
	cloudflare []netip.Prefix // Cloudflare's edges, when trusted
}

var trustedProxies atomic.Pointer[proxyTrust]

func setTrustedProxies(p []netip.Prefix, cloudflare bool) {
	t := &proxyTrust{prefixes: p}
	if cloudflare {
		for _, r := range config.CloudflareRanges {
			t.cloudflare = append(t.cloudflare, netip.MustParsePrefix(r))
		}
	}
	trustedProxies.Store(t)
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

// clientIP is the address every rate limiter, the demo sandbox limit and the
// audit log use. Behind a reverse proxy it is the LAST X-Forwarded-For entry:
// the one the nearest proxy appended (Traefik, Caddy and nginx append the
// address they saw). Earlier entries come from the client and can be forged, so
// trusting the first one would let anyone evade the limits. Without the header
// it is the connection's address.
//
// With OPENTODO_TRUSTED_PROXIES, trailing hops that belong to those proxies (a
// CDN in front of the reverse proxy) are skipped, so the client is the nearest
// untrusted hop. With "cloudflare", a request that reached us from a Cloudflare
// edge and carries CF-Connecting-IP is attributed to that address, which covers
// reverse proxies that drop the incoming X-Forwarded-For.
func clientIP(r *http.Request) string {
	var hops []string
	for _, v := range r.Header.Values("X-Forwarded-For") {
		for _, part := range strings.Split(v, ",") {
			if hop := strings.TrimSpace(part); hop != "" {
				hops = append(hops, hop)
			}
		}
	}
	if len(hops) == 0 {
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			return r.RemoteAddr
		}
		return host
	}
	t := trustedProxies.Load()
	if t == nil || len(t.prefixes) == 0 {
		return hops[len(hops)-1]
	}
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
