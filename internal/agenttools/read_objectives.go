package agenttools

import (
	"context"
	"sort"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/sector"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// ---- list_objectives (OpenSpec change plan-objectives, design D7) ----
//
// An objective is one short line the user pins to a quarter or an ISO week. An
// assistant reads them for context; there is no write tool for objectives.

func init() {
	register(tool{
		def: readDef("list_objectives", "List objectives",
			"List the user's quarterly and weekly objectives: a few short lines the user pins to a quarter (2026-Q4) or an ISO week (2026-W44) "+
				"while planning, open and done. Default: the current quarter's and the current week's in timezone, weeks from Monday. "+
				"An objective has no tasks, progress or owner; it is context for planning.",
			object(nil, map[string]any{
				"period":   map[string]any{"type": "string", "description": "Only this period: a quarter YYYY-Qn or an ISO week YYYY-Www (months are not objective periods)."},
				"timezone": timezoneProp,
			})),
		read: (*Registry).listObjectives,
	})
}

// objectiveText is an objective's user-written text; Title is nil when this
// server cannot read it (an encrypted account without a relay device).
type objectiveText struct {
	Title *string `json:"title"`
}

type objectiveOut struct {
	ID        string        `json:"id"`
	Untrusted objectiveText `json:"untrusted_text"`
	Period    string        `json:"period"`
	Position  float64       `json:"position"`
	Done      bool          `json:"done"`
	DoneAt    *string       `json:"done_at"`
	Encrypted bool          `json:"encrypted,omitempty"`
}

// objectivesOut lists the live objectives of the given periods, quarters first,
// then by period and position.
func (r *Registry) objectivesOut(ctx context.Context, userID string, periods ...string) ([]objectiveOut, error) {
	rows, err := r.list(ctx, userID, "objective", false)
	if err != nil {
		return nil, err
	}
	want := map[string]bool{}
	for _, p := range periods {
		want[p] = true
	}
	out := []objectiveOut{}
	for _, e := range rows {
		period := rawStr(e, "period")
		if !want[period] {
			continue
		}
		out = append(out, objectiveRow(e, period))
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Period != out[j].Period {
			qi, qj := len(out[i].Period) == 7 && out[i].Period[5] == 'Q', len(out[j].Period) == 7 && out[j].Period[5] == 'Q'
			if qi != qj {
				return qi
			}
			return out[i].Period < out[j].Period
		}
		return out[i].Position < out[j].Position
	})
	return out, nil
}

func objectiveRow(e opsync.Entity, period string) objectiveOut {
	o := objectiveOut{ID: rawStr(e, "id"), Period: period, Position: num(e, "position")}
	if title := rawStr(e, "title"); e2ee.IsCiphertext(title) {
		o.Encrypted = true
	} else {
		o.Untrusted.Title = &title
	}
	if at := num(e, "done_at"); at != 0 {
		o.Done = true
		o.DoneAt = isoTime(at)
	}
	return o
}

// currentObjectivePeriods are this quarter and this ISO week (Monday weeks) on
// the local date of loc.
func (r *Registry) currentObjectivePeriods(loc *time.Location) []string {
	cur := sector.Current(r.now().In(loc).Format(time.DateOnly), 1)
	return []string{cur["this-quarter"], cur["this-week"]}
}

func (r *Registry) listObjectives(ctx context.Context, userID string, a args) (map[string]any, error) {
	period, err := a.str("period")
	if err != nil {
		return nil, err
	}
	loc, err := a.location()
	if err != nil {
		return nil, err
	}
	periods := r.currentObjectivePeriods(loc)
	if period != "" {
		if p, ok := sector.Parse(period); !ok || p.Kind == sector.Month {
			return nil, argErr(`period: must be a quarter YYYY-Qn or an ISO week YYYY-Www`)
		}
		periods = []string{period}
	}
	list, err := r.objectivesOut(ctx, userID, periods...)
	if err != nil {
		return nil, err
	}
	return map[string]any{"objectives": list, "periods": periods, "timezone": loc.String(), "server_time": r.serverTime()}, nil
}

// ObjectivesResource is opentodo://objectives (plan-objectives D7): this
// quarter's and this week's objectives in UTC, read-only, titles as untrusted
// text (null with encrypted: true when unreadable).
func (r *Registry) ObjectivesResource(ctx context.Context, userID string) (map[string]any, error) {
	periods := r.currentObjectivePeriods(time.UTC)
	list, err := r.objectivesOut(ctx, userID, periods...)
	if err != nil {
		return nil, err
	}
	return noticed(map[string]any{"objectives": list, "periods": periods}), nil
}
