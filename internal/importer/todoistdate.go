package importer

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Todoist writes a task's date into its CSV export as the text the user saw, in
// the user's language and often without a year ("21 Okt.", "Oct 21 3:00 PM",
// "every monday", "jeden Montag"). This reader understands those forms (OpenSpec
// change named-importers, design D7) with the month, weekday and day-word
// vocabulary of the web app's quick add, exported to nlpvocab.json by
// web/src/lib/nlp/vocabExport.test.ts.

//go:embed nlpvocab.json
var nlpVocabJSON []byte

type nlpVocab struct {
	DayMonthOrder string         `json:"dayMonthOrder"`
	DayWords      map[string]int `json:"dayWords"`
	Weekdays      [][]string     `json:"weekdays"`
	Months        []struct {
		Names []string `json:"names"`
		Abbr  []string `json:"abbr"`
	} `json:"months"`
	Units struct {
		Day   []string `json:"day"`
		Week  []string `json:"week"`
		Month []string `json:"month"`
	} `json:"units"`
	OfWords   []string `json:"ofWords"`
	AtWords   []string `json:"atWords"`
	HourWords []string `json:"hourWords"`
	AM        []string `json:"am"`
	PM        []string `json:"pm"`
}

var nlpVocabs = func() map[string]*nlpVocab {
	var m map[string]*nlpVocab
	if err := json.Unmarshal(nlpVocabJSON, &m); err != nil {
		panic("importer: nlpvocab.json: " + err.Error())
	}
	return m
}()

// everyWords start a recurring phrase, per language; they are not part of the
// quick-add vocabulary, which does not parse recurrence (yet).
var everyWords = map[string][]string{
	"en": {"every", "each", "ev"},
	"de": {"jeden", "jede", "jedes", "alle"},
	"fr": {"chaque", "tous les", "toutes les"},
	"it": {"ogni"},
	"es": {"cada", "todos los", "todas las"},
	"pt": {"cada", "todos os", "todas as", "toda", "todo"},
}

var englishWeekdays = []string{"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"}

// diacritics folds the accented letters of the six vocabularies (no Unicode
// normalisation dependency; the vocabularies are written in these scripts only).
var diacritics = strings.NewReplacer(
	"à", "a", "á", "a", "â", "a", "ã", "a", "ä", "a", "å", "a", "ç", "c",
	"è", "e", "é", "e", "ê", "e", "ë", "e", "ì", "i", "í", "i", "î", "i", "ï", "i",
	"ñ", "n", "ò", "o", "ó", "o", "ô", "o", "õ", "o", "ö", "o",
	"ù", "u", "ú", "u", "û", "u", "ü", "u", "ý", "y", "ÿ", "y", "ß", "ss",
	"‘", "'", "’", "'", "ʼ", "'",
)

// foldWord matches web/src/lib/nlp/vocab normalize(): lower case, no diacritics,
// "ß" → "ss", trailing commas and semicolons dropped.
func foldWord(s string) string {
	return strings.TrimRight(diacritics.Replace(strings.ToLower(s)), ",;")
}

