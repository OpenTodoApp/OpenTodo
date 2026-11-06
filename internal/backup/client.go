package backup

import (
	"net/http"

	"github.com/OpenTodoApp/opentodo/internal/outbound"
)

// MaxRedirects is how many redirects a destination request may follow, each
// to the destination's own scheme and host.
const MaxRedirects = 3

// NewHTTPClient is the client of every destination request (OpenSpec change
// `operator-clients-no-env-proxy`). A destination is an address only the
// operator configures and may be on the local network, so there is no deny
// list; but no proxy is taken from the environment, and a redirect is followed
// only to the same scheme and host, so archives, signed S3 requests and WebDAV
// credentials never reach a server the operator did not name. There is no
// client-wide timeout: each request has a progress deadline (requestIdle), so
// large archives are not cut off at a fixed time.
func NewHTTPClient() *http.Client {
	return &http.Client{
		Transport:     outbound.OperatorTransport(),
		CheckRedirect: outbound.SameHostRedirects(MaxRedirects),
	}
}
