package digest

import (
	"context"
	"encoding/json"
	"sort"
	"time"

	"github.com/pixari/opentodo/internal/mail"
	opsync "github.com/pixari/opentodo/internal/sync"
	"github.com/pixari/opentodo/internal/zoned"
)

// List limits of the digest content (the email-digest spec).
const (
	MaxListed   = 15
	MaxProjects = 10
)

// Reader is the part of the sync service the digest reads.
type Reader interface {
	List(ctx context.Context, userID, entity string, includeDeleted bool) ([]opsync.Entity, error)
	Get(ctx context.Context, userID, entity, id string) (opsync.Entity, error)
	Memberships(ctx context.Context, userID string) ([]opsync.Membership, error)
}

func str(e opsync.Entity, f string) string {
	var s string
	_ = json.Unmarshal(e[f], &s)
	return s
}

func num(e opsync.Entity, f string) int64 {
	var n float64
	_ = json.Unmarshal(e[f], &n)
	return int64(n)
}

func boolean(e opsync.Entity, f string) bool {
	var b bool
	_ = json.Unmarshal(e[f], &b)
	return b
}

func taskOf(e opsync.Entity) Task {
	t := Task{ID: str(e, "id"), Title: str(e, "title"), ProjectID: str(e, "project_id"), AssigneeID: str(e, "assignee_id"),
		CreatedAt: num(e, "created_at"), CompletedAt: num(e, "completed_at"), DeletedAt: num(e, "deleted_at")}
	var d struct{ Date, Time, TZ string }
	if raw := e["due"]; len(raw) > 0 && string(raw) != "null" && json.Unmarshal(raw, &d) == nil && d.Date != "" {
		t.Due = &Due{Date: d.Date, Time: d.Time, TZ: d.TZ}
	}
	return t
}

var weekStarts = map[string]int{"sun": 0, "mon": 1, "sat": 6}

// Build reads the user's rows and returns the digest message for the last full
// week in the user's zone. The mail service refuses it for an encrypted account
// before any title reaches the template.
func Build(ctx context.Context, r Reader, row Row, now time.Time, origin string) (mail.Message, error) {
	loc, err := zoned.Load(row.TimeZone)
	if err != nil {
		loc = time.UTC
	}
	weekStart := 1 // "system" cannot be known on the server: Monday
	if prefs, err := r.Get(ctx, row.UserID, "user_prefs", "me"); err == nil && prefs != nil {
		if ws, ok := weekStarts[str(prefs, "week_start")]; ok {
			weekStart = ws
		}
	}
	rows, err := r.List(ctx, row.UserID, "task", false)
	if err != nil {
		return mail.Message{}, err
	}
	projects, err := r.List(ctx, row.UserID, "project", false)
	if err != nil {
		return mail.Message{}, err
	}
	members, err := r.Memberships(ctx, row.UserID)
	if err != nil {
		return mail.Message{}, err
	}
	shared := map[string]bool{}
	viewer := map[string]bool{}
	for _, m := range members {
		shared[m.ProjectID] = true
		if m.Role == "viewer" {
			viewer[m.ProjectID] = true
		}
	}
	names := map[string]string{}
	for _, p := range projects {
		names[str(p, "id")] = str(p, "name")
	}
	tasks := make([]Task, 0, len(rows))
	for _, e := range rows {
		tasks = append(tasks, taskOf(e))
	}
	today := now.In(loc).Format("2006-01-02")
	period := LastFullWeek(now, loc, weekStart)
	c := Compute(tasks, shared, row.UserID, period, today, loc)
	lang := row.Language
	d := &mail.DigestVars{Period: dayLabel(period.Start, lang) + " – " + dayLabel(period.Last, lang),
		Completed: c.Completed, Created: c.Created, Late: c.Late, Slipped: c.Slipped}

	type dated struct {
		t   Task
		due string
	}
	var overdue, ahead []dated
	horizon := addDays(today, 7)
	withOpen := map[string]bool{}
	for _, t := range tasks {
		if t.CompletedAt != 0 || t.DeletedAt != 0 {
			continue
		}
		withOpen[t.ProjectID] = true
		if !countsFor(t, shared, row.UserID) {
			continue
		}
		due := DueDate(t.Due, loc)
		switch {
		case due == "":
		case due < today:
			overdue = append(overdue, dated{t, due})
		case due < horizon:
			ahead = append(ahead, dated{t, due})
		}
	}
	list := func(in []dated) ([]mail.DigestItem, int) {
		sort.SliceStable(in, func(i, j int) bool { return in[i].due < in[j].due })
		var out []mail.DigestItem
		for i, x := range in {
			if i == MaxListed {
				break
			}
			out = append(out, mail.DigestItem{Title: x.t.Title, Date: dayLabel(x.due, lang), Project: names[x.t.ProjectID]})
		}
		return out, max(0, len(in)-MaxListed)
	}
	d.Overdue, d.MoreOverdue = list(overdue)
	d.Ahead, d.MoreAhead = list(ahead)
	d.OverdueCount, d.AheadCount = len(overdue), len(ahead)
	var idle []string
	for _, p := range projects {
		id := str(p, "id")
		if num(p, "deleted_at") != 0 || boolean(p, "archived") || viewer[id] || withOpen[id] {
			continue
		}
		idle = append(idle, str(p, "name"))
	}
	if len(idle) > MaxProjects {
		d.MoreProjects = len(idle) - MaxProjects
		idle = idle[:MaxProjects]
	}
	d.Projects = idle
	if rev, err := r.Get(ctx, row.UserID, "review", "me"); err == nil && rev != nil {
		if at := num(rev, "completed_at"); at > 0 {
			d.LastReview = dayLabel(localDate(at, loc), lang)
		}
	}
	return mail.Message{Kind: mail.KindDigest, To: row.Email, Lang: lang, Origin: origin, UserID: row.UserID,
		Vars: mail.Vars{Link: origin + "/review", Digest: d}}, nil
}

var (
	weekdayNames = map[string][7]string{
		"en": {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"},
		"de": {"So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."},
		"fr": {"dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."},
		"es": {"dom", "lun", "mar", "mié", "jue", "vie", "sáb"},
		"it": {"dom", "lun", "mar", "mer", "gio", "ven", "sab"},
		"pt": {"dom", "seg", "ter", "qua", "qui", "sex", "sáb"},
	}
	monthNames = map[string][12]string{
		"en": {"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"},
		"de": {"Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."},
		"fr": {"janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."},
		"es": {"ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"},
		"it": {"gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"},
		"pt": {"jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"},
	}
)

// dayLabel writes a date as weekday, day and month in lang ("Fri 23 Oct",
// "Fr. 23. Okt."): unambiguous without the user's numeric format (design D7).
func dayLabel(day, lang string) string {
	t, err := time.Parse("2006-01-02", day)
	if err != nil {
		return day
	}
	w, ok := weekdayNames[lang]
	if !ok {
		lang, w = "en", weekdayNames["en"]
	}
	m := monthNames[lang][t.Month()-1]
	n := t.Format("2")
	if lang == "de" {
		n += "."
	}
	return w[t.Weekday()] + " " + n + " " + m
}
