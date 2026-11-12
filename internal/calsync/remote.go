package calsync

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/caldav"
	"github.com/OpenTodoApp/opentodo/internal/calfeed"
)

// Requests a cycle sends to one calendar (design D7).

// hrefKey normalises an address for comparison: its unescaped path.
func hrefKey(href string) string {
	u, err := url.Parse(href)
	if err != nil {
		return href
	}
	p := u.Path
	if p == "" {
		p = "/"
	}
	return strings.TrimSuffix(p, "/")
}

// dirURL makes sure a collection address ends with a slash.
func dirURL(u string) string {
	if strings.HasSuffix(u, "/") {
		return u
	}
	return u + "/"
}

// version is a calendar's state: its sync token and CTag.
type version struct{ syncToken, ctag string }

// key is what is stored to tell whether the calendar changed.
func (v version) key() string {
	if v.syncToken != "" {
		return "st:" + v.syncToken
	}
	if v.ctag != "" {
		return "ct:" + v.ctag
	}
	return ""
}

// calendarVersion asks a calendar for its sync token and CTag; a missing
// calendar is ReasonCalendarMissing.
func (d *DAV) calendarVersion(ctx context.Context, cal string) (version, error) {
	ms, err := d.PropFind(ctx, cal, "0", `<cs:getctag/><d:sync-token/><d:resourcetype/>`)
	if err != nil {
		if asStatus(err) == http.StatusNotFound {
			return version{}, &Error{Reason: ReasonCalendarMissing}
		}
		return version{}, davError(err)
	}
	for _, r := range ms.Resources {
		if hrefKey(r.Href) == hrefKey(cal) || len(ms.Resources) == 1 {
			return version{syncToken: r.Text(caldav.NSDAV, "sync-token"), ctag: r.Text(caldav.NSCS, "getctag")}, nil
		}
	}
	return version{}, nil
}

// listing is what changed in a calendar: the members with their ETag
// (changed), the members that are gone (removed, by key), whether changed
// holds every member (full) and the new sync token.
type listing struct {
	changed   map[string]string // href key → ETag
	hrefs     map[string]string // href key → absolute href
	removed   map[string]bool
	full      bool
	syncToken string
}

func newListing() *listing {
	return &listing{changed: map[string]string{}, hrefs: map[string]string{}, removed: map[string]bool{}}
}

// syncCollection reads the changes since token (RFC 6578); an empty token
// lists every member. ok is false when the server refused the token.
func (d *DAV) syncCollection(ctx context.Context, cal, token string) (*listing, bool, error) {
	body := `<?xml version="1.0" encoding="utf-8"?><d:sync-collection xmlns:d="DAV:"><d:sync-token>` + caldav.Esc(token) +
		`</d:sync-token><d:sync-level>1</d:sync-level><d:prop><d:getetag/></d:prop></d:sync-collection>`
	ms, err := d.Report(ctx, cal, "0", body)
	if err != nil {
		switch asStatus(err) {
		case http.StatusForbidden, http.StatusConflict, http.StatusBadRequest, http.StatusPreconditionFailed:
			if token != "" {
				return nil, false, nil
			}
		}
		return nil, true, davError(err)
	}
	l := newListing()
	l.full, l.syncToken = token == "", ms.SyncToken
	for _, r := range ms.Resources {
		k := hrefKey(r.Href)
		if k == hrefKey(cal) {
			continue
		}
		if r.Status == http.StatusNotFound {
			l.removed[k] = true
			continue
		}
		l.changed[k], l.hrefs[k] = r.Text(caldav.NSDAV, "getetag"), r.Href
	}
	return l, true, nil
}

// etagListing lists every member of a calendar with its ETag.
func (d *DAV) etagListing(ctx context.Context, cal string) (*listing, error) {
	ms, err := d.PropFind(ctx, cal, "1", `<d:getetag/><d:resourcetype/>`)
	if err != nil {
		return nil, davError(err)
	}
	l := newListing()
	l.full = true
	for _, r := range ms.Resources {
		k := hrefKey(r.Href)
		if k == hrefKey(cal) {
			continue
		}
		if rt := r.Prop(caldav.NSDAV, "resourcetype"); rt != nil && rt.Child(caldav.NSDAV, "collection") != nil {
			continue
		}
		l.changed[k], l.hrefs[k] = r.Text(caldav.NSDAV, "getetag"), r.Href
	}
	return l, nil
}

