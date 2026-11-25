package push

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/OpenTodoApp/opentodo/internal/kept"
	"io"
	"log/slog"
	"math"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/digest"
	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/habits"
	"github.com/OpenTodoApp/opentodo/internal/ids"
	"github.com/OpenTodoApp/opentodo/internal/recurrence"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
	"github.com/OpenTodoApp/opentodo/internal/textutil"
	"github.com/OpenTodoApp/opentodo/internal/webhook"
)

// Defaults of the scheduler and the sender.
const (
	// RetryPause is how long the reminders job waits before another pass when
	// reminders are still due after one (failed sends, the batch limit).
	RetryPause = 30 * time.Second
	// SendTimeout caps each request to a push service.
	SendTimeout = 10 * time.Second
	// MessageTTL is how long a push service keeps an undelivered message (seconds).
	MessageTTL = 4 * 60 * 60
	// RetryWindow: a reminder whose every send failed transiently is retried on
	// the next ticks until it is this much overdue, then recorded as delivered.
	RetryWindow = time.Hour
	// batchLimit bounds the reminders pushed in one tick.
	batchLimit = 500
	// SendWorkers is how many accounts' reminders are sent at the same time, so
	// one account's slow push endpoints do not hold back everyone (INT-4).
	SendWorkers = 8
	// UserSendBudget bounds the time one account's sends take in one tick; the
	// rest wait for the next tick.
	UserSendBudget = 20 * time.Second
	// DefaultSubject is the VAPID contact when no base URL is configured.
	DefaultSubject = "https://github.com/OpenTodoApp/OpenTodo"
)

// Options configure a Service.
type Options struct {
	Log *slog.Logger
	// Subject is the VAPID "sub" claim (a mailto: or https: URI); DefaultSubject when empty.
	Subject string
	// Client sends to push services; the default is the SSRF-safe webhook client
	// (no proxy, no redirects, private addresses refused, 10 s timeout).
	Client *http.Client
	// AllowHTTP accepts http:// endpoints (tests and local fakes only).
	AllowHTTP bool
	Now       func() time.Time
}

// Service owns push keys, subscriptions and the reminder scheduler.
type Service struct {
	db        *sql.DB
	sync      *opsync.Service
	dataDir   string
	subject   string
	client    *http.Client
	allowHTTP bool
	now       func() time.Time
	log       *slog.Logger
	// userBudget is UserSendBudget; tests shorten it.
	userBudget time.Duration

	keyMu sync.Mutex
	keys  *Keys

	// onDue receives every firing before the devices are pushed (OpenSpec
	// notification-channels D1): delivery channels queue it once per firing.
	onDue func(ctx context.Context, r DueReminder)

	// zone is the user's time zone (nil: UTC), for the logical day an away
	// period is read on (away-periods D4).
	zone func(ctx context.Context, uid string) *time.Location

	// senders bounds the background sends of assignment and status pushes
	// (assignee-notifications D3).
	senders   chan struct{}
	cooldowns statusCooldowns
	inflight  sync.WaitGroup // the background sends, waited for in tests
}

// DueReminder is a firing as the scheduler hands it to other consumers. Title
// is empty when it may not leave the server (end-to-end encrypted).
type DueReminder struct {
	UserID, ID, TaskID string
	FireAt             int64
	Title              string
}

// SetReminderHook installs a consumer called for every eligible due reminder on
// each pass, before the devices are pushed; it must be idempotent per firing,
// because a reminder whose pushes are retried is handed over again.
func (s *Service) SetReminderHook(f func(ctx context.Context, r DueReminder)) { s.onDue = f }

// SetUserZone installs the user's time zone, read for the logical day of an
// away period (away-periods D4).
func (s *Service) SetUserZone(f func(ctx context.Context, uid string) *time.Location) { s.zone = f }

// awayQuiet reports whether the user's away period pauses reminders on their
// logical today at now (away-periods D4).
func (s *Service) awayQuiet(ctx context.Context, uid string, now time.Time) (bool, error) {
	prefs, err := s.sync.Get(ctx, uid, "user_prefs", "me")
	if err != nil || prefs == nil {
		return false, err
	}
	away := jsonString(prefs["away"])
	if away == "" {
		return false, nil
	}
	var loc *time.Location
	if s.zone != nil {
		loc = s.zone(ctx, uid)
	}
	return opsync.QuietOn(away, habits.LogicalToday(now, loc, digest.DayStart(jsonString(prefs["day_start"])))), nil
}

