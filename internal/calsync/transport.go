package calsync

import (
	"context"
	"net/url"

	"github.com/OpenTodoApp/opentodo/internal/calfeed"
)

// transport is how a cycle reaches the calendars of one account (OpenSpec
// change outlook-calendar-sync, design D1): WebDAV for CalDAV and Google,
// Microsoft Graph for Outlook. The cycle (pull before push, the write cap,
// the conflict rule, snapshots and ops) is the same for every transport.
type transport interface {
	// key normalises an event address for comparison.
	key(href string) string
	// version is a calendar's state; an empty key means "unknown, read it".
	// A missing calendar is ReasonCalendarMissing.
	version(ctx context.Context, cal string) (version, error)
	// changes lists what changed in cal since the stored cursor (the
	// connection's sync token for WebDAV).
	changes(ctx context.Context, cal string, ver version, token string) (*listing, error)
	// fetch reads events by address, by key.
	fetch(ctx context.Context, cal string, hrefs []string) (map[string]remote, error)
	// window reads every event of cal that touches win.
	window(ctx context.Context, cal string, win calfeed.Window) ([]remote, error)
	// create writes a new event for t into cal and returns its address; a
	// 412 means one already exists there (WebDAV only). again is the address
	// of an event that was deleted since it was written, "" for a first write.
	create(ctx context.Context, cal string, t calfeed.FeedTask, opts calfeed.FeedOptions, again string) (status int, href, etag string, err error)
	// current reads the ETag of the event at href.
	current(ctx context.Context, href string) (status int, etag string, err error)
	// replace overwrites the event at href while its ETag is etag
	// (unconditionally when etag is "").
	replace(ctx context.Context, href, etag string, t calfeed.FeedTask, opts calfeed.FeedOptions) (status int, newETag string, err error)
	// remove deletes the event at href (If-Match when etag is set).
	remove(ctx context.Context, href, etag string) (int, error)
	// commit keeps the cursors of a cycle that completed.
	commit(ctx context.Context) error
}

// remote is one event read back from a calendar.
type remote struct {
	Href string
	ETag string
	// Events are the object's events: the master and its overrides.
	Events   []calfeed.Event
	Warnings []string
	// TaskID is the task an event carries OpenTodo's mark for (Graph's
	// extended property), "" when the transport does not mark events.
	TaskID string
	// Version identifies this state of the event for op ids.
	Version string
}

// master returns the event that is not an override.
func (o remote) master() (calfeed.Event, bool) {
	for _, ev := range o.Events {
		if ev.RecurrenceID == "" {
			return ev, true
		}
	}
	return calfeed.Event{}, false
}

// davTransport is the WebDAV transport (CalDAV and Google's CalDAV API).
type davTransport struct{ d *DAV }

func (t davTransport) key(href string) string { return hrefKey(href) }

func (t davTransport) version(ctx context.Context, cal string) (version, error) {
	return t.d.calendarVersion(ctx, cal)
}

// changes uses sync-collection when the server has sync tokens (from the
// stored token, or from the start), else the ETags.
func (t davTransport) changes(ctx context.Context, cal string, ver version, token string) (*listing, error) {
	if ver.syncToken != "" {
		l, ok, err := t.d.syncCollection(ctx, cal, token)
		if err != nil {
			return nil, err
		}
		if !ok {
			// The stored token was refused: list from the start.
			if l, _, err = t.d.syncCollection(ctx, cal, ""); err != nil {
				return nil, err
			}
		}
		if l != nil {
			return l, nil
		}
	}
	return t.d.etagListing(ctx, cal)
}

func davRemote(o object) remote {
	r := remote{Href: o.Href, ETag: o.ETag, Version: o.ETag + "\x00" + hash16(string(o.Data))}
	if cal, err := calfeed.ParseCalendar(o.Data); err == nil {
		r.Events, r.Warnings = cal.Events, cal.Warnings
	}
	return r
}

func (t davTransport) fetch(ctx context.Context, cal string, hrefs []string) (map[string]remote, error) {
	objs, err := t.d.multiget(ctx, cal, hrefs)
	if err != nil {
		return nil, err
	}
	out := make(map[string]remote, len(objs))
	for k, o := range objs {
		out[k] = davRemote(o)
	}
	return out, nil
}

func (t davTransport) window(ctx context.Context, cal string, win calfeed.Window) ([]remote, error) {
	objs, err := t.d.query(ctx, cal, win)
	if err != nil {
		return nil, err
	}
	out := make([]remote, 0, len(objs))
	for _, o := range objs {
		if r := davRemote(o); r.Events != nil {
			out = append(out, r)
		}
	}
	return out, nil
}

func (t davTransport) create(ctx context.Context, cal string, task calfeed.FeedTask, opts calfeed.FeedOptions, _ string) (int, string, string, error) {
	href := cal + url.PathEscape(task.ID) + ".ics"
	status, etag, err := t.d.put(ctx, href, "*", calfeed.WriteEvent(task, opts))
	return status, href, etag, err
}

func (t davTransport) current(ctx context.Context, href string) (int, string, error) {
	return t.d.get(ctx, href)
}

func (t davTransport) replace(ctx context.Context, href, etag string, task calfeed.FeedTask, opts calfeed.FeedOptions) (int, string, error) {
	return t.d.put(ctx, href, etag, calfeed.WriteEvent(task, opts))
}

func (t davTransport) remove(ctx context.Context, href, etag string) (int, error) {
	return t.d.del(ctx, href, etag)
}

func (davTransport) commit(context.Context) error { return nil }
