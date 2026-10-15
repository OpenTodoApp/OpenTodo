package calfeed

import (
	"strconv"
	"time"

	"github.com/pixari/opentodo/internal/caldav"
	"github.com/pixari/opentodo/internal/e2ee"
	"github.com/pixari/opentodo/internal/zoned"
)

// FeedTask is one task as the feed renders it.
type FeedTask struct {
	ID          string
	Title       string
	Description string
	Date        string  // due date, YYYY-MM-DD
	Time        *string // HH:MM, nil for a date-only due
	TZ          *string // IANA zone of a zoned due
	Estimate    int     // minutes; 0 means the default block
	RRULE       string  // the task's rule as an RRULE value, "" when none
	Labels      []string
	Priority    int
	Modified    int64 // Unix ms, for DTSTAMP and LAST-MODIFIED
}

// FeedOptions tune the feed.
type FeedOptions struct {
	Now time.Time
	// BaseURL, when set, gives each event a link to its day in the app.
	BaseURL string
	// Encrypted accounts show the placeholder title and no notes or labels.
	Encrypted bool
}

// Feed window and the default length of a timed task (design D6).
const (
	FeedPastDays   = 30
	FeedFutureDays = 365
	DefaultBlock   = 30 * time.Minute
)

// WriteFeed renders the user's tasks as a calendar of VEVENTs that calendar
// apps subscribe to (Google Calendar, Outlook and Apple Calendar import events,
// not to-dos): one event per open task due in the window.
func WriteFeed(tasks []FeedTask, opts FeedOptions) []byte {
	cal := &caldav.Component{Name: "VCALENDAR"}
	add := func(c *caldav.Component, name, value string) {
		c.Props = append(c.Props, caldav.Prop{Name: name, Value: value})
	}
	add(cal, "VERSION", "2.0")
	add(cal, "PRODID", caldav.ProdID)
	add(cal, "CALSCALE", "GREGORIAN")
	add(cal, "METHOD", "PUBLISH")
	add(cal, "X-WR-CALNAME", "OpenTodo")
	add(cal, "X-PUBLISHED-TTL", "PT15M")
	cal.Props = append(cal.Props, caldav.Prop{Name: "REFRESH-INTERVAL", Params: []caldav.Param{{Name: "VALUE", Values: []string{"DURATION"}}}, Value: "PT15M"})
	from := opts.Now.UTC().AddDate(0, 0, -FeedPastDays).Format("2006-01-02")
	to := opts.Now.UTC().AddDate(0, 0, FeedFutureDays).Format("2006-01-02")
	zones := map[string]bool{}
	var events []*caldav.Component
	for _, t := range tasks {
		if t.Date == "" || t.Date < from || t.Date > to {
			continue
		}
		ev := &caldav.Component{Name: "VEVENT"}
		add(ev, "UID", t.ID)
		stamp := time.UnixMilli(t.Modified).UTC().Format("20060102T150405Z")
		if t.Modified <= 0 {
			stamp = opts.Now.UTC().Format("20060102T150405Z")
		}
		add(ev, "DTSTAMP", stamp)
		add(ev, "LAST-MODIFIED", stamp)
		title := t.Title
		if opts.Encrypted || e2ee.IsCiphertext(title) {
			title = e2ee.Placeholder
		}
		add(ev, "SUMMARY", caldav.EscapeText(title))
		if t.Description != "" && !opts.Encrypted && !e2ee.IsCiphertext(t.Description) {
			add(ev, "DESCRIPTION", caldav.EscapeText(t.Description))
		}
		start, end := eventTimes(t)
		ev.Props = append(ev.Props, start, end)
		if t.TZ != nil && t.Time != nil && !zones[*t.TZ] {
			if vt := caldav.VTimezone(*t.TZ, t.Date, *t.Time); vt != nil {
				zones[*t.TZ] = true
				cal.Children = append(cal.Children, vt)
			}
		}
		if t.RRULE != "" {
			add(ev, "RRULE", t.RRULE)
		}
		if len(t.Labels) > 0 && !opts.Encrypted {
			esc := ""
			for i, l := range t.Labels {
				if i > 0 {
					esc += ","
				}
				esc += caldav.EscapeText(l)
			}
			add(ev, "CATEGORIES", esc)
		}
		if t.Priority > 0 {
			add(ev, "X-OPENTODO-PRIORITY", strconv.Itoa(t.Priority))
		}
		if opts.BaseURL != "" {
			add(ev, "URL", opts.BaseURL+"/day/"+t.Date)
		}
		events = append(events, ev)
	}
	cal.Children = append(cal.Children, events...)
	return cal.Encode()
}

// eventTimes gives DTSTART and DTEND: a whole day for a date-only due, the
// estimate (or 30 minutes) from a timed one, in its zone when it has one.
func eventTimes(t FeedTask) (caldav.Prop, caldav.Prop) {
	date := t.Date
	compact := func(d string) string { return d[:4] + d[5:7] + d[8:10] }
	if t.Time == nil {
		next := date
		if d, err := time.Parse("2006-01-02", date); err == nil {
			next = d.AddDate(0, 0, 1).Format("2006-01-02")
		}
		v := []caldav.Param{{Name: "VALUE", Values: []string{"DATE"}}}
		return caldav.Prop{Name: "DTSTART", Params: v, Value: compact(date)}, caldav.Prop{Name: "DTEND", Params: v, Value: compact(next)}
	}
	length := DefaultBlock
	if t.Estimate > 0 {
		length = time.Duration(t.Estimate) * time.Minute
	}
	loc := time.UTC
	var params []caldav.Param
	if t.TZ != nil {
		if l, err := zoned.Load(*t.TZ); err == nil {
			loc = l
			params = []caldav.Param{{Name: "TZID", Values: []string{*t.TZ}}}
		}
	}
	startT, err := time.ParseInLocation("2006-01-02 15:04", date+" "+*t.Time, loc)
	if err != nil {
		startT, _ = time.Parse("2006-01-02", date)
	}
	endT := startT.Add(length)
	layout := "20060102T150405"
	return caldav.Prop{Name: "DTSTART", Params: params, Value: startT.Format(layout)}, caldav.Prop{Name: "DTEND", Params: params, Value: endT.Format(layout)}
}
