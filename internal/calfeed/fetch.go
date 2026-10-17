package calfeed

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/outbound"
)

// Fetch limits (design D2).
const (
	FetchTimeout = 20 * time.Second
	MaxRedirects = 3
)

// Result is what a fetch brought.
type Result struct {
	// Replaced is true when new content was read (200); false when unchanged (304).
	Replaced       bool
	Occurrences    []Occurrence
	Warnings       []string
	ETag           string
	LastModified   string
	RefreshSeconds *int64
	// Name is the calendar's X-WR-CALNAME, adopted when the subscription has none.
	Name string
}

// FetchError is a failed fetch with the reason stored on the subscription.
type FetchError struct{ Reason string }

func (e *FetchError) Error() string { return e.Reason }

// Fetcher reads subscribed calendars through the outbound policy.
type Fetcher struct {
	Client  *http.Client
	Version string
	now     func() time.Time
}

// NewFetcher builds a fetcher on the shared outbound policy: the private-network
// rule of webhooks (allowPrivate), three checked redirects, a 20 s timeout.
func NewFetcher(allowPrivate func(context.Context) bool, version string) *Fetcher {
	d := &outbound.Dialer{AllowPrivate: allowPrivate}
	return &Fetcher{Client: outbound.NewClient(d, FetchTimeout, outbound.FollowRedirects(MaxRedirects)), Version: version, now: time.Now}
}

// FetchURL normalises a subscription address: webcal(s) is https, then the
// outbound URL rules apply.
func FetchURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	lower := strings.ToLower(raw)
	switch {
	case strings.HasPrefix(lower, "webcals://"):
		raw = "https://" + raw[len("webcals://"):]
	case strings.HasPrefix(lower, "webcal://"):
		raw = "https://" + raw[len("webcal://"):]
	}
	u, err := outbound.ValidateURL(raw)
	if err != nil {
		return "", err
	}
	return u.String(), nil
}

// StoreWindow is the span occurrences are kept for: two months back, a bit
// more than a year ahead (the device asks for at most 92 days at a time).
func StoreWindow(now time.Time) Window {
	d := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	return Window{From: d.AddDate(0, 0, -62), To: d.AddDate(0, 0, 400)}
}

// Fetch reads one subscription with conditional headers.
func (f *Fetcher) Fetch(ctx context.Context, sub *Subscription) (*Result, error) {
	target, err := FetchURL(sub.URL)
	if err != nil {
		return nil, &FetchError{"invalid_url"}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return nil, &FetchError{"invalid_url"}
	}
	req.Header.Set("Accept", "text/calendar, */*;q=0.5")
	req.Header.Set("User-Agent", "OpenTodo/"+f.Version)
	if sub.ETag != "" {
		req.Header.Set("If-None-Match", sub.ETag)
	}
	if sub.LastModified != "" {
		req.Header.Set("If-Modified-Since", sub.LastModified)
	}
	resp, err := f.Client.Do(req)
	if err != nil {
		return nil, &FetchError{reasonOf(err)}
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotModified {
		return &Result{ETag: sub.ETag, LastModified: sub.LastModified}, nil
	}
	if resp.StatusCode != http.StatusOK {
		return nil, &FetchError{fmt.Sprintf("http_%d", resp.StatusCode)}
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, MaxFeedBytes+1))
	if err != nil {
		return nil, &FetchError{reasonOf(err)}
	}
	if len(body) > MaxFeedBytes {
		return nil, &FetchError{"too_large"}
	}
	cal, err := ParseCalendar(body)
	if err != nil {
		return nil, &FetchError{"invalid_calendar"}
	}
	now := time.Now
	if f.now != nil {
		now = f.now
	}
	ectx, cancel := context.WithTimeout(ctx, MaxExpandTime)
	occ, warns := ExpandContext(ectx, cal.Events, StoreWindow(now()), MaxOccurrences)
	cancel()
	r := &Result{Replaced: true, Occurrences: occ, Warnings: append(cal.Warnings, warns...), ETag: resp.Header.Get("ETag"),
		LastModified: resp.Header.Get("Last-Modified"), Name: cal.Name}
	if cal.Refresh > 0 {
		s := int64(cal.Refresh / time.Second)
		r.RefreshSeconds = &s
	}
	return r, nil
}

// reasonOf maps a transport error to a stored reason.
func reasonOf(err error) string {
	var ue *url.Error
	switch {
	case errors.Is(err, outbound.ErrPrivateTarget):
		return "private_target"
	case errors.Is(err, outbound.ErrTooManyRedirects):
		return "too_many_redirects"
	case errors.Is(err, outbound.ErrBadURL):
		return "invalid_url"
	case errors.Is(err, context.DeadlineExceeded):
		return "timeout"
	case errors.As(err, &ue) && ue.Timeout():
		return "timeout"
	}
	var ne net.Error
	if errors.As(err, &ne) && ne.Timeout() {
		return "timeout"
	}
	return "connection_failed"
}
