package sync

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

// A new device's first copy of the account (OpenSpec change
// notes-compaction-at-scale D3): every save of a note is a whole document plus
// its projection, so the log holds many copies the device would download only
// to merge them away. With the sync feature "latest_docs" the regular pull
// leaves out, for the fields of CompactFields:
//
//   - a document (`notes_doc`) when the same device wrote a later one of the
//     same field in the same scope. A device's document only grows: each of its
//     saves merges the stored document first (docs/sync.md "Mergeable
//     documents", rule 2), so its latest save contains its earlier ones, and
//     the union of every device's latest save is the union of all saves. The
//     device ends with the same note as with the whole history.
//   - a projection (`description`) or an append (`appends.<id>`) that is not
//     the current winner of its field in its scope: plain registers, which a
//     device without local edits only ever keeps the winner of.
//
// Like the device's own ops, a left-out op is passed by the cursor. Every
// value travels as stored (ciphertext on encrypted accounts): the server
// compares only (ts, device) and never reads a value.

// docFieldsSQL holds for an op o of a field of CompactFields. Literals, not
// parameters: they come from the table above.
func docFieldsSQL() string {
	var conds []string
	for _, f := range CompactFields {
		if f.Family {
			conds = append(conds, "(o.entity = '"+f.Entity+"' AND o.field GLOB '"+f.Field+"*')")
			continue
		}
		conds = append(conds, "(o.entity = '"+f.Entity+"' AND o.field = '"+f.Field+"')")
	}
	return "(" + strings.Join(conds, " OR ") + ")"
}

// latestQuery is pullQuery that reads, for the fields of CompactFields, the
// size of the value instead of the value (fetched later only for what is
// served).
func latestQuery(n int) string {
	doc := docFieldsSQL()
	return `SELECT o.seq,o.op_id,o.entity,o.entity_id,o.field,CASE WHEN ` + doc + ` THEN NULL ELSE o.value END,
		CASE WHEN ` + doc + ` THEN octet_length(o.value) ELSE -1 END,o.ts,o.device,o.user_id
		FROM (SELECT seq FROM (` + perScope(n, `SELECT seq FROM (SELECT seq FROM op_scopes WHERE scope_id = ? AND seq > ? ORDER BY seq LIMIT ?)`) + `) ORDER BY seq LIMIT ?) s
		JOIN ops o ON o.seq = s.seq ORDER BY s.seq`
}

// pullLatestDocs is pullPage for a device that sent "latest_docs".
func (s *Service) pullLatestDocs(ctx context.Context, tx *sql.Tx, scopes []string, cursor int64, device string, limit int) ([]Op, int64, bool, error) {
	type row struct {
		op   Op
		size int // the value's size for a field of CompactFields, else -1
	}
	rows, err := tx.QueryContext(ctx, latestQuery(len(scopes)), pullArgs(scopes, cursor, limit+1)...)
	if err != nil {
		return nil, cursor, false, err
	}
	var page []row
	for rows.Next() {
		var r row
		var value sql.NullString
		if err := rows.Scan(&r.op.Seq, &r.op.ID, &r.op.Entity, &r.op.EntityID, &r.op.Field, &value, &r.size, &r.op.TS, &r.op.Device, &r.op.Actor); err != nil {
			rows.Close()
			return nil, cursor, false, err
		}
		r.op.Value = []byte(value.String)
		page = append(page, r)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, cursor, false, err
	}
	var docs []int64
	for _, r := range page {
		if r.size >= 0 && r.op.Device != device {
			docs = append(docs, r.op.Seq)
		}
	}
	keep, err := latestDocs(ctx, tx, docs)
	if err != nil {
		return nil, cursor, false, err
	}
	ops := []Op{}
	var fetch []any
	next, more := cursor, false
	n, size := 0, 0
	for _, r := range page {
		if n == limit {
			more = true
			break
		}
		served := r.op.Device != device && (r.size < 0 || keep[r.op.Seq])
		bytes := len(r.op.Value)
		if r.size >= 0 {
			bytes = r.size
		}
		if served && len(ops) > 0 && size+bytes > s.pullBytes() {
			more = true // byte budget reached: this op opens the next page
			break
		}
		next = r.op.Seq
		n++
		if !served {
			continue
		}
		size += bytes
		if r.size >= 0 {
			fetch = append(fetch, r.op.Seq)
		}
		ops = append(ops, r.op)
	}
	if err := fillValues(ctx, tx, ops, fetch); err != nil {
		return nil, cursor, false, err
	}
	return ops, next, more, nil
}

// latestDocs decides which of the ops seqs (all of CompactFields) a device
// copying the account needs: the latest document of each device per field and
// scope, and the winner of a projection or an append.
func latestDocs(ctx context.Context, q querier, seqs []int64) (map[int64]bool, error) {
	keep := map[int64]bool{}
	if len(seqs) == 0 {
		return keep, nil
	}
	in := make([]any, len(seqs))
	for i, v := range seqs {
		in[i] = v
	}
	rows, err := q.QueryContext(ctx, `SELECT DISTINCT s.scope_id, o.entity, o.entity_id, o.field FROM ops o JOIN op_scopes s ON s.seq = o.seq
		WHERE o.seq IN (`+placeholders(len(in))+`)`, in...)
	if err != nil {
		return nil, fmt.Errorf("latest documents: %w", err)
	}
	var groups []compactGroup
	for rows.Next() {
		var g compactGroup
		if err := rows.Scan(&g.scope, &g.entity, &g.entityID, &g.field); err != nil {
			rows.Close()
			return nil, err
		}
		groups = append(groups, g)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for _, g := range groups {
		ops, err := fieldOps(ctx, q, g.scope, g.entity, g.entityID, g.field)
		if err != nil {
			return nil, err
		}
		if IsDocField(g.entity, g.field) {
			heads := map[string]fieldOp{}
			for _, o := range ops {
				if h, ok := heads[o.device]; !ok || o.later(h) {
					heads[o.device] = o
				}
			}
			for _, h := range heads {
				keep[h.seq] = true
			}
			continue
		}
		wts, wdev, ok, err := fieldWinner(ctx, q, g.scope, g.entity, g.entityID, g.field)
		if err != nil {
			return nil, err
		}
		for _, o := range ops {
			if !ok || (o.ts == wts && o.device == wdev) {
				keep[o.seq] = true
			}
		}
	}
	return keep, nil
}

// fillValues reads the values of the served ops whose value the page query
// left out (seqs, in the order of ops).
func fillValues(ctx context.Context, q querier, ops []Op, seqs []any) error {
	if len(seqs) == 0 {
		return nil
	}
	rows, err := q.QueryContext(ctx, `SELECT seq, value FROM ops WHERE seq IN (`+placeholders(len(seqs))+`)`, seqs...)
	if err != nil {
		return fmt.Errorf("latest documents: values: %w", err)
	}
	defer rows.Close()
	values := make(map[int64]string, len(seqs))
	for rows.Next() {
		var seq int64
		var v string
		if err := rows.Scan(&seq, &v); err != nil {
			return err
		}
		values[seq] = v
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for i := range ops {
		if v, ok := values[ops[i].Seq]; ok {
			ops[i].Value = []byte(v)
		}
	}
	return nil
}
