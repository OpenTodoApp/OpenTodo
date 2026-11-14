package recurrence

// Scheduled reports whether the rule schedules date (YYYY-MM-DD), the port of
// scheduled in web/src/lib/habits.ts (OpenSpec change habits-assistant, D1),
// pinned by web/src/lib/habits.vectors.json through internal/habits. Predicate
// kinds match the date itself; interval kinds and `every N weeks on <days>` are
// anchored at dueDate (the series' current occurrence) and step in both
// directions, months clamped to the month's length. A completion-relative rule
// schedules nothing.
func (r Rule) Scheduled(dueDate, date string) bool {
	z, ok := parseDate(date)
	if !ok || r.afterCompletion || (r.until != "" && date > r.until) {
		return false
	}
	y, m, d := civilFromDays(z)
	a, hasDue := parseDate(dueDate)
	switch r.kind {
	case kWeekday:
		return r.days&(1<<isoWeekday(z)) != 0
	case kWeekdays:
		if r.days&(1<<isoWeekday(z)) == 0 {
			return false
		}
		if r.interval <= 1 {
			return true
		}
		if !hasDue {
			return false
		}
		n := r.interval
		return ((floorDiv(weekStart(z)-weekStart(a), 7)%n)+n)%n == 0
	case kMonthDay:
		return d == min(r.monthDay, monthLen(y, m))
	case kLastDay:
		return d == monthLen(y, m)
	case kWorkday:
		if isoWeekday(z) > 5 {
			return false
		}
		if r.ordinal < 0 {
			for k := d + 1; k <= monthLen(y, m); k++ {
				if isoWeekday(z+k-d) <= 5 {
					return false
				}
			}
			return true
		}
		n := 0
		for k := 1; k <= d; k++ {
			if isoWeekday(z-d+k) <= 5 {
				n++
			}
		}
		return n == r.ordinal
	case kNthWeekday:
		if isoWeekday(z) != r.weekday || (r.month != 0 && m != r.month) {
			return false
		}
		if r.ordinal < 0 {
			return d+7 > monthLen(y, m)
		}
		return (d+6)/7 == r.ordinal
	case kInterval:
		if !hasDue {
			return false
		}
		if r.unit == uDay || r.unit == uWeek {
			size := r.interval
			if r.unit == uWeek {
				size *= 7
			}
			return ((z-a)%size+size)%size == 0
		}
		ay, am, ad := civilFromDays(a)
		months := (y*12 + m) - (ay*12 + am)
		step := r.interval
		if r.unit == uYear {
			step *= 12
		}
		return months%step == 0 && d == min(ad, monthLen(y, m))
	}
	return false
}