// object is one calendar object read back.
type object struct {
	Href string
	ETag string
	Data []byte
}

// Reads that fit (issue 1226): no answer may exceed MaxBody, so a read whose
// answer would is split into smaller ones instead of failing. A single event
// over MaxBody is still too_large.

// multigetBody is a calendar-multiget of hrefs, with calendar-data or ETags only.
func multigetBody(hrefs []string, data bool) string {
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="utf-8"?><c:calendar-multiget xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/>`)
	if data {
		b.WriteString(`<c:calendar-data/>`)
	}
	b.WriteString(`</d:prop>`)
	for _, h := range hrefs {
		p := h
		if u, err := url.Parse(h); err == nil {
			p = u.EscapedPath()
		}
		b.WriteString("<d:href>" + caldav.Esc(p) + "</d:href>")
	}
	b.WriteString(`</c:calendar-multiget>`)
	return b.String()
}

// multigetEach reads hrefs in batches of MultigetBatch, halving a batch whose
// answer is over MaxBody, and hands each response to fn.
func (d *DAV) multigetEach(ctx context.Context, cal string, hrefs []string, data bool, fn func(Resource)) error {
	for i := 0; i < len(hrefs); i += MultigetBatch {
		if err := d.multigetBatch(ctx, cal, hrefs[i:min(i+MultigetBatch, len(hrefs))], data, fn); err != nil {
			return err
		}
	}
	return nil
}

func (d *DAV) multigetBatch(ctx context.Context, cal string, hrefs []string, data bool, fn func(Resource)) error {
	ms, err := d.Report(ctx, cal, "1", multigetBody(hrefs, data))
	if reasonOf(err) == ReasonTooLarge && len(hrefs) > 1 {
		half := len(hrefs) / 2
		if err := d.multigetBatch(ctx, cal, hrefs[:half], data, fn); err != nil {
			return err
		}
		return d.multigetBatch(ctx, cal, hrefs[half:], data, fn)
	}
	if err != nil {
		return davError(err)
	}
	for _, r := range ms.Resources {
		fn(r)
	}
	return nil
}

// multiget reads calendar objects by href.
func (d *DAV) multiget(ctx context.Context, cal string, hrefs []string) (map[string]object, error) {
	out := map[string]object{}
	err := d.multigetEach(ctx, cal, hrefs, true, func(r Resource) {
		if data := r.Text(caldav.NSCalDAV, "calendar-data"); data != "" {
			out[hrefKey(r.Href)] = object{Href: r.Href, ETag: r.Text(caldav.NSDAV, "getetag"), Data: []byte(data)}
		}
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// knownListing is the listing of a calendar whose changes are too large for
// one answer: the ETags of the events OpenTodo wrote (known), read back by
// multiget, those the calendar no longer has as removed, and the calendar's
// current sync token to continue from.
func (d *DAV) knownListing(ctx context.Context, cal string, ver version, known []string) (*listing, error) {
	l := newListing()
	l.syncToken = ver.syncToken
	err := d.multigetEach(ctx, cal, known, false, func(r Resource) {
		k := hrefKey(r.Href)
		switch etag := r.Text(caldav.NSDAV, "getetag"); {
		case r.Status == http.StatusNotFound:
			l.removed[k] = true
		case etag != "":
			l.changed[k], l.hrefs[k] = etag, r.Href
		}
	})
	if err != nil {
		return nil, err
	}
	return l, nil
}

// query reads every event of a calendar that touches the window: in one
// calendar-query when its answer fits, else the halves of the window down to
// MinQuerySpan, and a piece that still does not fit by its ETags and
// multiget. An event in several pieces is kept once.
func (d *DAV) query(ctx context.Context, cal string, win calfeed.Window) ([]object, error) {
	q := &windowRead{d: d, cal: cal, seen: map[string]bool{}}
	if err := q.read(ctx, win); err != nil {
		return nil, err
	}
	return q.out, nil
}

type windowRead struct {
	d    *DAV
	cal  string
	seen map[string]bool
	out  []object
}

func (q *windowRead) add(o object) {
	if k := hrefKey(o.Href); !q.seen[k] {
		q.seen[k] = true
		q.out = append(q.out, o)
	}
}

func (q *windowRead) read(ctx context.Context, win calfeed.Window) error {
	ms, err := q.d.Report(ctx, q.cal, "1", queryBody(win, true))
	if reasonOf(err) == ReasonTooLarge {
		if span := win.To.Sub(win.From); span > MinQuerySpan {
			mid := win.From.Add(span / 2)
			if err := q.read(ctx, calfeed.Window{From: win.From, To: mid}); err != nil {
				return err
			}
			return q.read(ctx, calfeed.Window{From: mid, To: win.To})
		}
		return q.byETag(ctx, win)
	}
	if err != nil {
		return davError(err)
	}
	for _, r := range ms.Resources {
		if data := r.Text(caldav.NSCalDAV, "calendar-data"); data != "" {
			q.add(object{Href: r.Href, ETag: r.Text(caldav.NSDAV, "getetag"), Data: []byte(data)})
		}
	}
	return nil
}

// byETag reads a piece of the window too large for one answer: its members
// by ETag, then their data by multiget.
func (q *windowRead) byETag(ctx context.Context, win calfeed.Window) error {
	ms, err := q.d.Report(ctx, q.cal, "1", queryBody(win, false))
	if err != nil {
		return davError(err)
	}
	var hrefs []string
	for _, r := range ms.Resources {
		if hrefKey(r.Href) != hrefKey(q.cal) && !q.seen[hrefKey(r.Href)] {
			hrefs = append(hrefs, r.Href)
		}
	}
	return q.d.multigetEach(ctx, q.cal, hrefs, true, func(r Resource) {
		if data := r.Text(caldav.NSCalDAV, "calendar-data"); data != "" {
			q.add(object{Href: r.Href, ETag: r.Text(caldav.NSDAV, "getetag"), Data: []byte(data)})
		}
	})
}

// queryBody is a calendar-query of the events touching win, with
// calendar-data or ETags only.
func queryBody(win calfeed.Window, data bool) string {
	stamp := func(t time.Time) string { return t.UTC().Format("20060102T150405Z") }
	prop := `<d:getetag/>`
	if data {
		prop += `<c:calendar-data/>`
	}
	return `<?xml version="1.0" encoding="utf-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop>` + prop + `</d:prop>` +
		`<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="` + stamp(win.From) + `" end="` + stamp(win.To) +
		`"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`
}

