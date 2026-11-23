package push

import (
	"context"
	"encoding/json"
	"strings"
	gosync "sync"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/notify"
	"github.com/OpenTodoApp/opentodo/internal/textutil"
)

// Assignment and status pushes (OpenSpec change assignee-notifications, design
// D3): the service is a notify sink that pushes "Kim assigned you a task" and
// "Kim completed a task" to the recipient's devices that opted in. Sinks must
// not block the sync, so each event's sends run in the background, to all of
// the recipient's devices at once; at most notifySenders events are in flight
// and one that finds them all busy is dropped. A failed send is not retried
// (best effort, as the bell's events).

const (
	notifySenders = 32
	notifyTimeout = 15 * time.Second
	// statusCooldown is how long a task's status pushes to one recipient
	// pause after one was sent, so toggling a task done and open again and
	// again does not flood the senders.
	statusCooldown = 5 * time.Minute
	// cooldownCap bounds the cooldown table; older entries are dropped first.
	cooldownCap = 10_000
)

// statusCooldowns remembers when each (task, recipient) last got a status push.
type statusCooldowns struct {
	mu   gosync.Mutex
	last map[string]time.Time
}

// allow reports whether a status push for key may go now, and if so records it.
func (c *statusCooldowns) allow(key string, now time.Time) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.last == nil {
		c.last = map[string]time.Time{}
	}
	if t, ok := c.last[key]; ok && now.Sub(t) < statusCooldown {
		return false
	}
	if len(c.last) >= cooldownCap {
		for k, t := range c.last {
			if now.Sub(t) >= statusCooldown {
				delete(c.last, k)
			}
		}
		if len(c.last) >= cooldownCap {
			c.last = map[string]time.Time{}
		}
	}
	c.last[key] = now
	return true
}

// TaskPayload is the JSON pushed for an assignment or a status change. Title is
// present only when the device opted in to titles and the title is readable.
type TaskPayload struct {
	Type      string `json:"type"` // "assigned" or "status"
	TaskID    string `json:"taskId"`
	ActorName string `json:"actorName"`
	Completed *bool  `json:"completed,omitempty"` // status only
	Title     string `json:"title,omitempty"`
}

// Assigned implements notify.Sink. A rotating task's turn passing is not an
// assignment by its author and is not pushed; the bell and channels say "It's
// your turn".
func (s *Service) Assigned(ctx context.Context, e notify.Assigned) {
	if e.Turn {
		return
	}
	s.notifyTask(ctx, e.AssigneeID, func(n Notify) bool { return n.Assigned },
		TaskPayload{Type: "assigned", TaskID: e.TaskID, ActorName: e.ActorName}, e.TaskTitle)
}

// StatusChanged implements notify.StatusSink. A task's status pushes to one
// recipient pause for statusCooldown after one is sent.
func (s *Service) StatusChanged(ctx context.Context, e notify.StatusChanged) {
	if !s.cooldowns.allow(e.TaskID+"\x00"+e.AssigneeID, s.now()) {
		return
	}
	completed := e.Completed
	s.notifyTask(ctx, e.AssigneeID, func(n Notify) bool { return n.Status },
		TaskPayload{Type: "status", TaskID: e.TaskID, ActorName: e.ActorName, Completed: &completed}, e.TaskTitle)
}

func (s *Service) notifyTask(ctx context.Context, uid string, wants func(Notify) bool, p TaskPayload, title string) {
	p.ActorName = actorName(p.ActorName)
	select {
	case s.senders <- struct{}{}:
	default:
		s.log.Warn("push: notification dropped, senders busy", "type", p.Type)
		return
	}
	ctx = context.WithoutCancel(ctx)
	s.inflight.Add(1)
	go func() {
		defer s.inflight.Done()
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
	var wg gosync.WaitGroup
	for _, sub := range targets {
		q := p
		if sub.IncludeContent && readable {
			q.Title = textutil.TruncateEllipsis(title, 200)
		}
		b, _ := json.Marshal(q)
		wg.Add(1)
		go func(sub *Subscription) {
			defer wg.Done()
			if res, err := s.Send(ctx, sub, b, topicFor(p.TaskID)); res == Failed {
				s.log.Warn("push send failed", "subscription", sub.ID, "err", err)
			}
		}(sub)
	}
	wg.Wait()
}

// actorName is the name a push may carry: a person's name, never their email
// address (the server falls back to the address for an account without a
// name); "" lets the device say "Someone".
func actorName(name string) string {
	if strings.Contains(name, "@") {
		return ""
	}
	return name
}
