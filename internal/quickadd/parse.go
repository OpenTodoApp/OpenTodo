package quickadd

import (
	"sort"

	"github.com/OpenTodoApp/opentodo/internal/recurrence"
)

// Context is the reference state of one parse (ParseContext in parse.ts).
type Context struct {
	Today         string    `json:"today"` // YYYY-MM-DD
	Now           string    `json:"now"`   // HH:MM
	Languages     []string  `json:"languages"`
	Projects      []Project `json:"projects"`
	DayMonthOrder string    `json:"dayMonthOrder,omitempty"` // DM | MD; the first language's when empty
	WeekStart     *int      `json:"weekStart,omitempty"`     // 0 = Sunday; Monday when nil
	// DayParts reads the part phrases (OpenSpec change day-parts, D5): the
	// account's Day parts preference.
	DayParts bool `json:"dayParts,omitempty"`
	// Energy reads the `~deep` tokens (OpenSpec change task-energy, D4): the
	// account's Energy levels preference.
	Energy bool `json:"energy,omitempty"`
}

// Due is a floating due date with an optional time.
type Due struct {
	Date string `json:"date"`
	Time string `json:"time,omitempty"`
}

// Result is what a line sets (ParseResult in parse.ts, without the chips).
type Result struct {
	Title    string `json:"title"`
	Due      *Due   `json:"due"`
	Deadline string `json:"deadline,omitempty"`
	Someday  bool   `json:"someday,omitempty"`
	Evening  bool   `json:"evening,omitempty"`
	// DayPart is "morning" or "afternoon" from a part phrase (day-parts D5).
	DayPart   string   `json:"dayPart,omitempty"`
	ProjectID string   `json:"projectId,omitempty"`
	Labels    []string `json:"labels"`
	Priority  int      `json:"priority,omitempty"`
	// Energy is "deep", "medium" or "low" from a `~` token, the last one on
	// the line (task-energy D4).
	Energy          string `json:"energy,omitempty"`
	EstimateMinutes int    `json:"estimateMinutes,omitempty"`
	// SpentMinutes is time already spent from a `30m/2h` token (time-tracking
	// D10): one closed time entry ending at creation.
	SpentMinutes int        `json:"spentMinutes,omitempty"`
	Recurrence   string     `json:"recurrence,omitempty"`
	Reminders    []Reminder `json:"reminders"`
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
	r, _ := ParseMarked(line, ctx)
	return r
}

// Mark is one recognised attribute and the span of the line it came from, in
// line order: the chips a client previews (OpenSpec change extension-v2, D1).
// Kind is date, time, deadline, evening, daypart, someday, project, label,
// priority, energy, estimate, recurrence or reminder.
type Mark struct {
	Kind string
	Span Span
}

// ParseMarked is Parse plus the spans of what it recognised.
func ParseMarked(line string, ctx Context) (Result, []Mark) {
	p := &parser{line: line, ctx: ctx, dctx: newCtx(ctx)}
	for _, v := range p.dctx.vocabs {
		p.bareHourIsTime = p.bareHourIsTime || v.HourSuffixH
	}
	var quotes []Span
	p.tokens, quotes = tokenize(line)
	for i := 0; i < len(p.tokens); {
		i = p.step(i)
	}
	r := p.result(quotes)
	return r, p.marks(r)
}

