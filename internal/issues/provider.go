package issues

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	ob "github.com/pixari/opentodo/internal/outbound"
)

// Issue is one provider issue, normalised (design D1). Times are Unix ms.
type Issue struct {
	Key       string // owner/repo#123 or group/project#45
	Title     string
	Body      string
	URL       string
	State     string // open | closed
	ClosedAt  int64
	UpdatedAt int64
	Labels    []string
}

// Issue states.
const (
	Open   = "open"
	Closed = "closed"
)

// Account is the result of a token check.
type Account struct {
	Login         string `json:"login"`
	CanReadIssues bool   `json:"can_read_issues"`
}

// Request asks for one page of one listing: the account's assigned issues
// (Repo "") or those of one repository or project.
type Request struct {
	Repo   string
	Page   int
	ETag   string // If-None-Match, sent on a listing's first page only
	Since  int64  // updated-since, Unix ms; 0 for none
	All    bool   // closed issues too (every poll after the first)
	Labels []string
	Login  string // the account, for the repositories scope
}

// Page is one page of a listing.
type Page struct {
	Issues      []Issue
	ETag        string
	NotModified bool
	More        bool
}

// Provider is one issue tracker's REST API for one connection.
type Provider interface {
	Account(ctx context.Context) (Account, error)
	List(ctx context.Context, r Request) (*Page, error)
}

// Error is a failed provider request with the reason stored on the connection.
type Error struct{ Reason string }

func (e *Error) Error() string { return e.Reason }

// RateLimitedError is the provider's rate-limit answer: no request before Until.
type RateLimitedError struct{ Until time.Time }

func (e *RateLimitedError) Error() string {
	return "provider rate limit until " + e.Until.UTC().Format(time.RFC3339)
}

// ReasonOf maps an error of a poll to the reason stored on the connection.
func ReasonOf(err error) string {
	var pe *Error
	var rl *RateLimitedError
	switch {
	case errors.As(err, &pe):
		return pe.Reason
	case errors.As(err, &rl):
		return ReasonRateLimited
	}
	return ReasonConnection
}

// NormalizeHost checks a host typed by a person and returns it as
// scheme://host[:port][/path] without a trailing slash, query or fragment.
// http is accepted here; the caller allows it only for a private target the
// owner allowed.
func NormalizeHost(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", &FieldError{"host", "enter the address of GitHub, GitLab or your own instance, such as https://github.com"}
	}
	if len(raw) > MaxHost {
		return "", &FieldError{"host", fmt.Sprintf("the address is longer than %d characters", MaxHost)}
	}
	u, err := ob.ValidateURL(raw)
	if err != nil {
		return "", &FieldError{"host", "the address must be an https URL with a host, such as https://gitlab.example.com"}
	}
	if u.User != nil {
		return "", &FieldError{"host", "the address must not contain a user name or password; enter the token in its own field"}
	}
	path := strings.TrimRight(u.EscapedPath(), "/")
	return strings.ToLower(u.Scheme) + "://" + strings.ToLower(u.Host) + path, nil
}

// DefaultName is a connection's name when none is given: the host name.
func DefaultName(host string) string {
	if u, err := url.Parse(host); err == nil && u.Host != "" {
		return u.Host
	}
	return host
}

// APIBase derives the REST API address from a connection's host (design D1):
// github.com → api.github.com, another GitHub host → <host>/api/v3, GitLab →
// <host>/api/v4.
func APIBase(provider, host string) string {
	host = strings.TrimRight(host, "/")
	switch provider {
	case GitHub:
		if host == "https://github.com" {
			return "https://api.github.com"
		}
		return host + "/api/v3"
	case GitLab:
		return host + "/api/v4"
	}
	return host
}

// ValidProvider reports whether p is a supported provider.
func ValidProvider(p string) bool { return p == GitHub || p == GitLab }
