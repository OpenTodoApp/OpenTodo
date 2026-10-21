package auth

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/ids"
)

// Task pages (OpenSpec change `task-pages`): one task published as a page that
// people without an account can open, reply to and tick. Server-side data like
// public links: never ops, never synced, only a hash of the secret stored. For a
// task the server holds as ciphertext the publisher's device uploads a snapshot
// encrypted with a share key the server never sees (design D3, D4).

// MaxTaskPageDays is the longest expiry; 0 means no expiry.
const MaxTaskPageDays = 90

// Task page limits (design D6, "Task page limits").
const (
	MaxActiveTaskPages   = 100
	MaxTaskPageSnapshot  = 256 << 10
	MaxTaskPageReply     = 16 << 10
	TaskPageSecretBytes  = 16 // 128 bits, 22 characters of base64url
	taskPageSecretLength = 22
)

var (
	// ErrTaskPageInvalid covers every unusable secret.
	ErrTaskPageInvalid = errors.New("this page is no longer available")
	// ErrTaskPageLimit: the account already has MaxActiveTaskPages active pages.
	ErrTaskPageLimit = errors.New("too many active task pages")
	// ErrNotEncryptedPage: a snapshot was sent for a page served live.
	ErrNotEncryptedPage = errors.New("this page is served live, it takes no snapshot")
)

// taskPageLabel is a label: 1–40 lowercase letters, digits and hyphens.
var taskPageLabel = regexp.MustCompile(`^[a-z0-9-]{1,40}$`)

// ValidTaskPageLabel reports whether s may be a page's label.
func ValidTaskPageLabel(s string) bool { return taskPageLabel.MatchString(s) }

// ValidTaskPageRights reports whether r is view, reply or tick.
func ValidTaskPageRights(r string) bool { return r == "view" || r == "reply" || r == "tick" }

// TaskPage is the publisher's view of a page. It never carries the secret.
type TaskPage struct {
	ID              string  `json:"id"`
	TaskID          string  `json:"taskId"`
	UserID          string  `json:"createdBy"`
	Rights          string  `json:"rights"`
	Label           *string `json:"label"`
	IncludeMap      bool    `json:"includeMap"`
	PublishedAt     int64   `json:"publishedAt"`
	ExpiresAt       *int64  `json:"expiresAt"`
	LastOpenedAt    *int64  `json:"lastOpenedAt"`
	Replies         int     `json:"replies"`
	Ticks           int     `json:"ticks"`
	Encrypted       bool    `json:"encrypted"`
	SnapshotVersion int64   `json:"snapshotVersion"`
	SnapshotAt      *int64  `json:"snapshotAt"`
	// WrappedKey is the share key encrypted with the account key: opaque to the
	// server, handed back to the publisher's devices only.
	WrappedKey *string `json:"wrappedKey,omitempty"`
	// PendingReplies counts encrypted guest replies waiting to be imported.
	PendingReplies int `json:"pendingReplies"`
}

// ResolvedTaskPage is an active page found by its secret, with the publisher's
// state for the use-time checks. Never sent to a guest as is.
type ResolvedTaskPage struct {
	TaskPage
	PublisherDeactivated bool
	Snapshot             []byte
}

// PublishInput is a publish request the caller validated.
type PublishInput struct {
	TaskID     string
	Rights     string
	Label      string
	Days       int
	IncludeMap bool
	// Snapshot and WrappedKey are set for an encrypted task (design D3).
	Snapshot   []byte
	WrappedKey string
}

const taskPageColumns = `p.id, p.task_id, p.user_id, p.rights, p.label, p.include_map, p.published_at, p.expires_at, p.last_opened_at,
	p.replies, p.ticks, p.snapshot IS NOT NULL OR p.wrapped_key IS NOT NULL, p.snapshot_version, p.snapshot_at, p.wrapped_key,
	(SELECT COUNT(*) FROM task_page_replies r WHERE r.page_id = p.id)`

func scanTaskPage(sc interface{ Scan(...any) error }, extra ...any) (*TaskPage, error) {
	var p TaskPage
	var wrapped sql.NullString
	dest := append([]any{&p.ID, &p.TaskID, &p.UserID, &p.Rights, &p.Label, &p.IncludeMap, &p.PublishedAt, &p.ExpiresAt, &p.LastOpenedAt,
		&p.Replies, &p.Ticks, &p.Encrypted, &p.SnapshotVersion, &p.SnapshotAt, &wrapped, &p.PendingReplies}, extra...)
	if err := sc.Scan(dest...); err != nil {
		return nil, err
	}
	if wrapped.Valid {
		p.WrappedKey = &wrapped.String
	}
	return &p, nil
}

// activeTaskPage is the SQL condition of an active page at time ?.
const activeTaskPage = `p.revoked_at IS NULL AND (p.expires_at IS NULL OR p.expires_at > ?)`

