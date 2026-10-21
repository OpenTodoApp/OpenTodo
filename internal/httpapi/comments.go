package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/activity"
	"github.com/pixari/opentodo/internal/ids"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Comment and activity routes (OpenSpec change `comments-and-activity`). All
// require authentication. Comment writes go through the op log (ApplyStrict), so
// the sync engine's authorship rules apply to REST and devices alike; a task or
// comment outside the caller's scopes answers the same 404 as an unknown one.
func (s *Server) registerCommentRoutes(mux *routes) {
	mux.handle("GET /api/v1/tasks/{id}/comments", signedIn, s.handleListComments)
	mux.handle("POST /api/v1/tasks/{id}/comments", signedIn, s.handleCreateComment)
	mux.handle("PATCH /api/v1/comments/{id}", signedIn, s.handlePatchComment)
	mux.handle("DELETE /api/v1/comments/{id}", signedIn, s.handleDeleteComment)
	mux.handle("GET /api/v1/tasks/{id}/activity", signedIn, s.activityHandler("task"))
	mux.handle("GET /api/v1/projects/{id}/activity", signedIn, s.activityHandler("project"))
	// Cross-project feed (OpenSpec change `activity-feed`).
	mux.handle("GET /api/v1/activity", signedIn, s.handleFeed)
}

func (s *Server) handleListComments(w http.ResponseWriter, r *http.Request) {
	list, err := s.sync.TaskComments(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"))
	if errors.Is(err, opsync.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "task not found")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"comments": list})
}

// commentInput is the body of POST and PATCH. Fields not listed are refused so a
// client cannot try to set author_id, task_id or the timestamps.
type commentInput struct {
	Body     *string         `json:"body"`
	ParentID json.RawMessage `json:"parent_id"`
	Mentions *[]string       `json:"mentions"`
}

func readCommentInput(r *http.Request, allowParent bool) (commentInput, string) {
	var raw map[string]json.RawMessage
	if err := readJSON(r, &raw); err != nil {
		return commentInput{}, err.Error()
	}
	var in commentInput
	for k, v := range raw {
		var err error
		switch {
		case k == "body":
			in.Body = new(string)
			err = json.Unmarshal(v, in.Body)
		case k == "mentions":
			in.Mentions = new([]string)
			err = json.Unmarshal(v, in.Mentions)
		case k == "parent_id" && allowParent:
			in.ParentID = v
		default:
			return in, fmt.Sprintf("comment.%s cannot be set here", k)
		}
		if err != nil {
			return in, fmt.Sprintf("comment.%s has the wrong type", k)
		}
	}
	if in.Body != nil && strings.TrimSpace(*in.Body) == "" {
		return in, "comment.body must not be empty"
	}
	return in, ""
}

func (s *Server) handleCreateComment(w http.ResponseWriter, r *http.Request) {
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
	in, msg := readCommentInput(r, true)
	if msg == "" && in.Body == nil {
		msg = "comment.body is required"
	}
	if msg != "" {
		writeError(w, http.StatusBadRequest, "invalid_input", msg)
		return
	}
	parent := json.RawMessage("null")
	if pid := idOf(in.ParentID); pid != "" {
		p, err := s.sync.Get(ctx, uid, "comment", pid)
		if err != nil {
			s.internal(w, err)
			return
		}
		if p == nil || idOf(p["task_id"]) != taskID {
			writeError(w, http.StatusBadRequest, "invalid_input", "comment.parent_id must be a comment on the same task")
			return
		}
		parent = json.RawMessage(opsync.QuoteJSON(pid))
	}
	mentions := []string{}
	if in.Mentions != nil {
		mentions = *in.Mentions
	}
	m, _ := json.Marshal(mentions)
	b, _ := json.Marshal(*in.Body)
	id := ids.New()
	now := time.Now().UnixMilli()
	body := map[string]json.RawMessage{
		"task_id": json.RawMessage(opsync.QuoteJSON(taskID)), "author_id": json.RawMessage(opsync.QuoteJSON(uid)),
		"body": b, "parent_id": parent, "mentions": m, "created_at": json.RawMessage(strconv.FormatInt(now, 10)),
		"edited_at": json.RawMessage("null"), "deleted_at": json.RawMessage("null"),
	}
	s.writeComment(w, r, id, body, http.StatusCreated)
}

// existingComment loads a live comment the caller can see, answering 404 otherwise.
func (s *Server) existingComment(w http.ResponseWriter, r *http.Request) (opsync.Entity, bool) {
	c, err := s.sync.Get(r.Context(), userFrom(r.Context()).ID, "comment", r.PathValue("id"))
	if err != nil {
		s.internal(w, err)
		return nil, false
	}
	if c == nil || c.Deleted() {
		writeError(w, http.StatusNotFound, "not_found", "comment not found")
		return nil, false
	}
	return c, true
}

func (s *Server) handlePatchComment(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.existingComment(w, r); !ok {
		return
	}
	in, msg := readCommentInput(r, false)
	if msg == "" && in.Body == nil && in.Mentions == nil {
		msg = "nothing to change: send body and/or mentions"
	}
	if msg != "" {
		writeError(w, http.StatusBadRequest, "invalid_input", msg)
		return
	}
	body := map[string]json.RawMessage{"edited_at": json.RawMessage(strconv.FormatInt(time.Now().UnixMilli(), 10))}
	if in.Body != nil {
		body["body"], _ = json.Marshal(*in.Body)
	}
	if in.Mentions != nil {
		body["mentions"], _ = json.Marshal(*in.Mentions)
	}
	s.writeComment(w, r, r.PathValue("id"), body, http.StatusOK)
}

