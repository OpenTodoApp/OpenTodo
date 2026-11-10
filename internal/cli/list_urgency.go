package cli

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/urgency"
	"github.com/OpenTodoApp/opentodo/internal/zoned"
)

// `ot list --sort urgency` (OpenSpec change urgency-sort, design D5): the fetched
// tasks ordered by the shared urgency score, highest first, equal scores by due
// date, priority, position and id, with the score as a column and as `urgency`
// in --json.

// sortOrder reads --sort: "" or default keeps the list's own order.
func sortOrder(v string) (bool, error) {
	switch strings.TrimSpace(v) {
	case "", "default":
		return false, nil
	case "urgency":
		return true, nil
	}
	return false, usageErr("--sort must be default or urgency (got %q)", v)
}

func urgencyTaskOf(t task) urgency.Task {
	u := urgency.Task{ID: t.ID, Priority: t.Priority, CreatedAt: int64(t.CreatedAt), Completed: t.CompletedAt != nil, Deleted: t.DeletedAt != nil, BlockedBy: t.BlockedBy}
	if t.Due != nil {
		u.Due = &zoned.Due{Date: t.Due.Date, Time: t.Due.Time, TZ: t.Due.TZ}
	}
	if t.Deadline != nil {
		u.Deadline = *t.Deadline
	}
	if t.Start != nil {
		u.Start = *t.Start
	}
	return u
}

// runningTask is the task of the caller's running time entry, "" when none or unreadable.
func runningTask(ctx context.Context, c *client) string {
	raw, _, err := c.do(ctx, http.MethodGet, "/time-entries/running", nil, nil)
	if err != nil {
		return ""
	}
	var res struct {
		Entry *struct {
			TaskID string `json:"task_id"`
		} `json:"entry"`
	}
	if json.Unmarshal(raw, &res) != nil || res.Entry == nil {
		return ""
	}
	return res.Entry.TaskID
}

// byUrgency orders tasks by score and returns the scores by id (completed tasks
// have none and come last).
func byUrgency(tasks, all []task, today string, loc *time.Location, running string) map[string]float64 {
	every := make([]urgency.Task, 0, len(all))
	for _, t := range all {
		every = append(every, urgencyTaskOf(t))
	}
	g := urgency.NewGraph(every)
	scores := make(map[string]float64, len(tasks))
	for _, t := range tasks {
		u := urgencyTaskOf(t)
		if r, ok := urgency.Score(u, urgency.Context{Today: today, Loc: loc, Blocks: g.Blocks(t.ID), Blocked: g.Blocked(u), Timer: running != "" && running == t.ID}); ok {
			scores[t.ID] = r.Score
		}
	}
	sort.SliceStable(tasks, func(i, j int) bool {
		a, b := tasks[i], tasks[j]
		sa, oka := scores[a.ID]
		sb, okb := scores[b.ID]
		if oka != okb {
			return oka
		}
		return urgency.Less(sa, sb, false, func() bool {
			if c := compareDue(a.Due, b.Due); c != 0 {
				return c < 0
			}
			if a.Priority != b.Priority {
				return a.Priority < b.Priority
			}
			if a.Position != b.Position {
				return a.Position < b.Position
			}
			return a.ID < b.ID
		})
	})
	return scores
}

// withUrgency adds the score to a task's JSON (`urgency`, absent for a completed task).
func withUrgency(raw json.RawMessage, id string, scores map[string]float64) json.RawMessage {
	s, ok := scores[id]
	if !ok {
		return raw
	}
	var m map[string]json.RawMessage
	if json.Unmarshal(raw, &m) != nil {
		return raw
	}
	m["urgency"] = json.RawMessage(strconv.FormatFloat(s, 'f', -1, 64))
	out, err := json.Marshal(m)
	if err != nil {
		return raw
	}
	return out
}