// PublishTaskPage replaces the task's active page, if any, with a new one and
// returns it with its secret (returned once). The caller checked that publisher
// may publish the task. Replacing and publishing commit together with their
// audit events.
func (s *Service) PublishTaskPage(ctx context.Context, publisher *User, in PublishInput) (*TaskPage, string, error) {
	now := s.clock()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, "", err
	}
	defer tx.Rollback()
	var active int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM task_pages p WHERE p.user_id = ? AND p.task_id <> ? AND `+activeTaskPage,
		publisher.ID, in.TaskID, now.UnixMilli()).Scan(&active); err != nil {
		return nil, "", err
	}
	if active >= MaxActiveTaskPages {
		return nil, "", ErrTaskPageLimit
	}
	if err := revokeTaskPageTx(ctx, tx, s, publisher.ID, in.TaskID, now); err != nil {
		return nil, "", err
	}
	p := &TaskPage{ID: ids.New(), TaskID: in.TaskID, UserID: publisher.ID, Rights: in.Rights, IncludeMap: in.IncludeMap, PublishedAt: now.UnixMilli()}
	if in.Label != "" {
		p.Label = &in.Label
	}
	if in.Days > 0 {
		at := now.Add(time.Duration(in.Days) * 24 * time.Hour).UnixMilli()
		p.ExpiresAt = &at
	}
	var snapshot, wrapped any
	if in.WrappedKey != "" {
		wrapped, p.WrappedKey, p.Encrypted = in.WrappedKey, &in.WrappedKey, true
		if len(in.Snapshot) > 0 {
			snapshot, p.SnapshotVersion, p.SnapshotAt = in.Snapshot, 1, &p.PublishedAt
		}
	}
	secret := ids.Secret(TaskPageSecretBytes)
	if _, err := tx.ExecContext(ctx, `INSERT INTO task_pages(id,task_id,user_id,secret_hash,rights,label,include_map,expires_at,published_at,snapshot,snapshot_version,snapshot_at,wrapped_key)
		VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		p.ID, p.TaskID, p.UserID, hashToken(secret), p.Rights, p.Label, p.IncludeMap, p.ExpiresAt, p.PublishedAt, snapshot, p.SnapshotVersion, p.SnapshotAt, wrapped); err != nil {
		return nil, "", err
	}
	if err := s.audit.RecordTx(ctx, tx, audit.TaskPagePublished(publisher.ID, p.ID, p.Rights)); err != nil {
		return nil, "", err
	}
	if err := tx.Commit(); err != nil {
		return nil, "", err
	}
	return p, secret, nil
}

// revokeTaskPageTx revokes the task's active page (if any) and drops its
// snapshot, wrapped key and pending replies.
func revokeTaskPageTx(ctx context.Context, tx *sql.Tx, s *Service, actorID, taskID string, now time.Time) error {
	var id string
	err := tx.QueryRowContext(ctx, `SELECT id FROM task_pages WHERE task_id = ? AND revoked_at IS NULL`, taskID).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE task_pages SET revoked_at = ?, snapshot = NULL, wrapped_key = NULL WHERE id = ?`, now.UnixMilli(), id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM task_page_replies WHERE page_id = ?`, id); err != nil {
		return err
	}
	return s.audit.RecordTx(ctx, tx, audit.TaskPageRevoked(actorID, id))
}

// RevokeTaskPage revokes the task's active page; ErrNotFound when there is none.
func (s *Service) RevokeTaskPage(ctx context.Context, actorID, taskID string) error {
	if _, err := s.ActiveTaskPage(ctx, taskID); err != nil {
		return err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := revokeTaskPageTx(ctx, tx, s, actorID, taskID, s.clock()); err != nil {
		return err
	}
	return tx.Commit()
}

// ActiveTaskPage returns the task's active page, or ErrNotFound.
func (s *Service) ActiveTaskPage(ctx context.Context, taskID string) (*TaskPage, error) {
	p, err := scanTaskPage(s.db.QueryRowContext(ctx, `SELECT `+taskPageColumns+` FROM task_pages p WHERE p.task_id = ? AND `+activeTaskPage,
		taskID, s.clock().UnixMilli()))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return p, err
}

// UserTaskPages lists the active pages a user published, newest first.
func (s *Service) UserTaskPages(ctx context.Context, userID string) ([]TaskPage, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+taskPageColumns+` FROM task_pages p WHERE p.user_id = ? AND `+activeTaskPage+` ORDER BY p.published_at DESC`,
		userID, s.clock().UnixMilli())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TaskPage{}
	for rows.Next() {
		p, err := scanTaskPage(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *p)
	}
	return out, rows.Err()
}

// LookupTaskPage resolves a secret to its active page; every failure is
// ErrTaskPageInvalid.
func (s *Service) LookupTaskPage(ctx context.Context, secret string) (*ResolvedTaskPage, error) {
	secret = strings.TrimSpace(secret)
	if len(secret) != taskPageSecretLength {
		return nil, ErrTaskPageInvalid
	}
	want := hashToken(secret)
	var stored string
	var deactivated sql.NullInt64
	var snapshot []byte
	p, err := scanTaskPage(s.db.QueryRowContext(ctx, `SELECT `+taskPageColumns+`, p.secret_hash, st.deactivated_at, p.snapshot
		FROM task_pages p LEFT JOIN user_status st ON st.user_id = p.user_id
		WHERE p.secret_hash = ? AND `+activeTaskPage, want, s.clock().UnixMilli()), &stored, &deactivated, &snapshot)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrTaskPageInvalid
	}
	if err != nil {
		return nil, err
	}
	if subtle.ConstantTimeCompare([]byte(stored), []byte(want)) != 1 {
		return nil, ErrTaskPageInvalid
	}
	return &ResolvedTaskPage{TaskPage: *p, PublisherDeactivated: deactivated.Valid, Snapshot: snapshot}, nil
}

