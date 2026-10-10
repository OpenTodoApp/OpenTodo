// Package notify carries server-side events meant for people (OpenSpec change
// `task-assignment`, design D4). The sync engine emits an event after the batch
// that caused it has committed and hands it to every registered Sink; a sink can
// therefore never block, fail or roll back a sync. This change ships one sink,
// InApp, which stores notifications for GET /api/v1/notifications. Later changes
// (`reminders` for web push, `webhooks`) register further sinks without touching
// the sync engine. No sink here contacts an external service.
package notify

import "context"

// Kinds of notification.
const (
	// KindAssigned: a task was assigned to the recipient by someone else.
	KindAssigned = "assigned"
)

// Assigned is emitted when an assignment to someone other than its author wins
// on the server. Names are resolved at emission time so a sink needs no access to
// the op log; ProjectID and ProjectName are empty for a task in the Inbox.
type Assigned struct {
	AssigneeID  string `json:"assigneeId"`
	ActorID     string `json:"actorId"`
	ActorName   string `json:"actorName"`
	TaskID      string `json:"taskId"`
	TaskTitle   string `json:"taskTitle"`
	ProjectID   string `json:"projectId,omitempty"`
	ProjectName string `json:"projectName,omitempty"`
	At          int64  `json:"at"` // Unix ms, server time of the batch
}

// Sink receives events. Implementations must be quick (insert a row, enqueue a
// job) and handle their own errors: there is nothing a caller could do with one.
type Sink interface {
	Assigned(ctx context.Context, e Assigned)
}

// Multi fans an event out to several sinks in order. The zero value (and nil
// entries) are no-ops, so emitting with no sink registered is always safe.
type Multi []Sink

// Assigned implements Sink.
func (m Multi) Assigned(ctx context.Context, e Assigned) {
	for _, s := range m {
		if s != nil {
			s.Assigned(ctx, e)
		}
	}
}

// Nop discards every event.
type Nop struct{}

// Assigned implements Sink.
func (Nop) Assigned(context.Context, Assigned) {}
