package quickadd

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/recurrence"
)

type recMatch struct {
	rule     string
	from, to int
	// literal marks a phrase the grammar cannot express ("every 2 Mondays",
	// quick-add-nth-weekday D3): it wins the longest-match comparison like any
	// match but records no attribute, so it stays whole in the title.
	literal bool
	// start is the first date when the phrase names a weekday the rule cannot
	// hold ("every other friday": the next Friday).
	start string
}

// recPattern is a pattern after "every"; monthly patterns accept the "of the
// month" tail (quick-add-nth-weekday D2).
type recPattern struct {
	n       int
	text    string
	monthly bool
}

var (
	weekdayEN = []string{"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"}
	ordinalEN = map[int]string{1: "1st", 2: "2nd", 3: "3rd", 4: "4th", -1: "last"}
	digitsRE  = regexp.MustCompile(`^\d+$`)
	count3RE  = regexp.MustCompile(`^\d{1,3}$`)
)

func canonical(rule string) (string, bool) {
	c, err := recurrence.Canonicalize(rule)
	return c, err == nil
}

func recUnitAt(tokens []token, i int, v *Vocab) (int, string) {
	for _, u := range []struct {
		name  string
		words []string
	}{{"day", v.Units.Day}, {"week", v.Units.Week}, {"month", v.Units.Month}, {"year", v.Units.Year}} {
		if n := phraseAt(tokens, i, u.words); n > 0 {
			return n, u.name
		}
	}
	return 0, ""
}

func anyUnitAt(tokens []token, i int, v *Vocab) bool {
	for _, w := range [][]string{v.Units.Minute, v.Units.Hour, v.Units.Day, v.Units.Week, v.Units.Month, v.Units.Year} {
		if phraseAt(tokens, i, w) > 0 {
			return true
		}
	}
	return false
}

// weekdayPluralAt is a weekday at i, or its plural after "every": Romance plurals
// without their final s, hyphenated ones without the s of each part
// ("segundas-feiras"), German ones without their final e ("Montage").
func weekdayPluralAt(tokens []token, i int, v *Vocab) int {
	if wd := weekdayAt(tokens, i, v); wd >= 0 {
		return wd
	}
	t := tok(tokens, i)
	if t == nil {
		return -1
	}
	for _, stem := range pluralStems(t.norm) {
		stripped := *t
		stripped.norm = stem
		if wd := weekdayAt([]token{stripped}, 0, v); wd >= 0 {
			return wd
		}
	}
	return -1
}

// pluralStems mirrors pluralStems in web/src/lib/nlp/recurrence.ts; lengths are
// in UTF-16 units there and bytes here, which agree on the folded ASCII weekdays.
func pluralStems(norm string) []string {
	var out []string
	if len(norm) >= 4 && strings.HasSuffix(norm, "s") {
		out = append(out, norm[:len(norm)-1])
	}
	if len(norm) >= 6 && strings.HasSuffix(norm, "e") {
		out = append(out, norm[:len(norm)-1])
	}
	if strings.Contains(norm, "-") {
		parts := strings.Split(norm, "-")
		for i, p := range parts {
			parts[i] = strings.TrimSuffix(p, "s")
		}
		out = append(out, strings.Join(parts, "-"))
	}
	return out
}

func ordinalAt(tokens []token, i int, v *Vocab) (int, int, bool) {
	t := tok(tokens, i)
	if t == nil {
		return 0, 0, false
	}
	if !digitsRE.MatchString(t.norm) {
		if d := dayNumber(t); d > 0 {
			return 1, d, true
		}
	}
	if n, val, ok := lookupAt(tokens, i, v.Ordinals); ok {
		return n, val, true
	}
	return 0, 0, false
}

func daySuffix(n int) string {
	switch {
	case n%10 == 1 && n != 11:
		return "st"
	case n%10 == 2 && n != 12:
		return "nd"
	case n%10 == 3 && n != 13:
		return "rd"
	}
	return "th"
}

