package webhook

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/rand/v2"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/ids"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Limits from the design (D5).
const (
	MaxWebhooksPerUser = 20
	maxProjectIDLen    = opsync.MaxIDLen
)

// Setting key for the owner's private-network policy in the shared settings table.
const settingAllowPrivate = "webhooks_allow_private"

// DisabledTooManyFailures is the disabled_reason set by the auto-disable rule.
const DisabledTooManyFailures = "too_many_failures"

var (
	ErrNotFound = errors.New("not found")
	ErrInvalid  = errors.New("invalid input")
	ErrLimit    = errors.New("webhook limit reached")
)

// Webhook is the API view of one endpoint. Secret is filled only in the
// response to creation; reads never carry it.
type Webhook struct {
	ID                  string   `json:"id"`
	URL                 string   `json:"url"`
	Events              []string `json:"events"`
	ProjectID           *string  `json:"projectId"`
	Enabled             bool     `json:"enabled"`
	DisabledReason      *string  `json:"disabledReason"`
	ConsecutiveFailures int      `json:"consecutiveFailures"`
	CreatedAt           int64    `json:"createdAt"`
	UpdatedAt           int64    `json:"updatedAt"`
	Secret              string   `json:"secret,omitempty"`

	secret string
}

// Delivery is one row of the delivery log (and of the queue).
type Delivery struct {
	ID              string  `json:"id"`
	WebhookID       string  `json:"webhookId"`
	Event           string  `json:"event"`
	Status          string  `json:"status"` // pending, retry, delivered, failed
	Attempts        int     `json:"attempts"`
	NextAttemptAt   *int64  `json:"nextAttemptAt"`
	StatusCode      *int    `json:"statusCode"`
	Error           *string `json:"error"`
	ResponseExcerpt *string `json:"responseExcerpt"`
	DurationMs      *int64  `json:"durationMs"`
	CreatedAt       int64   `json:"createdAt"`
	DeliveredAt     *int64  `json:"deliveredAt"`
}

// Patch carries create and update input. *Set flags distinguish "absent" from
// "set to null/empty" for the nullable project filter and the event list.
type Patch struct {
	URL          *string
	Events       []string
	EventsSet    bool
	ProjectID    *string
	ProjectIDSet bool
	Enabled      *bool
}

// Options configures a Service. Zero values pick production defaults; tests
// inject a clock, a sleeper, a jitter source and an HTTP client.
type Options struct {
	Version string
	Log     *slog.Logger
	Now     func() time.Time
	After   func(time.Duration) <-chan time.Time
	Rand    func() float64 // in [0,1); 0.5 means no jitter
	Client  *http.Client   // defaults to NewClient with the owner policy
	// Resolver is used for the creation-time target check and by the default client.
	Resolver Resolver
}

// Service owns webhook configuration, the delivery queue and its worker.
type Service struct {
	db      *sql.DB
	sync    *opsync.Service
	log     *slog.Logger
	version string
	now     func() time.Time
	after   func(time.Duration) <-chan time.Time
	rand    func() float64
	client  *http.Client
	dialer  *Dialer
	wake    chan struct{}
}

// New wires a Service. Install it with syncSvc.SetObserver(svc.Observe) and run
// svc.Run in a goroutine.
func New(db *sql.DB, syncSvc *opsync.Service, o Options) *Service {
	s := &Service{db: db, sync: syncSvc, log: o.Log, version: o.Version, now: o.Now, after: o.After, rand: o.Rand,
		client: o.Client, wake: make(chan struct{}, 1)}
	if s.log == nil {
		s.log = slog.Default()
	}
	if s.version == "" {
		s.version = "dev"
	}
	if s.now == nil {
		s.now = time.Now
	}
	if s.after == nil {
		s.after = time.After
	}
	if s.rand == nil {
		s.rand = rand.Float64
	}
	s.dialer = &Dialer{Resolver: o.Resolver, AllowPrivate: s.AllowPrivate}
	if s.client == nil {
		s.client = NewClient(s.dialer)
	} else if s.dialer.Resolver == nil {
		s.dialer.Resolver = defaultResolver()
	}
	return s
}

func (s *Service) nowMs() int64 { return s.now().UnixMilli() }

// ---- owner policy ----

// AllowPrivate reports whether the owner allowed private network targets.
func (s *Service) AllowPrivate(ctx context.Context) bool {
	var v sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, settingAllowPrivate).Scan(&v)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		s.log.Error("webhooks: read policy", "err", err)
	}
	return v.Valid && v.String == "true"
}

