package httpapi

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/auth"
	"github.com/OpenTodoApp/opentodo/internal/blobs"
	"github.com/OpenTodoApp/opentodo/internal/notelinks"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Note pages (OpenSpec change `note-public-links`): one standalone note
// published read-only at /n/<secret>, on the task page machinery (design D1):
// the same table, secrets, limits, headers, lifecycle checks and public route,
// which answers kind "note". A note the server can read is served live; a note
// of an encrypted personal scope from a snapshot the publisher's device
// encrypted with a share key the server never sees (D4).

func (s *Server) registerNotePageRoutes(mux *routes) {
	manage := signedIn.FullTokens().DemoDenied()
	mux.handle("POST /api/v1/notes/{id}/page", manage.Recent(), s.handlePublishNotePage)
	mux.handle("GET /api/v1/notes/{id}/page", manage, s.handleNotePageStatus)
	mux.handle("DELETE /api/v1/notes/{id}/page", manage, s.handleRevokeNotePage)
	mux.handle("PUT /api/v1/notes/{id}/page/snapshot", manage, s.handleNotePageSnapshot)
}

// notePageEncrypted reports whether a note is served from a snapshot: it lives
// in the publisher's personal scope and the publisher has end-to-end encryption.
func (s *Server) notePageEncrypted(ctx context.Context, publisherID string, np opsync.NotePage) (bool, error) {
	if np.Shared {
		return false, nil
	}
	return s.encryptionEnabled(ctx, publisherID)
}

// notePageManager loads the note a management route names and checks that the
// caller may publish it (design D3): the author of a personal note, the owner or
// an admin of a shared project. It answers and returns ok=false otherwise.
func (s *Server) notePageManager(w http.ResponseWriter, r *http.Request) (opsync.NotePage, bool) {
	np, ok, err := s.sync.NotePageData(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"))
	if err != nil {
		s.internal(w, err)
		return np, false
	}
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "note not found")
		return np, false
	}
	if np.Role != opsync.RoleOwner && np.Role != opsync.RoleAdmin {
		writeError(w, http.StatusForbidden, "forbidden", "only the note's author, or the owner and admins of its project, can manage its page")
		return np, false
	}
	return np, true
}

type publishNotePageInput struct {
	Label         *string `json:"label"`
	ExpiresInDays *int    `json:"expiresInDays"`
	Snapshot      string  `json:"snapshot"`
	WrappedKey    string  `json:"wrappedKey"`
}

func (in publishNotePageInput) validate(w http.ResponseWriter) bool {
	bad := func(msg string) bool {
		writeError(w, http.StatusBadRequest, "invalid_input", msg)
		return false
	}
	switch {
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

func (s *Server) handlePublishNotePage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	u := userFrom(ctx)
	np, ok := s.notePageManager(w, r)
	if !ok {
		return
	}
	var in publishNotePageInput
	if err := readJSON(r, &in); err != nil {
		if strings.Contains(err.Error(), `"rights"`) {
			writeError(w, http.StatusBadRequest, "invalid_input", "rights: a note page is read-only and takes no rights")
			return
		}
		badBody(w, err)
		return
	}
	if !in.validate(w) {
		return
	}
	encrypted, err := s.notePageEncrypted(ctx, u.ID, np)
	if err != nil {
		s.internal(w, err)
		return
	}
	switch {
	case encrypted && (in.Snapshot == "" || in.WrappedKey == ""):
		writeError(w, http.StatusBadRequest, "invalid_input", "snapshot and wrappedKey: a note with end-to-end encryption is published from an unlocked device")
		return
	case !encrypted && (in.Snapshot != "" || in.WrappedKey != ""):
		writeError(w, http.StatusConflict, "page_not_encrypted", "this note is served live; send no snapshot")
		return
	}
	if !s.pages.create.allow(u.ID) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many pages published, try again later")
		return
	}
	pin := auth.PublishInput{Kind: "note", NoteID: r.PathValue("id"), Rights: "view", Snapshot: []byte(in.Snapshot), WrappedKey: in.WrappedKey}
	if in.Label != nil {
		pin.Label = *in.Label
	}
	if in.ExpiresInDays != nil {
		pin.Days = *in.ExpiresInDays
	}
	p, secret, err := s.auth.PublishTaskPage(ctx, u, pin)
	if errors.Is(err, auth.ErrTaskPageLimit) {
		writeError(w, http.StatusConflict, "limit_reached", "an account can have at most 100 active task and note pages; revoke one first")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	link := s.publicOrigin(r) + "/n/" + secret
	if p.Label != nil {
		link += "/" + *p.Label
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": p.ID, "noteId": p.NoteID, "label": p.Label, "encrypted": encrypted,
		"publishedAt": p.PublishedAt, "expiresAt": p.ExpiresAt, "link": link})
}

