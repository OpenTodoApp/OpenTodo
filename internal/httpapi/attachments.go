package httpapi

// Attachments (OpenSpec change attachments, design D3–D6): metadata is an op-log
// entity like a comment; the bytes are immutable files in internal/blobs, moved
// with these routes and never through /api/v1/sync. A device creates the row
// first (offline included) and uploads the bytes afterwards; the server writes
// uploaded_at itself (device "server") once the file is stored and verified.

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/blobs"
	"github.com/pixari/opentodo/internal/ids"
	"github.com/pixari/opentodo/internal/settings"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// inlineTypes are the media types served inline (design D6); everything else is
// served as application/octet-stream with disposition attachment. SVG is left
// out on purpose (scripts and external references); it still works in <img>.
var inlineTypes = map[string]bool{
	"image/png": true, "image/jpeg": true, "image/gif": true, "image/webp": true, "image/avif": true,
	"application/pdf": true, "text/plain": true,
}

func inlineType(mt string) bool {
	mt = strings.ToLower(strings.TrimSpace(mt))
	return inlineTypes[mt] || strings.HasPrefix(mt, "audio/") || strings.HasPrefix(mt, "video/")
}

// registerAttachmentRoutes mounts the routes and wires the blob store into sync.
func (s *Server) registerAttachmentRoutes(mux *routes) {
	if s.blobs == nil && s.cfg.DataDir != "" {
		b, err := blobs.New(s.cfg.DataDir)
		if err != nil {
			s.log.Error("attachments: file store unavailable", "err", err)
		} else {
			s.blobs = b
		}
	}
	if s.blobs != nil {
		s.sync.SetBlobStore(s.blobs)
		s.importer.SetBlobs(s.blobs, func(ctx context.Context, uid string) (int64, int64, error) {
			a, err := s.attachmentSettings(ctx)
			if err != nil || !a.Enabled {
				return 0, 0, err
			}
			left := int64(-1)
			if q := a.QuotaBytes(); q > 0 {
				used, err := s.attachmentUsage(ctx, uid)
				if err != nil {
					return 0, 0, err
				}
				left = max(0, q-used)
			}
			return a.MaxFileBytes(), left, nil
		})
	}
	s.sync.SetAttachmentLimit(func() int64 {
		a, err := s.attachmentSettings(context.Background())
		if err != nil {
			return 0
		}
		return a.MaxFileBytes()
	})
	if err := settings.New(s.sync.DB()).SeedAttachments(context.Background(), s.cfg.AttachmentsMaxFileMB, s.cfg.AttachmentsQuotaMB); err != nil {
		s.log.Error("attachments: presets", "err", err)
	}
	if s.attachmentLimiter == nil {
		s.attachmentLimiter = newRateLimiter(120, time.Hour)
	}
	mux.handle("GET /api/v1/settings/attachments", signedIn.demoDenied(), s.handleGetAttachmentSettings)
	mux.handle("PUT /api/v1/settings/attachments", ownerOnly("manage the attachment settings").demoDenied(), s.handlePutAttachmentSettings)
	mux.handle("GET /api/v1/tasks/{id}/attachments", signedIn.demoDenied(), s.handleListAttachments)
	mux.handle("POST /api/v1/tasks/{id}/attachments", signedIn.demoDenied(), s.handleCreateAttachment)
	mux.handle("PUT /api/v1/attachments/{id}/content", signedIn.demoDenied(), s.handleUploadAttachment)
	mux.handle("GET /api/v1/attachments/{id}/content", signedIn.demoDenied(), s.handleAttachmentContent)
	mux.handle("PATCH /api/v1/attachments/{id}", signedIn.demoDenied(), s.handleRenameAttachment)
	mux.handle("DELETE /api/v1/attachments/{id}", signedIn.demoDenied(), s.handleRemoveAttachment)
}

