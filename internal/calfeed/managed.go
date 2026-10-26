package calfeed

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/pixari/opentodo/internal/ids"
)

// Managed subscriptions (OpenSpec change calendar-two-way, design D10): the
// calendars a calendar sync connection shows in Day and Week are stored as
// subscriptions that calsync_calendars marks. Calendar feeds' routes, limit
// and fetcher never see them; their events are served with everyone else's.

// kindFilter limits a query on calendar_subscriptions (aliased by prefix) to
// the user's own subscriptions, the managed ones, or both.
func kindFilter(prefix string, feeds, managed bool) string {
	switch {
	case feeds && managed:
		return ""
	case feeds:
		return " AND " + prefix + "id NOT IN (SELECT subscription_id FROM calsync_calendars)"
	case managed:
		return " AND " + prefix + "id IN (SELECT subscription_id FROM calsync_calendars)"
	}
	return " AND 0"
}

// ManagedCalendar is one managed subscription: the calendar it shows and the
// connection it belongs to.
type ManagedCalendar struct {
	SubscriptionID string
	ConnectionID   string
	CalendarURL    string
	// Version is the calendar's CTag or sync token when its events were stored.
	Version string
}

// Managed lists the user's managed subscriptions (the events route names them).
// One sync cycle creates several in the same millisecond, so the name breaks the
// tie before the random id and the order is the same on every server.
func (s *Store) Managed(ctx context.Context, userID string) ([]Subscription, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+subColumns+` FROM calendar_subscriptions WHERE user_id = ?`+kindFilter("", false, true)+` ORDER BY created_at, name, id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Subscription{}
	for rows.Next() {
		sub, err := scanSub(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *sub)
	}
	return out, rows.Err()
}

// ManagedOf lists a connection's managed subscriptions by calendar URL.
func (s *Store) ManagedOf(ctx context.Context, connID string) (map[string]ManagedCalendar, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT m.subscription_id, m.connection_id, m.calendar_url, s.etag FROM calsync_calendars m
		JOIN calendar_subscriptions s ON s.id = m.subscription_id WHERE m.connection_id = ?`, connID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]ManagedCalendar{}
	for rows.Next() {
		var m ManagedCalendar
		if err := rows.Scan(&m.SubscriptionID, &m.ConnectionID, &m.CalendarURL, &m.Version); err != nil {
			return nil, err
		}
		out[m.CalendarURL] = m
	}
	return out, rows.Err()
}

// EnsureManaged returns the managed subscription of a connection's calendar,
// creating it when missing, and keeps its name and colour current.
func (s *Store) EnsureManaged(ctx context.Context, userID, connID, calendarURL, name, color string) (ManagedCalendar, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return ManagedCalendar{}, err
	}
	defer tx.Rollback()
	now := s.now().UnixMilli()
	m := ManagedCalendar{ConnectionID: connID, CalendarURL: calendarURL}
	err = tx.QueryRowContext(ctx, `SELECT m.subscription_id, s.etag FROM calsync_calendars m JOIN calendar_subscriptions s ON s.id = m.subscription_id
		WHERE m.connection_id = ? AND m.calendar_url = ?`, connID, calendarURL).Scan(&m.SubscriptionID, &m.Version)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		m.SubscriptionID = ids.New()
		// The address is the calendar's; nothing fetches it (Due skips managed rows).
		if _, err := tx.ExecContext(ctx, `INSERT INTO calendar_subscriptions(id,user_id,url,name,color,enabled,interval_seconds,next_fetch_at,created_at,updated_at)
			VALUES(?,?,?,?,?,1,?,?,?,?)`, m.SubscriptionID, userID, calendarURL, name, color, int64(DefaultInterval/time.Second), now, now, now); err != nil {
			return m, err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO calsync_calendars(subscription_id, connection_id, calendar_url) VALUES(?,?,?)`, m.SubscriptionID, connID, calendarURL); err != nil {
			return m, err
		}
	case err != nil:
		return m, err
	default:
		if _, err := tx.ExecContext(ctx, `UPDATE calendar_subscriptions SET name = ?, color = ?, updated_at = ? WHERE id = ? AND (name != ? OR color != ?)`,
			name, color, now, m.SubscriptionID, name, color); err != nil {
			return m, err
		}
	}
	return m, tx.Commit()
}

// DropManaged deletes a connection's managed subscriptions (and their events)
// whose calendar is not in keep; nil keep drops them all.
func (s *Store) DropManaged(ctx context.Context, connID string, keep map[string]bool) (int, error) {
	list, err := s.ManagedOf(ctx, connID)
	if err != nil {
		return 0, err
	}
	n := 0
	for url, m := range list {
		if keep[url] {
			continue
		}
		if _, err := s.db.ExecContext(ctx, `DELETE FROM calendar_subscriptions WHERE id = ?`, m.SubscriptionID); err != nil {
			return n, err
		}
		n++
	}
	return n, nil
}

// StoreManaged replaces a managed subscription's events with occurrences read
// from its calendar, recording the calendar's version (CTag or sync token).
func (s *Store) StoreManaged(ctx context.Context, subscriptionID, version string, occ []Occurrence, warnings []string) error {
	return s.Success(ctx, subscriptionID, &Result{Replaced: true, Occurrences: occ, Warnings: warnings, ETag: version})
}
