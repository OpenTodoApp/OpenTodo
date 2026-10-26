package calsync

import (
	"bytes"
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

	"github.com/pixari/opentodo/internal/caldav"
	ob "github.com/pixari/opentodo/internal/outbound"
)

// NewHTTPClient builds the client of every calendar request: the outbound
// policy's dialer (the webhooks' private-network switch), no proxy, a 20 s
// timeout, and no automatic redirects (the DAV client follows them itself,
// design D4).
func NewHTTPClient(allowPrivate func(context.Context) bool) *http.Client {
	return ob.NewClient(&ob.Dialer{AllowPrivate: allowPrivate}, RequestTimeout)
}

// DAV is a WebDAV/CalDAV client for one account.
type DAV struct {
	HTTP *http.Client
	// Auth sets the credentials of a request (Basic or Bearer).
	Auth      func(h http.Header)
	UserAgent string
	// home is the host credentials were typed for; redirects and hrefs may
	// leave it only for a host under the same parent domain.
	home string
}

// NewDAV builds a client whose credentials belong to base's host.
func NewDAV(client *http.Client, base string, auth func(h http.Header), version string) *DAV {
	host := ""
	if u, err := url.Parse(base); err == nil {
		host = strings.ToLower(u.Hostname())
	}
	return &DAV{HTTP: client, Auth: auth, UserAgent: "OpenTodo/" + version, home: host}
}

// sameSite reports whether host may receive the credentials: the typed host,
// or a host under its parent domain (caldav.icloud.com → p52-caldav.icloud.com).
func (d *DAV) sameSite(host string) bool {
	host = strings.ToLower(host)
	if host == d.home || d.home == "" {
		return true
	}
	parent := d.home
	if i := strings.IndexByte(parent, '.'); i >= 0 && strings.Contains(parent[i+1:], ".") {
		parent = parent[i+1:]
	}
	return host == parent || strings.HasSuffix(host, "."+parent)
}

// Response is an answer of any status.
type Response struct {
	Status int
	Header http.Header
	Body   []byte
	// URL is the address that answered (after redirects).
	URL string
}

// Do sends a request, follows up to MaxRedirects redirects by hand (keeping
// the method and body, only to hosts that may receive the credentials) and
// reads at most MaxBody of the answer.
func (d *DAV) Do(ctx context.Context, method, target string, header map[string]string, body []byte) (*Response, error) {
	for hop := 0; ; hop++ {
		u, err := ob.ValidateURL(target)
		if err != nil {
			return nil, &Error{Reason: ReasonInvalid}
		}
		if !d.sameSite(u.Hostname()) {
			return nil, &Error{Reason: ReasonRedirect}
		}
		req, err := http.NewRequestWithContext(ctx, method, u.String(), bytes.NewReader(body))
		if err != nil {
			return nil, &Error{Reason: ReasonInvalid}
		}
		req.Header.Set("User-Agent", d.UserAgent)
		for k, v := range header {
			req.Header.Set(k, v)
		}
		if d.Auth != nil {
			d.Auth(req.Header)
		}
		resp, err := d.HTTP.Do(req)
		if err != nil {
			return nil, &Error{Reason: transportReason(err)}
		}
		data, rerr := io.ReadAll(io.LimitReader(resp.Body, MaxBody+1))
		resp.Body.Close()
		if rerr != nil {
			return nil, &Error{Reason: transportReason(rerr)}
		}
		if len(data) > MaxBody {
			return nil, &Error{Reason: ReasonTooLarge}
		}
		switch resp.StatusCode {
		case http.StatusMovedPermanently, http.StatusFound, http.StatusSeeOther, http.StatusTemporaryRedirect, http.StatusPermanentRedirect:
			loc := resp.Header.Get("Location")
			if loc == "" || hop >= MaxRedirects {
				return nil, &Error{Reason: ReasonRedirect}
			}
			next, err := u.Parse(loc)
			if err != nil {
				return nil, &Error{Reason: ReasonRedirect}
			}
			target = next.String()
			continue
		case http.StatusTooManyRequests:
			return nil, &Error{Reason: ReasonRateLimited, Until: retryAfter(resp.Header, time.Now())}
		}
		return &Response{Status: resp.StatusCode, Header: resp.Header, Body: data, URL: u.String()}, nil
	}
}