// New wires a Service. Keys are created on first need, not here.
func New(db *sql.DB, syncSvc *opsync.Service, dataDir string, o Options) *Service {
	s := &Service{db: db, sync: syncSvc, dataDir: dataDir, subject: o.Subject, client: o.Client, allowHTTP: o.AllowHTTP, now: o.Now, log: o.Log,
		userBudget: UserSendBudget, senders: make(chan struct{}, notifySenders)}
	if s.subject == "" {
		s.subject = DefaultSubject
	}
	if s.client == nil {
		s.client = webhook.NewClient(&webhook.Dialer{})
	}
	if s.now == nil {
		s.now = time.Now
	}
	if s.log == nil {
		s.log = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	return s
}

// Keys loads (or on first use generates) the VAPID key pair.
func (s *Service) Keys() (*Keys, error) {
	s.keyMu.Lock()
	defer s.keyMu.Unlock()
	if s.keys != nil {
		return s.keys, nil
	}
	k, err := LoadOrCreateKeys(s.dataDir)
	if err != nil {
		return nil, err
	}
	s.keys = k
	return k, nil
}

// Payload is the JSON pushed for a due reminder. Title is present only when the
// device opted in to content; the task description is never sent.
type Payload struct {
	Type       string `json:"type"`
	ReminderID string `json:"reminderId"`
	TaskID     string `json:"taskId"`
	FireAt     int64  `json:"fireAt"`
	Title      string `json:"title,omitempty"`
}

// BuildPayload encodes the push message for one subscription.
func BuildPayload(reminderID, taskID string, fireAt int64, title string, includeContent bool) []byte {
	p := Payload{Type: "reminder", ReminderID: reminderID, TaskID: taskID, FireAt: fireAt}
	if includeContent {
		p.Title = textutil.TruncateEllipsis(title, 200)
	}
	b, _ := json.Marshal(p)
	return b
}

// SendResult classifies one send.
type SendResult int

const (
	// Sent: the push service accepted the message.
	Sent SendResult = iota
	// Gone: the subscription no longer exists (404/410); it was removed.
	Gone
	// Failed: any other failure; counted on the subscription.
	Failed
)

// Send encrypts payload for sub and posts it to the push service, updating the
// subscription's delivery bookkeeping. topic collapses repeated messages for
// the same reminder at the push service.
func (s *Service) Send(ctx context.Context, sub *Subscription, payload []byte, topic string) (SendResult, error) {
	k, err := s.Keys()
	if err != nil {
		return Failed, err
	}
	p256dh, err1 := decodeKey(sub.P256DH)
	auth, err2 := decodeKey(sub.Auth)
	if err1 != nil || err2 != nil {
		_ = s.RecordFailure(ctx, sub.ID, "stored keys are invalid")
		return Failed, errors.New("push: stored subscription keys are invalid")
	}
	status, err := s.post(ctx, s.client, k, sub.Endpoint, Message{Payload: payload, P256DH: p256dh, Auth: auth, Topic: topic, TTL: MessageTTL, Urgency: "high"})
	switch {
	case err != nil:
		_ = s.RecordFailure(context.WithoutCancel(ctx), sub.ID, err.Error())
		return Failed, err
	case status >= 200 && status < 300:
		return Sent, s.recordOK(context.WithoutCancel(ctx), sub.ID)
	case status == http.StatusNotFound || status == http.StatusGone:
		s.log.Info("push subscription gone; removed", "subscription", sub.ID, "status", status)
		return Gone, s.removeGone(context.WithoutCancel(ctx), sub.ID)
	default:
		serr := &StatusError{Code: status}
		_ = s.RecordFailure(context.WithoutCancel(ctx), sub.ID, serr.Error())
		return Failed, serr
	}
}

// Message is one Web Push message for a subscription the caller keeps
// (caldav-push: the WebDAV-Push subscriptions of calendar apps).
type Message struct {
	Payload      []byte
	P256DH, Auth []byte // the subscription's keys, decoded
	Topic        string // collapses undelivered messages at the push service ("" for none)
	TTL          int    // seconds the push service keeps it undelivered
	Urgency      string // RFC 8030: very-low, low, normal or high
}

// SendMessage encrypts m (RFC 8291) and posts it to endpoint with the server's
// VAPID key (RFC 8292), through the same client as reminders, and returns the
// push service's status. It keeps no bookkeeping: the caller does.
func (s *Service) SendMessage(ctx context.Context, endpoint string, m Message) (int, error) {
	k, err := s.Keys()
	if err != nil {
		return 0, err
	}
	return s.post(ctx, s.client, k, endpoint, m)
}

// Through is a sender that posts with the server's keys through another client,
// one with another outbound policy (caldav-push: the webhook client, which
// honours the owner's "allow private targets" as the registration check does).
func (s *Service) Through(client *http.Client) *Through { return &Through{s: s, client: client} }

// Through sends like SendMessage, through its own client.
type Through struct {
	s      *Service
	client *http.Client
}

// SendMessage is Service.SendMessage through t's client.
func (t *Through) SendMessage(ctx context.Context, endpoint string, m Message) (int, error) {
	k, err := t.s.Keys()
	if err != nil {
		return 0, err
	}
	return t.s.post(ctx, t.client, k, endpoint, m)
}

func (s *Service) post(ctx context.Context, client *http.Client, k *Keys, endpoint string, m Message) (int, error) {
	body, err := Encrypt(m.Payload, m.P256DH, m.Auth)
	if err != nil {
		return 0, err
	}
	authz, err := VAPIDAuthorization(endpoint, s.subject, k, s.now())
	if err != nil {
		return 0, err
	}
	ctx, cancel := context.WithTimeout(ctx, SendTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set("Content-Encoding", "aes128gcm")
	req.Header.Set("TTL", fmt.Sprint(m.TTL))
	req.Header.Set("Urgency", m.Urgency)
	req.Header.Set("Authorization", authz)
	if m.Topic != "" {
		req.Header.Set("Topic", m.Topic)
	}
	resp, err := client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
	return resp.StatusCode, nil
}

// StatusError is a push service's answer other than success or gone.
type StatusError struct{ Code int }

func (e *StatusError) Error() string { return fmt.Sprintf("push service answered %d", e.Code) }

// TestPayload is the JSON pushed by a test notification (OpenSpec change
// push-test-delivery, design D1). It carries no task data.
type TestPayload struct {
	Type   string `json:"type"`
	TestID string `json:"testId"`
	SentAt int64  `json:"sentAt"`
}

// SendTest sends one test push to sub through Send, so it updates the delivery
// bookkeeping (last delivery, failures, gone removal) exactly like a reminder.
// The topic "test" collapses tests still queued for an offline device.
func (s *Service) SendTest(ctx context.Context, sub *Subscription) (string, SendResult, error) {
	id := ids.Secret(16)
	payload, _ := json.Marshal(TestPayload{Type: "test", TestID: id, SentAt: s.now().UnixMilli()})
	res, err := s.Send(ctx, sub, payload, "test")
	return id, res, err
}

// topicFor turns a reminder id into a Topic header value (≤32 base64url chars).
func topicFor(reminderID string) string {
	t := strings.ReplaceAll(reminderID, "-", "")
	if len(t) > 32 {
		t = t[:32]
	}
	for _, c := range t {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '_') {
			return ""
		}
	}
	return t
}

// dueReminder is one row of the scheduler's scan.
type dueReminder struct {
	UserID, ID, TaskID string
	FireAt             int64
	Title              string
}

// dueQuery selects reminders whose firing time has passed and that are not
// deleted and not delivered or dismissed for the current firing (a delivery or
// dismissal older than fire_at belongs to an earlier firing). Reminders are
// personal (OpenSpec `reminders`, `project-sharing`): they always live in their
// creator's personal scope "user:<id>", even on a task in a shared project, so
// the scope names the user whose devices are notified. The task's state is
// checked afterwards through sync.Get, which sees personal and shared scopes;
// a reminder whose task is completed is then recorded as dismissed, so it
// leaves this query for good (reliable-background-jobs). One on a deleted task
// stays until the task is restored or purged from the Trash. A location
// reminder ("arrive", "leave", OpenSpec change location-reminders) has no
// firing time and fires only on a phone; the kind check also keeps out one
// whose fire_at a concurrent edit merged in, so the server never pushes,
// dismisses or counts it.
const dueQuery = `
SELECT f.scope_id, f.entity_id, CAST(f.value AS REAL), COALESCE(json_extract(tid.value, '$'), '')
FROM scope_fields f
JOIN scope_fields tid ON tid.scope_id = f.scope_id AND tid.entity = 'reminder' AND tid.entity_id = f.entity_id AND tid.field = 'task_id'
WHERE f.entity = 'reminder' AND f.field = 'fire_at' AND f.scope_id LIKE 'user:%' AND f.value <> 'null' AND CAST(f.value AS REAL) <= ?
  AND NOT EXISTS (SELECT 1 FROM scope_fields x WHERE x.scope_id = f.scope_id AND x.entity = 'reminder' AND x.entity_id = f.entity_id
      AND x.field = 'deleted_at' AND x.value <> 'null')
  AND NOT EXISTS (SELECT 1 FROM scope_fields x WHERE x.scope_id = f.scope_id AND x.entity = 'reminder' AND x.entity_id = f.entity_id
      AND x.field = 'kind' AND x.value IN ('"arrive"', '"leave"'))
  AND NOT EXISTS (SELECT 1 FROM scope_fields x WHERE x.scope_id = f.scope_id AND x.entity = 'reminder' AND x.entity_id = f.entity_id
      AND x.field IN ('delivered_at', 'dismissed_at') AND x.value <> 'null' AND CAST(x.value AS REAL) >= CAST(f.value AS REAL))`

// dueOrder is the scan order; it is also the keyset the pages resume from.
const dueOrder = ` ORDER BY CAST(f.value AS REAL), f.scope_id, f.entity_id`

// scanPage is how many candidates one query of the scheduler's scan reads.
const scanPage = 500

func (s *Service) dueReminders(ctx context.Context, nowMs int64) ([]dueReminder, error) {
	var out []dueReminder
	quiet := map[string]bool{} // "<user>\x00<project>" -> in the Trash or archived (this pass)
	away := map[string]bool{}  // user -> away with reminders paused (this pass)
	var after *dueReminder
	for {
		cands, err := s.candidates(ctx, nowMs, scanPage, after)
		if err != nil {
			return nil, err
		}
		for i := range cands {
			d := cands[i]
			ok, closed, err := s.eligible(ctx, &d, quiet)
			if err != nil {
				return nil, err
			}
			if closed {
				// Its task is completed: it will never fire for this firing
				// time, so stop examining it on every pass.
				if err := s.recordDismissed(ctx, d.UserID, d.ID, nowMs); err != nil {
					return nil, err
				}
				continue
			}
			if !ok {
				continue
			}
			held, seen := away[d.UserID]
			if !seen {
				if held, err = s.awayQuiet(ctx, d.UserID, time.UnixMilli(nowMs)); err != nil {
					return nil, err
				}
				away[d.UserID] = held
			}
			if held {
				// Away with reminders paused: dropped, not delivered later
				// (away-periods D4); the reminder stays on the task.
				if err := s.recordDismissed(ctx, d.UserID, d.ID, nowMs); err != nil {
					return nil, err
				}
				continue
			}
			out = append(out, d)
			if len(out) == batchLimit {
				return out, nil
			}
		}
		if len(cands) < scanPage {
			return out, nil
		}
		after = &cands[len(cands)-1]
	}
}

// candidates runs dueQuery: undelivered reminders firing at or before
// maxFireMs, earliest first, at most limit rows (-1: all), after the given
// one in scan order when after is set.
func (s *Service) candidates(ctx context.Context, maxFireMs int64, limit int, after ...*dueReminder) ([]dueReminder, error) {
	q, args := dueQuery, []any{maxFireMs}
	if len(after) > 0 && after[0] != nil {
		a := after[0]
		q += ` AND (CAST(f.value AS REAL), f.scope_id, f.entity_id) > (?, ?, ?)`
		args = append(args, float64(a.FireAt), opsync.PersonalScope(a.UserID), a.ID)
	}
	rows, err := s.db.QueryContext(ctx, q+dueOrder+" LIMIT ?", append(args, limit)...)
	if err != nil {
		return nil, fmt.Errorf("scan due reminders: %w", err)
	}
	defer rows.Close()
	var cands []dueReminder
	for rows.Next() {
		var d dueReminder
		var scope string
		var fire float64
		if err := rows.Scan(&scope, &d.ID, &fire, &d.TaskID); err != nil {
			return nil, err
		}
		d.UserID = strings.TrimPrefix(scope, "user:")
		d.FireAt = int64(fire)
		cands = append(cands, d)
	}
	return cands, rows.Err()
}

// eligible reports whether a candidate fires: only reminders on an open task
// the user can still see, and not while the task's project or any ancestor
// project is in the Trash or archived. It fills in the title that may be pushed. closed
// reports a completed task: its reminder never fires for this firing time.
func (s *Service) eligible(ctx context.Context, d *dueReminder, quiet map[string]bool) (ok, closed bool, err error) {
	t, err := s.sync.Get(ctx, d.UserID, "task", d.TaskID)
	if err != nil {
		return false, false, err
	}
	if t == nil || t.Deleted() {
		// A deleted task is in the Trash: nothing is recorded, so restoring it
		// brings the reminder back (OpenSpec `reminders`).
		return false, false, nil
	}
	// A graduated habit fires no reminder (habits-home D7); Resume continues it as
	// a new piece with its own copies of the reminders.
	if !opsync.IsNull(t["completed_at"]) || !recurrence.Available(t["habit_graduated_at"]) {
		return false, true, nil
	}
	waits, err := s.inQuietProject(ctx, d.UserID, jsonString(t["project_id"]), quiet)
	if err != nil {
		return false, false, err
	}
	if !waits {
		// A kept subtask (open under a completed ancestor, keep-open-subtasks D5)
		// waits like a task in a quiet project: reopening the parent lets it fire.
		if waits, err = s.keptTask(ctx, d.UserID, t); err != nil {
			return false, false, err
		}
	}
	if waits {
		// Not recorded as delivered: once the project is restored or
		// unarchived the reminder is delivered on the next pass (OpenSpec
		// `reminders`).
		return false, false, nil
	}
	// An end-to-end encrypted title (OpenSpec `e2ee`) is never pushed, not even
	// as ciphertext: the notification falls back to the content-free text.
	if title := jsonString(t["title"]); !e2ee.IsCiphertext(title) {
		d.Title = title
	}
	return true, false, nil
}

// keptTask reports whether t is a kept subtask, reading its ancestors.
func (s *Service) keptTask(ctx context.Context, uid string, t opsync.Entity) (bool, error) {
	self := kept.Of(t)
	if self.Completed || self.Deleted || self.ParentID == "" {
		return false, nil
	}
	chain := map[string]kept.Task{}
	for id, n := self.ParentID, 0; id != "" && n < 1000; n++ {
		if _, seen := chain[id]; seen || id == self.ID {
			break
		}
		up, err := s.sync.Get(ctx, uid, "task", id)
		if err != nil {
			return false, err
		}
		if up == nil {
			break
		}
		row := kept.Of(up)
		chain[id] = row
		if row.Deleted || row.Completed {
			break
		}
		id = row.ParentID
	}
	return kept.Is(self, func(id string) (kept.Task, bool) { x, ok := chain[id]; return x, ok }), nil
}

// nextScan bounds how many candidates NextDue examines.
const nextScan = 1000

// NextDue is the firing time of the earliest reminder Tick would push; ok is
// false when none is pending (a host's "next due" index, OpenSpec
// `multi-tenant-host`). A time in the past means a pass is due now.
func (s *Service) NextDue(ctx context.Context) (time.Time, bool, error) {
	cands, err := s.candidates(ctx, math.MaxInt64, nextScan)
	if err != nil {
		return time.Time{}, false, err
	}
	quiet := map[string]bool{}
	for _, d := range cands {
		ok, _, err := s.eligible(ctx, &d, quiet)
		if err != nil {
			return time.Time{}, false, err
		}
		if ok {
			return time.UnixMilli(d.FireAt), true, nil
		}
	}
	return time.Time{}, false, nil
}

func jsonString(raw json.RawMessage) string {
	var v string
	_ = json.Unmarshal(raw, &v)
	return v
}

// Tick pushes every due reminder once and records its delivery as an op
// authored by the server. It returns the number of reminders recorded.
// Accounts are served by SendWorkers workers at once, each account's
// reminders in order (INT-4); an error stops that account's pass and the first
// one is returned once every worker is done.
func (s *Service) Tick(ctx context.Context) (int, error) {
	now := s.now()
	due, err := s.dueReminders(ctx, now.UnixMilli())
	if err != nil {
		return 0, err
	}
	var users []string
	byUser := map[string][]dueReminder{}
	for _, d := range due {
		if _, ok := byUser[d.UserID]; !ok {
			users = append(users, d.UserID)
		}
		byUser[d.UserID] = append(byUser[d.UserID], d)
	}
	var (
		recorded atomic.Int64
		errOnce  sync.Once
		firstErr error
		wg       sync.WaitGroup
	)
	work := make(chan string)
	for range min(SendWorkers, len(users)) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for uid := range work {
				n, err := s.tickUser(ctx, now, uid, byUser[uid])
				recorded.Add(int64(n))
				if err != nil {
					errOnce.Do(func() { firstErr = err })
				}
			}
		}()
	}
	for _, uid := range users {
		work <- uid
	}
	close(work)
	wg.Wait()
	return int(recorded.Load()), firstErr
}

