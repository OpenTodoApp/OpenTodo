// Package activity turns operations from the op log into human-readable,
// attributed events (OpenSpec change `comments-and-activity`, design D4). It is
// pure: the caller reads the ops (sync.Service.ActivityOps) and decides who may
// see them. web/src/lib/activity.ts implements the same rule; both test suites
// run testdata/activity_fixture.json so the two can never drift apart.
//
// The rule:
//
//  1. Only task, project and comment ops count; others are ignored, and so are
//     opaque document fields (Opaque: task.notes_doc, collaborative-rich-text),
//     whose readable projection (description) travels in the same batch.
//  2. Ops are ordered by (ts, device), keeping input (seq) order for ties, which
//     is the order last-writer-wins resolves them in.
//  3. Each op's old value is the previous value of the same field in that order
//     (or the caller's prior value, or null).
//  4. Ops by the same actor on the same entity whose ts is within Window of the
//     first op of that actor's open group for the entity join that group; any
//     other op opens a new group (and closes the previous one for that key).
//     A public link's ops (device public:…) group apart from the creator's own
//     and carry their device on the event (public-links D6).
//  5. A group becomes one event, classified by the fields it touched (see
//     classify). A group that changed nothing (every new value equals its old
//     value) and created nothing is dropped.
package activity

import (
	"bytes"
	"encoding/json"
	"sort"
	"strings"
)

// PublicDevicePrefix marks a public link's ops (mirrors sync.PublicDevicePrefix).
const PublicDevicePrefix = "public:"

// PageDevicePrefix marks a task page's guest ops (mirrors sync.PageDevicePrefix,
// OpenSpec task-pages D5); they group apart like a public link's.
const PageDevicePrefix = "page:"

// guestDevice reports a device whose ops form their own groups (a guest's).
func guestDevice(device string) bool {
	return strings.HasPrefix(device, PublicDevicePrefix) || strings.HasPrefix(device, PageDevicePrefix)
}

// Window folds quick consecutive ops by one actor on one entity into one event.
const Window = 5000 // ms

// Op is one operation as the activity rule needs it.
type Op struct {
	ID       string          `json:"id"`
	Seq      int64           `json:"seq,omitempty"`
	Actor    string          `json:"actor"`
	Entity   string          `json:"entity"`
	EntityID string          `json:"entityId"`
	Field    string          `json:"field"`
	Value    json.RawMessage `json:"value"`
	TS       int64           `json:"ts"`
	Device   string          `json:"device"`
}

// Change is one field's transition inside an event.
type Change struct {
	Field string          `json:"field"`
	From  json.RawMessage `json:"from"`
	To    json.RawMessage `json:"to"`
}

// Event is one attributed change. ID is the id of the group's first op, so a
// device that derived the same group locally recognises it. TaskID is the task
// itself for task events and the commented task for comment events. Changes are
// sorted by field and empty for comment events (the thread shows the comment).
type Event struct {
	ID       string   `json:"id"`
	Kind     string   `json:"kind"`
	Actor    string   `json:"actor"`
	Entity   string   `json:"entity"`
	EntityID string   `json:"entityId"`
	TaskID   string   `json:"taskId,omitempty"`
	TS       int64    `json:"ts"`
	OpIDs    []string `json:"opIds"`
	Changes  []Change `json:"changes"`
	// Device is set only for a public link's ticks (public:<link-id>,
	// OpenSpec `public-links` D6) and a task page's guest writes
	// (page:<page-id>, task-pages D5): those form their own groups and read
	// "Public link" or "<name> (guest, task page)" instead of the creator's name.
	Device string `json:"device,omitempty"`
}

// Event kinds.
const (
	KindCreated     = "created"
	KindCompleted   = "completed"
	KindReopened    = "reopened"
	KindDeleted     = "deleted"
	KindRestored    = "restored"
	KindRescheduled = "rescheduled"
	KindAssigned    = "assigned"
	KindUnassigned  = "unassigned"
	KindMoved       = "moved"
	// KindDependencies: the task's blocked_by list changed (task-dependencies D8).
	KindDependencies   = "dependencies"
	KindArchived       = "archived"
	KindUnarchived     = "unarchived"
	KindEdited         = "edited"
	KindCommented      = "commented"
	KindCommentEdited  = "comment_edited"
	KindCommentDeleted = "comment_deleted"
)

var counted = map[string]bool{"task": true, "project": true, "comment": true}

// Opaque lists "entity.field" pairs that never appear in events: encoded
// documents (internal/sync DocFields). Kept here because sync imports activity.
var Opaque = map[string]bool{"task.notes_doc": true, "project.notes_doc": true}

type group struct {
	ev      Event
	order   []string
	changes map[string]*Change
}

