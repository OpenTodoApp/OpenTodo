package quickadd

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// dateCtx mirrors DateContext in web/src/lib/nlp/dates.ts.
type dateCtx struct {
	today         string
	now           string
	vocabs        []*Vocab
	dayMonthOrder string
	weekStart     int
}

type dateMatch struct {
	date     string
	from, to int
}

type timeMatch struct {
	time     string
	date     string
	from, to int
}

// ---- calendar helpers (UTC day arithmetic, like the JS Date overflow rules) ----

func toISO(y, m, d int) string {
	return time.Date(y, time.Month(m), d, 0, 0, 0, 0, time.UTC).Format("2006-01-02")
}

func fromISO(iso string) (int, int, int) {
	t, _ := time.Parse("2006-01-02", iso)
	return t.Year(), int(t.Month()), t.Day()
}

func addDays(iso string, n int) string {
	y, m, d := fromISO(iso)
	return toISO(y, m, d+n)
}

func daysInMonth(y, m int) int {
	return time.Date(y, time.Month(m)+1, 0, 0, 0, 0, 0, time.UTC).Day()
}

func isValidDate(y, m, d int) bool { return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m) }

func addMonths(iso string, n int) string {
	y, m, d := fromISO(iso)
	total := y*12 + (m - 1) + n
	ny, nm := total/12, total%12+1
	return toISO(ny, nm, min(d, daysInMonth(ny, nm)))
}

func jsDay(iso string) int { // 0 = Sunday
	t, _ := time.Parse("2006-01-02", iso)
	return int(t.Weekday())
}

func weekdayIndex(iso string) int { return (jsDay(iso) + 6) % 7 } // 0 = Monday

func nextWeekday(today string, wd int) string {
	delta := (wd - weekdayIndex(today) + 7) % 7
	if delta == 0 {
		delta = 7
	}
	return addDays(today, delta)
}

func daysIntoWeek(iso string, weekStart int) int { return (jsDay(iso) - weekStart + 7) % 7 }

func nextNextWeekday(today string, wd, weekStart int) string {
	bare := nextWeekday(today, wd)
	lastDay := addDays(today, 6-daysIntoWeek(today, weekStart))
	if bare <= lastDay {
		return addDays(bare, 7)
	}
	return bare
}

func startOfNextWeek(today string, weekStart int) string {
	return addDays(today, 7-daysIntoWeek(today, weekStart))
}

func startOfNextMonth(today string) string {
	y, m, _ := fromISO(today)
	return toISO(y, m+1, 1)
}

func nextOccurrence(today string, month, day int) string {
	y, _, _ := fromISO(today)
	for year := y; year <= y+8; year++ {
		if !isValidDate(year, month, day) {
			continue
		}
		if iso := toISO(year, month, day); iso >= today {
			return iso
		}
	}
	return ""
}

func clock(h, m int) string { return fmt.Sprintf("%02d:%02d", h, m) }

// ---- phrase matching ----

func wordMatches(tokens []token, i int, word string) bool {
	if i >= len(tokens) || tokens[i].quoted {
		return false
	}
	n := tokens[i].norm
	if n == word {
		return true
	}
	return !strings.HasSuffix(word, ".") && strings.HasSuffix(n, ".") && n[:len(n)-1] == word
}

// phraseAt is the number of tokens at i consumed by the longest phrase of list.
func phraseAt(tokens []token, i int, list []string) int {
	best := 0
	for _, p := range list {
		words := strings.Fields(p)
		if len(words) <= best || len(words) == 0 {
			continue
		}
		ok := true
		for k, w := range words {
			if !wordMatches(tokens, i+k, w) {
				ok = false
				break
			}
		}
		if ok {
			best = len(words)
		}
	}
	return best
}

// lookupAt finds the longest key of m at i.
func lookupAt[T any](tokens []token, i int, m map[string]T) (int, T, bool) {
	var best T
	n := 0
	for phrase, v := range m {
		if k := phraseAt(tokens, i, []string{phrase}); k > n {
			n, best = k, v
		}
	}
	return n, best, n > 0
}

