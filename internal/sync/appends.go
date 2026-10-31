package sync

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// Plain-text writes of a note (OpenSpec change notes-overview, design D13):
// the receipt rules of pending appends (`appends.<id>`, docs/sync.md
// "Mergeable documents" rule 5) and the body version a replacement is checked
// against.

// Refusal reasons of pending appends.
const (
	// ReasonTooManyAppends: the entity already has MaxPendingAppends pending.
	ReasonTooManyAppends = "too_many_appends"
	// ReasonAppendTaken: a non-empty value for an append id that already has
	// a value (an append is written once and never edited).
	ReasonAppendTaken = "append_taken"
)

// checkAppend applies the receipt rules of one `appends.<id>` op the author
// may write in scope: "" is always accepted (a device folded the text); a
// non-empty value only for a key without any value yet, while the entity
// holds fewer than MaxPendingAppends pending appends and its projection plus
// pending appends stay within MaxValueBytes (by length, which is the envelope
// length on ciphertext).
func (r *resolver) checkAppend(op Op, scope string) (string, error) {
	var text string
	if json.Unmarshal(op.Value, &text) != nil || text == "" {
		return "", nil
	}
	// The batch's stored ops are already in scope_fields: the checks see them.
	var one int
	err := r.tx.QueryRowContext(r.ctx, `SELECT 1 FROM scope_fields WHERE scope_id = ? AND entity = ? AND entity_id = ? AND field = ?`,
		scope, op.Entity, op.EntityID, op.Field).Scan(&one)
	if err == nil {
		return ReasonAppendTaken, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}
	var pending, bytes int
	if err := r.tx.QueryRowContext(r.ctx, `SELECT COUNT(CASE WHEN field != 'description' THEN 1 END), COALESCE(SUM(length(value)), 0)
		FROM scope_fields WHERE scope_id = ? AND entity = ? AND entity_id = ?
		AND (field = 'description' OR (field LIKE 'appends.%' AND value != '""'))`,
		scope, op.Entity, op.EntityID).Scan(&pending, &bytes); err != nil {
		return "", err
	}
	if pending >= MaxPendingAppends {
		return ReasonTooManyAppends, nil
	}
	if bytes+len(op.Value) > MaxValueBytes {
		return ReasonTooLarge, nil
	}
	return "", nil
}

// PendingAppend is one append no device has folded into the document yet.
type PendingAppend struct {
	ID   string `json:"id"`
	Text string `json:"text"`
	ts   int64
	dev  string
}

// BodyInfo is what a plain-text reader needs beside a note's projection: its
// body version and its pending appends, oldest first.
type BodyInfo struct {
	Version string
	Appends []PendingAppend
}

// FormatBodyVersion is the body version of the clock (ts, device): what
// `If-Match` and `base_version` carry.
func FormatBodyVersion(ts int64, device string) string {
	if ts == 0 {
		return "0"
	}
	return strconv.FormatInt(ts, 10) + ":" + device
}

// ErrBodyChanged refuses a replacement whose version check failed (409
// body_changed): the note changed after the writer read it.
var ErrBodyChanged = errors.New("body_changed")

// BodyChangedError is ErrBodyChanged with the current version.
type BodyChangedError struct{ Current string }

func (e *BodyChangedError) Error() string {
	return "the note changed since it was read (version " + e.Current + ")"
}

// Is makes errors.Is(err, ErrBodyChanged) hold.
func (e *BodyChangedError) Is(target error) bool { return target == ErrBodyChanged }

type bodyVersionKey struct{}

type bodyCheck struct{ entity, id, version string }

// WithBodyVersion makes the next Apply or ApplyStrict on ctx check, inside
// its transaction, that entity/id still has body version version, and refuse
// the whole batch with a *BodyChangedError otherwise (design D13).
func WithBodyVersion(ctx context.Context, entity, id, version string) context.Context {
	return context.WithValue(ctx, bodyVersionKey{}, bodyCheck{entity, id, strings.TrimSpace(version)})
}

// checkBodyVersion runs the check of WithBodyVersion, if any, in the batch.
func checkBodyVersion(ctx context.Context, q querier, acc *access) error {
	c, ok := ctx.Value(bodyVersionKey{}).(bodyCheck)
	if !ok {
		return nil
	}
	infos, err := bodyInfos(ctx, q, acc.scopes(), c.entity, c.id)
	if err != nil {
		return err
	}
	current := "0"
	if info, ok := infos[c.id]; ok {
		current = info.Version
	}
	if current != c.version {
		return &BodyChangedError{Current: current}
	}
	return nil
}

// BodyInfos returns the body version and pending appends of the entities of
// one kind (task, project or note) the user can see, by id; with id set, of
// that entity only. One query, never the projections themselves.
func (s *Service) BodyInfos(ctx context.Context, userID, entity, id string) (map[string]BodyInfo, error) {
	acc, err := loadAccess(ctx, s.reader(), userID)
	if err != nil {
		return nil, err
	}
	return bodyInfos(ctx, s.reader(), acc.scopes(), entity, id)
}

func bodyInfos(ctx context.Context, q querier, scopes []string, entity, id string) (map[string]BodyInfo, error) {
	query := `SELECT entity_id, field, CASE WHEN field LIKE 'appends.%' THEN value ELSE '""' END, ts, device FROM scope_fields
		WHERE entity = ? AND scope_id IN (` + placeholders(len(scopes)) + `)
		AND (field IN ('description', 'notes_doc') OR field LIKE 'appends.%')`
	args := append([]any{entity}, anys(scopes)...)
	if id != "" {
		query += ` AND entity_id = ?`
		args = append(args, id)
	}
	rows, err := q.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("body info: %w", err)
	}
	defer rows.Close()
	type best struct {
		ts  int64
		dev string
	}
	top := map[string]best{}
	out := map[string]BodyInfo{}
	for rows.Next() {
		var eid, field, value, dev string
		var ts int64
		if err := rows.Scan(&eid, &field, &value, &ts, &dev); err != nil {
			return nil, err
		}
		if b := top[eid]; Wins(ts, dev, b.ts, b.dev) {
			top[eid] = best{ts, dev}
		}
		info := out[eid]
		if aid, ok := AppendID(field); ok {
			var text string
			if json.Unmarshal([]byte(value), &text) == nil && text != "" {
				info.Appends = append(info.Appends, PendingAppend{ID: aid, Text: text, ts: ts, dev: dev})
			}
		}
		out[eid] = info
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for eid, info := range out {
		info.Version = FormatBodyVersion(top[eid].ts, top[eid].dev)
		sort.Slice(info.Appends, func(i, j int) bool {
			a, b := info.Appends[i], info.Appends[j]
			return Wins(b.ts, b.dev, a.ts, a.dev) || (a.ts == b.ts && a.dev == b.dev && a.ID < b.ID)
		})
		out[eid] = info
	}
	return out, nil
}

// PlainText is a note's text as plain-text readers show it (design D13): the
// projection followed by its pending appends in clock order, a blank line
// between.
func PlainText(description string, appends []PendingAppend) string {
	parts := make([]string, 0, len(appends)+1)
	if strings.TrimSpace(description) != "" {
		parts = append(parts, strings.TrimRight(description, "\n"))
	}
	for _, a := range appends {
		parts = append(parts, strings.TrimRight(a.Text, "\n"))
	}
	return strings.Join(parts, "\n\n")
}
