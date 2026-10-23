// Package channels delivers a person's notifications to services they already
// use: ntfy, Pushover, Gotify, or any address through a signed webhook (OpenSpec
// change notification-channels). It is a notify sink and a consumer of the
// reminder scheduler; each event becomes one queued message per channel, sent by
// one worker through the outbound policy. Channels are server data outside the
// op log; their secrets live in <data>/secrets/notification-channels.json.
package channels

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/rand/v2"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/pixari/opentodo/internal/ids"
	"github.com/pixari/opentodo/internal/outbound"
	"github.com/pixari/opentodo/internal/settings"
	"github.com/pixari/opentodo/internal/webhook"
)

// Channel kinds.
const (
	KindNtfy     = "ntfy"
	KindPushover = "pushover"
	KindGotify   = "gotify"
	KindWebhook  = "webhook"
)

// Kinds lists the kinds in display order.
var Kinds = []string{KindNtfy, KindPushover, KindGotify, KindWebhook}

// Events a channel can receive, in display order.
const (
	EventReminder   = "reminder"
	EventAssigned   = "assigned"
	EventMentioned  = "mentioned"
	EventUnblocked  = "unblocked"
	EventPage       = "page"
	eventTest       = "test"
	SecretsName     = "notification-channels"
	MaxPerUser      = 5
	MaxNameLen      = 60
	HourlyLimit     = 60
	TestsPerHour    = 12
	DisabledFailing = "too_many_failures"
)

// Events lists the event names in display order.
var Events = []string{EventReminder, EventAssigned, EventMentioned, EventUnblocked, EventPage}

var (
	// ErrNotFound: no channel with this id belongs to the caller.
	ErrNotFound = errors.New("notification channel not found")
	// ErrLimit: the account already has MaxPerUser channels.
	ErrLimit = errors.New("limit reached")
	// ErrInvalid wraps a validation message "field: reason".
	ErrInvalid = errors.New("invalid input")
	// ErrPrivateTarget is the outbound policy's refusal.
	ErrPrivateTarget = outbound.ErrPrivateTarget
)

var (
	topicRe = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)
	keyRe   = regexp.MustCompile(`^[A-Za-z0-9]{10,64}$`)
)

// Channel is one delivery channel as the API shows it: never a secret.
type Channel struct {
	ID             string   `json:"id"`
	Kind           string   `json:"kind"`
	Name           string   `json:"name"`
	URL            string   `json:"url,omitempty"`
	Topic          string   `json:"topic,omitempty"`
	Events         []string `json:"events"`
	IncludeTitles  bool     `json:"includeTitles"`
	Enabled        bool     `json:"enabled"`
	DisabledReason string   `json:"disabledReason,omitempty"`
	Lang           string   `json:"lang"`
	TokenSet       bool     `json:"tokenSet"`
	UserKeySet     bool     `json:"userKeySet,omitempty"`
	SecretSet      bool     `json:"secretSet,omitempty"`
	LastOKAt       *int64   `json:"lastOkAt"`
	LastError      string   `json:"lastError,omitempty"`
	Failures       int      `json:"failures"`
	CreatedAt      int64    `json:"createdAt"`
	UpdatedAt      int64    `json:"updatedAt"`

	userID, origin string
}

// Input is a create or update. A nil field is left as it is; Token and UserKey
// replace the stored secret when set. RotateSecret gives a webhook a new
// signing secret.
type Input struct {
	Kind          *string
	Name          *string
	URL           *string
	Topic         *string
	Token         *string
	UserKey       *string
	Events        *[]string
	IncludeTitles *bool
	Enabled       *bool
	Lang          *string
	Origin        *string
	RotateSecret  bool
}

// Options configure a Service; zero values pick production defaults.
type Options struct {
	Version string
	Log     *slog.Logger
	Now     func() time.Time
	After   func(time.Duration) <-chan time.Time
	Rand    func() float64
	// Client sends messages; the default is the outbound client with AllowPrivate.
	Client *http.Client
	// Resolver checks targets at creation; tests inject a fake.
	Resolver outbound.Resolver
	// AllowPrivate is the owner's private-target policy (shared with webhooks).
	AllowPrivate func(context.Context) bool
	// Enabled replaces the owner switch stored in settings (tests).
	Enabled func(context.Context) bool
	// Encrypted reports whether an account uses end-to-end encryption.
	Encrypted func(ctx context.Context, userID string) (bool, error)
	// BaseOrigin is OPENTODO_BASE_URL's origin; it wins over a channel's stored origin.
	BaseOrigin string
	// PushoverURL replaces Pushover's API address (tests only).
	PushoverURL string
}

