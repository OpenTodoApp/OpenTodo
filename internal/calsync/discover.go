package calsync

import (
	"context"
	"net/http"
	"net/url"
	"sort"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/caldav"
	"github.com/OpenTodoApp/opentodo/internal/calfeed"
	ob "github.com/OpenTodoApp/opentodo/internal/outbound"
)

// Discovery is what discovery found for an account (design D4).
type Discovery struct {
	Principal string
	Home      string
	Calendars []Calendar
}

// StartURL turns what a user typed (an address, a host name or an email
// address) into the address discovery starts from.
func StartURL(input string) (string, error) {
	in := strings.TrimSpace(input)
	if at := strings.LastIndexByte(in, '@'); at >= 0 && !strings.Contains(in, "://") {
		in = in[at+1:]
	}
	if !strings.Contains(in, "://") {
		in = "https://" + in
	}
	u, err := ob.ValidateURL(in)
	if err != nil {
		return "", err
	}
	u.Fragment, u.RawQuery = "", ""
	return u.String(), nil
}

// candidates are the addresses tried for the principal: the well-known address
// first when the user typed no path.
func candidates(start string) []string {
	u, err := url.Parse(start)
	if err != nil {
		return []string{start}
	}
	if u.Path == "" || u.Path == "/" {
		w := *u
		w.Path = "/.well-known/caldav"
		return []string{w.String(), start}
	}
	return []string{start}
}

const calendarProps = `<d:resourcetype/><d:displayname/><c:supported-calendar-component-set/><d:current-user-privilege-set/>` +
	`<ic:calendar-color/><c:calendar-timezone/><cs:getctag/><d:sync-token/>`

// Discover finds the principal, the calendar home and the calendars that hold
// events. A 401/403 is ReasonUnauthorized; an account without such calendars
// is ReasonNoCalendars.
func (d *DAV) Discover(ctx context.Context, start string) (*Discovery, error) {
	principal, err := d.findPrincipal(ctx, start)
	if err != nil {
		return nil, err
	}
	home := principal
	ms, err := d.PropFind(ctx, principal, "0", `<c:calendar-home-set/>`)
	if err != nil {
		return nil, davError(err)
	}
	for _, r := range ms.Resources {
		if h := r.Prop(caldav.NSCalDAV, "calendar-home-set"); h != nil {
			if href := h.Child(caldav.NSDAV, "href"); href != nil && strings.TrimSpace(href.Text) != "" {
				home = Resolve(r.Href, strings.TrimSpace(href.Text))
				break
			}
		}
	}
	cals, err := d.ListCalendars(ctx, home)
	if err != nil {
		return nil, err
	}
	if len(cals) == 0 {
		return nil, &Error{Reason: ReasonNoCalendars}
	}
	return &Discovery{Principal: principal, Home: home, Calendars: cals}, nil
}

// findPrincipal asks each candidate for current-user-principal; a server that
// names none is its own principal.
func (d *DAV) findPrincipal(ctx context.Context, start string) (string, error) {
	var last error
	for _, c := range candidates(start) {
		ms, err := d.PropFind(ctx, c, "0", `<d:current-user-principal/>`)
		if err != nil {
			if s := asStatus(err); s == http.StatusUnauthorized || s == http.StatusForbidden {
				return "", statusError(s)
			}
			last = davError(err)
			continue
		}
		for _, r := range ms.Resources {
			if p := r.Prop(caldav.NSDAV, "current-user-principal"); p != nil {
				if href := p.Child(caldav.NSDAV, "href"); href != nil && strings.TrimSpace(href.Text) != "" {
					return Resolve(r.Href, strings.TrimSpace(href.Text)), nil
				}
			}
		}
		if len(ms.Resources) > 0 {
			return ms.Resources[0].Href, nil
		}
	}
	if last == nil {
		last = &Error{Reason: ReasonInvalid}
	}
	return "", last
}

// ListCalendars lists the calendars under home that hold events.
func (d *DAV) ListCalendars(ctx context.Context, home string) ([]Calendar, error) {
	ms, err := d.PropFind(ctx, home, "1", calendarProps)
	if err != nil {
		return nil, davError(err)
	}
	var out []Calendar
	for i := range ms.Resources {
		r := &ms.Resources[i]
		rt := r.Prop(caldav.NSDAV, "resourcetype")
		if rt == nil || rt.Child(caldav.NSCalDAV, "calendar") == nil || !holdsEvents(r) {
			continue
		}
		cal := Calendar{URL: r.Href, Name: r.Text(caldav.NSDAV, "displayname"), Color: color(r.Text(caldav.NSApple, "calendar-color")), ReadOnly: readOnly(r)}
		if cal.Name == "" {
			cal.Name = lastSegment(r.Href)
		}
		if tz := r.Text(caldav.NSCalDAV, "calendar-timezone"); tz != "" {
			cal.TimeZone = zoneOf(tz)
		}
		out = append(out, cal)
		if len(out) >= MaxCalendars {
			break
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name) })
	return out, nil
}

// holdsEvents: a supported-calendar-component-set that names VEVENT, or none
// at all (RFC 4791: every component type).
func holdsEvents(r *Resource) bool {
	set := r.Prop(caldav.NSCalDAV, "supported-calendar-component-set")
	if set == nil || len(set.Children) == 0 {
		return true
	}
	for _, c := range set.Children {
		if c.Is(caldav.NSCalDAV, "comp") && strings.EqualFold(c.Attr("name"), "VEVENT") {
			return true
		}
	}
	return false
}

// readOnly: a privilege set that grants none of write, write-content, bind or all.
func readOnly(r *Resource) bool {
	set := r.Prop(caldav.NSDAV, "current-user-privilege-set")
	if set == nil {
		return false
	}
	for _, p := range set.Children {
		for _, g := range p.Children {
			switch g.Local {
			case "write", "write-content", "bind", "all":
				return false
			}
		}
	}
	return true
}

// color normalises an Apple calendar colour (#RRGGBBAA) to #RRGGBB.
func color(c string) string {
	c = strings.TrimSpace(c)
	if len(c) == 9 && c[0] == '#' {
		return c[:7]
	}
	if len(c) == 7 && c[0] == '#' {
		return c
	}
	return ""
}

// zoneOf reads the TZID of a calendar-timezone VTIMEZONE as an IANA name.
func zoneOf(vtimezone string) string {
	root, err := caldav.Parse([]byte(vtimezone))
	if err != nil {
		return ""
	}
	for _, c := range root.Children {
		if c.Name == "VTIMEZONE" {
			if p := c.Prop("TZID"); p != nil {
				if loc, ok := calfeed.Resolve(p.Value); ok {
					return loc.String()
				}
			}
		}
	}
	return ""
}

func lastSegment(href string) string {
	u, err := url.Parse(href)
	if err != nil {
		return href
	}
	p := strings.Trim(u.Path, "/")
	if i := strings.LastIndexByte(p, '/'); i >= 0 {
		p = p[i+1:]
	}
	if s, err := url.PathUnescape(p); err == nil {
		return s
	}
	return p
}