// SetAllowPrivate stores the owner's policy.
func (s *Service) SetAllowPrivate(ctx context.Context, allow bool) error {
	return s.SetAllowPrivateAs(ctx, "", allow, nil)
}

// SetAllowPrivateAs stores the owner's policy on behalf of actorID and, when it
// changes, records a settings.changed audit event in the same transaction
// (OpenSpec `audit-log`). rec may be nil (no audit). The event carries only the
// setting name and the old and new booleans.
func (s *Service) SetAllowPrivateAs(ctx context.Context, actorID string, allow bool, rec *audit.Recorder) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var old sql.NullString
	if err := tx.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, settingAllowPrivate).Scan(&old); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("read webhook policy: %w", err)
	}
	before := old.Valid && old.String == "true"
	if _, err := tx.ExecContext(ctx, `INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		settingAllowPrivate, fmt.Sprint(allow), s.nowMs()); err != nil {
		return fmt.Errorf("store webhook policy: %w", err)
	}
	if before != allow {
		if err := rec.RecordTx(ctx, tx, audit.SettingsChanged(actorID, settingAllowPrivate, fmt.Sprint(before), fmt.Sprint(allow))); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// SeedAllowPrivate applies the optional OPENTODO_WEBHOOKS_ALLOW_PRIVATE preset the
// first time only: once the key exists, the value set in Settings wins.
func (s *Service) SeedAllowPrivate(ctx context.Context, preset *bool) error {
	if preset == nil {
		return nil
	}
	_, err := s.db.ExecContext(ctx, `INSERT OR IGNORE INTO settings(key,value,updated_at) VALUES(?,?,?)`,
		settingAllowPrivate, fmt.Sprint(*preset), s.nowMs())
	if err != nil {
		return fmt.Errorf("seed webhook policy: %w", err)
	}
	return nil
}

// ---- configuration CRUD ----

const webhookCols = `id, url, secret, events, project_id, enabled, disabled_reason, consecutive_failures, created_at, updated_at`

func scanWebhook(sc interface{ Scan(...any) error }) (*Webhook, error) {
	var w Webhook
	var events string
	var project, reason sql.NullString
	var enabled int
	if err := sc.Scan(&w.ID, &w.URL, &w.secret, &events, &project, &enabled, &reason, &w.ConsecutiveFailures, &w.CreatedAt, &w.UpdatedAt); err != nil {
		return nil, err
	}
	if err := json.Unmarshal([]byte(events), &w.Events); err != nil {
		return nil, fmt.Errorf("decode webhook events: %w", err)
	}
	if project.Valid {
		w.ProjectID = &project.String
	}
	if reason.Valid {
		w.DisabledReason = &reason.String
	}
	w.Enabled = enabled == 1
	return &w, nil
}

// List returns the user's webhooks, oldest first.
func (s *Service) List(ctx context.Context, userID string) ([]Webhook, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+webhookCols+` FROM webhooks WHERE user_id = ? ORDER BY created_at, id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Webhook{}
	for rows.Next() {
		w, err := scanWebhook(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *w)
	}
	return out, rows.Err()
}