func weekdayAt(tokens []token, i int, v *Vocab) int {
	for wd := 0; wd < 7; wd++ {
		if phraseAt(tokens, i, v.Weekdays[wd]) > 0 {
			return wd
		}
	}
	return -1
}

func monthAt(tokens []token, i int, v *Vocab, allowAbbr bool) int {
	for m := 0; m < 12; m++ {
		if phraseAt(tokens, i, v.Months[m].Names) > 0 {
			return m + 1
		}
		if allowAbbr && phraseAt(tokens, i, v.Months[m].Abbr) > 0 {
			return m + 1
		}
	}
	return 0
}

var (
	dayRE  = regexp.MustCompile(`^(\d{1,2})(?:st|nd|rd|th|er|o|a|º|°|ª|\.)?$`)
	yearRE = regexp.MustCompile(`^(\d{4})$`)
	numRE  = regexp.MustCompile(`^\d{1,3}$`)
)

func tok(tokens []token, i int) *token {
	if i < 0 || i >= len(tokens) || tokens[i].quoted {
		return nil
	}
	return &tokens[i]
}

func dayNumber(t *token) int {
	if t == nil {
		return 0
	}
	m := dayRE.FindStringSubmatch(t.norm)
	if m == nil {
		return 0
	}
	d, _ := strconv.Atoi(m[1])
	if d >= 1 && d <= 31 {
		return d
	}
	return 0
}

func yearAt(t *token) int {
	if t == nil {
		return 0
	}
	if m := yearRE.FindStringSubmatch(t.norm); m != nil {
		y, _ := strconv.Atoi(m[1])
		return y
	}
	return 0
}

func countAt(tokens []token, i int, v *Vocab) (n, count int, ok bool) {
	t := tok(tokens, i)
	if t == nil {
		return 0, 0, false
	}
	if numRE.MatchString(t.norm) {
		c, _ := strconv.Atoi(t.norm)
		return 1, c, true
	}
	if one := phraseAt(tokens, i, v.OneWords); one > 0 {
		return one, 1, true
	}
	return 0, 0, false
}

func unitAt(tokens []token, i int, v *Vocab) (int, string) {
	for _, u := range []struct {
		name  string
		words []string
	}{{"hour", v.Units.Hour}, {"day", v.Units.Day}, {"week", v.Units.Week}, {"month", v.Units.Month}} {
		if n := phraseAt(tokens, i, u.words); n > 0 {
			return n, u.name
		}
	}
	return 0, ""
}

// ---- dates ----

func wordsAt(tokens []token, i int, ctx *dateCtx, pick func(*Vocab) []string) int {
	if tok(tokens, i) == nil {
		return 0
	}
	best := 0
	for _, v := range ctx.vocabs {
		best = max(best, phraseAt(tokens, i, pick(v)))
	}
	return best
}

func matchDeadlineAt(tokens []token, i int, ctx *dateCtx) *dateMatch {
	if tok(tokens, i) == nil {
		return nil
	}
	var best *dateMatch
	for _, v := range ctx.vocabs {
		n := phraseAt(tokens, i, v.DeadlineWords)
		if n == 0 {
			continue
		}
		if dm := matchDateAt(tokens, i+n, ctx); dm != nil && (best == nil || dm.to > best.to) {
			best = &dateMatch{dm.date, i, dm.to}
		}
	}
	return best
}