// WithAttachmentRateLimit replaces the per-account upload limit (tests).
func WithAttachmentRateLimit(n int, window time.Duration) Option {
	return func(s *Server) { s.attachmentLimiter = newRateLimiter(n, window) }
}

func (s *Server) attachmentSettings(ctx context.Context) (settings.Attachments, error) {
	a, err := settings.New(s.sync.DB()).Attachments(ctx)
	if s.demo != nil {
		// The demo instance refuses every attachment route (design D15).
		a.Enabled = false
	}
	return a, err
}

// attachmentUsage is the bytes an account's live, uploaded attachments take
// (design D5: the quota counts what the account authored).
func (s *Server) attachmentUsage(ctx context.Context, uid string) (int64, error) {
	rows, err := s.sync.List(ctx, uid, "attachment", false)
	if err != nil {
		return 0, err
	}
	var total int64
	for _, a := range rows {
		if idOf(a["author_id"]) != uid || isNullish(a["uploaded_at"]) {
			continue
		}
		total += int64(numberOf(a["size"]))
	}
	return total, nil
}

// attachmentInfo is the /me block and the GET settings body for a member.
func (s *Server) attachmentInfo(ctx context.Context, uid string) (map[string]any, error) {
	a, err := s.attachmentSettings(ctx)
	if err != nil {
		return nil, err
	}
	used, err := s.attachmentUsage(ctx, uid)
	if err != nil {
		return nil, err
	}
	return map[string]any{"enabled": a.Enabled, "max_file_bytes": a.MaxFileBytes(), "quota_bytes": a.QuotaBytes(), "used_bytes": used}, nil
}

func (s *Server) handleGetAttachmentSettings(w http.ResponseWriter, r *http.Request) {
	a, err := s.attachmentSettings(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, a)
}

func (s *Server) handlePutAttachmentSettings(w http.ResponseWriter, r *http.Request) {
	store := settings.New(s.sync.DB())
	before, err := store.Attachments(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	in := before
	if err := readJSON(r, &in); err != nil {
		badBodyWith(w, err, "invalid_input", "body must be {enabled, max_file_mb, quota_mb}")
		return
	}
	if err := store.SetAttachments(r.Context(), in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	}
	actor := userFrom(r.Context()).ID
	if before.Enabled != in.Enabled {
		s.audit.Record(r.Context(), audit.SettingsChanged(actor, settings.AttachmentsEnabledKey, boolText(before.Enabled), boolText(in.Enabled)))
	}
	if before.MaxFileMB != in.MaxFileMB {
		s.audit.Record(r.Context(), audit.SettingsChanged(actor, settings.AttachmentsMaxFileKey, strconv.Itoa(before.MaxFileMB), strconv.Itoa(in.MaxFileMB)))
	}
	if before.QuotaMB != in.QuotaMB {
		s.audit.Record(r.Context(), audit.SettingsChanged(actor, settings.AttachmentsQuotaKey, strconv.Itoa(before.QuotaMB), strconv.Itoa(in.QuotaMB)))
	}
	writeJSON(w, http.StatusOK, in)
}

// attachmentView is an attachment as the API serves it: the row plus "uploaded".
func attachmentView(a opsync.Entity) map[string]any {
	out := map[string]any{}
	for k, v := range a {
		out[k] = v
	}
	out["uploaded"] = !isNullish(a["uploaded_at"])
	return out
}

// liveAttachment loads an attachment the caller can see and that is not removed;
// it answers 404 otherwise (an id never reveals anything).
func (s *Server) liveAttachment(w http.ResponseWriter, r *http.Request) (opsync.Entity, bool) {
	a, err := s.sync.Get(r.Context(), userFrom(r.Context()).ID, "attachment", r.PathValue("id"))
	if err != nil {
		s.internal(w, err)
		return nil, false
	}
	if a == nil || a.Deleted() {
		writeError(w, http.StatusNotFound, "not_found", "attachment not found")
		return nil, false
	}
	return a, true
}

func (s *Server) handleListAttachments(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := userFrom(ctx).ID
	taskID := r.PathValue("id")
	task, err := s.sync.Get(ctx, uid, "task", taskID)
	if err != nil {
		s.internal(w, err)
		return
	}
	if task == nil || task.Deleted() {
		writeError(w, http.StatusNotFound, "not_found", "task not found")
		return
	}
	rows, err := s.sync.List(ctx, uid, "attachment", false)
	if err != nil {
		s.internal(w, err)
		return
	}
	out := []map[string]any{}
	for _, a := range rows {
		if idOf(a["task_id"]) == taskID {
			out = append(out, attachmentView(a))
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		return numberOf(out[i]["created_at"].(json.RawMessage)) < numberOf(out[j]["created_at"].(json.RawMessage))
	})
	writeJSON(w, http.StatusOK, map[string]any{"attachments": out})
}

// attachmentGate checks the switch and the per-account rate limit of uploads.
func (s *Server) attachmentGate(w http.ResponseWriter, r *http.Request) (settings.Attachments, bool) {
	a, err := s.attachmentSettings(r.Context())
	if err != nil {
		s.internal(w, err)
		return a, false
	}
	if !a.Enabled {
		writeError(w, http.StatusForbidden, "attachments_disabled", "attachments are turned off on this server")
		return a, false
	}
	if s.blobs == nil {
		writeError(w, http.StatusServiceUnavailable, "attachments_unavailable", "the server has no file store")
		return a, false
	}
	if !s.attachmentLimiter.allow(userFrom(r.Context()).ID) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many uploads, try again later")
		return a, false
	}
	return a, true
}

