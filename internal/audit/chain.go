package audit

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
)

// The hash chain (OpenSpec change `audit-hash-chain`): every event stores
//
//	hash = hex(SHA-256(previous hash + "\n" + canonical form))
//
// where the previous hash is that of the event recorded just before it, or the
// checkpoint's hash for the first event after the checkpoint. Editing a stored
// event, removing one from the middle or swapping two changes a hash that a later
// event was chained from, so Verify finds the first broken link. There is no key:
// someone who can write the database can recompute the whole chain, which is why
// an owner keeps the chain head of an export somewhere else (docs/audit-log.md).
//
// The client address is left out of the canonical form: turning address logging
// off scrubs every stored address, which must not break the chain.

// chainVersion prefixes the canonical form, so a later format can be told apart.
const chainVersion = 1

// verifyBatch bounds each read of Verify, so the single write connection is
// never held for a whole pass.
const verifyBatch = 1000

// ChainHead is an event's position in the chain: its id and hash. It is what an
// owner keeps outside the server to compare a later export with.
type ChainHead struct {
	ID   int64  `json:"id"`
	Hash string `json:"hash"`
}

// ChainBreak is the first event whose hash does not follow from the one before.
type ChainBreak struct {
	ID int64 `json:"id"`
	// Reason is "missing_hash" (an event without a hash after the checkpoint) or
	// "mismatch" (the event was changed, or an event before it was removed or
	// moved).
	Reason string `json:"reason"`
}

// Verification is the result of checking the chain.
type Verification struct {
	OK bool `json:"ok"`
	// Checked is the number of events whose hash was recomputed.
	Checked int64 `json:"checked"`
	// Uncovered is the number of kept events from before the chain started.
	Uncovered int64 `json:"uncovered"`
	// Checkpoint is where verification starts: the last event the chain does not
	// cover (pruned, or recorded before the chain) and the hash after it.
	Checkpoint ChainHead `json:"checkpoint"`
	// Head is the newest event, or the checkpoint when no event follows it.
	Head  ChainHead   `json:"head"`
	Break *ChainBreak `json:"break"`
}

// chainRow is the stored part of an event the chain covers.
type chainRow struct {
	id, ts            int64
	name, outcome     string
	actorID, targetID sql.NullString
	userAgent         string
	details           string
}

func nullOrString(s sql.NullString) any {
	if !s.Valid {
		return nil
	}
	return s.String
}

// canonical is the event's chained form: a JSON array of the format version and
// the stored columns in a fixed order (details is the stored JSON text).
func (r chainRow) canonical() []byte {
	b, _ := json.Marshal([]any{chainVersion, r.id, r.ts, r.name, r.outcome,
		nullOrString(r.actorID), nullOrString(r.targetID), r.userAgent, r.details})
	return b
}

func chainHash(prev string, r chainRow) string {
	h := sha256.New()
	h.Write([]byte(prev))
	h.Write([]byte{'\n'})
	h.Write(r.canonical())
	return hex.EncodeToString(h.Sum(nil))
}

func checkpoint(ctx context.Context, q execer) (ChainHead, error) {
	var c ChainHead
	err := q.QueryRowContext(ctx, "SELECT after_id, hash FROM audit_chain WHERE id = 1").Scan(&c.ID, &c.Hash)
	if errors.Is(err, sql.ErrNoRows) {
		return ChainHead{}, nil
	}
	return c, err
}

// tip is the newest chained event, or the checkpoint when none follows it.
func tip(ctx context.Context, q execer) (ChainHead, error) {
	c, err := checkpoint(ctx, q)
	if err != nil {
		return c, err
	}
	var h ChainHead
	var hash sql.NullString
	err = q.QueryRowContext(ctx, "SELECT id, hash FROM audit_events WHERE id > ? ORDER BY id DESC LIMIT 1", c.ID).Scan(&h.ID, &hash)
	if errors.Is(err, sql.ErrNoRows) {
		return c, nil
	}
	h.Hash = hash.String
	return h, err
}

