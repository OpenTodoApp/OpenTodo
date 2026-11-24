package calsync

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/caldav"
	"github.com/OpenTodoApp/opentodo/internal/calfeed"
	"github.com/OpenTodoApp/opentodo/internal/zoned"
)

// davEvents writes events over WebDAV (CalDAV and Google's CalDAV API,
// calendar-event-edits D5). It edits only SUMMARY, DTSTART and DTEND (a
// DURATION becomes DTEND) and the bookkeeping properties, and writes the
// whole object back, so everything else of it survives.
type davEvents struct {
	d     *DAV
	addrs []string
}

// Update reads the object, checks its version and locks, edits it and PUTs it
// once with If-Match.
func (e *davEvents) Update(ctx context.Context, ref EventRef, edit EventEdit, now time.Time) (EventState, error) {
	resp, err := e.d.Do(ctx, http.MethodGet, ref.Href, map[string]string{"Accept": "text/calendar"}, nil)
	if err != nil {
		return EventState{}, err
	}
	if err := writeAnswer(resp.Status); err != nil {
		return EventState{}, err
	}
	if !sameETag(resp.Header.Get("ETag"), ref.ETag) {
		return EventState{}, ErrEventChanged
	}
	root, err := caldav.Parse(resp.Body)
	if err != nil {
		return EventState{}, &Error{Reason: ReasonInvalid}
	}
	if lock := e.lock(resp.Body, ref.ETag); lock != "" {
		return EventState{}, &lockedError{lock}
	}
	ev := vevent(root)
	if ev == nil {
		return EventState{}, &Error{Reason: ReasonInvalid}
	}
	if edit.Summary != nil {
		s, err := CleanSummary(*edit.Summary)
		if err != nil {
			return EventState{}, err
		}
		setProp(ev, caldav.Prop{Name: "SUMMARY", Value: caldav.EscapeText(s)})
	}
	if edit.When != nil {
		removeProp(ev, "DURATION")
		setProp(ev, pointProp("DTSTART", edit.When.Start, edit.When.AllDay))
		setProp(ev, pointProp("DTEND", edit.When.End, edit.When.AllDay))
		for _, p := range []calfeed.Point{edit.When.Start, edit.When.End} {
			addTimezone(root, p, edit.When.AllDay)
		}
	}
	seq := 0
	if p := ev.Prop("SEQUENCE"); p != nil {
		seq, _ = strconv.Atoi(p.Value)
	}
	stamp := now.UTC().Format("20060102T150405Z")
	setProp(ev, caldav.Prop{Name: "SEQUENCE", Value: strconv.Itoa(seq + 1)})
	setProp(ev, caldav.Prop{Name: "DTSTAMP", Value: stamp})
	setProp(ev, caldav.Prop{Name: "LAST-MODIFIED", Value: stamp})
	body := root.Encode()
	put, err := e.d.DoOnce(ctx, http.MethodPut, ref.Href, map[string]string{"Content-Type": "text/calendar; charset=utf-8", "If-Match": ref.ETag}, body)
	if err != nil {
		return EventState{}, err
	}
	if err := writeAnswer(put.Status); err != nil {
		return EventState{}, err
	}
	etag := put.Header.Get("ETag")
	if etag == "" {
		// A server that answers without an ETag is read once more for it.
		if again, err := e.d.Do(ctx, http.MethodGet, ref.Href, map[string]string{"Accept": "text/calendar"}, nil); err == nil && again.Status == http.StatusOK {
			etag, body = again.Header.Get("ETag"), again.Body
		}
	}
	cal, err := calfeed.ParseCalendar(body)
	if err != nil {
		return EventState{}, &Error{Reason: ReasonInvalid}
	}
	out := EventState{Ref: EventRef{Calendar: ref.Calendar, Href: ref.Href, ETag: etag}, Events: cal.Events}
	out.Locked = lockOf(remote{Href: ref.Href, ETag: etag, Events: cal.Events}, e.addrs)
	return out, nil
}

