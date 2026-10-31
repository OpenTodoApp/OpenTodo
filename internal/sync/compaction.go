package sync

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// Compaction of superseded note history (OpenSpec `op-log-compaction`): every
// save of a note writes a full document, so the log keeps every old copy. The
// pass below deletes the ones no device can still need, in every scope.

// CompactField is one field whose superseded values compaction deletes.
type CompactField struct {
	Entity, Field string
	// Daily keeps the last superseded value of each UTC day of its timestamp
	// (a note's readable revision in History); otherwise every superseded value
	// past the grace window goes.
	Daily bool
}

// CompactFields is the table of fields compaction touches: each mergeable
// document field (DocFields) and the description that is its readable
// projection. An entity that gains a document field adds its two rows here
// (TestCompactFieldsCoverDocFields checks every DocFields entry is listed).
var CompactFields = []CompactField{
	{Entity: "task", Field: "notes_doc"},
	{Entity: "task", Field: "description", Daily: true},
	{Entity: "project", Field: "notes_doc"},
	{Entity: "project", Field: "description", Daily: true},
}

// CompactGrace is how long after the server received it a superseded value
// stays in the log (design D2): long enough for every device in use to pull and
// merge it. It counts from receipt, never from the author's timestamp.
const CompactGrace = 30 * 24 * time.Hour

// compactChunk is how many ops one step selects and deletes (design D4).
const compactChunk = 1000

// compactWindow bounds the sequence numbers one candidate query examines, so a
// log of mostly winners never makes one statement scan the whole table.
const compactWindow = 50_000

// supersededSQL holds for an op o (ops) in its scope s (op_scopes) that is not
// the current winner of its field there. Compaction and the encryption purge
// share it.
const supersededSQL = `NOT EXISTS (SELECT 1 FROM scope_fields f WHERE f.scope_id = s.scope_id AND f.entity = o.entity
			AND f.entity_id = o.entity_id AND f.field = o.field AND f.ts = o.ts AND f.device = o.device)`

// laterSameDaySQL holds when an op of the same field, entity and scope with a
// greater (ts, device, seq) falls on the same UTC day as o: o is not its day's
// last revision. The day's last one never matches, so it always stays.
// Timestamps are Unix milliseconds; 86400000 is one day.
const laterSameDaySQL = `EXISTS (SELECT 1 FROM ops l JOIN op_scopes ls ON ls.seq = l.seq
			WHERE l.entity_id = o.entity_id AND l.entity = o.entity AND l.field = o.field AND ls.scope_id = s.scope_id
			AND l.ts / 86400000 = o.ts / 86400000
			AND (l.ts > o.ts OR (l.ts = o.ts AND (l.device > o.device OR (l.device = o.device AND l.seq > o.seq)))))`

// CompactResult is what one CompactNotes call did.
type CompactResult struct {
	OpsRemoved        int
	ValueBytesRemoved int64
	// Next is the high-water mark to pass to the next call (the last sequence
	// number examined); 0 once the pass reached the end of the log.
	Next int64
	// More is true when the time budget ran out before the end of the log.
	More bool
}

// compactSQL is the eligibility condition of design D1 and D3 over o and s
// with its arguments (the receipt cutoff among them): the field first, so other
// fields are passed over cheaply, then the receipt time, the winner check and,
// for a daily field, a later revision on the same UTC day.
func compactSQL(cutoff int64) (string, []any) {
	var all, daily []string
	var args, dailyArgs []any
	for _, f := range CompactFields {
		all = append(all, "(o.entity = ? AND o.field = ?)")
		args = append(args, f.Entity, f.Field)
		if f.Daily {
			daily = append(daily, "(o.entity = ? AND o.field = ?)")
			dailyArgs = append(dailyArgs, f.Entity, f.Field)
		}
	}
	cond := "(" + strings.Join(all, " OR ") + ") AND o.received_at < ? AND " + supersededSQL
	args = append(args, cutoff)
	if len(daily) > 0 {
		cond += " AND (NOT (" + strings.Join(daily, " OR ") + ") OR " + laterSameDaySQL + ")"
		args = append(args, dailyArgs...)
	}
	return cond, args
}

