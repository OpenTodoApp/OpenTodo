// Package inbox decides Inbox membership (OpenSpec change inbox-means-unplaced,
// design D1, D2): a task is in the Inbox while it is open, live, without a
// project and not scheduled. Scheduled means a do-on date (`due`), a start date
// (past or future) or Someday (`start: "someday"`); a deadline, a reminder or a
// label alone does not schedule a task. Membership is derived from synced fields
// only, so it needs no clock and converges with them. The same rule is
// implemented in web/src/lib/inbox.ts; both read testdata/inbox_vectors.json.
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
}

// Scheduled reports whether the task has a do-on date, a start date or is in Someday.
func Scheduled(t Task) bool {
	return t.HasDue || t.Start != ""
}

// IsTask reports whether the task is in the Inbox.
func IsTask(t Task) bool {
	return !t.Completed && !t.Deleted && t.ProjectID == "" && !Scheduled(t)
}