// TouchTaskPage stamps last_opened_at, at most once a minute.
func (s *Service) TouchTaskPage(ctx context.Context, id string) error {
	now := s.clock().UnixMilli()
	_, err := s.db.ExecContext(ctx, `UPDATE task_pages SET last_opened_at = ? WHERE id = ? AND (last_opened_at IS NULL OR last_opened_at < ?)`, now, id, now-60_000)
	return err
}

// RecordTaskPageAction counts a guest's reply or tick and remembers the name
// they typed for the op timestamp ts, so history can name them.
func (s *Service) RecordTaskPageAction(ctx context.Context, pageID string, ts int64, name string, reply bool) error {
	col := "ticks"
	if reply {
		col = "replies"
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE task_pages SET `+col+` = `+col+` + 1 WHERE id = ?`, pageID); err != nil {
		return err
	}
	if name == "" {
		return nil
	}
	_, err := s.db.ExecContext(ctx, `INSERT OR REPLACE INTO task_page_actions(page_id, ts, name) VALUES(?,?,?)`, pageID, ts, name)
	return err
}

// TaskPageGuestName returns the name a guest typed for a page's write at ts
// ("" when unknown).
func (s *Service) TaskPageGuestName(ctx context.Context, pageID string, ts int64) (string, error) {
	var name string
	err := s.db.QueryRowContext(ctx, `SELECT name FROM task_page_actions WHERE page_id = ? AND ts = ?`, pageID, ts).Scan(&name)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return name, err
}

// PutTaskPageSnapshot stores a newer encrypted snapshot of a page; a version not
// greater than the stored one changes nothing (design D3), so concurrent uploads
// converge on the newest. wrappedKey ("" to keep the stored one) is set when a
// page's task moved into an encrypted scope and a device sends its first snapshot.
func (s *Service) PutTaskPageSnapshot(ctx context.Context, pageID string, ciphertext []byte, version int64, wrappedKey string) error {
	var wk any
	if wrappedKey != "" {
		wk = wrappedKey
	}
	_, err := s.db.ExecContext(ctx, `UPDATE task_pages SET snapshot = ?, snapshot_version = ?, snapshot_at = ?, wrapped_key = COALESCE(?, wrapped_key)
		WHERE id = ? AND snapshot_version < ?`, ciphertext, version, s.clock().UnixMilli(), wk, pageID, version)
	return err
}

// DropTaskPageSnapshot forgets the snapshot and wrapped key of the task's active
// page when the task leaves an encrypted scope (lifecycle requirement).
func (s *Service) DropTaskPageSnapshot(ctx context.Context, pageID string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE task_pages SET snapshot = NULL, wrapped_key = NULL, snapshot_version = 0, snapshot_at = NULL WHERE id = ?`, pageID)
	return err
}

// TaskPageReply is an encrypted guest reply waiting for a device.
type TaskPageReply struct {
	ID         string `json:"id"`
	Ciphertext string `json:"ciphertext"`
	CreatedAt  int64  `json:"createdAt"`
}

// AddTaskPageReply stores an encrypted guest reply.
func (s *Service) AddTaskPageReply(ctx context.Context, pageID, ciphertext string) (string, error) {
	id := ids.New()
	_, err := s.db.ExecContext(ctx, `INSERT INTO task_page_replies(id,page_id,ciphertext,created_at) VALUES(?,?,?,?)`, id, pageID, ciphertext, s.clock().UnixMilli())
	if err != nil {
		return "", err
	}
	_, err = s.db.ExecContext(ctx, `UPDATE task_pages SET replies = replies + 1 WHERE id = ?`, pageID)
	return id, err
}

// TaskPageReplies lists a page's pending encrypted replies, oldest first.
func (s *Service) TaskPageReplies(ctx context.Context, pageID string) ([]TaskPageReply, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, ciphertext, created_at FROM task_page_replies WHERE page_id = ? ORDER BY created_at, id`, pageID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TaskPageReply{}
	for rows.Next() {
		var r TaskPageReply
		if err := rows.Scan(&r.ID, &r.Ciphertext, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// DeleteTaskPageReply confirms an imported reply; ErrNotFound when it is not
// pending on that page.
func (s *Service) DeleteTaskPageReply(ctx context.Context, pageID, replyID string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM task_page_replies WHERE id = ? AND page_id = ?`, replyID, pageID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// TaskPageOfDevice returns the page id of a page: device, or "".
func TaskPageOfDevice(device string) string {
	id, ok := strings.CutPrefix(device, "page:")
	if !ok {
		return ""
	}
	return id
}