// checkRoom refuses a file over the per-file limit or the account's quota.
func (s *Server) checkRoom(w http.ResponseWriter, r *http.Request, a settings.Attachments, size int64) bool {
	if size > a.MaxFileBytes() {
		writeError(w, http.StatusRequestEntityTooLarge, "attachment_too_large", fmt.Sprintf("files may be at most %d MB on this server", a.MaxFileMB))
		return false
	}
	if q := a.QuotaBytes(); q > 0 {
		used, err := s.attachmentUsage(r.Context(), userFrom(r.Context()).ID)
		if err != nil {
			s.internal(w, err)
			return false
		}
		if used+size > q {
			writeError(w, http.StatusForbidden, "quota_exceeded", fmt.Sprintf("this upload would go over your %d MB of attachments", a.QuotaMB))
			return false
		}
	}
	return true
}

// writeBlobError answers a failed file write.
func (s *Server) writeBlobError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, blobs.ErrMismatch):
		writeError(w, http.StatusBadRequest, "attachment_mismatch", "the uploaded bytes do not match the attachment's size or digest")
	case errors.Is(err, blobs.ErrExists):
		writeError(w, http.StatusConflict, "already_uploaded", "this attachment's file is already stored")
	case errors.Is(err, syscall.ENOSPC):
		writeError(w, http.StatusInsufficientStorage, "insufficient_storage", "the server is out of disk space")
	default:
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			writeError(w, http.StatusBadRequest, "attachment_mismatch", "the upload is larger than the attachment's size")
			return
		}
		s.internal(w, err)
	}
}

// markUploaded writes uploaded_at as the author with device "server" and wakes devices.
// markUploaded records the server's word that the file is stored. The op's
// timestamp beats the device's own write of the field (its creation set
// uploaded_at to null): a phone whose clock runs ahead of the server would
// otherwise win last-writer-wins, the op would be dropped, and the file would
// stay "uploading" on every device for good (issue #246).
func (s *Server) markUploaded(ctx context.Context, uid, id string) error {
	now := time.Now().UnixMilli()
	fieldTS, err := s.sync.FieldTS(ctx, uid, "attachment", id, "uploaded_at")
	if err != nil {
		return err
	}
	res, err := s.sync.ApplyStrict(ctx, uid, []opsync.Op{{ID: ids.New(), Entity: "attachment", EntityID: id, Field: "uploaded_at",
		Value: json.RawMessage(strconv.FormatInt(now, 10)), TS: s.sync.ServerTSAt(max(now, fieldTS+1)), Device: serverDevice}})
	if err != nil {
		return err
	}
	if res.Applied == 0 {
		return fmt.Errorf("attachment %s: uploaded_at was not applied", id)
	}
	s.sync.NotifyApplied(res, serverDevice)
	return nil
}

