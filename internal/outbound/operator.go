package outbound

import (
	"errors"
	"net/http"
	"strings"
)

// Operator targets (OpenSpec change `operator-clients-no-env-proxy`).
//
// Backup destinations and the single sign-on issuer are addresses only the
// operator configures, and they may sit on the operator's own network (a NAS,
// a local identity provider), so their clients do not use the Dialer's deny
// list. They keep the rest of the outbound policy: no proxy taken from the
// process environment, which would carry credentials and archives through a
// host nobody configured for them, and redirects only to the same scheme and
// host, so a signed request or an Authorization header never follows a
// redirect to another server.

// ErrCrossHostRedirect: an operator target redirected to another scheme or
// host.
var ErrCrossHostRedirect = errors.New("cross_host_redirect")

// OperatorTransport is http.DefaultTransport's configuration without a proxy
// from the environment.
func OperatorTransport() *http.Transport {
	tr := http.DefaultTransport.(*http.Transport).Clone()
	tr.Proxy = nil
	return tr
}

// SameHostRedirects is a CheckRedirect that follows up to max redirects, each
// to the scheme and host (with port) of the original request. Any other hop
// fails with ErrCrossHostRedirect, more hops with ErrTooManyRedirects.
func SameHostRedirects(max int) func(*http.Request, []*http.Request) error {
	return func(req *http.Request, via []*http.Request) error {
		if len(via) > max {
			return ErrTooManyRedirects
		}
		first := via[0].URL
		if !strings.EqualFold(req.URL.Scheme, first.Scheme) || !strings.EqualFold(req.URL.Host, first.Host) {
			return ErrCrossHostRedirect
		}
		return nil
	}
}