// Delete removes the object once, with If-Match.
func (e *davEvents) Delete(ctx context.Context, ref EventRef) error {
	resp, err := e.d.DoOnce(ctx, http.MethodDelete, ref.Href, map[string]string{"If-Match": ref.ETag}, nil)
	if err != nil {
		return err
	}
	return writeAnswer(resp.Status)
}

// lock is the lock of the object as read now.
func (e *davEvents) lock(data []byte, etag string) string {
	cal, err := calfeed.ParseCalendar(data)
	if err != nil {
		return ""
	}
	return lockOf(remote{ETag: etag, Events: cal.Events}, e.addrs)
}

// writeAnswer maps the status of an event read or write.
func writeAnswer(status int) error {
	switch {
	case status >= 200 && status < 300:
		return nil
	case status == http.StatusPreconditionFailed:
		return ErrEventChanged
	case status == http.StatusNotFound || status == http.StatusGone:
		return ErrEventGone
	case status == http.StatusForbidden:
		return ErrCalendarRO
	}
	return statusError(status)
}

// vevent is the object's only VEVENT (a lock check refused any other shape).
func vevent(root *caldav.Component) *caldav.Component {
	var out *caldav.Component
	for _, c := range root.Children {
		if c.Name == "VEVENT" {
			if out != nil {
				return nil
			}
			out = c
		}
	}
	return out
}

// setProp replaces every property named p.Name by p, in the first one's place.
func setProp(c *caldav.Component, p caldav.Prop) {
	out := c.Props[:0:0]
	done := false
	for _, q := range c.Props {
		if q.Name != p.Name {
			out = append(out, q)
		} else if !done {
			out, done = append(out, p), true
		}
	}
	if !done {
		out = append(out, p)
	}
	c.Props = out
}

func removeProp(c *caldav.Component, name string) {
	out := c.Props[:0:0]
	for _, q := range c.Props {
		if q.Name != name {
			out = append(out, q)
		}
	}
	c.Props = out
}

// pointProp writes a start or end: a date, a UTC time, a floating wall time
// or a wall time with its TZID.
func pointProp(name string, p calfeed.Point, allDay bool) caldav.Prop {
	switch {
	case allDay:
		return caldav.Prop{Name: name, Params: []caldav.Param{{Name: "VALUE", Values: []string{"DATE"}}}, Value: p.T.Format("20060102")}
	case p.Zone == "":
		return caldav.Prop{Name: name, Value: p.T.Format("20060102T150405")}
	case p.Zone == "UTC":
		return caldav.Prop{Name: name, Value: p.T.UTC().Format("20060102T150405Z")}
	}
	at := p.T
	if loc, err := zoned.Load(p.Zone); err == nil {
		at = at.In(loc)
	}
	return caldav.Prop{Name: name, Params: []caldav.Param{{Name: "TZID", Values: []string{p.Zone}}}, Value: at.Format("20060102T150405")}
}

// addTimezone adds the VTIMEZONE a new TZID needs, when the object has none.
func addTimezone(root *caldav.Component, p calfeed.Point, allDay bool) {
	if allDay || p.Zone == "" || p.Zone == "UTC" {
		return
	}
	for _, c := range root.Children {
		if c.Name == "VTIMEZONE" {
			if id := c.Prop("TZID"); id != nil && id.Value == p.Zone {
				return
			}
		}
	}
	at := p.T
	if loc, err := zoned.Load(p.Zone); err == nil {
		at = at.In(loc)
	}
	if tz := caldav.VTimezone(p.Zone, at.Format("2006-01-02"), at.Format("15:04")); tz != nil {
		root.Children = append([]*caldav.Component{tz}, root.Children...)
	}
}

// sameETag compares two ETags weakly: a server may answer W/"x" for "x".
func sameETag(a, b string) bool {
	return strings.TrimPrefix(a, "W/") == strings.TrimPrefix(b, "W/")
}
