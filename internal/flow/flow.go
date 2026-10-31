// Package flow is how a project's tasks flow (OpenSpec change project-flow-modes):
// Parallel, Sequential or an Area, and the one derived "available" rule the agent
// tools, the MCP resources, the digest and the CLI ask. Availability is derived
// from synced fields and the caller's logical today, never stored, so it
// converges with the rows. The same rule is implemented in web/src/lib/flow.ts;
// both evaluate testdata/flow_fixture.json and must agree.
package flow

import (
	"encoding/json"
	"sort"
)

// Project flows. An empty, missing or unknown stored value reads as Parallel.
const (
	Parallel   = "parallel"
	Sequential = "sequential"
	Area       = "area"
)

// ValidProject reports whether v is a project flow REST and the agent tools accept.
func ValidProject(v string) bool { return v == Parallel || v == Sequential || v == Area }

// ValidSection reports whether v is a section flow REST and the agent tools accept
// ("" follows the project).
func ValidSection(v string) bool { return v == "" || v == Parallel || v == Sequential }

// ProjectFlow reads a stored project flow: unknown values read as Parallel.
func ProjectFlow(stored string) string {
	if stored == Sequential || stored == Area {
		return stored
	}
	return Parallel
}

// SectionFlow reads a stored section flow: "" (follow the project) for empty,
// unknown and "area".
func SectionFlow(stored string) string {
	if stored == Parallel || stored == Sequential {
		return stored
	}
	return ""
}

// EffectiveSectionFlow is the flow a section works by: its own, else its
// project's (an area's sections read as Parallel).
func EffectiveSectionFlow(stored, project string) string {
	if own := SectionFlow(stored); own != "" {
		return own
	}
	if ProjectFlow(project) == Sequential {
		return Sequential
	}
	return Parallel
}

// Task is the part of a task the rule reads.
type Task struct {
	ID, ProjectID, ParentID, SectionID string
	Position                           float64
	Completed, Deleted                 bool
	// Start is "", a date (YYYY-MM-DD) or "someday".
	Start     string
	BlockedBy []string
	// Recurring is a task with a recurrence rule; Habit a habit series.
	Recurring, Habit bool
}

// Project is the part of a project the rule reads.
type Project struct {
	ID, FlowMode string
}

// Section is the part of a section the rule reads.
type Section struct {
	ID, ProjectID, FlowMode string
	Position                float64
	Deleted                 bool
}

// Input is everything the rule needs. Today is the caller's logical today.
type Input struct {
	Tasks    []Task
	Projects []Project
	Sections []Section
	Today    string
}

// Held is what a waiting task comes after: Kind "task" or "section", and its id.
type Held struct {
	Kind, ID string
}

// State is one task's flow state.
type State struct {
	Available bool
	Waits     bool
	HeldBy    *Held
}

// States is the flow state of every task in an Input, by id.
type States map[string]State

// Available reports whether the task with this id is available.
func (s States) Available(id string) bool { return s[id].Available }

// Waits reports whether the task with this id waits in sequence.
func (s States) Waits(id string) bool { return s[id].Waits }

const maxDepth = 64

func (t Task) open() bool { return !t.Deleted && !t.Completed }

// skipped: recurring tasks, habits and Someday never hold or wait (design D4).
func (t Task) skipped() bool { return t.Recurring || t.Habit || t.Start == "someday" }

func less(ap, bp float64, aid, bid string) bool {
	if ap != bp {
		return ap < bp
	}
	return aid < bid
}

// Compute returns the flow state of every task in the input.
func Compute(in Input) States {
	byID := make(map[string]Task, len(in.Tasks))
	for _, t := range in.Tasks {
		byID[t.ID] = t
	}
	holds := sequence(in)
	out := make(States, len(in.Tasks))
	for _, t := range in.Tasks {
		if !t.open() {
			out[t.ID] = State{}
			continue
		}
		top := t
		for d := 0; top.ParentID != "" && d < maxDepth; d++ {
			p, ok := byID[top.ParentID]
			if !ok {
				break
			}
			top = p
		}
		held, waits := holds[top.ID]
		blocked := false
		for _, id := range t.BlockedBy {
			if b, ok := byID[id]; ok && b.open() {
				blocked = true
				break
			}
		}
		later := t.Start != "" && t.Start != "someday" && t.Start > in.Today
		st := State{Available: !waits && !blocked && t.Start != "someday" && !later, Waits: waits}
		if waits {
			h := held
			st.HeldBy = &h
		}
		out[t.ID] = st
	}
	return out
}

