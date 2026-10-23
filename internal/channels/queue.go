package channels

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"slices"
	"sync"
	"time"

	"github.com/pixari/opentodo/internal/ids"
	"github.com/pixari/opentodo/internal/notify"
	"github.com/pixari/opentodo/internal/webhook"
)

// Worker tuning, the webhooks' (design D8).
const (
	Concurrency      = 4
	AutoDisableAfter = 20
	PollInterval     = time.Second
	PruneInterval    = time.Hour
	LogRetention     = 30 * 24 * time.Hour
	LogLimit         = 50
	limitWindow      = time.Hour
	statusPending    = "pending"
	statusRetry      = "retry"
	statusDelivered  = "delivered"
	statusFailed     = "failed"
	statusSkipped    = "skipped"
	errRateLimited   = "rate_limited"
)

// ---- producers ----

// Assigned implements notify.Sink.
func (s *Service) Assigned(ctx context.Context, e notify.Assigned) {
	s.emit(ctx, e.AssigneeID, fmt.Sprintf("assigned:%s:%d", e.TaskID, e.At), event{kind: EventAssigned, key: txtAssigned, withKey: txtAssignedBy,
		taskID: e.TaskID, taskTitle: e.TaskTitle, actorName: e.ActorName, at: e.At})
}

// Mentioned implements notify.MentionSink.
func (s *Service) Mentioned(ctx context.Context, e notify.Mentioned) {
	ref := e.CommentID
	if ref == "" {
		ref = e.TaskID
	}
	s.emit(ctx, e.RecipientID, fmt.Sprintf("mentioned:%s:%d", ref, e.At), event{kind: EventMentioned, key: txtMentioned, withKey: txtMentionedBy,
		taskID: e.TaskID, taskTitle: e.TaskTitle, actorName: e.ActorName, excerpt: e.Excerpt, at: e.At})
}

// Unblocked implements notify.UnblockedSink.
func (s *Service) Unblocked(ctx context.Context, e notify.Unblocked) {
	s.emit(ctx, e.AssigneeID, fmt.Sprintf("unblocked:%s:%d", e.TaskID, e.At), event{kind: EventUnblocked, key: txtUnblocked, withKey: txtUnblockedWith,
		taskID: e.TaskID, taskTitle: e.TaskTitle, at: e.At})
}

// PageActivity implements notify.PageSink.
func (s *Service) PageActivity(ctx context.Context, e notify.PageEvent) {
	key, with := txtPageReplied, txtPageRepliedBy
	if e.Kind == notify.KindPageCompleted {
		key, with = txtPageDone, txtPageDoneBy
		if !e.Completed {
			key, with = txtPageReopened, txtPageReopenedBy
		}
	}
	title, guest := e.TaskTitle, e.GuestName
	if e.Encrypted {
		title, guest = "", ""
	}
	s.emit(ctx, e.PublisherID, fmt.Sprintf("page:%s:%s:%d", e.PageID, key, e.At), event{kind: EventPage, key: key, withKey: with,
		taskID: e.TaskID, pageID: e.PageID, taskTitle: title, actorName: guest, at: e.At})
}

// Reminder is one firing handed over by the reminder scheduler.
type Reminder struct {
	UserID, ID, TaskID string
	FireAt             int64
	Title              string // empty when it may not leave (ciphertext)
}

// Reminder queues a firing for the user's channels; calling it again for the
// same firing queues nothing (design D2).
func (s *Service) Reminder(ctx context.Context, r Reminder) {
	s.emit(ctx, r.UserID, fmt.Sprintf("reminder:%s:%d", r.ID, r.FireAt), event{kind: EventReminder, key: txtReminder, withKey: txtReminderWith,
		taskID: r.TaskID, taskTitle: r.Title, at: r.FireAt})
}

