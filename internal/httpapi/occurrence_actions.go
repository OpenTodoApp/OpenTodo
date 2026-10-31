package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/ids"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Acting on one occurrence of a recurring task (OpenSpec change
// series-exceptions, design D11): complete, skip, or move and edit one
// occurrence as the app does, through the op log with ApplyStrict, answering
// the occurrence record. Ordinary task writes: signed in, refused for read and
// agent tokens by the auth middleware, not demo-denied. The planning is
// opsync.PlanActOn, the port of the app's planActOn.

func (s *Server) registerOccurrenceActionRoutes(mux *routes) {
	mux.handle("POST /api/v1/tasks/{id}/occurrences/{date}/complete", signedIn, s.occurrenceAction("complete"))
	mux.handle("POST /api/v1/tasks/{id}/occurrences/{date}/skip", signedIn, s.occurrenceAction("skip"))
	mux.handle("PATCH /api/v1/tasks/{id}/occurrences/{date}", signedIn, s.occurrenceAction("edit"))
}

// occurrenceFixed are the fields a PATCH of one occurrence may not set: the
// record's identity, its rule and its state (complete and skip have routes).
var occurrenceFixed = []string{"id", "series_id", "occurrence_date", "recurrence", "completed_at", "completed_by", "skipped", "deleted_at", "created_at", "habit", "parent_id"}

func (s *Server) occurrenceAction(kind string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		uid, id, date := userFrom(ctx).ID, r.PathValue("id"), r.PathValue("date")
		if d, err := time.Parse(time.DateOnly, date); err != nil || d.Format(time.DateOnly) != date {
			writeError(w, http.StatusBadRequest, "invalid_input", "the occurrence date must be a date (YYYY-MM-DD)")
			return
		}
		body := map[string]json.RawMessage{}
		if r.ContentLength != 0 {
			if err := readJSON(r, &body); err != nil {
				badBody(w, err)
				return
			}
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
		now := s.now().UnixMilli()
		action := opsync.OccurrenceAction{Kind: kind}
		switch kind {
		case "edit":
			for _, f := range occurrenceFixed {
				if _, has := body[f]; has {
					writeError(w, http.StatusBadRequest, "invalid_input", "task."+f+" cannot be set on one occurrence")
					return
				}
			}
			if len(body) == 0 {
				writeError(w, http.StatusBadRequest, "bad_request", "no fields to update")
				return
			}
			stripAnnotations("task", body)
			pairDayPart(body)
			if !energyOK(w, body) {
				return
			}
			if msg, err := s.checkReferences(ctx, uid, "task", body); err != nil {
				s.internal(w, err)
				return
			} else if msg != "" {
				writeError(w, http.StatusBadRequest, "invalid_input", msg)
				return
			}
			if _, has := body["due"]; has {
				action.Kind = "move"
			}
			action.Patch = body
		default:
			if at, has := body["completed_at"]; has && !isNullish(at) {
				now = int64(numberOf(at))
			}
		}
		tasks, err := s.sync.SeriesTasks(ctx, uid)
		if err != nil {
			s.internal(w, err)
			return
		}
		plan, err := opsync.PlanActOn(id, series, date, action, tasks, now, localToday(s.now()))
		switch {
		case errors.Is(err, opsync.ErrNotRecurring):
			writeError(w, http.StatusBadRequest, "not_recurring", "the task is not an open recurring task")
			return
		case errors.Is(err, opsync.ErrNotAnOccurrence):
			writeError(w, http.StatusBadRequest, "not_an_occurrence", "the date is not an occurrence of this task from its current one on, or its rule repeats after completion")
			return
		case err != nil:
			s.internal(w, err)
			return
		}
		s.writeOccurrencePlan(w, r, id, plan, now)
	}
}

// writeOccurrencePlan applies the plan's writes in one strict batch and answers
// the record (the series when no record is written: a plain series' skip, or the
// end of the series).
func (s *Server) writeOccurrencePlan(w http.ResponseWriter, r *http.Request, id string, plan opsync.ActPlan, now int64) {
	ctx := r.Context()
	uid := userFrom(ctx).ID
	ts := s.opTS()
	var ops []opsync.Op
	answer := plan.RecordID
	if plan.EndSeries {
		ops = fieldOps("task", id, map[string]json.RawMessage{"completed_at": mustJSON(now)}, ts)
		answer = id
	}
	if plan.Record != nil {
		ops = append(ops, fieldOps("task", plan.RecordID, plan.Record, ts)...)
	}
	if plan.Series != nil {
		ops = append(ops, fieldOps("task", id, plan.Series, ts)...)
		rops, err := s.reminderOpsForTaskAs(ctx, uid, id, plan.Series, ts, serverDevice)
		if err != nil {
			s.internal(w, err)
			return
		}
		ops = append(ops, rops...)
	}
	if plan.Record != nil && plan.Existed {
		rops, err := s.reminderOpsForTaskAs(ctx, uid, plan.RecordID, plan.Record, ts, serverDevice)
		if err != nil {
			s.internal(w, err)
			return
		}
		ops = append(ops, rops...)
	}
	if plan.Open && !plan.Existed {
		rops, err := s.occurrenceReminderCopies(r, id, plan.RecordID, plan.Record["due"], ts, now)
		if err != nil {
			s.internal(w, err)
			return
		}
		ops = append(ops, rops...)
	}
	if answer == "" {
		answer = id
	}
	s.writeOps(w, r, "task", answer, ops, http.StatusOK, nil)
}

// occurrenceReminderCopies copy the caller's relative reminders of the series
// onto a materialised occurrence (design D7): ids derived from the record and
// the reminder (web copyReminders), fire_at from the record's own due.
func (s *Server) occurrenceReminderCopies(r *http.Request, seriesID, recordID string, dueRaw json.RawMessage, ts, now int64) ([]opsync.Op, error) {
	ctx := r.Context()
	uid := userFrom(ctx).ID
	list, err := s.sync.List(ctx, uid, "reminder", false)
	if err != nil {
		return nil, err
	}
	loc := s.tzLocation(ctx, uid)
	d := decodeDue(dueRaw)
	var ops []opsync.Op
	for _, rem := range list {
		if idOf(rem["task_id"]) != seriesID || (idOf(rem["kind"]) != "relative" && idOf(rem["kind"]) != "") {
			continue
		}
		copyID := ids.NameID("occurrence-reminder", recordID+":"+idOf(rem["id"]))
		fields := map[string]json.RawMessage{
			"task_id": mustJSON(recordID), "kind": mustJSON("relative"), "offset_minutes": rem["offset_minutes"],
			"fire_at": relativeFireAt(d, rem["offset_minutes"], loc), "delivered_at": json.RawMessage("null"),
			"dismissed_at": json.RawMessage("null"), "created_at": mustJSON(now), "deleted_at": json.RawMessage("null"),
		}
		if isNullish(fields["offset_minutes"]) {
			fields["offset_minutes"] = json.RawMessage("null")
		}
		ops = append(ops, fieldOps("reminder", copyID, fields, ts)...)
	}
	return ops, nil
}