func (s *Server) handleDeleteComment(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.existingComment(w, r); !ok {
		return
	}
	body := map[string]json.RawMessage{"deleted_at": json.RawMessage(strconv.FormatInt(time.Now().UnixMilli(), 10))}
	s.writeComment(w, r, r.PathValue("id"), body, http.StatusNoContent)
}

// writeComment applies comment fields as one strict batch and answers with the
// stored comment (or no content).
func (s *Server) writeComment(w http.ResponseWriter, r *http.Request, id string, body map[string]json.RawMessage, status int) {
	ctx := r.Context()
	uid := userFrom(ctx).ID
	res, err := s.sync.ApplyStrict(ctx, uid, fieldOps("comment", id, body, s.opTS()))
	if err != nil {
		var rej *opsync.RejectedError
		switch {
		case writeLimited(w, err):
		case errors.Is(err, opsync.ErrInvalidOp):
			writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
		case errors.As(err, &rej) && rej.Reason == opsync.ReasonRateLimited:
			writeError(w, http.StatusTooManyRequests, "rate_limited", "too many comments, try again in a minute")
		case errors.As(err, &rej):
			writeError(w, http.StatusForbidden, "forbidden", "only the author can edit a comment; the author, project admins and the owner can delete it")
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
	c, err := s.sync.Get(ctx, uid, "comment", id)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, status, c)
}

// ---- activity ----

// ActivityPageSize is the default page size of the activity routes; 200 is the maximum.
const (
	ActivityPageSize    = 50
	ActivityMaxPageSize = 200
)

// apiEvent is an activity event plus display names resolved by the server.
// ProjectID and ProjectName are set by the feed route (activity-feed) only.
type apiEvent struct {
	activity.Event
	ActorName   string `json:"actorName,omitempty"`
	TaskTitle   string `json:"taskTitle,omitempty"`
	ProjectID   string `json:"projectId,omitempty"`
	ProjectName string `json:"projectName,omitempty"`
}

// activityLimit reads the optional limit parameter of the activity routes; ok
// is false after it wrote the 400.
func activityLimit(w http.ResponseWriter, r *http.Request) (int, bool) {
	v := r.URL.Query().Get("limit")
	if v == "" {
		return ActivityPageSize, true
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 1 || n > ActivityMaxPageSize {
		writeError(w, http.StatusBadRequest, "invalid_input", "limit must be an integer from 1 to "+strconv.Itoa(ActivityMaxPageSize))
		return 0, false
	}
	return n, true
}

func toActivityOps(ops []opsync.Op) []activity.Op {
	in := make([]activity.Op, len(ops))
	for i, o := range ops {
		in[i] = activity.Op{ID: o.ID, Seq: o.Seq, Actor: o.Actor, Entity: o.Entity, EntityID: o.EntityID, Field: o.Field, Value: o.Value, TS: o.TS, Device: o.Device}
	}
	return in
}

// labelEvents resolves actor names and task titles for one page of events.
func (s *Server) labelEvents(ctx context.Context, uid string, page []activity.Event) []apiEvent {
	actors := make([]string, 0, len(page))
	for _, e := range page {
		actors = append(actors, e.Actor)
	}
	names := s.sync.UserNames(ctx, actors)
	titles := map[string]string{}
	public := s.publicLabeler(uid)
	out := make([]apiEvent, len(page))
	for i, e := range page {
		out[i] = apiEvent{Event: e, ActorName: names[e.Actor]}
		if l := public.label(ctx, e.Device, e.TS); l != "" {
			out[i].ActorName = l
		}
		if e.TaskID == "" {
			continue
		}
		title, seen := titles[e.TaskID]
		if !seen {
			if t, err := s.sync.Get(ctx, uid, "task", e.TaskID); err == nil && t != nil {
				_ = json.Unmarshal(t["title"], &title)
			}
			titles[e.TaskID] = title
		}
		out[i].TaskTitle = title
	}
	return out
}

func (s *Server) activityHandler(entity string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		uid := userFrom(ctx).ID
		limit, ok := activityLimit(w, r)
		if !ok {
			return
		}
		ops, err := s.sync.ActivityOps(ctx, uid, entity, r.PathValue("id"))
		if errors.Is(err, opsync.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", entity+" not found")
			return
		}
		if err != nil {
			s.internal(w, err)
			return
		}
		events := activity.Derive(toActivityOps(ops), nil)
		activity.Newest(events)
		page, next, err := activity.Page(events, r.URL.Query().Get("before"), limit)
		if errors.Is(err, activity.ErrBadCursor) {
			writeError(w, http.StatusBadRequest, "invalid_input", "before must be a cursor returned by this route")
			return
		}
		out := s.labelEvents(ctx, uid, page)
		resp := map[string]any{"events": out, "more": next != ""}
		if next != "" {
			resp["cursor"] = next
		}
		writeJSON(w, http.StatusOK, resp)
	}
}
