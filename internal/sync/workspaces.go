package sync

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/pixari/opentodo/internal/iconset"
	"github.com/pixari/opentodo/internal/ids"
	"github.com/pixari/opentodo/internal/store"
)

// The workspace directory (OpenSpec change workspaces, design D1, D3, D4, D8).
// Workspaces, their members and groups are server-side data like project
// membership: they change only through these methods, called from REST routes,
// never through the op log, and reach devices in every sync response.

// Workspace roles.
const (
	WorkspaceOwner  = "owner"
	WorkspaceAdmin  = "admin"
	WorkspaceMember = "member"
)

// Directory errors, mapped to the API envelope by the HTTP layer.
var (
	// ErrNotInWorkspace: the account is not a member of the workspace whose
	// directory the change needs (409 not_in_workspace).
	ErrNotInWorkspace = errors.New("not a member of the workspace")
	// ErrDefaultWorkspace: the default workspace cannot be deleted, left,
	// transferred or given members (409 default_workspace).
	ErrDefaultWorkspace = errors.New("the default workspace cannot be changed this way")
	// ErrWorkspaceNotEmpty: the workspace still has projects or members.
	ErrWorkspaceNotEmpty = errors.New("the workspace is not empty")
	// ErrGroupExists: a group with that name exists in the workspace.
	ErrGroupExists = errors.New("a group with this name exists")
	// ErrLimitReached: a workspace limit would be exceeded.
	ErrLimitReached = errors.New("limit reached")
	// ErrInvalidInput: a name, icon, colour or role is not acceptable.
	ErrInvalidInput = errors.New("invalid input")
)

// NotEmptyError is ErrWorkspaceNotEmpty with the counts that block deletion.
type NotEmptyError struct{ Projects, Members int }

func (e *NotEmptyError) Error() string {
	return fmt.Sprintf("the workspace still has %d projects and %d other members", e.Projects, e.Members)
}

// Is makes errors.Is(err, ErrWorkspaceNotEmpty) hold.
func (e *NotEmptyError) Is(target error) bool { return target == ErrWorkspaceNotEmpty }

// LimitError is ErrLimitReached naming the limit and its value.
type LimitError struct {
	Limit string // workspaces | members | groups | group_members
	Max   int
}

func (e *LimitError) Error() string { return fmt.Sprintf("limit reached: at most %d %s", e.Max, e.Limit) }

// Is makes errors.Is(err, ErrLimitReached) hold.
func (e *LimitError) Is(target error) bool { return target == ErrLimitReached }

// WorkspaceLimits bounds the directory (workspaces "Limits"); host mode lowers
// them per tenant. A zero field means the default.
type WorkspaceLimits struct {
	Workspaces   int `json:"workspaces"`
	Members      int `json:"members"`
	Groups       int `json:"groups"`
	GroupMembers int `json:"groupMembers"`
}

// DefaultWorkspaceLimits are the limits without an operator override.
var DefaultWorkspaceLimits = WorkspaceLimits{Workspaces: 20, Members: 200, Groups: 50, GroupMembers: 100}

// SetWorkspaceLimits installs per-instance limits (host mode); zero fields keep the default.
func (s *Service) SetWorkspaceLimits(l WorkspaceLimits) { s.wsLimits = l }

// WorkspaceLimitsInEffect returns the limits with defaults filled in.
func (s *Service) WorkspaceLimitsInEffect() WorkspaceLimits {
	l, d := s.wsLimits, DefaultWorkspaceLimits
	pick := func(v, def int) int {
		if v > 0 && v < def {
			return v
		}
		return def
	}
	return WorkspaceLimits{pick(l.Workspaces, d.Workspaces), pick(l.Members, d.Members), pick(l.Groups, d.Groups), pick(l.GroupMembers, d.GroupMembers)}
}

// Workspace is one of the caller's workspaces with its directory, as the sync
// response and the REST routes show it.
type Workspace struct {
	ID      string            `json:"id"`
	Name    string            `json:"name"`
	Icon    string            `json:"icon"`
	Color   string            `json:"color"`
	Default bool              `json:"default"`
	Role    string            `json:"role"`
	OwnerID string            `json:"ownerId"`
	Members []WorkspacePerson `json:"members"`
	Groups  []Group           `json:"groups"`
}

