package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf16"
	"unicode/utf8"

	"github.com/pixari/opentodo/internal/e2ee"
	"github.com/pixari/opentodo/internal/mail"
	"github.com/pixari/opentodo/internal/origin"
	"github.com/pixari/opentodo/internal/quickadd"
)

// Quick-add parse (OpenSpec change extension-v2, design D1): one read route that
// runs the app's quick-add grammar (the Go port pinned by the shared vectors)
// with the account's languages, date order, week start, projects and labels, so
// a client without the web parser (the browser extension) previews and saves a
// line like the app does. It writes nothing, so every token scope may call it.

const (
	// parseMaxLine is the longest line the route reads, in characters.
	parseMaxLine = 2000
	// parsesPerMinute is the per-account limit (design D1).
	parsesPerMinute = 60
	parsePath       = "/api/v1/quick-add/parse"
)

func (s *Server) registerQuickAddRoutes(mux *routes) {
	s.parseLimiter = newRateLimiter(parsesPerMinute, time.Minute)
	mux.handle("POST "+parsePath, signedIn, s.handleQuickAddParse)
}

type parseRequest struct {
	Line  *string `json:"line"`
	URL   string  `json:"url"`
	Today string  `json:"today"`
	Now   string  `json:"now"`
}

// parseLabel is a label the line names: id is absent when no label has that name.
type parseLabel struct {
	ID   string `json:"id,omitempty"`
	Name string `json:"name"`
}

// parseReminder is a reminder as POST /api/v1/reminders takes it once the task
// exists: relative to the due, or an absolute floating date and time the client
// turns into a moment in its own zone (as `ot add --natural` does).
type parseReminder struct {
	Kind          string `json:"kind"` // relative | absolute
	OffsetMinutes *int   `json:"offset_minutes,omitempty"`
	Date          string `json:"date,omitempty"`
	Time          string `json:"time,omitempty"`
}

// parseChip is one preview chip: its kind, its text in the account's language and
// the part of the line it comes from, in UTF-16 code units like a browser's string.
type parseChip struct {
	Kind  string `json:"kind"`
	Text  string `json:"text"`
	Start int    `json:"start"`
	End   int    `json:"end"`
}

type parseResponse struct {
	Title     string         `json:"title"`
	Fields    map[string]any `json:"fields"`
	Chips     []parseChip    `json:"chips"`
	Unmatched []string       `json:"unmatched"`
	Origin    *origin.Origin `json:"origin"`
}

