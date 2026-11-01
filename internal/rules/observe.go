package rules

import (
	"context"
	"slices"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/ruleval"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
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
			if strings.HasPrefix(c.ScopeID, "project:") {
				e.forgetAll()
			} else {
				e.forget(c.UserID)
			}
			e.observeRule(ctx, c)
		}
	}
	if !e.on(ctx) || isUndo(ctx) {
		return
	}
	depth := depthOf(ctx)
	var events []Event
	for _, c := range changes {
		if c.Entity != "task" || c.Origin == importDevice || c.UserID == "" {
			continue
		}
		// A shared project's routines fire on any member's batch (routines-shared D3).
		events = append(events, e.sharedEvents(ctx, c, depth)...)
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
	if e.wake != nil {
		e.wake()
	}
}

// Derive lists the task events of one change (spec "Event triggers"); the
// author and depth are filled in by Observe.
func Derive(c opsync.Change) []Event {
	var out []Event
	ev := func(kind string) Event { return Event{TaskID: c.EntityID, Kind: kind} }
	if f, ok := c.Fields["created_at"]; ok && opsync.IsNull(f.From) && !opsync.IsNull(f.To) {
		out = append(out, ev(ruleval.TaskCreated))
	}
	if f, ok := c.Fields["completed_at"]; ok {
		switch {
		case opsync.IsNull(f.From) && !opsync.IsNull(f.To):
			out = append(out, ev(ruleval.TaskCompleted))
		case !opsync.IsNull(f.From) && opsync.IsNull(f.To):
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
