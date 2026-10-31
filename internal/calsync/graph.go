package calsync

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	ob "github.com/OpenTodoApp/opentodo/internal/outbound"
	"github.com/OpenTodoApp/opentodo/internal/zoned"
)

// Microsoft Graph (OpenSpec change outlook-calendar-sync): the requests a
// Microsoft connection sends, with the same outbound client, timeout and
// response cap as the CalDAV ones (design D9, D10).

// TaskProperty is the single-value extended property OpenTodo marks its
// events with; its value is the task id (design D5). The GUID never changes.
const TaskProperty = "String {6f1c1c9e-2c8b-4d0e-9a51-6f70656e746f} Name opentodoTaskId"

// maxGraphPages bounds the pages one listing follows.
const maxGraphPages = 200

// Graph is a Microsoft Graph client for one account's access token.
type Graph struct {
	HTTP      *http.Client
	Base      string // https://graph.microsoft.com/v1.0
	Access    string
	UserAgent string
	now       func() time.Time
}

// NewGraph builds a client for an access token.
func NewGraph(client *http.Client, base, access, version string, now func() time.Time) *Graph {
	if now == nil {
		now = time.Now
	}
	return &Graph{HTTP: client, Base: strings.TrimSuffix(base, "/"), Access: access, UserAgent: "OpenTodo/" + version, now: now}
}

// address turns a path under Base, or an absolute link Graph returned, into
// the address to ask; a link to another host is refused (it would receive
// the token).
func (g *Graph) address(target string) (string, error) {
	if strings.HasPrefix(target, "/") {
		target = g.Base + target
	}
	u, err := ob.ValidateURL(target)
	if err != nil {
		return "", &Error{Reason: ReasonInvalid}
	}
	base, err := url.Parse(g.Base)
	if err != nil || !strings.EqualFold(u.Host, base.Host) || u.Scheme != base.Scheme {
		return "", &Error{Reason: ReasonRedirect}
	}
	return u.String(), nil
}

// do sends one request with the token, immutable ids and times in UTC, and
// reads at most MaxBody of the answer. Throttling (429, 503) is
// ReasonRateLimited with Graph's Retry-After; 401 is ReasonUnauthorized; a
// redirect is refused.
func (g *Graph) do(ctx context.Context, method, target string, header map[string]string, body any) (*Response, error) {
	addr, err := g.address(target)
	if err != nil {
		return nil, err
	}
	var rd io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, addr, rd)
	if err != nil {
		return nil, &Error{Reason: ReasonInvalid}
	}
	req.Header.Set("Authorization", "Bearer "+g.Access)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", g.UserAgent)
	req.Header.Add("Prefer", `IdType="ImmutableId"`)
	req.Header.Add("Prefer", `outlook.timezone="UTC"`)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range header {
		if k == "Prefer" {
			req.Header.Add(k, v)
			continue
		}
		req.Header.Set(k, v)
	}
	resp, err := g.HTTP.Do(req)
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
	switch {
	case resp.StatusCode >= 300 && resp.StatusCode < 400:
		return nil, &Error{Reason: ReasonRedirect}
	case resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode == http.StatusServiceUnavailable:
		return nil, &Error{Reason: ReasonRateLimited, Until: retryAfter(resp.Header, g.now())}
	case resp.StatusCode == http.StatusUnauthorized:
		return nil, &Error{Reason: ReasonUnauthorized}
	}
	return &Response{Status: resp.StatusCode, Header: resp.Header, Body: data, URL: addr}, nil
}

// get reads a JSON answer; 404 is ReasonCalendarMissing (callers only ask for
// calendars and their events).
func (g *Graph) get(ctx context.Context, target string, out any) error {
	resp, err := g.do(ctx, http.MethodGet, target, nil, nil)
	if err != nil {
		return err
	}
	if resp.Status != http.StatusOK {
		return graphStatus(resp.Status)
	}
	if json.Unmarshal(resp.Body, out) != nil {
		return &Error{Reason: ReasonInvalid}
	}
	return nil
}

// graphStatus maps a failed status of a calendar request.
func graphStatus(status int) error {
	switch status {
	case http.StatusNotFound:
		return &Error{Reason: ReasonCalendarMissing}
	case http.StatusForbidden:
		return &Error{Reason: ReasonCalendarReadOnly}
	}
	return statusError(status)
}