// Derive applies the rule to ops (given in seq order) and returns the events
// oldest first. prior optionally supplies old values keyed by Key.
func Derive(ops []Op, prior map[string]json.RawMessage) []Event {
	list := make([]Op, 0, len(ops))
	commentTask := map[string]string{}
	for _, op := range ops {
		if !counted[op.Entity] || Opaque[op.Entity+"."+op.Field] {
			continue
		}
		list = append(list, op)
		if op.Entity == "comment" && op.Field == "task_id" {
			var t string
			_ = json.Unmarshal(op.Value, &t)
			commentTask[op.EntityID] = t
		}
	}
	sort.SliceStable(list, func(i, j int) bool {
		if list[i].TS != list[j].TS {
			return list[i].TS < list[j].TS
		}
		return list[i].Device < list[j].Device
	})
	last := map[string]json.RawMessage{}
	open := map[string]*group{}
	var groups []*group
	for _, op := range list {
		fk := Key(op.Entity, op.EntityID, op.Field)
		from, ok := last[fk]
		if !ok {
			if from, ok = prior[fk]; !ok {
				from = json.RawMessage("null")
			}
		}
		last[fk] = op.Value
		gk := op.Actor + "\x00" + op.Entity + "\x00" + op.EntityID
		public := ""
		if guestDevice(op.Device) {
			public = op.Device
			gk += "\x00" + public
		}
		g := open[gk]
		if g == nil || op.TS-g.ev.TS > Window {
			g = &group{ev: Event{ID: op.ID, Actor: op.Actor, Entity: op.Entity, EntityID: op.EntityID, TS: op.TS, OpIDs: []string{}, Device: public}, changes: map[string]*Change{}}
			open[gk] = g
			groups = append(groups, g)
		}
		g.ev.OpIDs = append(g.ev.OpIDs, op.ID)
		c := g.changes[op.Field]
		if c == nil {
			c = &Change{Field: op.Field, From: compact(from)}
			g.changes[op.Field] = c
			g.order = append(g.order, op.Field)
		}
		c.To = compact(op.Value)
	}
	out := make([]Event, 0, len(groups))
	for _, g := range groups {
		ev, keep := finish(g, commentTask)
		if keep {
			out = append(out, ev)
		}
	}
	return out
}

// Key identifies a field of an entity for prior values.
func Key(entity, id, field string) string { return entity + ":" + id + ":" + field }

func finish(g *group, commentTask map[string]string) (Event, bool) {
	ev := g.ev
	fields := append([]string(nil), g.order...)
	sort.Strings(fields)
	changed := false
	for _, f := range fields {
		c := g.changes[f]
		if !bytes.Equal(c.From, c.To) {
			changed = true
		}
		ev.Changes = append(ev.Changes, *c)
	}
	has := func(f string) bool { return g.changes[f] != nil }
	isNull := func(f string) bool { return string(g.changes[f].To) == "null" }
	switch ev.Entity {
	case "comment":
		ev.TaskID = commentTask[ev.EntityID]
		switch {
		case has("created_at") || has("author_id") || has("task_id"):
			ev.Kind = KindCommented
		case has("deleted_at") && !isNull("deleted_at"):
			ev.Kind = KindCommentDeleted
		default:
			ev.Kind = KindCommentEdited
		}
		ev.Changes = []Change{}
	default:
		if ev.Entity == "task" {
			ev.TaskID = ev.EntityID
		}
		switch {
		case has("created_at"):
			ev.Kind = KindCreated
		case has("completed_at"):
			ev.Kind = pick(isNull("completed_at"), KindReopened, KindCompleted)
		case has("deleted_at"):
			ev.Kind = pick(isNull("deleted_at"), KindRestored, KindDeleted)
		case has("due"):
			ev.Kind = KindRescheduled
		case has("assignee_id"):
			ev.Kind = pick(isNull("assignee_id"), KindUnassigned, KindAssigned)
		case has("project_id"):
			ev.Kind = KindMoved
		case has("blocked_by"):
			ev.Kind = KindDependencies
		case has("archived"):
			ev.Kind = pick(string(g.changes["archived"].To) == "true", KindArchived, KindUnarchived)
		default:
			ev.Kind = KindEdited
		}
	}
	if !changed && ev.Kind != KindCreated && ev.Kind != KindCommented {
		return ev, false
	}
	return ev, true
}

func pick(cond bool, a, b string) string {
	if cond {
		return a
	}
	return b
}

func compact(v json.RawMessage) json.RawMessage {
	if len(v) == 0 {
		return json.RawMessage("null")
	}
	var buf bytes.Buffer
	if err := json.Compact(&buf, v); err != nil {
		return v
	}
	return buf.Bytes()
}

// Newest orders events newest first: by ts, then id, both descending.
func Newest(events []Event) {
	sort.SliceStable(events, func(i, j int) bool {
		if events[i].TS != events[j].TS {
			return events[i].TS > events[j].TS
		}
		return events[i].ID > events[j].ID
	})
}
