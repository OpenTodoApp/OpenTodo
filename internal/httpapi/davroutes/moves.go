package davroutes

import (
	"encoding/json"

	"github.com/OpenTodoApp/opentodo/internal/caldav"
	"github.com/OpenTodoApp/opentodo/internal/ids"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Moves and parents. A client moves a task by writing it into another
// calendar under the same UID: in place within one sharing scope, as a copy
// and a tombstone into another (copyMove). Subtasks follow their parent
// (OpenSpec change caldav-verified, "Subtask hierarchy with real clients"), as
// a move in the app does (planProjectChange in web/src/lib/ops.ts); both run
// on the whole view (a move loads it, writeView). A RELATED-TO naming a task
// of another calendar is kept as client data (parentWrite).

type opFunc func(entity, id, field string, value json.RawMessage, ts int64) opsync.Op

// descendants lists the live subtasks of a task at every depth, parents first.
func (v *davView) descendants(id string) []opsync.Entity {
	children := map[string][]opsync.Entity{}
	for _, t := range v.tasks {
		if pid := idOf(t["parent_id"]); pid != "" {
			children[pid] = append(children[pid], t)
		}
	}
	var out []opsync.Entity
	seen := map[string]bool{id: true}
	queue := []string{id}
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		for _, c := range children[cur] {
			cid := idOf(c["id"])
			if !seen[cid] {
				seen[cid] = true
				out = append(out, c)
				queue = append(queue, cid)
			}
		}
	}
	return out
}

// subtreeMove is the ops that take the subtasks of a task moving into calendar
// cal of the same sharing scope with it: the new project, and no section of
// the old one.
func (v *davView) subtreeMove(id, cal string, ts int64, op opFunc) []opsync.Op {
	project := projectValue(cal)
	var ops []opsync.Op
	for _, t := range v.descendants(id) {
		if opsync.SameJSON(t["project_id"], project) || (isNullish(t["project_id"]) && isNullish(project)) {
			continue
		}
		tid := idOf(t["id"])
		ops = append(ops, op("task", tid, "project_id", project, ts))
		if !isNullish(t["section_id"]) {
			ops = append(ops, op("task", tid, "section_id", json.RawMessage("null"), ts))
		}
	}
	return ops
}

// subtreeCopy is the ops that copy the subtasks of a task moving into calendar
// cal of another sharing scope under the task's copy newRoot, and tombstone
// the originals, as the task itself is (copyMove). It returns each original's
// copy. Assignees other than the user are cleared, as when a calendar is
// deleted, since the destination may not have them as members.
func (v *davView) subtreeCopy(root, newRoot, cal, self string, ts, now int64, op opFunc) (map[string]string, []opsync.Op) {
	subtree := v.descendants(root)
	copies := map[string]string{root: newRoot}
	for _, t := range subtree {
		copies[idOf(t["id"])] = ids.New()
	}
	var ops []opsync.Op
	for _, t := range subtree {
		old := idOf(t["id"])
		nid := copies[old]
		for field, val := range t {
			switch field {
			case "id":
				continue
			case "project_id":
				val = projectValue(cal)
			case "section_id", "deleted_at":
				val = json.RawMessage("null")
			case "parent_id":
				val = mustJSON(copies[idOf(val)])
			case "assignee_id":
				if idOf(val) != self {
					val = json.RawMessage("null")
				}
			case "workspace_id":
				if isInboxID(cal) {
					val = v.workspaceValue(cal)
				}
			}
			ops = append(ops, op("task", nid, field, val, ts))
		}
		ops = append(ops, op("task", old, "deleted_at", mustJSON(now), ts))
	}
	delete(copies, root)
	return copies, ops
}

// writeView reads what a PUT resolves into the request's view: the UIDs it
// names (its own, its parent's, its blockers') and the labels. The same UID in
// another calendar is the task the client moved here, which it returns. A
// move or a write to a repeating task reads the whole view: the subtasks that
// follow a move and the series a write plans against are anywhere in the
// account.
func (d *davRequest) writeView(v *davView, in *caldav.Inbound, existing opsync.Entity) (opsync.Entity, error) {
	if err := d.findUIDs(v, append([]string{in.UID, in.ParentUID}, in.DependsOn...)); err != nil {
		return nil, err
	}
	if err := d.labelsLoaded(v); err != nil {
		return nil, err
	}
	if existing == nil {
		if other := v.taskByUID(in.UID); other != nil && v.calendarOf(other) != "" {
			existing = other
		}
	}
	if existing == nil || (idOf(existing["recurrence"]) == "" && v.calendarOf(existing) == d.path.calendar) {
		return existing, nil
	}
	id := idOf(existing["id"])
	if _, err := d.load(); err != nil {
		return nil, err
	}
	return v.byID[id], nil
}

