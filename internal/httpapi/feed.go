package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/pixari/opentodo/internal/activity"
)

// handleFeed serves GET /api/v1/activity (OpenSpec change `activity-feed`,
// design D4): events across every shared project the caller is a member of,
// newest first, paged by the same (ts, id) cursor as the per-project route.
// Each project's ops are derived on their own, exactly as the project route
// does, so an event has the same id, fold and kind in both. Optional filters:
// project (an id; a project the caller is not a member of yields no events),
// actor (an account id) and kind (a feed category, see activity.FeedKinds).
// The cursor is read from `cursor`, or `before` like the other activity routes.
func (s *Server) handleFeed(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := userFrom(ctx).ID
	q := r.URL.Query()
	limit, ok := activityLimit(w, r)
	if !ok {
		return
	}
	kind := q.Get("kind")
	if kind != "" && !activity.KnownFeedKind(kind) {
		writeError(w, http.StatusBadRequest, "invalid_input", "kind must be one of completed, created, commented, assigned, rescheduled, other")
		return
	}
	cursor := q.Get("cursor")
	if cursor == "" {
		cursor = q.Get("before")
	}
	byProject, err := s.sync.FeedOps(ctx, uid, q.Get("project"))
	if err != nil {
		s.internal(w, err)
		return
	}
	actor := q.Get("actor")
	projectOf := map[string]string{}
	var events []activity.Event
	for pid, ops := range byProject {
		for _, e := range activity.Derive(toActivityOps(ops), nil) {
			if actor != "" && e.Actor != actor {
				continue
			}
			if kind != "" && activity.FeedKindOf(e.Kind) != kind {
				continue
			}
			projectOf[e.ID] = pid
			events = append(events, e)
		}
	}
	activity.Newest(events)
	page, next, err := activity.Page(events, cursor, limit)
	if errors.Is(err, activity.ErrBadCursor) {
		writeError(w, http.StatusBadRequest, "invalid_input", "cursor must be a cursor returned by this route")
		return
	}
	out := s.labelEvents(ctx, uid, page)
	names := map[string]string{}
	for i := range out {
		pid := projectOf[out[i].ID]
		name, seen := names[pid]
		if !seen {
			if p, err := s.sync.Get(ctx, uid, "project", pid); err == nil && p != nil {
				_ = json.Unmarshal(p["name"], &name)
			}
			names[pid] = name
		}
		out[i].ProjectID, out[i].ProjectName = pid, name
	}
	resp := map[string]any{"events": out, "more": next != ""}
	if next != "" {
		resp["cursor"] = next
	}
	writeJSON(w, http.StatusOK, resp)
}
