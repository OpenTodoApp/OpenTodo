package calsync

import (
	"context"
	"database/sql"
	"errors"
	"sort"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/calfeed"
)

// A calendar per project (OpenSpec change calsync-project-calendars, D1, D2):
// the person matches projects of the connection's scope, or Inboxes, to
// writable calendars of the connection's account; a task's event goes to the
// calendar of its nearest matched place, else to the connection's target.

// ProjectTargets returns the connection's matches, place id (a project id or
// an Inbox's calendar id) to calendar URL; empty for one calendar.
func (s *Store) ProjectTargets(ctx context.Context, connID string) (map[string]string, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT project_id, calendar_url FROM calsync_project_targets WHERE connection_id = ?`, connID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var p, u string
		if err := rows.Scan(&p, &u); err != nil {
			return nil, err
		}
		out[p] = u
	}
	return out, rows.Err()
}

// SetProjectTargets replaces the connection's matches; an empty map is back to
// one calendar. The sync state of calendars no longer matched is dropped.
func (s *Store) SetProjectTargets(ctx context.Context, connID string, targets map[string]string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM calsync_project_targets WHERE connection_id = ?`, connID); err != nil {
		return err
	}
	keep := map[string]bool{}
	places := make([]string, 0, len(targets))
	for p := range targets {
		places = append(places, p)
	}
	sort.Strings(places)
	for _, p := range places {
		if _, err := tx.ExecContext(ctx, `INSERT INTO calsync_project_targets(connection_id, project_id, calendar_url) VALUES(?,?,?)`, connID, p, targets[p]); err != nil {
			return err
		}
		keep[targets[p]] = true
	}
	rows, err := tx.QueryContext(ctx, `SELECT calendar_url FROM calsync_target_state WHERE connection_id = ?`, connID)
	if err != nil {
		return err
	}
	var drop []string
	for rows.Next() {
		var u string
		if err := rows.Scan(&u); err != nil {
			rows.Close()
			return err
		}
		if !keep[u] {
			drop = append(drop, u)
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, u := range drop {
		if _, err := tx.ExecContext(ctx, `DELETE FROM calsync_target_state WHERE connection_id = ? AND calendar_url = ?`, connID, u); err != nil {
			return err
		}
	}
	// The next cycle runs at once (Sync now's due time).
	if _, err := tx.ExecContext(ctx, `UPDATE calsync_connections SET next_sync_at = 0 WHERE id = ?`, connID); err != nil {
		return err
	}
	return tx.Commit()
}

// TargetState is the sync token and change tag of one target calendar other
// than the connection's own ("" before its first cycle).
func (s *Store) TargetState(ctx context.Context, connID, url string) (syncToken, ctag string, err error) {
	err = s.db.QueryRowContext(ctx, `SELECT sync_token, ctag FROM calsync_target_state WHERE connection_id = ? AND calendar_url = ?`, connID, url).Scan(&syncToken, &ctag)
	if errors.Is(err, sql.ErrNoRows) {
		return "", "", nil
	}
	return syncToken, ctag, err
}

// SaveTargetState records a target calendar's state after its cycle.
func (s *Store) SaveTargetState(ctx context.Context, connID, url, syncToken, ctag string) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO calsync_target_state(connection_id, calendar_url, sync_token, ctag) VALUES(?,?,?,?)
		ON CONFLICT(connection_id, calendar_url) DO UPDATE SET sync_token = excluded.sync_token, ctag = excluded.ctag`, connID, url, syncToken, ctag)
	return err
}

// calendarKey compares calendars however their address ends (a CalDAV
// collection with or without its slash).
func (c *Connection) calendarKey(u string) string { return strings.TrimRight(u, "/") }

// targetFunc gives a task's calendar for the connection's matches: the
// calendar of its nearest matched place, else the connection's target; nil
// without matches (calsync-project-calendars D2).
func (c *Connection) targetFunc(targets map[string]string) func(calfeed.FeedTask) string {
	if len(targets) == 0 {
		return nil
	}
	return func(t calfeed.FeedTask) string {
		for _, p := range t.Places {
			if u, ok := targets[p]; ok && c.Calendar(u) != nil && !c.Calendar(u).ReadOnly {
				return c.calendarKey(u)
			}
		}
		return c.calendarKey(c.TargetURL)
	}
}

// targetCalendars are the calendars a connection with matches writes to: its
// own target first, then each matched writable calendar once, in order.
func (c *Connection) targetCalendars(targets map[string]string) []string {
	out := []string{c.TargetURL}
	seen := map[string]bool{c.calendarKey(c.TargetURL): true}
	urls := make([]string, 0, len(targets))
	for _, u := range targets {
		urls = append(urls, u)
	}
	sort.Strings(urls)
	for _, u := range urls {
		if cal := c.Calendar(u); cal != nil && !cal.ReadOnly && !seen[c.calendarKey(u)] {
			seen[c.calendarKey(u)] = true
			out = append(out, u)
		}
	}
	return out
}

// plus adds the counts of another target calendar's cycle.
func (a RunCounts) plus(b RunCounts) RunCounts {
	return RunCounts{Moved: a.Moved + b.Moved, Renamed: a.Renamed + b.Renamed, Unscheduled: a.Unscheduled + b.Unscheduled,
		Written: a.Written + b.Written, Removed: a.Removed + b.Removed, Conflicts: a.Conflicts + b.Conflicts,
		Refused: a.Refused + b.Refused, Partial: a.Partial || b.Partial}
}
