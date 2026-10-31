package calsync

import (
	"context"
	"errors"
	"net/http"
	"sort"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/calfeed"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
	"github.com/OpenTodoApp/opentodo/internal/zoned"
)

// cycle is one sync of one connection in progress (design D7).
type cycle struct {
	w         *Worker
	c         *Connection
	tr        transport
	target    string
	counts    RunCounts
	links     map[string]*Link // by task id
	byHref    map[string]*Link // by href key
	tasks     map[string]calfeed.FeedTask
	encrypted bool
	calZone   *time.Location
	writes    int
	ver       version
	syncToken string
	applied   bool
}

// run pulls, pushes and refreshes the shown calendars.
func (r *cycle) run(ctx context.Context) error {
	var err error
	if r.ver, err = r.tr.version(ctx, r.target); err != nil {
		return err
	}
	if r.encrypted, err = r.w.encrypted(ctx, r.c.UserID); err != nil {
		return err
	}
	if cal := r.c.Calendar(r.c.TargetURL); cal != nil && cal.TimeZone != "" {
		if loc, lerr := zoned.Load(cal.TimeZone); lerr == nil {
			r.calZone = loc
		}
	}
	if err := r.loadLinks(ctx); err != nil {
		return err
	}
	if err := r.loadTasks(ctx); err != nil {
		return err
	}
	r.syncToken = r.c.SyncToken
	if key := r.ver.key(); key == "" || key != r.c.CTag {
		if err := r.pull(ctx); err != nil {
			return err
		}
	}
	if r.applied {
		if err := r.loadTasks(ctx); err != nil {
			return err
		}
	}
	if err := r.push(ctx); err != nil {
		return err
	}
	return r.readCalendars(ctx)
}

func (r *cycle) loadLinks(ctx context.Context) error {
	links, err := r.w.Store.Links(ctx, r.c.ID)
	if err != nil {
		return err
	}
	r.links, r.byHref = links, map[string]*Link{}
	for _, l := range links {
		r.byHref[r.tr.key(l.Href)] = l
	}
	return nil
}

// loadTasks reads the push set: the task feed's selection within the window,
// date-only tasks only with the option on (design D5), spans always.
func (r *cycle) loadTasks(ctx context.Context) error {
	list, err := r.w.Tasks(ctx, r.c.UserID)
	if err != nil {
		return err
	}
	now := r.w.clock().UTC()
	from := now.AddDate(0, 0, -calfeed.FeedPastDays).Format("2006-01-02")
	to := now.AddDate(0, 0, calfeed.FeedFutureDays).Format("2006-01-02")
	r.tasks = map[string]calfeed.FeedTask{}
	for _, t := range list {
		// A span is written whatever the option says (multi-day-tasks D7).
		if t.Date == "" || t.Date < from || t.Date > to || (t.Time == nil && t.Start == "" && !r.c.IncludeDateOnly) {
			continue
		}
		r.tasks[t.ID] = t
	}
	return nil
}

// pull applies what changed in the calendar to the linked tasks (design D8).
func (r *cycle) pull(ctx context.Context) error {
	l, err := r.tr.changes(ctx, r.target, r.ver, r.c.SyncToken)
	if err != nil {
		return err
	}
	if l.syncToken != "" {
		r.syncToken = l.syncToken
	}
	var fetch []string
	for k, etag := range l.changed {
		link := r.byHref[k]
		if link == nil || (etag != "" && etag == link.ETag) {
			continue
		}
		fetch = append(fetch, l.hrefs[k])
	}
	for k, link := range r.byHref {
		_, present := l.changed[k]
		if l.removed[k] || (l.full && !present) {
			if err := r.removed(ctx, link); err != nil {
				return err
			}
		}
	}
	if len(fetch) == 0 {
		return nil
	}
	sort.Strings(fetch)
	objs, err := r.tr.fetch(ctx, r.target, fetch)
	if err != nil {
		return err
	}
	keys := make([]string, 0, len(objs))
	for k := range objs {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		if link := r.byHref[k]; link != nil {
			if err := r.changed(ctx, link, objs[k]); err != nil {
				return err
			}
		}
	}
	return nil
}

// changed handles a linked event whose ETag changed.
func (r *cycle) changed(ctx context.Context, link *Link, obj remote) error {
	ev, ok := obj.master()
	if !ok {
		return nil
	}
	remote := EventSnapshot(ev, link.Snapshot, r.calZone)
	if remote == link.Snapshot {
		link.ETag = obj.ETag // re-serialised, nothing changed
		return r.w.Store.SaveLink(ctx, r.c.ID, link)
	}
	task, inSet := r.tasks[link.TaskID]
	from := link.Snapshot
	if inSet {
		from = TaskSnapshot(task, r.encrypted)
	}
	if !inSet || from != link.Snapshot {
		// Both sides changed: the newer change wins.
		seen := ev.LastModified
		if seen == 0 {
			seen = r.w.clock().UnixMilli()
		}
		if !inSet || task.Modified >= seen {
			r.counts.Conflicts++
			link.ETag = obj.ETag // the task is written over the event
			return r.w.Store.SaveLink(ctx, r.c.ID, link)
		}
	}
	ts := r.w.Sync.ServerTSAt(r.w.clock().UnixMilli())
	ops, ch := EventOps(r.c.ID, link.TaskID, obj.Version, from, remote, ev.Summary, r.encrypted, ts)
	if err := r.apply(ctx, ops); err != nil {
		if !refused(err) {
			return err
		}
		r.counts.Refused++
	} else {
		r.counts.Moved += b2i(ch.Moved)
		r.counts.Renamed += b2i(ch.Renamed)
	}
	link.ETag, link.Snapshot = obj.ETag, remote
	return r.w.Store.SaveLink(ctx, r.c.ID, link)
}

