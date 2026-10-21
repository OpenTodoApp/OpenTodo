package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/pixari/opentodo/internal/auth"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Task pages (OpenSpec change `task-pages`): a user publishes one task as a page
// that people without an account can open, reply to and tick. The management
// routes need a session or a full token and are refused on a demo; the public
// routes (taskpages_public.go) never authenticate. A task the server can read
// is served live (design D1); a task in an encrypted personal scope is served
// from a snapshot the publisher's device encrypted with a share key the server
// never sees (D3), and guests' replies to it wait as ciphertext (D4).

type taskPageLimiters struct {
	create, read, tick, reply, maps, addr *rateLimiter
}

func (s *Server) registerTaskPageRoutes(mux *routes) {
	s.pages = taskPageLimiters{
		create: newRateLimiter(20, time.Hour),
		read:   newRateLimiter(120, time.Minute),
		tick:   newRateLimiter(60, time.Minute),
		reply:  newRateLimiter(20, time.Hour),
		// A map loads a few dozen tiles at a time; its own budget per page.
		maps: newRateLimiter(1200, time.Minute),
		addr: newRateLimiter(120, time.Minute),
	}
	manage := signedIn.fullTokens().demoDenied()
	mux.handle("GET /api/v1/task-pages", manage, s.handleListTaskPages)
	mux.handle("POST /api/v1/tasks/{id}/page", manage.recent(), s.handlePublishTaskPage)
	mux.handle("GET /api/v1/tasks/{id}/page", manage, s.handleTaskPageStatus)
	mux.handle("DELETE /api/v1/tasks/{id}/page", manage, s.handleRevokeTaskPage)
	mux.handle("PUT /api/v1/tasks/{id}/page/snapshot", manage, s.handleTaskPageSnapshot)
	mux.handle("GET /api/v1/tasks/{id}/page/replies", manage, s.handleTaskPageReplies)
	mux.handle("DELETE /api/v1/tasks/{id}/page/replies/{replyId}", manage, s.handleConfirmTaskPageReply)
	const why = "task pages, OpenSpec task-pages: anyone with the link opens the page; the secret in the address is the credential"
	mux.handle("GET /api/v1/pages/{secret}", public(why).demoDenied(), s.handleTaskPage)
	mux.handle("POST /api/v1/pages/{secret}/replies", public(why).demoDenied(), s.handleTaskPageReply)
	mux.handle("POST /api/v1/pages/{secret}/tick", public(why).demoDenied(), s.handleTaskPageTick)
	mux.handle("GET /api/v1/pages/{secret}/files/{fileId}", public(why).demoDenied(), s.handleTaskPageFile)
	mux.handle("GET /api/v1/pages/{secret}/maps/style", public(why).demoDenied(), s.handleTaskPageMapStyle)
	mux.handle("GET /api/v1/pages/{secret}/maps/tiles/{z}/{x}/{y}", public(why).demoDenied(), s.handleTaskPageMapTile)
	mux.handle("GET /api/v1/pages/{secret}/maps/fonts/{fontstack}/{range}", public(why).demoDenied(), s.handleTaskPageMapGlyphs)
	mux.handle("GET /api/v1/pages/{secret}/maps/sprites/{file}", public(why).demoDenied(), s.handleTaskPageMapSprite)
}

// pageEncrypted reports whether a task is served from a snapshot: it lives in
// the publisher's personal scope and the publisher has end-to-end encryption.
func (s *Server) pageEncrypted(ctx context.Context, publisherID string, tp opsync.TaskPage) (bool, error) {
	if tp.Shared {
		return false, nil
	}
	return s.encryptionEnabled(ctx, publisherID)
}

// pageManager loads the task a management route names and checks that the
// caller may publish it: its owner for a personal task, the owner or an admin of
// a shared project. It answers and returns ok=false otherwise.
func (s *Server) pageManager(w http.ResponseWriter, r *http.Request) (opsync.TaskPage, bool) {
	uid := userFrom(r.Context()).ID
	tp, ok, err := s.sync.TaskPageData(r.Context(), uid, r.PathValue("id"))
	if err != nil {
		s.internal(w, err)
		return tp, false
	}
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "task not found")
		return tp, false
	}
	if tp.Role != opsync.RoleOwner && tp.Role != opsync.RoleAdmin {
		writeError(w, http.StatusForbidden, "forbidden", "only the task's owner, or the owner and admins of its project, can manage its page")
		return tp, false
	}
	return tp, true
}

