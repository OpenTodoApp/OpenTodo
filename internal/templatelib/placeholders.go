package templatelib

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Placeholders of note templates (OpenSpec change note-templates, design D3):
// {{date}}, {{weekday}}, {{time}} and {{title}}, filled once when a note is
// created from a template. The web app fills them with the same rules
// (web/src/lib/noteTemplates.ts); both run testdata/placeholders.vectors.json.

// placeholderRe matches a placeholder exactly: two braces, a known name, two
// braces, no spaces. Anything else in braces is kept as written.
var placeholderRe = regexp.MustCompile(`\{\{(date|weekday|time|title)\}\}`)

// anyPlaceholderRe finds every {{name}} a template writes (the library check).
var anyPlaceholderRe = regexp.MustCompile(`\{\{([A-Za-z0-9_]+)\}\}`)

// Known reports a placeholder name.
func Known(name string) bool {
	return name == "date" || name == "weekday" || name == "time" || name == "title"
}

// UnknownPlaceholders lists the {{name}} placeholders of text that are not one of the four.
func UnknownPlaceholders(text string) []string {
	var out []string
	for _, m := range anyPlaceholderRe.FindAllStringSubmatch(text, -1) {
		if !Known(m[1]) {
			out = append(out, m[0])
		}
	}
	return out
}

// FillContext is what the placeholders read: the logical day (after the day
// start), the time, the date order and clock of the user's preferences, and
// the interface language for the weekday's name.
type FillContext struct {
	Date   string `json:"date"` // YYYY-MM-DD
	Time   string `json:"time"` // HH:MM
	Order  string `json:"order"`
	Hour12 bool   `json:"hour12"`
	Lang   string `json:"lang"`
}

// Order is the date order of a date_format preference ("system" follows the language).
func Order(dateFormat, lang string) string {
	switch dateFormat {
	case "day-month":
		return "DM"
	case "month-day":
		return "MD"
	case "iso":
		return "YMD"
	}
	switch lang {
	case "en":
		return "MD"
	case "zh":
		return "YMD"
	}
	return "DM"
}

// Hour12 is the clock of a time_format preference ("system" follows the language).
func Hour12(timeFormat, lang string) bool {
	switch timeFormat {
	case "12h":
		return true
	case "24h":
		return false
	}
	return lang == "en"
}

var weekdays = map[string][7]string{
	"en": {"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"},
	"de": {"Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"},
	"es": {"domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"},
	"fr": {"dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"},
	"it": {"domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"},
	"nl": {"zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"},
	"pt": {"domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"},
	"zh": {"星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"},
}

// FormatDate writes a day in the order: 12/11/2026, 11/12/2026 or 2026-11-12.
func FormatDate(day, order string) string {
	if len(day) != 10 {
		return day
	}
	y, m, d := day[:4], day[5:7], day[8:10]
	switch order {
	case "DM":
		return d + "/" + m + "/" + y
	case "MD":
		return m + "/" + d + "/" + y
	}
	return day
}

// FormatTime writes HH:MM on a 24-hour clock, or as 9:05 AM on a 12-hour one.
func FormatTime(hhmm string, hour12 bool) string {
	if !hour12 || len(hhmm) != 5 {
		return hhmm
	}
	h, err := strconv.Atoi(hhmm[:2])
	if err != nil {
		return hhmm
	}
	suffix := "AM"
	if h >= 12 {
		suffix = "PM"
	}
	if h = h % 12; h == 0 {
		h = 12
	}
	return fmt.Sprintf("%d%s %s", h, hhmm[2:], suffix)
}

// Weekday is the day's weekday name in the language (English when unknown).
func Weekday(day, lang string) string {
	t, err := time.Parse(time.DateOnly, day)
	if err != nil {
		return ""
	}
	names, ok := weekdays[lang]
	if !ok {
		names = weekdays["en"]
	}
	return names[t.Weekday()]
}

// Fill fills a template's title and text. In the title, {{title}} reads as
// nothing; in the text it is the filled title.
func Fill(title, text string, c FillContext) (string, string) {
	vals := map[string]string{"date": FormatDate(c.Date, c.Order), "weekday": Weekday(c.Date, c.Lang), "time": FormatTime(c.Time, c.Hour12)}
	repl := func(s string) string {
		return placeholderRe.ReplaceAllStringFunc(s, func(m string) string { return vals[m[2:len(m)-2]] })
	}
	vals["title"] = ""
	t := strings.TrimSpace(strings.Join(strings.Fields(repl(title)), " "))
	vals["title"] = t
	return t, repl(text)
}
