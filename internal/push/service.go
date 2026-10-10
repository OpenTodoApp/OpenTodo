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
	"net/http"
	"strings"
	"sync"
	"time"

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
	// batchLimit bounds one tick's work.
	batchLimit = 500
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

	keyMu sync.Mutex
	keys  *Keys
	// lastTS keeps the server's delivered_at op timestamps strictly increasing.
	tsMu   sync.Mutex
	lastTS int64
}

// New wires a Service. Keys are created on first need, not here.
func New(db *sql.DB, syncSvc *opsync.Service, dataDir string, o Options) *Service {
	s := &Service{db: db, sync: syncSvc, dataDir: dataDir, subject: o.Subject, client: o.Client, allowHTTP: o.AllowHTTP, now: o.Now, log: o.Log}
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
		msg := fmt.Sprintf("push service answered %d", resp.StatusCode)
		_ = s.RecordFailure(context.WithoutCancel(ctx), sub.ID, msg)
		return Failed, errors.New(msg)
	}
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
}

// dueQuery selects reminders whose firing time has passed and that are not
// deleted, not delivered or dismissed for the current firing (a delivery or
// dismissal older than fire_at belongs to an earlier firing), and whose task is
// neither completed nor deleted. Values are JSON in fields.value.
const dueQuery = `
SELECT f.user_id, f.entity_id, CAST(f.value AS REAL), COALESCE(json_extract(tid.value, '$'), '')
FROM fields f
JOIN fields tid ON tid.user_id = f.user_id AND tid.entity = 'reminder' AND tid.entity_id = f.entity_id AND tid.field = 'task_id'
WHERE f.entity = 'reminder' AND f.field = 'fire_at' AND f.value <> 'null' AND CAST(f.value AS REAL) <= ?
  AND NOT EXISTS (SELECT 1 FROM fields x WHERE x.user_id = f.user_id AND x.entity = 'reminder' AND x.entity_id = f.entity_id
      AND x.field = 'deleted_at' AND x.value <> 'null')
  AND NOT EXISTS (SELECT 1 FROM fields x WHERE x.user_id = f.user_id AND x.entity = 'reminder' AND x.entity_id = f.entity_id
      AND x.field IN ('delivered_at', 'dismissed_at') AND x.value <> 'null' AND CAST(x.value AS REAL) >= CAST(f.value AS REAL))
  AND NOT EXISTS (SELECT 1 FROM fields x WHERE x.user_id = f.user_id AND x.entity = 'task' AND x.entity_id = json_extract(tid.value, '$')
      AND x.field IN ('completed_at', 'deleted_at') AND x.value <> 'null')
ORDER BY CAST(f.value AS REAL)
LIMIT ?`

func (s *Service) dueReminders(ctx context.Context, nowMs int64) ([]dueReminder, error) {
	rows, err := s.db.QueryContext(ctx, dueQuery, nowMs, batchLimit)
	if err != nil {
		return nil, fmt.Errorf("scan due reminders: %w", err)
	}
	defer rows.Close()
	var out []dueReminder
	for rows.Next() {
		var d dueReminder
		var fire float64
		if err := rows.Scan(&d.UserID, &d.ID, &fire, &d.TaskID); err != nil {
			return nil, err
		}
		d.FireAt = int64(fire)
		out = append(out, d)
	}
	return out, rows.Err()
}

// Tick pushes every due reminder once and records its delivery as an op
// authored by the server. It returns the number of reminders recorded.
func (s *Service) Tick(ctx context.Context) (int, error) {
	now := s.now()
	due, err := s.dueReminders(ctx, now.UnixMilli())
	if err != nil {
		return 0, err
	}
	subsByUser := map[string][]*Subscription{}
	recorded := 0
	for _, d := range due {
		subs, ok := subsByUser[d.UserID]
		if !ok {
			if subs, err = s.ListByUser(ctx, d.UserID); err != nil {
				return recorded, err
			}
			subsByUser[d.UserID] = subs
		}
		title := ""
		for _, sub := range subs {
			if sub.IncludeContent {
				title = s.taskTitle(ctx, d.UserID, d.TaskID)
				break
			}
		}
		attempted, transient := 0, 0
		for _, sub := range subs {
			attempted++
			res, err := s.Send(ctx, sub, BuildPayload(d.ID, d.TaskID, d.FireAt, title, sub.IncludeContent), topicFor(d.ID))
			if res == Failed {
				transient++
				s.log.Warn("push send failed", "subscription", sub.ID, "err", err)
			}
		}
		// Every send failed: try again on the next tick while the reminder is fresh.
		if attempted > 0 && transient == attempted && now.Sub(time.UnixMilli(d.FireAt)) < RetryWindow {
			continue
		}
		if err := s.recordDelivered(ctx, d.UserID, d.ID, now.UnixMilli()); err != nil {
			return recorded, err
		}
		recorded++
	}
	return recorded, nil
}

func (s *Service) taskTitle(ctx context.Context, userID, taskID string) string {
	var raw string
	err := s.db.QueryRowContext(ctx, `SELECT value FROM fields WHERE user_id=? AND entity='task' AND entity_id=? AND field='title'`, userID, taskID).Scan(&raw)
	if err != nil {
		return ""
	}
	var title string
	_ = json.Unmarshal([]byte(raw), &title)
	return title
}

func (s *Service) opTS(nowMs int64) int64 {
	s.tsMu.Lock()
	defer s.tsMu.Unlock()
	s.lastTS = max(nowMs, s.lastTS+1)
	return s.lastTS
}

// recordDelivered writes delivered_at as a server op. Its timestamp must beat the
// stored one even when a device's clock runs ahead (its "delivered_at: null" from
// creation would otherwise win and the reminder would be pushed on every tick),
// so it is at least one past the current field timestamp.
func (s *Service) recordDelivered(ctx context.Context, userID, reminderID string, nowMs int64) error {
	ts := nowMs
	var prev int64
	err := s.db.QueryRowContext(ctx, `SELECT ts FROM fields WHERE user_id=? AND entity='reminder' AND entity_id=? AND field='delivered_at'`,
		userID, reminderID).Scan(&prev)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	ts = max(ts, prev+1)
	op := opsync.Op{ID: ids.New(), Entity: "reminder", EntityID: reminderID, Field: "delivered_at",
		Value: json.RawMessage(fmt.Sprint(nowMs)), TS: s.opTS(ts), Device: "server"}
	res, err := s.sync.Apply(ctx, userID, []opsync.Op{op})
	if err != nil {
		return fmt.Errorf("record reminder delivery: %w", err)
	}
	if res.Applied > 0 {
		s.sync.Notifier().Notify(userID, "server", res.Seq)
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
