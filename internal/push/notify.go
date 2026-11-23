package push

import (
	"context"
	"encoding/json"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/notify"
	"github.com/OpenTodoApp/opentodo/internal/textutil"
)

// Assignment and status pushes (OpenSpec change assignee-notifications, design
// D3): the service is a notify sink that pushes "Kim assigned you a task" and
// "Kim completed a task" to the recipient's devices that opted in. Sinks must
// not block the sync, so the sends run in the background, at most
// notifySenders at once; an event that finds them all busy is dropped, and a
// failed send is not retried (best effort, as the bell's events).

const (
	notifySenders = 4
	notifyTimeout = 30 * time.Second
)

// TaskPayload is the JSON pushed for an assignment or a status change. Title is
// present only when the device opted in to titles and the title is readable.
type TaskPayload struct {
	Type      string `json:"type"` // "assigned" or "status"
	TaskID    string `json:"taskId"`
	ActorName string `json:"actorName"`
	Completed *bool  `json:"completed,omitempty"` // status only
	Title     string `json:"title,omitempty"`
}

// Assigned implements notify.Sink.
func (s *Service) Assigned(ctx context.Context, e notify.Assigned) {
	s.notifyTask(ctx, e.AssigneeID, func(n Notify) bool { return n.Assigned },
		TaskPayload{Type: "assigned", TaskID: e.TaskID, ActorName: e.ActorName}, e.TaskTitle)
}

// StatusChanged implements notify.StatusSink.
func (s *Service) StatusChanged(ctx context.Context, e notify.StatusChanged) {
	completed := e.Completed
	s.notifyTask(ctx, e.AssigneeID, func(n Notify) bool { return n.Status },
		TaskPayload{Type: "status", TaskID: e.TaskID, ActorName: e.ActorName, Completed: &completed}, e.TaskTitle)
}

func (s *Service) notifyTask(ctx context.Context, uid string, wants func(Notify) bool, p TaskPayload, title string) {
	select {
	case s.senders <- struct{}{}:
	default:
		s.log.Warn("push: notification dropped, senders busy", "type", p.Type)
		return
	}
	ctx = context.WithoutCancel(ctx)
	go func() {
		defer func() { <-s.senders }()
		ctx, cancel := context.WithTimeout(ctx, notifyTimeout)
		defer cancel()
		s.sendTask(ctx, uid, wants, p, title)
	}()
}

// sendTask pushes p to every enabled subscription of uid that wants it, unless
// the user is away.
func (s *Service) sendTask(ctx context.Context, uid string, wants func(Notify) bool, p TaskPayload, title string) {
	now := s.now()
	subs, err := s.ListByUser(ctx, uid)
	if err != nil {
		s.log.Warn("push: list subscriptions", "err", err)
		return
	}
	var targets []*Subscription
	for _, sub := range subs {
		if wants(sub.Notify) && !sub.Disabled(now) {
			targets = append(targets, sub)
		}
	}
	if len(targets) == 0 {
		return
	}
	if quiet, err := s.awayQuiet(ctx, uid, now); err != nil || quiet {
		return
	}
	readable := title != "" && title != e2ee.Placeholder
	for _, sub := range targets {
		q := p
		if sub.IncludeContent && readable {
			q.Title = textutil.TruncateEllipsis(title, 200)
		}
		b, _ := json.Marshal(q)
		if res, err := s.Send(ctx, sub, b, topicFor(p.TaskID)); res == Failed {
			s.log.Warn("push send failed", "subscription", sub.ID, "err", err)
		}
	}
}