// Get returns one of the user's webhooks or ErrNotFound (also for other users' ids).
func (s *Service) Get(ctx context.Context, userID, id string) (*Webhook, error) {
	w, err := scanWebhook(s.db.QueryRowContext(ctx, `SELECT `+webhookCols+` FROM webhooks WHERE id = ? AND user_id = ?`, id, userID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return w, err
}

// CheckTarget validates a URL and, unless private targets are allowed, refuses
// hosts that resolve only to denied addresses. A host that does not resolve
// right now is accepted; every delivery checks again anyway.
func (s *Service) CheckTarget(ctx context.Context, raw string) error {
	u, err := ValidateURL(raw)
	if err != nil {
		return err
	}
	_, err = s.dialer.Allowed(ctx, u.Hostname())
	if errors.Is(err, ErrPrivateTarget) {
		return ErrPrivateTarget
	}
	return nil
}

func normalizeEvents(in []string) ([]string, error) {
	if len(in) == 0 {
		return nil, fmt.Errorf("%w: events: choose at least one event", ErrInvalid)
	}
	out := make([]string, 0, len(in))
	for _, e := range in {
		if !KnownEvent(e) {
			return nil, fmt.Errorf("%w: events: unknown event %q", ErrInvalid, e)
		}
		if !slices.Contains(out, e) {
			out = append(out, e)
		}
	}
	// Keep the canonical order so reads are stable.
	slices.SortFunc(out, func(a, b string) int { return slices.Index(Events, a) - slices.Index(Events, b) })
	return out, nil
}

func normalizeProject(p *string) (*string, error) {
	if p == nil || strings.TrimSpace(*p) == "" {
		return nil, nil
	}
	v := strings.TrimSpace(*p)
	if len(v) > maxProjectIDLen {
		return nil, fmt.Errorf("%w: projectId: too long", ErrInvalid)
	}
	return &v, nil
}

// Create stores a new webhook with a fresh secret and returns it, secret included.
func (s *Service) Create(ctx context.Context, userID string, in Patch) (*Webhook, error) {
	if in.URL == nil {
		return nil, fmt.Errorf("%w: url: required", ErrInvalid)
	}
	url := strings.TrimSpace(*in.URL)
	if _, err := ValidateURL(url); err != nil {
		return nil, fmt.Errorf("%w: url: %s", ErrInvalid, strings.TrimPrefix(err.Error(), ErrBadURL.Error()+": "))
	}
	events, err := normalizeEvents(in.Events)
	if err != nil {
		return nil, err
	}
	project, err := normalizeProject(in.ProjectID)
	if err != nil {
		return nil, err
	}
	if err := s.CheckTarget(ctx, url); err != nil {
		return nil, err
	}
	var n int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM webhooks WHERE user_id = ?`, userID).Scan(&n); err != nil {
		return nil, err
	}
	if n >= MaxWebhooksPerUser {
		return nil, ErrLimit
	}
	enabled := in.Enabled == nil || *in.Enabled
	now := s.nowMs()
	w := &Webhook{ID: ids.New(), URL: url, Events: events, ProjectID: project, Enabled: enabled, CreatedAt: now, UpdatedAt: now, secret: NewSecret()}
	ev, _ := json.Marshal(events)
	_, err = s.db.ExecContext(ctx, `INSERT INTO webhooks(id,user_id,url,secret,events,project_id,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`,
		w.ID, userID, w.URL, w.secret, string(ev), project, boolInt(enabled), now, now)
	if err != nil {
		return nil, fmt.Errorf("insert webhook: %w", err)
	}
	w.Secret = w.secret
	return w, nil
}

// Update applies a partial change. Enabling a webhook clears the disabled
// reason and the consecutive-failure counter.
func (s *Service) Update(ctx context.Context, userID, id string, in Patch) (*Webhook, error) {
	w, err := s.Get(ctx, userID, id)
	if err != nil {
		return nil, err
	}
	if in.URL != nil {
		url := strings.TrimSpace(*in.URL)
		if _, err := ValidateURL(url); err != nil {
			return nil, fmt.Errorf("%w: url: %s", ErrInvalid, strings.TrimPrefix(err.Error(), ErrBadURL.Error()+": "))
		}
		if err := s.CheckTarget(ctx, url); err != nil {
			return nil, err
		}
		w.URL = url
	}
	if in.EventsSet {
		if w.Events, err = normalizeEvents(in.Events); err != nil {
			return nil, err
		}
	}
	if in.ProjectIDSet {
		if w.ProjectID, err = normalizeProject(in.ProjectID); err != nil {
			return nil, err
		}
	}
	if in.Enabled != nil {
		if *in.Enabled && !w.Enabled {
			w.DisabledReason = nil
			w.ConsecutiveFailures = 0
		}
		w.Enabled = *in.Enabled
	}
	w.UpdatedAt = s.nowMs()
	ev, _ := json.Marshal(w.Events)
	_, err = s.db.ExecContext(ctx, `UPDATE webhooks SET url=?, events=?, project_id=?, enabled=?, disabled_reason=?, consecutive_failures=?, updated_at=?
		WHERE id = ? AND user_id = ?`, w.URL, string(ev), w.ProjectID, boolInt(w.Enabled), w.DisabledReason, w.ConsecutiveFailures, w.UpdatedAt, id, userID)
	if err != nil {
		return nil, fmt.Errorf("update webhook: %w", err)
	}
	return w, nil
}

// Delete removes a webhook and, by cascade, its delivery log and queue.
func (s *Service) Delete(ctx context.Context, userID, id string) error {
	r, err := s.db.ExecContext(ctx, `DELETE FROM webhooks WHERE id = ? AND user_id = ?`, id, userID)
	if err != nil {
		return err
	}
	if n, _ := r.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// ---- delivery log ----

const deliveryCols = `id, webhook_id, event, status, attempts, next_attempt_at, last_status_code, last_error, response_excerpt, duration_ms, created_at, delivered_at`

func scanDelivery(sc interface{ Scan(...any) error }) (*Delivery, error) {
	var d Delivery
	var next, dur, delivered sql.NullInt64
	var code sql.NullInt64
	var errStr, excerpt sql.NullString
	if err := sc.Scan(&d.ID, &d.WebhookID, &d.Event, &d.Status, &d.Attempts, &next, &code, &errStr, &excerpt, &dur, &d.CreatedAt, &delivered); err != nil {
		return nil, err
	}
	if next.Valid {
		d.NextAttemptAt = &next.Int64
	}
	if code.Valid {
		c := int(code.Int64)
		d.StatusCode = &c
	}
	if errStr.Valid {
		d.Error = &errStr.String
	}
	if excerpt.Valid {
		d.ResponseExcerpt = &excerpt.String
	}
	if dur.Valid {
		d.DurationMs = &dur.Int64
	}
	if delivered.Valid {
		d.DeliveredAt = &delivered.Int64
	}
	return &d, nil
}

// LogLimit is how many deliveries the log shows and keeps per webhook.
const LogLimit = 100

// Deliveries returns the newest LogLimit deliveries of one of the user's webhooks.
func (s *Service) Deliveries(ctx context.Context, userID, webhookID string) ([]Delivery, error) {
	if _, err := s.Get(ctx, userID, webhookID); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT `+deliveryCols+` FROM webhook_deliveries WHERE webhook_id = ?
		ORDER BY created_at DESC, rowid DESC LIMIT ?`, webhookID, LogLimit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Delivery{}
	for rows.Next() {
		d, err := scanDelivery(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *d)
	}
	return out, rows.Err()
}

func (s *Service) delivery(ctx context.Context, id string) (*Delivery, error) {
	d, err := scanDelivery(s.db.QueryRowContext(ctx, `SELECT `+deliveryCols+` FROM webhook_deliveries WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return d, err
}

// Redeliver queues the same body again under a new delivery id.
func (s *Service) Redeliver(ctx context.Context, userID, webhookID, deliveryID string) (*Delivery, error) {
	if _, err := s.Get(ctx, userID, webhookID); err != nil {
		return nil, err
	}
	var event, payload string
	err := s.db.QueryRowContext(ctx, `SELECT event, payload FROM webhook_deliveries WHERE id = ? AND webhook_id = ?`, deliveryID, webhookID).Scan(&event, &payload)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	id := ids.New()
	body, err := WithDeliveryID([]byte(payload), id)
	if err != nil {
		return nil, fmt.Errorf("rewrite payload: %w", err)
	}
	now := s.nowMs()
	if _, err := s.db.ExecContext(ctx, `INSERT INTO webhook_deliveries(id,webhook_id,event,payload,status,next_attempt_at,created_at) VALUES(?,?,?,?,'pending',?,?)`,
		id, webhookID, event, string(body), now, now); err != nil {
		return nil, fmt.Errorf("queue redelivery: %w", err)
	}
	s.Wake()
	return s.delivery(ctx, id)
}

// Test sends a ping right away, records it in the log and returns the result.
// A ping is attempted once, never retried, and does not count toward auto-disable.
func (s *Service) Test(ctx context.Context, userID, webhookID string) (*Delivery, error) {
	w, err := s.Get(ctx, userID, webhookID)
	if err != nil {
		return nil, err
	}
	id := ids.New()
	now := s.nowMs()
	body, err := BuildPayload(id, w.ID, EventPing, now, "server", "", nil, nil)
	if err != nil {
		return nil, err
	}
	if _, err := s.db.ExecContext(ctx, `INSERT INTO webhook_deliveries(id,webhook_id,event,payload,status,created_at) VALUES(?,?,?,?,'pending',?)`,
		id, w.ID, EventPing, string(body), now); err != nil {
		return nil, fmt.Errorf("record ping: %w", err)
	}
	res := s.send(ctx, queued{id: id, webhookID: w.ID, event: EventPing, payload: body, url: w.URL, secret: w.secret})
	if err := s.record(ctx, queued{id: id, webhookID: w.ID, event: EventPing, attempts: 0}, res, true); err != nil {
		return nil, err
	}
	return s.delivery(ctx, id)
}

// ---- event intake ----

type subscription struct {
	id        string
	events    []string
	projectID string
}

// Observe is the sync.Observer: it turns committed winning changes into queued
// deliveries for the user's enabled, subscribed webhooks. It runs after the
// batch committed and must not fail the write, so errors are logged.
func (s *Service) Observe(ctx context.Context, changes []opsync.Change) {
	if len(changes) == 0 {
		return
	}
	ctx = context.WithoutCancel(ctx)
	if err := s.enqueue(ctx, changes); err != nil {
		s.log.Error("webhooks: enqueue failed", "err", err)
	}
}

func (s *Service) enqueue(ctx context.Context, changes []opsync.Change) error {
	type row struct{ id, webhookID, event, payload string }
	var rows []row
	now := s.nowMs()
	// Everyone who can see a change's scope is told through their own webhooks
	// (project-sharing): the author for personal data, every member of a shared
	// project. Each payload is built from that member's view of the entity.
	usersByScope := map[string][]string{}
	subsByUser := map[string][]subscription{}
	for _, c := range changes {
		// Opaque documents (task.notes_doc) are not part of a delivery; a change
		// that touched nothing else (a merged note republished with the same
		// text) is not an event (collaborative-rich-text).
		if c = withoutDocFields(c); len(c.Fields) == 0 {
			continue
		}
		users, ok := usersByScope[c.ScopeID]
		if !ok {
			if c.ScopeID == "" {
				users = []string{c.UserID}
			} else {
				var err error
				if users, err = s.sync.ScopeUsers(ctx, c.ScopeID); err != nil {
					return err
				}
			}
			usersByScope[c.ScopeID] = users
		}
		event := EventFor(c)
		for _, userID := range users {
			subs, ok := subsByUser[userID]
			if !ok {
				var err error
				if subs, err = s.subscriptions(ctx, userID); err != nil {
					return err
				}
				subsByUser[userID] = subs
			}
			var entity opsync.Entity
			loaded := false
			for _, sub := range subs {
				if !slices.Contains(sub.events, event) || !s.matchesProject(ctx, userID, sub.projectID, c, &entity, &loaded) {
					continue
				}
				if !loaded {
					var err error
					if entity, err = s.sync.Get(ctx, userID, c.Entity, c.EntityID); err != nil {
						return err
					}
					loaded = true
				}
				id := ids.New()
				body, err := BuildPayload(id, sub.id, event, now, c.Origin, c.Entity, entity, c.Fields)
				if err != nil {
					return err
				}
				rows = append(rows, row{id, sub.id, event, string(body)})
			}
		}
	}
	if len(rows) == 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, r := range rows {
		if _, err := tx.ExecContext(ctx, `INSERT INTO webhook_deliveries(id,webhook_id,event,payload,status,next_attempt_at,created_at) VALUES(?,?,?,?,'pending',?,?)`,
			r.id, r.webhookID, r.event, r.payload, now, now); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	s.Wake()
	return nil
}

func (s *Service) subscriptions(ctx context.Context, userID string) ([]subscription, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, events, COALESCE(project_id,'') FROM webhooks WHERE user_id = ? AND enabled = 1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []subscription
	for rows.Next() {
		var sub subscription
		var events string
		if err := rows.Scan(&sub.id, &events, &sub.projectID); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(events), &sub.events); err != nil {
			return nil, err
		}
		out = append(out, sub)
	}
	return out, rows.Err()
}

// matchesProject applies a webhook's project filter. A project event matches its
// own id; a task event matches the task's current project or, for a move, the
// project it left. The entity is loaded lazily and cached by the caller.
func (s *Service) matchesProject(ctx context.Context, userID, filter string, c opsync.Change, entity *opsync.Entity, loaded *bool) bool {
	if filter == "" {
		return true
	}
	if c.Entity == "project" {
		return c.EntityID == filter
	}
	if fc, ok := c.Fields["project_id"]; ok && (idValue(fc.From) == filter || idValue(fc.To) == filter) {
		return true
	}
	if !*loaded {
		e, err := s.sync.Get(ctx, userID, c.Entity, c.EntityID)
		if err != nil {
			s.log.Error("webhooks: load entity", "err", err)
			return false
		}
		*entity, *loaded = e, true
	}
	return *entity != nil && idValue((*entity)["project_id"]) == filter
}

func idValue(raw json.RawMessage) string {
	var v string
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	_ = json.Unmarshal(raw, &v)
	return v
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
