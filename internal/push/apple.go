package push

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/ids"
	"github.com/OpenTodoApp/opentodo/internal/outbound"
	"github.com/OpenTodoApp/opentodo/internal/pushrelay"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
	"github.com/OpenTodoApp/opentodo/internal/textutil"
)

// iPhone push through the OpenTodo relay (OpenSpec change ios-push-relay,
// design D7, D8): the server's client of the relay (internal/pushrelay) and
// its registrations in apple_devices. The server keeps the relay's handle,
// the wake key it minted and the hash of the phone's due token; it never
// keeps the APNs token or the due token. Every request goes through the
// outbound client it is given, and nothing reaches the relay while the
// owner's switch is off.

// AppleRelayKey and AppleRelayURLKey are the owner's settings.
const (
	AppleRelayKey    = "push.apple_relay"
	AppleRelayURLKey = "push.apple_relay_url"
	// DefaultRelayURL is the project's relay (owner item 3 of the change
	// settles the address; nothing contacts it while the switch is off).
	DefaultRelayURL = "https://push.open-todo.app"
)

// Limits of registrations and the due route.
const (
	MaxAppleDevicesPerUser = 10
	// RenewWithin: a schedule report asks for renewal once the handle expires
	// within this.
	RenewWithin = 7 * 24 * time.Hour
	// DueBefore and DueAfter bound the reminders the due route answers.
	DueBefore = 5 * time.Minute
	DueAfter  = time.Minute
	// DueTitleRunes truncates a title the due route answers.
	DueTitleRunes = 120
	dueTokenSize  = 32
	relayTimeout  = 10 * time.Second
	maxDeviceID   = 200
	maxDueItems   = 20
	// maxDueScan bounds the candidates read before closed tasks are skipped.
	maxDueScan = 500
)

var (
	// ErrRelayOff: the owner's switch is off.
	ErrRelayOff = errors.New("relay-off")
	// ErrRelayUnreachable: the relay could not be reached or refused.
	ErrRelayUnreachable = errors.New("relay-unreachable")
	// ErrInvalidApple wraps every validation failure of a registration.
	ErrInvalidApple = errors.New("invalid registration")
	// ErrUnknownDueToken: no registration holds this due token.
	ErrUnknownDueToken = errors.New("unknown due token")
	// ErrRelayBusy: the relay answered 429; RelayBusyError says when to retry.
	ErrRelayBusy = errors.New("relay-busy")
)

// RelayBusyError is the relay's 429 with its Retry-After.
type RelayBusyError struct{ RetryAfter time.Duration }

func (e *RelayBusyError) Error() string { return "the push relay is busy" }

// Is makes errors.Is(err, ErrRelayBusy) true.
func (e *RelayBusyError) Is(target error) bool { return target == ErrRelayBusy }

// retryAfter reads a Retry-After in seconds, at least one second.
func retryAfter(h http.Header) time.Duration {
	secs, _ := strconv.Atoi(h.Get("Retry-After"))
	return time.Duration(max(secs, 1)) * time.Second
}

// AppleOptions configure an Apple.
type AppleOptions struct {
	// On is the owner's switch push.apple_relay.
	On func(ctx context.Context) bool
	// URL is the relay's address in use (RelayURL).
	URL func(ctx context.Context) string
	// Client sends to the relay: the outbound client (no proxy, no redirects,
	// private targets as the owner allows). Private targets are refused when nil.
	Client *http.Client
	Now    func() time.Time
}

// Apple is the server's side of the push relay.
type Apple struct {
	db     *sql.DB
	sync   *opsync.Service
	on     func(ctx context.Context) bool
	url    func(ctx context.Context) string
	client *http.Client
	now    func() time.Time
}