type publishTaskPageInput struct {
	Rights        string  `json:"rights"`
	Label         *string `json:"label"`
	ExpiresInDays *int    `json:"expiresInDays"`
	IncludeMap    *bool   `json:"includeMap"`
	Snapshot      string  `json:"snapshot"`
	WrappedKey    string  `json:"wrappedKey"`
}

// validate answers 400 naming the first bad field.
func (in publishTaskPageInput) validate(w http.ResponseWriter) bool {
	bad := func(msg string) bool {
		writeError(w, http.StatusBadRequest, "invalid_input", msg)
		return false
	}
	switch {
	case !auth.ValidTaskPageRights(in.Rights):
		return bad("rights: must be view, reply or tick")
	case in.Label != nil && *in.Label != "" && !auth.ValidTaskPageLabel(*in.Label):
		return bad("label: 1 to 40 lowercase letters, digits and hyphens")
	case in.ExpiresInDays != nil && (*in.ExpiresInDays < 1 || *in.ExpiresInDays > auth.MaxTaskPageDays):
		return bad("expiresInDays: must be from 1 to 90, or left out for no expiry")
	case len(in.Snapshot) > auth.MaxTaskPageSnapshot:
		return bad("snapshot: at most 256 KB")
	case len(in.WrappedKey) > 1024:
		return bad("wrappedKey: too long")
	}
	return true
}

func (s *Server) handlePublishTaskPage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	u := userFrom(ctx)
	tp, ok := s.pageManager(w, r)
	if !ok {
		return
	}
	var in publishTaskPageInput
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	if !in.validate(w) {
		return
	}
	if !isNullish(tp.Task["parent_id"]) {
		writeError(w, http.StatusBadRequest, "invalid_input", "task: a subtask cannot be published on its own; publish its parent")
		return
	}
	encrypted, err := s.pageEncrypted(ctx, u.ID, tp)
	if err != nil {
		s.internal(w, err)
		return
	}
	switch {
	case encrypted && (in.Snapshot == "" || in.WrappedKey == ""):
		writeError(w, http.StatusBadRequest, "invalid_input", "snapshot and wrappedKey: a task with end-to-end encryption is published from an unlocked device")
		return
	case !encrypted && (in.Snapshot != "" || in.WrappedKey != ""):
		writeError(w, http.StatusConflict, "page_not_encrypted", "this task is served live; send no snapshot")
		return
	}
	if !s.pages.create.allow(u.ID) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many task pages published, try again later")
		return
	}
	pin := auth.PublishInput{TaskID: r.PathValue("id"), Rights: in.Rights, IncludeMap: in.IncludeMap == nil || *in.IncludeMap,
		Snapshot: []byte(in.Snapshot), WrappedKey: in.WrappedKey}
	if in.Label != nil {
		pin.Label = *in.Label
	}
	if in.ExpiresInDays != nil {
		pin.Days = *in.ExpiresInDays
	}
	p, secret, err := s.auth.PublishTaskPage(ctx, u, pin)
	if errors.Is(err, auth.ErrTaskPageLimit) {
		writeError(w, http.StatusConflict, "limit_reached", "an account can have at most 100 active task pages; revoke one first")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	link := s.publicOrigin(r) + "/t/" + secret
	if p.Label != nil {
		link += "/" + *p.Label
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": p.ID, "taskId": p.TaskID, "rights": p.Rights, "label": p.Label,
		"includeMap": p.IncludeMap, "encrypted": encrypted, "publishedAt": p.PublishedAt, "expiresAt": p.ExpiresAt, "link": link})
}

// pageStatus is what the status route shows: never the secret or a key.
func pageStatus(p *auth.TaskPage, encrypted bool) map[string]any {
	return map[string]any{"id": p.ID, "taskId": p.TaskID, "rights": p.Rights, "label": p.Label, "includeMap": p.IncludeMap,
		"createdBy": p.UserID, "publishedAt": p.PublishedAt, "expiresAt": p.ExpiresAt, "lastOpenedAt": p.LastOpenedAt,
		"replies": p.Replies, "ticks": p.Ticks, "encrypted": encrypted, "snapshotAt": p.SnapshotAt, "pendingReplies": p.PendingReplies}
}

