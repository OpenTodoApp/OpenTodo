package config

import (
	"fmt"
	"net/netip"
	"strings"
)

// CloudflareRanges are Cloudflare's published edge address ranges
// (https://www.cloudflare.com/ips/), embedded so trusting Cloudflare needs no
// network request. OPENTODO_TRUSTED_PROXIES=cloudflare expands to these.
var CloudflareRanges = []string{
	"173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
	"141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
	"197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
	"104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
	"2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32",
	"2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32",
}

// ParseTrustedProxies parses OPENTODO_TRUSTED_PROXIES: a comma-separated list of
// IP addresses, CIDR prefixes and the keyword "cloudflare". It reports whether
// the keyword was present.
func ParseTrustedProxies(raw string) ([]netip.Prefix, bool, error) {
	var out []netip.Prefix
	cloudflare := false
	for _, item := range strings.Split(raw, ",") {
		item = strings.TrimSpace(item)
		switch {
		case item == "":
			continue
		case strings.EqualFold(item, "cloudflare"):
			cloudflare = true
			for _, r := range CloudflareRanges {
				out = append(out, netip.MustParsePrefix(r))
			}
		case strings.Contains(item, "/"):
			p, err := netip.ParsePrefix(item)
			if err != nil {
				return nil, false, fmt.Errorf("OPENTODO_TRUSTED_PROXIES: %q is not a CIDR prefix", item)
			}
			out = append(out, p.Masked())
		default:
			a, err := netip.ParseAddr(item)
			if err != nil {
				return nil, false, fmt.Errorf("OPENTODO_TRUSTED_PROXIES: %q is not an IP address, CIDR prefix or \"cloudflare\"", item)
			}
			out = append(out, netip.PrefixFrom(a.Unmap(), a.Unmap().BitLen()))
		}
	}
	return out, cloudflare, nil
}
