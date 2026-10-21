package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/blobs"
	"github.com/pixari/opentodo/internal/ids"
	"github.com/pixari/opentodo/internal/notify"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// The public task page routes (OpenSpec `task-pages`). They never authenticate:
// a session cookie is ignored, nothing sets a cookie, every unusable page
// answers one uniform 404 page_invalid, and a guest's writes are ops by the
// publisher from the device page:<page-id> (design D5).

// noStoreWriter keeps Cache-Control: no-store on a response whose handler sets
// its own caching (the static file server).
type noStoreWriter struct{ http.ResponseWriter }

func (w noStoreWriter) WriteHeader(code int) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Del("CDN-Cache-Control")
	w.ResponseWriter.WriteHeader(code)
}

func (w noStoreWriter) Write(b []byte) (int, error) {
	if w.Header().Get("Cache-Control") != "no-store" {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(b)
}

// resolvedPage is a usable page with the task as its publisher sees it.
type resolvedPage struct {
	page      *auth.ResolvedTaskPage
	tp        opsync.TaskPage
	encrypted bool
}

// resolveTaskPage runs the limits and use-time checks every public page route
// shares (lifecycle requirement). On failure it has answered and returns ok=false.
func (s *Server) resolveTaskPage(w http.ResponseWriter, r *http.Request, perPage *rateLimiter) (resolvedPage, bool) {
	publicHeaders(w)
	ctx := r.Context()
	ip := clientIP(r)
	if !s.pages.addr.allow(ip) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many requests, try again in a minute")
		return resolvedPage{}, false
	}
	invalid := func() (resolvedPage, bool) {
		writeError(w, http.StatusNotFound, "page_invalid", auth.ErrTaskPageInvalid.Error())
		return resolvedPage{}, false
	}
	p, err := s.auth.LookupTaskPage(ctx, r.PathValue("secret"))
	if errors.Is(err, auth.ErrTaskPageInvalid) {
		// Guessing pages costs as much as guessing passwords: the sign-in limiter.
		if !s.limiter.allow(ip) {
			writeError(w, http.StatusTooManyRequests, "rate_limited", "too many attempts, try again later")
			return resolvedPage{}, false
		}
		return invalid()
	}
	if err != nil {
		s.internal(w, err)
		return resolvedPage{}, false
	}
	if !perPage.allow(p.ID) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "this page is used too often, try again later")
		return resolvedPage{}, false
	}
	if p.PublisherDeactivated {
		return invalid()
	}
	tp, ok, err := s.sync.TaskPageData(ctx, p.UserID, p.TaskID)
	if err != nil {
		s.internal(w, err)
		return resolvedPage{}, false
	}
	if !ok || tp.ProjectArchived || (tp.Role != opsync.RoleOwner && tp.Role != opsync.RoleAdmin) {
		return invalid()
	}
	encrypted, err := s.pageEncrypted(ctx, p.UserID, tp)
	if err != nil {
		s.internal(w, err)
		return resolvedPage{}, false
	}
	switch {
	case encrypted && len(p.Snapshot) == 0:
		// Unavailable until the publisher's device uploads a snapshot.
		return invalid()
	case !encrypted && p.Encrypted:
		// The task left the encrypted scope: the snapshot and key are dropped.
		if err := s.auth.DropTaskPageSnapshot(ctx, p.ID); err != nil {
			s.internal(w, err)
			return resolvedPage{}, false
		}
		p.Snapshot, p.WrappedKey = nil, nil
	}
	if err := s.auth.TouchTaskPage(ctx, p.ID); err != nil {
		s.log.Warn("task page last open", "err", err)
	}
	return resolvedPage{page: p, tp: tp, encrypted: encrypted}, true
}

// pageTaskFields are the fields of the task a page shows (design: "What a task
// page shows"); nothing else is copied, so a field added later stays private.
var pageTaskFields = []string{"title", "description", "due", "deadline", "completed_at"}

