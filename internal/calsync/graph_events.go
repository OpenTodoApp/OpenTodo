package calsync

import (
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/calfeed"
	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/zoned"
)

// Events as Graph writes and reads them (outlook-calendar-sync, design D5, D8).

// graphDateTime is Graph's dateTimeTimeZone.
type graphDateTime struct {
	DateTime string `json:"dateTime"`
	TimeZone string `json:"timeZone"`
}

// graphEvent is the part of an event resource calendar sync reads.
type graphEvent struct {
	ID      string `json:"id"`
	ETag    string `json:"@odata.etag"`
	Removed *struct {
		Reason string `json:"reason"`
	} `json:"@removed"`
	Subject      string         `json:"subject"`
	Start        *graphDateTime `json:"start"`
	End          *graphDateTime `json:"end"`
	IsAllDay     bool           `json:"isAllDay"`
	IsCancelled  bool           `json:"isCancelled"`
	ShowAs       string         `json:"showAs"`
	LastModified string         `json:"lastModifiedDateTime"`
	Location     *struct {
		DisplayName string `json:"displayName"`
	} `json:"location"`
	Props []struct {
		ID    string `json:"id"`
		Value string `json:"value"`
	} `json:"singleValueExtendedProperties"`
}

// taskID is the task OpenTodo's property names, "" for another event.
func (e *graphEvent) taskID() string {
	for _, p := range e.Props {
		if strings.EqualFold(p.ID, TaskProperty) {
			return p.Value
		}
	}
	return ""
}

// parseGraphTime reads "2026-11-03T09:00:00.0000000" in loc.
func parseGraphTime(v string, loc *time.Location) (time.Time, bool) {
	if len(v) < 19 {
		return time.Time{}, false
	}
	t, err := time.ParseInLocation("2006-01-02T15:04:05", v[:19], loc)
	return t, err == nil
}

// point reads a start or end: all-day ones as dates, timed ones as UTC
// instants (calendar sync then reads them in the task's zone or the
// mailbox's, as for a CalDAV event in UTC).
func (d *graphDateTime) point(allDay bool) (calfeed.Point, bool) {
	if d == nil {
		return calfeed.Point{}, false
	}
	if allDay {
		t, ok := parseGraphTime(d.DateTime, time.UTC)
		if !ok {
			return calfeed.Point{}, false
		}
		return calfeed.Point{T: time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC), AllDay: true}, true
	}
	t, ok := parseGraphTime(d.DateTime, zoneLocation(d.TimeZone))
	if !ok {
		return calfeed.Point{}, false
	}
	return calfeed.Point{T: t.UTC(), Zone: "UTC"}, true
}

// event turns a Graph event into the parsed form the cycle and the shown
// calendars use.
func (e *graphEvent) event() (calfeed.Event, bool) {
	start, ok := e.Start.point(e.IsAllDay)
	if !ok {
		return calfeed.Event{}, false
	}
	ev := calfeed.Event{UID: e.ID, Summary: e.Subject, Start: start, Cancelled: e.IsCancelled, Free: strings.EqualFold(e.ShowAs, "free")}
	if end, ok := e.End.point(e.IsAllDay); ok && end.T.After(start.T) {
		ev.End = &end
	}
	if e.Location != nil {
		ev.Location = e.Location.DisplayName
	}
	if t, err := time.Parse(time.RFC3339Nano, e.LastModified); err == nil {
		ev.LastModified = t.UnixMilli()
	}
	return ev, true
}

// remote is the event as the cycle reads it.
func (e *graphEvent) remote() (remote, bool) {
	ev, ok := e.event()
	if !ok {
		return remote{}, false
	}
	var when string
	if e.Start != nil && e.End != nil {
		when = e.Start.DateTime + e.Start.TimeZone + e.End.DateTime + e.End.TimeZone
	}
	return remote{Href: e.ID, ETag: e.ETag, Events: []calfeed.Event{ev}, TaskID: e.taskID(),
		Version: e.ETag + "\x00" + hash16(e.Subject+"\x00"+when)}, true
}

// mailboxWindows is the Windows id and location of the mailbox zone (an IANA
// name, "" for UTC); a zone the table does not name is written in UTC.
func mailboxWindows(mailbox string) (string, *time.Location) {
	if mailbox != "" {
		if loc, err := zoned.Load(mailbox); err == nil {
			if win, ok := zoned.WindowsName(loc.String()); ok {
				return win, loc
			}
		}
	}
	return "UTC", time.UTC
}

// graphTimes is a task's start and end as Graph wants them (design D8): a
// span or a date-only task all-day in the mailbox zone; a zoned task in its
// zone's Windows id; a floating task at its wall time in the mailbox zone; a
// zone without a Windows id as the same instant in UTC.
func graphTimes(t calfeed.FeedTask, mailbox string) (start, end graphDateTime, allDay bool) {
	const layout = "2006-01-02T15:04:05"
	if t.Time == nil || t.Start != "" {
		first := t.Date
		if t.Start != "" {
			first = t.Start
		}
		zone, _ := mailboxWindows(mailbox)
		next := t.Date
		if d, err := time.Parse(time.DateOnly, t.Date); err == nil {
			next = d.AddDate(0, 0, 1).Format(time.DateOnly)
		}
		return graphDateTime{first + "T00:00:00", zone}, graphDateTime{next + "T00:00:00", zone}, true
	}
	var loc *time.Location
	if t.TZ != nil {
		loc, _ = zoned.Load(*t.TZ)
	}
	if loc == nil {
		_, loc = mailboxWindows(mailbox)
		if mailbox != "" && loc == time.UTC {
			if l, err := zoned.Load(mailbox); err == nil {
				loc = l
			}
		}
	}
	at, err := zoned.Instant(t.Date, *t.Time, loc)
	if err != nil {
		at = time.Date(0, 1, 1, 0, 0, 0, 0, time.UTC)
	}
	minutes := int(calfeed.DefaultBlock / time.Minute)
	if t.Estimate > 0 {
		minutes = t.Estimate
	}
	until := at.Add(time.Duration(minutes) * time.Minute)
	zone, ok := zoned.WindowsName(loc.String())
	if !ok {
		zone, loc = "UTC", time.UTC
	}
	return graphDateTime{at.In(loc).Format(layout), zone}, graphDateTime{until.In(loc).Format(layout), zone}, false
}

// graphBody is the event a task should have: its title (the placeholder for
// an encrypted account), its notes as plain text (none when encrypted), its
// times and no reminder (design D7).
func graphBody(t calfeed.FeedTask, opts calfeed.FeedOptions, mailbox string) map[string]any {
	start, end, allDay := graphTimes(t, mailbox)
	content := ""
	if !opts.Encrypted && !e2ee.IsCiphertext(t.Description) {
		content = t.Description
	}
	return map[string]any{
		"subject":      calfeed.EventTitle(t, opts.Encrypted),
		"body":         map[string]string{"contentType": "text", "content": content},
		"start":        start,
		"end":          end,
		"isAllDay":     allDay,
		"isReminderOn": false,
	}
}