func patternAt(tokens []token, k int, v *Vocab) *recPattern {
	if all := phraseAt(tokens, k, v.WeekdayAll); all > 0 {
		return &recPattern{all, "weekday", false}
	}
	count := 0
	if t := tok(tokens, k); t != nil && count3RE.MatchString(t.norm) {
		count, _ = strconv.Atoi(t.norm)
	}
	skip := 0
	if count > 0 {
		skip = 1
	}
	if un, unit := recUnitAt(tokens, k+skip, v); un > 0 {
		if count > 0 && count != 1 {
			return &recPattern{skip + un, fmt.Sprintf("%d %ss", count, unit), false}
		}
		return &recPattern{skip + un, unit, false}
	}
	if count > 0 && anyUnitAt(tokens, k+1, v) {
		return nil
	}
	// ordinal weekday: "2nd monday", "2e lundis", "segunda segunda-feira" (quick-add-nth-weekday D3)
	if on, val, ok := weekdayOrdinalAt(tokens, k, v, func(w int) bool { return weekdayPluralAt(tokens, w, v) >= 0 }); ok {
		return &recPattern{on + 1, ordinalEN[val] + " " + weekdayEN[weekdayPluralAt(tokens, k+on, v)], true}
	}
	if on, val, ok := ordinalAt(tokens, k, v); ok {
		j := k + on
		if wd := weekdayPluralAt(tokens, j, v); wd >= 0 && val <= 4 {
			return &recPattern{on + 1, ordinalEN[val] + " " + weekdayEN[wd], true}
		}
		if val == -1 {
			if d := phraseAt(tokens, j, v.Units.Day); d > 0 {
				return &recPattern{on + d, "last day", true}
			}
			if w := phraseAt(tokens, j, v.WeekdayAll); w > 0 {
				return &recPattern{on + w, "last weekday", true}
			}
			return nil
		}
		if t := tokens[k].norm; t != "" && t[0] >= '0' && t[0] <= '9' && val >= 1 && val <= 31 {
			return &recPattern{on, fmt.Sprintf("%d%s", val, daySuffix(val)), true}
		}
		return nil
	}
	var days []string
	j := k
	for {
		wd := weekdayPluralAt(tokens, j, v)
		if wd < 0 {
			break
		}
		days = append(days, weekdayEN[wd])
		j++
		if and := phraseAt(tokens, j, v.AndWords); and > 0 && weekdayPluralAt(tokens, j+and, v) >= 0 {
			j += and
			continue
		}
		if strings.HasSuffix(tokens[j-1].text, ",") || strings.HasSuffix(tokens[j-1].text, ";") {
			if weekdayPluralAt(tokens, j, v) >= 0 {
				continue
			}
		}
		break
	}
	if len(days) > 0 {
		return &recPattern{j - k, strings.Join(days, ", "), false}
	}
	return nil
}

// countWeekdayAt is a bare count between the "every" word and a weekday ("every
// 2 Mondays", "alle 2 Montage"): the grammar cannot express it, so the caller
// returns a literal match over the phrase. It returns the token count, or 0.
func countWeekdayAt(tokens []token, k int, v *Vocab) int {
	if t := tok(tokens, k); t == nil || !count3RE.MatchString(t.norm) {
		return 0
	}
	if weekdayPluralAt(tokens, k+1, v) >= 0 {
		return 2
	}
	return 0
}

