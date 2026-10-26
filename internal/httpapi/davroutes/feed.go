package davroutes

import (
	"encoding/json"
	"net/http"

	"github.com/OpenTodoApp/opentodo/internal/auth"
	"github.com/OpenTodoApp/opentodo/internal/calfeed"

	"github.com/OpenTodoApp/opentodo/internal/recurrence"
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
		var rule string
		if json.Unmarshal(t["recurrence"], &rule) == nil && rule != "" {
			if parsed, err := recurrence.Parse(rule); err == nil {
				ft.RRULE = parsed.RRULE()
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