func matchDateAt(tokens []token, i int, ctx *dateCtx) *dateMatch {
	if tok(tokens, i) == nil {
		return nil
	}
	var best *dateMatch
	consider := func(m *dateMatch) {
		if m != nil && (best == nil || m.to > best.to) {
			best = m
		}
	}
	for _, v := range ctx.vocabs {
		if n, d, ok := lookupAt(tokens, i, v.DayWords); ok {
			consider(&dateMatch{addDays(ctx.today, d), i, i + n})
		}
		pre := phraseAt(tokens, i, v.Before)
		starts := []int{i}
		if pre > 0 {
			starts = []int{i + pre, i}
		}
		for _, j := range starts {
			wrap := func(date string, n int, ok bool) *dateMatch {
				if !ok {
					return nil
				}
				return &dateMatch{date, i, j + n}
			}
			consider(wrap(weekdayPhraseAt(tokens, j, v, ctx)))
			consider(wrap(nextPeriodAt(tokens, j, v, ctx)))
			consider(wrap(inPeriodAt(tokens, j, v, ctx)))
			consider(wrap(monthDayAt(tokens, j, v, ctx)))
			consider(wrap(numericDateAt(tokens, j, ctx)))
		}
	}
	return best
}

func weekdayPhraseAt(tokens []token, j int, v *Vocab, ctx *dateCtx) (string, int, bool) {
	k := j
	qualifier := ""
	if nb := phraseAt(tokens, k, v.NextBefore); nb > 0 {
		qualifier, k = "next", k+nb
	} else if tb := phraseAt(tokens, k, v.ThisBefore); tb > 0 {
		qualifier, k = "this", k+tb
	}
	wd := weekdayAt(tokens, k, v)
	if wd < 0 {
		return "", 0, false
	}
	k++
	if qualifier == "" {
		if na := phraseAt(tokens, k, v.NextAfter); na > 0 {
			qualifier, k = "next", k+na
		}
	}
	if qualifier == "next" {
		return nextNextWeekday(ctx.today, wd, ctx.weekStart), k - j, true
	}
	return nextWeekday(ctx.today, wd), k - j, true
}

func nextPeriodAt(tokens []token, j int, v *Vocab, ctx *dateCtx) (string, int, bool) {
	k := j
	nb := phraseAt(tokens, k, v.NextBefore)
	k += nb
	un, unit := unitAt(tokens, k, v)
	if un == 0 || (unit != "week" && unit != "month") {
		return "", 0, false
	}
	k += un
	if nb == 0 {
		na := phraseAt(tokens, k, v.NextAfter)
		if na == 0 {
			return "", 0, false
		}
		k += na
	}
	if unit == "week" {
		return startOfNextWeek(ctx.today, ctx.weekStart), k - j, true
	}
	return startOfNextMonth(ctx.today), k - j, true
}

func inPeriodAt(tokens []token, j int, v *Vocab, ctx *dateCtx) (string, int, bool) {
	inN := phraseAt(tokens, j, v.InWords)
	if inN == 0 {
		return "", 0, false
	}
	cn, count, ok := countAt(tokens, j+inN, v)
	if !ok {
		return "", 0, false
	}
	un, unit := unitAt(tokens, j+inN+cn, v)
	if un == 0 || unit == "hour" {
		return "", 0, false
	}
	n := inN + cn + un
	switch unit {
	case "day":
		return addDays(ctx.today, count), n, true
	case "week":
		return addDays(ctx.today, 7*count), n, true
	default:
		return addMonths(ctx.today, count), n, true
	}
}

func resolveMonthDay(today string, year, month, day int) string {
	if year != 0 {
		if isValidDate(year, month, day) {
			return toISO(year, month, day)
		}
		return ""
	}
	return nextOccurrence(today, month, day)
}

func monthDayAt(tokens []token, j int, v *Vocab, ctx *dateCtx) (string, int, bool) {
	if d1 := dayNumber(tok(tokens, j)); d1 > 0 {
		k := j + 1
		k += phraseAt(tokens, k, v.OfWords)
		if m := monthAt(tokens, k, v, true); m > 0 {
			k++
			y := yearAt(tok(tokens, k))
			if y > 0 {
				k++
			}
			date := resolveMonthDay(ctx.today, y, m, d1)
			return date, k - j, date != ""
		}
	}
	if mAbbr := monthAt(tokens, j, v, true); mAbbr > 0 {
		if d2 := dayNumber(tok(tokens, j+1)); d2 > 0 {
			k := j + 2
			y := yearAt(tok(tokens, k))
			if y > 0 {
				k++
			}
			date := resolveMonthDay(ctx.today, y, mAbbr, d2)
			return date, k - j, date != ""
		}
		if mFull := monthAt(tokens, j, v, false); mFull > 0 {
			date := resolveMonthDay(ctx.today, 0, mFull, 1)
			return date, 1, date != ""
		}
	}
	return "", 0, false
}

