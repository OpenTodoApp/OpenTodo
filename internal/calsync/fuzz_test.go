package calsync

import (
	"encoding/json"
	"errors"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/calfeed"
)

// FuzzParseMultistatus: a 207 answer from the user's calendar server (wave 2 of
// the 2026-10 audit, Z1). No panic; a bad answer is ReasonInvalid; every
// resource kept has an href resolved against the base.
func FuzzParseMultistatus(f *testing.F) {
	for _, s := range []string{
		`<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/cal/a.ics</d:href><d:propstat><d:prop><d:getetag>"1"</d:getetag><c:calendar-data>BEGIN:VCALENDAR&#13;
END:VCALENDAR</c:calendar-data></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat><d:propstat><d:prop><d:x/></d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat></d:response><d:response><d:href>gone.ics</d:href><d:status>HTTP/1.1 404 Not Found</d:status></d:response><d:sync-token>http://x/sync/2</d:sync-token></d:multistatus>`,
		`<d:multistatus xmlns:d="DAV:"><d:response><d:href>https://other.example/%zz</d:href></d:response></d:multistatus>`,
		`<multistatus/>`,
	} {
		f.Add("https://dav.example/cal/", []byte(s))
	}
	f.Fuzz(func(t *testing.T, base string, body []byte) {
		ms, err := parseMultistatus(base, body)
		if err != nil {
			var e *Error
			if !errors.As(err, &e) || e.Reason != ReasonInvalid {
				t.Fatalf("error %v is not ReasonInvalid", err)
			}
			return
		}
		b, berr := url.Parse(base)
		for _, r := range ms.Resources {
			if r.Href == "" {
				t.Fatal("resource without an href kept")
			}
			if berr == nil && b.IsAbs() {
				if u, err := url.Parse(r.Href); err == nil && !u.IsAbs() {
					t.Fatalf("href %q not resolved against %q", r.Href, base)
				}
			}
			for k, p := range r.Props {
				if p == nil || k != p.Space+" "+p.Local {
					t.Fatalf("property key %q", k)
				}
			}
		}
	})
}

// FuzzGraphPage: a calendarView or calendarView/delta page from Microsoft
// Graph (outlook-calendar-sync). No panic; every event kept has a start, an
// end only after its start, all-day points at midnight UTC and timed ones in
// UTC, and the remote the cycle reads names the event by its id.
func FuzzGraphPage(f *testing.F) {
	for _, s := range []string{
		`{"value":[{"id":"AAMk1","@odata.etag":"W/\"1\"","subject":"Write","start":{"dateTime":"2026-11-03T09:00:00.0000000","timeZone":"W. Europe Standard Time"},"end":{"dateTime":"2026-11-03T10:00:00.0000000","timeZone":"W. Europe Standard Time"},"isAllDay":false,"showAs":"busy","lastModifiedDateTime":"2026-11-01T08:00:00.1234567Z","location":{"displayName":"Desk"},"singleValueExtendedProperties":[{"id":"` + TaskProperty + `","value":"task-1"}]}],"@odata.nextLink":"https://graph.microsoft.com/v1.0/me/calendars/c/calendarView/delta?$skiptoken=1"}`,
		`{"value":[{"id":"AAMk2","start":{"dateTime":"2026-11-03T00:00:00.0000000","timeZone":"UTC"},"end":{"dateTime":"2026-11-04T00:00:00.0000000","timeZone":"UTC"},"isAllDay":true,"showAs":"free","isCancelled":true},{"id":"AAMk3","@removed":{"reason":"deleted"}}],"@odata.deltaLink":"https://graph.microsoft.com/v1.0/me/calendars/c/calendarView/delta?$deltatoken=2"}`,
		`{"value":[{"id":"x","start":{"dateTime":"2026-03-29T02:30:00","timeZone":"Europe/Berlin"},"end":{"dateTime":"2026-03-29T01:00:00","timeZone":"Not A Zone"}},{"id":"","start":null}]}`,
		`{"value":[{"id":"y","start":{"dateTime":"0000-01-01T00:00:00","timeZone":"Dateline Standard Time"},"end":{"dateTime":"9999-12-31T23:59:59","timeZone":"Line Islands Standard Time"}}]}`,
		`{}`,
	} {
		f.Add([]byte(s))
	}
	f.Fuzz(func(t *testing.T, body []byte) {
		var p graphPage
		if json.Unmarshal(body, &p) != nil {
			return // readDelta and window refuse the page as ReasonInvalid
		}
		for i := range p.Value {
			e := &p.Value[i]
			r, ok := e.remote()
			if !ok {
				continue
			}
			if r.Href != e.ID || r.ETag != e.ETag || r.TaskID != e.taskID() || len(r.Events) != 1 {
				t.Fatalf("remote %+v for event %q", r, e.ID)
			}
			if !strings.HasPrefix(r.Version, e.ETag+"\x00") {
				t.Fatalf("version %q does not start with the etag", r.Version)
			}
			ev := r.Events[0]
			if ev.UID != e.ID {
				t.Fatalf("uid %q, id %q", ev.UID, e.ID)
			}
			checkGraphPoint(t, ev.Start, e.IsAllDay)
			if ev.End != nil {
				checkGraphPoint(t, *ev.End, e.IsAllDay)
				if !ev.End.T.After(ev.Start.T) {
					t.Fatalf("end %v not after start %v", ev.End.T, ev.Start.T)
				}
			}
		}
	})
}

func checkGraphPoint(t *testing.T, p calfeed.Point, allDay bool) {
	t.Helper()
	if p.AllDay != allDay {
		t.Fatalf("point all-day %v, event all-day %v", p.AllDay, allDay)
	}
	if p.T.Location() != time.UTC {
		t.Fatalf("point %v not in UTC", p.T)
	}
	if allDay {
		if p.Zone != "" || p.T.Hour() != 0 || p.T.Minute() != 0 || p.T.Second() != 0 || p.T.Nanosecond() != 0 {
			t.Fatalf("all-day point %+v", p)
		}
	} else if p.Zone != "UTC" {
		t.Fatalf("timed point zone %q", p.Zone)
	}
}
