package webhook

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"time"
)

// Delivery limits.
const (
	DeliveryTimeout = 10 * time.Second
	ExcerptBytes    = 1024
	MaxURLLength    = 2048
)

var (
	// ErrPrivateTarget means every address of the target host is in a denied range
	// and the owner has not allowed private network targets.
	ErrPrivateTarget = errors.New("private_target")
	// ErrBadURL covers scheme, host and length problems with a target URL.
	ErrBadURL = errors.New("invalid url")
)

// deniedPrefixes are the ranges refused unless the owner allows private targets.
// The net/netip predicates below cover loopback, link-local (including the
// 169.254.169.254 metadata address), RFC 1918, fc00::/7 (ULA, which contains
// fd00::/8 and fd00:ec2::254), multicast and unspecified; these add the rest.
var deniedPrefixes = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"),          // "this network"
	netip.MustParsePrefix("100.64.0.0/10"),      // CGNAT, also Tailscale
	netip.MustParsePrefix("192.0.0.0/24"),       // IETF protocol assignments
	netip.MustParsePrefix("198.18.0.0/15"),      // benchmarking
	netip.MustParsePrefix("240.0.0.0/4"),        // reserved, includes broadcast
	netip.MustParsePrefix("64:ff9b::/96"),       // NAT64 can embed any IPv4
	netip.MustParsePrefix("64:ff9b:1::/48"),     // local-use NAT64
	netip.MustParsePrefix("2002::/16"),          // 6to4 can embed any IPv4
	netip.MustParsePrefix("::/96"),              // IPv4-compatible (deprecated)
	netip.MustParsePrefix("fec0::/10"),          // site-local (deprecated)
	netip.MustParsePrefix("100::/64"),           // discard-only
	netip.MustParsePrefix("2001:db8::/32"),      // documentation
	netip.MustParsePrefix("169.254.169.254/32"), // cloud metadata (explicit)
}

// IsDenied reports whether connecting to addr must be refused by default.
// IPv4-mapped IPv6 addresses (::ffff:a.b.c.d) are judged as their IPv4 form.
func IsDenied(addr netip.Addr) bool {
	if !addr.IsValid() {
		return true
	}
	addr = addr.Unmap()
	if addr.IsLoopback() || addr.IsPrivate() || addr.IsUnspecified() ||
		addr.IsLinkLocalUnicast() || addr.IsLinkLocalMulticast() ||
		addr.IsInterfaceLocalMulticast() || addr.IsMulticast() {
		return true
	}
	for _, p := range deniedPrefixes {
		if p.Contains(addr) {
			return true
		}
	}
	return false
}

// ValidateURL checks the parts of a target URL that do not need the network:
// http or https only, a host, no fragment-only tricks, at most MaxURLLength.
func ValidateURL(raw string) (*url.URL, error) {
	if len(raw) > MaxURLLength {
		return nil, fmt.Errorf("%w: url is longer than %d characters", ErrBadURL, MaxURLLength)
	}
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return nil, fmt.Errorf("%w: url does not parse", ErrBadURL)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, fmt.Errorf("%w: url scheme must be http or https", ErrBadURL)
	}
	if u.Hostname() == "" {
		return nil, fmt.Errorf("%w: url must include a host", ErrBadURL)
	}
	return u, nil
}

// Resolver is the subset of *net.Resolver the dialer uses; tests inject fakes.
type Resolver interface {
	LookupNetIP(ctx context.Context, network, host string) ([]netip.Addr, error)
}

// Dialer resolves the host itself, filters the addresses, then dials the first
// allowed address directly. Because the connection goes to the very address
// that was checked, a second DNS answer cannot swap in a private one.
type Dialer struct {
	Resolver     Resolver
	AllowPrivate func(ctx context.Context) bool
	// Dial opens the TCP connection to an already-checked "ip:port".
	Dial func(ctx context.Context, network, address string) (net.Conn, error)
}

// Allowed returns the subset of host's addresses that may be dialled. It errors
// with ErrPrivateTarget when the host resolves only to denied addresses.
func (d *Dialer) Allowed(ctx context.Context, host string) ([]netip.Addr, error) {
	var addrs []netip.Addr
	if a, err := netip.ParseAddr(strings.Trim(host, "[]")); err == nil {
		addrs = []netip.Addr{a}
	} else {
		addrs, err = d.Resolver.LookupNetIP(ctx, "ip", host)
		if err != nil {
			return nil, fmt.Errorf("resolve %s: %w", host, err)
		}
	}
	allowPrivate := d.AllowPrivate != nil && d.AllowPrivate(ctx)
	out := make([]netip.Addr, 0, len(addrs))
	for _, a := range addrs {
		if allowPrivate || !IsDenied(a) {
			out = append(out, a.Unmap())
		}
	}
	if len(out) == 0 {
		if len(addrs) == 0 {
			return nil, fmt.Errorf("resolve %s: no addresses", host)
		}
		return nil, ErrPrivateTarget
	}
	return out, nil
}

// DialContext is plugged into http.Transport.
func (d *Dialer) DialContext(ctx context.Context, network, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, err
	}
	addrs, err := d.Allowed(ctx, host)
	if err != nil {
		return nil, err
	}
	return d.Dial(ctx, network, net.JoinHostPort(addrs[0].String(), port))
}

// NewClient builds the delivery client: SSRF-safe dialer, no proxy from the
// environment (a proxy would dial on our behalf, bypassing the checks), no
// redirects, and the 10 s overall timeout.
func NewClient(d *Dialer) *http.Client {
	if d.Resolver == nil {
		d.Resolver = net.DefaultResolver
	}
	if d.Dial == nil {
		nd := &net.Dialer{Timeout: DeliveryTimeout, KeepAlive: 30 * time.Second}
		d.Dial = nd.DialContext
	}
	tr := &http.Transport{
		Proxy:                 nil,
		DialContext:           d.DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          8,
		IdleConnTimeout:       60 * time.Second,
		TLSHandshakeTimeout:   DeliveryTimeout,
		ResponseHeaderTimeout: DeliveryTimeout,
	}
	return &http.Client{
		Transport: tr,
		Timeout:   DeliveryTimeout,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

// readExcerpt reads at most ExcerptBytes of a response body for the log and
// discards the rest without reading it.
func readExcerpt(r io.Reader) string {
	b, _ := io.ReadAll(io.LimitReader(r, ExcerptBytes))
	return strings.ToValidUTF8(string(b), "�")
}