// everyOtherAt reads "every other" with a unit or a weekday at token i
// (quick-add-month-and-every-other D3): "every other week" is every 2 weeks,
// "every other friday" every 2 weeks from the first Friday on or after today.
// Also the French form around the noun, "un vendredi sur deux". It returns the
// token count, the pattern after "every" and the start date, or n == 0.
func everyOtherAt(tokens []token, i int, v *Vocab, today string) (int, string, string) {
	noun := func(k int) (int, string, string) {
		if n, unit := recUnitAt(tokens, k, v); n > 0 {
			return n, "2 " + unit + "s", ""
		}
		if wd := weekdayPluralAt(tokens, k, v); wd >= 0 {
			r, _ := recurrence.Parse("every " + weekdayEN[wd])
			d, _ := r.First(today)
			return 1, "2 weeks", d
		}
		return 0, "", ""
	}
	if ev := phraseAt(tokens, i, v.EveryOther); ev > 0 {
		n, pattern, start := noun(i + ev)
		if n == 0 {
			return 0, "", ""
		}
		return ev + n, pattern, start
	}
	pre := phraseAt(tokens, i, v.EveryOtherAround.Before)
	if pre == 0 {
		return 0, "", ""
	}
	n, pattern, start := noun(i + pre)
	if n == 0 {
		return 0, "", ""
	}
	post := phraseAt(tokens, i+pre+n, v.EveryOtherAround.After)
	if post == 0 {
		return 0, "", ""
	}
	return pre + n + post, pattern, start
}

// recTails reads the optional tails after a rule ending before token k (after
// completion, until <date phrase>, for N times) in every active language and
// returns the rule with them and the token after it.
func recTails(tokens []token, rule string, k int, ctx *dateCtx) (string, int) {
	tail := func(pick func(*Vocab) []string) int {
		n := 0
		for _, w := range ctx.vocabs {
			n = max(n, phraseAt(tokens, k, pick(w)))
		}
		return n
	}
	if ac := tail(func(w *Vocab) []string { return w.AfterCompl }); ac > 0 {
		if _, ok := canonical(rule + " after completion"); ok {
			rule += " after completion"
			k += ac
		}
	}
	if until := tail(func(w *Vocab) []string { return w.UntilWords }); until > 0 {
		if dm := matchDateAt(tokens, k+until, ctx); dm != nil {
			if _, ok := canonical(rule + " until " + dm.date); ok {
				rule += " until " + dm.date
				k = dm.to
			}
		}
		return rule, k
	}
	for _, w := range ctx.vocabs {
		pre := phraseAt(tokens, k, w.TimesWords.Before)
		cn, count, ok := countAt(tokens, k+pre, w)
		if !ok || !digitsRE.MatchString(tokens[k+pre].norm) {
			continue
		}
		post := phraseAt(tokens, k+pre+cn, w.TimesWords.After)
		if post == 0 {
			continue
		}
		if _, ok := canonical(fmt.Sprintf("%s for %d times", rule, count)); ok {
			return fmt.Sprintf("%s for %d times", rule, count), k + pre + cn + post
		}
	}
	return rule, k
}

func matchRecurrenceAt(tokens []token, i int, ctx *dateCtx) *recMatch {
	if tok(tokens, i) == nil {
		return nil
	}
	var best *recMatch
	// consider keeps a head (the pattern after "every", ending before token k)
	// with its tails when it is longer than the best so far.
	consider := func(pattern string, k int, start string) {
		rule, k := recTails(tokens, "every "+pattern, k, ctx)
		c, ok := canonical(rule)
		if ok && (best == nil || k > best.to) {
			best = &recMatch{rule: c, from: i, to: k, start: start}
		}
	}
	for _, v := range ctx.vocabs {
		// "every other" first: on a tie it wins over the ordinal reading of
		// "jeden zweiten Freitag".
		if n, pattern, start := everyOtherAt(tokens, i, v, ctx.today); n > 0 {
			consider(pattern, i+n, start)
		}
		if n, p, ok := lookupAt(tokens, i, v.EveryOne); ok {
			consider(p, i+n, "")
			continue
		}
		ev := phraseAt(tokens, i, v.Every)
		if ev == 0 {
			continue
		}
		p := patternAt(tokens, i+ev, v)
		if p == nil {
			if n := countWeekdayAt(tokens, i+ev, v); n > 0 && (best == nil || i+ev+n > best.to) {
				best = &recMatch{from: i, to: i + ev + n, literal: true}
			}
			continue
		}
		k := i + ev + p.n
		if p.monthly {
			k += ofMonthAt(tokens, k, ctx)
		}
		consider(p.text, k, "")
	}
	return best
}
