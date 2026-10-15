package notify

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/pixari/opentodo/internal/ids"
)

// Retention: read notifications older than this are removed by Sweep. Unread
// ones are kept until read, whatever their age.
const Retention = 90 * 24 * time.Hour

// MaxList bounds one GET /api/v1/notifications response (newest first).
const MaxList = 200

// ErrNotFound: no notification with this id belongs to the caller.
var ErrNotFound = errors.New("notification not found")

// Notification is one stored in-app notification.
type Notification struct {
	ID        string          `json:"id"`
	Kind      string          `json:"kind"`
	Payload   json.RawMessage `json:"payload"`
	CreatedAt int64           `json:"createdAt"`
	ReadAt    *int64          `json:"readAt"`
}

// InApp is the Sink that stores notifications in the `notifications` table for
// the recipient to list and mark read. Notifications are server-side account
// data like sessions: they are not written to the op log.
type InApp struct {
	db  *sql.DB
	log *slog.Logger
	now func() time.Time
}

// NewInApp wires an InApp sink on the server database. log may be nil.
func NewInApp(db *sql.DB, log *slog.Logger) *InApp {
	if log == nil {
		log = slog.Default()
	}
	return &InApp{db: db, log: log, now: time.Now}
}

// Assigned stores an "assigned" notification for the assignee.
func (n *InApp) Assigned(ctx context.Context, e Assigned) {
	payload, err := json.Marshal(e)
	if err == nil {
		_, err = n.db.ExecContext(ctx, `INSERT INTO notifications(id,user_id,kind,payload,created_at) VALUES(?,?,?,?,?)`,
			ids.New(), e.AssigneeID, KindAssigned, string(payload), n.now().UnixMilli())
	}
	if err != nil {
		n.log.Error("store notification", "kind", KindAssigned, "err", err)
	}
}

// Mentioned stores a "mentioned" notification for the mentioned member
// (OpenSpec change `comments-and-activity`).
func (n *InApp) Mentioned(ctx context.Context, e Mentioned) {
	payload, err := json.Marshal(e)
	if err == nil {
		_, err = n.db.ExecContext(ctx, `INSERT INTO notifications(id,user_id,kind,payload,created_at) VALUES(?,?,?,?,?)`,
			ids.New(), e.RecipientID, KindMentioned, string(payload), n.now().UnixMilli())
	}
	if err != nil {
		n.log.Error("store notification", "kind", KindMentioned, "err", err)
	}
}

// Unblocked stores an "unblocked" notification for the assignee (task-dependencies).
func (n *InApp) Unblocked(ctx context.Context, e Unblocked) {
	payload, err := json.Marshal(e)
	if err == nil {
		_, err = n.db.ExecContext(ctx, `INSERT INTO notifications(id,user_id,kind,payload,created_at) VALUES(?,?,?,?,?)`,
			ids.New(), e.AssigneeID, KindUnblocked, string(payload), n.now().UnixMilli())
	}
	if err != nil {
		n.log.Error("store notification", "kind", KindUnblocked, "err", err)
	}
}

// List returns the user's notifications, newest first, and the number unread.
func (n *InApp) List(ctx context.Context, userID string) ([]Notification, int, error) {
	rows, err := n.db.QueryContext(ctx, `SELECT id, kind, payload, created_at, read_at FROM notifications
		WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`, userID, MaxList)
	if err != nil {
		return nil, 0, fmt.Errorf("list notifications: %w", err)
	}
	defer rows.Close()
	out := []Notification{}
	for rows.Next() {
		var x Notification
		var payload string
		var read sql.NullInt64
		if err := rows.Scan(&x.ID, &x.Kind, &payload, &x.CreatedAt, &read); err != nil {
			return nil, 0, err
		}
		x.Payload = json.RawMessage(payload)
		if read.Valid {
			v := read.Int64
			x.ReadAt = &v
		}
		out = append(out, x)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	var unread int
	if err := n.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL`, userID).Scan(&unread); err != nil {
		return nil, 0, err
	}
	return out, unread, nil
}

// MarkRead marks one of the user's notifications read (idempotent). Another
// account's notification is reported as ErrNotFound and left unchanged.
func (n *InApp) MarkRead(ctx context.Context, userID, id string) error {
	var read sql.NullInt64
	err := n.db.QueryRowContext(ctx, `SELECT read_at FROM notifications WHERE id = ? AND user_id = ?`, id, userID).Scan(&read)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil || read.Valid {
		return err
	}
	_, err = n.db.ExecContext(ctx, `UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?`, n.now().UnixMilli(), id, userID)
	return err
}

// Sweep deletes read notifications older than Retention; it runs at start-up.
func (n *InApp) Sweep(ctx context.Context) (int64, error) {
	cutoff := n.now().Add(-Retention).UnixMilli()
	r, err := n.db.ExecContext(ctx, `DELETE FROM notifications WHERE read_at IS NOT NULL AND created_at < ?`, cutoff)
	if err != nil {
		return 0, fmt.Errorf("sweep notifications: %w", err)
	}
	return r.RowsAffected()
}
