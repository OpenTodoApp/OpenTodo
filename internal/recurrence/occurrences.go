package recurrence

// MaxOccurrences is the most projected occurrences a series yields per range
// (OpenSpec change series-occurrences, design D2; web/src/lib/occurrences.ts
// MAX_PROJECTIONS).
const MaxOccurrences = 31

// maxJumps bounds how many exception dates in a row NextFree jumps over.
const maxJumps = 3700

// Occurrences is OccurrencesExcept without exception dates.
func (r Rule) Occurrences(due, today string, done int, from, to string) (dates []string, capped bool, err error) {
	return r.OccurrencesExcept(due, today, done, from, to, nil)
}

// OccurrencesExcept lists the floating occurrence dates that follow the current
// due inside the inclusive range [from, to]: the walk of
// web/src/lib/occurrences.ts walkOccurrences, pinned by the shared vectors in
// web/src/lib/occurrences.vectors.json. Each occurrence is taken as completed on
// time (calendar rules) or on its own day (completion-relative rules; today for an
// overdue first step); taken counts the occurrences already used toward
// "for N times" (done and open occurrence records, OpenSpec change
// series-exceptions D9), and until bounds every date. A date in except is an
// exception of the series (series-exceptions M4): it is never listed and does not
// use up an occurrence. At most MaxOccurrences dates are returned; capped reports
// that the cap stopped the walk inside the range.
func (r Rule) OccurrencesExcept(due, today string, taken int, from, to string, except map[string]bool) (dates []string, capped bool, err error) {
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
	limit := MaxOccurrences + 1 + gap + len(except)
	k := 0
	for i := 0; i < limit; i++ {
		completedOn := today
		if r.afterCompletion {
			completedOn = cur
			if i == 0 && cur < today {
				completedOn = today
			}
		}
		next, ok, err := r.Following(cur, today, completedOn, taken+k)
		if err != nil {
			return nil, false, err
		}
		if !ok || next <= cur || next > to {
			break
		}
		cur = next
		if except[next] {
			continue
		}
		k++
		if next >= from {
			if len(dates) == MaxOccurrences {
				return dates, true, nil
			}
			dates = append(dates, next)
		}
	}
	return dates, false, nil
}

// NextFree is Following jumping over exception dates (OpenSpec change
// series-exceptions, M4): the first occurrence after the current one that is not
// in except, or ok=false when the end condition comes first. taken counts the
// done and open occurrence records other than the current one. Pinned by the
// "next" cases of web/src/lib/occurrences.vectors.json (web nextFree).
func (r Rule) NextFree(due, today, completedOn string, taken int, except map[string]bool) (next string, ok bool, err error) {
	next, ok, err = r.Following(due, today, completedOn, taken)
	for i := 0; err == nil && ok && except[next]; i++ {
		if i == maxJumps {
			return "", false, nil
		}
		on := today
		if r.afterCompletion {
			on = next
		}
		next, ok, err = r.Following(next, today, on, taken)
	}
	if err != nil || !ok {
		return "", false, err
	}
	return next, true, nil
}
