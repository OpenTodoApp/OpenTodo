package quickadd

import (
	"sort"

	"github.com/pixari/opentodo/internal/recurrence"
)

// Context is the reference state of one parse (ParseContext in parse.ts).
type Context struct {
	Today         string    `json:"today"` // YYYY-MM-DD
	Now           string    `json:"now"`   // HH:MM
	Languages     []string  `json:"languages"`
	Projects      []Project `json:"projects"`
	DayMonthOrder string    `json:"dayMonthOrder,omitempty"` // DM | MD; the first language's when empty
	WeekStart     *int      `json:"weekStart,omitempty"`     // 0 = Sunday; Monday when nil
}

// Due is a floating due date with an optional time.
type Due struct {
	Date string `json:"date"`
	Time string `json:"time,omitempty"`
}

// Result is what a line sets (ParseResult in parse.ts, without the chips).
type Result struct {
	Title           string     `json:"title"`
	Due             *Due       `json:"due"`
	Deadline        string     `json:"deadline,omitempty"`
	Someday         bool       `json:"someday,omitempty"`
	Evening         bool       `json:"evening,omitempty"`
	ProjectID       string     `json:"projectId,omitempty"`
	Labels          []string   `json:"labels"`
	Priority        int        `json:"priority,omitempty"`
	EstimateMinutes int        `json:"estimateMinutes,omitempty"`
	Recurrence      string     `json:"recurrence,omitempty"`
	Reminders       []Reminder `json:"reminders"`
}

func spanOf(line string, tokens []token, from, to int) Span {
	s, e := tokens[from].start, tokens[to-1].end
	return Span{s, e, line[s:e]}
}

func newCtx(ctx Context) *dateCtx {
	vocabs := vocabsFor(ctx.Languages)
	order := ctx.DayMonthOrder
	if order == "" {
		order = vocabs[0].DayMonthOrder
	}
	ws := 1
	if ctx.WeekStart != nil {
		ws = *ctx.WeekStart
	}
	return &dateCtx{today: ctx.Today, now: ctx.Now, vocabs: vocabs, dayMonthOrder: order, weekStart: ws}
}

