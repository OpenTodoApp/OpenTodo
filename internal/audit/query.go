package audit

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"time"
)

// Page size bounds of GET /api/v1/audit.
const (
	DefaultLimit = 50
	MaxLimit     = 200
)

// Personal activity bounds (GET /api/v1/me/activity).
const (
	ActivityDays  = 90
	ActivityLimit = 100
)

// Entry is the API view of a stored event.
type Entry struct {
	ID          int64             `json:"id"`
	TS          int64             `json:"ts"`
	Name        Name              `json:"name"`
	Outcome     string            `json:"outcome"`
	ActorID     *string           `json:"actorId"`
	ActorEmail  *string           `json:"actorEmail"`
	TargetID    *string           `json:"targetId"`
	TargetEmail *string           `json:"targetEmail"`
	IP          *string           `json:"ip"`
	UserAgent   string            `json:"userAgent"`
	Details     map[string]string `json:"details"`
}

// Filter selects events. Zero values mean "no constraint".
type Filter struct {
	Name    Name
	Actor   string // account id, or an email (contains "@") resolved case-insensitively
	Target  string // same as Actor
	Outcome string
	From    int64 // inclusive, Unix ms
	To      int64 // inclusive, Unix ms
	Cursor  int64 // return events with id < Cursor (the last id of the previous page)
	Limit   int

	// subject and names are used by Activity only: events whose actor or target is
	// subject, restricted to names.
	subject string
	names   []Name
}

// List returns events matching f, newest first, and the cursor of the next page
// (0 when there are no more).
func (r *Recorder) List(ctx context.Context, f Filter) ([]Entry, int64, error) {
	if f.Limit <= 0 || f.Limit > MaxLimit {
		f.Limit = DefaultLimit
	}
	where, args := f.where()
	args = append(args, f.Limit+1)
	rows, err := r.db.QueryContext(ctx, `SELECT e.id, e.ts, e.name, e.outcome, e.actor_id, a.email, e.target_id, t.email,
			e.ip, e.user_agent, e.details
		FROM audit_events e
		LEFT JOIN users a ON a.id = e.actor_id
		LEFT JOIN users t ON t.id = e.target_id
		WHERE `+where+` ORDER BY e.id DESC LIMIT ?`, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []Entry{}
	for rows.Next() {
		var e Entry
		var details string
		var actorEmail, targetEmail sql.NullString
		if err := rows.Scan(&e.ID, &e.TS, &e.Name, &e.Outcome, &e.ActorID, &actorEmail, &e.TargetID, &targetEmail,
			&e.IP, &e.UserAgent, &details); err != nil {
			return nil, 0, err
		}
		e.Details = map[string]string{}
		_ = json.Unmarshal([]byte(details), &e.Details)
		// Prefer the live account email; fall back to the snapshot taken when the
		// event was recorded, so history stays readable after an account is gone.
		snapshot := e.Details["email"]
		e.ActorEmail = pick(actorEmail, e.ActorID, snapshot)
		e.TargetEmail = pick(targetEmail, e.TargetID, snapshot)
		out = append(out, e)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	var next int64
	if len(out) > f.Limit {
		out = out[:f.Limit]
		next = out[len(out)-1].ID
	}
	return out, next, nil
}

// Activity returns userID's own access events (sign-ins, sign-outs, credentials,
// tokens) from the last 90 days, at most 100, newest first. The query is bound to
// userID as actor or target, so other accounts' events never appear.
func (r *Recorder) Activity(ctx context.Context, userID string) ([]Entry, error) {
	list, _, err := r.List(ctx, Filter{
		subject: userID, names: PersonalNames, Limit: ActivityLimit,
		From: r.now().Add(-ActivityDays * 24 * time.Hour).UnixMilli(),
	})
	return list, err
}

func (f Filter) where() (string, []any) {
	conds := []string{"1=1"}
	var args []any
	if f.Name != "" {
		conds = append(conds, "e.name = ?")
		args = append(args, string(f.Name))
	}
	if f.Actor != "" {
		c, a := accountCond("e.actor_id", f.Actor)
		conds, args = append(conds, c), append(args, a)
	}
	if f.Target != "" {
		c, a := accountCond("e.target_id", f.Target)
		conds, args = append(conds, c), append(args, a)
	}
	if f.Outcome != "" {
		conds = append(conds, "e.outcome = ?")
		args = append(args, f.Outcome)
	}
	if f.From != 0 {
		conds = append(conds, "e.ts >= ?")
		args = append(args, f.From)
	}
	if f.To != 0 {
		conds = append(conds, "e.ts <= ?")
		args = append(args, f.To)
	}
	if f.Cursor > 0 {
		conds = append(conds, "e.id < ?")
		args = append(args, f.Cursor)
	}
	if f.subject != "" {
		conds = append(conds, "(e.actor_id = ? OR e.target_id = ?)")
		args = append(args, f.subject, f.subject)
	}
	if len(f.names) > 0 {
		ph := strings.TrimSuffix(strings.Repeat("?,", len(f.names)), ",")
		conds = append(conds, "e.name IN ("+ph+")")
		for _, n := range f.names {
			args = append(args, string(n))
		}
	}
	return strings.Join(conds, " AND "), args
}

func accountCond(col, v string) (string, any) {
	if strings.Contains(v, "@") {
		return col + " IN (SELECT id FROM users WHERE email = ? COLLATE NOCASE)", strings.TrimSpace(v)
	}
	return col + " = ?", v
}

func pick(live sql.NullString, id *string, snapshot string) *string {
	if id == nil {
		return nil
	}
	if live.Valid {
		return &live.String
	}
	if snapshot != "" {
		return &snapshot
	}
	return nil
}
