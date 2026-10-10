package backup

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// Run statuses.
const (
	StatusRunning   = "running"
	StatusSucceeded = "succeeded"
	StatusFailed    = "failed"
)

// Run kinds.
const (
	KindManual    = "manual"
	KindScheduled = "scheduled"
)

// runHistoryDays is how long run records are kept.
const runHistoryDays = 90

// Run is one backup attempt as recorded in backup_runs.
type Run struct {
	ID          string `json:"id"`
	Kind        string `json:"kind"`
	StartedAt   int64  `json:"startedAt"`
	FinishedAt  *int64 `json:"finishedAt"`
	Status      string `json:"status"`
	Bytes       int64  `json:"bytes"`
	Destination string `json:"destination"`
	ArchiveName string `json:"archiveName"`
	Error       string `json:"error"`
	DurationMs  *int64 `json:"durationMs"`
}

func (s *Service) insertRun(ctx context.Context, r *Run) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO backup_runs(id, kind, started_at, status, destination) VALUES(?,?,?,?,?)`,
		r.ID, r.Kind, r.StartedAt, r.Status, r.Destination)
	return err
}

func (s *Service) finishRun(ctx context.Context, r *Run) error {
	_, err := s.db.ExecContext(ctx, `UPDATE backup_runs SET finished_at = ?, status = ?, bytes = ?, archive_name = ?, error = ? WHERE id = ?`,
		r.FinishedAt, r.Status, r.Bytes, r.ArchiveName, r.Error, r.ID)
	if err != nil {
		return err
	}
	cutoff := s.now().Add(-runHistoryDays * 24 * time.Hour).UnixMilli()
	_, err = s.db.ExecContext(ctx, `DELETE FROM backup_runs WHERE started_at < ? AND status != 'running'`, cutoff)
	return err
}

// History returns the most recent runs, newest first.
func (s *Service) History(ctx context.Context, limit int) ([]Run, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, kind, started_at, finished_at, status, bytes, destination, archive_name, error
		FROM backup_runs ORDER BY started_at DESC, rowid DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Run{}
	for rows.Next() {
		var r Run
		var fin sql.NullInt64
		if err := rows.Scan(&r.ID, &r.Kind, &r.StartedAt, &fin, &r.Status, &r.Bytes, &r.Destination, &r.ArchiveName, &r.Error); err != nil {
			return nil, err
		}
		if fin.Valid {
			f := fin.Int64
			d := f - r.StartedAt
			r.FinishedAt, r.DurationMs = &f, &d
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// lastScheduledStart is when the most recent scheduled run began (0 if none).
func (s *Service) lastScheduledStart(ctx context.Context) (int64, error) {
	var v sql.NullInt64
	err := s.db.QueryRowContext(ctx, `SELECT MAX(started_at) FROM backup_runs WHERE kind = 'scheduled'`).Scan(&v)
	if errors.Is(err, sql.ErrNoRows) || !v.Valid {
		return 0, nil
	}
	return v.Int64, err
}

// markInterrupted closes runs left "running" by a crash or restart.
func (s *Service) markInterrupted(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `UPDATE backup_runs SET status = 'failed', finished_at = started_at, error = 'interrupted: the server stopped during the run'
		WHERE status = 'running'`)
	return err
}