// sequence marks the open top-level tasks that wait in sequence, per project.
func sequence(in Input) map[string]Held {
	holds := map[string]Held{}
	flows := map[string]string{}
	for _, p := range in.Projects {
		flows[p.ID] = ProjectFlow(p.FlowMode)
	}
	sections := map[string]Section{}
	for _, s := range in.Sections {
		sections[s.ID] = s
	}
	byProject := map[string][]Task{}
	var order []string
	for _, t := range in.Tasks {
		if !t.open() || t.ParentID != "" || t.ProjectID == "" {
			continue
		}
		if _, ok := byProject[t.ProjectID]; !ok {
			order = append(order, t.ProjectID)
		}
		byProject[t.ProjectID] = append(byProject[t.ProjectID], t)
	}
	oneByOne := func(list []Task) {
		var first string
		for _, t := range list {
			if t.skipped() {
				continue
			}
			if first == "" {
				first = t.ID
				continue
			}
			holds[t.ID] = Held{Kind: "task", ID: first}
		}
	}
	for _, projectID := range order {
		tasks := byProject[projectID]
		pf := flows[projectID]
		if pf == "" {
			pf = Parallel
		}
		var live []Section
		for _, s := range in.Sections {
			if s.ProjectID == projectID && !s.Deleted {
				live = append(live, s)
			}
		}
		sort.SliceStable(live, func(i, j int) bool { return less(live[i].Position, live[j].Position, live[i].ID, live[j].ID) })
		sectionOf := func(t Task) string {
			if s, ok := sections[t.SectionID]; ok && !s.Deleted && s.ProjectID == projectID {
				return s.ID
			}
			return ""
		}
		sortTasks := func(list []Task) []Task {
			sort.SliceStable(list, func(i, j int) bool { return less(list[i].Position, list[j].Position, list[i].ID, list[j].ID) })
			return list
		}
		inSection := func(id string) []Task {
			var list []Task
			for _, t := range tasks {
				if sectionOf(t) == id {
					list = append(list, t)
				}
			}
			return sortTasks(list)
		}
		if pf != Sequential {
			for _, s := range live {
				if EffectiveSectionFlow(s.FlowMode, pf) == Sequential {
					oneByOne(inSection(s.ID))
				}
			}
			continue
		}
		type step struct {
			held       Held
			tasks      []Task
			sequential bool
		}
		var steps []step
		for _, t := range inSection("") {
			steps = append(steps, step{held: Held{Kind: "task", ID: t.ID}, tasks: []Task{t}})
		}
		for _, s := range live {
			steps = append(steps, step{held: Held{Kind: "section", ID: s.ID}, tasks: inSection(s.ID), sequential: EffectiveSectionFlow(s.FlowMode, pf) == Sequential})
		}
		var current *Held
		for _, st := range steps {
			var cand []Task
			for _, t := range st.tasks {
				if !t.skipped() {
					cand = append(cand, t)
				}
			}
			if current != nil {
				for _, t := range cand {
					holds[t.ID] = *current
				}
				continue
			}
			if len(cand) == 0 {
				continue
			}
			if st.sequential {
				oneByOne(st.tasks)
			}
			h := st.held
			current = &h
		}
	}
	return holds
}

// Row is a materialized row (opsync.Entity has this underlying type).
type Row = map[string]json.RawMessage

func str(r Row, f string) string {
	var s string
	if v, ok := r[f]; ok {
		_ = json.Unmarshal(v, &s)
	}
	return s
}

func num(r Row, f string) float64 {
	var n float64
	if v, ok := r[f]; ok {
		_ = json.Unmarshal(v, &n)
	}
	return n
}

func set(r Row, f string) bool {
	v, ok := r[f]
	return ok && len(v) > 0 && string(v) != "null"
}

func boolean(r Row, f string) bool {
	var b bool
	if v, ok := r[f]; ok {
		_ = json.Unmarshal(v, &b)
	}
	return b
}

// TaskOf reads a materialized task row.
func TaskOf(r Row) Task {
	t := Task{
		ID: str(r, "id"), ProjectID: str(r, "project_id"), ParentID: str(r, "parent_id"), SectionID: str(r, "section_id"),
		Position: num(r, "position"), Completed: set(r, "completed_at"), Deleted: set(r, "deleted_at"),
		Start: str(r, "start"), Recurring: set(r, "recurrence"), Habit: boolean(r, "habit"),
	}
	if v, ok := r["blocked_by"]; ok {
		_ = json.Unmarshal(v, &t.BlockedBy)
	}
	return t
}

// ProjectOf reads a materialized project row.
func ProjectOf(r Row) Project { return Project{ID: str(r, "id"), FlowMode: str(r, "flow_mode")} }

// SectionOf reads a materialized section row.
func SectionOf(r Row) Section {
	return Section{ID: str(r, "id"), ProjectID: str(r, "project_id"), FlowMode: str(r, "flow_mode"), Position: num(r, "position"), Deleted: set(r, "deleted_at")}
}