// marks lists the recognised spans in line order; a literal recurrence (one that
// sets nothing) and the Someday words of a dated task are not marks.
func (p *parser) marks(r Result) []Mark {
	var out []Mark
	add := func(kind string, s Span, ok bool) {
		if ok {
			out = append(out, Mark{kind, s})
		}
	}
	add("date", p.date.span, p.date.set && (p.evening == nil || p.date.span != *p.evening) && (!p.dayPart.set || p.date.span != p.dayPart.span))
	add("time", p.timeV.span, p.timeV.set)
	add("deadline", p.deadline.span, p.deadline.set)
	if p.evening != nil {
		add("evening", *p.evening, true)
	}
	add("daypart", p.dayPart.span, p.dayPart.set)
	if p.someday != nil {
		add("someday", *p.someday, r.Someday)
	}
	add("project", p.project.span, p.project.set)
	for _, l := range p.labels {
		add("label", l.span, true)
	}
	add("priority", p.priority.span, p.priority.value > 0)
	for _, e := range p.energies {
		add("energy", e.span, true)
	}
	add("estimate", p.estimate.span, p.estimate.value > 0)
	add("recurrence", p.rec.span, p.rec.set)
	for _, m := range p.reminders {
		add("reminder", m.span, true)
	}
	sort.SliceStable(out, func(a, b int) bool { return out[a].Span.Start < out[b].Span.Start })
	return out
}

// found is one recognised value and the span of the line it came from.
type found struct {
	value string
	span  Span
	set   bool
}

// parser is the state of one Parse call: the tokens and what was recognised.
type parser struct {
	line           string
	ctx            Context
	dctx           *dateCtx
	bareHourIsTime bool
	tokens         []token

	date, deadline, project, rec found
	// dateBare marks a date from a month name alone, which a later complete
	// date phrase replaces; recStart is the first date of an "every other
	// friday" rule (quick-add-month-and-every-other D1, D3).
	dateBare bool
	recStart string
	// dayPart is Morning or Afternoon (day-parts D5); Evening is evening.
	dayPart found
	timeV   struct {
		value, date string
		span        Span
		set         bool
	}
	priority, estimate struct {
		value int
		span  Span
	}
	spent            int
	evening, someday *Span
	labels           []found
	// energies are the `~` tokens; every one leaves the title and the last
	// one is the value (task-energy D4).
	energies  []found
	reminders []struct {
		value Reminder
		span  Span
	}
}

func (p *parser) span(from, to int) Span { return spanOf(p.line, p.tokens, from, to) }

// step reads what starts at token i and returns the index of the next token
// to read.
func (p *parser) step(i int) int {
	if p.tokens[i].quoted {
		return i + 1
	}
	if next, ok := p.attribute(i); ok {
		return next
	}
	return p.phrase(i)
}

// attribute matches the single-token attributes (project, label, priority,
// estimate), a deadline and the evening words at token i.
func (p *parser) attribute(i int) (int, bool) {
	t, tokens, dctx := p.tokens[i], p.tokens, p.dctx
	one := p.span(i, i+1)
	if !p.project.set && len(t.text) > 1 && t.text[0] == '#' {
		if pr := matchProject(t.text, p.ctx.Projects); pr != nil {
			p.project = found{pr.ID, one, true}
			return i + 1, true
		}
	}
	if l, ok := matchLabel(t.text); ok {
		p.labels = append(p.labels, found{l, one, true})
		return i + 1, true
	}
	if p.ctx.Energy {
		if e := matchEnergy(t.text); e != "" {
			p.energies = append(p.energies, found{e, one, true})
			return i + 1, true
		}
	}
	if p.priority.value == 0 {
		if pr := matchPriority(t.text); pr > 0 {
			p.priority.value, p.priority.span = pr, one
			return i + 1, true
		}
	}
	if p.estimate.value == 0 {
		if spent, est, ok := matchSpent(t.text); ok {
			p.estimate.value, p.estimate.span, p.spent = est, one, spent
			return i + 1, true
		}
		if m := matchDuration(t.text, p.bareHourIsTime); m > 0 {
			p.estimate.value, p.estimate.span = m, one
			return i + 1, true
		}
	}
	if !p.deadline.set {
		if dl := matchDeadlineAt(tokens, i, dctx); dl != nil {
			p.deadline = found{dl.date, p.span(dl.from, dl.to), true}
			next := dl.to
			if tm := matchTimeAt(tokens, dl.to, dctx); tm != nil {
				next = tm.to
			}
			return next, true
		}
	}
	if next, ok := p.thisPart(i); ok {
		return next, true
	}
	if p.evening == nil {
		if n := wordsAt(tokens, i, dctx, func(v *Vocab) []string { return v.EveningWords }); n > 0 {
			s := p.span(i, i+n)
			p.evening = &s
			if !p.date.set || p.dateBare {
				p.date, p.dateBare = found{p.ctx.Today, s, true}, false
			}
			return i + n, true
		}
	}
	return 0, false
}

