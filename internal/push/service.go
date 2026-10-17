package push

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/pixari/opentodo/internal/e2ee"
	"github.com/pixari/opentodo/internal/ids"
	opsync "github.com/pixari/opentodo/internal/sync"
	"github.com/pixari/opentodo/internal/webhook"
)

// Defaults of the scheduler and the sender.
const (
	// TickInterval is how often the scheduler looks for due reminders (the spec
	// requires at least once a minute).
	TickInterval = 30 * time.Second
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
	DefaultSubject = "https://github.com/pixari/opentodo"
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
}

// New wires a Service. Keys are created on first need, not here.
func New(db *sql.DB, syncSvc *opsync.Service, dataDir string, o Options) *Service {
	s := &Service{db: db, sync: syncSvc, dataDir: dataDir, subject: o.Subject, client: o.Client, allowHTTP: o.AllowHTTP, now: o.Now, log: o.Log,
		userBudget: UserSendBudget}
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
		p.Title = truncate(title, 200)
	}
	b, _ := json.Marshal(p)
	return b
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	for n > 0 && !utf8Start(s[n]) {
		n--
	}
	return s[:n] + "…"
}

func utf8Start(b byte) bool { return b&0xC0 != 0x80 }

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
	body, err := Encrypt(payload, p256dh, auth)
	if err != nil {
		_ = s.RecordFailure(ctx, sub.ID, err.Error())
		return Failed, err
	}
	authz, err := VAPIDAuthorization(sub.Endpoint, s.subject, k, s.now())
	if err != nil {
		_ = s.RecordFailure(ctx, sub.ID, err.Error())
		return Failed, err
	}
	ctx, cancel := context.WithTimeout(ctx, SendTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, sub.Endpoint, bytes.NewReader(body))
	if err != nil {
		_ = s.RecordFailure(ctx, sub.ID, err.Error())
		return Failed, err
	}
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set("Content-Encoding", "aes128gcm")
	req.Header.Set("TTL", fmt.Sprint(MessageTTL))
	req.Header.Set("Urgency", "high")
	req.Header.Set("Authorization", authz)
	if topic != "" {
		req.Header.Set("Topic", topic)
	}
	resp, err := s.client.Do(req)
	if err != nil {
		_ = s.RecordFailure(context.WithoutCancel(ctx), sub.ID, err.Error())
		return Failed, err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
	switch {
	case resp.StatusCode >= 200 && resp.StatusCode < 300:
		return Sent, s.recordOK(context.WithoutCancel(ctx), sub.ID)
	case resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone:
		s.log.Info("push subscription gone; removed", "subscription", sub.ID, "status", resp.StatusCode)
		return Gone, s.removeGone(context.WithoutCancel(ctx), sub.ID)
	default:
		serr := &StatusError{Code: resp.StatusCode}
		_ = s.RecordFailure(context.WithoutCancel(ctx), sub.ID, serr.Error())
		return Failed, serr
	}
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
// checked afterwards through sync.Get, which sees personal and shared scopes.
const dueQuery = `
SELECT f.scope_id, f.entity_id, CAST(f.value AS REAL), COALESCE(json_extract(tid.value, '$'), '')
FROM scope_fields f
JOIN scope_fields tid ON tid.scope_id = f.scope_id AND tid.entity = 'reminder' AND tid.entity_id = f.entity_id AND tid.field = 'task_id'
WHERE f.entity = 'reminder' AND f.field = 'fire_at' AND f.scope_id LIKE 'user:%' AND f.value <> 'null' AND CAST(f.value AS REAL) <= ?
  AND NOT EXISTS (SELECT 1 FROM scope_fields x WHERE x.scope_id = f.scope_id AND x.entity = 'reminder' AND x.entity_id = f.entity_id
      AND x.field = 'deleted_at' AND x.value <> 'null')
  AND NOT EXISTS (SELECT 1 FROM scope_fields x WHERE x.scope_id = f.scope_id AND x.entity = 'reminder' AND x.entity_id = f.entity_id
      AND x.field IN ('delivered_at', 'dismissed_at') AND x.value <> 'null' AND CAST(x.value AS REAL) >= CAST(f.value AS REAL))
ORDER BY CAST(f.value AS REAL)`

func (s *Service) dueReminders(ctx context.Context, nowMs int64) ([]dueReminder, error) {
	cands, err := s.candidates(ctx, nowMs, -1)
	if err != nil {
		return nil, err
	}
	var out []dueReminder
	trashed := map[string]bool{} // "<user>\x00<project>" -> in the Trash (this pass)
	for _, d := range cands {
		ok, err := s.eligible(ctx, &d, trashed)
		if err != nil {
			return nil, err
		}
		if !ok {
			continue
		}
		out = append(out, d)
		if len(out) == batchLimit {
			break
		}
	}
	return out, nil
}

// candidates runs dueQuery: undelivered reminders firing at or before
// maxFireMs, earliest first, at most limit rows (-1: all).
func (s *Service) candidates(ctx context.Context, maxFireMs int64, limit int) ([]dueReminder, error) {
	rows, err := s.db.QueryContext(ctx, dueQuery+" LIMIT ?", maxFireMs, limit)
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
// project is in the Trash. It fills in the title that may be pushed.
func (s *Service) eligible(ctx context.Context, d *dueReminder, trashed map[string]bool) (bool, error) {
	t, err := s.sync.Get(ctx, d.UserID, "task", d.TaskID)
	if err != nil {
		return false, err
	}
	if t == nil || t.Deleted() || !isNull(t["completed_at"]) {
		return false, nil
	}
	inTrash, err := s.projectTrashed(ctx, d.UserID, jsonString(t["project_id"]), trashed)
	if err != nil {
		return false, err
	}
	if inTrash {
		// Not recorded as delivered: once the project is restored the
		// reminder is delivered on the next pass (OpenSpec `reminders`).
		return false, nil
	}
	// An end-to-end encrypted title (OpenSpec `e2ee`) is never pushed, not even
	// as ciphertext: the notification falls back to the content-free text.
	if title := jsonString(t["title"]); !e2ee.IsCiphertext(title) {
		d.Title = title
	}
	return true, nil
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
	trashed := map[string]bool{}
	for _, d := range cands {
		ok, err := s.eligible(ctx, &d, trashed)
		if err != nil {
			return time.Time{}, false, err
		}
		if ok {
			return time.UnixMilli(d.FireAt), true, nil
		}
	}
	return time.Time{}, false, nil
}

// maxProjectDepth bounds the ancestor walk; the seen set already stops cycles.
const maxProjectDepth = 64

// projectTrashed reports whether project id, or any project above it through
// parent_id, carries a tombstone in the user's view. A project the user cannot
// see ends the walk. Results are cached for one pass in cache.
func (s *Service) projectTrashed(ctx context.Context, userID, id string, cache map[string]bool) (bool, error) {
	var path []string
	seen := map[string]bool{}
	result := false
	for depth := 0; id != "" && !seen[id] && depth < maxProjectDepth; depth++ {
		key := userID + "\x00" + id
		if v, ok := cache[key]; ok {
			result = v
			break
		}
		seen[id] = true
		path = append(path, key)
		p, err := s.sync.Get(ctx, userID, "project", id)
		if err != nil {
			return false, err
		}
		if p == nil {
			break
		}
		if p.Deleted() {
			result = true
			break
		}
		id = jsonString(p["parent_id"])
	}
	for _, k := range path {
		cache[k] = result
	}
	return result, nil
}

func isNull(raw json.RawMessage) bool { return len(raw) == 0 || string(raw) == "null" }

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
	ts := nowMs
	var prev int64
	err := s.db.QueryRowContext(ctx, `SELECT ts FROM scope_fields WHERE scope_id=? AND entity='reminder' AND entity_id=? AND field='delivered_at'`,
		opsync.PersonalScope(userID), reminderID).Scan(&prev)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	ts = max(ts, prev+1)
	op := opsync.Op{ID: ids.New(), Entity: "reminder", EntityID: reminderID, Field: "delivered_at",
		Value: json.RawMessage(fmt.Sprint(nowMs)), TS: s.sync.ServerTSAt(ts), Device: opsync.ServerDevice}
	res, err := s.sync.Apply(ctx, userID, []opsync.Op{op})
	if err != nil {
		return fmt.Errorf("record reminder delivery: %w", err)
	}
	if res.Applied > 0 {
		s.sync.NotifyApplied(res, opsync.ServerDevice)
	}
	return nil
}

// Run ticks until ctx is cancelled, starting with an immediate pass so
// reminders that fell due while the server was down go out after startup.
func (s *Service) Run(ctx context.Context) {
	t := time.NewTicker(TickInterval)
	defer t.Stop()
	for {
		if n, err := s.Tick(ctx); err != nil {
			if ctx.Err() != nil {
				return
			}
			s.log.Error("reminder scheduler", "err", err)
		} else if n > 0 {
			s.log.Debug("reminders delivered", "count", n)
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}
