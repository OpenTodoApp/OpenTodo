package rules

import (
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/agenttools"
	"github.com/OpenTodoApp/opentodo/internal/filter"
	"github.com/OpenTodoApp/opentodo/internal/ids"
	"github.com/OpenTodoApp/opentodo/internal/ruleval"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// The step kinds (design D4). Data steps call the pure functions of
// internal/ruleval; steps with a registry tool are planned through it.

func lit[T any](s *ruleval.Step, name string) (T, bool) {
	var v T
	a, ok := s.In[name]
	if !ok || a.IsRef() {
		return v, false
	}
	return v, json.Unmarshal(a.Lit, &v) == nil
}

func taskVal(id string) ruleval.Value { return ruleval.Value{Type: ruleval.TTask, ID: id} }

func tasksVal(list []string) ruleval.Value {
	if list == nil {
		list = []string{}
	}
	return ruleval.Value{Type: ruleval.TTasks, IDs: list}
}

func none() ruleval.Value { return ruleval.Value{Type: ruleval.TNone} }

// entityIn reads a task, task list or project input: a reference or a literal.
func (st *runState) entityIn(s *ruleval.Step, in map[string]ruleval.Value, name string) (ruleval.Value, bool) {
	if v, ok := in[name]; ok {
		if v.Type == ruleval.TTask && slices.Contains(inputDef(mustKind(s.Kind), name).Accepts, ruleval.TTasks) && !slices.Contains(inputDef(mustKind(s.Kind), name).Accepts, ruleval.TTask) {
			return tasksVal([]string{v.ID}), true
		}
		return v, true
	}
	if t, ok := lit[map[string]string](s, name); ok {
		if id := t["task"]; id != "" {
			return taskVal(id), true
		}
		if id := t["project"]; id != "" {
			return ruleval.Value{Type: ruleval.TProject, ID: id}, true
		}
	}
	return ruleval.Value{}, false
}

func mustKind(kind string) *ruleval.StepKind {
	k, _ := ruleval.StepKindOf(kind)
	return k
}

// liveTask reports a task the user can see that is not in the Trash.
func (st *runState) liveTask(id string) (opsync.Entity, bool) {
	t, ok := st.tasks[id]
	return t, ok && opsync.IsNull(t["deleted_at"])
}

func (st *runState) liveProject(id string) (opsync.Entity, bool) {
	p, ok := st.projects[id]
	return p, ok && opsync.IsNull(p["deleted_at"])
}

func (st *runState) exec(s *ruleval.Step, in map[string]ruleval.Value, at int) (ruleval.Value, string, error) {
	switch s.Kind {
	case "find_tasks":
		return st.findTasks(s)
	case "create_tasks":
		return st.createTasks(s, in, at)
	case "change_tasks":
		return st.changeTasks(s, in, at)
	case "add_comment":
		return st.addComment(s, in, at)
	case "project_of":
		return st.projectOf(s, in)
	case "date":
		return st.dateStep(s, in)
	case "get_task":
		v, _ := st.entityIn(s, in, "task")
		if _, ok := st.liveTask(v.ID); !ok {
			return none(), "", failf(ErrCodeNotFound, "task %s not found", v.ID)
		}
		return v, "", nil
	case "find_project":
		return st.findProject(s, in)
	case "create_project", "update_project", "create_sections", "create_labels", "favourite":
		return st.projectStep(s, in, at)
	case "note_text":
		return st.noteText(s, in)
	case "append_to_note":
		return st.appendNote(s, in, at)
	case "clear_note":
		return st.clearNote(s, in)
	case "set_focus":
		return st.setFocus(s, in)
	case "project_from_template":
		return st.projectFromTemplate(s, in, at)
	case "split_lines":
		text, _ := st.textIn(s, in, "text")
		split := ruleval.SplitLines
		if only, _ := lit[string](s, "only"); only == "open_checkboxes" {
			split = ruleval.SplitOpenCheckboxes
		}
		lines, cut := split(text)
		return ruleval.Value{Type: ruleval.TLines, Lines: lines}, truncatedIf(cut), nil
	case "join":
		lines := in["lines"].Lines
		if l, ok := lit[[]string](s, "lines"); ok {
			lines = l
		}
		sep, _ := lit[string](s, "separator")
		return st.textOut(ruleval.JoinLines(lines, sep))
	case "format":
		tmpl, _ := lit[string](s, "template")
		return st.textOut(st.format(tmpl))
	case "replace":
		text, _ := st.textIn(s, in, "text")
		find, _ := lit[string](s, "find")
		with, _ := lit[string](s, "with")
		matchCase, _ := lit[bool](s, "case")
		return st.textOut(ruleval.ReplaceText(text, find, with, matchCase))
	case "filter", "sort", "take", "count":
		return st.listStep(s, in)
	case "stop":
		return none(), "", errEnded
	case "start_timer", "stop_timer":
		return st.timerStep(s, in, at)
	case "tracked_time":
		return st.trackedTime(s, in)
	case "notify":
		return st.notifyStep(s, in)
	case "webhook":
		return st.webhookStep(s, in)
	case "ask_ai", "summarise":
		return st.aiStep(s, in, at)
	case "email_me":
		return st.emailStep(s, in)
	}
	return none(), "", failf(ErrCodeInvalid, "%s is not available on this server yet", s.Kind)
}

func truncatedIf(cut bool) string {
	if cut {
		return StepTruncated
	}
	return ""
}

func (st *runState) textOut(text string) (ruleval.Value, string, error) {
	out, cut := ruleval.CutText(text)
	return ruleval.Value{Type: ruleval.TText, Text: out}, truncatedIf(cut), nil
}

// openTasks lists the open, live tasks in list order (position, then id).
func (st *runState) openTasks() []opsync.Entity {
	return st.tasksWhere(func(t opsync.Entity) bool { return opsync.IsNull(t["completed_at"]) })
}

// liveTasks lists the live tasks, completed ones included, in list order.
func (st *runState) liveTasks() []opsync.Entity {
	return st.tasksWhere(func(opsync.Entity) bool { return true })
}

func (st *runState) tasksWhere(keep func(opsync.Entity) bool) []opsync.Entity {
	var out []opsync.Entity
	for _, t := range st.tasks {
		if opsync.IsNull(t["deleted_at"]) && keep(t) {
			out = append(out, t)
		}
	}
	slices.SortFunc(out, func(a, b opsync.Entity) int {
		pa, pb := num(a, "position"), num(b, "position")
		if pa != pb {
			if pa < pb {
				return -1
			}
			return 1
		}
		return strings.Compare(str(a, "id"), str(b, "id"))
	})
	return out
}

// projectScope maps each live project id to its archived flag, what
// ruleval.InFindScope reads (routines-find-scope D1).
func projectScope(projects map[string]opsync.Entity) map[string]bool {
	out := make(map[string]bool, len(projects))
	for id, p := range projects {
		if opsync.IsNull(p["deleted_at"]) {
			out[id] = boolOf(p, "archived")
		}
	}
	return out
}

func num(e opsync.Entity, f string) float64 {
	var n float64
	_ = json.Unmarshal(e[f], &n)
	return n
}

func (st *runState) matchCond(c *ruleval.Condition, t opsync.Entity) bool {
	ctx := ruleval.Context{UserID: st.w.uid, Today: st.w.today, Parent: st.w.parent, Open: func(id string) bool {
		x, ok := st.tasks[id]
		return ok && opsync.IsNull(x["completed_at"]) && opsync.IsNull(x["deleted_at"])
	}, Tracked: func(id string) int { return st.e.trackedMinutes(st.ctx, st.w)[id] },
		Changed: func(id string) string { return st.e.changedDates(st.ctx, st.w)[id] }}
	return ruleval.Matches(c, st.w.matchTask(t), ctx)
}

func (st *runState) findTasks(s *ruleval.Step) (ruleval.Value, string, error) {
	limit := ruleval.MaxListItems
	if n, ok := lit[float64](s, "limit"); ok && n >= 1 {
		limit = int(n)
	}
	var match func(opsync.Entity) bool
	if cond, ok := s.In["condition"]; ok {
		c, err := ruleval.ParseCondition(cond.Lit)
		if err != nil {
			return none(), "", failf(ErrCodeInvalid, "%s", err)
		}
		match = func(t opsync.Entity) bool { return st.matchCond(&c, t) }
	} else {
		m, err := st.queryMatcher(s)
		if err != nil {
			return none(), "", err
		}
		match = m
	}
	// A query or a view follows the filter rule: open tasks unless it names
	// completed or open (filter.Evaluate decides); a condition finds open
	// tasks (routines-dynamic-data D5).
	rows := st.openTasks()
	if _, cond := s.In["condition"]; !cond {
		rows = st.liveTasks()
	}
	// Tasks of projects in the Trash never, of archived projects only when
	// asked (routines-find-scope D1, D3).
	archived, _ := lit[bool](s, "archived")
	scope := projectScope(st.projects)
	var out []string
	status := ""
	for _, t := range rows {
		if !ruleval.InFindScope(false, str(t, "project_id"), scope, archived) || !match(t) {
			continue
		}
		if len(out) == limit {
			status = StepTruncated
			break
		}
		out = append(out, str(t, "id"))
	}
	return tasksVal(out), status, nil
}

// queryMatcher evaluates a filter query or a saved view's query (find_tasks)
// with internal/filter, the server's port of the device's evaluator.
func (st *runState) queryMatcher(s *ruleval.Step) (func(opsync.Entity) bool, error) {
	q, _ := lit[string](s, "query")
	if view, ok := lit[string](s, "view"); ok {
		v, err := st.e.Sync.Get(st.ctx, st.w.uid, "view", view)
		if err != nil || v == nil || v.Deleted() {
			return nil, failf(ErrCodeNotFound, "saved view %s not found", view)
		}
		q = str(v, "query")
	}
	if st.e.Query != nil {
		m, err := st.e.Query(st.ctx, st.w.uid, q, st.tasks)
		if err != nil {
			return nil, failf(ErrCodeInvalid, "%s", err)
		}
		return m, nil
	}
	c, err := st.filterContext()
	if err != nil {
		return nil, err
	}
	pred, _, err := filter.Evaluate(q, c)
	if err != nil {
		return nil, failf(ErrCodeInvalid, "%s", err)
	}
	return func(t opsync.Entity) bool { return pred(t) }, nil
}

// filterContext is what the filter evaluator reads, from the run's view.
func (st *runState) filterContext() (filter.Context, error) {
	ws := int(st.w.weekStart)
	c := filter.Context{Today: st.w.today, WeekStart: ws, Zone: time.FixedZone("", st.w.offset*60), DayStart: ruleval.DayStartMinutes(st.w.dayStart),
		Tracked: st.e.trackedMinutes(st.ctx, st.w)}
	for _, t := range st.tasks {
		c.Tasks = append(c.Tasks, t)
	}
	for _, p := range st.projects {
		c.Projects = append(c.Projects, p)
	}
	for entity, dst := range map[string]*[]filter.Row{"label": &c.Labels, "section": &c.Sections, "field": &c.Fields} {
		if st.w.project != "" && entity == "label" {
			continue // labels are personal (routines-shared D3)
		}
		rows, err := st.e.Sync.List(st.ctx, st.w.uid, entity, false)
		if err != nil {
			return c, err
		}
		for _, r := range rows {
			if st.w.project != "" && str(r, "project_id") != st.w.project {
				continue
			}
			*dst = append(*dst, r)
		}
	}
	return c, nil
}

// clientID derives a create tool's client_request_id from the run, the step
// and the item, so a resumed run plans the same ids.
func (st *runState) clientID(at int) string {
	return st.runID + ":" + strconv.Itoa(at) + ":" + strconv.Itoa(st.seq)
}

// tool plans a registry tool with the routine caller and lays its changes
// over the run's view.
func (st *runState) tool(name string, args map[string]any) (agenttools.Plan, error) {
	if st.e.Tools == nil {
		return agenttools.Plan{}, failf(ErrCodeInvalid, "%s is not available on this server", name)
	}
	b, _ := json.Marshal(args)
	p, err := st.e.Tools.Plan(st.ctx, st.caller, name, b, st.overlay)
	if err != nil {
		var te *agenttools.ToolError
		var ae *agenttools.ArgError
		switch {
		case errors.As(err, &te):
			code := te.Code
			if code == "" {
				code = ErrCodeInvalid
			}
			return p, failf(code, "%s", te.Message)
		case errors.As(err, &ae):
			return p, failf(ErrCodeInvalid, "%s", ae.Msg)
		}
		return p, err
	}
	st.lay(p.Changes...)
	return p, nil
}

// lay adds planned changes to the overlay and the run's view of the rows.
func (st *runState) lay(cs ...agenttools.Change) {
	for _, c := range cs {
		st.overlay = append(st.overlay, c)
		switch c.Entity {
		case "task":
			st.tasks[c.EntityID] = mergeRow(st.tasks[c.EntityID], c.EntityID, c.Patch)
		case "project":
			st.projects[c.EntityID] = mergeRow(st.projects[c.EntityID], c.EntityID, c.Patch)
		}
	}
}

func mergeRow(row opsync.Entity, id string, patch map[string]json.RawMessage) opsync.Entity {
	out := opsync.Entity{"id": raw(id)}
	for k, v := range row {
		out[k] = v
	}
	for k, v := range patch {
		out[k] = v
	}
	return out
}

func createdIDs(p agenttools.Plan, entity string) []string {
	var out []string
	for _, c := range p.Changes {
		if c.Entity == entity && c.Create {
			out = append(out, c.EntityID)
		}
	}
	return out
}

func (st *runState) createTasks(s *ruleval.Step, in map[string]ruleval.Value, at int) (ruleval.Value, string, error) {
	base := map[string]any{}
	if v, ok := st.entityIn(s, in, "project"); ok && v.ID != "" {
		base["project_id"] = v.ID
	}
	if v, ok := in["parent"]; ok {
		if _, live := st.liveTask(v.ID); !live {
			return none(), "", failf(ErrCodeNotFound, "task %s not found", v.ID)
		}
		base["parent_id"] = v.ID
	}
	if sec, ok := lit[string](s, "section"); ok {
		base["section_id"] = sec
	}
	if v, ok := in["due"]; ok {
		base["due"] = map[string]string{"date": v.Date}
	} else if a, ok := s.In["due"]; ok {
		if d, ok := ruleval.DateLiteral(a.Lit); ok {
			base["due"] = map[string]string{"date": d.Resolve(st.w.today)}
		}
	}
	if v, ok := in["priority"]; ok {
		base["priority"] = int(v.Number)
	} else if p, ok := lit[float64](s, "priority"); ok && p >= 1 {
		base["priority"] = int(p)
	}
	if l, ok := lit[[]string](s, "labels"); ok {
		base["labels"] = l
	}
	if e, ok := lit[string](s, "energy"); ok {
		base["energy"] = e
	}
	var lines []string
	parse := true
	if v, ok := in["text"]; ok && v.Type == ruleval.TLines {
		lines = v.Lines
	} else if text, ok := st.textIn(s, in, "text"); ok {
		lines, _ = ruleval.SplitLines(text)
	} else if title, ok := st.textIn(s, in, "title"); ok {
		lines, parse = []string{title}, false
	}
	var items []map[string]any
	for _, line := range lines {
		item := map[string]any{}
		for k, v := range base {
			item[k] = v
		}
		if parse {
			st.quickAdd(line, item)
		} else {
			item["title"] = line
		}
		if st.w.project != "" {
			// A shared routine creates in its project, without labels (routines-shared D3).
			item["project_id"] = st.w.project
			delete(item, "labels")
		}
		if strings.TrimSpace(fmt.Sprint(item["title"])) == "" {
			continue
		}
		items = append(items, item)
	}
	if len(items) == 0 {
		return tasksVal(nil), "", nil
	}
	if len(items) > ruleval.MaxListItems {
		return none(), "", failf(ErrCodeWriteLimit, "a step may create at most %d tasks", ruleval.MaxListItems)
	}
	var created []string
	for i := 0; i < len(items); i += agenttools.PerCall {
		chunk := items[i:min(i+agenttools.PerCall, len(items))]
		p, err := st.tool("create_tasks", map[string]any{"items": chunk, "client_request_id": st.clientID(at) + ":" + strconv.Itoa(i)})
		if err != nil {
			return none(), "", err
		}
		created = append(created, createdIDs(p, "task")...)
	}
	return tasksVal(created), "", nil
}

// quickAdd reads a line with quick-add syntax into a create_tasks item
// (internal/quickadd); a title given as a field is taken as written.
func (st *runState) quickAdd(line string, item map[string]any) {
	item["title"] = line
	if st.e.QuickAdd != nil {
		st.e.QuickAdd(st.ctx, st.w, line, item)
		return
	}
	st.quickAddLine(line, item)
}

func (st *runState) changeTasks(s *ruleval.Step, in map[string]ruleval.Value, _ int) (ruleval.Value, string, error) {
	set, err := ruleval.ParseStepActions(s.In["set"].Lit)
	if err != nil {
		return none(), "", failf(ErrCodeInvalid, "%s", err)
	}
	list, _ := st.entityIn(s, in, "tasks")
	ids := list.IDs
	if list.Type == ruleval.TTask {
		ids = []string{list.ID}
	}
	pc := st.w.planContext(st.nowMs)
	pc.ProjectLive = func(id string) bool { _, ok := st.liveProject(id); return ok }
	if set.Section != nil {
		if _, ok := st.liveProject(set.Section.ProjectID); !ok {
			return none(), "", failf(ErrCodeNotFound, "project %s not found", set.Section.ProjectID)
		}
	}
	if set.Comment != nil && st.w.encrypted {
		return none(), "", failf(ErrCodeEncrypted, "a comment cannot be written for an encrypted account")
	}
	var changed []string
	for _, id := range ids {
		t, ok := st.liveTask(id)
		if !ok {
			return none(), "", failf(ErrCodeNotFound, "task %s not found", id)
		}
		patch := map[string]json.RawMessage{}
		if set.HasActions {
			p := Plan(set.Actions, t, pc)
			for _, sk := range p.Skipped {
				if sk == "shared project" {
					return none(), "", failf("shared_project", "a routine cannot move tasks into or out of a shared project")
				}
			}
			patch = p.Patch
			if p.Completing {
				st.completing[id] = true
			}
		}
		if set.Energy != nil {
			e := *set.Energy
			if e == "clear" {
				e = ""
			}
			if str(t, "energy") != e {
				patch["energy"] = raw(e)
			}
		}
		if set.Trash {
			patch["deleted_at"] = raw(st.nowMs)
		}
		if set.Comment != nil {
			cid := ids2("routine-comment", st.r.ID, st.key, id, strconv.Itoa(st.seq))
			st.lay(agenttools.Change{Entity: "comment", EntityID: cid, Create: true, Patch: map[string]json.RawMessage{
				"task_id": raw(id), "body": raw(*set.Comment), "author_id": raw(st.w.uid), "mentions": raw([]string{}),
				"created_at": raw(st.nowMs), "deleted_at": nullJSON, "parent_id": nullJSON, "edited_at": nullJSON}})
		}
		if set.Notify {
			st.sides = append(st.sides, st.ruleFiredNotice(id))
		}
		if len(patch) == 0 {
			continue
		}
		st.lay(agenttools.Change{Entity: "task", EntityID: id, Patch: patch})
		changed = append(changed, id)
	}
	return tasksVal(changed), "", nil
}

func ids2(space string, parts ...string) string {
	return ids.NameID(space, strings.Join(parts, "\x00"))
}

func (st *runState) addComment(s *ruleval.Step, in map[string]ruleval.Value, at int) (ruleval.Value, string, error) {
	task, _ := st.entityIn(s, in, "task")
	text, _ := st.textIn(s, in, "text")
	if strings.TrimSpace(text) == "" {
		return none(), StepSkipped, nil
	}
	id := ids2("routine-comment", st.r.ID, st.runID, strconv.Itoa(at), strconv.Itoa(st.seq), task.ID)
	if _, err := st.tool("add_comment", map[string]any{"task_id": task.ID, "body": text, "id": id}); err != nil {
		return none(), "", err
	}
	return none(), "", nil
}

func (st *runState) findProject(s *ruleval.Step, in map[string]ruleval.Value) (ruleval.Value, string, error) {
	name, _ := st.textIn(s, in, "name")
	name = strings.TrimSpace(name)
	best := ""
	for id, p := range st.projects {
		if !opsync.IsNull(p["deleted_at"]) || !strings.EqualFold(strings.TrimSpace(str(p, "name")), name) {
			continue
		}
		if best == "" || id < best {
			best = id
		}
	}
	if best == "" {
		return none(), "", failf(ErrCodeNotFound, "no project named %q", name)
	}
	return ruleval.Value{Type: ruleval.TProject, ID: best}, "", nil
}

func (st *runState) projectStep(s *ruleval.Step, in map[string]ruleval.Value, at int) (ruleval.Value, string, error) {
	project, _ := st.entityIn(s, in, "project")
	switch s.Kind {
	case "create_project":
		name, _ := st.textIn(s, in, "name")
		args := map[string]any{"name": name, "client_request_id": st.clientID(at)}
		if parent, ok := st.entityIn(s, in, "parent"); ok {
			args["parent_id"] = parent.ID
		}
		for _, f := range []string{"color", "icon"} {
			if v, ok := lit[string](s, f); ok {
				args[f] = v
			}
		}
		p, err := st.tool("create_project", args)
		if err != nil {
			return none(), "", err
		}
		created := createdIDs(p, "project")
		if len(created) == 0 {
			return none(), "", failf(ErrCodeInvalid, "no project was created")
		}
		return ruleval.Value{Type: ruleval.TProject, ID: created[0]}, "", nil
	case "update_project":
		args := map[string]any{"id": project.ID}
		if name, ok := st.textIn(s, in, "name"); ok {
			args["name"] = name
		}
		for _, f := range []string{"color", "icon"} {
			if v, ok := lit[string](s, f); ok {
				args[f] = v
			}
		}
		if len(args) > 1 {
			if _, err := st.tool("update_project", args); err != nil {
				return none(), "", err
			}
		}
		if archived, ok := lit[bool](s, "archived"); ok {
			if _, err := st.tool("archive_projects", map[string]any{"id": project.ID, "archived": archived}); err != nil {
				return none(), "", err
			}
		}
		return project, "", nil
	case "create_sections":
		names := in["names"].Lines
		if l, ok := lit[[]string](s, "names"); ok {
			names = l
		}
		items := []map[string]any{}
		for _, n := range names {
			if strings.TrimSpace(n) != "" {
				items = append(items, map[string]any{"name": n})
			}
		}
		if len(items) == 0 {
			return none(), StepSkipped, nil
		}
		_, err := st.tool("create_sections", map[string]any{"project_id": project.ID, "items": items, "client_request_id": st.clientID(at)})
		return none(), "", err
	case "create_labels":
		names := in["names"].Lines
		if l, ok := lit[[]string](s, "names"); ok {
			names = l
		}
		for i, n := range names {
			if strings.TrimSpace(n) == "" || st.labelExists(n) {
				continue
			}
			if _, err := st.tool("create_label", map[string]any{"name": n, "client_request_id": st.clientID(at) + ":" + strconv.Itoa(i)}); err != nil {
				return none(), "", err
			}
		}
		return none(), "", nil
	case "favourite":
		on, _ := lit[bool](s, "on")
		_, err := st.tool("set_favourite", map[string]any{"kind": "project", "id": project.ID, "favourite": on})
		return none(), "", err
	}
	return none(), "", nil
}

// labelExists reports a live label of that name (ignoring case), planned ones included.
func (st *runState) labelExists(name string) bool {
	for _, c := range st.overlay {
		if c.Entity == "label" && strings.EqualFold(strOf(c.Patch["name"]), name) {
			return true
		}
	}
	return st.w.labelNames[strings.ToLower(strings.TrimSpace(name))]
}

func (st *runState) noteText(s *ruleval.Step, in map[string]ruleval.Value) (ruleval.Value, string, error) {
	of, _ := st.entityIn(s, in, "of")
	var row opsync.Entity
	var ok bool
	if of.Type == ruleval.TProject {
		row, ok = st.liveProject(of.ID)
	} else {
		row, ok = st.liveTask(of.ID)
	}
	if !ok {
		return none(), "", failf(ErrCodeNotFound, "%s %s not found", of.Type, of.ID)
	}
	return st.textOut(str(row, "description"))
}

func (st *runState) appendNote(s *ruleval.Step, in map[string]ruleval.Value, at int) (ruleval.Value, string, error) {
	of, _ := st.entityIn(s, in, "of")
	text, _ := st.textIn(s, in, "text")
	if strings.TrimSpace(text) == "" {
		return none(), StepSkipped, nil
	}
	if of.Type == ruleval.TProject {
		_, err := st.tool("update_project", map[string]any{"id": of.ID, "append_description": text})
		return none(), "", err
	}
	aid := "r" + ids2("routine-append", st.runID, strconv.Itoa(at), strconv.Itoa(st.seq))[:20]
	aid = strings.ReplaceAll(aid, "-", "")
	_, err := st.tool("append_to_note", map[string]any{"task_id": of.ID, "text": text, "append_id": aid})
	return none(), "", err
}

func (st *runState) listStep(s *ruleval.Step, in map[string]ruleval.Value) (ruleval.Value, string, error) {
	list := in["list"]
	switch s.Kind {
	case "count":
		return ruleval.Value{Type: ruleval.TNumber, Number: float64(list.Len())}, "", nil
	case "take":
		n, has := lit[float64](s, "n")
		if !has {
			n = 1
		}
		from, _ := lit[string](s, "from")
		if from == "all" {
			return list, "", nil
		}
		if list.Type == ruleval.TLines {
			return ruleval.Value{Type: ruleval.TLines, Lines: ruleval.Take(list.Lines, int(n), from == "end")}, "", nil
		}
		return tasksVal(ruleval.Take(list.IDs, int(n), from == "end")), "", nil
	case "filter":
		w, err := ruleval.ParseWhere(s.In["where"].Lit)
		if err != nil {
			return none(), "", failf(ErrCodeInvalid, "%s", err)
		}
		if list.Type == ruleval.TLines {
			if w.Condition != nil {
				return none(), "", failf(ErrCodeTypeMismatch, "filter: a condition filters tasks; use contains for lines")
			}
			if w.Contains != nil {
				return ruleval.Value{Type: ruleval.TLines, Lines: ruleval.FilterLines(list.Lines, *w.Contains, false)}, "", nil
			}
			return ruleval.Value{Type: ruleval.TLines, Lines: ruleval.FilterLines(list.Lines, *w.NotContains, true)}, "", nil
		}
		if w.Condition == nil {
			return none(), "", failf(ErrCodeTypeMismatch, "filter: contains filters lines; use a condition for tasks")
		}
		var out []string
		for _, id := range list.IDs {
			if t, ok := st.tasks[id]; ok && st.matchCond(w.Condition, t) {
				out = append(out, id)
			}
		}
		return tasksVal(out), "", nil
	case "sort":
		by, _ := lit[string](s, "by")
		dir, _ := lit[string](s, "direction")
		if list.Type == ruleval.TLines {
			return ruleval.Value{Type: ruleval.TLines, Lines: ruleval.SortLines(list.Lines, dir == "desc")}, "", nil
		}
		rows := make([]ruleval.SortTask, 0, len(list.IDs))
		for _, id := range list.IDs {
			t := st.tasks[id]
			var prio int
			_ = json.Unmarshal(t["priority"], &prio)
			due := ""
			if d := dueOf(t["due"]); d != nil {
				due = d.Date
			}
			rows = append(rows, ruleval.SortTask{ID: id, Title: str(t, "title"), Due: due, Deadline: str(t, "deadline"), Priority: prio, Created: int64(num(t, "created_at"))})
		}
		var out []string
		for _, r := range ruleval.SortTasks(rows, by, dir == "desc") {
			out = append(out, r.ID)
		}
		return tasksVal(out), "", nil
	}
	return none(), "", nil
}

func (st *runState) timerStep(s *ruleval.Step, in map[string]ruleval.Value, at int) (ruleval.Value, string, error) {
	if s.Kind == "stop_timer" {
		p, err := st.tool("stop_timer", map[string]any{})
		var f *stepFail
		if errors.As(err, &f) && len(p.Changes) == 0 {
			return none(), StepSkipped, nil
		}
		return none(), "", err
	}
	task, _ := st.entityIn(s, in, "task")
	_, err := st.tool("start_timer", map[string]any{"task_id": task.ID, "stop_running": true, "client_request_id": st.clientID(at)})
	return none(), "", err
}
