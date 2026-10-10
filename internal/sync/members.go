package sync

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"

	"github.com/pixari/opentodo/internal/ids"
)

// ServerDevice is the device id of ops the server writes itself: REST writes and
// the unassignments that follow a member's departure.
const ServerDevice = "server"

// Membership management (OpenSpec change `project-sharing`, design D5).
// Membership is authorization data that lives outside the op log: it changes only
// through these methods, called from authenticated REST routes, so two offline
// devices can never race on it.

// Membership errors, mapped to the API error envelope by the HTTP layer.
var (
	// ErrNotFound: the project does not exist for the caller (non-members get the
	// same answer so the project's existence is not revealed), or the named member
	// is not part of it.
	ErrNotFound = errors.New("not found")
	// ErrForbidden: the caller's role does not allow the change.
	ErrForbidden = errors.New("forbidden")
	// ErrOwnerMustTransfer: the owner tried to leave.
	ErrOwnerMustTransfer = errors.New("the owner must transfer ownership before leaving")
	// ErrInvalidMember: bad role, the caller themselves, or a transfer target that
	// is not a member.
	ErrInvalidMember = errors.New("invalid member")
	// ErrAlreadyMember: the account is already a member of the project.
	ErrAlreadyMember = errors.New("already a member")
)

// Member is one person on a shared project.
type Member struct {
	UserID string `json:"userId"`
	Name   string `json:"name"`
	Email  string `json:"email"`
	Role   string `json:"role"`
}

// Membership is the caller's view of one shared project: their role, the owner
// and the member list. It is sent in every sync response.
type Membership struct {
	ProjectID string   `json:"projectId"`
	Role      string   `json:"role"`
	OwnerID   string   `json:"ownerId"`
	Members   []Member `json:"members"`
}

// MemberChange reports a successful membership change: the target's role before
// and after ("" for none) and every user whose devices should be told.
type MemberChange struct {
	From     string
	To       string
	Audience []string
	// Unassigned lists the tasks whose assignee was cleared by server-written ops
	// because the target left the project (task-assignment design D3).
	Unassigned []string
	// changes are the winning field changes of those ops, handed to the observer
	// after commit like any Apply batch.
	changes []Change
}

// ValidMemberRole reports whether role can be granted through add or change-role
// (ownership moves only by transfer).
func ValidMemberRole(role string) bool {
	return role == RoleViewer || role == RoleEditor || role == RoleAdmin
}

