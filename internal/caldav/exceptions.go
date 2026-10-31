package caldav

import (
	"strconv"
	"strings"
)

// Exceptions of a repeating task in iCalendar (OpenSpec change
// series-exceptions, design D10). Outbound, a series carries one EXDATE with
// every exception date from its current occurrence on (in the form of its
// DTSTART), a `for N times` rule is served with the UNTIL of its last remaining
// occurrence instead of COUNT (DTSTART is the current occurrence, not the
// first, and RFC 5545 counts EXDATE'd instances), and an open occurrence record
// links its series with RELATED-TO;RELTYPE=SIBLING. Inbound, EXDATE dates and
// RECURRENCE-ID overrides are read into Inbound.ExDates and Inbound.Overrides;
// the caller turns them into occurrence records and never stores them.

// Override is one RECURRENCE-ID override of a client's series object.
type Override struct {
	// Date is the occurrence date the override stands for (YYYY-MM-DD).
	Date string
	// Completed: STATUS:COMPLETED, or a COMPLETED time without another status.
	Completed bool
	// Cancelled: STATUS:CANCELLED.
	Cancelled bool
	// Due is the override's DUE (or DTSTART without DUE), nil when absent.
	Due *Due
	// Title is SUMMARY, nil when absent; Priority is the app priority of
	// PRIORITY, 0 when absent.
	Title    *string
	Priority int
}

// exdateProp renders the exception dates in the form of due (the DTSTART).
func exdateProp(due *Due, dates []string) Prop {
	vals := make([]string, len(dates))
	var params []Param
	for i, d := range dates {
		vals[i] = dateValue(d)
		if due.Time != nil {
			vals[i] += "T" + clockValue(*due.Time)
		}
	}
	switch {
	case due.Time == nil:
		params = []Param{{Name: "VALUE", Values: []string{"DATE"}}}
	case due.TZ != nil:
		params = []Param{{Name: "TZID", Values: []string{*due.TZ}}}
	}
	return Prop{Name: "EXDATE", Params: params, Value: strings.Join(vals, ",")}
}

// exdates reads the dates of an EXDATE property (one or more values).
func exdates(p Prop) []string {
	var out []string
	for _, v := range strings.Split(p.Value, ",") {
		one := p
		one.Value = strings.TrimSpace(v)
		if due, err := parseDue(one); err == nil {
			out = append(out, due.Date)
		}
	}
	return out
}

// overrides reads every RECURRENCE-ID VTODO of a calendar object.
func overrides(cal *Component) []Override {
	var out []Override
	for _, c := range cal.Children {
		rid := c.Prop("RECURRENCE-ID")
		if c.Name != "VTODO" || rid == nil {
			continue
		}
		at, err := parseDue(*rid)
		if err != nil {
			continue
		}
		o := Override{Date: at.Date}
		status := ""
		if p := c.Prop("STATUS"); p != nil {
			status = strings.ToUpper(strings.TrimSpace(p.Value))
		}
		o.Completed = status == "COMPLETED" || (status == "" && c.Prop("COMPLETED") != nil)
		o.Cancelled = status == "CANCELLED"
		if p := c.Prop("DUE"); p != nil {
			o.Due, _ = parseDue(*p)
		} else if p := c.Prop("DTSTART"); p != nil {
			o.Due, _ = parseDue(*p)
		}
		if p := c.Prop("SUMMARY"); p != nil {
			title := UnescapeText(p.Value)
			o.Title = &title
		}
		if p := c.Prop("PRIORITY"); p != nil {
			if n, err := strconv.Atoi(strings.TrimSpace(p.Value)); err == nil {
				o.Priority = ICalToAppPriority(n)
			}
		}
		out = append(out, o)
	}
	return out
}