func retryAfter(h http.Header, now time.Time) time.Time {
	ra := strings.TrimSpace(h.Get("Retry-After"))
	if s, err := strconv.Atoi(ra); err == nil && s >= 0 {
		return now.Add(time.Duration(s) * time.Second)
	}
	if t, err := http.ParseTime(ra); err == nil {
		return t
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

// statusError maps a failed status to an error.
func statusError(status int) error {
	switch status {
	case http.StatusUnauthorized, http.StatusForbidden:
		return &Error{Reason: ReasonUnauthorized}
	}
	return &Error{Reason: fmt.Sprintf("http_%d", status)}
}

// ---- multistatus ----

// Resource is one response of a multistatus: its absolute href, the status of
// a response without properties (a removed member in a sync report), and the
// properties found (2xx propstats only).
type Resource struct {
	Href   string
	Status int
	Props  map[string]*caldav.Node
}

// Prop returns a found property (space + " " + local).
func (r *Resource) Prop(space, local string) *caldav.Node { return r.Props[space+" "+local] }

// Text returns a found property's text, trimmed.
func (r *Resource) Text(space, local string) string {
	if n := r.Prop(space, local); n != nil {
		return strings.TrimSpace(n.Text)
	}
	return ""
}

// Multistatus is a parsed 207 answer.
type Multistatus struct {
	Resources []Resource
	SyncToken string
}

func statusCode(line string) int {
	parts := strings.Fields(line)
	if len(parts) >= 2 {
		if n, err := strconv.Atoi(parts[1]); err == nil {
			return n
		}
	}
	return 0
}

// parseMultistatus reads a multistatus answer; hrefs are resolved against base.
func parseMultistatus(base string, body []byte) (*Multistatus, error) {
	root, err := caldav.ParseXMLLimit(bytes.NewReader(body), MaxBody)
	if err != nil || root == nil || !root.Is(caldav.NSDAV, "multistatus") {
		return nil, &Error{Reason: ReasonInvalid}
	}
	b, _ := url.Parse(base)
	ms := &Multistatus{}
	for _, n := range root.Children {
		switch {
		case n.Is(caldav.NSDAV, "sync-token"):
			ms.SyncToken = strings.TrimSpace(n.Text)
		case n.Is(caldav.NSDAV, "response"):
			r := Resource{Props: map[string]*caldav.Node{}}
			if h := n.Child(caldav.NSDAV, "href"); h != nil {
				r.Href = resolve(b, strings.TrimSpace(h.Text))
			}
			if st := n.Child(caldav.NSDAV, "status"); st != nil {
				r.Status = statusCode(st.Text)
			}
			for _, ps := range n.Children {
				if !ps.Is(caldav.NSDAV, "propstat") {
					continue
				}
				code := statusCode(nodeText(ps.Child(caldav.NSDAV, "status")))
				if code < 200 || code > 299 {
					continue
				}
				for _, p := range nodeChildren(ps.Child(caldav.NSDAV, "prop")) {
					r.Props[p.Space+" "+p.Local] = p
				}
			}
			if r.Href != "" {
				ms.Resources = append(ms.Resources, r)
			}
		}
	}
	return ms, nil
}

// resolve turns an href into an absolute URL against base.
func resolve(base *url.URL, href string) string {
	if base == nil {
		return href
	}
	u, err := base.Parse(href)
	if err != nil {
		return href
	}
	return u.String()
}

// Resolve is resolve for a string base (tests and discovery).
func Resolve(base, href string) string {
	b, _ := url.Parse(base)
	return resolve(b, href)
}

// nodeText is a node's text, "" for nil.
func nodeText(n *caldav.Node) string {
	if n == nil {
		return ""
	}
	return n.Text
}

// nodeChildren is a node's children, nil for nil.
func nodeChildren(n *caldav.Node) []*caldav.Node {
	if n == nil {
		return nil
	}
	return n.Children
}

// PropFind sends a PROPFIND of depth with the given prop XML (the inner of <d:prop>).
func (d *DAV) PropFind(ctx context.Context, target string, depth string, props string) (*Multistatus, error) {
	body := `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:ic="http://apple.com/ns/ical/"><d:prop>` + props + `</d:prop></d:propfind>`
	return d.multistatus(ctx, "PROPFIND", target, depth, body)
}

// Report sends a REPORT with a full XML body.
func (d *DAV) Report(ctx context.Context, target, depth, body string) (*Multistatus, error) {
	return d.multistatus(ctx, "REPORT", target, depth, body)
}

func (d *DAV) multistatus(ctx context.Context, method, target, depth, body string) (*Multistatus, error) {
	resp, err := d.Do(ctx, method, target, map[string]string{"Depth": depth, "Content-Type": "application/xml; charset=utf-8"}, []byte(body))
	if err != nil {
		return nil, err
	}
	if resp.Status != http.StatusMultiStatus {
		return nil, &statusErr{status: resp.Status, body: resp.Body}
	}
	return parseMultistatus(resp.URL, resp.Body)
}

// statusErr is a non-207 answer to PROPFIND or REPORT; callers look at the
// status (404, 403 valid-sync-token) before reporting it.
type statusErr struct {
	status int
	body   []byte
}

func (e *statusErr) Error() string { return fmt.Sprintf("calendar sync: status %d", e.status) }

// asStatus returns the status of a statusErr, 0 otherwise.
func asStatus(err error) int {
	var se *statusErr
	if errors.As(err, &se) {
		return se.status
	}
	return 0
}

// davError turns a statusErr into the stored error and passes others on.
func davError(err error) error {
	if s := asStatus(err); s != 0 {
		return statusError(s)
	}
	return err
}