// partFree reports whether no part was set yet: a line sets one part, the
// evening flag or a day part, never both (day-parts D5).
func (p *parser) partFree() bool { return p.evening == nil && !p.dayPart.set }

// thisPart matches "this morning" / "this afternoon" at token i: due today
// (unless a date came first) with that part, only with Context.DayParts.
func (p *parser) thisPart(i int) (int, bool) {
	if !p.ctx.DayParts || !p.partFree() {
		return 0, false
	}
	for _, c := range []struct {
		part string
		pick func(*Vocab) []string
	}{{"morning", func(v *Vocab) []string { return v.MorningWords }}, {"afternoon", func(v *Vocab) []string { return v.AfternoonWords }}} {
		if n := wordsAt(p.tokens, i, p.dctx, c.pick); n > 0 {
			s := p.span(i, i+n)
			p.dayPart = found{c.part, s, true}
			if !p.date.set || p.dateBare {
				p.date, p.dateBare = found{p.ctx.Today, s, true}, false
			}
			return i + n, true
		}
	}
	return 0, false
}

// partAfter reads a part word directly after a date phrase ending at token to
// ("tomorrow morning"), only with Context.DayParts, and returns where reading
// goes on. Evening sets the evening flag.
func (p *parser) partAfter(to int) int {
	if !p.ctx.DayParts || !p.partFree() || to >= len(p.tokens) || p.tokens[to].quoted {
		return to
	}
	best, part := 0, ""
	for _, c := range []struct {
		part string
		pick func(*Vocab) []string
	}{{"morning", func(v *Vocab) []string { return v.PartWords.Morning }}, {"afternoon", func(v *Vocab) []string { return v.PartWords.Afternoon }}, {"evening", func(v *Vocab) []string { return v.PartWords.Evening }}} {
		if n := wordsAt(p.tokens, to, p.dctx, c.pick); n > best {
			best, part = n, c.part
		}
	}
	if best == 0 {
		return to
	}
	s := p.span(to, to+best)
	if part == "evening" {
		p.evening = &s
	} else {
		p.dayPart = found{part, s, true}
	}
	return to + best
}

