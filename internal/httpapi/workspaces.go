package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/auth"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Workspace routes (OpenSpec change workspaces, design D9). Reads need any
// session or token, writes a session or a full or admin token; writes are
// refused on a demo instance.
// A caller who is not a member of a workspace gets the same 404 as for one
// that does not exist. The directory changes only here, never through ops;
// every change wakes the devices of the accounts it affects.
func (s *Server) registerWorkspaceRoutes(mux *routes) {
	// Reading the directory is open to read and agent tokens too (the CLI and
	// MCP place everything in a workspace); every change needs a full token.
	read, write := signedIn, signedIn.fullTokens().demoDenied()
	mux.handle("GET /api/v1/workspaces", read, s.handleListWorkspaces)
	mux.handle("POST /api/v1/workspaces", write, s.handleCreateWorkspace)
	mux.handle("GET /api/v1/workspaces/{id}", read, s.handleGetWorkspace)
	mux.handle("PATCH /api/v1/workspaces/{id}", write, s.handleUpdateWorkspace)
	mux.handle("DELETE /api/v1/workspaces/{id}", write, s.handleDeleteWorkspace)
	mux.handle("POST /api/v1/workspaces/{id}/leave", write, s.handleLeaveWorkspace)
	mux.handle("POST /api/v1/workspaces/{id}/transfer", write, s.handleTransferWorkspace)
	mux.handle("GET /api/v1/workspaces/{id}/members", read, s.handleListWorkspaceMembers)
	mux.handle("POST /api/v1/workspaces/{id}/members", write, s.handleAddWorkspaceMember)
	mux.handle("PATCH /api/v1/workspaces/{id}/members/{userId}", write, s.handleSetWorkspaceMemberRole)
	mux.handle("DELETE /api/v1/workspaces/{id}/members/{userId}", write, s.handleRemoveWorkspaceMember)
	mux.handle("GET /api/v1/workspaces/{id}/groups", read, s.handleListGroups)
	mux.handle("POST /api/v1/workspaces/{id}/groups", write, s.handleCreateGroup)
	mux.handle("PATCH /api/v1/workspaces/{id}/groups/{groupId}", write, s.handleRenameGroup)
	mux.handle("DELETE /api/v1/workspaces/{id}/groups/{groupId}", write, s.handleDeleteGroup)
	mux.handle("PUT /api/v1/workspaces/{id}/groups/{groupId}/members/{userId}", write, s.handleGroupMember(true))
	mux.handle("DELETE /api/v1/workspaces/{id}/groups/{groupId}/members/{userId}", write, s.handleGroupMember(false))
	// Group grants on projects follow the project's member-management rules.
	mux.handle("POST /api/v1/projects/{id}/grants", signedIn.fullTokens().demoDenied(), s.handleCreateGrant)
	mux.handle("PATCH /api/v1/projects/{id}/grants/{groupId}", signedIn.fullTokens().demoDenied(), s.handleChangeGrant)
	mux.handle("DELETE /api/v1/projects/{id}/grants/{groupId}", signedIn.fullTokens().demoDenied(), s.handleRemoveGrant)
	s.registerWorkspaceInviteRoutes(mux)
}

// directoryError maps the sync package's directory errors onto the envelope.
func (s *Server) directoryError(w http.ResponseWriter, err error) {
	var ne *opsync.NotEmptyError
	var le *opsync.LimitError
	switch {
	case errors.As(err, &ne):
		writeError(w, http.StatusConflict, "workspace_not_empty",
			fmt.Sprintf("move or delete the workspace's %d projects and remove its %d other members first", ne.Projects, ne.Members))
	case errors.As(err, &le):
		writeError(w, http.StatusConflict, "limit_reached", fmt.Sprintf("limit reached: at most %d %s", le.Max, strings.ReplaceAll(le.Limit, "_", " ")))
	case errors.Is(err, opsync.ErrNotFound):
		what := "workspace"
		for _, k := range []string{"member", "group", "grant"} {
			if strings.HasSuffix(err.Error(), ": "+k) {
				what = k
			}
		}
		writeError(w, http.StatusNotFound, "not_found", what+" not found")
	case errors.Is(err, opsync.ErrForbidden):
		writeError(w, http.StatusForbidden, "forbidden", "your role in this workspace does not allow this change")
	case errors.Is(err, opsync.ErrOwnerMustTransfer):
		writeError(w, http.StatusConflict, "owner_must_transfer", "the owner cannot leave the workspace; transfer it to another member first")
	case errors.Is(err, opsync.ErrAlreadyMember):
		writeError(w, http.StatusConflict, "already_member", "this account is already a member")
	case errors.Is(err, opsync.ErrNotInWorkspace):
		writeError(w, http.StatusConflict, "not_in_workspace", "this account is not a member of the workspace; add them to the workspace first")
	case errors.Is(err, opsync.ErrDefaultWorkspace):
		writeError(w, http.StatusConflict, "default_workspace", "your default workspace cannot be deleted, left, transferred or shared")
	case errors.Is(err, opsync.ErrGroupExists):
		writeError(w, http.StatusConflict, "group_exists", "a group with this name already exists in the workspace")
	case errors.Is(err, opsync.ErrInvalidInput), errors.Is(err, opsync.ErrInvalidMember):
		msg := err.Error()
		for _, p := range []string{opsync.ErrInvalidInput.Error() + ": ", opsync.ErrInvalidMember.Error() + ": "} {
			msg = strings.TrimPrefix(msg, p)
		}
		writeError(w, http.StatusBadRequest, "invalid_input", msg)
	default:
		s.internal(w, err)
	}
}

