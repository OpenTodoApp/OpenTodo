package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/digest"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Away periods through the API (OpenSpec change away-periods, design D5):
// POST stores user_prefs.away and applies the period's skips (opsync.PlanAway,
// the port of the app's planAway) in strict batches of at most
// MaxOpsPerRequest ops each, the stored period in the last, so a period that
// fails part-way stores nothing and sending it again finishes it (a date with a
// record is never planned twice). DELETE clears the period and leaves the
// skips. Ordinary task writes: signed in, refused for read and agent tokens by
// the auth middleware and for tokens limited to workspaces (the period covers
// the whole account), and on a demo (demo.go).

// maxAwayOps bounds one period's changes: planning stops, and nothing is
// written, once the plan would pass it.
const maxAwayOps = 20 * opsync.MaxOpsPerRequest

func (s *Server) registerAwayRoutes(mux *routes) {
	mux.handle("POST /api/v1/away", signedIn.DemoDenied(), s.setAway)
	mux.handle("DELETE /api/v1/away", signedIn.DemoDenied(), s.endAway)
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
	plan, ok := s.planAway(w, r, uid, in)
	if !ok {
		return
	}
	batches, err := s.awayBatches(ctx, uid, plan, away)
	if err != nil {
		s.internal(w, err)
		return
	}
	for _, ops := range batches {
		if _, ok := s.applyREST(w, ctx, uid, ops, "", nil); !ok {
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"away": away.String(), "skipped": plan.Occurrences})
}

// planAway plans the period's skips over the user's series, on the user's own
// today, leaving out what is not theirs to move; false when it answered.
func (s *Server) planAway(w http.ResponseWriter, r *http.Request, uid string, in awayInput) (opsync.AwayPlan, bool) {
	ctx := r.Context()
	tasks, err := s.sync.SeriesTasks(ctx, uid)
	if err != nil {
		s.internal(w, err)
		return opsync.AwayPlan{}, false
	}
	scope := opsync.AwayScope{All: len(in.Projects) == 0 && len(in.Labels) == 0, Projects: in.Projects, Labels: in.Labels, Me: uid, Shared: map[string]bool{}}
	editable := map[string]bool{}
	for _, row := range tasks {
		pid := idOf(row["project_id"])
		if _, seen := editable[pid]; seen || pid == "" {
			continue
		}
		_, shared, role, err := s.sync.ProjectStatus(ctx, uid, pid)
		if err != nil {
			s.internal(w, err)
			return opsync.AwayPlan{}, false
		}
		editable[pid], scope.Shared[pid] = role != opsync.RoleViewer, shared
	}
	canEdit := func(row opsync.Entity) bool { pid := idOf(row["project_id"]); return pid == "" || editable[pid] }
	today, err := s.userToday(ctx, uid)
	if err != nil {
		s.internal(w, err)
		return opsync.AwayPlan{}, false
	}
	plan, err := opsync.PlanAway(tasks, scope, in.From, in.To, canEdit, s.now().UnixMilli(), today, maxAwayOps)
	if errors.Is(err, opsync.ErrAwayTooLarge) {
		writeError(w, http.StatusBadRequest, "too_large", fmt.Sprintf("the period would make more than %d changes; choose projects or labels, or a shorter period", maxAwayOps))
		return opsync.AwayPlan{}, false
	}
	if err != nil {
		s.internal(w, err)
		return opsync.AwayPlan{}, false
	}
	return plan, true
}

// userToday is the user's logical today in their own zone (the one reminders
// and digests read, tzLocation) and their start of day.
func (s *Server) userToday(ctx context.Context, uid string) (string, error) {
	prefs, err := s.sync.Get(ctx, uid, "user_prefs", "me")
	if err != nil {
		return "", err
	}
	start := ""
	if prefs != nil {
		start = opsync.StringOf(prefs["day_start"])
	}
	return digest.LogicalDay(s.now(), s.tzLocation(ctx, uid), digest.DayStart(start)), nil
}

// awayBatches is the plan's ops in batches of at most MaxOpsPerRequest, a
// task's fields and the reminders that follow them always in one batch, and the
// stored period at the end of the last.
func (s *Server) awayBatches(ctx context.Context, uid string, plan opsync.AwayPlan, away opsync.Away) ([][]opsync.Op, error) {
	ts := s.opTS()
	var batches [][]opsync.Op
	var cur []opsync.Op
	add := func(ops []opsync.Op) {
		if len(cur) > 0 && len(cur)+len(ops) > opsync.MaxOpsPerRequest {
			batches, cur = append(batches, cur), nil
		}
		cur = append(cur, ops...)
	}
	for _, wr := range plan.Writes {
		ops := fieldOps("task", wr.ID, wr.Fields, ts)
		if wr.Series {
			rops, err := s.reminderOpsForTaskAs(ctx, uid, wr.ID, wr.Fields, ts, serverDevice)
			if err != nil {
				return nil, err
			}
			ops = append(ops, rops...)
		}
		// Stamped here (completed_by), as ApplyStrict would, so the batch counts those ops too.
		add(opsync.StampCompletedBy(uid, ops))
	}
	add(fieldOps("user_prefs", "me", map[string]json.RawMessage{"away": mustJSON(away.String())}, ts))
	return append(batches, cur), nil
}

func (s *Server) endAway(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	ops := fieldOps("user_prefs", "me", map[string]json.RawMessage{"away": mustJSON("")}, s.opTS())
	if _, ok := s.applyREST(w, ctx, userFrom(ctx).ID, ops, "", nil); !ok {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
