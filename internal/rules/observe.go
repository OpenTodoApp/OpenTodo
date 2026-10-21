package rules

import (
	"context"
	"slices"

	"github.com/pixari/opentodo/internal/ruleval"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// importDevice is the importer's device (internal/importer.Device): an import
// and its undo fire no rules (spec "Event triggers").
const importDevice = "import"

type depthKey struct{}

// withDepth marks a write as a rule's batch at chain depth d: the observer runs
// inside that write and gives the events it derives depth d (design D7).
func withDepth(ctx context.Context, d int) context.Context {
	return context.WithValue(ctx, depthKey{}, d)
}

func depthOf(ctx context.Context) int {
	if d, ok := ctx.Value(depthKey{}).(int); ok && d > 0 {
		return d
	}
	return 1
}

// Observe derives rule events from a committed batch's winning changes, for
// the batch author's enabled rules of a matching kind only (design D5). It only
// inserts rows; the worker runs them.
func (e *Engine) Observe(ctx context.Context, changes []opsync.Change) {
	if len(changes) == 0 {
		return
	}
	for _, c := range changes {
		if c.Entity == "rule" {
			e.forget(c.UserID)
			e.clearPauseOnEnable(ctx, c)
		}
	}
	if !e.on(ctx) {
		return
	}
	depth := depthOf(ctx)
	var events []Event
	for _, c := range changes {
		if c.Entity != "task" || c.Origin == importDevice || c.UserID == "" {
			continue
		}
		kinds := e.ruleKinds(ctx, c.UserID)
		if len(kinds) == 0 {
			continue
		}
		for _, ev := range Derive(c) {
			if kinds[ev.Kind] {
				ev.UserID, ev.Origin, ev.Depth = c.UserID, c.Origin, depth
				events = append(events, ev)
			}
		}
	}
	if len(events) == 0 {
		return
	}
	if err := e.Store.Enqueue(context.WithoutCancel(ctx), events); err != nil {
		e.Log.Error("rules: queue events", "err", err)
		return
	}
	select {
	case e.wake <- struct{}{}:
	default:
	}
}

// clearPauseOnEnable lifts the server's pause when the user turns a rule on,
// and starts its watermark at now so turning it on never fires for the past.
func (e *Engine) clearPauseOnEnable(ctx context.Context, c opsync.Change) {
	f, ok := c.Fields["enabled"]
	if !ok || string(f.To) != "true" {
		return
	}
	st, _, err := e.Store.State(ctx, c.EntityID)
	if err != nil {
		return
	}
	st.PausedReason, st.Refusals, st.Watermark = "", nil, e.now().UnixMilli()
	if err := e.Store.SaveState(context.WithoutCancel(ctx), c.EntityID, c.UserID, st); err != nil {
		e.Log.Error("rules: clear pause", "err", err)
	}
}

// Derive lists the task events of one change (spec "Event triggers"); the
// author and depth are filled in by Observe.
func Derive(c opsync.Change) []Event {
	var out []Event
	ev := func(kind string) Event { return Event{TaskID: c.EntityID, Kind: kind} }
	if f, ok := c.Fields["created_at"]; ok && isNull(f.From) && !isNull(f.To) {
		out = append(out, ev(ruleval.TaskCreated))
	}
	if f, ok := c.Fields["completed_at"]; ok {
		switch {
		case isNull(f.From) && !isNull(f.To):
			out = append(out, ev(ruleval.TaskCompleted))
		case !isNull(f.From) && isNull(f.To):
			out = append(out, ev(ruleval.TaskReopened))
		}
	}
	if f, ok := c.Fields["labels"]; ok {
		before, after := listOf(f.From), listOf(f.To)
		for _, id := range after {
			if !slices.Contains(before, id) {
				x := ev(ruleval.LabelAdded)
				x.LabelID = id
				out = append(out, x)
			}
		}
		for _, id := range before {
			if !slices.Contains(after, id) {
				x := ev(ruleval.LabelRemoved)
				x.LabelID = id
				out = append(out, x)
			}
		}
	}
	if f, ok := c.Fields["assignee_id"]; ok && strOf(f.To) != "" && strOf(f.To) == c.UserID {
		out = append(out, ev(ruleval.AssignedToMe))
	}
	_, project := c.Fields["project_id"]
	_, section := c.Fields["section_id"]
	if project || section {
		x := ev(ruleval.TaskMoved)
		if f, ok := c.Fields["project_id"]; ok {
			x.ProjectID = strOf(f.To)
		}
		if f, ok := c.Fields["section_id"]; ok {
			x.SectionID = strOf(f.To)
		}
		out = append(out, x)
	}
	return out
}