// respondWorkspace wakes the change's audience and answers with the caller's
// fresh view of the workspace (or 204).
func (s *Server) respondWorkspace(w http.ResponseWriter, r *http.Request, status int, wsID string, ch opsync.DirectoryChange) {
	s.sync.NotifyMembership(ch.Audience)
	if status == http.StatusNoContent {
		w.WriteHeader(status)
		return
	}
	ws, err := s.sync.WorkspaceByID(r.Context(), userFrom(r.Context()).ID, wsID)
	if err != nil {
		s.directoryError(w, err)
		return
	}
	writeJSON(w, status, ws)
}

func (s *Server) handleListWorkspaces(w http.ResponseWriter, r *http.Request) {
	list, err := s.sync.Workspaces(r.Context(), userFrom(r.Context()).ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"workspaces": list})
}

func (s *Server) handleGetWorkspace(w http.ResponseWriter, r *http.Request) {
	ws, err := s.sync.WorkspaceByID(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"))
	if err != nil {
		s.directoryError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, ws)
}

func (s *Server) handleCreateWorkspace(w http.ResponseWriter, r *http.Request) {
	var in opsync.WorkspaceInput
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	actor := userFrom(r.Context()).ID
	ws, err := s.sync.CreateWorkspace(r.Context(), actor, in)
	if err != nil {
		s.directoryError(w, err)
		return
	}
	s.audit.Record(r.Context(), audit.WorkspaceCreated(actor, ws.ID))
	s.sync.NotifyMembership([]string{actor})
	writeJSON(w, http.StatusCreated, ws)
}

func (s *Server) handleUpdateWorkspace(w http.ResponseWriter, r *http.Request) {
	var in opsync.WorkspaceInput
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	actor, id := userFrom(r.Context()).ID, r.PathValue("id")
	ch, err := s.sync.UpdateWorkspace(r.Context(), actor, id, in)
	if err != nil {
		s.directoryError(w, err)
		return
	}
	s.audit.Record(r.Context(), audit.WorkspaceRenamed(actor, id))
	s.respondWorkspace(w, r, http.StatusOK, id, ch)
}

func (s *Server) handleDeleteWorkspace(w http.ResponseWriter, r *http.Request) {
	actor, id := userFrom(r.Context()).ID, r.PathValue("id")
	ch, err := s.sync.DeleteWorkspace(r.Context(), actor, id)
	if err != nil {
		s.directoryError(w, err)
		return
	}
	s.audit.Record(r.Context(), audit.WorkspaceDeleted(actor, id))
	s.respondWorkspace(w, r, http.StatusNoContent, id, ch)
}

func (s *Server) handleLeaveWorkspace(w http.ResponseWriter, r *http.Request) {
	actor, id := userFrom(r.Context()).ID, r.PathValue("id")
	ch, err := s.sync.RemoveWorkspaceMember(r.Context(), actor, id, actor)
	if err != nil {
		s.directoryError(w, err)
		return
	}
	s.audit.Record(r.Context(), audit.WorkspaceMemberRemoved(actor, actor, id))
	s.respondWorkspace(w, r, http.StatusNoContent, id, ch)
}

func (s *Server) handleTransferWorkspace(w http.ResponseWriter, r *http.Request) {
	var in struct {
		UserID string `json:"userId"`
	}
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	actor, id := userFrom(r.Context()).ID, r.PathValue("id")
	ch, err := s.sync.TransferWorkspace(r.Context(), actor, id, in.UserID)
	if err != nil {
		s.directoryError(w, err)
		return
	}
	s.audit.Record(r.Context(), audit.WorkspaceTransferred(actor, in.UserID, id))
	s.respondWorkspace(w, r, http.StatusOK, id, ch)
}

func (s *Server) handleListWorkspaceMembers(w http.ResponseWriter, r *http.Request) {
	ws, err := s.sync.WorkspaceByID(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"))
	if err != nil {
		s.directoryError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"members": ws.Members})
}

func (s *Server) handleListGroups(w http.ResponseWriter, r *http.Request) {
	ws, err := s.sync.WorkspaceByID(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"))
	if err != nil {
		s.directoryError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"groups": ws.Groups})
}

// workspaceManager answers the request and returns nil unless the caller may
// manage the created workspace: 404 for non-members, 409 for a default
// workspace, 403 for plain members.
func (s *Server) workspaceManager(w http.ResponseWriter, r *http.Request) *opsync.Workspace {
	ws, err := s.sync.WorkspaceByID(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"))
	switch {
	case err != nil:
		s.directoryError(w, err)
		return nil
	case ws.Default:
		s.directoryError(w, opsync.ErrDefaultWorkspace)
		return nil
	case ws.Role != opsync.WorkspaceOwner && ws.Role != opsync.WorkspaceAdmin:
		s.directoryError(w, opsync.ErrForbidden)
		return nil
	}
	return &ws
}

// encryptedDirectory refuses membership changes for an encrypted account
// (workspaces "Encrypted accounts", end-to-end-encryption "Consequences").
func (s *Server) encryptedDirectory(w http.ResponseWriter, r *http.Request) bool {
	return s.refuseIfEncrypted(w, r, "workspace members, groups and invite links are not available for accounts with end-to-end encryption yet")
}

func (s *Server) handleAddWorkspaceMember(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email string `json:"email"`
		Role  string `json:"role"`
	}
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	// The caller's rights first, so nobody can probe which accounts exist.
	if s.workspaceManager(w, r) == nil || s.encryptedDirectory(w, r) {
		return
	}
	if in.Role == "" {
		in.Role = opsync.WorkspaceMember
	}
	target, err := s.auth.UserByEmail(r.Context(), in.Email)
	if errors.Is(err, auth.ErrNotFound) {
		writeError(w, http.StatusNotFound, "user_not_found", "no account with this email exists on this server")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	actor, id := userFrom(r.Context()).ID, r.PathValue("id")
	ch, err := s.sync.AddWorkspaceMember(r.Context(), actor, id, target.ID, in.Role)
	if err != nil {
		s.directoryError(w, err)
		return
	}
	s.audit.Record(r.Context(), audit.WorkspaceMemberAdded(actor, target.ID, id, in.Role))
	s.respondWorkspace(w, r, http.StatusCreated, id, ch)
}

func (s *Server) handleSetWorkspaceMemberRole(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Role string `json:"role"`
	}
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	actor, id, target := userFrom(r.Context()).ID, r.PathValue("id"), r.PathValue("userId")
	before, _ := s.sync.WorkspaceByID(r.Context(), actor, id)
	ch, err := s.sync.SetWorkspaceMemberRole(r.Context(), actor, id, target, in.Role)
	if err != nil {
		s.directoryError(w, err)
		return
	}
	from := ""
	for _, m := range before.Members {
		if m.UserID == target {
			from = m.Role
		}
	}
	if from != in.Role {
		s.audit.Record(r.Context(), audit.WorkspaceMemberRoleChanged(actor, target, id, from, in.Role))
	}
	s.respondWorkspace(w, r, http.StatusOK, id, ch)
}

func (s *Server) handleRemoveWorkspaceMember(w http.ResponseWriter, r *http.Request) {
	actor, id, target := userFrom(r.Context()).ID, r.PathValue("id"), r.PathValue("userId")
	if target == "me" {
		target = actor
	}
	ch, err := s.sync.RemoveWorkspaceMember(r.Context(), actor, id, target)
	if err != nil {
		s.directoryError(w, err)
		return
	}
	s.audit.Record(r.Context(), audit.WorkspaceMemberRemoved(actor, target, id))
	s.respondWorkspace(w, r, http.StatusNoContent, id, ch)
}

func (s *Server) handleCreateGroup(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name string `json:"name"`
	}
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	if s.workspaceManager(w, r) == nil || s.encryptedDirectory(w, r) {
		return
	}
	actor, id := userFrom(r.Context()).ID, r.PathValue("id")
	g, ch, err := s.sync.CreateGroup(r.Context(), actor, id, in.Name)
	if err != nil {
		s.directoryError(w, err)
		return
	}
	s.audit.Record(r.Context(), audit.WorkspaceGroupCreated(actor, id, g.ID))
	s.sync.NotifyMembership(ch.Audience)
	writeJSON(w, http.StatusCreated, g)
}

