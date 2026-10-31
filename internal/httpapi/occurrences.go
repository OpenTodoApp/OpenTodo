package httpapi

import (
	"encoding/json"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/recurrence"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Occurrences of a recurring task for integrations (OpenSpec change
// series-occurrences, design D7): the series' current occurrence and the
// projected ones in an inclusive range, from the server's port of the shared
// calculator (recurrence.Rule.Occurrences), so a script lists the dates every
// device draws. It only reads: every token scope that can read may call it, and it
// is not demo-denied. The answer holds dates only, no content, so an encrypted
// account needs nothing (the rule and the due are plaintext fields).
func (s *Server) registerOccurrenceRoutes(mux *routes) {
	mux.handle("GET /api/v1/tasks/{id}/occurrences", signedIn, s.handleTaskOccurrences)
}

const (
	// occurrenceDefaultDays is the range after `from` when `to` is left out.
	occurrenceDefaultDays = 30
	// occurrenceMaxDays is the longest range, both ends counted.
	occurrenceMaxDays = 366
)

// apiOccurrence is one occurrence: current, projected, or one with a record
// (open, done or skipped; series-exceptions D11) by the date it stands for.
type apiOccurrence struct {
	Date  string `json:"date"`
	Time  string `json:"time,omitempty"`
	TZ    string `json:"tz,omitempty"`
	State string `json:"state"`
	// RecordID is the occurrence record's task id.
	RecordID string `json:"record_id,omitempty"`
	// Due is the record's due date when it was moved to another day.
	Due string `json:"due,omitempty"`
}

type apiOccurrences struct {
	SeriesID    string          `json:"series_id"`
	Rule        string          `json:"rule"`
	Occurrences []apiOccurrence `json:"occurrences"`
	// Capped is true when the range holds more projected occurrences than the
	// 31 the calculator lists per range.
	Capped bool `json:"capped"`
}

// occurrenceRange reads from and to (YYYY-MM-DD): from defaults to today, to to
// from plus 30 days; a reversed range or one longer than 366 days is refused.
func occurrenceRange(r *http.Request, today string) (from, to, msg string) {
	parse := func(s string) (time.Time, bool) {
		d, err := time.Parse(time.DateOnly, s)
		return d, err == nil && d.Format(time.DateOnly) == s
	}
	from, to = r.URL.Query().Get("from"), r.URL.Query().Get("to")
	if from == "" {
		from = today
	}
	f, ok := parse(from)
	if !ok {
		return "", "", "from must be a date (YYYY-MM-DD)"
	}
	if to == "" {
		to = f.AddDate(0, 0, occurrenceDefaultDays).Format(time.DateOnly)
	}
	t, ok := parse(to)
	if !ok {
		return "", "", "to must be a date (YYYY-MM-DD)"
	}
	if t.Before(f) {
		return "", "", "from must not be after to"
	}
	if days := int(t.Sub(f).Hours()/24) + 1; days > occurrenceMaxDays {
		return "", "", "the range is at most 366 days"
	}
	return from, to, ""
}

func (s *Server) handleTaskOccurrences(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid, id := userFrom(ctx).ID, r.PathValue("id")
	task, err := s.sync.Get(ctx, uid, "task", id)
	if err != nil {
		s.internal(w, err)
		return
	}
	if task == nil {
		writeError(w, http.StatusNotFound, "not_found", "task not found")
		return
	}
	today := localToday(s.now())
	from, to, msg := occurrenceRange(r, today)
	if msg != "" {
		writeError(w, http.StatusBadRequest, "invalid_input", msg)
		return
	}
	var due struct {
		Date string `json:"date"`
		Time string `json:"time"`
		TZ   string `json:"tz"`
	}
	ruleText := opsync.StringOf(task["recurrence"])
	rule, perr := recurrence.Parse(ruleText)
	if task.Deleted() || !opsync.IsNull(task["completed_at"]) || ruleText == "" || perr != nil ||
		json.Unmarshal(task["due"], &due) != nil || due.Date == "" {
		writeError(w, http.StatusBadRequest, "not_recurring", "the task is not an open recurring task with a due date")
		return
	}
	tasks, err := s.sync.SeriesTasks(ctx, uid)
	if err != nil {
		s.internal(w, err)
		return
	}
	// Exception dates and the occurrences records use up (series-exceptions D9).
	budget := opsync.SeriesBudget(id, tasks, due.Date)
	dates, capped, err := rule.OccurrencesExcept(due.Date, today, budget.Taken, from, to, budget.Except)
	if err != nil {
		writeError(w, http.StatusBadRequest, "not_recurring", "the task's due date is not a date")
		return
	}
	out := apiOccurrences{SeriesID: id, Rule: rule.Canonical(), Occurrences: []apiOccurrence{}, Capped: capped}
	at := func(date, state string) apiOccurrence {
		o := apiOccurrence{Date: date, State: state}
		if due.Time != "" {
			o.Time, o.TZ = due.Time, due.TZ
		}
		return o
	}
	if due.Date >= from && due.Date <= to && !budget.Except[due.Date] {
		out.Occurrences = append(out.Occurrences, at(due.Date, "current"))
	}
	for _, d := range dates {
		out.Occurrences = append(out.Occurrences, at(d, "projected"))
	}
	// Records in the range by the date they stand for: open, done or skipped.
	for _, rec := range opsync.RecordsOf(id, tasks) {
		if rec.Date < from || rec.Date > to {
			continue
		}
		o := apiOccurrence{Date: rec.Date, State: rec.State, RecordID: rec.ID}
		var d struct {
			Date string `json:"date"`
			Time string `json:"time"`
			TZ   string `json:"tz"`
		}
		if json.Unmarshal(rec.Task["due"], &d) == nil {
			o.Time, o.TZ = d.Time, d.TZ
			if d.Date != rec.Date {
				o.Due = d.Date
			}
		}
		out.Occurrences = append(out.Occurrences, o)
	}
	slices.SortStableFunc(out.Occurrences, func(a, b apiOccurrence) int { return strings.Compare(a.Date, b.Date) })
	writeJSON(w, http.StatusOK, out)
}