// Parse reads a quick-add line. Pure: the result depends only on the line and ctx.
func Parse(line string, ctx Context) Result {
	dctx := newCtx(ctx)
	bareHourIsTime := false
	for _, v := range dctx.vocabs {
		bareHourIsTime = bareHourIsTime || v.HourSuffixH
	}
	tokens, quotes := tokenize(line)

	type str struct {
		value string
		span  Span
		set   bool
	}
	var date, deadline, project, rec str
	var timeV struct {
		value, date string
		span        Span
		set         bool
	}
	var priority, estimate struct {
		value int
		span  Span
	}
	var evening, someday *Span
	var labels []str
	var reminders []struct {
		value Reminder
		span  Span
	}

	i := 0
	for i < len(tokens) {
		t := tokens[i]
		if t.quoted {
			i++
			continue
		}
		one := spanOf(line, tokens, i, i+1)
		if !project.set && len(t.text) > 1 && t.text[0] == '#' {
			if p := matchProject(t.text, ctx.Projects); p != nil {
				project = str{p.ID, one, true}
				i++
				continue
			}
		}
		if l, ok := matchLabel(t.text); ok {
			labels = append(labels, str{l, one, true})
			i++
			continue
		}
		if priority.value == 0 {
			if p := matchPriority(t.text); p > 0 {
				priority.value, priority.span = p, one
				i++
				continue
			}
		}
		if estimate.value == 0 {
			if m := matchDuration(t.text, bareHourIsTime); m > 0 {
				estimate.value, estimate.span = m, one
				i++
				continue
			}
		}
		if !deadline.set {
			if dl := matchDeadlineAt(tokens, i, dctx); dl != nil {
				deadline = str{dl.date, spanOf(line, tokens, dl.from, dl.to), true}
				i = dl.to
				if tm := matchTimeAt(tokens, dl.to, dctx); tm != nil {
					i = tm.to
				}
				continue
			}
		}
		if evening == nil {
			if n := wordsAt(tokens, i, dctx, func(v *Vocab) []string { return v.EveningWords }); n > 0 {
				s := spanOf(line, tokens, i, i+n)
				evening = &s
				if !date.set {
					date = str{ctx.Today, s, true}
				}
				i += n
				continue
			}
		}
		var dm *dateMatch
		var tm *timeMatch
		var rm *recMatch
		if !date.set {
			dm = matchDateAt(tokens, i, dctx)
		}
		if !timeV.set {
			tm = matchTimeAt(tokens, i, dctx)
		}
		if !rec.set {
			rm = matchRecurrenceAt(tokens, i, dctx)
		}
		mm := matchReminderAt(tokens, i, dctx)
		end := func(to int, ok bool) int {
			if ok {
				return to
			}
			return 0
		}
		phraseEnd := max(end(rmTo(rm)), end(mmTo(mm)))
		if phraseEnd > max(end(dmTo(dm)), end(tmTo(tm))) {
			if rm != nil && rm.to == phraseEnd {
				rec = str{rm.rule, spanOf(line, tokens, rm.from, rm.to), true}
				i = rm.to
			} else if mm != nil {
				reminders = append(reminders, struct {
					value Reminder
					span  Span
				}{mm.reminder, spanOf(line, tokens, mm.from, mm.to)})
				i = mm.to
			}
		} else if dm != nil && (tm == nil || dm.to >= tm.to) {
			date = str{dm.date, spanOf(line, tokens, dm.from, dm.to), true}
			i = dm.to
		} else if tm != nil {
			timeV.value, timeV.date, timeV.span, timeV.set = tm.time, tm.date, spanOf(line, tokens, tm.from, tm.to), true
			i = tm.to
		} else {
			n := 0
			if someday == nil {
				n = wordsAt(tokens, i, dctx, func(v *Vocab) []string { return v.SomedayWords })
			}
			if n > 0 {
				s := spanOf(line, tokens, i, i+n)
				someday = &s
				i += n
			} else {
				i++
			}
		}
	}
	parked := someday != nil && !date.set && !timeV.set && !deadline.set && !rec.set

	var due *Due
	if date.set || timeV.set || rec.set {
		d := date.value
		if !date.set {
			switch {
			case rec.set:
				r, _ := recurrence.Parse(rec.value)
				d, _ = r.First(ctx.Today)
			case timeV.date != "":
				d = timeV.date
			default:
				d = ctx.Today
			}
		}
		due = &Due{Date: d}
		if timeV.set {
			due.Time = timeV.value
		}
	}

	var remove []Span
	add := func(s Span, ok bool) {
		if ok {
			remove = append(remove, s)
		}
	}
	add(date.span, date.set)
	add(timeV.span, timeV.set)
	if evening != nil {
		remove = append(remove, *evening)
	}
	if parked {
		remove = append(remove, *someday)
	}
	add(deadline.span, deadline.set)
	add(project.span, project.set)
	add(rec.span, rec.set)
	add(priority.span, priority.value > 0)
	add(estimate.span, estimate.value > 0)
	out := Result{Due: due, Deadline: deadline.value, Someday: parked, Evening: evening != nil, ProjectID: project.value,
		Priority: priority.value, EstimateMinutes: estimate.value, Recurrence: rec.value, Labels: []string{}, Reminders: []Reminder{}}
	for _, l := range labels {
		remove = append(remove, l.span)
		out.Labels = append(out.Labels, l.value)
	}
	for _, r := range reminders {
		remove = append(remove, r.span)
		out.Reminders = append(out.Reminders, r.value)
	}
	sort.Slice(remove, func(a, b int) bool { return remove[a].Start < remove[b].Start })
	out.Title = stripSpans(line, remove, quotes)
	return out
}

func rmTo(m *recMatch) (int, bool) {
	if m == nil {
		return 0, false
	}
	return m.to, true
}
func mmTo(m *remMatch) (int, bool) {
	if m == nil {
		return 0, false
	}
	return m.to, true
}
func dmTo(m *dateMatch) (int, bool) {
	if m == nil {
		return 0, false
	}
	return m.to, true
}
func tmTo(m *timeMatch) (int, bool) {
	if m == nil {
		return 0, false
	}
	return m.to, true
}

// ParseReminder parses a reminder body without its trigger word ("30 min
// before", "tomorrow at 9"), for `ot add --remind`.
func ParseReminder(phrase string, ctx Context) (Reminder, bool) {
	tokens, _ := tokenize(phrase)
	r, to, ok := parseReminderAt(tokens, 0, newCtx(ctx))
	return r, ok && to == len(tokens)
}
