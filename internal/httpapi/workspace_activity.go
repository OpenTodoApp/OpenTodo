package httpapi

import (
	"math"
	"net/http"
	"strconv"
	"strings"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// handleWorkspaceActivity serves GET /api/v1/workspaces/{id}/activity (OpenSpec
// change workspace-activity, design D2): the events of the workspace's
// projects and Inbox in scopes the caller belongs to (shared projects they are
// a member of and their own data, never another member's), every actor's,
// newest first, paged like the feed. Optional filters: from and to (Unix ms,
// inclusive), kind (feed categories, comma-separated), project (project ids,
// comma-separated) and actor. A workspace the caller does not belong to is the
// same 404 as an unknown one.
func (s *Server) handleWorkspaceActivity(w http.ResponseWriter, r *http.Request) {
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
	f := feedFilter{actor: q.Get("actor"), kinds: kinds, from: math.MinInt64, to: math.MaxInt64}
	for _, b := range []struct {
		name string
		dst  *int64
	}{{"from", &f.from}, {"to", &f.to}} {
		if v := q.Get(b.name); v != "" {
			n, err := strconv.ParseInt(v, 10, 64)
			if err != nil || n < 0 {
				writeError(w, http.StatusBadRequest, "invalid_input", b.name+" must be a time in Unix milliseconds")
				return
			}
			*b.dst = n
		}
	}
	if f.from > f.to {
		writeError(w, http.StatusBadRequest, "invalid_input", "from must not be after to")
		return
	}
	projects := map[string]bool{}
	for _, p := range strings.Split(q.Get("project"), ",") {
		if p = strings.TrimSpace(p); p != "" {
			projects[p] = true
		}
	}
	id := r.PathValue("id")
	open := func(upTo int64) (*opsync.FeedReader, error) {
		return s.sync.WorkspaceReader(ctx, uid, id, projects, f.from, upTo)
	}
	s.writeFeedPage(w, r, uid, open, f, limit)
}
