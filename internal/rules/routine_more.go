package rules

import (
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/agenttools"
	"github.com/OpenTodoApp/opentodo/internal/quickadd"
	"github.com/OpenTodoApp/opentodo/internal/ruleval"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
	"github.com/OpenTodoApp/opentodo/internal/templatelib"
)

// Steps backed by other services (routines-engine 2.3): quick add for Create
// tasks, Clear note, Set today's focus and Create a project from a template.

func (st *runState) prefs() opsync.Entity {
	p, err := st.e.Sync.Get(st.ctx, st.w.uid, "user_prefs", "me")
	if err != nil || p == nil {
		return opsync.Entity{}
	}
	return p
}

// lang is the account's interface language for library text ("en" by default).
func (st *runState) lang() string {
	l := str(st.prefs(), "language")
	if l == "" || l == "system" {
		return "en"
	}
	return l
}

// quickAddLine reads a line with quick-add syntax (internal/quickadd): its
// title, date, priority, labels that exist, project, deadline, start,
// evening, part of the day, energy, estimate and repeat rule.
func (st *runState) quickAddLine(line string, item map[string]any) {
	prefs := st.prefs()
	ws := int(st.w.weekStart)
	ctx := quickadd.Context{Today: st.w.today, Now: time.UnixMilli(st.nowMs).In(time.FixedZone("", st.w.offset*60)).Format("15:04"),
		Languages: []string{st.lang()}, WeekStart: &ws, Energy: st.env.Energy, DayParts: str(prefs, "day_parts") == "on"}
	for id, p := range st.projects {
		ctx.Projects = append(ctx.Projects, quickadd.Project{ID: id, Name: str(p, "name"), ParentID: str(p, "parent_id"), Deleted: !opsync.IsNull(p["deleted_at"]),
			Archived: !opsync.IsNull(p["archived_at"]) && len(p["archived_at"]) > 0})
	}
	res := quickadd.Parse(line, ctx)
	if strings.TrimSpace(res.Title) == "" {
		return
	}
	item["title"] = res.Title
	if res.Due != nil {
		due := map[string]string{"date": res.Due.Date}
		if res.Due.Time != "" {
			due["time"] = res.Due.Time
		}
		item["due"] = due
	}
	if res.ProjectID != "" {
		item["project_id"] = res.ProjectID
		delete(item, "section_id")
	}
	if res.Priority > 0 {
		item["priority"] = res.Priority
	}
	var labels []string
	if l, ok := item["labels"].([]string); ok {
		labels = l
	}
	for _, name := range res.Labels {
		if st.labelExists(name) {
			labels = append(labels, name)
		}
	}
	if len(labels) > 0 {
		item["labels"] = labels
	}
	if res.Deadline != "" {
		item["deadline"] = res.Deadline
	}
	if res.Someday {
		item["start"] = "someday"
		delete(item, "due")
	}
	if res.Evening {
		item["evening"] = true
	}
	if res.DayPart != "" {
		item["day_part"] = res.DayPart
	}
	if res.Energy != "" {
		item["energy"] = res.Energy
	}
	if res.EstimateMinutes > 0 {
		item["estimate_minutes"] = res.EstimateMinutes
	}
	if res.Recurrence != "" {
		item["recurrence"] = res.Recurrence
	}
}

// clearNote empties a task's or project's note: the Markdown projection and
// the document together, and any appended text no device merged yet, as a
// REST write of the note does; a device's older copy loses by last-writer-wins.
func (st *runState) clearNote(s *ruleval.Step, in map[string]ruleval.Value) (ruleval.Value, string, error) {
	of := in["of"]
	entity := "task"
	row, ok := st.liveTask(of.ID)
	if of.Type == ruleval.TProject {
		entity = "project"
		row, ok = st.liveProject(of.ID)
	}
	if !ok {
		return none(), "", failf(ErrCodeNotFound, "%s %s not found", entity, of.ID)
	}
	patch := map[string]json.RawMessage{}
	if str(row, "description") != "" || str(row, "notes_doc") != "" {
		patch["description"], patch["notes_doc"] = raw(""), raw("")
	}
	for f, v := range row {
		if _, isAppend := opsync.AppendID(f); isAppend && string(v) != `""` {
			patch[f] = raw("")
		}
	}
	if len(patch) == 0 {
		return none(), StepSkipped, nil
	}
	st.lay(agenttools.Change{Entity: entity, EntityID: of.ID, Patch: patch})
	return none(), "", nil
}