// Service owns channels, their secrets, the queue and its worker.
type Service struct {
	db          *sql.DB
	secrets     *settings.SecretsFile
	log         *slog.Logger
	version     string
	now         func() time.Time
	after       func(time.Duration) <-chan time.Time
	rand        func() float64
	client      *http.Client
	dialer      *outbound.Dialer
	enabled     func(context.Context) bool
	encrypted   func(context.Context, string) (bool, error)
	baseOrigin  string
	pushoverURL string
	wake        chan struct{}
	sw          ownerSwitch
}

// PushoverAPI is Pushover's message endpoint; NtfyDefault is the public ntfy
// server a new ntfy channel uses when no server is given.
const (
	PushoverAPI = "https://api.pushover.net/1/messages.json"
	NtfyDefault = "https://ntfy.sh"
)

// New wires a Service on the server database and data directory.
func New(db *sql.DB, dataDir string, o Options) *Service {
	s := &Service{db: db, secrets: settings.NewSecretsFile(dataDir, SecretsName), log: o.Log, version: o.Version,
		now: o.Now, after: o.After, rand: o.Rand, client: o.Client, enabled: o.Enabled, encrypted: o.Encrypted,
		baseOrigin: o.BaseOrigin, pushoverURL: o.PushoverURL, wake: make(chan struct{}, 1)}
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
	if s.pushoverURL == "" {
		s.pushoverURL = PushoverAPI
	}
	s.dialer = &outbound.Dialer{Resolver: o.Resolver, AllowPrivate: o.AllowPrivate}
	if s.client == nil {
		s.client = outbound.NewClient(s.dialer, SendTimeout)
	} else if s.dialer.Resolver == nil {
		s.dialer.Resolver = netResolver()
	}
	if s.enabled == nil {
		s.enabled = s.switchOn
	}
	if s.encrypted == nil {
		s.encrypted = func(context.Context, string) (bool, error) { return false, nil }
	}
	return s
}

// SecretsPath is the secrets file's location (docs and tests).
func (s *Service) SecretsPath() string { return s.secrets.Path() }

// On reports the owner switch.
func (s *Service) On(ctx context.Context) bool { return s.enabled(ctx) }

func (s *Service) nowMs() int64 { return s.now().UnixMilli() }

func invalid(field, msg string) error { return fmt.Errorf("%w: %s: %s", ErrInvalid, field, msg) }

// ---- reads ----

const columns = `id, user_id, kind, name, url, topic, events, include_titles, lang, origin, enabled,
	COALESCE(disabled_reason, ''), consecutive_failures, last_ok_at, COALESCE(last_error, ''), created_at, updated_at`

func scanChannel(row interface{ Scan(...any) error }) (*Channel, error) {
	var c Channel
	var events string
	var lastOK sql.NullInt64
	if err := row.Scan(&c.ID, &c.userID, &c.Kind, &c.Name, &c.URL, &c.Topic, &events, &c.IncludeTitles, &c.Lang, &c.origin, &c.Enabled,
		&c.DisabledReason, &c.Failures, &lastOK, &c.LastError, &c.CreatedAt, &c.UpdatedAt); err != nil {
		return nil, err
	}
	if err := json.Unmarshal([]byte(events), &c.Events); err != nil {
		return nil, fmt.Errorf("channel %s events: %w", c.ID, err)
	}
	if lastOK.Valid {
		v := lastOK.Int64
		c.LastOKAt = &v
	}
	return &c, nil
}

// List returns the user's channels, oldest first.
func (s *Service) List(ctx context.Context, userID string) ([]Channel, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+columns+` FROM notification_channels WHERE user_id = ? ORDER BY created_at, id`, userID)
	if err != nil {
		return nil, fmt.Errorf("list channels: %w", err)
	}
	defer rows.Close()
	out := []Channel{}
	for rows.Next() {
		c, err := scanChannel(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *c)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	sec, err := s.secrets.Load()
	if err != nil {
		return nil, err
	}
	for i := range out {
		out[i].fillSecrets(sec)
	}
	return out, nil
}