func (s *Server) handleTaskPage(w http.ResponseWriter, r *http.Request) {
	rp, ok := s.resolveTaskPage(w, r, s.pages.read)
	if !ok {
		return
	}
	p := rp.page
	out := map[string]any{"rights": p.Rights, "serverTime": time.Now().UnixMilli(), "label": p.Label}
	if rp.encrypted {
		out["mode"] = "encrypted"
		out["snapshot"] = string(p.Snapshot)
		out["snapshotAt"] = p.SnapshotAt
		writeJSON(w, http.StatusOK, out)
		return
	}
	out["mode"] = "live"
	out["id"] = p.TaskID
	t := rp.tp.Task
	for _, f := range pageTaskFields {
		out[f] = rawOrNull(t[f])
	}
	subtasks := make([]map[string]any, 0, len(rp.tp.Subtasks))
	for _, st := range rp.tp.Subtasks {
		subtasks = append(subtasks, map[string]any{"id": idOf(st["id"]), "title": rawOrNull(st["title"]),
			"completed_at": rawOrNull(st["completed_at"]), "depth": rawOrNull(st["depth"])})
	}
	out["subtasks"] = subtasks
	links, files := []map[string]any{}, []map[string]any{}
	for _, a := range rp.tp.Attachments {
		if u := idOf(a["url"]); u != "" {
			links = append(links, map[string]any{"id": idOf(a["id"]), "name": idOf(a["name"]), "url": u})
		} else if string(a["encrypted"]) != "true" && !isNullish(a["uploaded_at"]) {
			files = append(files, map[string]any{"id": idOf(a["id"]), "name": idOf(a["name"]), "size": rawOrNull(a["size"])})
		}
	}
	out["links"], out["files"] = links, files
	out["location"] = nil
	if p.IncludeMap && !isNullish(t["location"]) && s.mapsAvailable(r.Context()) {
		out["location"] = t["location"]
	}
	out["comments"] = s.pageComments(r, rp)
	writeJSON(w, http.StatusOK, out)
}

// pageComments are the task's comments written since the page was published,
// with the member's display name or the guest's typed name.
func (s *Server) pageComments(r *http.Request, rp resolvedPage) []map[string]any {
	var authors []string
	for _, c := range rp.tp.Comments {
		authors = append(authors, idOf(c["author_id"]))
	}
	names := s.sync.UserNames(r.Context(), authors)
	out := []map[string]any{}
	for _, c := range rp.tp.Comments {
		var created int64
		_ = json.Unmarshal(c["created_at"], &created)
		if created < rp.page.PublishedAt {
			continue
		}
		item := map[string]any{"id": idOf(c["id"]), "body": rawOrNull(c["body"]), "createdAt": created}
		if g := idOf(c["guest_name"]); g != "" {
			item["name"], item["guest"] = g, true
		} else {
			item["name"], item["guest"] = names[idOf(c["author_id"])], false
		}
		out = append(out, item)
	}
	return out
}

func rawOrNull(v json.RawMessage) json.RawMessage {
	if len(v) == 0 {
		return json.RawMessage("null")
	}
	return v
}

