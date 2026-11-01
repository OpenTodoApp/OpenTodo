package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/audit"
	"github.com/OpenTodoApp/opentodo/internal/auth"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Project sharing routes (OpenSpec change `project-sharing`, design D7). Every
// route requires authentication; a caller who is not a member of the project gets
// the same 404 as for a project that does not exist. Membership is changed only
// here, never through the op log.
func (s *Server) registerSharingRoutes(mux *routes) {
	mux.handle("GET /api/v1/projects/{id}/members", signedIn, s.handleListMembers)
	mux.handle("POST /api/v1/projects/{id}/members", signedIn.DemoDenied(), s.handleAddMember)
	mux.handle("PATCH /api/v1/projects/{id}/members/{userId}", signedIn.DemoDenied(), s.handleSetMemberRole)
	mux.handle("DELETE /api/v1/projects/{id}/members/{userId}", signedIn.DemoDenied(), s.handleRemoveMember)
	mux.handle("POST /api/v1/projects/{id}/transfer", signedIn.DemoDenied(), s.handleTransferProject)
}

// memberError maps the sync package's membership errors onto the API envelope.
func (s *Server) memberError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, opsync.ErrNotFound):
		msg := "project not found"
		for _, k := range []string{"member", "group", "grant"} {
			if strings.HasSuffix(err.Error(), ": "+k) {
				msg = k + " not found"
			}
		}
		writeError(w, http.StatusNotFound, "not_found", msg)
	case errors.Is(err, opsync.ErrForbidden):
		writeError(w, http.StatusForbidden, "forbidden", "your role on this project does not allow this change")
	case errors.Is(err, opsync.ErrOwnerMustTransfer):
		writeError(w, http.StatusConflict, "owner_must_transfer", "the owner cannot leave the project; transfer ownership to another member first")
	case errors.Is(err, opsync.ErrAlreadyMember):
		writeError(w, http.StatusConflict, "already_member", "this account is already a member of the project")
	case errors.Is(err, opsync.ErrProjectIDConflict):
		writeError(w, http.StatusConflict, "project_id_conflict", "this project cannot be shared because another account has a project with the same id; duplicate it and share the copy")
	case errors.Is(err, opsync.ErrNotInWorkspace):
		// A created workspace is a closed directory (OpenSpec change workspaces).
		writeError(w, http.StatusConflict, "not_in_workspace", "this account is not a member of the project's workspace; ask the workspace owner to add them first")
	case errors.Is(err, opsync.ErrInvalidMember):
		writeError(w, http.StatusBadRequest, "invalid_input", strings.TrimPrefix(err.Error(), opsync.ErrInvalidMember.Error()+": "))
	default:
		s.internal(w, err)
	}
}

