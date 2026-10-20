// Package quickadd is the Go port of the web app's quick-add parser
// (web/src/lib/nlp, OpenSpec change quick-add-recurrence, design D5): dates and
// times, #project @label p1 +30m, recurrence and reminder phrases, in six
// languages. Pure functions over strings and calendar days; the standard
// library only. Shared vectors (web/src/lib/nlp/quickadd.vectors.json) and the
// shared vocabulary file (vocab.json, written by `npm run nlp:vocab`) keep the
// two ports identical.
package quickadd

import (
	_ "embed"
	"encoding/json"
	"strings"
	"unicode"
)

//go:embed vocab.json
var vocabJSON []byte

// Vocab is one language's vocabulary; every phrase is already folded by normalize.
type Vocab struct {
	Code          string            `json:"code"`
	DayMonthOrder string            `json:"dayMonthOrder"`
	DayWords      map[string]int    `json:"dayWords"`
	Weekdays      [][]string        `json:"weekdays"`
	Months        []MonthVocab      `json:"months"`
	Before        []string          `json:"before"`
	DeadlineWords []string          `json:"deadlineWords"`
	SomedayWords  []string          `json:"somedayWords"`
	EveningWords  []string          `json:"eveningWords"`
	NextBefore    []string          `json:"nextBefore"`
	NextAfter     []string          `json:"nextAfter"`
	ThisBefore    []string          `json:"thisBefore"`
	InWords       []string          `json:"inWords"`
	OneWords      []string          `json:"oneWords"`
	Units         Units             `json:"units"`
	OfWords       []string          `json:"ofWords"`
	AtWords       []string          `json:"atWords"`
	HourWords     []string          `json:"hourWords"`
	HourSuffixH   bool              `json:"hourSuffixH"`
	TimeWords     map[string]string `json:"timeWords"`
	Am            []string          `json:"am"`
	Pm            []string          `json:"pm"`
	Every         []string          `json:"every"`
	EveryOne      map[string]string `json:"everyOne"`
	WeekdayAll    []string          `json:"weekdayAll"`
	Ordinals      map[string]int    `json:"ordinals"`
	// OrdinalArticles, OrdinalOf, OfMonthWords and OrdinalsBeforeWeekday serve the
	// ordinal weekdays (quick-add-nth-weekday D4).
	OrdinalArticles       []string       `json:"ordinalArticles"`
	OrdinalOf             []string       `json:"ordinalOf"`
	OfMonthWords          []string       `json:"ofMonthWords"`
	OrdinalsBeforeWeekday map[string]int `json:"ordinalsBeforeWeekday"`
	AndWords              []string       `json:"andWords"`
	AfterCompl            []string       `json:"afterCompletion"`
	UntilWords            []string       `json:"untilWords"`
	TimesWords            struct {
		Before []string `json:"before"`
		After  []string `json:"after"`
	} `json:"timesWords"`
	RemindWords []string `json:"remindWords"`
	BeforeWords []string `json:"beforeWords"`
	AfterWords  []string `json:"afterWords"`
}

// MonthVocab holds a month's full names and abbreviations.
type MonthVocab struct {
	Names []string `json:"names"`
	Abbr  []string `json:"abbr"`
}

// Units holds unit words.
type Units struct {
	Minute []string `json:"minute"`
	Hour   []string `json:"hour"`
	Day    []string `json:"day"`
	Week   []string `json:"week"`
	Month  []string `json:"month"`
	Year   []string `json:"year"`
}

// Vocabularies are the bundled languages, keyed by primary subtag.
var Vocabularies = func() map[string]*Vocab {
	var m map[string]*Vocab
	if err := json.Unmarshal(vocabJSON, &m); err != nil {
		panic("quickadd: vocab.json: " + err.Error())
	}
	return m
}()

// Bundled lists the bundled language codes in the web app's order.
var Bundled = []string{"en", "de", "fr", "it", "es", "pt"}

// ActiveLanguages reduces preferred tags ("de-CH", "ja") to bundled codes in
// order, always ending with English.
func ActiveLanguages(preferred []string) []string {
	var out []string
	for _, tag := range preferred {
		code := strings.ToLower(tag)
		if i := strings.IndexAny(code, "-_"); i >= 0 {
			code = code[:i]
		}
		if _, ok := Vocabularies[code]; ok && !contains(out, code) {
			out = append(out, code)
		}
	}
	if !contains(out, "en") {
		out = append(out, "en")
	}
	return out
}

func vocabsFor(languages []string) []*Vocab {
	var out []*Vocab
	for _, c := range ActiveLanguages(languages) {
		out = append(out, Vocabularies[c])
	}
	return out
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

var fold = map[rune]string{
	'à': "a", 'á': "a", 'â': "a", 'ã': "a", 'ä': "a", 'å': "a", 'ā': "a",
	'ç': "c", 'è': "e", 'é': "e", 'ê': "e", 'ë': "e", 'ē': "e",
	'ì': "i", 'í': "i", 'î': "i", 'ï': "i", 'ñ': "n",
	'ò': "o", 'ó': "o", 'ô': "o", 'õ': "o", 'ö': "o", 'ō': "o",
	'ù': "u", 'ú': "u", 'û': "u", 'ü': "u", 'ū': "u", 'ý': "y", 'ÿ': "y",
	'ß': "ss", '‘': "'", '’': "'", 'ʼ': "'",
}

// normalize folds a word like the web app: lower case, no diacritics, ß → ss,
// typographic apostrophes → ', trailing commas and semicolons dropped.
func normalize(word string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(word) {
		if unicode.Is(unicode.Mn, r) {
			continue
		}
		if f, ok := fold[r]; ok {
			b.WriteString(f)
			continue
		}
		b.WriteRune(r)
	}
	return strings.TrimRight(b.String(), ",;")
}