// phrase matches the longest of a date, a time, a recurrence or a reminder at
// token i, then the someday words; an unrecognised token stays in the title.
func (p *parser) phrase(i int) int {
	tokens, dctx := p.tokens, p.dctx
	var dm *dateMatch
	var tm *timeMatch
	var rm *recMatch
	if !p.date.set || p.dateBare {
		dm = matchDateAt(tokens, i, dctx)
		// After a bare month only a complete date phrase counts.
		if p.date.set && dm != nil && dm.bare {
			dm = nil
		}
	}
	if !p.timeV.set {
		tm = matchTimeAt(tokens, i, dctx)
	}
	// After the first rule only a literal match still counts; a suffixed number
	// above four before a weekday is one too (quick-add-nth-weekday D1, D3).
	if rm = matchRecurrenceAt(tokens, i, dctx); rm != nil && p.rec.set && !rm.literal {
		rm = nil
	}
	if rm == nil {
		if n := ordinalOutOfRangeAt(tokens, i, dctx); n > 0 {
			rm = &recMatch{from: i, to: i + n, literal: true}
		}
	}
	mm := matchReminderAt(tokens, i, dctx)
	end := func(to int, ok bool) int {
		if ok {
			return to
		}
		return 0
	}
	phraseEnd := max(end(rmTo(rm)), end(mmTo(mm)))
	switch {
	case phraseEnd > max(end(dmTo(dm)), end(tmTo(tm))):
		if rm != nil && rm.to == phraseEnd {
			if !rm.literal {
				p.rec = found{rm.rule, p.span(rm.from, rm.to), true}
				p.recStart = rm.start
			}
			return rm.to
		} else if mm != nil {
			p.reminders = append(p.reminders, struct {
				value Reminder
				span  Span
			}{mm.reminder, p.span(mm.from, mm.to)})
			return mm.to
		}
		return i
	case dm != nil && (tm == nil || dm.to >= tm.to):
		p.date, p.dateBare = found{dm.date, p.span(dm.from, dm.to), true}, dm.bare
		return p.partAfter(dm.to)
	case tm != nil:
		p.timeV.value, p.timeV.date, p.timeV.span, p.timeV.set = tm.time, tm.date, p.span(tm.from, tm.to), true
		return tm.to
	}
	n := 0
	if p.someday == nil {
		n = wordsAt(tokens, i, dctx, func(v *Vocab) []string { return v.SomedayWords })
	}
	if n > 0 {
		s := p.span(i, i+n)
		p.someday = &s
		return i + n
	}
	return i + 1
}

// due is the due date the line sets: its date, or the recurrence's first
// date, the time's own date or today when only those were given.
func (p *parser) due() *Due {
	if !p.date.set && !p.timeV.set && !p.rec.set {
		return nil
	}
	d := p.date.value
	if !p.date.set {
		switch {
		case p.rec.set && p.recStart != "":
			d = p.recStart
		case p.rec.set:
			r, _ := recurrence.Parse(p.rec.value)
			d, _ = r.First(p.ctx.Today)
		case p.timeV.date != "":
			d = p.timeV.date
		default:
			d = p.ctx.Today
		}
	}
	due := &Due{Date: d}
	if p.timeV.set {
		due.Time = p.timeV.value
	}
	return due
}

// result builds the Result and the title: the line without the recognised
// spans (quoted text always stays).
func (p *parser) result(quotes []Span) Result {
	parked := p.someday != nil && !p.date.set && !p.timeV.set && !p.deadline.set && !p.rec.set
	var remove []Span
	add := func(s Span, ok bool) {
		if ok {
			remove = append(remove, s)
		}
	}
	add(p.date.span, p.date.set)
	add(p.timeV.span, p.timeV.set)
	if p.evening != nil {
		remove = append(remove, *p.evening)
	}
	add(p.dayPart.span, p.dayPart.set)
	if parked {
		remove = append(remove, *p.someday)
	}
	add(p.deadline.span, p.deadline.set)
	add(p.project.span, p.project.set)
	add(p.rec.span, p.rec.set)
	add(p.priority.span, p.priority.value > 0)
	add(p.estimate.span, p.estimate.value > 0)
	out := Result{Due: p.due(), Deadline: p.deadline.value, Someday: parked, Evening: p.evening != nil, DayPart: p.dayPart.value, ProjectID: p.project.value,
		Priority: p.priority.value, EstimateMinutes: p.estimate.value, SpentMinutes: p.spent, Recurrence: p.rec.value, Labels: []string{}, Reminders: []Reminder{}}
	for _, e := range p.energies {
		remove = append(remove, e.span)
		out.Energy = e.value
	}
	for _, l := range p.labels {
		remove = append(remove, l.span)
		out.Labels = append(out.Labels, l.value)
	}
	for _, r := range p.reminders {
		remove = append(remove, r.span)
		out.Reminders = append(out.Reminders, r.value)
	}
	sort.Slice(remove, func(a, b int) bool { return remove[a].Start < remove[b].Start })
	out.Title = stripSpans(p.line, remove, quotes)
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
