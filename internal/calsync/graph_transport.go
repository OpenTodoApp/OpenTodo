package calsync

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/calfeed"
)

// graphTransport is the Microsoft Graph transport (outlook-calendar-sync,
// design D1, D5–D7). Changes come from calendarView/delta over the sync
// window, one cursor per calendar, kept only when the cycle completes.
type graphTransport struct {
	g     *Graph
	store *Store
	conn  string
	// zone is the mailbox's zone (IANA, "" for UTC).
	zone    string
	now     func() time.Time
	pending map[string]Cursor
	deltas  map[string]*listing
}

func (t *graphTransport) key(href string) string { return href }

func calendarPath(cal string) string { return "/me/calendars/" + url.PathEscape(cal) }
func eventPath(id string) string     { return "/me/events/" + url.PathEscape(id) }

func graphStamp(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05Z") }

// errGone is a delta link Microsoft no longer accepts (410).
var errGone = &Error{Reason: "delta_gone"}

// readDelta follows a delta query's pages to its delta link.
func (t *graphTransport) readDelta(ctx context.Context, start string) (*listing, string, error) {
	l := newListing()
	next := start
	for page := 0; ; page++ {
		if page >= maxGraphPages {
			return nil, "", &Error{Reason: ReasonTooLarge}
		}
		resp, err := t.g.do(ctx, http.MethodGet, next, map[string]string{"Prefer": "odata.maxpagesize=200"}, nil)
		if err != nil {
			return nil, "", err
		}
		switch {
		case resp.Status == http.StatusGone:
			return nil, "", errGone
		case resp.Status != http.StatusOK:
			return nil, "", graphStatus(resp.Status)
		}
		var p struct {
			Value []graphEvent `json:"value"`
			Next  string       `json:"@odata.nextLink"`
			Delta string       `json:"@odata.deltaLink"`
		}
		if json.Unmarshal(resp.Body, &p) != nil {
			return nil, "", &Error{Reason: ReasonInvalid}
		}
		for _, ev := range p.Value {
			if ev.ID == "" {
				continue
			}
			if ev.Removed != nil {
				delete(l.changed, ev.ID)
				l.removed[ev.ID] = true
				continue
			}
			delete(l.removed, ev.ID)
			l.changed[ev.ID], l.hrefs[ev.ID] = ev.ETag, ev.ID
		}
		switch {
		case p.Next != "":
			next = p.Next
		case p.Delta != "":
			return l, p.Delta, nil
		default:
			return nil, "", &Error{Reason: ReasonInvalid}
		}
	}
}

// version reads a calendar's changes since its cursor and keeps them for
// changes: the version stays while nothing changed. The cursor is rebuilt
// from a full listing when there is none, when the sync window moved, and
// when Microsoft no longer accepts it (design D6).
func (t *graphTransport) version(ctx context.Context, cal string) (version, error) {
	win := calfeed.StoreWindow(t.now())
	cur, err := t.store.Cursor(ctx, t.conn, cal)
	if err != nil {
		return version{}, err
	}
	var l *listing
	var link string
	if cur != nil && cur.DeltaLink != "" && cur.From == win.From.UnixMilli() && cur.To == win.To.UnixMilli() {
		l, link, err = t.readDelta(ctx, cur.DeltaLink)
		if err != nil && err != errGone {
			return version{}, err
		}
	}
	if l == nil {
		start := calendarPath(cal) + "/calendarView/delta?" + query(url.Values{"startDateTime": {graphStamp(win.From)}, "endDateTime": {graphStamp(win.To)}})
		if l, link, err = t.readDelta(ctx, start); err != nil {
			if err == errGone {
				err = &Error{Reason: ReasonInvalid}
			}
			return version{}, err
		}
		l.full = true
	}
	v := ""
	if cur != nil {
		v = cur.Version
	}
	if v == "" || l.full || len(l.changed)+len(l.removed) > 0 {
		v = hash16(link + "\x00" + strconv.FormatInt(t.now().UnixNano(), 10) + "\x00" + v)
	}
	if t.pending == nil {
		t.pending, t.deltas = map[string]Cursor{}, map[string]*listing{}
	}
	t.pending[cal] = Cursor{DeltaLink: link, From: win.From.UnixMilli(), To: win.To.UnixMilli(), Version: v}
	t.deltas[cal] = l
	return version{ctag: "gv:" + v}, nil
}

func (t *graphTransport) changes(ctx context.Context, cal string, _ version, _ string) (*listing, error) {
	if l := t.deltas[cal]; l != nil {
		return l, nil
	}
	if _, err := t.version(ctx, cal); err != nil {
		return nil, err
	}
	return t.deltas[cal], nil
}

// fetch reads linked events with OpenTodo's property; one that is gone is
// left out (the next delta reports it removed).
func (t *graphTransport) fetch(ctx context.Context, _ string, ids []string) (map[string]remote, error) {
	out := map[string]remote{}
	for _, id := range ids {
		var ev graphEvent
		err := t.g.get(ctx, eventPath(id)+"?"+query(url.Values{"$expand": {expandProperty}}), &ev)
		if reasonOf(err) == ReasonCalendarMissing {
			continue
		}
		if err != nil {
			return nil, err
		}
		if r, ok := ev.remote(); ok {
			out[id] = r
		}
	}
	return out, nil
}

// window reads every event of a calendar in the window, recurring ones as
// their occurrences.
func (t *graphTransport) window(ctx context.Context, cal string, win calfeed.Window) ([]remote, error) {
	next := calendarPath(cal) + "/calendarView?" + query(url.Values{"startDateTime": {graphStamp(win.From)}, "endDateTime": {graphStamp(win.To)},
		"$top": {"250"}, "$expand": {expandProperty}})
	var out []remote
	for page := 0; next != ""; page++ {
		if page >= maxGraphPages {
			return nil, &Error{Reason: ReasonTooLarge}
		}
		var p struct {
			Value []graphEvent `json:"value"`
			Next  string       `json:"@odata.nextLink"`
		}
		if err := t.g.get(ctx, next, &p); err != nil {
			return nil, err
		}
		for i := range p.Value {
			if r, ok := p.Value[i].remote(); ok {
				out = append(out, r)
			}
		}
		next = p.Next
	}
	return out, nil
}

// written reads the id and ETag of a created or changed event.
func written(resp *Response) (int, string, string, error) {
	var ev graphEvent
	if json.Unmarshal(resp.Body, &ev) != nil || ev.ID == "" {
		return 0, "", "", &Error{Reason: ReasonInvalid}
	}
	return resp.Status, ev.ID, ev.ETag, nil
}

// writeStatus turns a refused write into a stop: the calendar is gone or can
// no longer be written (design D9).
func writeStatus(status int) error {
	switch status {
	case http.StatusForbidden:
		return &Error{Reason: ReasonCalendarReadOnly}
	}
	return nil
}

// create posts a new event with OpenTodo's property and a transaction id, so
// a creation retried after a lost answer makes no second event (design D5).
func (t *graphTransport) create(ctx context.Context, cal string, task calfeed.FeedTask, opts calfeed.FeedOptions, again string) (int, string, string, error) {
	body := graphBody(task, opts, t.zone)
	body["singleValueExtendedProperties"] = []map[string]string{{"id": TaskProperty, "value": task.ID}}
	body["transactionId"] = "opentodo-" + t.conn + "-" + task.ID
	if again != "" {
		body["transactionId"] = "opentodo-" + t.conn + "-" + task.ID + "-" + hash16(again)
	}
	resp, err := t.g.do(ctx, http.MethodPost, calendarPath(cal)+"/events", nil, body)
	if err != nil {
		return 0, "", "", err
	}
	switch {
	case resp.Status == http.StatusNotFound:
		return 0, "", "", &Error{Reason: ReasonCalendarMissing}
	case writeStatus(resp.Status) != nil:
		return 0, "", "", writeStatus(resp.Status)
	case resp.Status < 200 || resp.Status > 299:
		return resp.Status, "", "", nil
	}
	return written(resp)
}

func (t *graphTransport) current(ctx context.Context, href string) (int, string, error) {
	var ev graphEvent
	if err := t.g.get(ctx, eventPath(href)+"?$select=id", &ev); err != nil {
		if reasonOf(err) == ReasonCalendarMissing {
			return http.StatusNotFound, "", nil
		}
		return 0, "", err
	}
	return http.StatusOK, ev.ETag, nil
}

// replace changes an event while its ETag is etag; 412 and 404 go back to
// the cycle (design D7).
func (t *graphTransport) replace(ctx context.Context, href, etag string, task calfeed.FeedTask, opts calfeed.FeedOptions) (int, string, error) {
	h := map[string]string{}
	if etag != "" {
		h["If-Match"] = etag
	}
	resp, err := t.g.do(ctx, http.MethodPatch, eventPath(href), h, graphBody(task, opts, t.zone))
	if err != nil {
		return 0, "", err
	}
	if err := writeStatus(resp.Status); err != nil {
		return 0, "", err
	}
	if resp.Status < 200 || resp.Status > 299 {
		return resp.Status, "", nil
	}
	status, _, newETag, err := written(resp)
	return status, newETag, err
}

func (t *graphTransport) remove(ctx context.Context, href, etag string) (int, error) {
	h := map[string]string{}
	if etag != "" {
		h["If-Match"] = etag
	}
	resp, err := t.g.do(ctx, http.MethodDelete, eventPath(href), h, nil)
	if err != nil {
		return 0, err
	}
	if err := writeStatus(resp.Status); err != nil {
		return 0, err
	}
	return resp.Status, nil
}

// commit keeps the cursors the cycle read.
func (t *graphTransport) commit(ctx context.Context) error {
	for cal, c := range t.pending {
		if err := t.store.SaveCursor(ctx, t.conn, cal, c); err != nil {
			return err
		}
	}
	return nil
}