// handleTaskPageReply turns a guest's reply into a comment (live page) or keeps
// it as ciphertext for the publisher's devices (encrypted page, design D4).
func (s *Server) handleTaskPageReply(w http.ResponseWriter, r *http.Request) {
	rp, ok := s.resolveTaskPage(w, r, s.pages.read)
	if !ok {
		return
	}
	p := rp.page
	if p.Rights == "view" {
		writeError(w, http.StatusForbidden, "forbidden", "this page can only be read")
		return
	}
	var in struct {
		Name       string `json:"name"`
		Body       string `json:"body"`
		Ciphertext string `json:"ciphertext"`
	}
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	ctx := r.Context()
	if rp.encrypted {
		if in.Ciphertext == "" || len(in.Ciphertext) > auth.MaxTaskPageReply || in.Body != "" || in.Name != "" {
			writeError(w, http.StatusBadRequest, "invalid_input", "ciphertext: an encrypted page takes only the encrypted reply, at most 16 KB")
			return
		}
		if !s.pages.reply.allow(p.ID) {
			writeError(w, http.StatusTooManyRequests, "rate_limited", "this page received too many replies, try again later")
			return
		}
		id, err := s.auth.AddTaskPageReply(ctx, p.ID, in.Ciphertext)
		if err != nil {
			s.internal(w, err)
			return
		}
		s.sync.EmitPageActivity(ctx, notify.PageEvent{Kind: notify.KindPageReplied, PublisherID: p.UserID, PageID: p.ID, TaskID: p.TaskID,
			Encrypted: true, At: time.Now().UnixMilli()})
		writeJSON(w, http.StatusCreated, map[string]any{"id": id, "pending": true})
		return
	}
	name, okName := guestName(in.Name)
	body := strings.TrimSpace(in.Body)
	switch {
	case !okName:
		writeError(w, http.StatusBadRequest, "invalid_input", "name: 1 to 40 characters on one line")
		return
	case body == "" || utf8.RuneCountInString(body) > 4000:
		writeError(w, http.StatusBadRequest, "invalid_input", "body: 1 to 4000 characters")
		return
	}
	if !s.pages.reply.allow(p.ID) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "this page received too many replies, try again later")
		return
	}
	id := ids.New()
	now := time.Now().UnixMilli()
	ts := s.opTS()
	fields := map[string]json.RawMessage{
		"task_id": mustJSON(p.TaskID), "author_id": mustJSON(p.UserID), "body": mustJSON(body), "parent_id": json.RawMessage("null"),
		"mentions": json.RawMessage("[]"), "created_at": mustJSON(now), "edited_at": json.RawMessage("null"), "deleted_at": json.RawMessage("null"),
		"guest_name": mustJSON(name), "page_id": mustJSON(p.ID),
	}
	device := opsync.PageDevice(p.ID)
	res, err := s.sync.ApplyStrict(ctx, p.UserID, deviceOps("comment", id, fields, ts, device))
	if err != nil {
		var rej *opsync.RejectedError
		if errors.As(err, &rej) && rej.Reason == opsync.ReasonRateLimited {
			writeError(w, http.StatusTooManyRequests, "rate_limited", "too many comments on this task, try again in a minute")
			return
		}
		s.log.Error("task page reply refused", "page", p.ID, "err", err)
		s.internal(w, err)
		return
	}
	if res.Applied > 0 {
		s.sync.NotifyApplied(res, device)
	}
	if err := s.auth.RecordTaskPageAction(ctx, p.ID, ts, name, true); err != nil {
		s.log.Warn("task page action", "err", err)
	}
	var title string
	_ = json.Unmarshal(rp.tp.Task["title"], &title)
	s.sync.EmitPageActivity(ctx, notify.PageEvent{Kind: notify.KindPageReplied, PublisherID: p.UserID, PageID: p.ID, TaskID: p.TaskID,
		TaskTitle: title, GuestName: name, At: now})
	writeJSON(w, http.StatusCreated, map[string]any{"id": id, "name": name, "guest": true, "body": body, "createdAt": now})
}

// PageReopenWindow is how long after completion a guest may reopen a task.
const PageReopenWindow = 24 * time.Hour

