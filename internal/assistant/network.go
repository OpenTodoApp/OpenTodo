package assistant

import (
	"context"
	"errors"
	"net"
	"net/http"
	"time"

	"github.com/pixari/opentodo/internal/webhook"
)

// Network policy (design D4). The server connects only to the hosts of enabled
// providers. The compatible base URL goes through the webhooks address checks
// (internal/webhook, reused): at save time and on every connection after name
// resolution, loopback, private, link-local and metadata addresses are refused
// unless the owner allowed private endpoints; the connection goes to the
// address that was checked; redirects are never followed; no proxy from the
// environment (it would dial on our behalf, bypassing the checks).

// Network holds the injectable resolver and dialer (tests use fakes).
type Network struct {
	Resolver webhook.Resolver
	Dial     func(ctx context.Context, network, address string) (net.Conn, error)
}

const (
	connectTimeout = 15 * time.Second
	// headerTimeout bounds the wait for the first response byte; a streamed
	// answer may then take as long as the turn's context allows.
	headerTimeout = 90 * time.Second
)

func noRedirects(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }

func (n Network) dialer(allowPrivate bool) *webhook.Dialer {
	d := &webhook.Dialer{Resolver: n.Resolver, Dial: n.Dial, AllowPrivate: func(context.Context) bool { return allowPrivate }}
	if d.Resolver == nil {
		d.Resolver = net.DefaultResolver
	}
	if d.Dial == nil {
		nd := &net.Dialer{Timeout: connectTimeout, KeepAlive: 30 * time.Second}
		d.Dial = nd.DialContext
	}
	return d
}

// CompatibleClient is the HTTP client for an owner-entered base URL.
func (n Network) CompatibleClient(allowPrivate bool) *http.Client {
	d := n.dialer(allowPrivate)
	return &http.Client{
		Transport: &http.Transport{
			Proxy:                 nil,
			DialContext:           d.DialContext,
			ForceAttemptHTTP2:     true,
			MaxIdleConns:          4,
			IdleConnTimeout:       60 * time.Second,
			TLSHandshakeTimeout:   connectTimeout,
			ResponseHeaderTimeout: headerTimeout,
		},
		CheckRedirect: noRedirects,
	}
}

// FixedClient is the HTTP client for the built-in provider hosts (Anthropic,
// OpenAI, Gemini). An operator's outbound proxy from the environment applies.
func FixedClient() *http.Client {
	return &http.Client{
		Transport: &http.Transport{
			Proxy:                 http.ProxyFromEnvironment,
			ForceAttemptHTTP2:     true,
			MaxIdleConns:          4,
			IdleConnTimeout:       60 * time.Second,
			TLSHandshakeTimeout:   connectTimeout,
			ResponseHeaderTimeout: headerTimeout,
		},
		CheckRedirect: noRedirects,
	}
}

// CheckBaseURL validates a compatible base URL at save time: http or https,
// a host, and at least one allowed address after resolution.
func (n Network) CheckBaseURL(ctx context.Context, raw string, allowPrivate bool) error {
	u, err := webhook.ValidateURL(raw)
	if err != nil {
		return invalid("providers.compatible.base_url", "must be an http or https URL with a host")
	}
	if u.User != nil {
		return invalid("providers.compatible.base_url", "must not contain a user name or password; enter the key in the key field")
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if _, err := n.dialer(allowPrivate).Allowed(ctx, u.Hostname()); err != nil {
		if errors.Is(err, webhook.ErrPrivateTarget) {
			return ErrPrivateTarget
		}
		return invalid("providers.compatible.base_url", "the host does not resolve")
	}
	return nil
}
