// Package davpush keeps the WebDAV-Push subscriptions of calendar apps and
// sends them a push when a subscribed calendar changes (OpenSpec change
// caldav-push). A subscription is server configuration like an app password:
// never an op, never synced, not in the user's export. The protocol's XML is
// internal/caldav (push.go); the endpoint is internal/httpapi/davroutes.
package davpush

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/caldav"
	"github.com/OpenTodoApp/opentodo/internal/ids"
	"github.com/OpenTodoApp/opentodo/internal/settings"
)

// Limits and timing (design D3, D5, D7).
const (
	// MaxPerUser is the number of live subscriptions one user may hold.
	MaxPerUser = 20
	// MinExpiry and MaxExpiry bound the expiry the server grants; MaxExpiry is
	// also the expiry of a registration that asks for none.
	MinExpiry = 3 * 24 * time.Hour
	MaxExpiry = 7 * 24 * time.Hour
	// MinGap is the shortest time between two pushes to one subscription.
	MinGap = 30 * time.Second
	// MessageTTL is how long a push service keeps an undelivered push (seconds).
	MessageTTL = 24 * 60 * 60
	// MaxFailures and FailureWindow: a subscription that failed this often with
	// no success for this long is removed (the draft's tolerance window).
	MaxFailures   = 10
	FailureWindow = 3 * 24 * time.Hour
	// Home is the collection of a subscription to the calendar home.
	Home = "home"
)

// ErrLimit is a registration over MaxPerUser.
var ErrLimit = errors.New("davpush: too many subscriptions")

// Subscription is one stored subscription.
type Subscription struct {
	ID, UserID, AppPasswordID string
	// Collection is a calendar's path segment or Home.
	Collection   string
	PushResource string
	P256DH, Auth string
	ExpiresAt    int64
	CreatedAt    int64
	// LastNotifiedSeq is the op cursor the client was last told about.
	LastNotifiedSeq int64
	LastSentAt      int64
	LastOKAt        int64
	Failures        int
}

// Store keeps the subscriptions and the topic key.
type Store struct {
	db      *sql.DB
	secrets *settings.SecretsFile
	now     func() time.Time
	keyMu   sync.Mutex
	key     []byte
}

// NewStore opens the store; the topic key lives in <data>/secrets/dav-push.json.
func NewStore(db *sql.DB, dataDir string, now func() time.Time) *Store {
	if now == nil {
		now = time.Now
	}
	return &Store{db: db, secrets: settings.NewSecretsFile(dataDir, "dav-push"), now: now}
}

// SetClock replaces the store's clock (tests).
func (s *Store) SetClock(now func() time.Time) { s.now = now }

// Topic is a collection's topic (design D2): stable for the calendar, unique
// on the server and meaningless outside it, so the push service learns nothing.
func (s *Store) Topic(userID, collection string) (string, error) {
	key, err := s.topicKey()
	if err != nil {
		return "", err
	}
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(userID + "\x00" + collection))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil)[:16]), nil
}

func (s *Store) topicKey() ([]byte, error) {
	s.keyMu.Lock()
	defer s.keyMu.Unlock()
	if s.key != nil {
		return s.key, nil
	}
	sec, err := s.secrets.Load()
	if err != nil {
		return nil, err
	}
	raw := sec.Value("topic_key")
	if raw == "" {
		raw = ids.Secret(32)
		if err := s.secrets.Update(map[string]*string{"topic_key": &raw}); err != nil {
			return nil, err
		}
	}
	key, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil || len(key) < 16 {
		return nil, fmt.Errorf("davpush: topic key unreadable")
	}
	s.key = key
	return key, nil
}

// Expiry is the expiry granted for a requested one (zero: none asked).
func (s *Store) Expiry(asked time.Time) time.Time {
	now := s.now()
	switch {
	case asked.IsZero() || asked.After(now.Add(MaxExpiry)):
		return now.Add(MaxExpiry)
	case asked.Before(now.Add(MinExpiry)):
		return now.Add(MinExpiry)
	}
	return asked
}

