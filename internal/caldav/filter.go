package caldav

import (
	"strings"
	"time"
)

// Calendar-query filters (RFC 4791 9.7), evaluated against the serialised
// VCALENDAR of each task so that what a client filters on is exactly what it
// would receive.

// Matches reports whether cal satisfies the <c:filter> element f. A nil filter
// matches everything.
func Matches(f *Node, cal *Component) bool {
	if f == nil {
		return true
	}
	for _, cf := range f.Children {
		if cf.Is(NSCalDAV, "comp-filter") && !compMatches(cf, []*Component{cal}) {
			return false
		}
	}
	return true
}

// MatchesAnyTodo reports whether f selects every VCALENDAR that holds a VTODO
// without looking at its content: no filter, or only the plain
// VCALENDAR > VTODO comp-filters clients send to list all tasks. Matches gives
// the same answer for such a filter, so a caller can skip parsing.
func MatchesAnyTodo(f *Node) bool {
	if f == nil {
		return true
	}
	plain := func(cf *Node, name string) bool {
		return strings.EqualFold(cf.Attr("name"), name) && cf.Child(NSCalDAV, "is-not-defined") == nil
	}
	for _, cal := range f.Children {
		if !cal.Is(NSCalDAV, "comp-filter") {
			continue
		}
		if !plain(cal, "VCALENDAR") {
			return false
		}
		for _, ch := range cal.Children {
			switch {
			case ch.Is(NSCalDAV, "time-range"), ch.Is(NSCalDAV, "prop-filter"):
				return false
			case ch.Is(NSCalDAV, "comp-filter"):
				if !plain(ch, "VTODO") {
					return false
				}
				for _, g := range ch.Children {
					if g.Is(NSCalDAV, "time-range") || g.Is(NSCalDAV, "prop-filter") || g.Is(NSCalDAV, "comp-filter") {
						return false
					}
				}
			}
		}
	}
	return true
}

// compMatches evaluates a comp-filter against candidate components (the
// filter's component matches when any candidate of that name satisfies it).
func compMatches(cf *Node, candidates []*Component) bool {
	name := strings.ToUpper(cf.Attr("name"))
	var named []*Component
	for _, c := range candidates {
		if c.Name == name {
			named = append(named, c)
		}
	}
	if cf.Child(NSCalDAV, "is-not-defined") != nil {
		return len(named) == 0
	}
	for _, c := range named {
		if compSatisfies(cf, c) {
			return true
		}
	}
	return false
}

func compSatisfies(cf *Node, c *Component) bool {
	for _, ch := range cf.Children {
		switch {
		case ch.Is(NSCalDAV, "time-range"):
			if c.Name == "VTODO" && !todoInRange(c, ch) {
				return false
			}
		case ch.Is(NSCalDAV, "prop-filter"):
			if !propMatches(ch, c) {
				return false
			}
		case ch.Is(NSCalDAV, "comp-filter"):
			if !compMatches(ch, c.Children) {
				return false
			}
		}
	}
	return true
}

func propMatches(pf *Node, c *Component) bool {
	name := strings.ToUpper(pf.Attr("name"))
	var props []Prop
	for _, p := range c.Props {
		if p.Name == name {
			props = append(props, p)
		}
	}
	if pf.Child(NSCalDAV, "is-not-defined") != nil {
		return len(props) == 0
	}
	if len(props) == 0 {
		return false
	}
	tm := pf.Child(NSCalDAV, "text-match")
	if tm == nil {
		return true // time-range and param-filter on properties: treated as matching
	}
	needle := strings.ToLower(strings.TrimSpace(tm.Text))
	negate := strings.EqualFold(tm.Attr("negate-condition"), "yes")
	for _, p := range props {
		hit := strings.Contains(strings.ToLower(UnescapeText(p.Value)), needle)
		if hit != negate {
			return true
		}
	}
	return false
}

// todoInRange applies the VTODO rows of RFC 4791 9.9 to a time-range element.
func todoInRange(c *Component, tr *Node) bool {
	start, okS := parseUTC(tr.Attr("start"))
	end, okE := parseUTC(tr.Attr("end"))
	if !okS {
		start = time.Unix(-1<<40, 0)
	}
	if !okE {
		end = time.Unix(1<<40, 0)
	}
	at := func(name string) (time.Time, bool) {
		p := c.Prop(name)
		if p == nil {
			return time.Time{}, false
		}
		ms, err := instantOf(*p)
		if err != nil {
			return time.Time{}, false
		}
		return time.UnixMilli(ms), true
	}
	dtstart, hasStart := at("DTSTART")
	due, hasDue := at("DUE")
	completed, hasCompleted := at("COMPLETED")
	created, hasCreated := at("CREATED")
	le := func(a, b time.Time) bool { return !a.After(b) }
	switch {
	case hasStart && hasDue:
		return (le(start, dtstart) && end.After(dtstart)) || (start.Before(due) && le(due, end)) ||
			(le(dtstart, start) && le(end, due))
	case hasStart:
		return le(start, dtstart) && end.After(dtstart)
	case hasDue:
		return start.Before(due) && le(due, end)
	case hasCompleted && hasCreated:
		return (le(start, created) || le(start, completed)) && (le(created, end) || le(completed, end))
	case hasCompleted:
		return le(start, completed) && le(completed, end)
	case hasCreated:
		return end.After(created)
	}
	return true
}

func parseUTC(s string) (time.Time, bool) {
	t, err := time.Parse("20060102T150405Z", s)
	return t, err == nil
}
