package importer

import (
	"fmt"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

// Chinese Todoist dates ("明天", "11月21日 15:00", "每周五", "每3个月"). The web
// app's quick add has no Chinese vocabulary, so nlpvocab.json has no zh entry
// and the words live here, like everyWords. Chinese writes no spaces between
// words, so this reader scans the text from the left instead of splitting it
// into words. Simplified and Traditional spellings are both read.

// zhFold drops spaces and turns full-width digits and punctuation into ASCII.
var zhFold = strings.NewReplacer(
	" ", "", "　", "", "\t", "",
	"０", "0", "１", "1", "２", "2", "３", "3", "４", "4",
	"５", "5", "６", "6", "７", "7", "８", "8", "９", "9",
	"：", ":", "，", ",", "！", "!",
	"週", "周", "個", "个", "號", "号", "後", "后", "禮", "礼", "兩", "两",
	"點", "点", "時", "时", "從", "从",
)

// zhDayWords are the relative days Todoist shows, longest first.
var zhDayWords = []struct {
	word string
	off  int
}{{"大后天", 3}, {"后天", 2}, {"明天", 1}, {"明日", 1}, {"今天", 0}, {"今日", 0}, {"今晚", 0}}

// zhWeekPrefixes introduce a weekday ("周五", "星期五", "礼拜五").
var zhWeekPrefixes = []string{"星期", "礼拜", "周"}

// zhWeekdayChars name the weekday after a prefix, Monday first.
var zhWeekdayChars = map[rune]int{'一': 0, '二': 1, '三': 2, '四': 3, '五': 4, '六': 5, '日': 6, '天': 6}

// zhAnd joins the weekdays of a list ("周一和周三", "周一、三、五").
var zhAnd = []string{"和", "、", ",", "及", "与", "與", "跟"}

// zhPeriods are the parts of the day before a time; pm adds 12 hours.
var zhPeriods = []struct {
	word string
	pm   bool
}{
	{"凌晨", false}, {"早上", false}, {"早晨", false}, {"上午", false},
	{"中午", true}, {"下午", true}, {"傍晚", true}, {"晚上", true},
}

var zhDigits = map[rune]int{'零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9}

// hasHan reports whether s contains a Chinese character.
func hasHan(s string) bool {
	for _, r := range s {
		if unicode.Is(unicode.Han, r) {
			return true
		}
	}
	return false
}

// zhScan is the unread rest of a Chinese date string.
type zhScan struct{ s string }

// eat consumes the first of words the rest starts with.
func (z *zhScan) eat(words ...string) (string, bool) {
	for _, w := range words {
		if r, ok := strings.CutPrefix(z.s, w); ok {
			z.s = r
			return w, true
		}
	}
	return "", false
}

// num consumes a number in digits ("21") or Chinese numerals up to 99 ("三",
// "十二", "二十一").
func (z *zhScan) num() (int, bool) {
	i := 0
	for i < len(z.s) && z.s[i] >= '0' && z.s[i] <= '9' {
		i++
	}
	if i > 0 {
		n, err := strconv.Atoi(z.s[:i])
		z.s = z.s[i:]
		return n, err == nil
	}
	total, cur, used := 0, 0, 0
	for _, r := range z.s {
		if d, ok := zhDigits[r]; ok {
			cur = d
		} else if r == '十' {
			total += max(cur, 1) * 10
			cur = 0
		} else {
			break
		}
		used += utf8.RuneLen(r)
	}
	if used == 0 {
		return 0, false
	}
	z.s = z.s[used:]
	return total + cur, true
}

// weekday consumes "周五", "星期五", "礼拜五" (bare: "五" after a list separator).
func (z *zhScan) weekday(bare bool) (int, bool) {
	save := z.s
	if _, ok := z.eat(zhWeekPrefixes...); !ok && !bare {
		return 0, false
	}
	r, size := utf8.DecodeRuneInString(z.s)
	if d, ok := zhWeekdayChars[r]; ok {
		z.s = z.s[size:]
		return d, true
	}
	z.s = save
	return 0, false
}

// clock reads the time after a date: "15:00", "下午3点", "下午3:30", "3点半",
// "晚上8点15分", "3pm". An empty rest is no time.
func (z *zhScan) clock(evening bool) (string, bool) {
	z.eat("的")
	if z.s == "" {
		return "", true
	}
	if low := strings.ToLower(z.s); clockAmPm.MatchString(low) {
		return nlpVocabs["en"].clock([]string{low})
	}
	pm, period := evening, evening // "今晚8点" is 20:00
	for _, p := range zhPeriods {
		if _, ok := z.eat(p.word); ok {
			pm, period = p.pm, true
			break
		}
	}
	h, ok := z.num()
	if !ok {
		return "", false
	}
	mi := 0
	if _, colon := z.eat(":"); colon {
		if len(z.s) < 2 || !isNumber(z.s[:2]) {
			return "", false
		}
		mi, _ = strconv.Atoi(z.s[:2])
		z.s = z.s[2:]
	} else if _, ok := z.eat("点", "时"); ok {
		if _, half := z.eat("半"); half {
			mi = 30
		} else if n, ok := z.num(); ok {
			mi = n
			z.eat("分")
		}
	} else {
		return "", false
	}
	switch {
	case period && pm && h < 12:
		h += 12
	case period && !pm && h == 12:
		h = 0
	}
	if z.s != "" || h > 23 || mi > 59 {
		return "", false
	}
	return fmt.Sprintf("%02d:%02d", h, mi), true
}

// zhDate reads "今天", "明天 15:00", "周五", "11月21日", "2026年11月21日 下午3点".
// A weekday alone is its next day after ref, as Todoist shows the coming week.
func zhDate(s string, ref time.Time) (*Due, bool) {
	z := &zhScan{zhFold.Replace(s)}
	date, evening := "", false
	for _, w := range zhDayWords {
		if _, ok := z.eat(w.word); ok {
			date, evening = ref.AddDate(0, 0, w.off).Format("2006-01-02"), w.word == "今晚"
			break
		}
	}
	if date == "" {
		if d, ok := z.weekday(false); ok {
			ahead := (d - (int(ref.Weekday())+6)%7 + 7) % 7
			if ahead == 0 {
				ahead = 7
			}
			date = ref.AddDate(0, 0, ahead).Format("2006-01-02")
		}
	}
	if date == "" {
		year := ref.Year()
		save := z.s
		if n, ok := z.num(); ok && n >= 1000 {
			if n > 9999 {
				return nil, false
			}
			if _, ok := z.eat("年"); !ok {
				return nil, false
			}
			year = n
		} else {
			z.s = save
		}
		mon, ok := z.num()
		if _, unit := z.eat("月"); !ok || !unit {
			return nil, false
		}
		day, ok := z.num()
		if _, unit := z.eat("日", "号"); !ok || !unit {
			return nil, false
		}
		t := time.Date(year, time.Month(mon), day, 0, 0, 0, 0, time.UTC)
		if mon < 1 || mon > 12 || t.Day() != day {
			return nil, false
		}
		date = t.Format("2006-01-02")
	}
	clock, ok := z.clock(evening)
	if !ok {
		return nil, false
	}
	return &Due{Date: date, Time: clock}, true
}

// zhRecurring translates "每周五", "每3个月", "每月1日", "每个工作日" into the English
// recurrence grammar and canonicalises it. A time after the pattern is dropped,
// as in the other languages.
func zhRecurring(s string) (string, bool) {
	z := &zhScan{zhFold.Replace(s)}
	if _, ok := z.eat("每"); !ok {
		return "", false
	}
	every := "every "
	if _, ok := z.eat("!"); ok {
		every = "every! " // repeats from the completion date
	}
	pattern, ok := zhPattern(z)
	if !ok {
		return "", false
	}
	z.eat("开始", "起")
	if _, ok := z.clock(false); !ok {
		return "", false
	}
	rule, err := parseRecurrence(every+pattern, "")
	return rule, err == nil && rule != ""
}

// zhPattern reads what follows "每" and returns it in the English grammar.
func zhPattern(z *zhScan) (string, bool) {
	z.eat("一") // "每一天", "每一周"
	if _, ok := z.eat("个工作日", "工作日"); ok {
		return "weekday", true
	}
	if _, ok := z.eat("周末"); ok {
		return "saturday, sunday", true
	}
	if strings.HasPrefix(z.s, "个星期") || strings.HasPrefix(z.s, "个礼拜") {
		z.s = strings.TrimPrefix(z.s, "个") // "每个星期五"
	}
	if days, ok := zhWeekdays(z); ok {
		return days, true
	}
	if _, ok := z.eat("天", "日"); ok {
		return "day", true
	}
	if _, ok := z.eat("星期", "礼拜", "周"); ok {
		return "week", true
	}
	if _, ok := z.eat("个月", "月"); ok {
		return zhMonthly(z)
	}
	if _, ok := z.eat("年"); ok {
		return "year", true // "每年11月21日" names a day the grammar cannot repeat on
	}
	n, ok := z.num()
	if !ok {
		return "", false
	}
	switch {
	case eats(z, "天", "日"):
		return fmt.Sprintf("%d days", n), true
	case eats(z, "个星期", "个礼拜", "星期", "礼拜", "周"):
		z.eat("的")
		if days, ok := zhWeekdays(z); ok {
			return fmt.Sprintf("%d weeks on %s", n, days), true
		}
		return fmt.Sprintf("%d weeks", n), true
	case eats(z, "个月", "月"):
		return fmt.Sprintf("%d months", n), true
	case eats(z, "年"):
		return fmt.Sprintf("%d years", n), true
	}
	return "", false
}

func eats(z *zhScan, words ...string) bool {
	_, ok := z.eat(words...)
	return ok
}

// zhWeekdays reads a weekday list: "周五", "周一和周三", "周一、三、五".
func zhWeekdays(z *zhScan) (string, bool) {
	d, ok := z.weekday(false)
	if !ok {
		return "", false
	}
	names := []string{englishWeekdays[d]}
	for {
		save := z.s
		sep := eats(z, zhAnd...)
		if d, ok := z.weekday(sep); ok {
			names = append(names, englishWeekdays[d])
			continue
		}
		z.s = save
		return strings.Join(names, " and "), true
	}
}

// zhMonthly reads what may follow "每月": "1日", "最后一天", "第一个周一",
// "最后一个周五"; nothing more is every month.
func zhMonthly(z *zhScan) (string, bool) {
	z.eat("的")
	if eats(z, "最后一天", "最后1天") {
		return "last day", true
	}
	ord := ""
	switch {
	case eats(z, "最后一个", "最后1个", "最后"):
		ord = "last"
	case eats(z, "第"):
		n, ok := z.num()
		if !ok || n < 1 || n > 4 {
			return "", false
		}
		z.eat("个")
		ord = strconv.Itoa(n) + ordinalSuffixEN(n)
	}
	if ord != "" {
		d, ok := z.weekday(false)
		if !ok {
			return "", false
		}
		return ord + " " + englishWeekdays[d], true
	}
	save := z.s
	if n, ok := z.num(); ok {
		if eats(z, "日", "号") && n >= 1 && n <= 31 {
			return strconv.Itoa(n) + ordinalSuffixEN(n), true
		}
		z.s = save
	}
	return "month", true
}

// ordinalSuffixEN gives the English suffix the grammar reads (1st, 2nd, 21st).
func ordinalSuffixEN(n int) string {
	if n%100 >= 11 && n%100 <= 13 {
		return "th"
	}
	switch n % 10 {
	case 1:
		return "st"
	case 2:
		return "nd"
	case 3:
		return "rd"
	}
	return "th"
}
