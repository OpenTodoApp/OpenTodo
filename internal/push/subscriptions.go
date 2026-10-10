package push

import (
	"context"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"net/url"
	"strings"

	"github.com/pixari/opentodo/internal/ids"
)

// Subscription is one device's push subscription. Endpoint and keys never leave
// the server in API responses (see Public).
type Subscription struct {
	ID             string
	UserID         string
	DeviceID       string
	Endpoint       string
	P256DH         string // base64url, uncompressed P-256 point
	Auth           string // base64url, 16 bytes
	IncludeContent bool
	CreatedAt      int64
	UpdatedAt      int64
	LastOKAt       *int64
	LastError      string
	Failures       int
}

// RenewAfterFailures is the number of consecutive failed sends after which the
// device is asked to re-enable notifications (design D6).
const RenewAfterFailures = 5

// PublicSubscription is what the API returns about a subscription.
type PublicSubscription struct {
	ID             string `json:"id"`
	DeviceID       string `json:"deviceId"`
	IncludeContent bool   `json:"includeContent"`
	CreatedAt      int64  `json:"createdAt"`
	LastOKAt       *int64 `json:"lastOkAt"`
	LastError      string `json:"lastError"`
	Failures       int    `json:"failures"`
	NeedsRenewal   bool   `json:"needsRenewal"`
}

// Public strips the endpoint and keys.
func (s *Subscription) Public() PublicSubscription {
	return PublicSubscription{ID: s.ID, DeviceID: s.DeviceID, IncludeContent: s.IncludeContent, CreatedAt: s.CreatedAt,
		LastOKAt: s.LastOKAt, LastError: s.LastError, Failures: s.Failures, NeedsRenewal: s.Failures >= RenewAfterFailures}
}