// Register stores a registration (design D3): the same user, collection and
// push resource renew the existing subscription (created false); otherwise a
// new one is stored with the cursor the client starts from. expires is
// Expiry's answer.
func (s *Store) Register(ctx context.Context, userID, appPasswordID, collection string, reg caldav.PushRegistration, expires time.Time, cursor int64) (*Subscription, bool, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, false, err
	}
	defer tx.Rollback()
	now := s.now().UnixMilli()
	var id string
	err = tx.QueryRowContext(ctx, `SELECT id FROM dav_push_subscriptions WHERE user_id = ? AND collection = ? AND push_resource = ?`,
		userID, collection, reg.PushResource).Scan(&id)
	created := errors.Is(err, sql.ErrNoRows)
	switch {
	case created:
		var n int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM dav_push_subscriptions WHERE user_id = ? AND expires_at > ?`, userID, now).Scan(&n); err != nil {
			return nil, false, err
		}
		if n >= MaxPerUser {
			return nil, false, ErrLimit
		}
		id = ids.Secret(16)
		_, err = tx.ExecContext(ctx, `INSERT INTO dav_push_subscriptions(id, user_id, app_password_id, collection, push_resource, p256dh, auth, expires_at, created_at, last_notified_seq)
			VALUES(?,?,?,?,?,?,?,?,?,?)`, id, userID, appPasswordID, collection, reg.PushResource, reg.P256DH, reg.Auth, expires.UnixMilli(), now, cursor)
	case err == nil:
		_, err = tx.ExecContext(ctx, `UPDATE dav_push_subscriptions SET app_password_id = ?, p256dh = ?, auth = ?, expires_at = ?, failures = 0, last_error = '' WHERE id = ?`,
			appPasswordID, reg.P256DH, reg.Auth, expires.UnixMilli(), id)
	}
	if err != nil {
		return nil, false, err
	}
	if err := tx.Commit(); err != nil {
		return nil, false, err
	}
	sub, err := s.get(ctx, id)
	return sub, created, err
}

const columns = `id, user_id, app_password_id, collection, push_resource, p256dh, auth, expires_at, created_at, last_notified_seq, last_sent_at, COALESCE(last_ok_at, 0), failures`

func scan(sc interface{ Scan(...any) error }) (*Subscription, error) {
	var x Subscription
	err := sc.Scan(&x.ID, &x.UserID, &x.AppPasswordID, &x.Collection, &x.PushResource, &x.P256DH, &x.Auth, &x.ExpiresAt, &x.CreatedAt,
		&x.LastNotifiedSeq, &x.LastSentAt, &x.LastOKAt, &x.Failures)
	return &x, err
}

func (s *Store) get(ctx context.Context, id string) (*Subscription, error) {
	return scan(s.db.QueryRowContext(ctx, `SELECT `+columns+` FROM dav_push_subscriptions WHERE id = ?`, id))
}

// Delete removes one of the user's subscriptions; false when it is unknown or
// another user's.
func (s *Store) Delete(ctx context.Context, userID, id string) (bool, error) {
	res, err := s.db.ExecContext(ctx, `DELETE FROM dav_push_subscriptions WHERE id = ? AND user_id = ?`, id, userID)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n > 0, err
}

// Silence moves the user's listed subscriptions (all of them for all) to seq,
// so a client's own write (Push-Dont-Notify) does not wake it.
func (s *Store) Silence(ctx context.Context, userID string, subIDs []string, all bool, seq int64) error {
	if all {
		_, err := s.db.ExecContext(ctx, `UPDATE dav_push_subscriptions SET last_notified_seq = MAX(last_notified_seq, ?) WHERE user_id = ?`, seq, userID)
		return err
	}
	for _, id := range subIDs {
		if _, err := s.db.ExecContext(ctx, `UPDATE dav_push_subscriptions SET last_notified_seq = MAX(last_notified_seq, ?) WHERE id = ? AND user_id = ?`, seq, id, userID); err != nil {
			return err
		}
	}
	return nil
}

// live lists the subscriptions that have not expired, by user.
func (s *Store) live(ctx context.Context) (map[string][]*Subscription, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+columns+` FROM dav_push_subscriptions WHERE expires_at > ? ORDER BY user_id, id`, s.now().UnixMilli())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string][]*Subscription{}
	for rows.Next() {
		x, err := scan(rows)
		if err != nil {
			return nil, err
		}
		out[x.UserID] = append(out[x.UserID], x)
	}
	return out, rows.Err()
}

// expire deletes expired subscriptions and those failing beyond the window.
func (s *Store) expire(ctx context.Context) error {
	now := s.now()
	_, err := s.db.ExecContext(ctx, `DELETE FROM dav_push_subscriptions WHERE expires_at <= ?
		OR (failures >= ? AND MAX(COALESCE(last_ok_at, 0), created_at) <= ?)`, now.UnixMilli(), MaxFailures, now.Add(-FailureWindow).UnixMilli())
	return err
}

// notified records a delivered push (or a subscription with nothing due).
func (s *Store) notified(ctx context.Context, id string, seq int64, sent bool) error {
	if !sent {
		_, err := s.db.ExecContext(ctx, `UPDATE dav_push_subscriptions SET last_notified_seq = MAX(last_notified_seq, ?) WHERE id = ?`, seq, id)
		return err
	}
	now := s.now().UnixMilli()
	_, err := s.db.ExecContext(ctx, `UPDATE dav_push_subscriptions SET last_notified_seq = MAX(last_notified_seq, ?), last_sent_at = ?, last_ok_at = ?, failures = 0, last_error = '' WHERE id = ?`,
		seq, now, now, id)
	return err
}

// failed counts a failed push; the subscription stays due.
func (s *Store) failed(ctx context.Context, id, msg string, log *slog.Logger) {
	if _, err := s.db.ExecContext(ctx, `UPDATE dav_push_subscriptions SET failures = failures + 1, last_error = ?, last_sent_at = ? WHERE id = ?`,
		msg, s.now().UnixMilli(), id); err != nil {
		log.Warn("davpush: record failure", "err", err)
	}
}

// gone removes a subscription its push service no longer knows (404, 410).
func (s *Store) gone(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM dav_push_subscriptions WHERE id = ?`, id)
	return err
}
