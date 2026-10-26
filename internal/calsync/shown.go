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
			if v, err = r.dav.calendarVersion(ctx, u); err != nil {
				if reasonOf(err) == ReasonCalendarMissing {
					continue // a read calendar that is gone shows nothing
				}
				return err
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
		objs, err := r.dav.query(ctx, u, calfeed.StoreWindow(r.w.clock()))
		if err != nil {
			return err
		}
		var events []calfeed.Event
		var warns []string
		for _, o := range objs {
			if u == r.c.TargetURL && r.byHref[hrefKey(o.Href)] != nil {
				continue // OpenTodo's own events are tasks already
			}
			parsed, perr := calfeed.ParseCalendar(o.Data)
			if perr != nil {
				continue
			}
			for _, ev := range parsed.Events {
				if _, ours := r.links[ev.UID]; !ours || u != r.c.TargetURL {
					events = append(events, ev)
				}
			}
			warns = append(warns, parsed.Warnings...)
		}
		ectx, cancel := context.WithTimeout(ctx, calfeed.MaxExpandTime)
		occ, more := calfeed.ExpandContext(ectx, events, calfeed.StoreWindow(r.w.clock()), calfeed.MaxOccurrences)
		cancel()
		if err := feeds.StoreManaged(ctx, m.SubscriptionID, key, occ, dedupe(append(warns, more...))); err != nil {
			return err
		}
		changed = true
	}
	if changed && r.w.Notify != nil {
		r.w.Notify(r.c.UserID)
	}
	return nil
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
