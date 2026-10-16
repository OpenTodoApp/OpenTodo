package mail

import (
	"strconv"
	"strings"
	"time"
)

// The weekly digest (OpenSpec change `stats-and-review`, design D6–D7): the one
// kind that carries entity content (task and project names). It is refused for
// accounts with end-to-end encryption before anything is rendered.

// DigestItem is one listed task.
type DigestItem struct {
	Title string
	// Due is the due date, YYYY-MM-DD.
	Due string
	// Project is the project's name, "" for the Inbox.
	Project string
}

// DigestVars are the digest's numbers and lists, built by internal/digest.
type DigestVars struct {
	// WeekStart and WeekEnd are the covered week's first and last day, YYYY-MM-DD.
	WeekStart, WeekEnd                string
	Completed, Created, Late, Slipped int
	Overdue, Ahead                    []DigestItem
	OverdueMore, AheadMore, IdleMore  int
	Idle                              []string
	// LastReview is the local day of the last finished review, "" when never.
	LastReview string
}

// Digest list limits (email-digest "Digest content").
const (
	DigestMaxTasks    = 15
	DigestMaxProjects = 10
)

// digestPlaceholders are the variables only digest templates may use.
var digestPlaceholders = []string{"Week", "Completed", "Created", "Late", "Slipped", "Overdue", "Ahead", "Idle", "LastReview"}

var weekdayNames = map[string][7]string{
	"en": {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"},
	"de": {"So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."},
	"fr": {"dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."},
	"es": {"dom", "lun", "mar", "mié", "jue", "vie", "sáb"},
	"it": {"dom", "lun", "mar", "mer", "gio", "ven", "sab"},
	"pt": {"dom", "seg", "ter", "qua", "qui", "sex", "sáb"},
}

var monthNames = map[string][12]string{
	"en": {"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"},
	"de": {"Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."},
	"fr": {"janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."},
	"es": {"ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"},
	"it": {"gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"},
	"pt": {"jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"},
}

var digestWords = map[string]struct{ inbox, nothing, more, never string }{
	"en": {"Inbox", "Nothing.", "and %d more", "never"},
	"de": {"Eingang", "Nichts.", "und %d weitere", "noch nie"},
	"fr": {"Boîte de réception", "Rien.", "et %d de plus", "jamais"},
	"es": {"Bandeja de entrada", "Nada.", "y %d más", "nunca"},
	"it": {"In arrivo", "Niente.", "e altri %d", "mai"},
	"pt": {"Caixa de entrada", "Nada.", "e mais %d", "nunca"},
}

// FormatDay writes a YYYY-MM-DD date as weekday, day and month in a language
// ("Fri 23 Oct", "Fr. 23. Okt."), unambiguous without a numeric date format.
func FormatDay(iso, lang string) string {
	t, err := time.Parse("2006-01-02", iso)
	if err != nil {
		return iso
	}
	wd, ok := weekdayNames[lang]
	if !ok {
		lang, wd = "en", weekdayNames["en"]
	}
	d := strconv.Itoa(t.Day())
	if lang == "de" {
		d += "."
	}
	return wd[t.Weekday()] + " " + d + " " + monthNames[lang][t.Month()-1]
}

// oneLine keeps a title on one line and bounded.
func oneLine(s string) string {
	s = strings.Join(strings.Fields(s), " ")
	if r := []rune(s); len(r) > 120 {
		s = string(r[:119]) + "…"
	}
	return s
}

func digestList(lines []string, more int, lang string) string {
	w := digestWords[lang]
	if len(lines) == 0 {
		return "  " + w.nothing
	}
	var b strings.Builder
	for i, l := range lines {
		if i > 0 {
			b.WriteString("\n")
		}
		b.WriteString("  - " + l)
	}
	if more > 0 {
		b.WriteString("\n  " + strings.Replace(w.more, "%d", strconv.Itoa(more), 1))
	}
	return b.String()
}

func digestItems(items []DigestItem, more int, lang string) string {
	w := digestWords[lang]
	lines := make([]string, 0, len(items))
	for _, it := range items {
		project := it.Project
		if project == "" {
			project = w.inbox
		}
		lines = append(lines, oneLine(it.Title)+" · "+FormatDay(it.Due, lang)+" · "+oneLine(project))
	}
	return digestList(lines, more, lang)
}

// digestValues fills the digest placeholders for one language.
func digestValues(d *DigestVars, lang string) map[string]string {
	if d == nil {
		d = &DigestVars{}
	}
	idle := make([]string, 0, len(d.Idle))
	for _, n := range d.Idle {
		idle = append(idle, oneLine(n))
	}
	last := digestWords[lang].never
	if d.LastReview != "" {
		last = FormatDay(d.LastReview, lang)
	}
	return map[string]string{
		"Week":       FormatDay(d.WeekStart, lang) + " – " + FormatDay(d.WeekEnd, lang),
		"Completed":  strconv.Itoa(d.Completed),
		"Created":    strconv.Itoa(d.Created),
		"Late":       strconv.Itoa(d.Late),
		"Slipped":    strconv.Itoa(d.Slipped),
		"Overdue":    digestItems(d.Overdue, d.OverdueMore, lang),
		"Ahead":      digestItems(d.Ahead, d.AheadMore, lang),
		"Idle":       digestList(idle, d.IdleMore, lang),
		"LastReview": last,
	}
}