// CompactNotes deletes superseded values of CompactFields that the server
// received more than CompactGrace before now, in every scope (design D1, D3,
// D4). It starts after sequence number from, works in chunks (selected on the
// reader, deleted on the writer in short transactions that repeat every
// condition) and stops once budget has passed, reporting More and the mark to
// resume from. The current winner of a field is never deleted. Sequence
// numbers are never reused, so every cursor stays valid.
func (s *Service) CompactNotes(ctx context.Context, now time.Time, from int64, budget time.Duration) (CompactResult, error) {
	start := time.Now()
	cutoff := now.Add(-CompactGrace).UnixMilli()
	chunk, window := s.compactChunk, int64(compactWindow)
	if chunk <= 0 {
		chunk = compactChunk
	} else {
		window = int64(4 * chunk)
	}
	res := CompactResult{Next: from}
	var top int64
	if err := s.reader().QueryRowContext(ctx, `SELECT COALESCE(MAX(seq), 0) FROM ops`).Scan(&top); err != nil {
		return res, fmt.Errorf("compaction: last sequence: %w", err)
	}
	for res.Next < top {
		upto := min(res.Next+window, top)
		seqs, err := s.compactCandidates(ctx, res.Next, upto, cutoff, chunk)
		if err != nil {
			return res, err
		}
		if len(seqs) == chunk {
			upto = seqs[len(seqs)-1] // the chunk is full: resume after it
		}
		if len(seqs) > 0 {
			n, bytes, err := s.compactDelete(ctx, seqs, cutoff)
			if err != nil {
				return res, err
			}
			res.OpsRemoved += n
			res.ValueBytesRemoved += bytes
		}
		res.Next = upto
		if res.Next < top && (time.Since(start) >= budget || ctx.Err() != nil) {
			res.More = true
			return res, nil
		}
	}
	res.Next = 0
	return res, nil
}

// SetCompactChunk changes how many ops one compaction step handles (and how
// many sequence numbers one query examines, four times as many); tests only (a
// small chunk makes a pass span several steps and runs).
func (s *Service) SetCompactChunk(n int) { s.compactChunk = n }

// compactCandidates finds up to limit eligible ops with a sequence number in
// (from, upto] on the reader, in sequence order.
func (s *Service) compactCandidates(ctx context.Context, from, upto, cutoff int64, limit int) ([]int64, error) {
	cond, args := compactSQL(cutoff)
	rows, err := s.reader().QueryContext(ctx, `SELECT o.seq FROM ops o JOIN op_scopes s ON s.seq = o.seq
		WHERE o.seq > ? AND o.seq <= ? AND `+cond+` ORDER BY o.seq LIMIT ?`, append(append([]any{from, upto}, args...), limit)...)
	if err != nil {
		return nil, fmt.Errorf("compaction: find candidates: %w", err)
	}
	defer rows.Close()
	var seqs []int64
	for rows.Next() {
		var seq int64
		if err := rows.Scan(&seq); err != nil {
			return nil, err
		}
		seqs = append(seqs, seq)
	}
	return seqs, rows.Err()
}

// compactDelete deletes the candidates that are still eligible, checked again
// inside the writer's transaction (a candidate that became the winner, or
// whose day gained no later revision, stays), with their op_scopes rows, and
// tells the tenant quota.
func (s *Service) compactDelete(ctx context.Context, seqs []int64, cutoff int64) (int, int64, error) {
	cond, args := compactSQL(cutoff)
	in := make([]any, len(seqs))
	for i, q := range seqs {
		in[i] = q
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, 0, err
	}
	defer tx.Rollback()
	rows, err := tx.QueryContext(ctx, `DELETE FROM ops WHERE seq IN (SELECT o.seq FROM ops o JOIN op_scopes s ON s.seq = o.seq
		WHERE o.seq IN (`+placeholders(len(in))+`) AND `+cond+`) RETURNING seq, length(CAST(value AS BLOB))`,
		append(in, args...)...)
	if err != nil {
		return 0, 0, fmt.Errorf("compaction: delete: %w", err)
	}
	var deleted []any
	var bytes int64
	for rows.Next() {
		var seq, n int64
		if err := rows.Scan(&seq, &n); err != nil {
			rows.Close()
			return 0, 0, err
		}
		deleted = append(deleted, seq)
		bytes += n
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, 0, err
	}
	if len(deleted) > 0 {
		if _, err := tx.ExecContext(ctx, `DELETE FROM op_scopes WHERE seq IN (`+placeholders(len(deleted))+`)`, deleted...); err != nil {
			return 0, 0, fmt.Errorf("compaction: delete scopes: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, 0, err
	}
	s.quotaRemoved(len(deleted))
	return len(deleted), bytes, nil
}

// QuotaRemover is implemented by a Quota that counts stored ops (a host's
// tenant limits): compaction tells it how many ops it removed, so the count
// goes down without reopening the tenant (design D8).
type QuotaRemover interface {
	Removed(n int)
}

func (s *Service) quotaRemoved(n int) {
	if r, ok := s.quota.(QuotaRemover); ok && n > 0 {
		r.Removed(n)
	}
}

// LastReceived is when the server last stored an op (Unix milliseconds; 0
// with an empty log): the compaction job's "quiet" test.
func (s *Service) LastReceived(ctx context.Context) (int64, error) {
	var at int64
	err := s.reader().QueryRowContext(ctx, `SELECT received_at FROM ops ORDER BY seq DESC LIMIT 1`).Scan(&at)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	return at, err
}