// tickUser pushes one account's due reminders to its enabled subscriptions and
// records each delivery. Once the account's sends took UserSendBudget, the
// remaining reminders wait for the next tick like failed ones.
func (s *Service) tickUser(ctx context.Context, now time.Time, userID string, due []dueReminder) (int, error) {
	subs, err := s.ListByUser(ctx, userID)
	if err != nil {
		return 0, err
	}
	start := time.Now()
	recorded := 0
	for _, d := range due {
		if s.onDue != nil {
			s.onDue(ctx, DueReminder(d))
		}
		attempted, transient, deferred := 0, 0, false
		for _, sub := range subs {
			if sub.Disabled(now) {
				continue
			}
			if time.Since(start) >= s.userBudget {
				deferred = true
				break
			}
			attempted++
			res, err := s.Send(ctx, sub, BuildPayload(d.ID, d.TaskID, d.FireAt, d.Title, sub.IncludeContent), topicFor(d.ID))
			if res == Failed {
				transient++
				s.log.Warn("push send failed", "subscription", sub.ID, "err", err)
			}
		}
		// Out of budget, or every send failed: try again on the next tick while
		// the reminder is fresh.
		retry := deferred || (attempted > 0 && transient == attempted)
		if retry && now.Sub(time.UnixMilli(d.FireAt)) < RetryWindow {
			continue
		}
		if err := s.recordDelivered(ctx, d.UserID, d.ID, now.UnixMilli()); err != nil {
			return recorded, err
		}
		recorded++
	}
	return recorded, nil
}