// handleTaskPageTick completes or reopens the published task or one of its
// subtasks, as ops by the publisher from the device page:<page-id>.
func (s *Server) handleTaskPageTick(w http.ResponseWriter, r *http.Request) {
	rp, ok := s.resolveTaskPage(w, r, s.pages.tick)
	if !ok {
		return
	}
	p := rp.page
	if p.Rights != "tick" {
		writeError(w, http.StatusForbidden, "forbidden", "this page does not allow ticking")
		return
	}
	var in struct {
		TaskID    string `json:"taskId"`
		Completed *bool  `json:"completed"`
		Name      string `json:"name"`
	}
	if err := readJSON(r, &in); err != nil || in.TaskID == "" || in.Completed == nil {
		badBodyWith(w, err, "invalid_input", "taskId and completed are required")
		return
	}
	name, okName := guestName(in.Name)
	if !okName && !rp.encrypted {
		writeError(w, http.StatusBadRequest, "invalid_input", "name: 1 to 40 characters on one line")
		return
	}
	if rp.encrypted {
		name = "" // the name is content; an encrypted page keeps none on the server
	}
	task := rp.tp.Task
	if in.TaskID != p.TaskID {
		task = nil
		for _, st := range rp.tp.Subtasks {
			if idOf(st["id"]) == in.TaskID {
				task = st
			}
		}
	}
	if task == nil {
		writeError(w, http.StatusNotFound, "not_found", "no such task on this page")
		return
	}
	now := time.Now()
	if !*in.Completed {
		var done int64
		_ = json.Unmarshal(task["completed_at"], &done)
		if done > 0 && now.Sub(time.UnixMilli(done)) > PageReopenWindow {
			writeError(w, http.StatusForbidden, "forbidden", "a task completed more than 24 hours ago cannot be reopened from the page")
			return
		}
	}
	s.applyPageTick(w, r, rp, task, *in.Completed, name, now)
}

func (s *Server) applyPageTick(w http.ResponseWriter, r *http.Request, rp resolvedPage, task opsync.Entity, completed bool, name string, now time.Time) {
	ctx := r.Context()
	p := rp.page
	taskID := idOf(task["id"])
	// A guest completed it: completed_by stays null, as for a public link.
	body := map[string]json.RawMessage{"completed_at": json.RawMessage("null"), "completed_by": json.RawMessage("null")}
	if completed {
		body["completed_at"] = mustJSON(now.UnixMilli())
	}
	ts := s.opTS()
	device := opsync.PageDevice(p.ID)
	var ops []opsync.Op
	if completed {
		recordID, record, ok, err := s.recurringCompletion(ctx, p.UserID, taskID, body, task, localToday(now))
		if err != nil {
			s.internal(w, err)
			return
		}
		if ok {
			ops = append(ops, deviceOps("task", recordID, record, ts, device)...)
		}
	}
	ops = append(ops, deviceOps("task", taskID, body, ts, device)...)
	res, err := s.sync.ApplyStrict(ctx, p.UserID, ops)
	if err != nil {
		s.log.Error("task page tick refused", "page", p.ID, "err", err)
		s.internal(w, err)
		return
	}
	if res.Applied > 0 {
		s.sync.NotifyApplied(res, device)
	}
	if err := s.auth.RecordTaskPageAction(ctx, p.ID, ts, name, false); err != nil {
		s.log.Warn("task page action", "err", err)
	}
	if taskID == p.TaskID {
		var title string
		if !rp.encrypted {
			_ = json.Unmarshal(rp.tp.Task["title"], &title)
		}
		s.sync.EmitPageActivity(ctx, notify.PageEvent{Kind: notify.KindPageCompleted, PublisherID: p.UserID, PageID: p.ID, TaskID: p.TaskID,
			TaskTitle: title, GuestName: name, Completed: completed, Encrypted: rp.encrypted, At: now.UnixMilli()})
	}
	got, err := s.sync.Get(ctx, p.UserID, "task", taskID)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"taskId": taskID, "completed_at": rawOrNull(got["completed_at"])})
}

