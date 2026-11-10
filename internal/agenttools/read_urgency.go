package agenttools

import (
	"context"
	"fmt"

	"github.com/OpenTodoApp/opentodo/internal/digest"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
	"github.com/OpenTodoApp/opentodo/internal/timetrack"
	"github.com/OpenTodoApp/opentodo/internal/urgency"
	"github.com/OpenTodoApp/opentodo/internal/zoned"
)

// list_tasks with sort urgency (OpenSpec change urgency-sort, design D5): the
// matching tasks ordered by the shared score, highest first, equal scores by due
// date, priority, position and id; each result carries its score and parts.

// urgencyScope is what the scores of one call share: the logical today with the
// account's day start, the blocking facts of the snapshot (one pass, so each
// score is O(1)) and the caller's running time entry.
type urgencyScope struct {
	ctx     urgency.Context
	graph   urgency.Graph
	running string
}

// parseSort reads list_tasks' sort argument: default or urgency.
func parseSort(a args) (bool, error) {
	v, err := a.str("sort")
	if err != nil {
		return false, err
	}
	switch v {
	case "", "default":
		return false, nil
	case "urgency":
		return true, nil
	}
	return false, argErr("sort: must be default or urgency")
}

func urgencyTask(t opsync.Entity) urgency.Task {
	return urgency.Task{
		ID: str(t, "id"), Priority: priority(t), Due: zoned.DecodeDue(t["due"]), Deadline: str(t, "deadline"), Start: str(t, "start"),
		// Tombstoned tasks are never in a snapshot, so a closed task is a completed one.
		CreatedAt: int64(num(t, "created_at")), Completed: !isOpen(t), BlockedBy: stringList(t, "blocked_by"),
	}
}

// urgencyScope reads the day start and the running entry; only list_tasks with
// sort urgency pays for them.
func (r *Registry) urgencyScope(ctx context.Context, userID string, snap *snapshot, q taskQuery) (*urgencyScope, error) {
	dayStart := 0
	if prefs, err := r.get(ctx, userID, "user_prefs", "me"); err == nil && prefs != nil {
		dayStart = digest.DayStart(rawStr(prefs, "day_start"))
	}
	rows, err := r.list(ctx, userID, "time_entry", false)
	if err != nil {
		return nil, err
	}
	entries := make([]timetrack.Entry, 0, len(rows))
	for _, row := range rows {
		entries = append(entries, timetrack.FromRow(row))
	}
	s := &urgencyScope{ctx: urgency.Context{Today: urgency.Today(r.now(), q.loc, dayStart), Loc: q.loc, DayStart: dayStart}}
	if e := timetrack.Running(entries, userID); e != nil {
		s.running = e.TaskID
	}
	tasks := make([]urgency.Task, 0, len(snap.tasks))
	for _, t := range snap.tasks {
		tasks = append(tasks, urgencyTask(t))
	}
	s.graph = urgency.NewGraph(tasks)
	return s, nil
}

// score adds the task's urgency to its result and returns its sort key: the
// score highest first, then due date, priority, position and id (page adds the
// id); a task without a score (completed) comes last.
func (s *urgencyScope) score(t opsync.Entity, out *taskOut, dueKey string) string {
	ut := urgencyTask(t)
	c := s.ctx
	c.Blocks, c.Blocked, c.Timer = s.graph.Blocks(ut.ID), s.graph.Blocked(ut), s.running != "" && s.running == ut.ID
	res, ok := urgency.Score(ut, c)
	tie := fmt.Sprintf("%s|%d|%s", dueKey, ut.Priority, sortableFloat(num(t, "position")))
	if !ok {
		return "~|" + tie
	}
	out.Urgency, out.UrgencyParts = &res.Score, &res.Parts
	return sortableFloat(-res.Score) + "|" + tie
}