// setFocus sets today's focus to the tasks by the Daily check's rules
// (ruleval.PlanSetFocus, the port of focusSet.ts): Three tasks or Bento.
func (st *runState) setFocus(s *ruleval.Step, in map[string]ruleval.Value) (ruleval.Value, string, error) {
	list, _ := st.entityIn(s, in, "tasks")
	ids := list.IDs
	if list.Type == ruleval.TTask {
		ids = []string{list.ID}
	}
	tasks := map[string]ruleval.FocusTask{}
	for _, id := range ids {
		t, ok := st.tasks[id]
		if !ok {
			continue
		}
		ft := ruleval.FocusTask{Open: opsync.IsNull(t["completed_at"]) && opsync.IsNull(t["deleted_at"])}
		var est int
		if json.Unmarshal(t["estimate_minutes"], &est) == nil && !opsync.IsNull(t["estimate_minutes"]) {
			ft.Estimate = &est
		}
		tasks[id] = ft
	}
	prefs := st.prefs()
	fp := ruleval.PlanSetFocus(ids, tasks, str(prefs, "focus_style"), str(prefs, "bento_order"), st.w.today)
	patch := map[string]json.RawMessage{"focus_date": raw(fp.FocusDate), "focus": raw(fp.Focus)}
	if fp.Slots != nil {
		patch["focus_slots"] = raw(*fp.Slots)
	}
	st.lay(agenttools.Change{Entity: "review", EntityID: "me", Patch: patch})
	var placed []string
	if fp.Focus != "" {
		placed = strings.Split(fp.Focus, ",")
	}
	status := ""
	if len(placed) < len(ids) {
		status = StepTruncated
	}
	return tasksVal(placed), status, nil
}