// Memberships lists every shared project the user belongs to, ordered by project id.
func (s *Service) Memberships(ctx context.Context, userID string) ([]Membership, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT m.project_id, m.role, p.owner_id FROM project_members m
		JOIN project_scopes p ON p.project_id = m.project_id WHERE m.user_id = ? ORDER BY m.project_id`, userID)
	if err != nil {
		return nil, err
	}
	out := []Membership{}
	for rows.Next() {
		var m Membership
		if err := rows.Scan(&m.ProjectID, &m.Role, &m.OwnerID); err != nil {
			rows.Close()
			return nil, err
		}
		out = append(out, m)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := range out {
		if out[i].Members, err = members(ctx, s.db, out[i].ProjectID); err != nil {
			return nil, err
		}
	}
	return out, nil
}

var roleOrder = map[string]int{RoleOwner: 0, RoleAdmin: 1, RoleEditor: 2, RoleViewer: 3}

func members(ctx context.Context, q querier, projectID string) ([]Member, error) {
	rows, err := q.QueryContext(ctx, `SELECT m.user_id, COALESCE(u.name,''), COALESCE(u.email,''), m.role FROM project_members m
		LEFT JOIN users u ON u.id = m.user_id WHERE m.project_id = ?`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Member{}
	for rows.Next() {
		var m Member
		if err := rows.Scan(&m.UserID, &m.Name, &m.Email, &m.Role); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if roleOrder[out[i].Role] != roleOrder[out[j].Role] {
			return roleOrder[out[i].Role] < roleOrder[out[j].Role]
		}
		return out[i].Email < out[j].Email
	})
	return out, rows.Err()
}

// projectRole is the actor's role on a project: from project_members once the
// project is shared, otherwise RoleOwner when the project lives (not deleted) in
// the actor's personal scope. shared reports whether a scope exists.
func projectRole(ctx context.Context, q querier, actorID, projectID string) (role string, shared bool, err error) {
	var owner string
	err = q.QueryRowContext(ctx, `SELECT owner_id FROM project_scopes WHERE project_id = ?`, projectID).Scan(&owner)
	switch {
	case err == nil:
		err = q.QueryRowContext(ctx, `SELECT role FROM project_members WHERE project_id = ? AND user_id = ?`, projectID, actorID).Scan(&role)
		if errors.Is(err, sql.ErrNoRows) {
			return "", true, nil
		}
		return role, true, err
	case !errors.Is(err, sql.ErrNoRows):
		return "", false, err
	}
	var deleted sql.NullString
	err = q.QueryRowContext(ctx, `SELECT (SELECT value FROM scope_fields WHERE scope_id = ? AND entity = 'project' AND entity_id = ? AND field = 'deleted_at')
		FROM scope_fields WHERE scope_id = ? AND entity = 'project' AND entity_id = ? LIMIT 1`,
		PersonalScope(actorID), projectID, PersonalScope(actorID), projectID).Scan(&deleted)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	if deleted.Valid && deleted.String != "null" {
		return "", false, nil
	}
	return RoleOwner, false, nil
}

// ProjectMembers returns the caller's view of a project's membership. A project
// the caller owns but has not shared lists only the owner. Non-members get ErrNotFound.
func (s *Service) ProjectMembers(ctx context.Context, actorID, projectID string) (Membership, error) {
	role, shared, err := projectRole(ctx, s.db, actorID, projectID)
	if err != nil {
		return Membership{}, err
	}
	if role == "" {
		return Membership{}, ErrNotFound
	}
	m := Membership{ProjectID: projectID, Role: role}
	if !shared {
		var name, email string
		_ = s.db.QueryRowContext(ctx, `SELECT name, email FROM users WHERE id = ?`, actorID).Scan(&name, &email)
		m.OwnerID = actorID
		m.Members = []Member{{UserID: actorID, Name: name, Email: email, Role: RoleOwner}}
		return m, nil
	}
	if err := s.db.QueryRowContext(ctx, `SELECT owner_id FROM project_scopes WHERE project_id = ?`, projectID).Scan(&m.OwnerID); err != nil {
		return Membership{}, err
	}
	m.Members, err = members(ctx, s.db, projectID)
	return m, err
}

// membershipTx runs fn in a transaction with the actor's role on the project and
// returns the audience (members before and after the change).
func (s *Service) membershipTx(ctx context.Context, actorID, projectID string, fn func(tx *sql.Tx, role string, shared bool) (MemberChange, error)) (MemberChange, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return MemberChange{}, err
	}
	defer tx.Rollback()
	role, shared, err := projectRole(ctx, tx, actorID, projectID)
	if err != nil {
		return MemberChange{}, err
	}
	if role == "" {
		return MemberChange{}, ErrNotFound
	}
	before, err := scopeUsers(ctx, tx, ProjectScope(projectID))
	if err != nil {
		return MemberChange{}, err
	}
	ch, err := fn(tx, role, shared)
	if err != nil {
		return MemberChange{}, err
	}
	after, err := scopeUsers(ctx, tx, ProjectScope(projectID))
	if err != nil {
		return MemberChange{}, err
	}
	if err := tx.Commit(); err != nil {
		return MemberChange{}, err
	}
	if s.observer != nil && len(ch.changes) > 0 {
		s.observer(ctx, ch.changes)
	}
	seen := map[string]bool{}
	for _, u := range append(append([]string{actorID}, before...), after...) {
		if !seen[u] {
			seen[u] = true
			ch.Audience = append(ch.Audience, u)
		}
	}
	return ch, nil
}

func memberRole(ctx context.Context, tx *sql.Tx, projectID, userID string) (string, error) {
	var role string
	err := tx.QueryRowContext(ctx, `SELECT role FROM project_members WHERE project_id = ? AND user_id = ?`, projectID, userID).Scan(&role)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return role, err
}

// AddMember shares a project with an existing account. The owner may grant any
// member role; an admin may add viewers and editors. Sharing a project for the
// first time creates its scope and relabels its history (see share).
func (s *Service) AddMember(ctx context.Context, actorID, projectID, targetID, role string) (MemberChange, error) {
	if !ValidMemberRole(role) {
		return MemberChange{}, fmt.Errorf("%w: role must be viewer, editor or admin", ErrInvalidMember)
	}
	return s.membershipTx(ctx, actorID, projectID, func(tx *sql.Tx, actorRole string, shared bool) (MemberChange, error) {
		switch {
		case actorRole == RoleOwner:
		case actorRole == RoleAdmin && role != RoleAdmin:
		default:
			return MemberChange{}, ErrForbidden
		}
		if targetID == actorID {
			return MemberChange{}, fmt.Errorf("%w: you are already on this project", ErrInvalidMember)
		}
		if !shared {
			if err := s.share(ctx, tx, actorID, projectID); err != nil {
				return MemberChange{}, err
			}
		}
		existing, err := memberRole(ctx, tx, projectID, targetID)
		if err != nil {
			return MemberChange{}, err
		}
		if existing != "" {
			return MemberChange{}, ErrAlreadyMember
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO project_members(project_id,user_id,role,added_by,created_at,backfill) VALUES(?,?,?,?,?,1)`,
			projectID, targetID, role, actorID, s.now().UnixMilli()); err != nil {
			return MemberChange{}, err
		}
		// A re-added member replays the history again on every device.
		if _, err := tx.ExecContext(ctx, `DELETE FROM member_backfills WHERE project_id = ? AND user_id = ?`, projectID, targetID); err != nil {
			return MemberChange{}, err
		}
		return MemberChange{From: "", To: role}, nil
	})
}

