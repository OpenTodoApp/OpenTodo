package quickadd

import "time"

// Reminder is a reminder as typed: an offset from the due (negative = before)
// or a floating wall-clock moment.
type Reminder struct {
	Kind    string  `json:"kind"` // offset | moment
	Minutes int     `json:"minutes,omitempty"`
	Date    *string `json:"date,omitempty"`
	Time    string  `json:"time,omitempty"`
}

type remMatch struct {
	reminder Reminder
	from, to int
}

var unitMinutes = []struct {
	pick    func(*Vocab) []string
	minutes int
}{
	{func(v *Vocab) []string { return v.Units.Minute }, 1},
	{func(v *Vocab) []string { return v.Units.Hour }, 60},
	{func(v *Vocab) []string { return v.Units.Day }, 1440},
	{func(v *Vocab) []string { return v.Units.Week }, 10080},
}

func offsetAt(tokens []token, k int, ctx *dateCtx) (int, int, bool) {
	bestN, bestMin, found := 0, 0, false
	for _, v := range ctx.vocabs {
		an, amount := 0, 0
		if cn, count, ok := countAt(tokens, k, v); ok {
			for _, u := range unitMinutes {
				if n := phraseAt(tokens, k+cn, u.pick(v)); n > 0 {
					an, amount = cn+n, count*u.minutes
					break
				}
			}
		}
		if an == 0 {
			if t := tok(tokens, k); t != nil {
				if m := matchDuration(t.text, false); m > 0 {
					an, amount = 1, m
				}
			}
		}
		if an == 0 || amount <= 0 {
			continue
		}
		before := phraseAt(tokens, k+an, v.BeforeWords)
		after := 0
		if before == 0 {
			after = phraseAt(tokens, k+an, v.AfterWords)
		}
		if before == 0 && after == 0 {
			continue
		}
		n := an + before + after
		if !found || n > bestN {
			bestN, found = n, true
			bestMin = amount
			if before > 0 {
				bestMin = -amount
			}
		}
	}
	return bestN, bestMin, found
}

func momentAt(tokens []token, k int, ctx *dateCtx) (int, *string, string, bool) {
	if df := matchDateAt(tokens, k, ctx); df != nil {
		if t := matchTimeAt(tokens, df.to, ctx); t != nil {
			d := df.date
			return t.to - k, &d, t.time, true
		}
	}
	t := matchTimeAt(tokens, k, ctx)
	if t == nil {
		return 0, nil, "", false
	}
	if d := matchDateAt(tokens, t.to, ctx); d != nil {
		date := d.date
		return d.to - k, &date, t.time, true
	}
	if t.date != "" {
		date := t.date
		return t.to - k, &date, t.time, true
	}
	return t.to - k, nil, t.time, true
}

// parseReminderAt parses the reminder body (offset or moment) at token k.
func parseReminderAt(tokens []token, k int, ctx *dateCtx) (Reminder, int, bool) {
	on, mins, okOff := offsetAt(tokens, k, ctx)
	mn, date, at, okMom := momentAt(tokens, k, ctx)
	if okOff && (!okMom || on >= mn) {
		return Reminder{Kind: "offset", Minutes: mins}, k + on, true
	}
	if okMom {
		return Reminder{Kind: "moment", Date: date, Time: at}, k + mn, true
	}
	return Reminder{}, 0, false
}

func matchReminderAt(tokens []token, i int, ctx *dateCtx) *remMatch {
	if tok(tokens, i) == nil {
		return nil
	}
	word := 0
	for _, v := range ctx.vocabs {
		word = max(word, phraseAt(tokens, i, v.RemindWords))
	}
	if word == 0 {
		return nil
	}
	r, to, ok := parseReminderAt(tokens, i+word, ctx)
	if !ok {
		return nil
	}
	return &remMatch{r, i, to}
}

// Resolved is how a typed reminder is stored once the due is known.
type Resolved struct {
	Relative      bool
	OffsetMinutes int
	Date, Time    string // absolute moments, in the caller's zone
}

func dayNum(iso string) int {
	t, _ := time.Parse("2006-01-02", iso)
	return int(t.Unix() / 86400)
}

func minutesOf(hhmm string) int {
	t, _ := time.Parse("15:04", hhmm)
	return t.Hour()*60 + t.Minute()
}

// Resolve mirrors resolveReminder in web/src/lib/nlp/reminders.ts: an offset is
// relative; a moment is relative to the due time (09:00 for a date-only due)
// in wall-clock minutes; without a due a moment is absolute, today or tomorrow.
func Resolve(r Reminder, dueDate, dueTime, today, now string) Resolved {
	if r.Kind == "offset" {
		return Resolved{Relative: true, OffsetMinutes: r.Minutes}
	}
	if dueDate != "" {
		if dueTime == "" {
			dueTime = "09:00"
		}
		date := dueDate
		if r.Date != nil {
			date = *r.Date
		}
		return Resolved{Relative: true, OffsetMinutes: dayNum(date)*1440 + minutesOf(r.Time) - (dayNum(dueDate)*1440 + minutesOf(dueTime))}
	}
	if r.Date != nil {
		return Resolved{Date: *r.Date, Time: r.Time}
	}
	if minutesOf(r.Time) > minutesOf(now) {
		return Resolved{Date: today, Time: r.Time}
	}
	return Resolved{Date: addDays(today, 1), Time: r.Time}
}