var (
	isoRE = regexp.MustCompile(`^(\d{4})-(\d{1,2})-(\d{1,2})$`)
	// numericRE stands in for the JS /^(\d{1,2})([/.-])(\d{1,2})(?:\2(\d{2}|\d{4}))?\.?$/:
	// RE2 has no back-reference, so the separators are compared below.
	numericRE = regexp.MustCompile(`^(\d{1,2})([/.-])(\d{1,2})(?:([/.-])(\d{2}|\d{4}))?(\.?)$`)
)

func numericDateAt(tokens []token, j int, ctx *dateCtx) (string, int, bool) {
	t := tok(tokens, j)
	if t == nil {
		return "", 0, false
	}
	if m := isoRE.FindStringSubmatch(t.norm); m != nil {
		y, _ := strconv.Atoi(m[1])
		mo, _ := strconv.Atoi(m[2])
		d, _ := strconv.Atoi(m[3])
		if isValidDate(y, mo, d) {
			return toISO(y, mo, d), 1, true
		}
		return "", 0, false
	}
	m := numericRE.FindStringSubmatch(t.norm)
	if m == nil || (m[4] != "" && m[4] != m[2]) {
		return "", 0, false
	}
	dotted := m[2] == "."
	if strings.HasSuffix(t.norm, ".") && !dotted {
		return "", 0, false
	}
	if dotted && ctx.dayMonthOrder != "DM" {
		return "", 0, false
	}
	a, _ := strconv.Atoi(m[1])
	b, _ := strconv.Atoi(m[3])
	year := 0
	if m[5] != "" {
		year, _ = strconv.Atoi(m[5])
		if year < 100 {
			year += 2000
		}
	}
	day, month := b, a
	if ctx.dayMonthOrder == "DM" {
		day, month = a, b
	}
	probe := year
	if probe == 0 {
		probe, _, _ = fromISO(ctx.today)
	}
	if !dotted && !isValidDate(probe, month, day) && isValidDate(probe, day, month) {
		day, month = month, day
	}
	date := resolveMonthDay(ctx.today, year, month, day)
	return date, 1, date != ""
}

// ---- times ----

func matchTimeAt(tokens []token, i int, ctx *dateCtx) *timeMatch {
	if tok(tokens, i) == nil {
		return nil
	}
	var best *timeMatch
	consider := func(m *timeMatch) {
		if m != nil && (best == nil || m.to > best.to) {
			best = m
		}
	}
	anyHourSuffix := false
	for _, v := range ctx.vocabs {
		anyHourSuffix = anyHourSuffix || v.HourSuffixH
	}
	for _, v := range ctx.vocabs {
		consider(inHoursAt(tokens, i, v, ctx))
		at := phraseAt(tokens, i, v.AtWords)
		j := i + at
		if n, t, ok := lookupAt(tokens, j, v.TimeWords); ok {
			consider(&timeMatch{time: t, from: i, to: j + n})
		}
		if t, n, ok := clockAt(tokens, j, v, at > 0, anyHourSuffix); ok {
			consider(&timeMatch{time: t, from: i, to: j + n})
		}
	}
	return best
}

func inHoursAt(tokens []token, i int, v *Vocab, ctx *dateCtx) *timeMatch {
	if ctx.now == "" {
		return nil
	}
	inN := phraseAt(tokens, i, v.InWords)
	if inN == 0 {
		return nil
	}
	cn, count, ok := countAt(tokens, i+inN, v)
	if !ok {
		return nil
	}
	un, unit := unitAt(tokens, i+inN+cn, v)
	if un == 0 || unit != "hour" {
		return nil
	}
	var h, m int
	fmt.Sscanf(ctx.now, "%d:%d", &h, &m)
	total := h + count
	return &timeMatch{time: clock(total%24, m), date: addDays(ctx.today, total/24), from: i, to: i + inN + cn + un}
}