// emit queues e for every enabled channel of userID that receives its kind.
// Errors are logged: a sink never fails the change that caused it.
func (s *Service) emit(ctx context.Context, userID, dedupe string, e event) {
	if userID == "" || !s.enabled(ctx) {
		return
	}
	if err := s.enqueue(ctx, userID, dedupe, e); err != nil {
		s.log.Error("notification channels: queue failed", "event", e.kind, "err", err)
		return
	}
	s.Wake()
}

func (s *Service) enqueue(ctx context.Context, userID, dedupe string, e event) error {
	list, err := s.listEnabled(ctx, userID, e.kind)
	if err != nil || len(list) == 0 {
		return err
	}
	encrypted, err := s.encrypted(ctx, userID)
	if err != nil {
		return err
	}
	now := s.nowMs()
	var recent int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM notification_deliveries WHERE user_id = ? AND created_at > ? AND status <> ?`,
		userID, now-limitWindow.Milliseconds(), statusSkipped).Scan(&recent); err != nil {
		return err
	}
	for _, c := range list {
		msg := e.render(c.Lang, s.origin(c), c.IncludeTitles && !encrypted)
		raw, _ := json.Marshal(msg)
		status, next, lastErr := statusPending, any(now), any(nil)
		if recent >= HourlyLimit {
			status, next, lastErr = statusSkipped, nil, errRateLimited
		}
		res, err := s.db.ExecContext(ctx, `INSERT OR IGNORE INTO notification_deliveries (id, channel_id, user_id, event, dedupe_key, message, status, next_attempt_at, last_error, created_at)
			VALUES (?,?,?,?,?,?,?,?,?,?)`, ids.New(), c.ID, userID, e.kind, dedupe, string(raw), status, next, lastErr, now)
		if err != nil {
			return fmt.Errorf("queue message: %w", err)
		}
		if n, _ := res.RowsAffected(); n > 0 && status == statusPending {
			recent++
		}
	}
	return nil
}

// listEnabled returns the user's enabled channels that receive kind.
func (s *Service) listEnabled(ctx context.Context, userID, kind string) ([]Channel, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+columns+` FROM notification_channels WHERE user_id = ? AND enabled = 1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Channel
	for rows.Next() {
		c, err := scanChannel(rows)
		if err != nil {
			return nil, err
		}
		if slices.Contains(c.Events, kind) {
			out = append(out, *c)
		}
	}
	return out, rows.Err()
}

// origin is the address links point to: OPENTODO_BASE_URL, else the app's
// address the channel was saved from.
func (s *Service) origin(c Channel) string {
	if s.baseOrigin != "" {
		return s.baseOrigin
	}
	return c.origin
}

// ---- worker ----

// Wake nudges the worker to look at the queue now.
func (s *Service) Wake() {
	select {
	case s.wake <- struct{}{}:
	default:
	}
}

// Run is the single worker loop; it returns when ctx is cancelled, after the
// pass in progress (each send is bounded by SendTimeout).
func (s *Service) Run(ctx context.Context) {
	var lastPrune time.Time
	for {
		if ctx.Err() != nil {
			return
		}
		if now := s.now(); now.Sub(lastPrune) >= PruneInterval {
			if err := s.Prune(ctx); err != nil && ctx.Err() == nil {
				s.log.Error("notification channels: prune failed", "err", err)
			}
			lastPrune = now
		}
		if s.enabled(ctx) && s.ProcessDue(ctx) > 0 {
			continue
		}
		select {
		case <-ctx.Done():
			return
		case <-s.wake:
		case <-s.after(PollInterval):
		}
	}
}

type queued struct {
	id, channelID, event string
	msg                  Message
	attempts             int
	t                    target
}