func (s *Server) handleUploadAttachment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := userFrom(ctx).ID
	a, ok := s.liveAttachment(w, r)
	if !ok {
		return
	}
	// Only the creator uploads the bytes of their row; others learn nothing.
	if idOf(a["author_id"]) != uid {
		writeError(w, http.StatusNotFound, "not_found", "attachment not found")
		return
	}
	if !isNullish(a["url"]) {
		writeError(w, http.StatusBadRequest, "attachment_mismatch", "a link attachment has no file")
		return
	}
	cfg, ok := s.attachmentGate(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	if !isNullish(a["uploaded_at"]) || s.blobs.Exists(id) {
		writeError(w, http.StatusConflict, "already_uploaded", "this attachment's file is already stored")
		return
	}
	size := int64(numberOf(a["size"]))
	if r.ContentLength > size {
		writeError(w, http.StatusBadRequest, "attachment_mismatch", "the upload is larger than the attachment's size")
		return
	}
	if !s.checkRoom(w, r, cfg, size) {
		return
	}
	body := http.MaxBytesReader(w, r.Body, size+1)
	if err := s.blobs.Write(id, body, blobs.Spec{Size: size, SHA256: idOf(a["sha256"])}); err != nil {
		s.writeBlobError(w, err)
		return
	}
	if err := s.markUploaded(ctx, uid, id); err != nil {
		_ = s.blobs.Remove(id)
		s.internal(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleAttachmentContent(w http.ResponseWriter, r *http.Request) {
	a, ok := s.liveAttachment(w, r)
	if !ok {
		return
	}
	if isNullish(a["uploaded_at"]) || s.blobs == nil {
		writeError(w, http.StatusNotFound, "not_found", "the file has not been uploaded yet")
		return
	}
	f, info, err := s.blobs.Open(r.PathValue("id"))
	if errors.Is(err, blobs.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "the file is not on this server")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	defer f.Close()
	name := idOf(a["name"])
	mt := idOf(a["mime"])
	encrypted := string(a["encrypted"]) == "true"
	disposition := "attachment"
	ctype := "application/octet-stream"
	if !encrypted && inlineType(mt) && r.URL.Query().Get("download") != "1" {
		disposition, ctype = "inline", mt
	}
	h := w.Header()
	h.Set("Content-Type", ctype)
	h.Set("Content-Disposition", disposition+"; filename*=UTF-8''"+url.PathEscape(name))
	h.Set("Content-Security-Policy", "default-src 'none'; sandbox")
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Cache-Control", "private, max-age=31536000, immutable")
	h.Set("ETag", `"`+idOf(a["sha256"])+`"`)
	http.ServeContent(w, r, "", info.ModTime(), f)
}

func (s *Server) handleRenameAttachment(w http.ResponseWriter, r *http.Request) {
	a, ok := s.liveAttachment(w, r)
	if !ok {
		return
	}
	var in struct {
		Name *string `json:"name"`
	}
	if err := readJSON(r, &in); err != nil || in.Name == nil {
		badBodyWith(w, err, "invalid_input", `body must be {"name": "…"}`)
		return
	}
	if idOf(a["author_id"]) != userFrom(r.Context()).ID {
		writeError(w, http.StatusForbidden, "forbidden", "only the author can rename an attachment")
		return
	}
	s.writeAttachment(w, r, r.PathValue("id"), map[string]json.RawMessage{"name": mustJSON(*in.Name)}, http.StatusOK)
}

func (s *Server) handleRemoveAttachment(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.liveAttachment(w, r); !ok {
		return
	}
	s.writeAttachment(w, r, r.PathValue("id"), map[string]json.RawMessage{"deleted_at": json.RawMessage(strconv.FormatInt(time.Now().UnixMilli(), 10))}, http.StatusNoContent)
}

// writeAttachment applies attachment fields as one strict REST write.
func (s *Server) writeAttachment(w http.ResponseWriter, r *http.Request, id string, body map[string]json.RawMessage, status int) {
	ctx := r.Context()
	uid := userFrom(ctx).ID
	res, err := s.sync.ApplyStrict(ctx, uid, fieldOps("attachment", id, body, s.opTS()))
	if err != nil {
		var rej *opsync.RejectedError
		switch {
		case writeLimited(w, err):
		case errors.Is(err, opsync.ErrInvalidOp):
			writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
		case errors.As(err, &rej) && rej.Reason == opsync.ReasonTooLarge:
			writeError(w, http.StatusRequestEntityTooLarge, "attachment_too_large", "the file is larger than this server allows")
		case errors.As(err, &rej):
			writeError(w, http.StatusForbidden, "forbidden", "only the author can change an attachment; the author, project admins and the owner can remove it")
		default:
			s.internal(w, err)
		}
		return
	}
	if res.Applied > 0 {
		s.sync.NotifyApplied(res, serverDevice)
	}
	if status == http.StatusNoContent {
		w.WriteHeader(status)
		return
	}
	a, err := s.sync.Get(ctx, uid, "attachment", id)
	if err != nil || a == nil {
		s.internal(w, fmt.Errorf("attachment %s after write: %v", id, err))
		return
	}
	writeJSON(w, status, attachmentView(a))
}

// handleCreateAttachment creates an attachment over the API: a multipart `file`
// (and optional `comment_id`) stored and verified in one request, or a JSON link
// {name?, url}. With an Idempotency-Key the id derives from the key, so a retry
// answers with the existing attachment.
func (s *Server) handleCreateAttachment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := userFrom(ctx).ID
	taskID := r.PathValue("id")
	task, err := s.sync.Get(ctx, uid, "task", taskID)
	if err != nil {
		s.internal(w, err)
		return
	}
	if task == nil || task.Deleted() {
		writeError(w, http.StatusNotFound, "not_found", "task not found")
		return
	}
	cfg, ok := s.attachmentGate(w, r)
	if !ok {
		return
	}
	key, keyed, handled := idempotencyKey(w, r)
	if handled {
		return
	}
	id := ids.New()
	if keyed {
		id = s.idemEntityID(uid, "attachments", key)
		if existing, err := s.sync.Get(ctx, uid, "attachment", id); err == nil && existing != nil && idOf(existing["author_id"]) == uid {
			w.Header().Set(ReplayedHeader, "true")
			writeJSON(w, http.StatusOK, attachmentView(existing))
			return
		}
	}
	now := time.Now().UnixMilli()
	body := map[string]json.RawMessage{
		"task_id": mustJSON(taskID), "author_id": mustJSON(uid), "comment_id": json.RawMessage("null"),
		"encrypted": json.RawMessage("false"), "created_at": json.RawMessage(strconv.FormatInt(now, 10)),
		"uploaded_at": json.RawMessage("null"), "deleted_at": json.RawMessage("null"),
	}
	mt, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
	stored := false
	if mt == "multipart/form-data" {
		name, ctype, comment, size, digest, err := s.receiveMultipart(w, r, id, cfg)
		if err != nil {
			s.writeBlobError(w, err)
			return
		}
		if name == "" {
			return // receiveMultipart answered
		}
		stored = true
		body["name"], body["mime"], body["size"], body["sha256"], body["url"] = mustJSON(name), mustJSON(ctype), json.RawMessage(strconv.FormatInt(size, 10)), mustJSON(digest), json.RawMessage("null")
		body["uploaded_at"] = json.RawMessage(strconv.FormatInt(now, 10))
		if comment != "" {
			body["comment_id"] = mustJSON(comment)
		}
	} else {
		var in struct {
			Name string `json:"name"`
			URL  string `json:"url"`
		}
		if err := readJSON(r, &in); err != nil || in.URL == "" {
			badBodyWith(w, err, "invalid_input", `body must be a multipart "file", or {"url": "https://…", "name"?: "…"}`)
			return
		}
		name := strings.TrimSpace(in.Name)
		if name == "" {
			if u, err := url.Parse(in.URL); err == nil {
				name = u.Host + u.Path
			}
		}
		if n := []rune(name); len(n) > opsync.MaxAttachmentName {
			name = string(n[:opsync.MaxAttachmentName])
		}
		name = strings.NewReplacer("/", "-", "\\", "-").Replace(name)
		body["name"], body["mime"], body["size"], body["sha256"], body["url"] = mustJSON(name), mustJSON("text/uri-list"), json.RawMessage("0"), mustJSON(""), mustJSON(in.URL)
	}
	ops := fieldOps("attachment", id, body, s.opTS())
	if keyed {
		for i := range ops {
			ops[i].ID = idemOpID(id, ops[i].Field)
		}
	}
	res, err := s.sync.ApplyStrict(ctx, uid, ops)
	if err != nil {
		if stored {
			_ = s.blobs.Remove(id)
		}
		var rej *opsync.RejectedError
		switch {
		case writeLimited(w, err):
		case errors.Is(err, opsync.ErrInvalidOp):
			writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
		case errors.As(err, &rej) && rej.Reason == opsync.ReasonTooLarge:
			writeError(w, http.StatusRequestEntityTooLarge, "attachment_too_large", fmt.Sprintf("files may be at most %d MB on this server", cfg.MaxFileMB))
		case errors.As(err, &rej):
			writeError(w, http.StatusForbidden, "forbidden", "you cannot attach files to this task or comment")
		default:
			s.internal(w, err)
		}
		return
	}
	if res.Applied > 0 {
		s.sync.NotifyApplied(res, serverDevice)
	}
	a, err := s.sync.Get(ctx, uid, "attachment", id)
	if err != nil || a == nil {
		s.internal(w, fmt.Errorf("attachment %s after create: %v", id, err))
		return
	}
	writeJSON(w, http.StatusCreated, attachmentView(a))
}

// receiveMultipart streams the `file` part to a temporary file (hashing and
// counting, bounded by the per-file limit and the quota), then stores it under
// id. It returns the file's name, type, optional comment id, size and digest; an
// empty name with a nil error means it has answered the request itself.
func (s *Server) receiveMultipart(w http.ResponseWriter, r *http.Request, id string, cfg settings.Attachments) (name, ctype, comment string, size int64, digest string, err error) {
	limit := cfg.MaxFileBytes()
	r.Body = http.MaxBytesReader(w, r.Body, limit+1<<20)
	mr, err := r.MultipartReader()
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_input", "body must be multipart/form-data with a file part")
		return "", "", "", 0, "", nil
	}
	var tmp *os.File
	defer func() {
		if tmp != nil {
			tmp.Close()
			os.Remove(tmp.Name())
		}
	}()
	for {
		part, perr := mr.NextPart()
		if perr == io.EOF {
			break
		}
		if perr != nil {
			var maxErr *http.MaxBytesError
			if errors.As(perr, &maxErr) {
				writeError(w, http.StatusRequestEntityTooLarge, "attachment_too_large", fmt.Sprintf("files may be at most %d MB on this server", cfg.MaxFileMB))
				return "", "", "", 0, "", nil
			}
			writeError(w, http.StatusBadRequest, "invalid_input", "malformed multipart body")
			return "", "", "", 0, "", nil
		}
		switch part.FormName() {
		case "comment_id":
			v, _ := io.ReadAll(io.LimitReader(part, 256))
			comment = strings.TrimSpace(string(v))
		case "file":
			if tmp != nil {
				continue
			}
			name = path.Base(strings.ReplaceAll(part.FileName(), "\\", "/"))
			ctype = part.Header.Get("Content-Type")
			if ctype == "" {
				ctype = "application/octet-stream"
			}
			if tmp, err = os.CreateTemp(s.cfg.DataDir+"/tmp", "attach-*"); err != nil {
				return "", "", "", 0, "", err
			}
			h := sha256.New()
			n, cerr := io.Copy(io.MultiWriter(tmp, h), io.LimitReader(part, limit+1))
			if cerr != nil {
				var maxErr *http.MaxBytesError
				if errors.As(cerr, &maxErr) {
					writeError(w, http.StatusRequestEntityTooLarge, "attachment_too_large", fmt.Sprintf("files may be at most %d MB on this server", cfg.MaxFileMB))
					return "", "", "", 0, "", nil
				}
				return "", "", "", 0, "", cerr
			}
			size, digest = n, hex.EncodeToString(h.Sum(nil))
		}
		part.Close()
	}
	if tmp == nil || name == "" || name == "." || name == "/" {
		writeError(w, http.StatusBadRequest, "invalid_input", "a file part with a file name is required")
		return "", "", "", 0, "", nil
	}
	if !s.checkRoom(w, r, cfg, size) {
		return "", "", "", 0, "", nil
	}
	if _, err := tmp.Seek(0, io.SeekStart); err != nil {
		return "", "", "", 0, "", err
	}
	if err := s.blobs.Write(id, tmp, blobs.Spec{Size: size, SHA256: digest}); err != nil {
		return "", "", "", 0, "", err
	}
	if n := []rune(name); len(n) > opsync.MaxAttachmentName {
		name = string(n[:opsync.MaxAttachmentName])
	}
	return name, ctype, comment, size, digest, nil
}

// writeExportZip streams the export document and every readable, uploaded
// attachment file as a ZIP (design D12): export.json first, then
// attachments/<id>/<name>. Nothing is buffered: entries use data descriptors.
func (s *Server) writeExportZip(w http.ResponseWriter, r *http.Request, doc map[string]any, attachments []opsync.Entity) {
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="opentodo-export.zip"`)
	zw := zip.NewWriter(w)
	defer zw.Close()
	jw, err := zw.Create("export.json")
	if err != nil {
		return
	}
	enc := json.NewEncoder(jw)
	enc.SetIndent("", "  ")
	if err := enc.Encode(doc); err != nil {
		s.log.Error("export zip: document", "err", err)
		return
	}
	// The account's profile picture (settings-refresh D10).
	s.exportAvatar(zw, userFrom(r.Context()).ID)
	if s.blobs == nil {
		return
	}
	for _, a := range attachments {
		id := idOf(a["id"])
		if a.Deleted() || isNullish(a["uploaded_at"]) || !blobs.ValidID(id) {
			continue
		}
		f, _, err := s.blobs.Open(id)
		if err != nil {
			continue
		}
		name := path.Base(strings.ReplaceAll(idOf(a["name"]), "\\", "/"))
		if name == "" || name == "." || name == "/" || strings.HasPrefix(name, "enc:") {
			name = "file"
		}
		fw, err := zw.CreateHeader(&zip.FileHeader{Name: "attachments/" + id + "/" + name, Method: zip.Store})
		if err == nil {
			_, err = io.Copy(fw, f)
		}
		f.Close()
		if err != nil {
			s.log.Error("export zip: file", "id", id, "err", err)
			return
		}
	}
}
