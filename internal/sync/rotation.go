package sync

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"slices"
	"strings"
)

// Rotating assignees on recurring tasks (OpenSpec change chore-rotation). The
// web client computes the same thing in web/src/lib/rotation.ts; both are
// pinned by web/src/lib/rotation.vectors.json.

// MaxRotation caps the people of a task's rotation (design D1).
const MaxRotation = 20

// checkIDListOp refuses an id list naming its own entity, and a rotation of
// more than MaxRotation people.
func checkIDListOp(op Op, k kind) error {
	if k == kIDList && slices.Contains(idList(op.Value), op.EntityID) {
		return fmt.Errorf("%w: %s.%s cannot name the task itself", ErrInvalidOp, op.Entity, op.Field)
	}
	if op.Entity == "task" && op.Field == "rotation" && len(idList(op.Value)) > MaxRotation {
		return fmt.Errorf("%w: task.rotation may hold at most %d people", ErrInvalidOp, MaxRotation)
	}
	return nil
}

// NextAssignee is the person whose turn follows current (design D2): the one
// after current among the rotation's people who are members, wrapping around,
// or the first of them when current is not one of them. With no member left
// in the rotation it returns current unchanged.
func NextAssignee(rotation []string, current string, isMember func(string) bool) string {
	live := make([]string, 0, len(rotation))
	for _, id := range rotation {
		if isMember(id) {
			live = append(live, id)
		}
	}
	if len(live) == 0 {
		return current
	}
	for i, id := range live {
		if id == current {
			return live[(i+1)%len(live)]
		}
	}
	return live[0]
}

// projectMemberSet is the current members of a shared project (empty for a
// personal project: a rotation there is inert).
func projectMemberSet(ctx context.Context, q querier, projectID string) (map[string]bool, error) {
	out := map[string]bool{}
	if projectID == "" {
		return out, nil
	}
	rows, err := q.QueryContext(ctx, `SELECT user_id FROM project_members WHERE project_id = ?`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var u string
		if err := rows.Scan(&u); err != nil {
			return nil, err
		}
		out[u] = true
	}
	return out, rows.Err()
}

// RotationAllowed reports whether a rotation takes effect on task row (the
// task after the write): a top-level task with a rule in a project with at
// least two members (design D1). The REST API, the agent tools and the CLI
// refuse a rotation where it would be inert.
func (s *Service) RotationAllowed(ctx context.Context, row Entity) (bool, error) {
	if StringOf(row["recurrence"]) == "" || idValue(row["parent_id"]) != "" {
		return false, nil
	}
	members, err := projectMemberSet(ctx, s.db, idValue(row["project_id"]))
	return len(members) >= 2, err
}

// rotateOnCompletion sets body.assignee_id to the next person of a rotating
// series that a completion continues (design D2, D3), unless the write sets
// the assignee itself. row is the series as the completion sees it. A
// rotation is in effect only on a top-level series of a project with at
// least two members.
func (s *Service) rotateOnCompletion(ctx context.Context, row Entity, body map[string]json.RawMessage) error {
	if _, sets := body["assignee_id"]; sets {
		return nil
	}
	rotation := idList(row["rotation"])
	if len(rotation) == 0 || idValue(row["parent_id"]) != "" {
		return nil
	}
	members, err := projectMemberSet(ctx, s.db, idValue(row["project_id"]))
	if err != nil || len(members) < 2 {
		return err
	}
	current := idValue(row["assignee_id"])
	next := NextAssignee(rotation, current, func(id string) bool { return members[id] })
	if next != current && next != "" {
		body["assignee_id"] = JSONOf(next)
	}
	return nil
}

// departureWrite is one field a departure writes on one task (design D4).
type departureWrite struct {
	task, field string
	value       json.RawMessage
	ts          int64 // the stamp of the value it replaces
}