// Get returns one of the user's channels.
func (s *Service) Get(ctx context.Context, userID, id string) (*Channel, error) {
	c, err := scanChannel(s.db.QueryRowContext(ctx, `SELECT `+columns+` FROM notification_channels WHERE id = ? AND user_id = ?`, id, userID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	sec, err := s.secrets.Load()
	if err != nil {
		return nil, err
	}
	c.fillSecrets(sec)
	return c, nil
}

func (c *Channel) fillSecrets(sec settings.Secrets) {
	if c.Kind == KindWebhook {
		c.SecretSet = sec.Has(c.ID)
		return
	}
	c.TokenSet = sec.Has(c.ID)
	if c.Kind == KindPushover {
		c.UserKeySet = sec.Has(c.ID + ".user")
	}
}

// ---- validation ----

func normalizeEvents(in []string) ([]string, error) {
	out := []string{}
	for _, e := range in {
		if !slices.Contains(Events, e) {
			return nil, invalid("events", fmt.Sprintf("unknown event %q", e))
		}
		if !slices.Contains(out, e) {
			out = append(out, e)
		}
	}
	if len(out) == 0 {
		return nil, invalid("events", "choose at least one event")
	}
	slices.SortFunc(out, func(a, b string) int { return slices.Index(Events, a) - slices.Index(Events, b) })
	return out, nil
}

// Languages are the message languages, English first (the app's languages).
var Languages = []string{"en", "de", "fr", "es", "it", "pt"}

func normalizeLang(v string) string {
	v = strings.ToLower(strings.TrimSpace(v))
	if i := strings.IndexAny(v, "-_"); i > 0 {
		v = v[:i]
	}
	if slices.Contains(Languages, v) {
		return v
	}
	return "en"
}

// normalizeOrigin keeps scheme and host of an http(s) address, "" otherwise.
func normalizeOrigin(v string) string {
	u, err := url.Parse(strings.TrimSpace(v))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || len(v) > outbound.MaxURLLength {
		return ""
	}
	return u.Scheme + "://" + u.Host
}

func kindLabel(kind string) string {
	switch kind {
	case KindNtfy:
		return "ntfy"
	case KindPushover:
		return "Pushover"
	case KindGotify:
		return "Gotify"
	}
	return "Webhook"
}

// draft is a channel being validated, with its new secrets.
type draft struct {
	Channel
	token, userKey *string
}

// apply validates in onto d. creating requires every setting of the kind.
func (d *draft) apply(in Input, creating bool) error {
	if in.Kind != nil && (creating || *in.Kind != d.Kind) {
		if !creating {
			return invalid("kind", "cannot be changed; add a new channel instead")
		}
		if !slices.Contains(Kinds, *in.Kind) {
			return invalid("kind", "must be ntfy, pushover, gotify or webhook")
		}
		d.Kind = *in.Kind
	}
	if d.Kind == "" {
		return invalid("kind", "required")
	}
	if in.Name != nil {
		d.Name = strings.TrimSpace(*in.Name)
		if utf8.RuneCountInString(d.Name) > MaxNameLen {
			return invalid("name", fmt.Sprintf("at most %d characters", MaxNameLen))
		}
		if strings.ContainsFunc(d.Name, func(r rune) bool { return r < 0x20 || r == 0x7f }) {
			return invalid("name", "must not contain control characters")
		}
	}
	if d.Name == "" {
		d.Name = kindLabel(d.Kind)
	}
	if in.Events != nil {
		ev, err := normalizeEvents(*in.Events)
		if err != nil {
			return err
		}
		d.Events = ev
	} else if creating {
		d.Events = []string{EventReminder, EventAssigned, EventMentioned}
	}
	if in.IncludeTitles != nil {
		d.IncludeTitles = *in.IncludeTitles
	}
	if in.Enabled != nil {
		d.Enabled = *in.Enabled
	}
	if in.Lang != nil {
		d.Lang = normalizeLang(*in.Lang)
	} else if creating {
		d.Lang = "en"
	}
	if in.Origin != nil {
		d.origin = normalizeOrigin(*in.Origin)
	}
	return d.applyKind(in, creating)
}

// applyKind validates the settings and secrets of the channel's kind.
func (d *draft) applyKind(in Input, creating bool) error {
	if in.URL != nil {
		d.URL = strings.TrimRight(strings.TrimSpace(*in.URL), "/")
		if d.Kind == KindWebhook {
			d.URL = strings.TrimSpace(*in.URL)
		}
	}
	if in.Topic != nil {
		d.Topic = strings.TrimSpace(*in.Topic)
	}
	trim := func(p *string) *string {
		if p == nil {
			return nil
		}
		v := strings.TrimSpace(*p)
		return &v
	}
	d.token, d.userKey = trim(in.Token), trim(in.UserKey)
	if d.token != nil && len(*d.token) > 512 {
		return invalid("token", "at most 512 characters")
	}
	switch d.Kind {
	case KindPushover:
		if (in.URL != nil && *in.URL != "") || (in.Topic != nil && *in.Topic != "") {
			return invalid("url", "Pushover has no server address")
		}
		if creating && (d.userKey == nil || *d.userKey == "") {
			return invalid("userKey", "required")
		}
		if d.userKey != nil && !keyRe.MatchString(*d.userKey) {
			return invalid("userKey", "letters and digits, as Pushover shows it")
		}
		if creating && (d.token == nil || *d.token == "") {
			return invalid("token", "required: the application token")
		}
		if d.token != nil && !keyRe.MatchString(*d.token) {
			return invalid("token", "letters and digits, as Pushover shows it")
		}
		return nil
	case KindNtfy:
		if d.URL == "" && creating {
			d.URL = NtfyDefault
		}
		if !topicRe.MatchString(d.Topic) {
			return invalid("topic", "1 to 64 letters, digits, - or _")
		}
	case KindGotify:
		if creating && (d.token == nil || *d.token == "") {
			return invalid("token", "required: the application token")
		}
	case KindWebhook:
		d.token = nil
	}
	if d.Kind != KindNtfy && d.Topic != "" {
		return invalid("topic", "only ntfy has a topic")
	}
	if d.URL == "" {
		return invalid("url", "required")
	}
	if _, err := outbound.ValidateURL(d.URL); err != nil {
		return invalid("url", strings.TrimPrefix(err.Error(), outbound.ErrBadURL.Error()+": "))
	}
	return nil
}

// checkTarget refuses an address whose host resolves only to denied addresses
// while the owner has not allowed private targets. A host that does not
// resolve now is accepted; every send checks again.
func (s *Service) checkTarget(ctx context.Context, kind, raw string) error {
	if kind == KindPushover {
		return nil
	}
	u, err := outbound.ValidateURL(raw)
	if err != nil {
		return invalid("url", err.Error())
	}
	if _, err := s.dialer.Allowed(ctx, u.Hostname()); errors.Is(err, outbound.ErrPrivateTarget) {
		return ErrPrivateTarget
	}
	return nil
}

// ---- writes ----

// Create stores a new channel. For a webhook it returns the signing secret,
// shown once.
func (s *Service) Create(ctx context.Context, userID string, in Input) (*Channel, string, error) {
	d := &draft{Channel: Channel{Enabled: true}}
	if err := d.apply(in, true); err != nil {
		return nil, "", err
	}
	if err := s.checkTarget(ctx, d.Kind, d.URL); err != nil {
		return nil, "", err
	}
	var n int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM notification_channels WHERE user_id = ?`, userID).Scan(&n); err != nil {
		return nil, "", err
	}
	if n >= MaxPerUser {
		return nil, "", ErrLimit
	}
	d.ID, d.userID = ids.New(), userID
	now := s.nowMs()
	events, _ := json.Marshal(d.Events)
	if _, err := s.db.ExecContext(ctx, `INSERT INTO notification_channels (id, user_id, kind, name, url, topic, events, include_titles, lang, origin, enabled, created_at, updated_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, d.ID, userID, d.Kind, d.Name, d.URL, d.Topic, string(events), d.IncludeTitles, d.Lang, d.origin, d.Enabled, now, now); err != nil {
		return nil, "", fmt.Errorf("store channel: %w", err)
	}
	secret, err := s.storeSecrets(d, d.Kind == KindWebhook)
	if err != nil {
		_, _ = s.db.ExecContext(ctx, `DELETE FROM notification_channels WHERE id = ?`, d.ID)
		return nil, "", err
	}
	c, err := s.Get(ctx, userID, d.ID)
	return c, secret, err
}

// storeSecrets writes the draft's new token and user key; with newSecret it
// generates a webhook signing secret and returns it.
func (s *Service) storeSecrets(d *draft, newSecret bool) (string, error) {
	changes := map[string]*string{}
	if d.token != nil {
		changes[d.ID] = d.token
	}
	if d.userKey != nil {
		changes[d.ID+".user"] = d.userKey
	}
	var secret string
	if newSecret {
		secret = webhook.NewSecret()
		changes[d.ID] = &secret
	}
	if len(changes) == 0 {
		return "", nil
	}
	if err := s.secrets.Update(changes); err != nil {
		return "", fmt.Errorf("store channel secret: %w", err)
	}
	return secret, nil
}

// Update changes one of the user's channels and returns it, a new signing
// secret when one was rotated, and the names of the settings that changed (for
// the audit log; never values).
func (s *Service) Update(ctx context.Context, userID, id string, in Input) (*Channel, string, []string, error) {
	cur, err := s.Get(ctx, userID, id)
	if err != nil {
		return nil, "", nil, err
	}
	d := &draft{Channel: *cur}
	if err := d.apply(in, false); err != nil {
		return nil, "", nil, err
	}
	if d.URL != cur.URL {
		if err := s.checkTarget(ctx, d.Kind, d.URL); err != nil {
			return nil, "", nil, err
		}
	}
	changed := changedSettings(cur, &d.Channel, d.token != nil, d.userKey != nil, in.RotateSecret && d.Kind == KindWebhook)
	failures, reason := cur.Failures, cur.DisabledReason
	if d.Enabled && !cur.Enabled {
		failures, reason = 0, ""
	}
	if !d.Enabled && cur.Enabled {
		reason = ""
	}
	events, _ := json.Marshal(d.Events)
	if _, err := s.db.ExecContext(ctx, `UPDATE notification_channels SET name=?, url=?, topic=?, events=?, include_titles=?, lang=?, origin=?, enabled=?,
		consecutive_failures=?, disabled_reason=NULLIF(?, ''), updated_at=? WHERE id=? AND user_id=?`,
		d.Name, d.URL, d.Topic, string(events), d.IncludeTitles, d.Lang, d.origin, d.Enabled, failures, reason, s.nowMs(), id, userID); err != nil {
		return nil, "", nil, fmt.Errorf("update channel: %w", err)
	}
	secret, err := s.storeSecrets(d, in.RotateSecret && d.Kind == KindWebhook)
	if err != nil {
		return nil, "", nil, err
	}
	c, err := s.Get(ctx, userID, id)
	return c, secret, changed, err
}

func changedSettings(a, b *Channel, token, userKey, secret bool) []string {
	var out []string
	add := func(cond bool, name string) {
		if cond {
			out = append(out, name)
		}
	}
	add(a.Name != b.Name, "name")
	add(a.URL != b.URL, "url")
	add(a.Topic != b.Topic, "topic")
	add(!slices.Equal(a.Events, b.Events), "events")
	add(a.IncludeTitles != b.IncludeTitles, "include_titles")
	add(a.Enabled != b.Enabled, "enabled")
	add(token, "token")
	add(userKey, "user_key")
	add(secret, "secret")
	return out
}

// Delete removes one of the user's channels, its queued messages and its secrets.
func (s *Service) Delete(ctx context.Context, userID, id string) (*Channel, error) {
	c, err := s.Get(ctx, userID, id)
	if err != nil {
		return nil, err
	}
	if _, err := s.db.ExecContext(ctx, `DELETE FROM notification_channels WHERE id = ? AND user_id = ?`, id, userID); err != nil {
		return nil, fmt.Errorf("delete channel: %w", err)
	}
	empty := ""
	if err := s.secrets.Update(map[string]*string{id: &empty, id + ".user": &empty}); err != nil {
		return nil, fmt.Errorf("delete channel secrets: %w", err)
	}
	return c, nil
}

// SweepSecrets removes the secrets of channels that no longer exist (an
// account deleted, its rows gone by cascade) and reports how many.
func (s *Service) SweepSecrets(ctx context.Context) (int, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id FROM notification_channels`)
	if err != nil {
		return 0, err
	}
	live := map[string]bool{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return 0, err
		}
		live[id] = true
	}
	rows.Close()
	sec, err := s.secrets.Load()
	if err != nil {
		return 0, err
	}
	empty := ""
	drop := map[string]*string{}
	for k := range sec {
		if !live[strings.TrimSuffix(k, ".user")] {
			drop[k] = &empty
		}
	}
	if len(drop) == 0 {
		return 0, nil
	}
	return len(drop), s.secrets.Update(drop)
}
