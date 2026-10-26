package calsync

import (
	"errors"
	"net/url"
	"testing"
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