var (
	hmRE    = regexp.MustCompile(`^(\d{1,2}):(\d{2})(am|pm|a\.m\.|p\.m\.)?$`)
	hdotmRE = regexp.MustCompile(`^(\d{1,2})\.(\d{2})$`)
	h12RE   = regexp.MustCompile(`^(\d{1,2})(am|pm|a\.m\.|p\.m\.)$`)
	hhRE    = regexp.MustCompile(`^(\d{1,2})h(\d{2})?$`)
	hRE     = regexp.MustCompile(`^(\d{1,2})$`)
)

func meridiem(tokens []token, k int, v *Vocab) (n int, pm, ok bool) {
	if phraseAt(tokens, k, v.Pm) > 0 {
		return 1, true, true
	}
	if phraseAt(tokens, k, v.Am) > 0 {
		return 1, false, true
	}
	return 0, false, false
}

func to24(h int, pm bool) int {
	if h == 12 {
		if pm {
			return 12
		}
		return 0
	}
	if pm {
		return h + 12
	}
	return h
}

func clockAt(tokens []token, j int, v *Vocab, afterAt, hourSuffix bool) (string, int, bool) {
	t := tok(tokens, j)
	if t == nil {
		return "", 0, false
	}
	s := t.norm
	atoi := func(x string) int { n, _ := strconv.Atoi(x); return n }
	hourWord := func(k int) int { return phraseAt(tokens, k, v.HourWords) }
	if m := hmRE.FindStringSubmatch(s); m != nil {
		h, mins := atoi(m[1]), atoi(m[2])
		if mins > 59 {
			return "", 0, false
		}
		an, pm, ok := 0, false, false
		if m[3] != "" {
			pm, ok = strings.HasPrefix(m[3], "p"), true
		} else {
			an, pm, ok = meridiem(tokens, j+1, v)
		}
		if ok {
			if h < 1 || h > 12 {
				return "", 0, false
			}
			return clock(to24(h, pm), mins), 1 + an, true
		}
		if h > 23 {
			return "", 0, false
		}
		return clock(h, mins), 1 + hourWord(j+1), true
	}
	if m := hdotmRE.FindStringSubmatch(s); m != nil {
		h, mins := atoi(m[1]), atoi(m[2])
		hw := hourWord(j + 1)
		if (!afterAt && hw == 0) || h > 23 || mins > 59 {
			return "", 0, false
		}
		return clock(h, mins), 1 + hw, true
	}
	if m := h12RE.FindStringSubmatch(s); m != nil {
		h := atoi(m[1])
		if h < 1 || h > 12 {
			return "", 0, false
		}
		return clock(to24(h, strings.HasPrefix(m[2], "p")), 0), 1, true
	}
	if m := hhRE.FindStringSubmatch(s); m != nil {
		h := atoi(m[1])
		mins := 0
		if m[2] != "" {
			mins = atoi(m[2])
		}
		if h > 23 || mins > 59 {
			return "", 0, false
		}
		if m[2] == "" && !afterAt && !hourSuffix {
			return "", 0, false
		}
		return clock(h, mins), 1, true
	}
	if m := hRE.FindStringSubmatch(s); m != nil {
		h := atoi(m[1])
		if an, pm, ok := meridiem(tokens, j+1, v); ok {
			if h < 1 || h > 12 {
				return "", 0, false
			}
			return clock(to24(h, pm), 0), 1 + an, true
		}
		hw := hourWord(j + 1)
		if (!afterAt && hw == 0) || h > 23 {
			return "", 0, false
		}
		return clock(h, 0), 1 + hw, true
	}
	return "", 0, false
}
