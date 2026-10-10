package email

import (
	"net/mail"
	"net/textproto"
	"regexp"
	"strings"
)

// routeHeaders are searched in this order for the inbox address (design D1):
// delivery headers added by the receiving server come first because providers
// keep the original recipient there when they rewrite To (forwarding rules,
// catch-all domains, mailing lists).
var routeHeaders = []string{"Delivered-To", "X-Original-To", "To", "Cc"}

var bareAddr = regexp.MustCompile(`[^\s<>,;:"()\[\]]+@[^\s<>,;:"()\[\]]+`)

// Route finds the secret of the first recipient of the form
// <local>+<secret>@<domain>, matching local part and domain case-insensitively.
// ok is false when no recipient carries a sub-address for the configured
// address; the secret is lowercased but not checked against any account.
func Route(h mail.Header, local, domain string) (secret string, ok bool) {
	prefix := strings.ToLower(local) + "+"
	domain = strings.ToLower(domain)
	for _, name := range routeHeaders {
		for _, v := range h[textproto.CanonicalMIMEHeaderKey(name)] {
			for _, addr := range addresses(v) {
				addr = strings.ToLower(strings.TrimSpace(addr))
				at := strings.LastIndexByte(addr, '@')
				if at < 0 || addr[at+1:] != domain {
					continue
				}
				lp := strings.Trim(addr[:at], `"`)
				if strings.HasPrefix(lp, prefix) && len(lp) > len(prefix) {
					return lp[len(prefix):], true
				}
			}
		}
	}
	return "", false
}

// addresses extracts the addresses of one header value, falling back to a
// lenient scan when the value is not a valid RFC 5322 address list.
func addresses(v string) []string {
	if list, err := mail.ParseAddressList(v); err == nil {
		out := make([]string, len(list))
		for i, a := range list {
			out[i] = a.Address
		}
		return out
	}
	return bareAddr.FindAllString(v, -1)
}