// put writes a calendar object: create (If-None-Match: *) when etag is "*",
// else replace (If-Match: etag, unconditional when etag is ""). It returns
// the status and the new ETag when the server sent one.
func (d *DAV) put(ctx context.Context, href, etag string, body []byte) (int, string, error) {
	h := map[string]string{"Content-Type": "text/calendar; charset=utf-8"}
	switch etag {
	case "*":
		h["If-None-Match"] = "*"
	case "":
	default:
		h["If-Match"] = etag
	}
	resp, err := d.Do(ctx, http.MethodPut, href, h, body)
	if err != nil {
		return 0, "", err
	}
	return resp.Status, resp.Header.Get("ETag"), nil
}

// del deletes a calendar object (If-Match when etag is set).
func (d *DAV) del(ctx context.Context, href, etag string) (int, error) {
	h := map[string]string{}
	if etag != "" {
		h["If-Match"] = etag
	}
	resp, err := d.Do(ctx, http.MethodDelete, href, h, nil)
	if err != nil {
		return 0, err
	}
	return resp.Status, nil
}

// get reads one calendar object's ETag (after a create met an existing one).
func (d *DAV) get(ctx context.Context, href string) (int, string, error) {
	resp, err := d.Do(ctx, http.MethodGet, href, map[string]string{"Accept": "text/calendar"}, nil)
	if err != nil {
		return 0, "", err
	}
	return resp.Status, resp.Header.Get("ETag"), nil
}

// masterEvent parses a calendar object and returns its first event that is
// not an override.
func masterEvent(data []byte) (calfeed.Event, bool) {
	cal, err := calfeed.ParseCalendar(data)
	if err != nil {
		return calfeed.Event{}, false
	}
	for _, ev := range cal.Events {
		if ev.RecurrenceID == "" {
			return ev, true
		}
	}
	return calfeed.Event{}, false
}