// recordDelivered writes delivered_at as a server op. Its timestamp must beat the
// stored one even when a device's clock runs ahead (its "delivered_at: null" from
// creation would otherwise win and the reminder would be pushed on every tick),
// so it is at least one past the current field timestamp.
func (s *Service) recordDelivered(ctx context.Context, userID, reminderID string, nowMs int64) error {
	// Recorded even when shutdown began during the send: a reminder pushed but
	// not marked delivered would be pushed again after the restart.
	if err := s.recordReminderField(context.WithoutCancel(ctx), userID, reminderID, "delivered_at", nowMs); err != nil {
		return fmt.Errorf("record reminder delivery: %w", err)
	}
	return nil
}

// recordDismissed writes dismissed_at as a server op for a reminder whose task
// is completed, the same way recordDelivered does.
func (s *Service) recordDismissed(ctx context.Context, userID, reminderID string, nowMs int64) error {
	if err := s.recordReminderField(ctx, userID, reminderID, "dismissed_at", nowMs); err != nil {
		return fmt.Errorf("dismiss reminder of a closed task: %w", err)
	}
	return nil
}

// recordReminderField writes field = nowMs on a reminder as a server op whose
// timestamp is at least one past the stored one.
func (s *Service) recordReminderField(ctx context.Context, userID, reminderID, field string, nowMs int64) error {
	ts := nowMs
	var prev int64
	err := s.db.QueryRowContext(ctx, `SELECT ts FROM scope_fields WHERE scope_id=? AND entity='reminder' AND entity_id=? AND field=?`,
		opsync.PersonalScope(userID), reminderID, field).Scan(&prev)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	ts = max(ts, prev+1)
	op := opsync.Op{ID: ids.New(), Entity: "reminder", EntityID: reminderID, Field: field,
		Value: json.RawMessage(fmt.Sprint(nowMs)), TS: s.sync.ServerTSAt(ts), Device: opsync.ServerDevice}
	res, err := s.sync.Apply(ctx, userID, []opsync.Op{op})
	if err != nil {
		return err
	}
	if res.Applied > 0 {
		s.sync.NotifyApplied(res, opsync.ServerDevice)
	}
	return nil
}
