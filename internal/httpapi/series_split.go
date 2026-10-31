package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"slices"
	"time"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Splitting a recurring task from one of its later occurrences (OpenSpec change
// series-split, design D8): "This and following" as the app does it, through
// the op log with ApplyStrict, answering the new series (the piece). An
// ordinary task write: signed in, refused for read and agent tokens by the auth
// middleware, not demo-denied. The planning is opsync.PlanSplit, the port of
// the app's planSplit.

func (s *Server) registerSplitRoutes(mux *routes) {
	mux.handle("POST /api/v1/tasks/{id}/split", signedIn, s.handleSplitTask)
}

// splitFixed are the task fields a split's changes may not set: the piece's
// identity, its state and its link (the route writes them).
var splitFixed = []string{"id", "series_id", "occurrence_date", "split_from", "completed_at", "completed_by", "skipped", "deleted_at", "created_at", "parent_id"}

type splitRequest struct {
	From    string                     `json:"from"`
	Changes map[string]json.RawMessage `json:"changes"`
}

func (s *Server) handleSplitTask(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid, id := userFrom(ctx).ID, r.PathValue("id")
	var req splitRequest
	if err := readJSON(r, &req); err != nil {
		badBody(w, err)
		return
	}
	if d, err := time.Parse(time.DateOnly, req.From); err != nil || d.Format(time.DateOnly) != req.From {
		writeError(w, http.StatusBadRequest, "invalid_input", "from must be a date (YYYY-MM-DD)")
		return
	}
	body := req.Changes
	if body == nil {
		body = map[string]json.RawMessage{}
	}
	if !s.splitChangesOK(w, r, body) {
		return
	}
	series, err := s.sync.Get(ctx, uid, "task", id)
	if err != nil {
		s.internal(w, err)
		return
	}
	if series == nil || series.Deleted() {
		writeError(w, http.StatusNotFound, "not_found", "task not found")
		return
	}
	tasks, err := s.sync.SeriesTasks(ctx, uid)
	if err != nil {
		s.internal(w, err)
		return
	}
	now := s.now().UnixMilli()
	plan, err := opsync.PlanSplit(id, series, req.From, body, tasks, now, localToday(s.now()))
	switch {
	case errors.Is(err, opsync.ErrNotRecurring):
		writeError(w, http.StatusBadRequest, "not_recurring", "the task is not an open recurring task")
		return
	case errors.Is(err, opsync.ErrNotAnOccurrence):
		writeError(w, http.StatusBadRequest, "not_an_occurrence", "from is not an occurrence of this task after its current one, or its rule repeats after completion")
		return
	case errors.Is(err, opsync.ErrInvalidSplitChange):
		writeError(w, http.StatusBadRequest, "invalid_input", "task.recurrence: the new series needs a rule that repeats on calendar dates")
		return
	case err != nil:
		s.internal(w, err)
		return
	}
	s.writeSplitPlan(w, r, id, plan, now)
}

// splitChangesOK checks a split's changes as a task edit: no fixed field, the
// day part paired, a known energy and references the caller can use.
func (s *Server) splitChangesOK(w http.ResponseWriter, r *http.Request, body map[string]json.RawMessage) bool {
	for _, f := range splitFixed {
		if _, has := body[f]; has {
			writeError(w, http.StatusBadRequest, "invalid_input", "task."+f+" cannot be set by a split")
			return false
		}
	}
	stripAnnotations("task", body)
	pairDayPart(body)
	if !energyOK(w, body) {
		return false
	}
	msg, err := s.checkReferences(r.Context(), userFrom(r.Context()).ID, "task", body)
	if err != nil {
		s.internal(w, err)
		return false
	}
	if msg != "" {
		writeError(w, http.StatusBadRequest, "invalid_input", msg)
		return false
	}
	return true
}

// writeSplitPlan writes the series' new rule, the piece with copies of the
// series' relative reminders, and the carried changes in one strict batch,
// answering the piece.
func (s *Server) writeSplitPlan(w http.ResponseWriter, r *http.Request, id string, plan opsync.SplitPlan, now int64) {
	ctx := r.Context()
	uid := userFrom(ctx).ID
	ts := s.opTS()
	ops := fieldOps("task", id, plan.Series, ts)
	ops = append(ops, fieldOps("task", plan.PieceID, plan.Piece, ts)...)
	rops, err := s.occurrenceReminderCopies(r, id, plan.PieceID, plan.Piece["due"], ts, now)
	if err != nil {
		s.internal(w, err)
		return
	}
	ops = append(ops, rops...)
	ids := make([]string, 0, len(plan.Carries))
	for rid := range plan.Carries {
		ids = append(ids, rid)
	}
	slices.Sort(ids)
	for _, rid := range ids {
		carry := plan.Carries[rid]
		ops = append(ops, fieldOps("task", rid, carry, ts)...)
		if _, moved := carry["due"]; moved {
			more, err := s.reminderOpsForTaskAs(ctx, uid, rid, carry, ts, serverDevice)
			if err != nil {
				s.internal(w, err)
				return
			}
			ops = append(ops, more...)
		}
	}
	s.writeOps(w, r, "task", plan.PieceID, ops, http.StatusOK, nil)
}
