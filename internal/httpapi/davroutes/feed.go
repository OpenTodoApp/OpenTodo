package davroutes

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/auth"
	"github.com/OpenTodoApp/opentodo/internal/calfeed"

	"github.com/OpenTodoApp/opentodo/internal/recurrence"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// FeedTasks lists the user's visible open tasks with a due date, as the
// endpoint shows them (the calendar feed and calendar sync use it).
func (s *Server) FeedTasks(r *http.Request, uid string) ([]calfeed.FeedTask, error) {
	d := &davRequest{s: s, r: r, user: &auth.User{ID: uid}}
	v, err := d.load()
	if err != nil {
		return nil, err
	}
	var out []calfeed.FeedTask
	for _, t := range v.tasks {
		if !isNullish(t["completed_at"]) {
			continue
		}
		pid := idOf(t["project_id"])
		if pid != "" && !v.calendarVisible(pid) {
			continue
		}
		var due struct {
			Date string  `json:"date"`
			Time *string `json:"time"`
			TZ   *string `json:"tz"`
		}
		if json.Unmarshal(t["due"], &due) != nil || due.Date == "" {
			continue
		}
		id := idOf(t["id"])
		ft := calfeed.FeedTask{ID: id, Title: idOf(t["title"]), Description: idOf(t["description"]), Date: due.Date, Time: due.Time, TZ: due.TZ, Modified: v.modified[id]}
		_ = json.Unmarshal(t["estimate_minutes"], &ft.Estimate)
		_ = json.Unmarshal(t["priority"], &ft.Priority)
		ft.Start = spanStart(t, due.Date)
		var rule string
		if json.Unmarshal(t["recurrence"], &rule) == nil && rule != "" {
			if parsed, err := recurrence.Parse(rule); err == nil {
				ft.RRULE = parsed.RRULE()
				if ft.Start != "" {
					ft.RRULE, ft.RDates = spanRecurrence(parsed, ft.Start, due.Date, v.today)
				}
			}
		}
		var labels []string
		_ = json.Unmarshal(t["labels"], &labels)
		for _, l := range labels {
			if name, ok := v.labels[l]; ok && name != "" {
				ft.Labels = append(ft.Labels, name)
			}
		}
		out = append(out, ft)
	}
	return out, nil
}

// spanStart is the first day of a task drawn as a span (calfeed.SpanStart).
func spanStart(t opsync.Entity, dueDate string) string {
	return calfeed.SpanStart(string(t["span"]) == "true", idOf(t["start"]), dueDate)
}

// spanRecurrence gives a recurring span's first days (design D7): the RRULE of
// the do-on dates moved by the span's length when an RRULE can say it, else
// the first days of the occurrences in the feed window as RDATEs.
func spanRecurrence(rule recurrence.Rule, start, dueDate, today string) (string, []string) {
	days := 0
	if a, err := time.Parse(time.DateOnly, start); err == nil {
		if b, err := time.Parse(time.DateOnly, dueDate); err == nil {
			days = int(b.Sub(a).Hours() / 24)
		}
	}
	if rr, ok := rule.RRULEEarlier(days); ok {
		return rr, nil
	}
	to := recurrence.AddDays(today, calfeed.FeedFutureDays)
	dates, _, err := rule.Occurrences(dueDate, today, 0, dueDate, to)
	if err != nil {
		return "", nil
	}
	firsts := make([]string, len(dates))
	for i, d := range dates {
		firsts[i] = recurrence.AddDays(d, -days)
	}
	return "", firsts
}
