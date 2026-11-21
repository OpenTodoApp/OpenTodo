package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/activity"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// handleFeed serves GET /api/v1/activity (OpenSpec change `activity-feed`,
// design D4): events across every shared project the caller is a member of,
// newest first, paged by the same (ts, id) cursor as the per-project route.
// Each project's ops are derived on their own, exactly as the project route
// does, so an event has the same id, fold and kind in both. Optional filters:
// project (an id; a project the caller is not a member of yields no events),
// actor (an account id) and kind (one or more feed categories, comma-separated,
// see activity.FeedKinds; workspace-activity D4).
// The cursor is read from `cursor`, or `before` like the other activity routes.
func (s *Server) handleFeed(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := userFrom(ctx).ID
	q := r.URL.Query()
	limit, ok := activityLimit(w, r)
	if !ok {
		return
	}
	kinds, ok := feedKinds(w, q.Get("kind"))
	if !ok {
		return
	}
	project := q.Get("project")
	open := func(upTo int64) (*opsync.FeedReader, error) { return s.sync.FeedReader(ctx, uid, project, upTo) }
	f := feedFilter{actor: q.Get("actor"), kinds: kinds, from: math.MinInt64, to: math.MaxInt64}
	s.writeFeedPage(w, r, uid, open, f, limit)
}

// feedFilter is what a feed page keeps: events by actor (when set), of a
// category in kinds (when not empty), from..to inclusive.
type feedFilter struct {
	actor    string
	kinds    map[string]bool
	from, to int64
}

func (f feedFilter) keeps(e activity.Event) bool {
	return (f.actor == "" || e.Actor == f.actor) && (len(f.kinds) == 0 || f.kinds[activity.FeedKindOf(e.Kind)]) &&
		e.TS >= f.from && e.TS <= f.to
}

// feedKinds parses a comma-separated list of feed categories (empty: all),
// answering 400 for an unknown one.
func feedKinds(w http.ResponseWriter, v string) (map[string]bool, bool) {
	out := map[string]bool{}
	for _, k := range strings.Split(v, ",") {
		if k = strings.TrimSpace(k); k == "" {
			continue
		}
		if !activity.KnownFeedKind(k) {
			writeError(w, http.StatusBadRequest, "invalid_input", "kind must be one or more of "+strings.Join(activity.FeedKinds, ", "))
			return nil, false
		}
		out[k] = true
	}
	return out, true
}

// writeFeedPage answers one page of a feed-shaped route, each event labelled
// with its project ("" and no name for the Inbox).
func (s *Server) writeFeedPage(w http.ResponseWriter, r *http.Request, uid string, open func(upTo int64) (*opsync.FeedReader, error), f feedFilter, limit int) {
	ctx := r.Context()
	cursor := r.URL.Query().Get("cursor")
	if cursor == "" {
		cursor = r.URL.Query().Get("before")
	}
	page, next, projectOf, err := feedPage(ctx, open, f, cursor, limit)
	if errors.Is(err, activity.ErrBadCursor) {
		writeError(w, http.StatusBadRequest, "invalid_input", "cursor must be a cursor returned by this route")
		return
	}
	if errors.Is(err, opsync.ErrNotFound) {
		// Only the workspace route's reader refuses: a workspace the caller
		// does not belong to, read before anything else.
		writeError(w, http.StatusNotFound, "not_found", "workspace not found")
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
		if !seen && pid != "" {
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

// feedPage computes one page of a feed (server-query-costs): it reads the
// reader's entities newest first, a few more each round, until the events
// known for certain (those at or after the reader's bound) fill the page and
// show whether another follows. The result is the page that deriving every
// project's whole history would give.
func feedPage(ctx context.Context, open func(upTo int64) (*opsync.FeedReader, error), f feedFilter, cursor string, limit int) ([]activity.Event, string, map[string]string, error) {
	upTo, curTS, curID := f.to, int64(0), ""
	if cursor != "" {
		var err error
		if curTS, curID, err = activity.ParseCursor(cursor); err != nil {
			return nil, "", nil, err
		}
		// An event at or before the cursor starts at an op at or before it.
		upTo = min(upTo, curTS)
	}
	reader, err := open(upTo)
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
				if !f.keeps(e) {
					continue
				}
				projectOf[e.ID] = pid
				events = append(events, e)
			}
		}
		// Every entity left has its latest op before bound: none before from
		// can add an event.
		if done || bound < f.from {
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
