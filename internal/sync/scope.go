package sync

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
)

// Scopes (OpenSpec change `project-sharing`, design D1): every op and every
// materialized field belongs to exactly one scope. A user's personal scope holds
// their Inbox, unshared projects, labels and saved views; each shared project is
// its own scope that all of its members read and write within their role.

// PersonalScope is the scope id of a user's own data.
func PersonalScope(userID string) string { return "user:" + userID }

// ProjectScope is the scope id of a shared project.
func ProjectScope(projectID string) string { return "project:" + projectID }

// Roles on a shared project.
const (
	RoleOwner  = "owner"
	RoleAdmin  = "admin"
	RoleEditor = "editor"
	RoleViewer = "viewer"
)

// querier is satisfied by *sql.DB and *sql.Tx.
type querier interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

func placeholders(n int) string {
	if n <= 0 {
		return "NULL"
	}
	return strings.TrimSuffix(strings.Repeat("?,", n), ",")
}

func anys(ss []string) []any {
	out := make([]any, len(ss))
	for i, s := range ss {
		out[i] = s
	}
	return out
}

// access is what one user may see and write, read once per request.
type access struct {
	userID   string
	personal string
	roles    map[string]string // shared project id -> role
	projects []string          // shared project ids, sorted
}

func loadAccess(ctx context.Context, q querier, userID string) (*access, error) {
	a := &access{userID: userID, personal: PersonalScope(userID), roles: map[string]string{}}
	rows, err := q.QueryContext(ctx, `SELECT project_id, role FROM project_members WHERE user_id = ? ORDER BY project_id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var pid, role string
		if err := rows.Scan(&pid, &role); err != nil {
			return nil, err
		}
		a.roles[pid] = role
		a.projects = append(a.projects, pid)
	}
	return a, rows.Err()
}

// scopes lists the visible scopes: shared projects first, the personal scope last.
func (a *access) scopes() []string {
	out := make([]string, 0, len(a.projects)+1)
	for _, p := range a.projects {
		out = append(out, ProjectScope(p))
	}
	return append(out, a.personal)
}

// rank orders visible scopes by preference when one id appears in several
// (shared projects before personal data); invisible scopes rank last.
func (a *access) rank(scope string) int {
	if pid, ok := strings.CutPrefix(scope, "project:"); ok {
		if _, member := a.roles[pid]; member {
			return 0
		}
		return 2
	}
	if scope == a.personal {
		return 1
	}
	return 3
}

func (a *access) canSee(scope string) bool { return a.rank(scope) < 2 }

// roleIn returns the user's role in a project scope ("" for none) and, for the
// personal scope, RoleOwner.
func (a *access) roleIn(scope string) string {
	if scope == a.personal {
		return RoleOwner
	}
	if pid, ok := strings.CutPrefix(scope, "project:"); ok {
		return a.roles[pid]
	}
	return ""
}

// CanWrite is the role table of design D3: viewers write nothing, editors write
// tasks, admins also write project fields except deleted_at, owners everything.
// Labels and saved views are personal and never reach a project scope.
func CanWrite(role, entity, field string) bool {
	switch role {
	case RoleOwner:
		return true
	case RoleAdmin:
		return entity == "task" || (entity == "project" && field != "deleted_at")
	case RoleEditor:
		return entity == "task"
	}
	return false
}

// resolver decides the scope of each incoming op (design D2) inside the batch
// transaction and caches what it learns.
type resolver struct {
	ctx    context.Context
	tx     querier
	acc    *access
	shared map[string]bool
	// taskScope caches the scope of each task seen in this batch; "" marks a task
	// that lives in a project scope the author cannot see.
	taskScope map[string]string
	// batchProject is the winning project_id op per task id in the batch, used to
	// place tasks that do not exist yet.
	batchProject map[string]Op
}

func newResolver(ctx context.Context, tx querier, acc *access, ops []Op) *resolver {
	r := &resolver{ctx: ctx, tx: tx, acc: acc, shared: map[string]bool{}, taskScope: map[string]string{}, batchProject: map[string]Op{}}
	for _, op := range ops {
		if op.Entity != "task" || op.Field != "project_id" {
			continue
		}
		if prev, ok := r.batchProject[op.EntityID]; !ok || Wins(op.TS, op.Device, prev.TS, prev.Device) {
			r.batchProject[op.EntityID] = op
		}
	}
	return r
}

func (r *resolver) projectShared(pid string) (bool, error) {
	if v, ok := r.shared[pid]; ok {
		return v, nil
	}
	var one int
	err := r.tx.QueryRowContext(r.ctx, `SELECT 1 FROM project_scopes WHERE project_id = ?`, pid).Scan(&one)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return false, err
	}
	r.shared[pid] = err == nil
	return err == nil, nil
}

// scopeOfProject is where a project's data lives: its own scope once shared,
// otherwise the author's personal scope (null = Inbox = personal).
func (r *resolver) scopeOfProject(raw json.RawMessage) (string, error) {
	pid := idValue(raw)
	if pid == "" {
		return r.acc.personal, nil
	}
	shared, err := r.projectShared(pid)
	if err != nil || !shared {
		return r.acc.personal, err
	}
	return ProjectScope(pid), nil
}

// existingTaskScope finds a stored task among the author's personal scope and
// every project scope. ok is false when the task is unknown; scope is "" when it
// only exists in a project scope the author is not a member of.
func (r *resolver) existingTaskScope(id string) (scope string, ok bool, err error) {
	rows, err := r.tx.QueryContext(r.ctx, `SELECT DISTINCT scope_id FROM scope_fields
		WHERE entity = 'task' AND entity_id = ? AND (scope_id = ? OR scope_id LIKE 'project:%')`, id, r.acc.personal)
	if err != nil {
		return "", false, err
	}
	defer rows.Close()
	best, bestRank := "", 99
	for rows.Next() {
		var sc string
		if err := rows.Scan(&sc); err != nil {
			return "", false, err
		}
		if rk := r.acc.rank(sc); rk < bestRank {
			best, bestRank = sc, rk
		}
	}
	if err := rows.Err(); err != nil {
		return "", false, err
	}
	if bestRank == 99 {
		return "", false, nil
	}
	if !r.acc.canSee(best) {
		return "", true, nil
	}
	return best, true, nil
}

func (r *resolver) scopeOfTask(id string) (string, error) {
	if sc, ok := r.taskScope[id]; ok {
		return sc, nil
	}
	sc, found, err := r.existingTaskScope(id)
	if err != nil {
		return "", err
	}
	if !found {
		// A new task lives where its project_id in this batch puts it.
		if sc, err = r.scopeOfProject(r.batchProject[id].Value); err != nil {
			return "", err
		}
	}
	r.taskScope[id] = sc
	return sc, nil
}

// resolve returns the scope an op belongs to, or a rejection reason.
func (r *resolver) resolve(op Op) (scope, reason string, err error) {
	switch op.Entity {
	case "project":
		shared, err := r.projectShared(op.EntityID)
		if err != nil {
			return "", "", err
		}
		scope = r.acc.personal
		if shared {
			scope = ProjectScope(op.EntityID)
		}
	case "task":
		if scope, err = r.scopeOfTask(op.EntityID); err != nil {
			return "", "", err
		}
		if scope == "" {
			return "", ReasonForbidden, nil
		}
	default:
		// Labels and saved views are personal.
		return r.acc.personal, "", nil
	}
	if !CanWrite(r.acc.roleIn(scope), op.Entity, op.Field) {
		return "", ReasonForbidden, nil
	}
	if op.Entity == "task" && op.Field == "project_id" {
		target, err := r.scopeOfProject(op.Value)
		if err != nil {
			return "", "", err
		}
		if target != scope {
			return "", ReasonScopeChange, nil
		}
	}
	return scope, "", nil
}

// restoreOps returns the current winning op of every refused field the author
// can see (design D3), so the device can drop its local change and show the
// server's value from the same response.
func (r *resolver) restoreOps(refused []Op) ([]Op, error) {
	var out []Op
	seen := map[string]bool{}
	for _, op := range refused {
		key := op.Entity + "\x00" + op.EntityID + "\x00" + op.Field
		if seen[key] {
			continue
		}
		seen[key] = true
		var scope string
		switch op.Entity {
		case "task":
			sc, found, err := r.existingTaskScope(op.EntityID)
			if err != nil {
				return nil, err
			}
			if !found || sc == "" {
				continue
			}
			scope = sc
		case "project":
			shared, err := r.projectShared(op.EntityID)
			if err != nil {
				return nil, err
			}
			scope = r.acc.personal
			if shared {
				scope = ProjectScope(op.EntityID)
			}
			if !r.acc.canSee(scope) {
				continue
			}
		default:
			continue
		}
		var win Op
		var value string
		err := r.tx.QueryRowContext(r.ctx, `SELECT o.seq, o.op_id, o.value, o.ts, o.device FROM ops o JOIN op_scopes s ON s.seq = o.seq
			JOIN scope_fields f ON f.scope_id = s.scope_id AND f.entity = o.entity AND f.entity_id = o.entity_id AND f.field = o.field AND f.ts = o.ts AND f.device = o.device
			WHERE o.entity_id = ? AND o.entity = ? AND o.field = ? AND s.scope_id = ? ORDER BY o.seq DESC LIMIT 1`,
			op.EntityID, op.Entity, op.Field, scope).Scan(&win.Seq, &win.ID, &value, &win.TS, &win.Device)
		if errors.Is(err, sql.ErrNoRows) {
			continue
		}
		if err != nil {
			return nil, err
		}
		win.Entity, win.EntityID, win.Field, win.Value = op.Entity, op.EntityID, op.Field, json.RawMessage(value)
		out = append(out, win)
	}
	return out, nil
}

// scopeUsers lists who can see a scope: the user of a personal scope, or every
// member of a shared project.
func scopeUsers(ctx context.Context, q querier, scope string) ([]string, error) {
	if uid, ok := strings.CutPrefix(scope, "user:"); ok {
		return []string{uid}, nil
	}
	pid, _ := strings.CutPrefix(scope, "project:")
	rows, err := q.QueryContext(ctx, `SELECT user_id FROM project_members WHERE project_id = ? ORDER BY user_id`, pid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var u string
		if err := rows.Scan(&u); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// ScopeUsers lists the users who can see a scope (webhooks fan out per member).
func (s *Service) ScopeUsers(ctx context.Context, scope string) ([]string, error) {
	return scopeUsers(ctx, s.db, scope)
}

func idValue(raw json.RawMessage) string {
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	var v string
	_ = json.Unmarshal(raw, &v)
	return v
}
