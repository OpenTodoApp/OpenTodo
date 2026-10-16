package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/auth"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Project sharing routes (OpenSpec change `project-sharing`, design D7). Every
// route requires authentication; a caller who is not a member of the project gets
// the same 404 as for a project that does not exist. Membership is changed only
// here, never through the op log.
func (s *Server) registerSharingRoutes(mux *http.ServeMux) {
	mux.Handle("GET /api/v1/projects/{id}/members", s.requireAuth(s.handleListMembers))
	mux.Handle("POST /api/v1/projects/{id}/members", s.requireAuth(s.handleAddMember))
	mux.Handle("PATCH /api/v1/projects/{id}/members/{userId}", s.requireAuth(s.handleSetMemberRole))
	mux.Handle("DELETE /api/v1/projects/{id}/members/{userId}", s.requireAuth(s.handleRemoveMember))
	mux.Handle("POST /api/v1/projects/{id}/transfer", s.requireAuth(s.handleTransferProject))
}

// memberError maps the sync package's membership errors onto the API envelope.
func (s *Server) memberError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, opsync.ErrNotFound):
		msg := "project not found"
		if strings.Contains(err.Error(), "member") {
			msg = "member not found"
		}
		writeError(w, http.StatusNotFound, "not_found", msg)
	case errors.Is(err, opsync.ErrForbidden):
		writeError(w, http.StatusForbidden, "forbidden", "your role on this project does not allow this change")
	case errors.Is(err, opsync.ErrOwnerMustTransfer):
		writeError(w, http.StatusConflict, "owner_must_transfer", "the owner cannot leave the project; transfer ownership to another member first")
	case errors.Is(err, opsync.ErrAlreadyMember):
		writeError(w, http.StatusConflict, "already_member", "this account is already a member of the project")
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
	writeJSON(w, http.StatusOK, m)
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
	writeJSON(w, status, m)
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
		Role  string `json:"role"`
	}
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
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
	target, err := s.auth.UserByEmail(ctx, in.Email)
	if errors.Is(err, auth.ErrNotFound) {
		writeError(w, http.StatusNotFound, "user_not_found", "no account with this email exists on this server")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	ch, err := s.sync.AddMember(ctx, actor.ID, r.PathValue("id"), target.ID, in.Role)
	if err != nil {
		s.memberError(w, err)
		return
	}
	s.respondMembers(w, r, http.StatusCreated, target.ID, ch)
}

func (s *Server) handleSetMemberRole(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Role string `json:"role"`
	}
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
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
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
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
	if entity == "task" {
		for _, e := range list {
			foldFieldsInPlace(e)
		}
		return nil
	}
	if entity != "project" || len(list) == 0 {
		return nil
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
	if entity == "project" {
		delete(body, "role")
		delete(body, "owner_id")
	}
}
