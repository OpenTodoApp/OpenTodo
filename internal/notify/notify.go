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

// KindMentioned: the recipient was @mentioned in a comment by someone else
// (OpenSpec change `comments-and-activity`).
const KindMentioned = "mentioned"

// Mentioned is emitted once per account newly listed in a comment's mentions,
// after the batch that added it committed. Only current members of the task's
// shared project are ever mentioned (the sync engine filters the list at
// receipt). Excerpt is the start of the comment body on one line.
type Mentioned struct {
	RecipientID string `json:"recipientId"`
	ActorID     string `json:"actorId"`
	ActorName   string `json:"actorName"`
	CommentID   string `json:"commentId"`
	TaskID      string `json:"taskId"`
	TaskTitle   string `json:"taskTitle"`
	ProjectID   string `json:"projectId,omitempty"`
	ProjectName string `json:"projectName,omitempty"`
	Excerpt     string `json:"excerpt"`
	At          int64  `json:"at"` // Unix ms, server time of the batch
}

// MentionSink is implemented by sinks that also handle mentions. It is separate
// from Sink so existing Sink implementations keep compiling: Multi hands a
// mention only to the sinks that implement it.
type MentionSink interface {
	Mentioned(ctx context.Context, e Mentioned)
}

// Mentioned fans a mention out to every sink that implements MentionSink.
func (m Multi) Mentioned(ctx context.Context, e Mentioned) {
	for _, s := range m {
		if ms, ok := s.(MentionSink); ok {
			ms.Mentioned(ctx, e)
		}
	}
}

// Mentioned implements MentionSink.
func (Nop) Mentioned(context.Context, Mentioned) {}

// KindUnblocked: a task assigned to the recipient no longer waits for any open
// task, because someone else completed its last open blocker (OpenSpec change
// `task-dependencies`, design D9).
const KindUnblocked = "unblocked"

// Unblocked is emitted once per task that became ready to start in a committed
// batch, to its assignee when that is not the account that completed the blocker.
type Unblocked struct {
	AssigneeID   string `json:"assigneeId"`
	ActorID      string `json:"actorId"`
	ActorName    string `json:"actorName"`
	TaskID       string `json:"taskId"`
	TaskTitle    string `json:"taskTitle"`
	ProjectID    string `json:"projectId,omitempty"`
	ProjectName  string `json:"projectName,omitempty"`
	BlockerID    string `json:"blockerId"`
	BlockerTitle string `json:"blockerTitle"`
	At           int64  `json:"at"` // Unix ms, server time of the batch
}

// UnblockedSink is implemented by sinks that also handle unblocked tasks; like
// MentionSink it is separate from Sink so existing sinks keep compiling.
type UnblockedSink interface {
	Unblocked(ctx context.Context, e Unblocked)
}

// Unblocked fans the event out to every sink that implements UnblockedSink.
func (m Multi) Unblocked(ctx context.Context, e Unblocked) {
	for _, s := range m {
		if us, ok := s.(UnblockedSink); ok {
			us.Unblocked(ctx, e)
		}
	}
}

// Unblocked implements UnblockedSink.
func (Nop) Unblocked(context.Context, Unblocked) {}

// Task page notification kinds (OpenSpec `task-pages`, design D9).
const (
	// KindPageReplied: a guest replied on one of the recipient's task pages.
	KindPageReplied = "page_replied"
	// KindPageCompleted: a guest completed (or reopened) a published task.
	KindPageCompleted = "page_completed"
)

// PageEvent is a guest's reply or completion on a task page, for its publisher.
// For an encrypted task TaskTitle and GuestName are empty: the server cannot read
// them, and the publisher's device fills in the title after decrypting.
type PageEvent struct {
	Kind        string `json:"-"`
	PublisherID string `json:"publisherId"`
	PageID      string `json:"pageId"`
	TaskID      string `json:"taskId"`
	TaskTitle   string `json:"taskTitle,omitempty"`
	GuestName   string `json:"guestName,omitempty"`
	Completed   bool   `json:"completed,omitempty"`
	Encrypted   bool   `json:"encrypted,omitempty"`
	At          int64  `json:"at"`
}

// PageSink is implemented by sinks that also handle task page events; like
// MentionSink it is separate from Sink so existing sinks keep compiling.
type PageSink interface {
	PageActivity(ctx context.Context, e PageEvent)
}

// PageActivity fans the event out to every sink that implements PageSink.
func (m Multi) PageActivity(ctx context.Context, e PageEvent) {
	for _, s := range m {
		if ps, ok := s.(PageSink); ok {
			ps.PageActivity(ctx, e)
		}
	}
}

// PageActivity implements PageSink.
func (Nop) PageActivity(context.Context, PageEvent) {}
