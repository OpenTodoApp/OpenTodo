package recurrence

// MaxOccurrences is the most projected occurrences a series yields per range
// (OpenSpec change series-occurrences, design D2; web/src/lib/occurrences.ts
// MAX_PROJECTIONS).
const MaxOccurrences = 31

// Occurrences lists the floating occurrence dates that follow the current due
// inside the inclusive range [from, to]: the walk of web/src/lib/occurrences.ts
// walkOccurrences, pinned by the shared vectors in
// web/src/lib/occurrences.vectors.json. Each occurrence is taken as completed on
// time (calendar rules) or on its own day (completion-relative rules; today for an
// overdue first step), done counts the completed occurrence records toward
// "for N times", and until bounds every date. At most MaxOccurrences dates are
// returned; capped reports that the cap stopped the walk inside the range.
func (r Rule) Occurrences(due, today string, done int, from, to string) (dates []string, capped bool, err error) {
	for _, d := range []struct{ v, what string }{{due, "due"}, {today, "today"}, {from, "from"}, {to, "to"}} {
		if _, err := mustDate(d.v, d.what); err != nil {
			return nil, false, err
		}
	}
	dates = []string{}
	cur := due
	gap := 0
	if a, ok := parseDate(cur); ok {
		if b, ok := parseDate(from); ok {
			gap = min(3700, max(0, b-a))
		}
	}
	// The walk reaches from first; the guard stops a runaway rule after that.
	limit := MaxOccurrences + 1 + gap
	for k := 0; k < limit; k++ {
		completedOn := today
		if r.afterCompletion {
			completedOn = cur
			if k == 0 && cur < today {
				completedOn = today
			}
		}
		next, ok, err := r.Following(cur, today, completedOn, done+k)
		if err != nil {
			return nil, false, err
		}
		if !ok || next <= cur || next > to {
			break
		}
		if next >= from {
			if len(dates) == MaxOccurrences {
				return dates, true, nil
			}
			dates = append(dates, next)
		}
		cur = next
	}
	return dates, false, nil
}
