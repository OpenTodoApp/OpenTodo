package recurrence

// Rules a 1.0 client reads (OpenSpec change recurrence-1-0-compatible). A 1.0
// client cannot parse `every N weeks on <weekdays>`: it shows the rule as text,
// and completing the task there ends the series. So every writer stores the
// form 1.0 reads whenever one means the same thing, through Compatible. The
// TypeScript twin is compatibleRule in web/src/lib/recurrence.ts; both run the
// "compatible" vectors of web/src/lib/recurrence.vectors.json.

// Compatible is r in a form a 1.0 client reads when one means the same thing
// for a task due on due ("YYYY-MM-DD", the due date at write time):
// `every N weeks on <day>` whose due date falls on that day is `every N weeks`
// anchored on the due date. Anything else is returned unchanged, including
// several weekdays, a due date on another weekday and no due date: there the
// new form is the only correct one.
func (r Rule) Compatible(due string) Rule {
	if r.kind != kWeekdays || r.interval <= 1 {
		return r
	}
	z, ok := parseDate(due)
	if !ok || r.days != 1<<isoWeekday(z) {
		return r
	}
	r.kind, r.unit, r.days = kInterval, uWeek, 0
	return r
}

// Compatible is the canonical rule a writer stores for a task due on due (see
// Rule.Compatible). A rule that does not parse is returned unchanged, for the
// writer's own validation to refuse.
func Compatible(rule, due string) string {
	r, err := Parse(rule)
	if err != nil {
		return rule
	}
	return r.Compatible(due).Canonical()
}