func (s *Server) handleListMembers(w http.ResponseWriter, r *http.Request) {
	m, err := s.sync.ProjectMembers(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"))
	if err != nil {
		s.memberError(w, err)
		return
	}
	v, err := s.projectMembersView(r.Context(), m)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

// respondMembers answers a successful change with the caller's fresh view of the
// project's membership, wakes every affected device and records the change.
func (s *Server) respondMembers(w http.ResponseWriter, r *http.Request, status int, targetID string, ch opsync.MemberChange) {
	ctx := r.Context()
	actor := userFrom(ctx).ID
	s.sync.NotifyMembership(ch.Audience)
	if ch.From != ch.To {
		s.audit.Record(ctx, audit.RoleChanged(actor, targetID, projectRoleLabel(ch.From), projectRoleLabel(ch.To)))
	}
	if status == http.StatusNoContent {
		w.WriteHeader(status)
		return
	}
	m, err := s.sync.ProjectMembers(ctx, actor, r.PathValue("id"))
	if err != nil {
		s.memberError(w, err)
		return
	}
	v, err := s.projectMembersView(ctx, m)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, status, v)
}

// projectRoleLabel is how a project role appears in the audit log's from/to
// details, distinct from account roles: "project.editor", or "none".
func projectRoleLabel(role string) string {
	if role == "" {
		return "none"
	}
	return "project." + role
}

func (s *Server) handleAddMember(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	actor := userFrom(ctx)
	var in struct {
		Email string `json:"email"`
		// UserID names a member of the project's workspace directory instead of
		// an email (OpenSpec change workspaces); only for a created workspace.
		UserID string `json:"userId"`
		Role   string `json:"role"`
	}
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	// Check the caller's rights before looking the email up, so neither a
	// non-member nor a viewer can probe which accounts exist.
	m, err := s.sync.ProjectMembers(ctx, actor.ID, r.PathValue("id"))
	if err != nil {
		s.memberError(w, err)
		return
	}
	if m.Role != opsync.RoleOwner && m.Role != opsync.RoleAdmin {
		s.memberError(w, opsync.ErrForbidden)
		return
	}
	if !opsync.ValidMemberRole(in.Role) {
		writeError(w, http.StatusBadRequest, "invalid_input", "role must be viewer, editor or admin")
		return
	}
	// End-to-end encryption (OpenSpec `e2ee`, design D8): sharing would move the
	// project's ciphertext into a scope whose members hold no key, so an
	// encrypted account cannot share a project that is not shared yet. A project
	// shared before encryption was enabled was never encrypted (only the
	// personal scope is) and keeps working.
	if len(m.Members) <= 1 && s.refuseIfEncrypted(w, r, "sharing is not available for accounts with end-to-end encryption yet") {
		return
	}
	var target *auth.User
	if in.UserID != "" {
		target, err = s.memberTarget(r, in.UserID)
		if errors.Is(err, auth.ErrNotFound) {
			writeError(w, http.StatusNotFound, "user_not_found", "no account with this id is in the project's workspace")
			return
		}
		if err != nil {
			s.internal(w, err)
			return
		}
	} else if target = s.memberByEmail(w, r, m.Role, in.Email, in.Role); target == nil {
		return
	}
	ch, err := s.sync.AddMember(ctx, actor.ID, r.PathValue("id"), target.ID, in.Role)
	if err != nil {
		s.memberError(w, err)
		return
	}
	s.audit.Record(ctx, audit.ProjectMemberAdded(actor.ID, target.ID, r.PathValue("id"), in.Role))
	s.respondMembers(w, r, http.StatusCreated, target.ID, ch)
}

// memberByEmail resolves an add by email (member-add-consent D1): it returns
// the account to add at once, or answers the request itself (an invitation,
// or an error) and returns nil. In a project of a created workspace only its
// directory can be added, whether or not the address has an account.
func (s *Server) memberByEmail(w http.ResponseWriter, r *http.Request, myRole, email, role string) *auth.User {
	ctx := r.Context()
	actor := userFrom(ctx)
	if !s.allowMemberAdd(w, actor.ID) {
		return nil
	}
	email, ok := inviteAddress(w, email)
	if !ok {
		return nil
	}
	target, err := s.lookupInvitee(ctx, email)
	if err != nil {
		s.internal(w, err)
		return nil
	}
	closed, err := s.sync.InClosedWorkspace(ctx, r.PathValue("id"))
	if err != nil {
		s.internal(w, err)
		return nil
	}
	if closed {
		if target == nil {
			s.memberError(w, opsync.ErrNotInWorkspace)
		}
		return target
	}
	now, err := s.addsAtOnce(ctx, actor.ID, target)
	if err != nil {
		s.internal(w, err)
		return nil
	}
	if now {
		return target
	}
	if !opsync.CanGrant(myRole, role) {
		s.memberError(w, opsync.ErrForbidden)
		return nil
	}
	s.inviteMember(w, r, auth.InvitationProject, r.PathValue("id"), target, email, role)
	return nil
}

// memberAddsPerHour is how many people one account may try to add to projects
// and workspaces by email in an hour, found or not.
const memberAddsPerHour = 30

// allowMemberAdd counts one add by email for actor and answers 429
// rate_limited when the hour's budget is used up.
func (s *Server) allowMemberAdd(w http.ResponseWriter, actor string) bool {
	if s.memberAddLimiter.allow(actor) {
		return true
	}
	writeError(w, http.StatusTooManyRequests, "rate_limited", "too many people added in the last hour, try again later")
	return false
}

func (s *Server) handleSetMemberRole(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Role string `json:"role"`
	}
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	target := r.PathValue("userId")
	ch, err := s.sync.SetMemberRole(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"), target, in.Role)
	if err != nil {
		s.memberError(w, err)
		return
	}
	s.respondMembers(w, r, http.StatusOK, target, ch)
}

// handleRemoveMember removes a member; with the caller's own id (or "me") it is
// "leave project".
func (s *Server) handleRemoveMember(w http.ResponseWriter, r *http.Request) {
	actor := userFrom(r.Context()).ID
	target := r.PathValue("userId")
	if target == "me" {
		target = actor
	}
	ch, err := s.sync.RemoveMember(r.Context(), actor, r.PathValue("id"), target)
	if err != nil {
		s.memberError(w, err)
		return
	}
	s.respondMembers(w, r, http.StatusNoContent, target, ch)
}

func (s *Server) handleTransferProject(w http.ResponseWriter, r *http.Request) {
	var in struct {
		UserID string `json:"userId"`
	}
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	actor := userFrom(r.Context()).ID
	ch, err := s.sync.TransferOwnership(r.Context(), actor, r.PathValue("id"), in.UserID)
	if err != nil {
		s.memberError(w, err)
		return
	}
	s.audit.Record(r.Context(), audit.RoleChanged(actor, actor, projectRoleLabel(opsync.RoleOwner), projectRoleLabel(opsync.RoleAdmin)))
	s.respondMembers(w, r, http.StatusOK, in.UserID, ch)
}

// annotateProjects adds the caller's `role` and the `owner_id` to shared
// projects in REST and export responses. They are read-only annotations, not op
// fields: stripAnnotations drops them from write bodies.
//
// Every REST, export and agent read of a task passes through here too, so this
// is also where a task's custom field values are folded into its `fields`
// object (custom-fields D3).
func (s *Server) annotateProjects(ctx context.Context, entity string, list ...opsync.Entity) error {
	// Body version and pending appends (notes-overview D13), in every representation.
	if err := s.annotateBody(ctx, entity, list...); err != nil {
		return err
	}
	if entity == "rule" {
		if u := userFrom(ctx); u != nil {
			s.annotateRules(ctx, u.ID, list...)
		}
		return nil
	}
	if entity == "task" {
		for _, e := range list {
			foldFieldsInPlace(e)
			// Every task representation carries origin, null when unset
			// (OpenSpec change task-origin, "Task origin in representations").
			if _, has := e["origin"]; e != nil && !has {
				e["origin"] = json.RawMessage("null")
			}
			// And energy, null when none (task-energy D7).
			presentEnergy(e)
		}
		return nil
	}
	if entity == "section" {
		// Every section representation carries color and icon, null when unset
		// (OpenSpec change icons-and-section-style, "Sections API").
		for _, e := range list {
			for _, f := range []string{"color", "icon"} {
				if _, has := e[f]; e != nil && !has {
					e[f] = json.RawMessage("null")
				}
			}
			defaultFlowMode(e)
		}
		return nil
	}
	if entity == "view" {
		// Every view representation carries on_drop and icon, null when unset
		// (OpenSpec changes rule-boards, "Views API and export", and sidebar-polish).
		for _, e := range list {
			for _, f := range []string{"on_drop", "icon"} {
				if _, has := e[f]; e != nil && !has {
					e[f] = json.RawMessage("null")
				}
			}
		}
		return nil
	}
	if entity != "project" || len(list) == 0 {
		return nil
	}
	for _, e := range list {
		defaultFlowMode(e)
		defaultProjectStatus(e)
	}
	shared, err := s.sync.SharedProjects(ctx, userFrom(ctx).ID)
	if err != nil || len(shared) == 0 {
		return err
	}
	for _, e := range list {
		if e == nil {
			continue
		}
		a, ok := shared[idOf(e["id"])]
		if !ok {
			continue
		}
		role, _ := json.Marshal(a.Role)
		owner, _ := json.Marshal(a.OwnerID)
		e["role"], e["owner_id"] = role, owner
	}
	return nil
}

// stripAnnotations removes the read-only sharing annotations from a project
// write body, so a client can PATCH back what it read.
func stripAnnotations(entity string, body map[string]json.RawMessage) {
	delete(body, "body_version")
	if entity == "task" || entity == "note" {
		delete(body, "appends")
	}
	if entity == "project" {
		delete(body, "role")
		delete(body, "owner_id")
	}
	if entity == "rule" {
		delete(body, "paused_reason")
		delete(body, "warnings")
		delete(body, "ai_mode")
	}
}

// memberTarget resolves an add by account id, for a project of a created
// workspace, whose directory the dialog lists (an id elsewhere is answered as
// an unknown account, so ids cannot probe for accounts).
func (s *Server) memberTarget(r *http.Request, userID string) (*auth.User, error) {
	closed, err := s.sync.InClosedWorkspace(r.Context(), r.PathValue("id"))
	if err != nil {
		return nil, err
	}
	if !closed {
		return nil, auth.ErrNotFound
	}
	u, err := s.auth.UserByID(r.Context(), userID)
	if err != nil || u == nil {
		return nil, auth.ErrNotFound
	}
	return u, nil
}