var (
	clockRe    = regexp.MustCompile(`^(\d{1,2})(?::(\d{2}))?$`)
	clockAmPm  = regexp.MustCompile(`^(\d{1,2})(?::(\d{2}))?(am|pm|a\.m\.|p\.m\.)$`)
	yearRe     = regexp.MustCompile(`^\d{4}$`)
	dayNumRe   = regexp.MustCompile(`^(\d{1,2})\.?$`)
	numericISO = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}`)
)

// todoistDate reads a Todoist date string. It returns the due value, a canonical
// recurrence rule for recurring phrases, or an error when the text is not
// understood. ref supplies the year for dates written without one (the export
// date) and the base for relative words.
func todoistDate(text, lang string, ref time.Time) (*Due, string, error) {
	s := strings.TrimSpace(text)
	if s == "" {
		return nil, "", nil
	}
	if numericISO.MatchString(s) {
		d, err := parseDue(s, ref.Location())
		return d, "", err
	}
	order := []string{}
	if lang = strings.ToLower(strings.TrimSpace(lang)); lang != "" {
		if i := strings.IndexAny(lang, "-_"); i > 0 {
			lang = lang[:i]
		}
		if _, ok := nlpVocabs[lang]; ok {
			order = append(order, lang)
		}
	}
	for _, c := range []string{"en", "de", "fr", "it", "es", "pt"} {
		if len(order) == 0 || order[0] != c {
			order = append(order, c)
		}
	}
	for _, code := range order {
		v := nlpVocabs[code]
		if rule, ok := v.recurring(code, s); ok {
			return nil, rule, nil
		}
		if d, ok := v.date(s, ref); ok {
			return d, "", nil
		}
	}
	return nil, "", fmt.Errorf("date %q not understood", s)
}

func (v *nlpVocab) month(tok string) (int, bool) {
	t := strings.TrimSuffix(tok, ".")
	for i, m := range v.Months {
		for _, n := range m.Names {
			if t == n {
				return i + 1, true
			}
		}
		for _, a := range m.Abbr {
			if t == strings.TrimSuffix(a, ".") {
				return i + 1, true
			}
		}
	}
	return 0, false
}

func (v *nlpVocab) weekday(tok string) (int, bool) {
	for i, names := range v.Weekdays {
		for _, n := range names {
			if tok == n || tok == strings.TrimSuffix(n, ".") {
				return i, true
			}
		}
	}
	return 0, false
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

// clock reads the time tokens that may follow a date ("15:00", "3:00 pm", "3pm",
// "15 uhr", "um 15:00"). ok is false when tokens remain that are not a time.
func (v *nlpVocab) clock(toks []string) (string, bool) {
	for {
		switch {
		case len(toks) > 0 && (contains(v.AtWords, toks[0]) || toks[0] == "@"):
			toks = toks[1:]
			continue
		case len(toks) > 1 && contains(v.AtWords, toks[0]+" "+toks[1]):
			toks = toks[2:]
			continue
		}
		break
	}
	if len(toks) == 0 {
		return "", true
	}
	join := strings.Join(toks, "")
	if m := clockAmPm.FindStringSubmatch(join); m != nil {
		h, _ := strconv.Atoi(m[1])
		mi := 0
		if m[2] != "" {
			mi, _ = strconv.Atoi(m[2])
		}
		if h < 1 || h > 12 || mi > 59 {
			return "", false
		}
		if strings.HasPrefix(m[3], "p") && h != 12 {
			h += 12
		}
		if strings.HasPrefix(m[3], "a") && h == 12 {
			h = 0
		}
		return fmt.Sprintf("%02d:%02d", h, mi), true
	}
	if len(toks) == 2 && (contains(v.HourWords, toks[1]) || contains(v.PM, toks[1]) || contains(v.AM, toks[1])) {
		h, err := strconv.Atoi(strings.TrimSuffix(toks[0], ":00"))
		if err != nil || h > 23 {
			return "", false
		}
		if contains(v.PM, toks[1]) && h < 12 {
			h += 12
		}
		return fmt.Sprintf("%02d:00", h), true
	}
	if len(toks) == 1 {
		if m := clockRe.FindStringSubmatch(toks[0]); m != nil && m[2] != "" {
			h, _ := strconv.Atoi(m[1])
			mi, _ := strconv.Atoi(m[2])
			if h <= 23 && mi <= 59 {
				return fmt.Sprintf("%02d:%02d", h, mi), true
			}
		}
	}
	return "", false
}

// date reads "21 Okt.", "21. Oktober 2027 15:00", "Oct 21", "Oct 21 2027 3:00 PM",
// "today" / "morgen" (with an optional time).
func (v *nlpVocab) date(s string, ref time.Time) (*Due, bool) {
	var toks []string
	for _, f := range strings.Fields(s) {
		toks = append(toks, foldWord(f))
	}
	if len(toks) == 0 {
		return nil, false
	}
	// Relative words ("today", "tomorrow", "day after tomorrow").
	for n := 3; n >= 1; n-- {
		if len(toks) < n {
			continue
		}
		if off, ok := v.DayWords[strings.Join(toks[:n], " ")]; ok {
			t, ok := v.clock(toks[n:])
			if !ok {
				return nil, false
			}
			return &Due{Date: ref.AddDate(0, 0, off).Format("2006-01-02"), Time: t}, true
		}
	}
	if len(toks) < 2 {
		return nil, false
	}
	var day, mon int
	var ok bool
	rest := toks
	if m := dayNumRe.FindStringSubmatch(toks[0]); m != nil {
		at := 1
		if len(toks) > 2 && contains(v.OfWords, toks[1]) {
			at = 2 // "21 de octubre"
		}
		if mon, ok = v.month(toks[at]); !ok {
			return nil, false
		}
		day, _ = strconv.Atoi(m[1])
		rest = toks[at+1:]
		if len(rest) > 1 && contains(v.OfWords, rest[0]) && yearRe.MatchString(rest[1]) {
			rest = rest[1:] // "21 de octubre de 2027"
		}
	} else if mon, ok = v.month(toks[0]); ok {
		m := dayNumRe.FindStringSubmatch(strings.TrimRight(toks[1], ","))
		if m == nil {
			return nil, false
		}
		day, _ = strconv.Atoi(m[1])
		rest = toks[2:]
	} else {
		return nil, false
	}
	year := ref.Year()
	if len(rest) > 0 && yearRe.MatchString(strings.TrimRight(rest[0], ",")) {
		year, _ = strconv.Atoi(strings.TrimRight(rest[0], ","))
		rest = rest[1:]
	}
	clock, ok := v.clock(rest)
	if !ok {
		return nil, false
	}
	t := time.Date(year, time.Month(mon), day, 0, 0, 0, 0, time.UTC)
	if t.Day() != day || t.Month() != time.Month(mon) {
		return nil, false
	}
	return &Due{Date: t.Format("2006-01-02"), Time: clock}, true
}

// recurring translates a localised "every …" phrase into the English recurrence
// grammar and canonicalises it.
func (v *nlpVocab) recurring(code, s string) (string, bool) {
	low := strings.Join(strings.Fields(foldWord(s)), " ")
	var rest string
	found := false
	for _, w := range everyWords[code] {
		if r, ok := strings.CutPrefix(low, foldWord(w)+" "); ok {
			rest, found = r, true
			break
		}
		if r, ok := strings.CutPrefix(low, foldWord(w)+"! "); ok && code == "en" {
			rest, found = "! "+r, true
			break
		}
	}
	if !found {
		return "", false
	}
	if code == "en" {
		rule, err := parseRecurrence("every "+strings.TrimPrefix(rest, "! "), "")
		if strings.HasPrefix(rest, "! ") {
			rule, err = parseRecurrence("every! "+strings.TrimPrefix(rest, "! "), "")
		}
		return rule, err == nil && rule != ""
	}
	var out []string
	for _, tok := range strings.Fields(rest) {
		tok = strings.TrimRight(tok, ",")
		switch {
		case func() bool { _, ok := v.weekday(tok); return ok }():
			i, _ := v.weekday(tok)
			out = append(out, englishWeekdays[i])
		case contains(v.Units.Day, tok):
			out = append(out, unitWord("day", out))
		case contains(v.Units.Week, tok):
			out = append(out, unitWord("week", out))
		case contains(v.Units.Month, tok):
			out = append(out, unitWord("month", out))
		case isNumber(tok):
			out = append(out, tok)
		case tok == "und" || tok == "et" || tok == "e" || tok == "y":
			out = append(out, "and")
		default:
			if m, ok := v.month(tok); ok {
				out = append(out, strings.ToLower(time.Month(m).String()))
				continue
			}
			if t, ok := v.clock([]string{tok}); ok && t != "" {
				out = append(out, "at", t)
				continue
			}
			return "", false
		}
	}
	rule, err := parseRecurrence("every "+strings.Join(out, " "), "")
	return rule, err == nil && rule != ""
}

// unitWord pluralises a unit after a number ("2 weeks").
func unitWord(unit string, before []string) string {
	if n := len(before); n > 0 && isNumber(before[n-1]) && before[n-1] != "1" {
		return unit + "s"
	}
	return unit
}

func isNumber(s string) bool {
	_, err := strconv.Atoi(s)
	return err == nil
}
