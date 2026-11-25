package calsync

import (
	"context"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/calfeed"
)

// Calendars shown in Day and Week (design D10): the target and the chosen
// read calendars, stored as managed calendar subscriptions and refreshed only
// when the calendar changed.

// shownURLs are the calendars a connection shows: the target first, then the
// read calendars that discovery still knows.
func (c *Connection) shownURLs() []string {
	out := []string{}
	seen := map[string]bool{}
	for _, u := range append([]string{c.TargetURL}, c.ReadURLs...) {
		if u == "" || seen[u] || c.Calendar(u) == nil {
			continue
		}
		seen[u] = true
		out = append(out, u)
	}
	return out
}

// readCalendars refreshes the events of the shown calendars and drops the
// ones no longer shown.
func (r *cycle) readCalendars(ctx context.Context) error {
	feeds := r.w.Feeds
	if feeds == nil {
		return nil
	}
	if err := r.w.Store.ExpireUndos(ctx); err != nil {
		return err
	}
	urls := r.c.shownURLs()
	keep := map[string]bool{}
	for _, u := range urls {
		keep[u] = true
	}
	dropped, err := feeds.DropManaged(ctx, r.c.ID, keep)
	if err != nil {
		return err
	}
	changed := dropped > 0
	for _, u := range urls {
		cal := r.c.Calendar(u)
		v := r.ver
		if u != r.c.TargetURL {
			if v, err = r.tr.version(ctx, u); err != nil {
				if reasonOf(err) == ReasonCalendarMissing {
					continue // a read calendar that is gone shows nothing
				}
				// A shown read calendar we cannot read must not stop the cycle:
				// skip it this cycle and keep syncing the rest (#1627). Google's
				// virtual calendars (Week Numbers, Holidays) answer 409 to a
				// calendar query, so merely showing one would otherwise fail
				// every cycle and stop all task sync.
				r.skipShown(u, err)
				continue
			}
		}
		m, err := feeds.EnsureManaged(ctx, r.c.UserID, r.c.ID, u, strings.TrimSpace(r.c.Name+" · "+cal.Name), cal.Color)
		if err != nil {
			return err
		}
		key := v.key()
		if u == r.c.TargetURL && r.writes > 0 {
			key = "" // our own writes changed it; read it again next time
		}
		if key != "" && key == m.Version {
			continue
		}
		objs, err := r.tr.window(ctx, u, calfeed.StoreWindow(r.w.clock()))
		if err != nil {
			if u != r.c.TargetURL {
				r.skipShown(u, err) // one unreadable shown calendar never takes the rest down (#1627)
				continue
			}
			return err
		}
		var events []calfeed.Event
		var warns []string
		refs := map[string]calfeed.EventRemote{}
		for _, o := range objs {
			if u == r.c.TargetURL && (r.byHref[r.tr.key(o.Href)] != nil || o.TaskID != "") {
				continue // OpenTodo's own events are tasks already
			}
			lock := lockOf(o, r.c.Addresses)
			for _, ev := range o.Events {
				if _, ours := r.links[ev.UID]; !ours || u != r.c.TargetURL {
					events = append(events, ev)
					refs[ev.UID] = calfeed.EventRemote{Href: o.Href, ETag: o.ETag, Locked: lock}
				}
			}
			warns = append(warns, o.Warnings...)
		}
		ectx, cancel := context.WithTimeout(ctx, calfeed.MaxExpandTime)
		occ, more := calfeed.ExpandContext(ectx, events, calfeed.StoreWindow(r.w.clock()), calfeed.MaxOccurrences)
		cancel()
		if err := feeds.StoreManagedRefs(ctx, m.SubscriptionID, key, occ, dedupe(append(warns, more...)), refs); err != nil {
			return err
		}
		changed = true
	}
	if changed && r.w.Notify != nil {
		r.w.Notify(r.c.UserID)
	}
	return nil
}

// skipShown logs that a shown read calendar could not be read this cycle and
// was skipped, so one bad calendar never stops the task sync (#1627).
func (r *cycle) skipShown(u string, err error) {
	r.w.log().Warn("calendar sync: shown calendar skipped", "connection", r.c.ID, "calendar", u, "reason", reasonOf(err), "err", err)
}

func dedupe(l []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, s := range l {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}