// NewApple wires the relay client.
func NewApple(db *sql.DB, syncSvc *opsync.Service, o AppleOptions) *Apple {
	a := &Apple{db: db, sync: syncSvc, on: o.On, url: o.URL, client: o.Client, now: o.Now}
	if a.on == nil {
		a.on = func(context.Context) bool { return false }
	}
	if a.url == nil {
		a.url = func(context.Context) string { return DefaultRelayURL }
	}
	if a.client == nil {
		a.client = outbound.NewClient(&outbound.Dialer{}, relayTimeout)
	}
	if a.now == nil {
		a.now = time.Now
	}
	return a
}

// On reports the owner's switch.
func (a *Apple) On(ctx context.Context) bool { return a.on(ctx) }

// RelayURL is the address in use: OPENTODO_APPLE_RELAY when set, else the
// owner's setting, else the project's relay.
func RelayURL(env, stored string) string {
	for _, v := range []string{env, stored} {
		if v = strings.TrimRight(strings.TrimSpace(v), "/"); v != "" {
			return v
		}
	}
	return DefaultRelayURL
}

// CheckRelayURL validates an address for the relay: https only.
func CheckRelayURL(raw string) error {
	u, err := outbound.ValidateURL(raw)
	if err != nil {
		return err
	}
	if u.Scheme != "https" || u.RawQuery != "" || u.Fragment != "" || u.User != nil {
		return fmt.Errorf("%w: the relay address must be an https URL without query, fragment or credentials", outbound.ErrBadURL)
	}
	return nil
}

// AppleInput is the body of POST /api/v1/push/apple.
type AppleInput struct {
	DeviceID       string `json:"deviceId"`
	Token          string `json:"token"`
	Environment    string `json:"environment"`
	DueToken       string `json:"dueToken"`
	IncludeContent bool   `json:"includeContent"`
}

// AppleDevice is one registration.
type AppleDevice struct {
	ID, UserID, DeviceID string
	Handle               string
	HandleExpiresAt      int64 // Unix ms
	WakeKey              []byte
	IncludeContent       bool
	ScheduleCursor       int64
	ScheduledUntil       int64
	Failures             int
	FailingSince         *int64 // Unix ms of the first failed wake in a row
	CreatedAt            int64
}

// PublicAppleDevice is what the API answers about a registration.
type PublicAppleDevice struct {
	ID             string `json:"id"`
	DeviceID       string `json:"deviceId"`
	IncludeContent bool   `json:"includeContent"`
	ExpiresAt      int64  `json:"expiresAt"`
	CreatedAt      int64  `json:"createdAt"`
}

// Public strips the handle and the wake key.
func (d *AppleDevice) Public() PublicAppleDevice {
	return PublicAppleDevice{ID: d.ID, DeviceID: d.DeviceID, IncludeContent: d.IncludeContent, ExpiresAt: d.HandleExpiresAt, CreatedAt: d.CreatedAt}
}

// DueTokenHash is the stored form of a due token.
func DueTokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func (in *AppleInput) validate() error {
	in.DeviceID = strings.TrimSpace(in.DeviceID)
	switch {
	case in.DeviceID == "" || len(in.DeviceID) > maxDeviceID:
		return fmt.Errorf("%w: deviceId is required (at most %d characters)", ErrInvalidApple, maxDeviceID)
	case len(in.Token) < pushrelay.TokenHexMin || len(in.Token) > pushrelay.TokenHexMax || len(in.Token)%2 != 0:
		return fmt.Errorf("%w: token must be the APNs device token in hex", ErrInvalidApple)
	case in.Environment != "production" && in.Environment != "development":
		return fmt.Errorf("%w: environment must be production or development", ErrInvalidApple)
	}
	if _, err := hex.DecodeString(in.Token); err != nil {
		return fmt.Errorf("%w: token must be the APNs device token in hex", ErrInvalidApple)
	}
	if b, err := base64.RawURLEncoding.DecodeString(in.DueToken); err != nil || len(b) != dueTokenSize {
		return fmt.Errorf("%w: dueToken must be base64url of %d bytes", ErrInvalidApple, dueTokenSize)
	}
	return nil
}