// removed handles a linked event deleted in the calendar.
func (r *cycle) removed(ctx context.Context, link *Link) error {
	task, inSet := r.tasks[link.TaskID]
	switch {
	case inSet && TaskSnapshot(task, r.encrypted) != link.Snapshot:
		r.counts.Conflicts++ // the task changed too: it is written again
	case inSet:
		ops := UnscheduleOps(r.c.ID, link.TaskID, link.ETag+"\x00"+link.Href, r.w.Sync.ServerTSAt(r.w.clock().UnixMilli()))
		if err := r.apply(ctx, ops); err != nil {
			if !refused(err) {
				return err
			}
			r.counts.Refused++
		} else {
			r.counts.Unscheduled++
		}
	}
	delete(r.links, link.TaskID)
	delete(r.byHref, r.tr.key(link.Href))
	return r.w.Store.DeleteLink(ctx, r.c.ID, link.TaskID)
}

// refused reports a write the op log refused (permission, limits).
func refused(err error) bool {
	var rej *opsync.RejectedError
	return errors.As(err, &rej) || errors.Is(err, opsync.ErrForbidden)
}

// apply writes ops through ApplyStrict and wakes the devices.
func (r *cycle) apply(ctx context.Context, ops []opsync.Op) error {
	if len(ops) == 0 {
		return nil
	}
	res, err := r.w.Sync.ApplyStrict(ctx, r.c.UserID, ops)
	if err != nil {
		return err
	}
	if res.Applied > 0 {
		r.applied = true
		r.w.Sync.NotifyApplied(res, Device(r.c.ID))
	}
	return nil
}

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}

// push writes the tasks whose event differs from what was written, and
// removes the events of tasks that left the push set.
func (r *cycle) push(ctx context.Context) error {
	ids := make([]string, 0, len(r.tasks))
	for id := range r.tasks {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		t := r.tasks[id]
		want := TaskSnapshot(t, r.encrypted)
		link := r.links[id]
		if link != nil && link.Snapshot == want {
			continue
		}
		if r.writes >= MaxWritesPerRun {
			r.counts.Partial = true
			return nil
		}
		r.writes++
		if err := r.write(ctx, t, want, link); err != nil {
			return err
		}
	}
	gone := make([]string, 0)
	for id := range r.links {
		if _, ok := r.tasks[id]; !ok {
			gone = append(gone, id)
		}
	}
	sort.Strings(gone)
	for _, id := range gone {
		if r.writes >= MaxWritesPerRun {
			r.counts.Partial = true
			return nil
		}
		r.writes++
		if err := r.remove(ctx, r.links[id]); err != nil {
			return err
		}
	}
	return nil
}

// write creates or replaces one task's event.
func (r *cycle) write(ctx context.Context, t calfeed.FeedTask, want Snapshot, link *Link) error {
	opts := calfeed.FeedOptions{Now: r.w.clock(), BaseURL: r.w.BaseURL, Encrypted: r.encrypted}
	var status int
	var href, etag string
	var err error
	if link == nil {
		if status, href, etag, err = r.tr.create(ctx, r.target, t, opts, ""); err != nil {
			return err
		}
		if status == http.StatusPreconditionFailed {
			// It exists (a link lost in a restore): adopt it and replace it.
			if _, etag, err = r.tr.current(ctx, href); err != nil {
				return err
			}
			if status, etag, err = r.tr.replace(ctx, href, etag, t, opts); err != nil {
				return err
			}
		}
	} else {
		href = link.Href
		if status, etag, err = r.tr.replace(ctx, href, link.ETag, t, opts); err != nil {
			return err
		}
		switch status {
		case http.StatusPreconditionFailed:
			// Changed in the calendar since the pull: the next cycle compares.
			r.counts.Partial = true
			return nil
		case http.StatusNotFound:
			// Deleted since the pull: write it again.
			delete(r.byHref, r.tr.key(href))
			if status, href, etag, err = r.tr.create(ctx, r.target, t, opts, link.Href); err != nil {
				return err
			}
		}
	}
	if status < 200 || status > 299 {
		return statusError(status)
	}
	r.counts.Written++
	nl := &Link{TaskID: t.ID, Href: href, ETag: etag, Snapshot: want}
	r.links[t.ID], r.byHref[r.tr.key(href)] = nl, nl
	return r.w.Store.SaveLink(ctx, r.c.ID, nl)
}

// remove deletes the event of a task that left the push set.
func (r *cycle) remove(ctx context.Context, link *Link) error {
	status, err := r.tr.remove(ctx, link.Href, link.ETag)
	if err != nil {
		return err
	}
	if status == http.StatusPreconditionFailed {
		// Changed in the calendar meanwhile; the task is gone or done all the same.
		if status, err = r.tr.remove(ctx, link.Href, ""); err != nil {
			return err
		}
	}
	if status != http.StatusNotFound && (status < 200 || status > 299) {
		return statusError(status)
	}
	r.counts.Removed++
	delete(r.links, link.TaskID)
	delete(r.byHref, r.tr.key(link.Href))
	return r.w.Store.DeleteLink(ctx, r.c.ID, link.TaskID)
}
