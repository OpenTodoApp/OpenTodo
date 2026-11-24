package sync

import (
	"strings"
	"time"
)

// Away periods (OpenSpec change away-periods, design D3): user_prefs.away holds
// "" or "YYYY-MM-DD..YYYY-MM-DD", inclusive, followed by " quiet" when the
// period pauses reminders and the digest. web/src/lib/away.ts reads it the same
// way; both are pinned by testdata/away.vectors.json.

// MaxAwayDays is the longest away period, both days counted.
const MaxAwayDays = 90

// Away is a parsed away period.
type Away struct {
	From, To string
	Quiet    bool
}

// ParseAway reads a stored away value. ok is false for "" and for any
// malformed value, which reads as no period (and is kept as it is).
func ParseAway(v string) (Away, bool) {
	rng, quiet := v, false
	if r, ok := strings.CutSuffix(v, " quiet"); ok {
		rng, quiet = r, true
	}
	from, to, ok := strings.Cut(rng, "..")
	if !ok || !isDay(from) || !isDay(to) || from > to || AwayDays(from, to) > MaxAwayDays {
		return Away{}, false
	}
	return Away{From: from, To: to, Quiet: quiet}, true
}

// String is the stored form of a.
func (a Away) String() string {
	s := a.From + ".." + a.To
	if a.Quiet {
		s += " quiet"
	}
	return s
}

// Holds reports whether today (the user's logical day) is within the period.
func (a Away) Holds(today string) bool { return a.From <= today && today <= a.To }

// QuietOn reports whether the stored value pauses reminders on today.
func QuietOn(v, today string) bool {
	a, ok := ParseAway(v)
	return ok && a.Quiet && a.Holds(today)
}

// AwayDays counts the days from from to to, both included (0 when either is not a day).
func AwayDays(from, to string) int {
	f, err1 := time.Parse(time.DateOnly, from)
	t, err2 := time.Parse(time.DateOnly, to)
	if err1 != nil || err2 != nil {
		return 0
	}
	return int(t.Sub(f).Hours()/24) + 1
}

func isDay(s string) bool {
	d, err := time.Parse(time.DateOnly, s)
	return err == nil && d.Format(time.DateOnly) == s
}
