package calsync

import (
	"context"
	"database/sql"
	"errors"
)

// Cursor is where a Graph delta query of one calendar stopped (OpenSpec change
// outlook-calendar-sync, design D6): the delta link, the window it covers
// (Unix ms) and a version that changes whenever the calendar did.
type Cursor struct {
	DeltaLink string
	From, To  int64
	Version   string
}

// Cursor returns a calendar's cursor, nil when it has none.
func (s *Store) Cursor(ctx context.Context, connID, calendar string) (*Cursor, error) {
	var c Cursor
	err := s.db.QueryRowContext(ctx, `SELECT delta_link, window_from, window_to, version FROM calsync_cursors WHERE connection_id = ? AND calendar_id = ?`,
		connID, calendar).Scan(&c.DeltaLink, &c.From, &c.To, &c.Version)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// SaveCursor stores or replaces a calendar's cursor.
func (s *Store) SaveCursor(ctx context.Context, connID, calendar string, c Cursor) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO calsync_cursors(connection_id, calendar_id, delta_link, window_from, window_to, version, updated_at)
		VALUES(?,?,?,?,?,?,?) ON CONFLICT(connection_id, calendar_id) DO UPDATE SET delta_link = excluded.delta_link,
		window_from = excluded.window_from, window_to = excluded.window_to, version = excluded.version, updated_at = excluded.updated_at`,
		connID, calendar, c.DeltaLink, c.From, c.To, c.Version, s.now().UnixMilli())
	return err
}

// StopProvider stops every running connection of a provider with reason (a
// Microsoft client secret Microsoft refused, design D4) and reports how many.
func (s *Store) StopProvider(ctx context.Context, provider, reason string) (int64, error) {
	now := s.now().UnixMilli()
	res, err := s.db.ExecContext(ctx, `UPDATE calsync_connections SET stopped_reason = ?, last_error = ?, last_error_at = ?, updated_at = ?
		WHERE provider = ? AND stopped_reason IS NULL`, reason, reason, now, now, provider)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// ResumeProvider clears a stop of every connection of a provider and makes
// them due now (the owner saved a new client secret); it reports how many.
func (s *Store) ResumeProvider(ctx context.Context, provider string, reasons ...string) (int64, error) {
	var n int64
	now := s.now().UnixMilli()
	for _, reason := range reasons {
		res, err := s.db.ExecContext(ctx, `UPDATE calsync_connections SET stopped_reason = NULL, last_error = '', backoff_seconds = 0, next_sync_at = ?,
			updated_at = ? WHERE provider = ? AND stopped_reason = ?`, now, now, provider, reason)
		if err != nil {
			return n, err
		}
		k, _ := res.RowsAffected()
		n += k
	}
	return n, nil
}
