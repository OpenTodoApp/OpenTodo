package davpush

import (
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/caldav"
	"github.com/OpenTodoApp/opentodo/internal/push"
)

// MaxUsersPerRun caps the accounts one run looks at, so a server with many
// subscriptions never spins; the rest are due again on the next run.
const MaxUsersPerRun = 50

// The run's time limits, so push resources that accept a connection and never
// answer cannot stall the tenant's other jobs (reminders run in the same
// scheduler). Accounts are served by push.SendWorkers workers at once; one
// account's sends stop after push.UserSendBudget, the whole run after RunBudget,
// and what is left is due again on the next run.
const RunBudget = time.Minute

// Changes is what changed in the calendars an app password sees since a cursor,
// as a sync-collection report would list it (design D5).
type Changes struct {
	// Cursor is the newest position, and SyncToken the token a client gets for it.
	Cursor    int64
	SyncToken string
	// Calendars are the calendars a changed task is in now.
	Calendars map[string]bool
	// All: a task was deleted, purged or moved, so any calendar may list it.
	All bool
	// CalendarSet: a calendar appeared, disappeared or was archived (home only).
	CalendarSet bool
}

// ChangesFunc reports the changes for one of the user's app passwords.
type ChangesFunc func(ctx context.Context, userID, appPasswordID string, since int64) (Changes, error)

// Sender posts one Web Push message (push.Service).
type Sender interface {
	SendMessage(ctx context.Context, endpoint string, m push.Message) (int, error)
}

// Job sends the pushes (design D5–D7). Its fields are wired by the tenant.
type Job struct {
	Store *Store
	// Enabled reports CalDAV and push to calendar apps both on.
	Enabled func(ctx context.Context) bool
	// Cursor is a user's op cursor (sync.Service.Cursor).
	Cursor  func(ctx context.Context, userID string) (int64, error)
	Changes ChangesFunc
	Send    Sender
	Log     *slog.Logger
	// UserBudget and RunLimit are push.UserSendBudget and RunBudget; tests shorten them.
	UserBudget, RunLimit time.Duration
}

func (j *Job) log() *slog.Logger {
	if j.Log == nil {
		return slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	return j.Log
}

func (j *Job) ready(ctx context.Context) bool {
	return j.Store != nil && j.Changes != nil && j.Send != nil && j.Cursor != nil && j.Enabled != nil && j.Enabled(ctx)
}

// NextDue is the earliest time a subscription has something to send or
// expires; nothing while push is off.
func (j *Job) NextDue(ctx context.Context) (time.Time, bool, error) {
	if !j.ready(ctx) {
		return time.Time{}, false, nil
	}
	live, err := j.Store.live(ctx)
	if err != nil {
		return time.Time{}, false, err
	}
	var at time.Time
	found := false
	earliest := func(t time.Time) {
		if !found || t.Before(at) {
			at, found = t, true
		}
	}
	for uid, subs := range live {
		cursor, err := j.Cursor(ctx, uid)
		if err != nil {
			return time.Time{}, false, err
		}
		for _, x := range subs {
			earliest(time.UnixMilli(x.ExpiresAt))
			if cursor > x.LastNotifiedSeq {
				earliest(time.UnixMilli(x.LastSentAt).Add(MinGap))
			}
		}
	}
	return at, found, nil
}

// RunOnce sends what is due to at most MaxUsersPerRun accounts.
func (j *Job) RunOnce(ctx context.Context) {
	if !j.ready(ctx) {
		return
	}
	log := j.log()
	if err := j.Store.expire(ctx); err != nil {
		log.Warn("davpush: expire", "err", err)
	}
	live, err := j.Store.live(ctx)
	if err != nil {
		log.Warn("davpush: list subscriptions", "err", err)
		return
	}
	users := make([]string, 0, len(live))
	for uid := range live {
		users = append(users, uid)
	}
	sort.Strings(users)
	limit := j.RunLimit
	if limit <= 0 {
		limit = RunBudget
	}
	ctx, cancel := context.WithTimeout(ctx, limit)
	defer cancel()
	var done atomic.Int64
	var wg sync.WaitGroup
	work := make(chan string)
	for range min(push.SendWorkers, len(users)) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for uid := range work {
				// An account that ran, without an error, counts toward the cap; one
				// whose changes cannot be read does not take another's place.
				ran, err := j.runUser(ctx, uid, live[uid])
				if err != nil && ctx.Err() == nil {
					log.Warn("davpush: user", "user", uid, "err", err)
				}
				if ran && err == nil {
					done.Add(1)
				}
			}
		}()
	}
	for _, uid := range users {
		if done.Load() >= MaxUsersPerRun || ctx.Err() != nil {
			break
		}
		work <- uid
	}
	close(work)
	wg.Wait()
}

