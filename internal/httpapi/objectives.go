package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/OpenTodoApp/opentodo/internal/sector"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Objectives (OpenSpec change plan-objectives, design D2 and D7) use the
// generic collection routes; this file holds what is particular to them: the
// list filters, the required fields of a create and the limit of open
// objectives per period, which only REST can refuse (sync converges instead).

// MaxOpenObjectives is the most open objectives one period holds.
const MaxOpenObjectives = 5

// objectivePeriod reads a period query value: a quarter or an ISO week.
func objectivePeriod(v string) bool {
	p, ok := sector.Parse(v)
	return ok && p.Kind != sector.Month
}

// filterObjectives applies ?period= and ?open=true to a listed collection of
// objectives. msg is a 400 message for an invalid filter.
func filterObjectives(r *http.Request, entity string, list []opsync.Entity) ([]opsync.Entity, string) {
	q := r.URL.Query()
	period, open := q.Get("period"), q.Get("open") == "true"
	if entity != "objective" || (period == "" && !open) {
		return list, ""
	}
	if period != "" && !objectivePeriod(period) {
		return nil, `period must be a quarter "YYYY-Qn" or an ISO week "YYYY-Www"`
	}
	kept := list[:0]
	for _, e := range list {
		if period != "" && entityString(e, "period") != period {
			continue
		}
		if open && (objectiveDone(e) || e.Deleted()) {
			continue
		}
		kept = append(kept, e)
	}
	return kept, ""
}

func objectiveDone(e opsync.Entity) bool {
	var at float64
	_ = json.Unmarshal(e["done_at"], &at)
	return at != 0
}

// objectiveWriteOK checks a create (existing nil) or a patch of an objective:
// a create needs a title and a period, and an objective may not be created
// in, or moved into, a period that already holds MaxOpenObjectives open ones
// (409 too_many_objectives). Value errors are left to the op validation, so
// REST and sync refuse the same values. It answers and returns false when the
// write is refused.
func (s *Server) objectiveWriteOK(ctx context.Context, w http.ResponseWriter, uid, id string, body map[string]json.RawMessage, existing opsync.Entity) bool {
	if existing == nil {
		for _, f := range []string{"title", "period"} {
			if _, has := body[f]; !has {
				writeError(w, http.StatusBadRequest, "invalid_input", "objective."+f+" is required")
				return false
			}
		}
	}
	raw, moves := body["period"]
	var period string
	if !moves || json.Unmarshal(raw, &period) != nil || !objectivePeriod(period) {
		return true
	}
	if existing != nil && (entityString(existing, "period") == period || objectiveDone(existing)) {
		return true
	}
	if done, has := body["done_at"]; has && string(done) != "0" {
		return true
	}
	list, err := s.sync.List(ctx, uid, "objective", false)
	if err != nil {
		s.internal(w, err)
		return false
	}
	open := 0
	for _, e := range list {
		if entityString(e, "id") != id && entityString(e, "period") == period && !objectiveDone(e) {
			open++
		}
	}
	if open >= MaxOpenObjectives {
		writeError(w, http.StatusConflict, "too_many_objectives",
			fmt.Sprintf("%s already has %d open objectives; finish or drop one first", period, MaxOpenObjectives))
		return false
	}
	return true
}