// share creates the project's scope and moves the project, its tasks and sections from the
// owner's personal scope into it (design D2). Only scope labels change: seq, op_id
// and op content stay as they are, so the owner's devices keep their cursor.
func (s *Service) share(ctx context.Context, tx *sql.Tx, ownerID, projectID string) error {
	personal, scope := PersonalScope(ownerID), ProjectScope(projectID)
	// Tasks and sections (board-view) of the project move with it.
	rows, err := tx.QueryContext(ctx, `SELECT entity, entity_id, value FROM scope_fields WHERE scope_id = ? AND entity IN ('task','section') AND field = 'project_id'`, personal)
	if err != nil {
		return err
	}
	type child struct{ entity, id string }
	var children []child
	for rows.Next() {
		var c child
		var value string
		if err := rows.Scan(&c.entity, &c.id, &value); err != nil {
			rows.Close()
			return err
		}
		if idValue([]byte(value)) == projectID {
			children = append(children, c)
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	relabel := func(entity, id string) error {
		if _, err := tx.ExecContext(ctx, `UPDATE op_scopes SET scope_id = ? WHERE scope_id = ? AND seq IN (SELECT seq FROM ops WHERE entity_id = ? AND entity = ?)`,
			scope, personal, id, entity); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, `UPDATE scope_fields SET scope_id = ? WHERE scope_id = ? AND entity = ? AND entity_id = ?`, scope, personal, entity, id)
		return err
	}
	if err := relabel("project", projectID); err != nil {
		return err
	}
	for _, c := range children {
		if err := relabel(c.entity, c.id); err != nil {
			return err
		}
	}
	now := s.now().UnixMilli()
	if _, err := tx.ExecContext(ctx, `INSERT INTO project_scopes(project_id, owner_id, created_at) VALUES(?,?,?)`, projectID, ownerID, now); err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO project_members(project_id,user_id,role,added_by,created_at,backfill) VALUES(?,?,?,?,?,0)`,
		projectID, ownerID, RoleOwner, ownerID, now)
	return err
}

// SetMemberRole changes a member's role. The owner may change anyone but
// themselves; an admin may move viewers and editors between those two roles.
func (s *Service) SetMemberRole(ctx context.Context, actorID, projectID, targetID, role string) (MemberChange, error) {
	if !ValidMemberRole(role) {
		return MemberChange{}, fmt.Errorf("%w: role must be viewer, editor or admin (ownership moves by transfer)", ErrInvalidMember)
	}
	return s.membershipTx(ctx, actorID, projectID, func(tx *sql.Tx, actorRole string, _ bool) (MemberChange, error) {
		if actorRole != RoleOwner && actorRole != RoleAdmin {
			return MemberChange{}, ErrForbidden
		}
		current, err := memberRole(ctx, tx, projectID, targetID)
		if err != nil {
			return MemberChange{}, err
		}
		if current == "" {
			return MemberChange{}, fmt.Errorf("%w: member", ErrNotFound)
		}
		if current == RoleOwner {
			return MemberChange{}, ErrForbidden
		}
		if actorRole == RoleAdmin && (current == RoleAdmin || role == RoleAdmin) {
			return MemberChange{}, ErrForbidden
		}
		if current == role {
			return MemberChange{From: current, To: role}, nil
		}
		if _, err := tx.ExecContext(ctx, `UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?`, role, projectID, targetID); err != nil {
			return MemberChange{}, err
		}
		return MemberChange{From: current, To: role}, nil
	})
}

// RemoveMember removes targetID from the project, or makes the actor leave when
// targetID is the actor. The owner cannot leave; admins remove viewers and
// editors; the owner removes anyone else. Project data is not touched, so the
// remaining members converge; the departed member's devices stop receiving the
// project and purge it when their next sync no longer lists it.
func (s *Service) RemoveMember(ctx context.Context, actorID, projectID, targetID string) (MemberChange, error) {
	return s.membershipTx(ctx, actorID, projectID, func(tx *sql.Tx, actorRole string, shared bool) (MemberChange, error) {
		if targetID == actorID {
			if actorRole == RoleOwner {
				return MemberChange{}, ErrOwnerMustTransfer
			}
		} else {
			if actorRole != RoleOwner && actorRole != RoleAdmin {
				return MemberChange{}, ErrForbidden
			}
		}
		if !shared {
			return MemberChange{}, fmt.Errorf("%w: member", ErrNotFound)
		}
		current, err := memberRole(ctx, tx, projectID, targetID)
		if err != nil {
			return MemberChange{}, err
		}
		if current == "" {
			return MemberChange{}, fmt.Errorf("%w: member", ErrNotFound)
		}
		if targetID != actorID && actorRole == RoleAdmin && (current == RoleAdmin || current == RoleOwner) {
			return MemberChange{}, ErrForbidden
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM project_members WHERE project_id = ? AND user_id = ?`, projectID, targetID); err != nil {
			return MemberChange{}, err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM member_backfills WHERE project_id = ? AND user_id = ?`, projectID, targetID); err != nil {
			return MemberChange{}, err
		}
		unassigned, changes, err := s.unassignDeparted(ctx, tx, actorID, projectID, targetID)
		if err != nil {
			return MemberChange{}, err
		}
		return MemberChange{From: current, To: "", Unassigned: unassigned, changes: changes}, nil
	})
}

// unassignDeparted writes, inside the membership transaction, an
// `assignee_id = null` op with device "server" for every task of the project
// currently assigned to the departed user (task-assignment design D3). The ops
// are ordinary log entries authored by the actor, so every member's devices
// receive them on their next pull and converge without client logic. Each op is
// stamped with server time, or just after the value it replaces when that value
// carries a (clamped) future timestamp, so the unassignment always wins on the
// server; assignments to the departed user that arrive later are refused by
// Apply with reason not_a_member.
func (s *Service) unassignDeparted(ctx context.Context, tx *sql.Tx, actorID, projectID, departed string) ([]string, []Change, error) {
	scope := ProjectScope(projectID)
	want, err := json.Marshal(departed)
	if err != nil {
		return nil, nil, err
	}
	rows, err := tx.QueryContext(ctx, `SELECT entity_id, ts FROM scope_fields
		WHERE scope_id = ? AND entity = 'task' AND field = 'assignee_id' AND value = ? ORDER BY entity_id`, scope, string(want))
	if err != nil {
		return nil, nil, err
	}
	type hit struct {
		id string
		ts int64
	}
	var hits []hit
	for rows.Next() {
		var h hit
		if err := rows.Scan(&h.id, &h.ts); err != nil {
			rows.Close()
			return nil, nil, err
		}
		hits = append(hits, h)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}
	if len(hits) == 0 {
		return nil, nil, nil
	}
	nowMs := s.now().UnixMilli()
	tracker := newChangeTracker(actorID)
	out := make([]string, 0, len(hits))
	for _, h := range hits {
		op := Op{ID: ids.New(), Entity: "task", EntityID: h.id, Field: "assignee_id", Value: json.RawMessage("null"),
			TS: max(nowMs, h.ts+1), Device: ServerDevice}
		if _, err := writeOp(ctx, tx, actorID, op, scope, nowMs, tracker); err != nil {
			return nil, nil, err
		}
		out = append(out, h.id)
	}
	return out, tracker.changes(), nil
}

// TransferOwnership makes an existing member the owner; the previous owner
// becomes an admin. Only the owner may transfer.
func (s *Service) TransferOwnership(ctx context.Context, actorID, projectID, targetID string) (MemberChange, error) {
	return s.membershipTx(ctx, actorID, projectID, func(tx *sql.Tx, actorRole string, shared bool) (MemberChange, error) {
		if actorRole != RoleOwner {
			return MemberChange{}, ErrForbidden
		}
		if targetID == actorID {
			return MemberChange{}, fmt.Errorf("%w: you already own this project", ErrInvalidMember)
		}
		current := ""
		if shared {
			var err error
			if current, err = memberRole(ctx, tx, projectID, targetID); err != nil {
				return MemberChange{}, err
			}
		}
		if current == "" {
			return MemberChange{}, fmt.Errorf("%w: the new owner must be a member of the project", ErrInvalidMember)
		}
		if _, err := tx.ExecContext(ctx, `UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?`, RoleAdmin, projectID, actorID); err != nil {
			return MemberChange{}, err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?`, RoleOwner, projectID, targetID); err != nil {
			return MemberChange{}, err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE project_scopes SET owner_id = ? WHERE project_id = ?`, targetID, projectID); err != nil {
			return MemberChange{}, err
		}
		return MemberChange{From: current, To: RoleOwner}, nil
	})
}

// ProjectAccess is the caller's role on one shared project and its owner.
type ProjectAccess struct {
	Role    string
	OwnerID string
}

// SharedProjects maps every shared project the user belongs to onto their role
// and the owner (REST collections and the export annotate projects with it).
func (s *Service) SharedProjects(ctx context.Context, userID string) (map[string]ProjectAccess, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT m.project_id, m.role, p.owner_id FROM project_members m
		JOIN project_scopes p ON p.project_id = m.project_id WHERE m.user_id = ?`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]ProjectAccess{}
	for rows.Next() {
		var pid string
		var a ProjectAccess
		if err := rows.Scan(&pid, &a.Role, &a.OwnerID); err != nil {
			return nil, err
		}
		out[pid] = a
	}
	return out, rows.Err()
}