// parentWrite is the parent_id an inbound VTODO written into calendar cal
// writes, and the RELATED-TO line kept as client data for a parent not known
// yet (the client may upload it later, and the next PUT resolves it). A parent
// outside the app password's scope was never served and is kept (sync-scope).
// A parent in another calendar is kept as client data too (caldav-verified,
// "Subtask hierarchy with real clients"): a subtask lives in its parent's
// project, so the relation changes no parent_id, and the task keeps a parent
// it has in this calendar.
func (v *davView) parentWrite(in *caldav.Inbound, current opsync.Entity, cal string) (json.RawMessage, string) {
	if in.ParentUID != "" {
		p := v.taskByUID(in.ParentUID)
		if p != nil && v.calendarOf(p) == cal {
			return mustJSON(idOf(p["id"])), ""
		}
		line := caldav.Prop{Name: "RELATED-TO", Value: caldav.EscapeText(in.ParentUID)}.Line()
		if cp, ok := v.byID[idOf(current["parent_id"])]; p != nil && ok && v.calendarOf(cp) == cal {
			return current["parent_id"], line
		}
		return json.RawMessage("null"), line
	}
	if p, ok := v.byID[idOf(current["parent_id"])]; ok && !v.inView(p) {
		return current["parent_id"], ""
	}
	return json.RawMessage("null"), ""
}

// copyMove moves a task into a calendar with another sharing scope: a copy is
// created there under a new id (keeping the client's UID and resource name) and
// the original is tombstoned.
func (d *davRequest) copyMove(v *davView, cur opsync.Entity, in *caldav.Inbound) (string, error) {
	id := ids.New()
	ts := d.s.opTS()
	df, err := d.fields(v, in, nil, id, ts)
	if err != nil {
		return "", err
	}
	f, extraOps := df.f, df.pre
	f["project_id"] = projectValue(d.path.calendar)
	if isInboxID(d.path.calendar) {
		f["workspace_id"] = v.workspaceValue(d.path.calendar)
	}
	f["position"] = cur["position"]
	f["created_at"] = cur["created_at"]
	f["deleted_at"] = json.RawMessage("null")
	f["completed_at"] = json.RawMessage("null")
	if in.Completed {
		c := d.s.now().UnixMilli()
		if in.CompletedAt != nil {
			c = *in.CompletedAt
		}
		f["completed_at"] = mustJSON(c)
	}
	f["recurrence"] = cur["recurrence"]
	if in.RRULE == "" {
		f["recurrence"] = json.RawMessage("null")
	} else if in.Rule != "" && !opsync.SameJSON(mustJSON(in.Rule), cur["recurrence"]) {
		f["recurrence"] = mustJSON(in.Rule)
	}
	if isNullish(f["recurrence"]) {
		f["recurrence"] = json.RawMessage("null")
	}
	if est, ok := cur["estimate_minutes"]; ok && f["estimate_minutes"] == nil {
		f["estimate_minutes"] = est
	}
	ops := extraOps
	for field, val := range f {
		ops = append(ops, d.op("task", id, field, val, ts))
	}
	ops = append(ops, df.post...)
	ops = append(ops, d.op("task", idOf(cur["id"]), "deleted_at", mustJSON(d.s.now().UnixMilli()), ts))
	copies, subOps := v.subtreeCopy(idOf(cur["id"]), id, d.path.calendar, d.user.ID, ts, d.s.now().UnixMilli(), d.op)
	ops = append(ops, subOps...)
	if _, err := d.apply(ops); err != nil {
		return "", err
	}
	// The copies keep the names and UIDs the client knows them by.
	for old, nid := range copies {
		if err := d.recordName(nid, v.resourceName(old), v.uidOf(old)); err != nil {
			return "", err
		}
	}
	return id, d.recordName(id, d.path.name, in.UID)
}
