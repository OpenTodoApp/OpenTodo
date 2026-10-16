package sync

import (
	"context"
	"fmt"
	"sort"
	"strings"
)

// PurgeSupersededContent deletes, inside the account's personal scope, every op
// of the given content fields (entity -> fields) that is not the current winner
// of its field (OpenSpec change `e2ee`, design D7). It is what removes plaintext
// history after encryption was enabled; it never touches a winning op, the
// materialized values or shared projects.
//
// Convergence is unaffected: a device that never saw a deleted op only needs the
// winner, which stays, and a device that saw it has already let the winner beat
// it. Cursors stay valid because sequence numbers are never reused. The
// statements run with SQLite's secure_delete on, and the file is then vacuumed
// and the write-ahead log truncated, so the deleted values do not linger in
// free pages; earlier backups and copies are out of reach and the caller says so.
func (s *Service) PurgeSupersededContent(ctx context.Context, userID string, fields map[string][]string) (int, error) {
	var pairs []string
	var args []any
	scope := PersonalScope(userID)
	entities := make([]string, 0, len(fields))
	for e := range fields {
		entities = append(entities, e)
	}
	sort.Strings(entities)
	for _, e := range entities {
		for _, f := range fields[e] {
			// A name ending in "." is a family (custom-fields: task "fields.").
			if strings.HasSuffix(f, ".") {
				pairs = append(pairs, "(o.entity = ? AND substr(o.field, 1, ?) = ?)")
				args = append(args, e, len(f), f)
				continue
			}
			pairs = append(pairs, "(o.entity = ? AND o.field = ?)")
			args = append(args, e, f)
		}
	}
	if len(pairs) == 0 {
		return 0, nil
	}
	conn, err := s.db.Conn(ctx)
	if err != nil {
		return 0, err
	}
	defer conn.Close()
	if _, err := conn.ExecContext(ctx, `PRAGMA secure_delete = ON`); err != nil {
		return 0, fmt.Errorf("enable secure_delete: %w", err)
	}
	// The pool may hand this connection to anyone afterwards: restore the default.
	defer conn.ExecContext(context.Background(), `PRAGMA secure_delete = OFF`) //nolint:errcheck
	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	rows, err := tx.QueryContext(ctx, `SELECT o.seq FROM ops o JOIN op_scopes s ON s.seq = o.seq
		WHERE s.scope_id = ? AND (`+strings.Join(pairs, " OR ")+`)
		AND NOT EXISTS (SELECT 1 FROM scope_fields f WHERE f.scope_id = s.scope_id AND f.entity = o.entity
			AND f.entity_id = o.entity_id AND f.field = o.field AND f.ts = o.ts AND f.device = o.device)`,
		append([]any{scope}, args...)...)
	if err != nil {
		return 0, fmt.Errorf("find superseded ops: %w", err)
	}
	var seqs []any
	for rows.Next() {
		var seq int64
		if err := rows.Scan(&seq); err != nil {
			rows.Close()
			return 0, err
		}
		seqs = append(seqs, seq)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	total := len(seqs)
	for len(seqs) > 0 {
		n := min(len(seqs), 500)
		chunk := seqs[:n]
		seqs = seqs[n:]
		if _, err := tx.ExecContext(ctx, `DELETE FROM ops WHERE seq IN (`+placeholders(n)+`)`, chunk...); err != nil {
			return 0, err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM op_scopes WHERE seq IN (`+placeholders(n)+`)`, chunk...); err != nil {
			return 0, err
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	// Best effort, after the deletion is durable: rebuild the file so no freed
	// page or in-page free block keeps an old value, then fold the write-ahead
	// log (which holds earlier page images) back and truncate it. A failure
	// leaves the purge itself intact.
	if total > 0 {
		_, _ = conn.ExecContext(ctx, `VACUUM`)
		_, _ = conn.ExecContext(ctx, `PRAGMA wal_checkpoint(TRUNCATE)`)
	}
	return total, nil
}