// relayPost sends one request to the relay and returns its status and body.
func (a *Apple) relayPost(ctx context.Context, path string, body any) (int, []byte, http.Header, error) {
	raw, err := json.Marshal(body)
	if err != nil {
		return 0, nil, nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, relayTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.url(ctx)+path, bytes.NewReader(raw))
	if err != nil {
		return 0, nil, nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	// No version (self-hosting "No telemetry").
	req.Header.Set("User-Agent", "OpenTodo")
	resp, err := a.client.Do(req)
	if err != nil {
		return 0, nil, nil, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	return resp.StatusCode, b, resp.Header, nil
}

// Register registers this device with the relay and stores the registration,
// replacing the device's earlier one and, past MaxAppleDevicesPerUser, the
// user's least recently updated one. Nothing is stored when the relay cannot
// be reached.
func (a *Apple) Register(ctx context.Context, uid, sessionHash string, in AppleInput) (*AppleDevice, error) {
	if err := in.validate(); err != nil {
		return nil, err
	}
	if !a.on(ctx) {
		return nil, ErrRelayOff
	}
	wakeKey, err := pushrelay.NewWakeKey()
	if err != nil {
		return nil, err
	}
	status, body, h, err := a.relayPost(ctx, "/v1/register", map[string]string{
		"token": strings.ToLower(in.Token), "environment": in.Environment, "wakeKey": base64.RawURLEncoding.EncodeToString(wakeKey)})
	if err != nil {
		return nil, fmt.Errorf("%w: %s", ErrRelayUnreachable, outbound.RootCause(err))
	}
	var out struct {
		Handle    string `json:"handle"`
		ExpiresAt int64  `json:"expiresAt"`
	}
	if status == http.StatusTooManyRequests {
		return nil, &RelayBusyError{RetryAfter: retryAfter(h)}
	}
	if status == http.StatusBadRequest {
		return nil, fmt.Errorf("%w: the relay refused the device token", ErrInvalidApple)
	}
	if status != http.StatusOK || json.Unmarshal(body, &out) != nil || !strings.HasPrefix(out.Handle, "h1.") || len(out.Handle) > 512 {
		return nil, fmt.Errorf("%w: the relay answered %d", ErrRelayUnreachable, status)
	}
	now := a.now().UnixMilli()
	d := &AppleDevice{ID: ids.New(), UserID: uid, DeviceID: in.DeviceID, Handle: out.Handle, HandleExpiresAt: out.ExpiresAt * 1000,
		WakeKey: wakeKey, IncludeContent: in.IncludeContent, CreatedAt: now}
	return d, a.store(ctx, d, sessionHash, DueTokenHash(in.DueToken))
}

func (a *Apple) store(ctx context.Context, d *AppleDevice, sessionHash, dueHash string) error {
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(ctx, `DELETE FROM apple_devices WHERE (user_id = ? AND device_id = ?) OR due_token_hash = ?`, d.UserID, d.DeviceID, dueHash); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM apple_devices WHERE id IN (SELECT id FROM apple_devices WHERE user_id = ?
		ORDER BY updated_at DESC, id DESC LIMIT -1 OFFSET ?)`, d.UserID, MaxAppleDevicesPerUser-1); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO apple_devices(id, user_id, session_hash, device_id, handle, handle_expires_at, wake_key,
		due_token_hash, include_content, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
		d.ID, d.UserID, sessionHash, d.DeviceID, d.Handle, d.HandleExpiresAt, base64.RawURLEncoding.EncodeToString(d.WakeKey),
		dueHash, d.IncludeContent, d.CreatedAt, d.CreatedAt); err != nil {
		return fmt.Errorf("store apple device: %w", err)
	}
	return tx.Commit()
}

// liveSession keeps a registration whose session has not expired and whose
// user is not deactivated: an expired session's row stays until the session
// is deleted, but neither its due token nor its wakes work.
const liveSession = ` AND EXISTS (SELECT 1 FROM sessions s WHERE s.token_hash = apple_devices.session_hash AND s.expires_at > ?)
  AND user_id NOT IN (SELECT user_id FROM user_status WHERE deactivated_at IS NOT NULL)`

const appleColumns = `id, user_id, device_id, handle, handle_expires_at, wake_key, include_content, schedule_cursor, scheduled_until, failures, failing_since, created_at`

func scanApple(row interface{ Scan(...any) error }) (*AppleDevice, error) {
	var d AppleDevice
	var key string
	if err := row.Scan(&d.ID, &d.UserID, &d.DeviceID, &d.Handle, &d.HandleExpiresAt, &key, &d.IncludeContent,
		&d.ScheduleCursor, &d.ScheduledUntil, &d.Failures, &d.FailingSince, &d.CreatedAt); err != nil {
		return nil, err
	}
	var err error
	if d.WakeKey, err = base64.RawURLEncoding.DecodeString(key); err != nil {
		return nil, fmt.Errorf("stored wake key: %w", err)
	}
	return &d, nil
}

// Device returns one of the user's registrations, ErrNotFound when there is none.
func (a *Apple) Device(ctx context.Context, uid, id string) (*AppleDevice, error) {
	d, err := scanApple(a.db.QueryRowContext(ctx, `SELECT `+appleColumns+` FROM apple_devices WHERE id = ? AND user_id = ?`, id, uid))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return d, err
}

// DeviceForCaller returns the registration of the user's device deviceID, nil when none.
func (a *Apple) DeviceForCaller(ctx context.Context, uid, deviceID string) (*AppleDevice, error) {
	d, err := scanApple(a.db.QueryRowContext(ctx, `SELECT `+appleColumns+` FROM apple_devices WHERE user_id = ? AND device_id = ?`, uid, deviceID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return d, err
}

// Devices lists the user's registrations whose session is live (the ones a
// wake may go to).
func (a *Apple) Devices(ctx context.Context, uid string) ([]*AppleDevice, error) {
	rows, err := a.db.QueryContext(ctx, `SELECT `+appleColumns+` FROM apple_devices WHERE user_id = ?`+liveSession+` ORDER BY created_at, id`, uid, a.now().UnixMilli())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*AppleDevice
	for rows.Next() {
		d, err := scanApple(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// ReportSchedule records that the device's local schedule reflects the op log
// up to cursor, through until (Unix ms), and says whether to renew.
func (a *Apple) ReportSchedule(ctx context.Context, uid, id string, cursor, until int64) (renew bool, err error) {
	d, err := a.Device(ctx, uid, id)
	if err != nil {
		return false, err
	}
	now := a.now()
	if _, err := a.db.ExecContext(ctx, `UPDATE apple_devices SET schedule_cursor = ?, scheduled_until = ?, updated_at = ? WHERE id = ?`,
		cursor, until, now.UnixMilli(), id); err != nil {
		return false, err
	}
	return time.UnixMilli(d.HandleExpiresAt).Sub(now) <= RenewWithin, nil
}

// Delete removes one of the user's registrations. The relay needs no call:
// the handle is forgotten here and expires there.
func (a *Apple) Delete(ctx context.Context, uid, id string) error {
	res, err := a.db.ExecContext(ctx, `DELETE FROM apple_devices WHERE id = ? AND user_id = ?`, id, uid)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// DeviceForDueToken finds the registration a due token belongs to.
func (a *Apple) DeviceForDueToken(ctx context.Context, token string) (*AppleDevice, error) {
	if b, err := base64.RawURLEncoding.DecodeString(token); err != nil || len(b) != dueTokenSize {
		return nil, ErrUnknownDueToken
	}
	d, err := scanApple(a.db.QueryRowContext(ctx, `SELECT `+appleColumns+` FROM apple_devices WHERE due_token_hash = ?`+liveSession, DueTokenHash(token), a.now().UnixMilli()))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrUnknownDueToken
	}
	return d, err
}

// DueItem is one reminder the due route answers.
type DueItem struct {
	ID     string `json:"id"`
	TaskID string `json:"taskId"`
	FireAt int64  `json:"fireAt"`
	Title  string `json:"title,omitempty"`
}

// dueWindowQuery selects the user's reminders firing in a window that are not
// deleted, not location reminders and not dismissed for that firing.
const dueWindowQuery = `
SELECT f.entity_id, CAST(f.value AS REAL), COALESCE(json_extract(tid.value, '$'), '')
FROM scope_fields f
JOIN scope_fields tid ON tid.scope_id = f.scope_id AND tid.entity = 'reminder' AND tid.entity_id = f.entity_id AND tid.field = 'task_id'
WHERE f.scope_id = ? AND f.entity = 'reminder' AND f.field = 'fire_at' AND f.value <> 'null'
  AND CAST(f.value AS REAL) >= ? AND CAST(f.value AS REAL) <= ?
  AND NOT EXISTS (SELECT 1 FROM scope_fields x WHERE x.scope_id = f.scope_id AND x.entity = 'reminder' AND x.entity_id = f.entity_id
      AND x.field = 'deleted_at' AND x.value <> 'null')
  AND NOT EXISTS (SELECT 1 FROM scope_fields x WHERE x.scope_id = f.scope_id AND x.entity = 'reminder' AND x.entity_id = f.entity_id
      AND x.field = 'kind' AND x.value IN ('"arrive"', '"leave"'))
  AND NOT EXISTS (SELECT 1 FROM scope_fields x WHERE x.scope_id = f.scope_id AND x.entity = 'reminder' AND x.entity_id = f.entity_id
      AND x.field = 'dismissed_at' AND x.value <> 'null' AND CAST(x.value AS REAL) >= CAST(f.value AS REAL))
ORDER BY CAST(f.value AS REAL), f.entity_id LIMIT ?`

// Due answers the reminders of d's user firing from DueBefore ago to DueAfter
// ahead, on open tasks, with a plain-text title only when the device included
// titles and the account is not end-to-end encrypted.
func (a *Apple) Due(ctx context.Context, d *AppleDevice) ([]DueItem, error) {
	now := a.now()
	rows, err := a.db.QueryContext(ctx, dueWindowQuery, opsync.PersonalScope(d.UserID),
		float64(now.Add(-DueBefore).UnixMilli()), float64(now.Add(DueAfter).UnixMilli()), maxDueScan)
	if err != nil {
		return nil, fmt.Errorf("due reminders: %w", err)
	}
	var cands []DueItem
	for rows.Next() {
		var it DueItem
		var fire float64
		if err := rows.Scan(&it.ID, &fire, &it.TaskID); err != nil {
			rows.Close()
			return nil, err
		}
		it.FireAt = int64(fire)
		cands = append(cands, it)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	titles := d.IncludeContent
	if titles {
		enc, err := e2ee.NewStore(a.db).Enabled(ctx, d.UserID)
		if err != nil {
			return nil, err
		}
		titles = !enc
	}
	out := []DueItem{}
	for _, it := range cands {
		t, err := a.sync.Get(ctx, d.UserID, "task", it.TaskID)
		if err != nil {
			return nil, err
		}
		if t == nil || t.Deleted() || !opsync.IsNull(t["completed_at"]) {
			continue
		}
		if title := jsonString(t["title"]); titles && !e2ee.IsCiphertext(title) {
			it.Title = PlainTitle(title)
		}
		out = append(out, it)
		if len(out) == maxDueItems {
			break
		}
	}
	return out, nil
}

var (
	mdLink    = regexp.MustCompile(`!?\[([^\]]*)\]\([^)]*\)`)
	mdHeading = regexp.MustCompile(`^#{1,6} +`)
	mdMarks   = strings.NewReplacer("**", "", "__", "", "~~", "", "`", "", "==", "")
)

