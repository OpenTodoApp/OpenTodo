package config

import (
	"fmt"
	"net/netip"
	"strings"
	"unicode"
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

// trustedProxiesAccepted names what an OPENTODO_TRUSTED_PROXIES entry may be,
// for the startup log and the owner's warning.
const trustedProxiesAccepted = `IP addresses, CIDR prefixes (such as 192.0.2.0/24) and the keyword "cloudflare", separated by commas or spaces`

// TrustedProxies is a parsed OPENTODO_TRUSTED_PROXIES (OpenSpec
// `trusted-proxies-lenient`). Invalid entries are not an error: they are left
// out and listed in Invalid. Leaving an entry out only ever trusts fewer hops,
// so a typo can never widen trust; with every entry invalid the result equals
// an unset variable.
type TrustedProxies struct {
	Prefixes   []netip.Prefix
	Cloudflare bool     // the keyword was present
	Applied    []string // the valid entries as written, for the log
	Invalid    []string // entries that are none of the accepted forms
	Hint       string   // "did you mean …?" for a near miss, else empty
}

// ParseTrustedProxies parses OPENTODO_TRUSTED_PROXIES: IP addresses, CIDR
// prefixes and the keyword "cloudflare" (any case), separated by commas and/or
// whitespace. It never fails; see TrustedProxies.
func ParseTrustedProxies(raw string) TrustedProxies {
	var t TrustedProxies
	items := strings.FieldsFunc(raw, func(r rune) bool { return r == ',' || unicode.IsSpace(r) })
	for _, item := range items {
		switch {
		case strings.EqualFold(item, "cloudflare"):
			if !t.Cloudflare {
				t.Cloudflare = true
				for _, r := range CloudflareRanges {
					t.Prefixes = append(t.Prefixes, netip.MustParsePrefix(r))
				}
			}
			t.Applied = append(t.Applied, "cloudflare")
		case strings.Contains(item, "/"):
			p, err := netip.ParsePrefix(item)
			if err != nil {
				t.Invalid = append(t.Invalid, item)
				continue
			}
			t.Prefixes = append(t.Prefixes, p.Masked())
			t.Applied = append(t.Applied, item)
		default:
			a, err := netip.ParseAddr(item)
			if err != nil || a.Zone() != "" {
				t.Invalid = append(t.Invalid, item)
				continue
			}
			t.Prefixes = append(t.Prefixes, netip.PrefixFrom(a.Unmap(), a.Unmap().BitLen()))
			t.Applied = append(t.Applied, item)
		}
	}
	for _, bad := range t.Invalid {
		if editDistance(strings.ToLower(bad), "cloudflare") <= 2 {
			t.Hint = `did you mean "cloudflare"?`
			break
		}
	}
	return t
}

// Warning returns the configuration warning for the invalid entries, or false
// when every entry was valid.
func (t TrustedProxies) Warning() (Warning, bool) {
	if len(t.Invalid) == 0 {
		return Warning{}, false
	}
	quoted := make([]string, len(t.Invalid))
	for i, s := range t.Invalid {
		quoted[i] = fmt.Sprintf("%q", s)
	}
	verb := "is not a valid entry and is"
	if len(quoted) > 1 {
		verb = "are not valid entries and are"
	}
	msg := fmt.Sprintf("%s %s ignored", strings.Join(quoted, ", "), verb)
	if t.Hint != "" {
		msg += " (" + t.Hint + ")"
	}
	msg += ". Accepted: " + trustedProxiesAccepted + "."
	if len(t.Applied) == 0 {
		msg += " No entry is valid, so only the nearest proxy is trusted, as when the variable is unset."
	} else {
		msg += " Still applied: " + strings.Join(t.Applied, ", ") + "."
	}
	msg += " Fix the value in the server's environment and restart it."
	applied := "none (only the nearest proxy is trusted, as when unset)"
	if len(t.Applied) > 0 {
		applied = strings.Join(t.Applied, ",")
	}
	attrs := []any{"invalid", strings.Join(t.Invalid, ",")}
	if t.Hint != "" {
		attrs = append(attrs, "hint", t.Hint)
	}
	attrs = append(attrs, "accepted", trustedProxiesAccepted, "applied", applied)
	return Warning{Variable: "OPENTODO_TRUSTED_PROXIES", Message: msg, Ignored: t.Invalid, logAttrs: attrs}, true
}

// editDistance is the Levenshtein distance between a and b (bytes; the
// keyword is ASCII).
func editDistance(a, b string) int {
	prev := make([]int, len(b)+1)
	cur := make([]int, len(b)+1)
	for j := range prev {
		prev[j] = j
	}
	for i := 1; i <= len(a); i++ {
		cur[0] = i
		for j := 1; j <= len(b); j++ {
			cost := 1
			if a[i-1] == b[j-1] {
				cost = 0
			}
			cur[j] = min(prev[j]+1, cur[j-1]+1, prev[j-1]+cost)
		}
		prev, cur = cur, prev
	}
	return prev[len(b)]
}
