package issues

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	ob "github.com/pixari/opentodo/internal/outbound"
)

// Request limits (spec "Request limits", design D2).
const (
	Timeout = 20 * time.Second
	MaxBody = 2 << 20
	PerPage = 100
)

// NewHTTPClient builds the client of every provider request: the outbound
// policy's dialer (the webhooks' private-network switch), no proxy, a 20 s
// timeout and no redirects (outbound.NewClient follows none unless asked: a
// redirect would carry the token to another host).
func NewHTTPClient(allowPrivate func(context.Context) bool) *http.Client {
	return ob.NewClient(&ob.Dialer{AllowPrivate: allowPrivate}, Timeout)
}

// api performs GET requests against one provider API base with the token.
type api struct {
	client  *http.Client
	base    string
	auth    func(h http.Header)
	version string
	now     func() time.Time
}

// response is a successful answer: the body (nil for 304) and its headers.
type response struct {
	body        []byte
	header      http.Header
	notModified bool
}

// get requests base+path?query, conditional on etag when set.
func (a *api) get(ctx context.Context, path string, query url.Values, etag string) (*response, error) {
	target := a.base + path
	if len(query) > 0 {
		target += "?" + query.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return nil, &Error{ReasonConnection}
	}
	req.Header.Set("User-Agent", "OpenTodo/"+a.version)
	a.auth(req.Header)
	if etag != "" {
		req.Header.Set("If-None-Match", etag)
	}
	resp, err := a.client.Do(req)
	if err != nil {
		return nil, &Error{transportReason(err)}
	}
	defer resp.Body.Close()
	switch {
	case resp.StatusCode == http.StatusNotModified:
		return &response{header: resp.Header, notModified: true}, nil
	case resp.StatusCode >= 300 && resp.StatusCode < 400:
		return nil, &Error{ReasonRedirect}
	case resp.StatusCode == http.StatusTooManyRequests, resp.StatusCode == http.StatusForbidden && rateLimited(resp.Header):
		return nil, &RateLimitedError{Until: resetTime(resp.Header, a.now())}
	case resp.StatusCode == http.StatusUnauthorized, resp.StatusCode == http.StatusForbidden:
		return nil, &Error{ReasonUnauthorized}
	case resp.StatusCode == http.StatusNotFound:
		return nil, &Error{ReasonNotFoundRemote}
	case resp.StatusCode < 200 || resp.StatusCode >= 300:
		return nil, &Error{fmt.Sprintf("http_%d", resp.StatusCode)}
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, MaxBody+1))
	if err != nil {
		return nil, &Error{transportReason(err)}
	}
	if len(body) > MaxBody {
		return nil, &Error{ReasonTooLarge}
	}
	return &response{body: body, header: resp.Header}, nil
}

// rateLimited reports whether a 403 is the provider's rate limit rather than a
// refused token: a Retry-After or an exhausted remaining count.
func rateLimited(h http.Header) bool {
	return h.Get("Retry-After") != "" || h.Get("X-RateLimit-Remaining") == "0" || h.Get("RateLimit-Remaining") == "0"
}

// resetTime reads when requests may resume: X-RateLimit-Reset or
// RateLimit-Reset (Unix seconds), else Retry-After (seconds or an HTTP date),
// else one minute from now.
func resetTime(h http.Header, now time.Time) time.Time {
	for _, k := range []string{"X-RateLimit-Reset", "RateLimit-Reset"} {
		if v, err := strconv.ParseInt(strings.TrimSpace(h.Get(k)), 10, 64); err == nil && v > 0 {
			if t := time.Unix(v, 0); t.After(now) {
				return t
			}
		}
	}
	if ra := strings.TrimSpace(h.Get("Retry-After")); ra != "" {
		if s, err := strconv.Atoi(ra); err == nil && s >= 0 {
			return now.Add(time.Duration(s) * time.Second)
		}
		if t, err := http.ParseTime(ra); err == nil && t.After(now) {
			return t
		}
	}
	return now.Add(time.Minute)
}

// transportReason maps a transport error to a stored reason.
func transportReason(err error) string {
	var ue *url.Error
	var ne net.Error
	switch {
	case errors.Is(err, ob.ErrPrivateTarget):
		return ReasonPrivateTarget
	case errors.Is(err, context.DeadlineExceeded):
		return ReasonTimeout
	case errors.As(err, &ue) && ue.Timeout():
		return ReasonTimeout
	case errors.As(err, &ne) && ne.Timeout():
		return ReasonTimeout
	}
	return ReasonConnection
}

// isoTime is the updated-since parameter: the cursor minus one second, since
// both providers compare inclusively and the deterministic op ids make the
// overlap harmless (design, Risks).
func isoTime(ms int64) string {
	return time.UnixMilli(ms).Add(-time.Second).UTC().Format(time.RFC3339)
}

func parseTime(s string) int64 {
	if s == "" {
		return 0
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return 0
	}
	return t.UnixMilli()
}

// hasNext reports whether a page has a successor: a Link rel="next", GitLab's
// X-Next-Page, or a full page when neither header is present.
func hasNext(h http.Header, n int) bool {
	if l := h.Get("Link"); l != "" {
		return strings.Contains(l, `rel="next"`)
	}
	if _, ok := h["X-Next-Page"]; ok {
		return strings.TrimSpace(h.Get("X-Next-Page")) != ""
	}
	return n >= PerPage
}

// NewProvider builds the provider client of a connection.
func NewProvider(client *http.Client, provider, host, token, version string) (Provider, error) {
	a := &api{client: client, base: APIBase(provider, host), version: version, now: time.Now}
	switch provider {
	case GitHub:
		a.auth = func(h http.Header) {
			h.Set("Accept", "application/vnd.github+json")
			h.Set("Authorization", "Bearer "+token)
			h.Set("X-GitHub-Api-Version", "2022-11-28")
		}
		return &githubClient{api: a}, nil
	case GitLab:
		a.auth = func(h http.Header) {
			h.Set("Accept", "application/json")
			h.Set("PRIVATE-TOKEN", token)
		}
		return &gitlabClient{api: a}, nil
	}
	return nil, fmt.Errorf("issues: unknown provider %q", provider)
}