// PlainTitle is a task title as plain text: links reduced to their text,
// emphasis, code and heading marks removed, one line, at most DueTitleRunes.
func PlainTitle(s string) string {
	s = mdLink.ReplaceAllString(s, "$1")
	s = mdMarks.Replace(s)
	s = strings.Join(strings.Fields(s), " ")
	s = mdHeading.ReplaceAllString(s, "")
	if utf8.RuneCountInString(s) <= DueTitleRunes {
		return s
	}
	return strings.TrimSpace(textutil.TruncateRunes(s, DueTitleRunes-1, "")) + "…"
}

// WakeResult is what the relay made of a wake.
type WakeResult int

const (
	// WakeSent: the relay accepted it.
	WakeSent WakeResult = iota
	// WakeGone: the handle is dead (Apple's 410 or expired); the row was deleted.
	WakeGone
	// WakeLimited: over a relay limit; retry after the duration returned.
	WakeLimited
	// WakeFailed: the relay could not be reached or failed.
	WakeFailed
)

// Wake sends one wake of kind (pushrelay.KindRefresh or KindDue) to d. It
// carries the handle, the kind, the time and the signature, and nothing else.
func (a *Apple) Wake(ctx context.Context, d *AppleDevice, kind string) (WakeResult, time.Duration, error) {
	if !a.on(ctx) {
		return WakeFailed, 0, ErrRelayOff
	}
	ts := a.now().Unix()
	status, _, h, err := a.relayPost(ctx, "/v1/wake", map[string]any{"handle": d.Handle, "kind": kind, "ts": ts,
		"sig": pushrelay.Sign(d.WakeKey, kind, ts, d.Handle)})
	now := a.now().UnixMilli()
	switch {
	case err == nil && status == http.StatusAccepted:
		_, err = a.db.ExecContext(ctx, `UPDATE apple_devices SET failures = 0, failing_since = NULL WHERE id = ?`, d.ID)
		return WakeSent, 0, err
	case err == nil && status == http.StatusGone:
		_, err = a.db.ExecContext(ctx, `DELETE FROM apple_devices WHERE id = ?`, d.ID)
		return WakeGone, 0, err
	case err == nil && status == http.StatusTooManyRequests:
		return WakeLimited, retryAfter(h), nil
	}
	if _, uerr := a.db.ExecContext(ctx, `UPDATE apple_devices SET failures = failures + 1, failing_since = COALESCE(failing_since, ?) WHERE id = ?`,
		now, d.ID); uerr != nil {
		return WakeFailed, 0, uerr
	}
	if err == nil {
		err = fmt.Errorf("%w: the relay answered %d", ErrRelayUnreachable, status)
	} else {
		err = fmt.Errorf("%w: %s", ErrRelayUnreachable, outbound.RootCause(err))
	}
	return WakeFailed, 0, err
}

// RelayHealth asks the relay for its protocol (the delivery check). The caller
// asks only while the owner's switch is on.
func (a *Apple) RelayHealth(ctx context.Context) (int, error) {
	if !a.on(ctx) {
		return 0, ErrRelayOff
	}
	ctx, cancel := context.WithTimeout(ctx, relayTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, a.url(ctx)+"/v1/health", nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("User-Agent", "OpenTodo")
	resp, err := a.client.Do(req)
	if err != nil {
		return 0, fmt.Errorf("%w: %s", ErrRelayUnreachable, outbound.RootCause(err))
	}
	defer resp.Body.Close()
	var out struct {
		Protocol int `json:"protocol"`
	}
	if resp.StatusCode != http.StatusOK || json.NewDecoder(io.LimitReader(resp.Body, 1024)).Decode(&out) != nil {
		return 0, fmt.Errorf("%w: the relay answered %d", ErrRelayUnreachable, resp.StatusCode)
	}
	return out.Protocol, nil
}
