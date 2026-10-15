package quickadd

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/pixari/opentodo/internal/recurrence"
)

type recMatch struct {
	rule     string
	from, to int
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

func weekdayPluralAt(tokens []token, i int, v *Vocab) int {
	if wd := weekdayAt(tokens, i, v); wd >= 0 {
		return wd
	}
	t := tok(tokens, i)
	if t == nil || !strings.HasSuffix(t.norm, "s") || len(t.norm) < 4 {
		return -1
	}
	stripped := *t
	stripped.norm = t.norm[:len(t.norm)-1]
	return weekdayAt([]token{stripped}, 0, v)
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

func patternAt(tokens []token, k int, v *Vocab) (int, string, bool) {
	if all := phraseAt(tokens, k, v.WeekdayAll); all > 0 {
		return all, "weekday", true
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
			return skip + un, fmt.Sprintf("%d %ss", count, unit), true
		}
		return skip + un, unit, true
	}
	if count > 0 && anyUnitAt(tokens, k+1, v) {
		return 0, "", false
	}
	if on, val, ok := ordinalAt(tokens, k, v); ok {
		j := k + on
		if wd := weekdayPluralAt(tokens, j, v); wd >= 0 && val <= 4 {
			return on + 1, ordinalEN[val] + " " + weekdayEN[wd], true
		}
		if val == -1 {
			if d := phraseAt(tokens, j, v.Units.Day); d > 0 {
				return on + d, "last day", true
			}
			if w := phraseAt(tokens, j, v.WeekdayAll); w > 0 {
				return on + w, "last weekday", true
			}
			return 0, "", false
		}
		if t := tokens[k].norm; t != "" && t[0] >= '0' && t[0] <= '9' && val >= 1 && val <= 31 {
			return on, fmt.Sprintf("%d%s", val, daySuffix(val)), true
		}
		return 0, "", false
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
		return j - k, strings.Join(days, ", "), true
	}
	return 0, "", false
}

func matchRecurrenceAt(tokens []token, i int, ctx *dateCtx) *recMatch {
	if tok(tokens, i) == nil {
		return nil
	}
	var best *recMatch
	for _, v := range ctx.vocabs {
		k := i
		pattern := ""
		if n, p, ok := lookupAt(tokens, i, v.EveryOne); ok {
			pattern, k = p, i+n
		} else {
			ev := phraseAt(tokens, i, v.Every)
			if ev == 0 {
				continue
			}
			pn, p, ok := patternAt(tokens, i+ev, v)
			if !ok {
				continue
			}
			pattern, k = p, i+ev+pn
		}
		rule := "every " + pattern
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
		} else {
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
					rule = fmt.Sprintf("%s for %d times", rule, count)
					k += pre + cn + post
					break
				}
			}
		}
		c, ok := canonical(rule)
		if !ok {
			continue
		}
		if best == nil || k > best.to {
			best = &recMatch{c, i, k}
		}
	}
	return best
}