// notePageStatus is what the status route shows: never the secret or a key.
func notePageStatus(p *auth.TaskPage, encrypted bool) map[string]any {
	return map[string]any{"id": p.ID, "noteId": p.NoteID, "label": p.Label, "createdBy": p.UserID, "publishedAt": p.PublishedAt,
		"expiresAt": p.ExpiresAt, "lastOpenedAt": p.LastOpenedAt, "encrypted": encrypted, "snapshotAt": p.SnapshotAt}
}

func (s *Server) handleNotePageStatus(w http.ResponseWriter, r *http.Request) {
	np, ok := s.notePageManager(w, r)
	if !ok {
		return
	}
	p, err := s.auth.ActiveNotePage(r.Context(), r.PathValue("id"))
	if errors.Is(err, auth.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "this note has no active page")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	encrypted, err := s.notePageEncrypted(r.Context(), p.UserID, np)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, notePageStatus(p, encrypted))
}

func (s *Server) handleRevokeNotePage(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.notePageManager(w, r); !ok {
		return
	}
	err := s.auth.RevokeNotePage(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"))
	switch {
	case errors.Is(err, auth.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "this note has no active page")
	case err != nil:
		s.internal(w, err)
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

// handleNotePageSnapshot stores a newer encrypted snapshot of the publisher's
// own note page (design D4); a version not greater than the stored one changes
// nothing.
func (s *Server) handleNotePageSnapshot(w http.ResponseWriter, r *http.Request) {
	np, ok := s.notePageManager(w, r)
	if !ok {
		return
	}
	p, err := s.auth.ActiveNotePage(r.Context(), r.PathValue("id"))
	if errors.Is(err, auth.ErrNotFound) || (err == nil && p.UserID != userFrom(r.Context()).ID) {
		writeError(w, http.StatusNotFound, "not_found", "this note has no active page of yours")
		return
	}
	if err != nil {
		s.internal(w, err)
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
	encrypted, err := s.notePageEncrypted(r.Context(), p.UserID, np)
	if err != nil {
		s.internal(w, err)
		return
	}
	if !encrypted {
		writeError(w, http.StatusConflict, "page_not_encrypted", "this note is served live; send no snapshot")
		return
	}
	if err := s.auth.PutTaskPageSnapshot(r.Context(), p.ID, []byte(in.Ciphertext), in.Version, in.WrappedKey); err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// resolvedNotePage is a usable note page with the note as its publisher sees it.
type resolvedNotePage struct {
	page      *auth.ResolvedTaskPage
	np        opsync.NotePage
	encrypted bool
}

// resolveNote runs the note half of the use-time checks (design D5) on a page
// lookupPage found. On failure it has answered and returns ok=false.
func (s *Server) resolveNote(w http.ResponseWriter, r *http.Request, p *auth.ResolvedTaskPage) (resolvedNotePage, bool) {
	ctx := r.Context()
	invalid := func() (resolvedNotePage, bool) {
		writeError(w, http.StatusNotFound, "page_invalid", auth.ErrTaskPageInvalid.Error())
		return resolvedNotePage{}, false
	}
	np, ok, err := s.sync.NotePageData(ctx, p.UserID, p.NoteID)
	if err != nil {
		s.internal(w, err)
		return resolvedNotePage{}, false
	}
	if !ok || np.ProjectArchived || (np.Role != opsync.RoleOwner && np.Role != opsync.RoleAdmin) {
		return invalid()
	}
	encrypted, err := s.notePageEncrypted(ctx, p.UserID, np)
	if err != nil {
		s.internal(w, err)
		return resolvedNotePage{}, false
	}
	switch {
	case encrypted && len(p.Snapshot) == 0:
		return invalid()
	case !encrypted && p.Encrypted:
		if err := s.auth.DropTaskPageSnapshot(ctx, p.ID); err != nil {
			s.internal(w, err)
			return resolvedNotePage{}, false
		}
		p.Snapshot, p.WrappedKey = nil, nil
	}
	if err := s.auth.TouchTaskPage(ctx, p.ID); err != nil {
		s.log.Warn("note page last open", "err", err)
	}
	return resolvedNotePage{page: p, np: np, encrypted: encrypted}, true
}

// pageImage reports a raster image a note page shows in place (design D2): the
// image types of the attachments' inline allow-list.
func pageImage(mime string) bool {
	mt := strings.ToLower(strings.TrimSpace(mime))
	return strings.HasPrefix(mt, "image/") && inlineTypes[mt]
}

// serveNotePage answers GET /api/v1/pages/{secret} for a note page (design D2):
// title, text with internal links stripped, when the text changed, and the
// live attachments; nothing else of the note or its account.
func (s *Server) serveNotePage(w http.ResponseWriter, r *http.Request, p *auth.ResolvedTaskPage) {
	rn, ok := s.resolveNote(w, r, p)
	if !ok {
		return
	}
	out := map[string]any{"kind": "note", "rights": "view", "serverTime": s.now().UnixMilli(), "label": p.Label}
	if rn.encrypted {
		out["mode"] = "encrypted"
		out["snapshot"] = string(p.Snapshot)
		out["snapshotAt"] = p.SnapshotAt
		writeJSON(w, http.StatusOK, out)
		return
	}
	n := rn.np.Note
	out["mode"] = "live"
	out["title"] = rawOrNull(n["title"])
	out["text"] = notelinks.Strip(idOf(n["description"]))
	out["changedAt"] = rn.np.TextChangedAt
	links, files := []map[string]any{}, []map[string]any{}
	for _, a := range rn.np.Attachments {
		if u := idOf(a["url"]); u != "" {
			links = append(links, map[string]any{"id": idOf(a["id"]), "name": idOf(a["name"]), "url": u})
		} else if string(a["encrypted"]) != "true" && !isNullish(a["uploaded_at"]) {
			files = append(files, map[string]any{"id": idOf(a["id"]), "name": idOf(a["name"]), "size": rawOrNull(a["size"]),
				"image": pageImage(idOf(a["mime"]))})
		}
	}
	out["links"], out["files"] = links, files
	writeJSON(w, http.StatusOK, out)
}

// serveNotePageFile serves a file of a live note page: a raster image inline so
// embeds render, anything else as a download (design D2).
func (s *Server) serveNotePageFile(w http.ResponseWriter, r *http.Request, p *auth.ResolvedTaskPage) {
	rn, ok := s.resolveNote(w, r, p)
	if !ok {
		return
	}
	var a opsync.Entity
	if !rn.encrypted {
		for _, x := range rn.np.Attachments {
			if idOf(x["id"]) == r.PathValue("fileId") && string(x["encrypted"]) != "true" && isNullish(x["url"]) {
				a = x
			}
		}
	}
	if a == nil || isNullish(a["uploaded_at"]) || s.blobs == nil {
		writeError(w, http.StatusNotFound, "not_found", "no such file on this page")
		return
	}
	f, info, err := s.blobs.Open(storedFile(a))
	if errors.Is(err, blobs.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "the file is not on this server")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	defer f.Close()
	disposition, ctype := "attachment", "application/octet-stream"
	if mt := strings.ToLower(strings.TrimSpace(idOf(a["mime"]))); pageImage(mt) && r.URL.Query().Get("download") != "1" {
		disposition, ctype = "inline", mt
	}
	h := w.Header()
	h.Set("Content-Type", ctype)
	h.Set("Content-Disposition", disposition+"; filename*=UTF-8''"+url.PathEscape(idOf(a["name"])))
	h.Set("Content-Security-Policy", "default-src 'none'; sandbox")
	h.Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(w, r, "", info.ModTime(), f)
}
