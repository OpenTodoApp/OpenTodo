package sync

import (
	"context"
	"encoding/json"

	"github.com/OpenTodoApp/opentodo/internal/notify"
)

// emitStatus hands one notify.StatusChanged event per task whose completion
// changed in a committed batch (completed_at from null to a value, or back) to
// the task's assignee when that is someone other than the batch's author and
// the task is not deleted (OpenSpec change assignee-notifications, design D1).
// A new occurrence record of a repeating task is the completion of that
// occurrence; a skipped occurrence and a task created already completed are
// not status changes. Best effort: it reads the stored state and never fails the batch.
func (s *Service) emitStatus(ctx context.Context, author string, at int64, changes []Change) {
	if len(s.sinks) == 0 {
		return
	}
	actorName, loaded := "", false
	for _, c := range changes {
		if c.Entity != "task" {
			continue
		}
		fc, ok := c.Fields["completed_at"]
		if !ok || isNullRaw(fc.From) == isNullRaw(fc.To) {
			continue
		}
		if !isNullRaw(json.RawMessage(s.rawField(ctx, c.ScopeID, "task", c.EntityID, "deleted_at"))) {
			continue
		}
		// A skipped occurrence is not a completion.
		if s.rawField(ctx, c.ScopeID, "task", c.EntityID, "skipped") == "true" {
			continue
		}
		// A task created already completed (an import, a copy) changed nobody's
		// work; a new occurrence record is the completion of that occurrence.
		_, created := c.Fields["created_at"]
		_, record := c.Fields["series_id"]
		if created && !record {
			continue
		}
		assignee := idValue(json.RawMessage(s.rawField(ctx, c.ScopeID, "task", c.EntityID, "assignee_id")))
		if assignee == "" || assignee == author {
			continue
		}
		if !loaded {
			actorName, loaded = s.userName(ctx, author), true
		}
		e := notify.StatusChanged{AssigneeID: assignee, ActorID: author, ActorName: actorName, TaskID: c.EntityID,
			Completed: isNullRaw(fc.From), At: at}
		e.TaskTitle = s.stringField(ctx, c.ScopeID, "task", c.EntityID, "title")
		e.ProjectID, e.ProjectName = s.taskProject(ctx, c.ScopeID, c.EntityID)
		s.sinks.StatusChanged(ctx, e)
	}
}