// WorkspacePerson is a member of a workspace, by name only (design D8).
type WorkspacePerson struct {
	UserID string `json:"userId"`
	Name   string `json:"name"`
	Role   string `json:"role"`
}

// Group is a named set of a workspace's members.
type Group struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Members []string `json:"members"`
}

// DirectoryChange reports a successful directory change: every account whose
// devices should sync, and the tasks unassigned because someone lost a project.
type DirectoryChange struct {
	Audience   []string
	Unassigned []string
	changes    []Change
	// Projects lists the projects whose effective membership changed.
	Projects []string
}

var wsRoleOrder = map[string]int{WorkspaceOwner: 0, WorkspaceAdmin: 1, WorkspaceMember: 2}

// Workspaces lists the caller's workspaces with their members and groups in
// three queries however many there are (workspaces "Sync delivers workspaces
// in a fixed number of queries"): workspaces by id, members owner first then by
// role and name, groups by name.
func (s *Service) Workspaces(ctx context.Context, userID string) ([]Workspace, error) {
	q := s.reader()
	rows, err := q.QueryContext(ctx, `SELECT w.id, w.kind, w.owner_id, w.name, w.icon, w.color, m.role FROM workspace_members m
		JOIN workspaces w ON w.id = m.workspace_id AND w.deleted_at IS NULL WHERE m.user_id = ? ORDER BY w.id`, userID)
	if err != nil {
		return nil, err
	}
	out := []Workspace{}
	index := map[string]int{}
	for rows.Next() {
		var w Workspace
		var kind string
		if err := rows.Scan(&w.ID, &kind, &w.OwnerID, &w.Name, &w.Icon, &w.Color, &w.Role); err != nil {
			rows.Close()
			return nil, err
		}
		w.Default = kind == "default"
		w.Members, w.Groups = []WorkspacePerson{}, []Group{}
		index[w.ID] = len(out)
		out = append(out, w)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if def := store.DefaultWorkspaceID(userID); !hasIndex(index, def) {
		// An account created outside the server's account paths (tests, or
		// before the next start's backfill) still reads its default workspace.
		w := Workspace{ID: def, Name: store.DefaultWorkspaceName, Default: true, Role: WorkspaceOwner, OwnerID: userID,
			Members: []WorkspacePerson{}, Groups: []Group{}}
		out = append(out, w)
		sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
		for i := range out {
			index[out[i].ID] = i
		}
		var name string
		_ = q.QueryRowContext(ctx, `SELECT name FROM users WHERE id = ?`, userID).Scan(&name)
		out[index[def]].Members = []WorkspacePerson{{UserID: userID, Name: name, Role: WorkspaceOwner}}
	}
	if err := s.workspaceMembers(ctx, q, userID, out, index); err != nil {
		return nil, err
	}
	if err := s.workspaceGroups(ctx, q, userID, out, index); err != nil {
		return nil, err
	}
	return out, nil
}

func hasIndex(m map[string]int, k string) bool { _, ok := m[k]; return ok }

func (s *Service) workspaceMembers(ctx context.Context, q querier, userID string, out []Workspace, index map[string]int) error {
	rows, err := q.QueryContext(ctx, `SELECT m.workspace_id, m.user_id, COALESCE(u.name,''), m.role FROM workspace_members m
		JOIN users u ON u.id = m.user_id
		WHERE m.workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = ?) ORDER BY m.workspace_id`, userID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var ws string
		var p WorkspacePerson
		if err := rows.Scan(&ws, &p.UserID, &p.Name, &p.Role); err != nil {
			return err
		}
		if i, ok := index[ws]; ok {
			out[i].Members = append(out[i].Members, p)
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for i := range out {
		sortPeople(out[i].Members)
	}
	return nil
}

func sortPeople(list []WorkspacePerson) {
	sort.SliceStable(list, func(a, b int) bool {
		if wsRoleOrder[list[a].Role] != wsRoleOrder[list[b].Role] {
			return wsRoleOrder[list[a].Role] < wsRoleOrder[list[b].Role]
		}
		if !strings.EqualFold(list[a].Name, list[b].Name) {
			return strings.ToLower(list[a].Name) < strings.ToLower(list[b].Name)
		}
		return list[a].UserID < list[b].UserID
	})
}

func (s *Service) workspaceGroups(ctx context.Context, q querier, userID string, out []Workspace, index map[string]int) error {
	rows, err := q.QueryContext(ctx, `SELECT g.workspace_id, g.id, g.name, COALESCE(gm.user_id,'') FROM groups g
		LEFT JOIN group_members gm ON gm.group_id = g.id
		WHERE g.deleted_at IS NULL AND g.workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = ?)
		ORDER BY g.workspace_id, g.name COLLATE NOCASE, g.id, gm.user_id`, userID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var ws, id, name, member string
		if err := rows.Scan(&ws, &id, &name, &member); err != nil {
			return err
		}
		i, ok := index[ws]
		if !ok {
			continue
		}
		groups := out[i].Groups
		if n := len(groups); n == 0 || groups[n-1].ID != id {
			groups = append(groups, Group{ID: id, Name: name, Members: []string{}})
		}
		if member != "" {
			last := &groups[len(groups)-1]
			last.Members = append(last.Members, member)
		}
		out[i].Groups = groups
	}
	return rows.Err()
}

// WorkspaceByID returns one of the caller's workspaces; ErrNotFound for any
// workspace the caller is not a member of.
func (s *Service) WorkspaceByID(ctx context.Context, userID, id string) (Workspace, error) {
	all, err := s.Workspaces(ctx, userID)
	if err != nil {
		return Workspace{}, err
	}
	for _, w := range all {
		if w.ID == id {
			return w, nil
		}
	}
	return Workspace{}, ErrNotFound
}

// WorkspaceInput is a create or update body; nil fields stay as they are.
type WorkspaceInput struct {
	Name  *string `json:"name"`
	Icon  *string `json:"icon"`
	Color *string `json:"color"`
}

var colorRe = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

// ValidName checks a workspace or group name: 1 to 60 characters once trimmed.
func ValidName(name string) bool {
	n := utf8.RuneCountInString(strings.TrimSpace(name))
	return n >= 1 && n <= 60
}

// check validates the present fields of the input.
func (in WorkspaceInput) check() error {
	if in.Name != nil && !ValidName(*in.Name) {
		return fmt.Errorf("%w: name must be 1 to 60 characters", ErrInvalidInput)
	}
	if in.Icon != nil && *in.Icon != "" && !iconset.Valid(*in.Icon) {
		return fmt.Errorf("%w: icon must be a name from the icon catalogue or empty", ErrInvalidInput)
	}
	if in.Color != nil && *in.Color != "" && !colorRe.MatchString(*in.Color) {
		return fmt.Errorf("%w: color must be #rrggbb or empty", ErrInvalidInput)
	}
	return nil
}

// CreateWorkspace creates a workspace owned by the actor.
func (s *Service) CreateWorkspace(ctx context.Context, actorID string, in WorkspaceInput) (Workspace, error) {
	if in.Name == nil {
		return Workspace{}, fmt.Errorf("%w: name is required", ErrInvalidInput)
	}
	if err := in.check(); err != nil {
		return Workspace{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Workspace{}, err
	}
	defer tx.Rollback()
	now := s.now().UnixMilli()
	if err := store.EnsureDefaultWorkspace(ctx, tx, actorID, now); err != nil {
		return Workspace{}, err
	}
	var owned int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM workspaces WHERE owner_id = ? AND deleted_at IS NULL`, actorID).Scan(&owned); err != nil {
		return Workspace{}, err
	}
	if max := s.WorkspaceLimitsInEffect().Workspaces; owned >= max {
		return Workspace{}, &LimitError{"workspaces", max}
	}
	id := ids.New()
	if _, err := tx.ExecContext(ctx, `INSERT INTO workspaces(id,kind,owner_id,name,icon,color,created_at) VALUES(?,'created',?,?,?,?,?)`,
		id, actorID, strings.TrimSpace(*in.Name), deref(in.Icon), deref(in.Color), now); err != nil {
		return Workspace{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_members(workspace_id,user_id,role,added_by,created_at) VALUES(?,?,'owner',?,?)`, id, actorID, actorID, now); err != nil {
		return Workspace{}, err
	}
	if err := tx.Commit(); err != nil {
		return Workspace{}, err
	}
	return s.WorkspaceByID(ctx, actorID, id)
}

func deref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// wsRow is a workspace as a directory change sees it.
type wsRow struct {
	id, kind, ownerID string
}

// directoryTx runs fn in a transaction with the workspace and the actor's
// role on it (ErrNotFound for non-members), then reports as audience every
// member before and after plus what fn adds, and hands committed op changes to
// the observer.
func (s *Service) directoryTx(ctx context.Context, actorID, wsID string, fn func(tx *sql.Tx, ws wsRow, role string) (DirectoryChange, error)) (DirectoryChange, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return DirectoryChange{}, err
	}
	defer tx.Rollback()
	if err := store.EnsureDefaultWorkspace(ctx, tx, actorID, s.now().UnixMilli()); err != nil {
		return DirectoryChange{}, err
	}
	var ws wsRow
	var role string
	err = tx.QueryRowContext(ctx, `SELECT w.id, w.kind, w.owner_id, m.role FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = ?
		WHERE w.id = ? AND w.deleted_at IS NULL`, actorID, wsID).Scan(&ws.id, &ws.kind, &ws.ownerID, &role)
	if errors.Is(err, sql.ErrNoRows) {
		return DirectoryChange{}, ErrNotFound
	}
	if err != nil {
		return DirectoryChange{}, err
	}
	before, err := workspaceUserIDs(ctx, tx, wsID)
	if err != nil {
		return DirectoryChange{}, err
	}
	ch, err := fn(tx, ws, role)
	if err != nil {
		return DirectoryChange{}, err
	}
	after, err := workspaceUserIDs(ctx, tx, wsID)
	if err != nil {
		return DirectoryChange{}, err
	}
	if err := tx.Commit(); err != nil {
		return DirectoryChange{}, err
	}
	ch.Audience = unique(append(append(append([]string{actorID}, before...), after...), ch.Audience...))
	if s.observer != nil && len(ch.changes) > 0 {
		s.observer(context.WithoutCancel(ctx), ch.changes)
	}
	return ch, nil
}

func unique(list []string) []string {
	seen := map[string]bool{}
	out := list[:0:0]
	for _, u := range list {
		if u != "" && !seen[u] {
			seen[u] = true
			out = append(out, u)
		}
	}
	return out
}

func workspaceUserIDs(ctx context.Context, q querier, wsID string) ([]string, error) {
	rows, err := q.QueryContext(ctx, `SELECT user_id FROM workspace_members WHERE workspace_id = ? ORDER BY user_id`, wsID)
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

func isWorkspaceMember(ctx context.Context, q querier, wsID, userID string) (bool, error) {
	var n int
	err := q.QueryRowContext(ctx, `SELECT COUNT(*) FROM workspace_members WHERE workspace_id = ? AND user_id = ?`, wsID, userID).Scan(&n)
	return n > 0, err
}

func workspaceRole(ctx context.Context, q querier, wsID, userID string) (string, error) {
	var role string
	err := q.QueryRowContext(ctx, `SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?`, wsID, userID).Scan(&role)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return role, err
}

func canManage(role string) bool { return role == WorkspaceOwner || role == WorkspaceAdmin }

// UpdateWorkspace renames a workspace or changes its icon or colour (owner and admins).
func (s *Service) UpdateWorkspace(ctx context.Context, actorID, wsID string, in WorkspaceInput) (DirectoryChange, error) {
	if err := in.check(); err != nil {
		return DirectoryChange{}, err
	}
	return s.directoryTx(ctx, actorID, wsID, func(tx *sql.Tx, ws wsRow, role string) (DirectoryChange, error) {
		if !canManage(role) {
			return DirectoryChange{}, ErrForbidden
		}
		for col, v := range map[string]*string{"name": in.Name, "icon": in.Icon, "color": in.Color} {
			if v == nil {
				continue
			}
			val := *v
			if col == "name" {
				val = strings.TrimSpace(val)
			}
			if _, err := tx.ExecContext(ctx, `UPDATE workspaces SET `+col+` = ? WHERE id = ?`, val, ws.id); err != nil {
				return DirectoryChange{}, err
			}
		}
		return DirectoryChange{}, nil
	})
}

// workspaceProjectIDs lists the live projects in a workspace (any scope).
func workspaceProjectIDs(ctx context.Context, q querier, wsID string) ([]string, error) {
	want, err := json.Marshal(wsID)
	if err != nil {
		return nil, err
	}
	rows, err := q.QueryContext(ctx, `SELECT DISTINCT f.entity_id FROM scope_fields f WHERE f.entity = 'project' AND f.field = 'workspace_id' AND f.value = ?
		AND NOT EXISTS (SELECT 1 FROM scope_fields d WHERE d.scope_id = f.scope_id AND d.entity = 'project' AND d.entity_id = f.entity_id
			AND d.field = 'deleted_at' AND d.value != 'null')
		ORDER BY f.entity_id`, string(want))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// DeleteWorkspace deletes an empty created workspace (owner only).
func (s *Service) DeleteWorkspace(ctx context.Context, actorID, wsID string) (DirectoryChange, error) {
	return s.directoryTx(ctx, actorID, wsID, func(tx *sql.Tx, ws wsRow, role string) (DirectoryChange, error) {
		if role != WorkspaceOwner {
			return DirectoryChange{}, ErrForbidden
		}
		if ws.kind == "default" {
			return DirectoryChange{}, ErrDefaultWorkspace
		}
		projects, err := workspaceProjectIDs(ctx, tx, ws.id)
		if err != nil {
			return DirectoryChange{}, err
		}
		people, err := workspaceUserIDs(ctx, tx, ws.id)
		if err != nil {
			return DirectoryChange{}, err
		}
		if len(projects) > 0 || len(people) > 1 {
			return DirectoryChange{}, &NotEmptyError{Projects: len(projects), Members: len(people) - 1}
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM project_grants WHERE subject_kind = 'group' AND subject_id IN (SELECT id FROM groups WHERE workspace_id = ?)`, ws.id); err != nil {
			return DirectoryChange{}, err
		}
		_, err = tx.ExecContext(ctx, `DELETE FROM workspaces WHERE id = ?`, ws.id)
		return DirectoryChange{}, err
	})
}

// TransferWorkspace makes a member the owner; the previous owner becomes an
// admin. The ownership of the projects in it does not change.
func (s *Service) TransferWorkspace(ctx context.Context, actorID, wsID, targetID string) (DirectoryChange, error) {
	return s.directoryTx(ctx, actorID, wsID, func(tx *sql.Tx, ws wsRow, role string) (DirectoryChange, error) {
		if role != WorkspaceOwner {
			return DirectoryChange{}, ErrForbidden
		}
		if ws.kind == "default" {
			return DirectoryChange{}, ErrDefaultWorkspace
		}
		if targetID == actorID {
			return DirectoryChange{}, fmt.Errorf("%w: you already own this workspace", ErrInvalidMember)
		}
		if r, err := workspaceRole(ctx, tx, ws.id, targetID); err != nil {
			return DirectoryChange{}, err
		} else if r == "" {
			return DirectoryChange{}, fmt.Errorf("%w: the new owner must be a member of the workspace", ErrInvalidMember)
		}
		return DirectoryChange{}, transferWorkspaceTx(ctx, tx, ws.id, actorID, targetID)
	})
}

func transferWorkspaceTx(ctx context.Context, tx *sql.Tx, wsID, from, to string) error {
	if _, err := tx.ExecContext(ctx, `UPDATE workspace_members SET role = 'admin' WHERE workspace_id = ? AND user_id = ?`, wsID, from); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE workspace_members SET role = 'owner' WHERE workspace_id = ? AND user_id = ?`, wsID, to); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `UPDATE workspaces SET owner_id = ? WHERE id = ?`, to, wsID)
	return err
}