// projectFromTemplate starts a library template on a start day: its labels
// (those missing), its projects, sections and tasks with the dates the
// library's own instantiation gives, planned through the registry.
func (st *runState) projectFromTemplate(s *ruleval.Step, in map[string]ruleval.Value, at int) (ruleval.Value, string, error) {
	slug, _ := lit[string](s, "template")
	tpl, ok := templatelib.Find(slug)
	if !ok {
		return none(), "", failf(ErrCodeNotFound, "no template %q in the library", slug)
	}
	start := st.w.today
	if v, ok := in["start"]; ok && v.Date != "" {
		start = v.Date
	} else if a, ok := s.In["start"]; ok {
		if d, ok := ruleval.DateLiteral(a.Lit); ok {
			start = d.Resolve(st.w.today)
		}
	}
	lang := st.lang()
	seed := st.clientID(at)
	id := func(parts ...string) string { return ids2("routine-template", append([]string{seed}, parts...)...) }
	for i, l := range tpl.Labels {
		name := l.Name.Pick(lang)
		if st.labelExists(name) {
			continue
		}
		args := map[string]any{"name": name, "client_request_id": seed + ":l" + strconv.Itoa(i)}
		if l.Color != "" {
			args["color"] = l.Color
		}
		if _, err := st.tool("create_label", args); err != nil {
			return none(), "", err
		}
	}
	first := ""
	for i, p := range tpl.Projects {
		name := p.Name.Pick(lang)
		if i == 0 {
			if v, ok := st.textIn(s, in, "name"); ok && strings.TrimSpace(v) != "" {
				name = v
			}
		}
		args := map[string]any{"name": name, "id": id("p", strconv.Itoa(i))}
		color := p.Color
		if color == "" {
			color = templatelib.Palette[i%len(templatelib.Palette)]
		}
		args["color"] = color
		if icon := p.Icon; icon != "" {
			args["icon"] = icon
		} else if i == 0 && tpl.Icon != "" {
			args["icon"] = tpl.Icon
		}
		plan, err := st.tool("create_project", args)
		if err != nil {
			return none(), "", err
		}
		pid := createdIDs(plan, "project")[0]
		if first == "" {
			first = pid
		}
		var sections []map[string]any
		for j, sec := range p.Sections {
			sections = append(sections, map[string]any{"name": sec.Name.Pick(lang), "id": id("s", strconv.Itoa(i), strconv.Itoa(j))})
		}
		if len(sections) > 0 {
			if _, err := st.tool("create_sections", map[string]any{"project_id": pid, "items": sections}); err != nil {
				return none(), "", err
			}
		}
		var level []map[string]any
		var next []pendingTask
		for j, tk := range p.Tasks {
			next = append(next, pendingTask{tk, "", "", "t" + strconv.Itoa(i) + "." + strconv.Itoa(j)})
		}
		for j, sec := range p.Sections {
			for k, tk := range sec.Tasks {
				next = append(next, pendingTask{tk, sections[j]["id"].(string), "", "t" + strconv.Itoa(i) + "." + strconv.Itoa(j) + "." + strconv.Itoa(k)})
			}
		}
		for len(next) > 0 {
			level, next = st.templateLevel(tpl, next, pid, start, lang, id)
			for c := 0; c < len(level); c += agenttools.PerCall {
				if _, err := st.tool("create_tasks", map[string]any{"items": level[c:min(c+agenttools.PerCall, len(level))]}); err != nil {
					return none(), "", err
				}
			}
		}
	}
	if first == "" {
		return none(), "", failf(ErrCodeInvalid, "the template %q holds no project", slug)
	}
	return ruleval.Value{Type: ruleval.TProject, ID: first}, "", nil
}

type pendingTask struct {
	task    templatelib.Task
	section string
	parent  string
	path    string
}

// templateLevel turns one level of template tasks into create_tasks items and
// returns their subtasks as the next level (a parent is created before its
// subtasks).
func (st *runState) templateLevel(tpl *templatelib.Template, list []pendingTask, pid, start, lang string, id func(...string) string) ([]map[string]any, []pendingTask) {
	var items []map[string]any
	var next []pendingTask
	for _, pt := range list {
		tk := pt.task
		tid := id(pt.path)
		item := map[string]any{"id": tid, "title": tk.Title.Pick(lang), "project_id": pid}
		if d := tk.Description.Pick(lang); d != "" {
			item["description"] = d
		}
		if tk.Priority > 0 {
			item["priority"] = tk.Priority
		}
		if tk.Due != "" {
			if date, err := templatelib.ResolveOffset(tk.Due, start); err == nil {
				due := map[string]string{"date": date}
				if tk.Time != "" {
					due["time"] = tk.Time
				}
				item["due"] = due
			}
		}
		var labels []string
		for _, i := range tk.Labels {
			if i >= 0 && i < len(tpl.Labels) {
				labels = append(labels, tpl.Labels[i].Name.Pick(lang))
			}
		}
		if len(labels) > 0 {
			item["labels"] = labels
		}
		if tk.Estimate > 0 {
			item["estimate_minutes"] = tk.Estimate
		}
		if tk.Recurrence != "" {
			item["recurrence"] = tk.Recurrence
		}
		if pt.section != "" {
			item["section_id"] = pt.section
		}
		if pt.parent != "" {
			item["parent_id"] = pt.parent
		}
		items = append(items, item)
		for k, sub := range tk.Subtasks {
			next = append(next, pendingTask{sub, pt.section, tid, pt.path + "." + strconv.Itoa(k)})
		}
	}
	return items, next
}
