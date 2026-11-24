package calfeed

import "time"

// windowSlack widens the stored window when reading a calendar, so the exact
// filter of Expand decides at the edges (floating and all-day times, zones).
const windowSlack = 72 * time.Hour

// Reaches reports whether an event can add, move or remove an occurrence in
// win (OpenSpec change calendar-feed-large-calendars): a calendar's history
// outside the window is left out while it is read. Kept are an event whose own
// time or an RDATE overlaps the window; a recurring event whose rule has no
// UNTIL, or an UNTIL that can still reach the window, or a rule Expand does
// not read (it shows the first occurrence, and a cancelled one still hides its
// overrides); an override whose new time or replaced instance is in the
// window, and every override of this and following occurrences.
func Reaches(ev Event, win Window) bool {
	wide := Window{From: win.From.Add(-windowSlack), To: win.To.Add(windowSlack)}
	o := occurrence(ev, ev.Start)
	if overlaps(o, wide) {
		return true
	}
	if ev.RecurrenceID != "" {
		if ev.Range == "THISANDFUTURE" || len(ev.RecurrenceID) < 8 {
			return true
		}
		day, err := time.Parse("20060102", ev.RecurrenceID[:8])
		return err != nil || !day.Before(wide.From.Add(-24*time.Hour)) && day.Before(wide.To)
	}
	for _, rd := range ev.RDates {
		if overlaps(occurrence(ev, alignPoint(rd, ev.Start)), wide) {
			return true
		}
	}
	if ev.RRule == "" || !ev.Start.T.Before(wide.To) {
		return false
	}
	r, _, ok := parseRule(ev.RRule, ev.Start)
	if !ok || r.until == nil {
		return true
	}
	length := o.End.T.Sub(o.Start.T)
	return r.until.T.Add(length + 24*time.Hour).After(wide.From)
}