// handleTaskPageFile downloads a file attached to a live page's task, always as
// a download, never rendered.
func (s *Server) handleTaskPageFile(w http.ResponseWriter, r *http.Request) {
	rp, ok := s.resolveTaskPage(w, r, s.pages.read)
	if !ok {
		return
	}
	var a opsync.Entity
	if !rp.encrypted {
		for _, x := range rp.tp.Attachments {
			if idOf(x["id"]) == r.PathValue("fileId") && string(x["encrypted"]) != "true" && isNullish(x["url"]) {
				a = x
			}
		}
	}
	if a == nil || isNullish(a["uploaded_at"]) || s.blobs == nil {
		writeError(w, http.StatusNotFound, "not_found", "no such file on this page")
		return
	}
	f, info, err := s.blobs.Open(idOf(a["id"]))
	if errors.Is(err, blobs.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "the file is not on this server")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	defer f.Close()
	h := w.Header()
	h.Set("Content-Type", "application/octet-stream")
	h.Set("Content-Disposition", "attachment; filename*=UTF-8''"+url.PathEscape(idOf(a["name"])))
	h.Set("Content-Security-Policy", "default-src 'none'; sandbox")
	h.Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(w, r, "", info.ModTime(), f)
}

// pageMap answers a page's map request after the cheap checks: a valid page
// that shows its map, on a server with maps on. Tiles do not re-read the task.
func (s *Server) pageMap(w http.ResponseWriter, r *http.Request) bool {
	publicHeaders(w)
	if !s.pages.addr.allow(clientIP(r)) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many requests, try again in a minute")
		return false
	}
	p, err := s.auth.LookupTaskPage(r.Context(), r.PathValue("secret"))
	if err != nil || !p.IncludeMap || p.PublisherDeactivated || !s.mapsAvailable(r.Context()) {
		writeError(w, http.StatusNotFound, "page_invalid", auth.ErrTaskPageInvalid.Error())
		return false
	}
	if !s.pages.maps.allow(p.ID) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "this page is used too often, try again later")
		return false
	}
	return true
}

func pageMapBody(w http.ResponseWriter, body []byte, contentType string) {
	w.Header().Set("Content-Type", contentType)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

func (s *Server) handleTaskPageMapStyle(w http.ResponseWriter, r *http.Request) {
	if !s.pageMap(w, r) {
		return
	}
	body, err := s.maps.Style(r.Context())
	if err != nil {
		s.mapError(w, err)
		return
	}
	// The style points at the signed-in proxy; a guest uses the page's own.
	prefix := "/api/v1/pages/" + r.PathValue("secret") + "/maps/"
	pageMapBody(w, bytes.ReplaceAll(body, []byte("/api/v1/maps/"), []byte(prefix)), "application/json")
}

func (s *Server) handleTaskPageMapTile(w http.ResponseWriter, r *http.Request) {
	if !s.pageMap(w, r) {
		return
	}
	z, errZ := strconv.Atoi(r.PathValue("z"))
	x, errX := strconv.Atoi(r.PathValue("x"))
	y, errY := strconv.Atoi(strings.TrimSuffix(r.PathValue("y"), ".pbf"))
	if errZ != nil || errX != nil || errY != nil {
		writeError(w, http.StatusNotFound, "not_found", "not found")
		return
	}
	body, _, err := s.maps.Tile(r.Context(), z, x, y)
	if err != nil {
		s.mapError(w, err)
		return
	}
	pageMapBody(w, body, "application/x-protobuf")
}

func (s *Server) handleTaskPageMapGlyphs(w http.ResponseWriter, r *http.Request) {
	if !s.pageMap(w, r) {
		return
	}
	body, _, err := s.maps.Glyphs(r.Context(), r.PathValue("fontstack"), strings.TrimSuffix(r.PathValue("range"), ".pbf"))
	if err != nil {
		s.mapError(w, err)
		return
	}
	pageMapBody(w, body, "application/x-protobuf")
}

func (s *Server) handleTaskPageMapSprite(w http.ResponseWriter, r *http.Request) {
	if !s.pageMap(w, r) {
		return
	}
	file := r.PathValue("file")
	body, _, err := s.maps.Sprite(r.Context(), file)
	if err != nil {
		s.mapError(w, err)
		return
	}
	ct := "application/json"
	if strings.HasSuffix(file, ".png") {
		ct = "image/png"
	}
	pageMapBody(w, body, ct)
}
