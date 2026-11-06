package httpapi

import (
	"net"
	"net/http"
	"net/netip"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/auth"
)

// localOnlySuffixes are name suffixes public DNS does not answer for, so a
// page under such a name cannot be another site's: reserved for local use
// (RFC 6761, RFC 6762, RFC 8375, ICANN's .internal) or never delegated (.lan,
// .home, .corp).
var localOnlySuffixes = []string{".localhost", ".local", ".lan", ".home", ".home.arpa", ".internal", ".corp", ".test"}

// setupHostVerified reports whether a first registration addressed to host may
// go ahead without the setup code while no OPENTODO_BASE_URL is set (OpenSpec
// change host-check-without-base-url): an IP address, a name with no dot (such
// as `localhost` or a NAS's own name), or a name under a local-only suffix. A
// browser shows a page under such a host only when it really reached that
// address, while a page under a domain name may belong to whoever controls
// that name and points it here (DNS rebinding).
func setupHostVerified(host string) bool {
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	host = strings.ToLower(strings.TrimSuffix(strings.Trim(host, "[]"), "."))
	if i := strings.IndexByte(host, '%'); i >= 0 {
		host = host[:i]
	}
	if host == "" {
		return false
	}
	if _, err := netip.ParseAddr(host); err == nil {
		return true
	}
	if !strings.Contains(host, ".") {
		return true
	}
	for _, suffix := range localOnlySuffixes {
		if strings.HasSuffix(host, suffix) {
			return true
		}
	}
	return false
}

// setupFrom describes where a first registration comes from, for the setup
// code check in internal/auth.
func setupFrom(r *http.Request) auth.SetupFrom {
	return auth.SetupFrom{Local: isLocalSetup(r), UnverifiedHost: !setupHostVerified(requestHost(r))}
}