// SubscriptionInput is the body of POST /api/v1/push/subscriptions: the
// browser's PushSubscription.toJSON() plus the device id and the opt-in.
type SubscriptionInput struct {
	DeviceID string `json:"deviceId"`
	Endpoint string `json:"endpoint"`
	Keys     struct {
		P256DH string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
	IncludeContent bool `json:"includeContent"`
}

// ErrInvalidSubscription wraps every validation failure of a SubscriptionInput.
var ErrInvalidSubscription = errors.New("invalid subscription")

// ErrNotFound is returned for an unknown (or foreign) subscription id.
var ErrNotFound = errors.New("subscription not found")

const maxEndpointLen = 2048

func decodeKey(s string) ([]byte, error) {
	s = strings.TrimRight(s, "=")
	if b, err := base64.RawURLEncoding.DecodeString(s); err == nil {
		return b, nil
	}
	return base64.RawStdEncoding.DecodeString(s)
}

// Validate checks the endpoint URL and the browser's encryption keys.
func (in *SubscriptionInput) Validate(allowHTTP bool) error {
	if in.DeviceID == "" || len(in.DeviceID) > 64 {
		return fmt.Errorf("%w: deviceId is required (max 64 chars)", ErrInvalidSubscription)
	}
	u, err := url.Parse(in.Endpoint)
	if in.Endpoint == "" || err != nil || u.Host == "" || len(in.Endpoint) > maxEndpointLen {
		return fmt.Errorf("%w: endpoint must be an absolute URL", ErrInvalidSubscription)
	}
	if u.Scheme != "https" && !(allowHTTP && u.Scheme == "http") {
		return fmt.Errorf("%w: endpoint must use https", ErrInvalidSubscription)
	}
	p, err := decodeKey(in.Keys.P256DH)
	if err != nil || len(p) != 65 || p[0] != 0x04 {
		return fmt.Errorf("%w: keys.p256dh must be an uncompressed P-256 public key", ErrInvalidSubscription)
	}
	a, err := decodeKey(in.Keys.Auth)
	if err != nil || len(a) != 16 {
		return fmt.Errorf("%w: keys.auth must be a 16-byte secret", ErrInvalidSubscription)
	}
	// Store the canonical unpadded base64url form.
	in.Keys.P256DH = base64.RawURLEncoding.EncodeToString(p)
	in.Keys.Auth = base64.RawURLEncoding.EncodeToString(a)
	return nil
}

const subColumns = `id,user_id,device_id,endpoint,p256dh,auth,include_content,created_at,updated_at,last_ok_at,last_error,failures`

func scanSub(sc interface{ Scan(...any) error }) (*Subscription, error) {
	var s Subscription
	var last sql.NullInt64
	var include int
	if err := sc.Scan(&s.ID, &s.UserID, &s.DeviceID, &s.Endpoint, &s.P256DH, &s.Auth, &include, &s.CreatedAt, &s.UpdatedAt, &last, &s.LastError, &s.Failures); err != nil {
		return nil, err
	}
	s.IncludeContent = include != 0
	if last.Valid {
		v := last.Int64
		s.LastOKAt = &v
	}
	return &s, nil
}

// Upsert stores the device's subscription, replacing any earlier one of the
// same device (a browser that re-subscribes gets a new endpoint). sessionHash is
// the creating session's token hash ("" for API tokens). It reports whether a
// new row was created.
func (s *Service) Upsert(ctx context.Context, userID, sessionHash string, in SubscriptionInput) (*Subscription, bool, error) {
	if err := in.Validate(s.allowHTTP); err != nil {
		return nil, false, err
	}
	now := s.now().UnixMilli()
	var session any
	if sessionHash != "" {
		session = sessionHash
	}
	include := 0
	if in.IncludeContent {
		include = 1
	}
	existing, err := s.SubscriptionForDevice(ctx, userID, in.DeviceID)
	if err != nil {
		return nil, false, err
	}
	if existing == nil {
		id := ids.New()
		_, err = s.db.ExecContext(ctx, `INSERT INTO push_subscriptions(id,user_id,device_id,session_hash,endpoint,p256dh,auth,include_content,created_at,updated_at)
			VALUES(?,?,?,?,?,?,?,?,?,?)`, id, userID, in.DeviceID, session, in.Endpoint, in.Keys.P256DH, in.Keys.Auth, include, now, now)
		if err != nil {
			return nil, false, fmt.Errorf("store push subscription: %w", err)
		}
		sub, err := s.subscription(ctx, userID, id)
		return sub, true, err
	}
	// Same endpoint and keys: keep the delivery history. A new endpoint is a new
	// subscription as far as the push service is concerned, so it starts clean.
	same := existing.Endpoint == in.Endpoint && existing.P256DH == in.Keys.P256DH && existing.Auth == in.Keys.Auth
	q := `UPDATE push_subscriptions SET session_hash=?, endpoint=?, p256dh=?, auth=?, include_content=?, updated_at=?`
	if !same {
		q += `, last_ok_at=NULL, last_error='', failures=0`
	}
	if _, err := s.db.ExecContext(ctx, q+` WHERE id=?`, session, in.Endpoint, in.Keys.P256DH, in.Keys.Auth, include, now, existing.ID); err != nil {
		return nil, false, fmt.Errorf("update push subscription: %w", err)
	}
	sub, err := s.subscription(ctx, userID, existing.ID)
	return sub, false, err
}

func (s *Service) subscription(ctx context.Context, userID, id string) (*Subscription, error) {
	sub, err := scanSub(s.db.QueryRowContext(ctx, `SELECT `+subColumns+` FROM push_subscriptions WHERE user_id=? AND id=?`, userID, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return sub, err
}

// SubscriptionForDevice returns the device's subscription or nil.
func (s *Service) SubscriptionForDevice(ctx context.Context, userID, deviceID string) (*Subscription, error) {
	sub, err := scanSub(s.db.QueryRowContext(ctx, `SELECT `+subColumns+` FROM push_subscriptions WHERE user_id=? AND device_id=?`, userID, deviceID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return sub, err
}

// Delete removes one of the user's subscriptions.
func (s *Service) Delete(ctx context.Context, userID, id string) error {
	r, err := s.db.ExecContext(ctx, `DELETE FROM push_subscriptions WHERE user_id=? AND id=?`, userID, id)
	if err != nil {
		return err
	}
	if n, _ := r.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// ListByUser returns every subscription of a user.
func (s *Service) ListByUser(ctx context.Context, userID string) ([]*Subscription, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+subColumns+` FROM push_subscriptions WHERE user_id=? ORDER BY created_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*Subscription
	for rows.Next() {
		sub, err := scanSub(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, sub)
	}
	return out, rows.Err()
}

// recordOK notes a successful send.
func (s *Service) recordOK(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE push_subscriptions SET last_ok_at=?, last_error='', failures=0 WHERE id=?`, s.now().UnixMilli(), id)
	return err
}

// RecordFailure counts one failed send (not 404/410, which delete the row).
func (s *Service) RecordFailure(ctx context.Context, id, msg string) error {
	if len(msg) > 200 {
		msg = msg[:200]
	}
	_, err := s.db.ExecContext(ctx, `UPDATE push_subscriptions SET failures=failures+1, last_error=? WHERE id=?`, msg, id)
	return err
}

// removeGone deletes a subscription the push service reported as gone.
func (s *Service) removeGone(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM push_subscriptions WHERE id=?`, id)
	return err
}