// seal stores the hash of the event just inserted with id, chained to the tip
// before it. It runs in the transaction of the insert.
func seal(ctx context.Context, q execer, prev string, row chainRow) error {
	if _, err := q.ExecContext(ctx, "UPDATE audit_events SET hash = ? WHERE id = ?", chainHash(prev, row), row.id); err != nil {
		return fmt.Errorf("audit: seal event %d: %w", row.id, err)
	}
	return nil
}

// Head returns the newest event's id and hash (the checkpoint when the chain is
// empty): the value an owner keeps outside the server.
func (r *Recorder) Head(ctx context.Context) (ChainHead, error) {
	if r == nil {
		return ChainHead{}, nil
	}
	return tip(ctx, r.db)
}

// Verify recomputes every hash after the checkpoint, in id order, and reports
// the first event whose stored hash does not follow from the one before. It
// reads in batches and never changes the log; a broken chain is a result, not
// an error.
func (r *Recorder) Verify(ctx context.Context) (Verification, error) {
	var v Verification
	if r == nil {
		return Verification{OK: true}, nil
	}
	c, err := checkpoint(ctx, r.db)
	if err != nil {
		return v, err
	}
	v.Checkpoint, v.Head = c, c
	if err := r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM audit_events WHERE id <= ?", c.ID).Scan(&v.Uncovered); err != nil {
		return v, err
	}
	prev, after := c.Hash, c.ID
	for {
		rows, stored, err := chainBatch(ctx, r.db, after)
		if err != nil {
			return v, err
		}
		for i, row := range rows {
			want := chainHash(prev, row)
			switch {
			case !stored[i].Valid:
				v.Break = &ChainBreak{ID: row.id, Reason: "missing_hash"}
			case stored[i].String != want:
				v.Break = &ChainBreak{ID: row.id, Reason: "mismatch"}
			}
			if v.Break != nil {
				return v, nil
			}
			v.Checked++
			prev, after = want, row.id
			v.Head = ChainHead{ID: row.id, Hash: want}
		}
		if len(rows) < verifyBatch {
			v.OK = true
			return v, nil
		}
		if err := ctx.Err(); err != nil {
			return v, err
		}
	}
}

func chainBatch(ctx context.Context, db *sql.DB, after int64) ([]chainRow, []sql.NullString, error) {
	rs, err := db.QueryContext(ctx, `SELECT id, ts, name, outcome, actor_id, target_id, user_agent, details, hash
		FROM audit_events WHERE id > ? ORDER BY id LIMIT ?`, after, verifyBatch)
	if err != nil {
		return nil, nil, err
	}
	defer rs.Close()
	var rows []chainRow
	var hashes []sql.NullString
	for rs.Next() {
		var row chainRow
		var h sql.NullString
		if err := rs.Scan(&row.id, &row.ts, &row.name, &row.outcome, &row.actorID, &row.targetID, &row.userAgent, &row.details, &h); err != nil {
			return nil, nil, err
		}
		rows, hashes = append(rows, row), append(hashes, h)
	}
	return rows, hashes, rs.Err()
}

// RechainTx recomputes every hash after the checkpoint inside tx. It exists for
// the public demo instance alone, which removes a visitor's events with their
// sandbox (internal/demo): a deliberate removal that would otherwise read as a
// broken chain. Nothing else may call it.
func RechainTx(ctx context.Context, tx *sql.Tx) error {
	c, err := checkpoint(ctx, tx)
	if err != nil {
		return err
	}
	rs, err := tx.QueryContext(ctx, `SELECT id, ts, name, outcome, actor_id, target_id, user_agent, details
		FROM audit_events WHERE id > ? ORDER BY id`, c.ID)
	if err != nil {
		return err
	}
	var rows []chainRow
	for rs.Next() {
		var row chainRow
		if err := rs.Scan(&row.id, &row.ts, &row.name, &row.outcome, &row.actorID, &row.targetID, &row.userAgent, &row.details); err != nil {
			rs.Close()
			return err
		}
		rows = append(rows, row)
	}
	rs.Close()
	if err := rs.Err(); err != nil {
		return err
	}
	prev := c.Hash
	for _, row := range rows {
		if err := seal(ctx, tx, prev, row); err != nil {
			return err
		}
		prev = chainHash(prev, row)
	}
	return nil
}