var (
	dateRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	timeRe = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`)
)

func (s *Server) handleQuickAddParse(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	var in parseRequest
	if err := readJSON(r, &in); err != nil || in.Line == nil {
		writeError(w, http.StatusBadRequest, "invalid_input", "the body must be an object with a line")
		return
	}
	if utf8.RuneCountInString(*in.Line) > parseMaxLine {
		writeError(w, http.StatusBadRequest, "invalid_input", fmt.Sprintf("line: at most %d characters", parseMaxLine))
		return
	}
	if in.Today != "" && !dateRe.MatchString(in.Today) {
		writeError(w, http.StatusBadRequest, "invalid_input", "today: must be a date YYYY-MM-DD")
		return
	}
	if in.Now != "" && !timeRe.MatchString(in.Now) {
		writeError(w, http.StatusBadRequest, "invalid_input", "now: must be a time HH:MM")
		return
	}
	if !s.parseLimiter.allow(u.ID) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many parse requests, try again in a minute")
		return
	}
	acct, err := s.parseAccount(r.Context(), u.ID, r.Header.Get("Accept-Language"))
	if err != nil {
		s.internal(w, err)
		return
	}
	today, now := in.Today, in.Now
	if today == "" || now == "" {
		t := time.Now().In(acct.loc)
		if today == "" {
			today = t.Format(time.DateOnly)
		}
		if now == "" {
			now = t.Format("15:04")
		}
	}
	out := parseLine(*in.Line, acct, today, now)
	if strings.TrimSpace(in.URL) != "" {
		if o, err := origin.FromURL(in.URL, ""); err == nil {
			out.Origin = &o
		}
	}
	writeJSON(w, http.StatusOK, out)
}

// parseAccount is what a parse needs from the account: languages, date order,
// week start, projects and labels, the language chips are written in, and the
// zone `today` and `now` default to.
type parseAccountData struct {
	ctx    quickadd.Context
	labels map[string]string // folded name → id
	names  map[string]string // project id → name
	lang   string
	loc    *time.Location
}

func (s *Server) parseAccount(ctx context.Context, uid, acceptLanguage string) (parseAccountData, error) {
	a := parseAccountData{labels: map[string]string{}, names: map[string]string{}, loc: time.UTC}
	prefs, err := s.sync.Get(ctx, uid, "user_prefs", "me")
	if err != nil {
		return a, err
	}
	var langs []string
	if l := idOf(prefs["language"]); l != "" && l != "system" {
		langs = append(langs, l)
	}
	langs = append(langs, acceptedLanguages(acceptLanguage)...)
	a.ctx.Languages = quickadd.ActiveLanguages(langs)
	a.lang = a.ctx.Languages[0]
	switch idOf(prefs["date_format"]) {
	case "day-month":
		a.ctx.DayMonthOrder = "DM"
	case "month-day":
		a.ctx.DayMonthOrder = "MD"
	}
	if ws, ok := map[string]int{"mon": 1, "sun": 0, "sat": 6}[idOf(prefs["week_start"])]; ok {
		a.ctx.WeekStart = &ws
	}
	// The zone the account's devices last reported: the email digest keeps one.
	if st, err := s.digestStore().Get(ctx, uid); err == nil && st.TimeZone != "" {
		if l, err := time.LoadLocation(st.TimeZone); err == nil {
			a.loc = l
		}
	}
	projects, err := s.sync.List(ctx, uid, "project", false)
	if err != nil {
		return a, err
	}
	for _, p := range projects {
		name := idOf(p["name"])
		if name == "" || e2ee.IsCiphertext(name) {
			continue // an encrypted name cannot be matched on the server
		}
		var archived bool
		_ = json.Unmarshal(p["archived"], &archived)
		a.ctx.Projects = append(a.ctx.Projects, quickadd.Project{ID: idOf(p["id"]), Name: name, Archived: archived, ParentID: idOf(p["parent_id"])})
		a.names[idOf(p["id"])] = name
	}
	labels, err := s.sync.List(ctx, uid, "label", false)
	if err != nil {
		return a, err
	}
	for _, l := range labels {
		if name := idOf(l["name"]); name != "" && !e2ee.IsCiphertext(name) {
			a.labels[strings.ToLower(name)] = idOf(l["id"])
		}
	}
	return a, nil
}

// acceptedLanguages lists the language tags of an Accept-Language header in its order.
func acceptedLanguages(h string) []string {
	var out []string
	for _, part := range strings.Split(h, ",") {
		tag := strings.TrimSpace(strings.SplitN(part, ";", 2)[0])
		if tag != "" && tag != "*" {
			out = append(out, tag)
		}
	}
	return out
}

// parseLine is the route's answer for one line in a known context: the handler
// and the shared-vector test both go through it.
func parseLine(line string, a parseAccountData, today, now string) parseResponse {
	ctx := a.ctx
	ctx.Today, ctx.Now = today, now
	r, marks := quickadd.ParseMarked(line, ctx)
	fields := map[string]any{}
	if r.Due != nil {
		d := map[string]string{"date": r.Due.Date}
		if r.Due.Time != "" {
			d["time"] = r.Due.Time
		}
		fields["due"] = d
	}
	if r.Deadline != "" {
		fields["deadline"] = r.Deadline
	}
	if r.Someday {
		fields["start"] = "someday"
	}
	if r.Evening {
		fields["evening"] = true
	}
	if r.ProjectID != "" {
		fields["project_id"] = r.ProjectID
	}
	if len(r.Labels) > 0 {
		ls := make([]parseLabel, 0, len(r.Labels))
		for _, name := range r.Labels {
			ls = append(ls, parseLabel{ID: a.labels[strings.ToLower(name)], Name: name})
		}
		fields["labels"] = ls
	}
	if r.Priority > 0 {
		fields["priority"] = r.Priority
	}
	if r.EstimateMinutes > 0 {
		fields["estimate_minutes"] = r.EstimateMinutes
	}
	if r.SpentMinutes > 0 {
		fields["spent_minutes"] = r.SpentMinutes
	}
	if r.Recurrence != "" {
		fields["recurrence"] = r.Recurrence
	}
	if len(r.Reminders) > 0 {
		dueDate, dueTime := "", ""
		if r.Due != nil {
			dueDate, dueTime = r.Due.Date, r.Due.Time
		}
		rs := make([]parseReminder, 0, len(r.Reminders))
		for _, rem := range r.Reminders {
			res := quickadd.Resolve(rem, dueDate, dueTime, today, now)
			if res.Relative {
				off := res.OffsetMinutes
				rs = append(rs, parseReminder{Kind: "relative", OffsetMinutes: &off})
			} else {
				rs = append(rs, parseReminder{Kind: "absolute", Date: res.Date, Time: res.Time})
			}
		}
		fields["reminders"] = rs
	}
	return parseResponse{Title: r.Title, Fields: fields, Chips: chipsOf(line, r, marks, a), Unmatched: unmatchedOf(r.Title), Origin: nil}
}

// unmatchedOf lists the #name tokens left in the title: projects the line names
// that do not exist (a quoted #name is literal and stays out).
func unmatchedOf(title string) []string {
	out := []string{}
	for _, w := range strings.Fields(title) {
		if len(w) > 1 && w[0] == '#' {
			out = append(out, w)
		}
	}
	return out
}

// chipsOf turns the marks into chips in the account's language. The date and its
// time make one chip, so do the estimate and the time already spent.
func chipsOf(line string, r quickadd.Result, marks []quickadd.Mark, a parseAccountData) []parseChip {
	w := parseWordsFor(a.lang)
	chips := []parseChip{}
	labels := 0
	for _, m := range marks {
		c := parseChip{Kind: m.Kind, Start: utf16Index(line, m.Span.Start), End: utf16Index(line, m.Span.End)}
		switch m.Kind {
		case "date":
			if r.Due == nil {
				continue
			}
			c.Kind, c.Text = "due", dueText(r.Due, a.lang)
		case "time":
			if r.Due == nil || hasKind(marks, "date") {
				continue // the date chip already shows the time
			}
			c.Kind, c.Text = "due", dueText(r.Due, a.lang)
		case "deadline":
			c.Text = w.deadline + " " + mail.FormatDay(r.Deadline, a.lang)
		case "evening":
			c.Text = w.evening
		case "someday":
			c.Text = w.someday
		case "project":
			c.Text = a.names[r.ProjectID]
		case "label":
			if labels >= len(r.Labels) {
				continue
			}
			c.Text = "@" + r.Labels[labels]
			labels++
		case "priority":
			c.Text = fmt.Sprintf("P%d", r.Priority)
		case "estimate":
			c.Text = minutesText(r.EstimateMinutes)
			if r.SpentMinutes > 0 {
				c.Text = minutesText(r.SpentMinutes) + " / " + c.Text
			}
		case "recurrence", "reminder":
			c.Text = m.Span.Text // the user's own words, already in their language
		default:
			continue
		}
		chips = append(chips, c)
	}
	for _, name := range unmatchedOf(r.Title) {
		if i := strings.Index(line, name); i >= 0 {
			chips = append(chips, parseChip{Kind: "unmatched", Text: fmt.Sprintf(w.noProject, name), Start: utf16Index(line, i), End: utf16Index(line, i+len(name))})
		}
	}
	return chips
}

func hasKind(marks []quickadd.Mark, kind string) bool {
	for _, m := range marks {
		if m.Kind == kind {
			return true
		}
	}
	return false
}

func dueText(d *quickadd.Due, lang string) string {
	if d.Time == "" {
		return mail.FormatDay(d.Date, lang)
	}
	return mail.FormatDay(d.Date, lang) + " " + d.Time
}

func minutesText(m int) string {
	switch {
	case m < 60:
		return fmt.Sprintf("%dm", m)
	case m%60 == 0:
		return fmt.Sprintf("%dh", m/60)
	default:
		return fmt.Sprintf("%dh %dm", m/60, m%60)
	}
}

// utf16Index converts a byte offset of s into a UTF-16 index, the unit a
// browser's string positions use.
func utf16Index(s string, byteOffset int) int {
	if byteOffset > len(s) {
		byteOffset = len(s)
	}
	n := 0
	for _, r := range s[:byteOffset] {
		n += len(utf16.Encode([]rune{r}))
	}
	return n
}

// parseWords are the chip words the server writes, in the six shipped languages.
type parseWords struct{ deadline, evening, someday, noProject string }

var parseWordTable = map[string]parseWords{
	"en": {"Deadline", "This evening", "Someday", "No project named %s"},
	"de": {"Frist", "Heute Abend", "Irgendwann", "Kein Projekt heißt %s"},
	"fr": {"Échéance", "Ce soir", "Un jour", "Aucun projet ne s’appelle %s"},
	"es": {"Fecha límite", "Esta tarde", "Algún día", "Ningún proyecto se llama %s"},
	"it": {"Scadenza", "Stasera", "Un giorno", "Nessun progetto si chiama %s"},
	"pt": {"Prazo", "Esta noite", "Um dia", "Nenhum projeto se chama %s"},
}

func parseWordsFor(lang string) parseWords {
	if w, ok := parseWordTable[lang]; ok {
		return w
	}
	return parseWordTable["en"]
}

// isReadOnlyPost reports the POST routes that change nothing, so read tokens may
// call them (isWriteRequest).
func isReadOnlyPost(r *http.Request) bool {
	return r.Method == http.MethodPost && r.URL.Path == parsePath
}