// departureRepairs reads, inside the membership transaction, every task of the
// project that departed is assigned or whose rotation names them, and returns
// what to write, in task order: the rotation without departed, and for a task
// departed held, the person after them in its rotation among those who remain
// when it rotates (a top-level recurring task), null otherwise. remaining is
// the membership after the departure. It returns the tasks unassigned or
// handed on too.
func departureRepairs(ctx context.Context, tx *sql.Tx, scope, departed string, remaining map[string]bool) ([]departureWrite, []string, error) {
	want, err := json.Marshal(departed)
	if err != nil {
		return nil, nil, err
	}
	rows, err := tx.QueryContext(ctx, `SELECT a.entity_id, a.field, a.value, a.ts, COALESCE(r.value, '[]') FROM scope_fields a
		LEFT JOIN scope_fields r ON r.scope_id = a.scope_id AND r.entity = 'task' AND r.entity_id = a.entity_id AND r.field = 'rotation'
		WHERE a.scope_id = ? AND a.entity = 'task' AND (
			(a.field = 'assignee_id' AND a.value = ?) OR
			(a.field = 'rotation' AND a.value LIKE ? ESCAPE '\'))
		ORDER BY a.entity_id, a.field`, scope, string(want), "%"+likeEscape(string(want))+"%")
	if err != nil {
		return nil, nil, err
	}
	type hit struct {
		id, field string
		ts        int64
		rotation  []string
	}
	var hits []hit
	for rows.Next() {
		var h hit
		var value, rot string
		if err := rows.Scan(&h.id, &h.field, &value, &h.ts, &rot); err != nil {
			rows.Close()
			return nil, nil, err
		}
		h.rotation = idList(json.RawMessage(rot))
		if h.field == "rotation" && !slices.Contains(h.rotation, departed) {
			continue // the LIKE matched a longer id
		}
		hits = append(hits, h)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}
	var out []departureWrite
	var held []string
	for _, h := range hits {
		if h.field == "rotation" {
			kept := slices.DeleteFunc(slices.Clone(h.rotation), func(u string) bool { return u == departed })
			out = append(out, departureWrite{task: h.id, field: "rotation", value: JSONOf(kept), ts: h.ts})
			continue
		}
		held = append(held, h.id)
		value := json.RawMessage("null")
		if len(h.rotation) > 0 {
			rotates, err := taskRotates(ctx, tx, scope, h.id)
			if err != nil {
				return nil, nil, err
			}
			// The turn passes to the person after departed among those who
			// remain (departed still counts for their own place in the order).
			next := NextAssignee(h.rotation, departed, func(u string) bool { return u == departed || remaining[u] })
			if rotates && next != departed && next != "" {
				value = JSONOf(next)
			}
		}
		out = append(out, departureWrite{task: h.id, field: "assignee_id", value: value, ts: h.ts})
	}
	return out, held, nil
}

// taskRotates reports whether a task is a top-level recurring task (its
// rotation in effect, apart from the member count).
func taskRotates(ctx context.Context, tx *sql.Tx, scope, id string) (bool, error) {
	rows, err := tx.QueryContext(ctx, `SELECT field, value FROM scope_fields WHERE scope_id = ? AND entity = 'task' AND entity_id = ?
		AND field IN ('recurrence','parent_id','completed_at','deleted_at')`, scope, id)
	if err != nil {
		return false, err
	}
	defer rows.Close()
	row := Entity{}
	for rows.Next() {
		var f, v string
		if err := rows.Scan(&f, &v); err != nil {
			return false, err
		}
		row[f] = json.RawMessage(v)
	}
	if err := rows.Err(); err != nil {
		return false, err
	}
	_, ok := openSeries(id, row)
	return ok && idValue(row["parent_id"]) == "", nil
}

// likeEscape escapes LIKE wildcards with a backslash.
func likeEscape(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

// ValidRotation reports whether list may be a rotation (design D1): at most
// MaxRotation distinct, non-empty account ids of at most MaxIDLen characters.
func ValidRotation(list []string) bool {
	return list != nil && checkIDs(JSONOf(list), MaxRotation) == nil
}