// ProcessDue sends up to Concurrency due messages in parallel and records the
// outcomes; messages of disabled channels wait until the channel is enabled.
func (s *Service) ProcessDue(ctx context.Context) int {
	rows, err := s.db.QueryContext(ctx, `SELECT d.id, d.channel_id, d.event, d.message, d.attempts, c.kind, c.url, c.topic
		FROM notification_deliveries d JOIN notification_channels c ON c.id = d.channel_id
		WHERE d.status IN ('pending','retry') AND d.next_attempt_at <= ? AND c.enabled = 1
		ORDER BY d.next_attempt_at, d.created_at LIMIT ?`, s.nowMs(), Concurrency)
	if err != nil {
		if ctx.Err() == nil {
			s.log.Error("notification channels: poll failed", "err", err)
		}
		return 0
	}
	var batch []queued
	for rows.Next() {
		var q queued
		var raw string
		if err := rows.Scan(&q.id, &q.channelID, &q.event, &raw, &q.attempts, &q.t.kind, &q.t.url, &q.t.topic); err != nil {
			rows.Close()
			s.log.Error("notification channels: scan failed", "err", err)
			return 0
		}
		_ = json.Unmarshal([]byte(raw), &q.msg)
		q.t.id = q.channelID
		batch = append(batch, q)
	}
	rows.Close()
	if len(batch) == 0 {
		return 0
	}
	sec, err := s.secrets.Load()
	if err != nil {
		s.log.Error("notification channels: read secrets", "err", err)
		return 0
	}
	sendCtx := context.WithoutCancel(ctx)
	var wg sync.WaitGroup
	for _, q := range batch {
		q.t.token, q.t.userKey = sec.Value(q.channelID), sec.Value(q.channelID+".user")
		wg.Add(1)
		go func() {
			defer wg.Done()
			res := s.send(sendCtx, q.t, q.id, q.msg)
			if err := s.record(sendCtx, q, res); err != nil {
				s.log.Error("notification channels: record failed", "delivery", q.id, "err", err)
			}
		}()
	}
	wg.Wait()
	return len(batch)
}