// query encodes OData options (Graph wants %20, not +, for spaces).
func query(v url.Values) string {
	keys := make([]string, 0, len(v))
	for k := range v {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	for i, k := range keys {
		if i > 0 {
			b.WriteByte('&')
		}
		b.WriteString(k + "=" + strings.ReplaceAll(url.QueryEscape(v.Get(k)), "+", "%20"))
	}
	return b.String()
}

// expandProperty asks Graph for OpenTodo's mark on each event.
var expandProperty = "singleValueExtendedProperties($filter=id eq '" + TaskProperty + "')"

// MicrosoftAccount is what discovery found for a Microsoft account.
type MicrosoftAccount struct {
	Address string
	// TimeZone is the mailbox's zone as an IANA name, "" when unknown.
	TimeZone  string
	Calendars []Calendar
}

// Discover reads the account's address, its mailbox time zone and its
// calendars (design D3). An account without calendars is ReasonNoCalendars.
func (g *Graph) Discover(ctx context.Context) (*MicrosoftAccount, error) {
	var me struct {
		UPN  string `json:"userPrincipalName"`
		Mail string `json:"mail"`
	}
	if err := g.get(ctx, "/me?$select=userPrincipalName,mail", &me); err != nil {
		return nil, accountError(err)
	}
	acct := &MicrosoftAccount{Address: firstOf(me.Mail, me.UPN)}
	var tz struct {
		Value string `json:"value"`
	}
	if err := g.get(ctx, "/me/mailboxSettings/timeZone", &tz); err == nil {
		acct.TimeZone = ianaZone(tz.Value)
	} else if r := reasonOf(err); r == ReasonRateLimited || r == ReasonUnauthorized || r == ReasonTimeout || r == ReasonConnection {
		return nil, err
	}
	next := "/me/calendars?" + query(url.Values{"$top": {"50"}, "$select": {"id,name,hexColor,canEdit"}})
	for page := 0; next != "" && len(acct.Calendars) < MaxCalendars; page++ {
		if page >= maxGraphPages {
			return nil, &Error{Reason: ReasonTooLarge}
		}
		var p struct {
			Value []struct {
				ID       string `json:"id"`
				Name     string `json:"name"`
				HexColor string `json:"hexColor"`
				CanEdit  bool   `json:"canEdit"`
			} `json:"value"`
			Next string `json:"@odata.nextLink"`
		}
		if err := g.get(ctx, next, &p); err != nil {
			return nil, accountError(err)
		}
		for _, c := range p.Value {
			if c.ID == "" || len(acct.Calendars) >= MaxCalendars {
				continue
			}
			acct.Calendars = append(acct.Calendars, Calendar{URL: c.ID, Name: firstOf(c.Name, "Calendar"), Color: color(c.HexColor),
				TimeZone: acct.TimeZone, ReadOnly: !c.CanEdit})
		}
		next = p.Next
	}
	if len(acct.Calendars) == 0 {
		return nil, &Error{Reason: ReasonNoCalendars}
	}
	sort.SliceStable(acct.Calendars, func(i, j int) bool {
		return strings.ToLower(acct.Calendars[i].Name) < strings.ToLower(acct.Calendars[j].Name)
	})
	return acct, nil
}

// accountError: a refusal of the account itself is about the grant.
func accountError(err error) error {
	switch reasonOf(err) {
	case ReasonCalendarReadOnly, ReasonCalendarMissing:
		return &Error{Reason: ReasonUnauthorized}
	}
	return err
}

// ianaZone reads a mailbox zone (a Windows id or an IANA name) as an IANA
// name, "" when it is neither.
func ianaZone(name string) string {
	name = strings.TrimSpace(name)
	if iana, ok := zoned.WindowsZone(name); ok {
		if loc, err := zoned.Load(iana); err == nil {
			return loc.String()
		}
	}
	if loc, err := zoned.Load(name); err == nil {
		return loc.String()
	}
	return ""
}

// zoneLocation resolves a zone Graph names (UTC, a Windows id or an IANA
// name); an unknown one is UTC.
func zoneLocation(name string) *time.Location {
	if name == "" || strings.EqualFold(name, "UTC") {
		return time.UTC
	}
	if iana := ianaZone(name); iana != "" {
		if loc, err := zoned.Load(iana); err == nil {
			return loc
		}
	}
	return time.UTC
}
