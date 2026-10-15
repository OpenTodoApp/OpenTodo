package webhook

import (
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/outbound"
)

// The outbound policy lives in internal/outbound (shared with calendar
// subscriptions); these names keep the webhook package's API unchanged.

// Delivery limits.
const (
	DeliveryTimeout = 10 * time.Second
	ExcerptBytes    = 1024
	MaxURLLength    = outbound.MaxURLLength
)

var (
	// ErrPrivateTarget means every address of the target host is in a denied range
	// and the owner has not allowed private network targets.
	ErrPrivateTarget = outbound.ErrPrivateTarget
	// ErrBadURL covers scheme, host and length problems with a target URL.
	ErrBadURL = outbound.ErrBadURL
	// ValidateURL checks the parts of a target URL that do not need the network.
	ValidateURL = outbound.ValidateURL
	// IsDenied reports whether connecting to addr must be refused by default.
	IsDenied = outbound.IsDenied
)

// Resolver and Dialer are the outbound package's.
type (
	Resolver = outbound.Resolver
	Dialer   = outbound.Dialer
)

// NewClient builds the delivery client: no redirects and the 10 s timeout.
func NewClient(d *Dialer) *http.Client {
	return outbound.NewClient(d, DeliveryTimeout)
}

// readExcerpt reads at most ExcerptBytes of a response body for the log and
// discards the rest without reading it.
func readExcerpt(r io.Reader) string {
	b, _ := io.ReadAll(io.LimitReader(r, ExcerptBytes))
	return strings.ToValidUTF8(string(b), "\ufffd")
}