func (s *Server) handleRenameGroup(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name string `json:"name"`
	}
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	actor, id := userFrom(r.Context()).ID, r.PathValue("id")
	ch, err := s.sync.RenameGroup(r.Context(), actor, id, r.PathValue("groupId"), in.Name)
	if err != nil {
		s.directoryError(w, err)
		return
	}
	s.respondWorkspace(w, r, http.StatusOK, id, ch)
}

func (s *Server) handleDeleteGroup(w http.ResponseWriter, r *http.Request) {
	actor, id, group := userFrom(r.Context()).ID, r.PathValue("id"), r.PathValue("groupId")
	ch, err := s.sync.DeleteGroup(r.Context(), actor, id, group)
	if err != nil {
		s.directoryError(w, err)
		return
	}
	s.audit.Record(r.Context(), audit.WorkspaceGroupDeleted(actor, id, group))
	s.respondWorkspace(w, r, http.StatusNoContent, id, ch)
}

func (s *Server) handleGroupMember(add bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if add && s.encryptedDirectory(w, r) {
			return
		}
		actor, id, group, target := userFrom(r.Context()).ID, r.PathValue("id"), r.PathValue("groupId"), r.PathValue("userId")
		ch, err := s.sync.SetGroupMember(r.Context(), actor, id, group, target, add)
		if err != nil {
			s.directoryError(w, err)
			return
		}
		if add {
			s.audit.Record(r.Context(), audit.WorkspaceGroupMemberAdded(actor, target, id, group))
		} else {
			s.audit.Record(r.Context(), audit.WorkspaceGroupMemberRemoved(actor, target, id, group))
		}
		s.respondWorkspace(w, r, http.StatusOK, id, ch)
	}
}

