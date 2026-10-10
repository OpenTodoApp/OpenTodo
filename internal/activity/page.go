package activity

import (
	"errors"
	"strconv"
	"strings"
)

// ErrBadCursor: a pagination cursor that this package did not produce.
var ErrBadCursor = errors.New("invalid cursor")

// Cursor names the position of an event in newest-first order.
func Cursor(e Event) string { return strconv.FormatInt(e.TS, 10) + ":" + e.ID }

// Page returns up to limit events (already ordered by Newest) strictly after the
// cursor ("" for the first page) and the cursor of the next page ("" when this
// is the last one). Pages never overlap because (ts, id) is a total order.
func Page(events []Event, cursor string, limit int) ([]Event, string, error) {
	start := 0
	if cursor != "" {
		tsPart, id, ok := strings.Cut(cursor, ":")
		ts, err := strconv.ParseInt(tsPart, 10, 64)
		if !ok || err != nil || id == "" {
			return nil, "", ErrBadCursor
		}
		start = len(events)
		for i, e := range events {
			if e.TS < ts || (e.TS == ts && e.ID < id) {
				start = i
				break
			}
		}
	}
	end := min(start+limit, len(events))
	page := events[start:end]
	if end < len(events) && len(page) > 0 {
		return page, Cursor(page[len(page)-1]), nil
	}
	return page, "", nil
}
