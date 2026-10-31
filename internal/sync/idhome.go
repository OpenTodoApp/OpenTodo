package sync

import (
	"context"
	"database/sql"
	"encoding/json"
	"math"
)

// Entity id ownership (OpenSpec change entity-id-ownership). Every id of a
// project, task, section, custom field, comment, attachment, time entry or
// automation rule names one entity on the whole server: an op for an id that
// exists goes to the scope the entity lives in, with the author's permission
// checked there, and an id that exists only where the author cannot see it is
// refused like any forbidden write, never created a second time. Before this
// change the lookup skipped other accounts' personal scopes, so a member of a
// shared project who learned the id of someone's private task could create a
// task with that id in the project and receive the owner's later edits.
//
// Labels, saved views, reminders, places, reviews and preferences stay per
// account: they never leave their author's personal scope, and project_prefs
// is keyed by a project id on purpose, one record per member.

// uniqueIDs lists the entities placed in the author's personal scope (outside
// the project child, comment, attachment and time entry rules) whose ids are
// unique on the server: projects, whose id names a sharing scope, automation
// rules, whose id keys the server's run log and state, and calendar frames
// (calendar-frames D1) and calendar slots (calendar-slots D1).
var uniqueIDs = map[string]bool{"project": true, "rule": true, "frame": true, "slot": true}

// homeScope picks, among holders (the scopes that hold fields of one entity
// id), the scope acc reads and writes the entity in, or "" when acc may not
// use it.
//
// One holder is the rule. Several are possible only for data written before
// entity-id-ownership, through an id collision or a squat (security finding
// H1). The entity then belongs to the visible holder with the earliest op, and
// a visible copy that is younger than a hidden copy in a scope with a member in
// common is refused: it is a squat on that member's data, and writing it would
// reach their devices.
func homeScope(ctx context.Context, q querier, acc *access, entity, id string, holders []string) (string, error) {
	if len(holders) == 1 {
		if acc.canSee(holders[0]) {
			return holders[0], nil
		}
		return "", nil
	}
	first, err := firstSeqs(ctx, q, entity, id)
	if err != nil {
		return "", err
	}
	earlier := func(a, b string) bool {
		sa, sb := seqOr(first, a), seqOr(first, b)
		if sa != sb {
			return sa < sb
		}
		if ra, rb := acc.rank(a), acc.rank(b); ra != rb {
			return ra < rb
		}
		return a < b
	}
	best := ""
	for _, sc := range holders {
		if acc.canSee(sc) && (best == "" || earlier(sc, best)) {
			best = sc
		}
	}
	if best == "" {
		return "", nil
	}
	for _, sc := range holders {
		if acc.canSee(sc) || !earlier(sc, best) {
			continue
		}
		common, err := shareAMember(ctx, q, sc, best)
		if err != nil {
			return "", err
		}
		if common {
			return "", nil
		}
	}
	return best, nil
}

// firstSeqs maps each scope holding ops of one entity to its earliest op's seq.
func firstSeqs(ctx context.Context, q querier, entity, id string) (map[string]int64, error) {
	rows, err := q.QueryContext(ctx, `SELECT s.scope_id, MIN(o.seq) FROM ops o JOIN op_scopes s ON s.seq = o.seq
		WHERE o.entity_id = ? AND o.entity = ? GROUP BY s.scope_id`, id, entity)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int64{}
	for rows.Next() {
		var sc string
		var seq int64
		if err := rows.Scan(&sc, &seq); err != nil {
			return nil, err
		}
		out[sc] = seq
	}
	return out, rows.Err()
}

func seqOr(first map[string]int64, scope string) int64 {
	if seq, ok := first[scope]; ok {
		return seq
	}
	return math.MaxInt64
}

// shareAMember reports whether one user can see both scopes.
func shareAMember(ctx context.Context, q querier, a, b string) (bool, error) {
	ua, err := scopeUsers(ctx, q, a)
	if err != nil {
		return false, err
	}
	ub, err := scopeUsers(ctx, q, b)
	if err != nil {
		return false, err
	}
	in := map[string]bool{}
	for _, u := range ua {
		in[u] = true
	}
	for _, u := range ub {
		if in[u] {
			return true, nil
		}
	}
	return false, nil
}

// entityIn materializes one entity from one scope.
func (s *Service) entityIn(ctx context.Context, scope, entity, id string) (Entity, error) {
	rows, err := s.reader().QueryContext(ctx, `SELECT field, value FROM scope_fields WHERE scope_id = ? AND entity = ? AND entity_id = ?`, scope, entity, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	e := Entity{"id": json.RawMessage(QuoteJSON(id))}
	for rows.Next() {
		var field, value string
		if err := rows.Scan(&field, &value); err != nil {
			return nil, err
		}
		e[field] = json.RawMessage(value)
	}
	return e, rows.Err()
}

// claimable reports whether the author may write an entity of uniqueIDs in
// their personal scope: the id is new, or that is where it lives.
func (r *resolver) claimable(entity, id string) (bool, error) {
	key := entity + "\x00" + id
	if v, ok := r.claims[key]; ok {
		return v, nil
	}
	holders, err := scopesHolding(r.ctx, r.tx, entity, id)
	if err != nil {
		return false, err
	}
	ok := len(holders) == 0
	if !ok {
		home, err := homeScope(r.ctx, r.tx, r.acc, entity, id, holders)
		if err != nil {
			return false, err
		}
		ok = home == r.acc.personal
	}
	r.claims[key] = ok
	return ok, nil
}

// holderHome is homeScope for the resolver: found is false for an unknown id
// (no holders); scope is "" when the author may not use the entity.
func (r *resolver) holderHome(entity, id string, holders []string) (scope string, found bool, err error) {
	if len(holders) == 0 {
		return "", false, nil
	}
	scope, err = homeScope(r.ctx, r.tx, r.acc, entity, id, holders)
	return scope, true, err
}

// pairHome looks up, in every scope, an entity created with two fixed id
// fields (a comment's or attachment's task_id and author_id, a time entry's
// task_id and user_id) and returns its home scope and that scope's values.
func (r *resolver) pairHome(entity, id, f1, f2 string) (found bool, scope, v1, v2 string, err error) {
	rows, err := r.tx.QueryContext(r.ctx, `SELECT scope_id, field, CASE WHEN field IN (?, ?) THEN value END FROM scope_fields
		WHERE entity = ? AND entity_id = ?`, f1, f2, entity, id)
	if err != nil {
		return false, "", "", "", err
	}
	defer rows.Close()
	vals := map[string]*[2]string{}
	var holders []string
	for rows.Next() {
		var sc, field string
		var value sql.NullString
		if err := rows.Scan(&sc, &field, &value); err != nil {
			return false, "", "", "", err
		}
		v := vals[sc]
		if v == nil {
			v = &[2]string{}
			vals[sc] = v
			holders = append(holders, sc)
		}
		switch field {
		case f1:
			v[0] = idValue(json.RawMessage(value.String))
		case f2:
			v[1] = idValue(json.RawMessage(value.String))
		}
	}
	if err := rows.Err(); err != nil {
		return false, "", "", "", err
	}
	scope, found, err = r.holderHome(entity, id, holders)
	if err != nil || scope == "" {
		return found, "", "", "", err
	}
	return true, scope, vals[scope][0], vals[scope][1], nil
}