// runUser handles one account's due subscriptions; ran is false when none was due.
func (j *Job) runUser(ctx context.Context, uid string, subs []*Subscription) (bool, error) {
	cursor, err := j.Cursor(ctx, uid)
	if err != nil {
		return true, err
	}
	now := j.Store.now()
	type key struct {
		password string
		since    int64
	}
	seen := map[key]Changes{}
	ran := false
	budget := j.UserBudget
	if budget <= 0 {
		budget = push.UserSendBudget
	}
	start := time.Now()
	for _, x := range subs {
		if cursor <= x.LastNotifiedSeq || now.Before(time.UnixMilli(x.LastSentAt).Add(MinGap)) {
			continue
		}
		// Out of this account's budget or the run's: the rest wait for the next run.
		if time.Since(start) >= budget || ctx.Err() != nil {
			break
		}
		ran = true
		k := key{x.AppPasswordID, x.LastNotifiedSeq}
		ch, ok := seen[k]
		if !ok {
			if ch, err = j.Changes(ctx, uid, x.AppPasswordID, x.LastNotifiedSeq); err != nil {
				return true, err
			}
			seen[k] = ch
		}
		if !due(x, ch) {
			if err := j.Store.notified(ctx, x.ID, ch.Cursor, false); err != nil {
				return true, err
			}
			continue
		}
		j.send(ctx, x, ch)
	}
	return ran, nil
}

// due reports whether a subscription's collection changed (design D5).
func due(x *Subscription, ch Changes) bool {
	if ch.All {
		return true
	}
	if x.Collection == Home {
		return len(ch.Calendars) > 0 || ch.CalendarSet
	}
	return ch.Calendars[x.Collection]
}

// send pushes one message (design D6) and records the answer (design D7).
func (j *Job) send(ctx context.Context, x *Subscription, ch Changes) {
	log := j.log()
	topic, err := j.Store.Topic(x.UserID, x.Collection)
	if err != nil {
		log.Warn("davpush: topic", "err", err)
		return
	}
	p256dh, err1 := base64.RawURLEncoding.DecodeString(x.P256DH)
	auth, err2 := base64.RawURLEncoding.DecodeString(x.Auth)
	if err1 != nil || err2 != nil {
		_ = j.Store.gone(ctx, x.ID)
		return
	}
	status, err := j.Send.SendMessage(ctx, x.PushResource, push.Message{Payload: caldav.PushMessage(topic, ch.SyncToken),
		P256DH: p256dh, Auth: auth, Topic: topic, TTL: MessageTTL, Urgency: "normal"})
	switch {
	case err != nil:
		j.Store.failed(context.WithoutCancel(ctx), x.ID, err.Error(), log)
	case status == http.StatusNotFound || status == http.StatusGone:
		if err := j.Store.gone(context.WithoutCancel(ctx), x.ID); err != nil {
			log.Warn("davpush: remove gone", "err", err)
		}
	case status >= 200 && status < 300:
		if err := j.Store.notified(context.WithoutCancel(ctx), x.ID, ch.Cursor, true); err != nil {
			log.Warn("davpush: record push", "err", err)
		}
	default:
		j.Store.failed(context.WithoutCancel(ctx), x.ID, fmt.Sprintf("push service answered %d", status), log)
	}
}
