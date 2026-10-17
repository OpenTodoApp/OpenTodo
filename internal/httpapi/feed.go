package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"math"
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
	page, next, projectOf, err := s.feedPage(ctx, uid, q.Get("project"), q.Get("actor"), kind, cursor, limit)
	if errors.Is(err, activity.ErrBadCursor) {
		writeError(w, http.StatusBadRequest, "invalid_input", "cursor must be a cursor returned by this route")
		return
	}
	if err != nil {
		s.internal(w, err)
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

// feedPage computes one page of the feed (server-query-costs): it reads the
// entities of the user's shared projects newest first, a few more each round,
// until the events known for certain (those at or after the reader's bound)
// fill the page and show whether another follows. The result is the page that
// deriving every project's whole history would give.
func (s *Server) feedPage(ctx context.Context, uid, projectID, actor, kind, cursor string, limit int) ([]activity.Event, string, map[string]string, error) {
	upTo, curTS, curID := int64(math.MaxInt64), int64(0), ""
	if cursor != "" {
		var err error
		if curTS, curID, err = activity.ParseCursor(cursor); err != nil {
			return nil, "", nil, err
		}
		// An event at or before the cursor starts at an op at or before it.
		upTo = curTS
	}
	reader, err := s.sync.FeedReader(ctx, uid, projectID, upTo)
	if err != nil {
		return nil, "", nil, err
	}
	projectOf := map[string]string{}
	var events []activity.Event
	for n := limit + 1; ; n *= 2 {
		byProject, bound, done, err := reader.Next(ctx, n)
		if err != nil {
			return nil, "", nil, err
		}
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
		if done {
			break
		}
		known := 0
		for _, e := range events {
			if e.TS >= bound && (cursor == "" || activity.Before(e, curTS, curID)) {
				known++
			}
		}
		// More than a page of certain events after the cursor: the page and
		// whether another follows are all among them (they sort first).
		if known > limit {
			break
		}
	}
	activity.Newest(events)
	page, next, err := activity.Page(events, cursor, limit)
	return page, next, projectOf, err
}