// record stores an attempt's outcome, schedules a retry or finalises the
// message, and keeps the channel's consecutive-failure count.
func (s *Service) record(ctx context.Context, q queued, res outcome) error {
	now := s.nowMs()
	attempts := q.attempts + 1
	var code, errMsg any
	if res.code != 0 {
		code = res.code
	}
	if res.errMsg != "" {
		errMsg = res.errMsg
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if res.ok {
		if _, err = tx.ExecContext(ctx, `UPDATE notification_deliveries SET status=?, attempts=?, next_attempt_at=NULL, last_status_code=?, last_error=NULL, delivered_at=? WHERE id=?`,
			statusDelivered, attempts, code, now, q.id); err == nil {
			_, err = tx.ExecContext(ctx, `UPDATE notification_channels SET consecutive_failures=0, last_ok_at=?, last_error=NULL WHERE id=?`, now, q.channelID)
		}
	} else {
		wait, retry := webhook.Backoff(attempts, s.rand())
		if res.terminal {
			retry = false
		}
		if retry {
			_, err = tx.ExecContext(ctx, `UPDATE notification_deliveries SET status=?, attempts=?, next_attempt_at=?, last_status_code=?, last_error=? WHERE id=?`,
				statusRetry, attempts, now+wait.Milliseconds(), code, errMsg, q.id)
		} else {
			_, err = tx.ExecContext(ctx, `UPDATE notification_deliveries SET status=?, attempts=?, next_attempt_at=NULL, last_status_code=?, last_error=? WHERE id=?`,
				statusFailed, attempts, code, errMsg, q.id)
			if err == nil {
				_, err = tx.ExecContext(ctx, `UPDATE notification_channels SET consecutive_failures = consecutive_failures + 1, last_error=? WHERE id=?`, errMsg, q.channelID)
			}
			if err == nil {
				_, err = tx.ExecContext(ctx, `UPDATE notification_channels SET enabled=0, disabled_reason=?, updated_at=? WHERE id=? AND enabled=1 AND consecutive_failures >= ?`,
					DisabledFailing, now, q.channelID, AutoDisableAfter)
			}
		}
		if err == nil && retry {
			_, err = tx.ExecContext(ctx, `UPDATE notification_channels SET last_error=? WHERE id=?`, errMsg, q.channelID)
		}
	}
	if err != nil {
		return err
	}
	return tx.Commit()
}

// Prune drops log entries older than LogRetention and finished entries beyond
// the newest LogLimit per channel.
func (s *Service) Prune(ctx context.Context) error {
	cutoff := s.now().Add(-LogRetention).UnixMilli()
	if _, err := s.db.ExecContext(ctx, `DELETE FROM notification_deliveries WHERE created_at < ?`, cutoff); err != nil {
		return fmt.Errorf("prune old messages: %w", err)
	}
	_, err := s.db.ExecContext(ctx, `DELETE FROM notification_deliveries WHERE id IN (
		SELECT id FROM (
			SELECT id, status, ROW_NUMBER() OVER (PARTITION BY channel_id ORDER BY created_at DESC, rowid DESC) AS rn
			FROM notification_deliveries
		) WHERE rn > ? AND status IN ('delivered','failed','skipped'))`, LogLimit)
	if err != nil {
		return fmt.Errorf("prune message log: %w", err)
	}
	return nil
}

// ---- log and test ----

// Delivery is one entry of a channel's log: never a secret.
type Delivery struct {
	ID             string `json:"id"`
	Event          string `json:"event"`
	Status         string `json:"status"`
	Attempts       int    `json:"attempts"`
	NextAttemptAt  *int64 `json:"nextAttemptAt"`
	LastStatusCode *int   `json:"lastStatusCode"`
	LastError      string `json:"lastError,omitempty"`
	CreatedAt      int64  `json:"createdAt"`
	DeliveredAt    *int64 `json:"deliveredAt"`
}

// Deliveries returns a channel's log, newest first.
func (s *Service) Deliveries(ctx context.Context, userID, channelID string) ([]Delivery, error) {
	if _, err := s.Get(ctx, userID, channelID); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id, event, status, attempts, next_attempt_at, last_status_code, COALESCE(last_error,''), created_at, delivered_at
		FROM notification_deliveries WHERE channel_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`, channelID, LogLimit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Delivery{}
	for rows.Next() {
		var d Delivery
		var next, delivered sql.NullInt64
		var code sql.NullInt64
		if err := rows.Scan(&d.ID, &d.Event, &d.Status, &d.Attempts, &next, &code, &d.LastError, &d.CreatedAt, &delivered); err != nil {
			return nil, err
		}
		if next.Valid {
			d.NextAttemptAt = &next.Int64
		}
		if delivered.Valid {
			d.DeliveredAt = &delivered.Int64
		}
		if code.Valid {
			c := int(code.Int64)
			d.LastStatusCode = &c
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// TestResult is the outcome of Send test.
type TestResult struct {
	Delivered  bool   `json:"delivered"`
	StatusCode int    `json:"statusCode,omitempty"`
	Error      string `json:"error,omitempty"`
}

// Test sends one test message through the channel now, without the queue.
func (s *Service) Test(ctx context.Context, userID, channelID string) (TestResult, error) {
	c, err := s.Get(ctx, userID, channelID)
	if err != nil {
		return TestResult{}, err
	}
	sec, err := s.secrets.Load()
	if err != nil {
		return TestResult{}, err
	}
	t := target{id: c.ID, kind: c.Kind, url: c.URL, topic: c.Topic, token: sec.Value(c.ID), userKey: sec.Value(c.ID + ".user")}
	res := s.send(context.WithoutCancel(ctx), t, "test-"+ids.New(), testMessage(c.Lang, s.origin(*c), s.nowMs()))
	now := s.nowMs()
	if res.ok {
		_, err = s.db.ExecContext(ctx, `UPDATE notification_channels SET last_ok_at=?, last_error=NULL WHERE id=?`, now, c.ID)
	} else {
		_, err = s.db.ExecContext(ctx, `UPDATE notification_channels SET last_error=? WHERE id=?`, res.errMsg, c.ID)
	}
	if err != nil {
		return TestResult{}, err
	}
	return TestResult{Delivered: res.ok, StatusCode: res.code, Error: res.errMsg}, nil
}
