package recurrence10

import (
	"fmt"
	"regexp"
	"strconv"

	"github.com/OpenTodoApp/opentodo/internal/recurrence"
)

// weeksOn is a form newer than 1.0: every N weeks on <weekdays> and its ends.
var weeksOn = regexp.MustCompile(`^every ([0-9]+) weeks on ([a-z, ]+?)((?: until | for ).*)?$`)

// weekdayOfMonth is the other form newer than 1.0, a weekday of one month every
// year (yearly-weekday-of-month): 1.0's only yearly rule repeats on the same
// date, which falls on another weekday from year to year, so no 1.0 rule gives
// the same dates and the new form is the only correct one.
var weekdayOfMonth = regexp.MustCompile(`^every (?:[1-4](?:st|nd|rd|th)|last) [a-z]+ of [a-z]+(?: until .*| for .*)?$`)

// Check returns an error when a writer stored rule for a task due on due
// ("YYYY-MM-DD" or "") in a form 1.0 cannot read although a rule 1.0 reads
// gives the same dates: every N weeks, every 7N days or every <weekdays>,
// with the same end, compared over 60 occurrences completed on time.
func Check(rule, due string) error {
	if Readable(rule) {
		return nil
	}
	r, err := recurrence.Parse(rule)
	if err != nil {
		return fmt.Errorf("%q is not a rule: %v", rule, err)
	}
	if weekdayOfMonth.MatchString(r.Canonical()) {
		return nil
	}
	m := weeksOn.FindStringSubmatch(r.Canonical())
	if m == nil {
		return fmt.Errorf("%q is not readable by 1.0 and not a form this check knows", rule)
	}
	n, _ := strconv.Atoi(m[1])
	for _, c := range []string{"every " + m[1] + " weeks" + m[3], "every " + strconv.Itoa(7*n) + " days" + m[3], "every " + m[2] + m[3]} {
		old, err := recurrence.Parse(c)
		if err != nil || !Readable(c) {
			continue
		}
		if sameDates(r, old, due) {
			return fmt.Errorf("%q is stored for a task due %q, but %q, which 1.0 reads, gives the same dates", rule, due, c)
		}
	}
	return nil
}

func sameDates(a, b recurrence.Rule, due string) bool {
	today := due
	if today == "" {
		today = "2026-11-04"
	}
	ca, cb := due, due
	for i := 0; i < 60; i++ {
		na, okA, errA := a.Following(ca, today, today, i)
		nb, okB, errB := b.Following(cb, today, today, i)
		if errA != nil || errB != nil || okA != okB || na != nb {
			return false
		}
		if !okA {
			return true
		}
		ca, cb, today = na, nb, na
	}
	return true
}
