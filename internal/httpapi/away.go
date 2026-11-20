package httpapi

import (
	"encoding/json"
	"net/http"
	"time"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Away periods through the API (OpenSpec change away-periods, design D5):
// POST stores user_prefs.away and applies the period's skips (opsync.PlanAway,
// the port of the app's planAway) in one strict batch; DELETE clears the
// period and leaves the skips. Ordinary task writes: signed in, refused for
// read and agent tokens by the auth middleware and for tokens limited to
// workspaces (the period covers the whole account), not demo-denied.

func (s *Server) registerAwayRoutes(mux *routes) {
	mux.handle("POST /api/v1/away", signedIn, s.setAway)
	mux.handle("DELETE /api/v1/away", signedIn, s.endAway)
}

type awayInput struct {
	From           string   `json:"from"`
	To             string   `json:"to"`
	Projects       []string `json:"projects,omitempty"`
	Labels         []string `json:"labels,omitempty"`
	PauseReminders *bool    `json:"pauseReminders,omitempty"`
}

func validDay(s string) bool {
	d, err := time.Parse(time.DateOnly, s)
	return err == nil && d.Format(time.DateOnly) == s
}

func (s *Server) setAway(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := userFrom(ctx).ID
	var in awayInput
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	switch {
	case !validDay(in.From):
		writeError(w, http.StatusBadRequest, "invalid_input", "from must be a date (YYYY-MM-DD)")
		return
	case !validDay(in.To):
		writeError(w, http.StatusBadRequest, "invalid_input", "to must be a date (YYYY-MM-DD)")
		return
	case in.From > in.To:
		writeError(w, http.StatusBadRequest, "invalid_input", "from must not be after to")
		return
	case opsync.AwayDays(in.From, in.To) > opsync.MaxAwayDays:
		writeError(w, http.StatusBadRequest, "invalid_input", "to must be at most 90 days from from, both included")
		return
	}
	for _, ref := range []struct {
		entity string
		ids    []string
	}{{"project", in.Projects}, {"label", in.Labels}} {
		for _, id := range ref.ids {
			e, err := s.sync.Get(ctx, uid, ref.entity, id)
			if err != nil {
				s.internal(w, err)
				return
			}
			if e == nil || e.Deleted() {
				writeError(w, http.StatusNotFound, "not_found", ref.entity+" not found")
				return
			}
		}
	}
	away := opsync.Away{From: in.From, To: in.To, Quiet: in.PauseReminders == nil || *in.PauseReminders}
	tasks, err := s.sync.SeriesTasks(ctx, uid)
	if err != nil {
		s.internal(w, err)
		return
	}
	scope := opsync.AwayScope{All: len(in.Projects) == 0 && len(in.Labels) == 0, Projects: in.Projects, Labels: in.Labels}
	roles := map[string]bool{}
	canEdit := func(row opsync.Entity) bool {
		pid := idOf(row["project_id"])
		if pid == "" {
			return true
		}
		if ok, seen := roles[pid]; seen {
			return ok
		}
		_, _, role, err := s.sync.ProjectStatus(ctx, uid, pid)
		roles[pid] = err == nil && role != opsync.RoleViewer
		return roles[pid]
	}
	plan, err := opsync.PlanAway(tasks, scope, in.From, in.To, canEdit, s.now().UnixMilli(), localToday(s.now()))
	if err != nil {
		s.internal(w, err)
		return
	}
	ts := s.opTS()
	var ops []opsync.Op
	for _, wr := range plan.Writes {
		ops = append(ops, fieldOps("task", wr.ID, wr.Fields, ts)...)
		if wr.Series {
			rops, err := s.reminderOpsForTaskAs(ctx, uid, wr.ID, wr.Fields, ts, serverDevice)
			if err != nil {
				s.internal(w, err)
				return
			}
			ops = append(ops, rops...)
		}
	}
	ops = append(ops, fieldOps("user_prefs", "me", map[string]json.RawMessage{"away": mustJSON(away.String())}, ts)...)
	if _, ok := s.applyREST(w, ctx, uid, ops, "", nil); !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"away": away.String(), "skipped": plan.Occurrences})
}

func (s *Server) endAway(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	ops := fieldOps("user_prefs", "me", map[string]json.RawMessage{"away": mustJSON("")}, s.opTS())
	if _, ok := s.applyREST(w, ctx, userFrom(ctx).ID, ops, "", nil); !ok {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
