package agenttools

import (
	"context"
	"encoding/json"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/closedlist"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Today's closed list for today_summary (OpenSpec change today-closed-list):
// the same fill rule as the web app (internal/closedlist, shared vectors) over
// the snapshot's rows, the user's Today limit and today's focus and taken
// slots. Nothing is written.

// todayLimit reads the user's stored limit; 0 when off or unreadable.
func (r *Registry) todayLimit(ctx context.Context, userID string) (int, closedlist.Review) {
	var rev closedlist.Review
	prefs, err := r.get(ctx, userID, "user_prefs", "me")
	if err != nil || prefs == nil {
		return 0, rev
	}
	var raw any
	if v, ok := prefs["today_limit"]; ok {
		_ = json.Unmarshal(v, &raw)
	}
	limit := closedlist.ReadLimit(raw)
	if limit == 0 {
		return 0, rev
	}
	if row, err := r.get(ctx, userID, "review", "me"); err == nil && row != nil {
		rev = closedlist.Review{FocusDate: str(row, "focus_date"), Focus: str(row, "focus"), SlotsDate: str(row, "slots_date"), Slots: str(row, "slots")}
	}
	return limit, rev
}

// nullableInt is n, or null for 0 (the limit off).
func nullableInt(n int) any {
	if n == 0 {
		return nil
	}
	return n
}

// waitingForSlot fills Today's slots from its open tasks (overdue and due
// today) and returns the ids that wait, and those of them with a time today
// (due today with a time, or a deadline today), soonest first (OpenSpec change
// today-waiting-time-sensitive); nil when the limit is off.
func (snap *snapshot) waitingForSlot(limit int, rev closedlist.Review, today string, loc *time.Location, tasks []opsync.Entity) (map[string]bool, []closedlist.Sensitive) {
	if limit == 0 {
		return nil, nil
	}
	states := snap.flowStates(today)
	in := closedlist.Input{Limit: limit, Today: today, Review: rev}
	for _, t := range tasks {
		date, clock := localDue(taskDue(t), loc)
		in.Tasks = append(in.Tasks, closedlist.Task{
			ID: str(t, "id"), CreatedAt: int64(num(t, "created_at")), Earlier: date < today, Due: date,
			Habit: boolean(t, "habit"), Blocked: !states.Available(str(t, "id")),
			Time: clock, Deadline: rawStr(t, "deadline"),
		})
	}
	f := closedlist.Compute(in, nil)
	return f.WaitingSet(), closedlist.TimeSensitive(f.WaitingTasks(in.Tasks), today)
}