// ---- project group grants ----

func (s *Server) handleCreateGrant(w http.ResponseWriter, r *http.Request) {
	var in struct {
		GroupID string `json:"groupId"`
		Role    string `json:"role"`
	}
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	s.changeGrant(w, r, in.GroupID, in.Role, true)
}

func (s *Server) handleChangeGrant(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Role string `json:"role"`
	}
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	if in.Role == "" {
		writeError(w, http.StatusBadRequest, "invalid_input", "role must be viewer, editor or admin")
		return
	}
	s.changeGrant(w, r, r.PathValue("groupId"), in.Role, false)
}

func (s *Server) handleRemoveGrant(w http.ResponseWriter, r *http.Request) {
	s.changeGrant(w, r, r.PathValue("groupId"), "", false)
}

// changeGrant creates (create), changes or removes (role "") a group grant
// and answers with the project's fresh member list.
func (s *Server) changeGrant(w http.ResponseWriter, r *http.Request, groupID, role string, create bool) {
	ctx := r.Context()
	actor, project := userFrom(ctx).ID, r.PathValue("id")
	if create {
		m, err := s.sync.ProjectMembers(ctx, actor, project)
		if err != nil {
			s.memberError(w, err)
			return
		}
		if m.Role != opsync.RoleOwner && m.Role != opsync.RoleAdmin {
			s.memberError(w, opsync.ErrForbidden)
			return
		}
		if s.encryptedDirectory(w, r) {
			return
		}
	}
	gc, err := s.sync.SetGroupGrant(ctx, actor, project, groupID, role, create)
	if err != nil {
		s.memberError(w, err)
		return
	}
	switch {
	case create:
		s.audit.Record(ctx, audit.ProjectGrantAdded(actor, project, groupID, role))
	case role == "":
		s.audit.Record(ctx, audit.ProjectGrantRemoved(actor, project, groupID))
	case gc.From != gc.To:
		s.audit.Record(ctx, audit.ProjectGrantChanged(actor, project, groupID, gc.From, gc.To))
	}
	s.sync.NotifyMembership(gc.Audience)
	status := http.StatusOK
	if create {
		status = http.StatusCreated
	}
	if role == "" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	m, err := s.sync.ProjectMembers(ctx, actor, project)
	if err != nil {
		s.memberError(w, err)
		return
	}
	writeJSON(w, status, m)
}