func (s *Server) handleTaskPageStatus(w http.ResponseWriter, r *http.Request) {
	tp, ok := s.pageManager(w, r)
	if !ok {
		return
	}
	p, err := s.auth.ActiveTaskPage(r.Context(), r.PathValue("id"))
	if errors.Is(err, auth.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "this task has no active page")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	encrypted, err := s.pageEncrypted(r.Context(), p.UserID, tp)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, pageStatus(p, encrypted))
}

func (s *Server) handleRevokeTaskPage(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.pageManager(w, r); !ok {
		return
	}
	err := s.auth.RevokeTaskPage(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"))
	switch {
	case errors.Is(err, auth.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "this task has no active page")
	case err != nil:
		s.internal(w, err)
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

// handleListTaskPages lists the caller's own active pages, with the wrapped
// share keys of encrypted ones, so each of their devices can keep snapshots
// current and import replies (design D3, D4).
func (s *Server) handleListTaskPages(w http.ResponseWriter, r *http.Request) {
	list, err := s.auth.UserTaskPages(r.Context(), userFrom(r.Context()).ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"pages": list})
}

// publisherPage is the active page of the task a snapshot or replies route
// names, for its publisher only (anyone else gets 404 not_found).
func (s *Server) publisherPage(w http.ResponseWriter, r *http.Request) (*auth.TaskPage, opsync.TaskPage, bool) {
	tp, ok := s.pageManager(w, r)
	if !ok {
		return nil, tp, false
	}
	p, err := s.auth.ActiveTaskPage(r.Context(), r.PathValue("id"))
	if errors.Is(err, auth.ErrNotFound) || (err == nil && p.UserID != userFrom(r.Context()).ID) {
		writeError(w, http.StatusNotFound, "not_found", "this task has no active page of yours")
		return nil, tp, false
	}
	if err != nil {
		s.internal(w, err)
		return nil, tp, false
	}
	return p, tp, true
}

func (s *Server) handleTaskPageSnapshot(w http.ResponseWriter, r *http.Request) {
	p, tp, ok := s.publisherPage(w, r)
	if !ok {
		return
	}
	var in struct {
		Ciphertext string `json:"ciphertext"`
		Version    int64  `json:"version"`
		WrappedKey string `json:"wrappedKey"`
	}
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	switch {
	case in.Ciphertext == "" || len(in.Ciphertext) > auth.MaxTaskPageSnapshot:
		writeError(w, http.StatusBadRequest, "invalid_input", "ciphertext: required, at most 256 KB")
		return
	case in.Version < 1:
		writeError(w, http.StatusBadRequest, "invalid_input", "version: a positive number")
		return
	case len(in.WrappedKey) > 1024 || (in.WrappedKey == "" && p.WrappedKey == nil):
		writeError(w, http.StatusBadRequest, "invalid_input", "wrappedKey: required for the first snapshot, at most 1 KB")
		return
	}
	encrypted, err := s.pageEncrypted(r.Context(), p.UserID, tp)
	if err != nil {
		s.internal(w, err)
		return
	}
	if !encrypted {
		writeError(w, http.StatusConflict, "page_not_encrypted", "this task is served live; send no snapshot")
		return
	}
	if err := s.auth.PutTaskPageSnapshot(r.Context(), p.ID, []byte(in.Ciphertext), in.Version, in.WrappedKey); err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleTaskPageReplies(w http.ResponseWriter, r *http.Request) {
	p, _, ok := s.publisherPage(w, r)
	if !ok {
		return
	}
	list, err := s.auth.TaskPageReplies(r.Context(), p.ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"replies": list})
}

func (s *Server) handleConfirmTaskPageReply(w http.ResponseWriter, r *http.Request) {
	p, _, ok := s.publisherPage(w, r)
	if !ok {
		return
	}
	err := s.auth.DeleteTaskPageReply(r.Context(), p.ID, r.PathValue("replyId"))
	switch {
	case errors.Is(err, auth.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "no such pending reply")
	case err != nil:
		s.internal(w, err)
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

// guestName checks the name a guest typed: 1–40 characters on one line.
func guestName(name string) (string, bool) {
	name = strings.TrimSpace(name)
	n := utf8.RuneCountInString(name)
	return name, n >= 1 && n <= 40 && !strings.ContainsAny(name, "\r\n")
}
