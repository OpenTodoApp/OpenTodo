// Package inbox decides Inbox membership (OpenSpec change inbox-means-unplaced,
// design D1, D2): a task is in the Inbox while it is open, live, not placed, and
// no parent of it is placed either (a subtask follows its parent out of the
// Inbox). Placed means a project or a schedule. Scheduled means a do-on date (`due`), a start date
// (past or future) or Someday (`start: "someday"`); a deadline, a reminder or a
// label alone does not schedule a task. Membership is derived from synced fields
// only, so it needs no clock and converges with them. The same rule is
// implemented in web/src/lib/inbox.ts; both read web/src/lib/inbox.vectors.json.
package inbox

// Task is the part of a task the rule reads.
type Task struct {
	// ProjectID is "" for a task without a project.
	ProjectID string
	// HasDue reports a do-on date.
	HasDue bool
	// Start is "", a date (YYYY-MM-DD) or "someday".
	Start     string
	Completed bool
	Deleted   bool
	// ParentID is "" for a top-level task.
	ParentID string
}

// ParentOf finds a task by id, to walk a subtask's parents; false when it is not known.
type ParentOf func(id string) (Task, bool)

// maxDepth bounds the walk up the parents (a guard against a cycle in synced data).
const maxDepth = 64

// Scheduled reports whether the task has a do-on date, a start date or is in Someday.
func Scheduled(t Task) bool {
	return t.HasDue || t.Start != ""
}

// Placed reports a project or a schedule: the task has a place outside the Inbox.
func Placed(t Task) bool {
	return t.ProjectID != "" || Scheduled(t)
}

// IsTask reports whether the task is in the Inbox. With parentOf, a subtask is left
// out when any parent it can find is placed (whether that parent is open, done or
// deleted); a parent that is not found ends the walk. parentOf may be nil.
func IsTask(t Task, parentOf ParentOf) bool {
	if t.Completed || t.Deleted || Placed(t) {
		return false
	}
	parent := t.ParentID
	for depth := 0; parent != "" && parentOf != nil && depth < maxDepth; depth++ {
		p, ok := parentOf(parent)
		if !ok {
			break
		}
		if Placed(p) {
			return false
		}
		parent = p.ParentID
	}
	return true
}
