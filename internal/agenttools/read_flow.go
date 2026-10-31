package agenttools

import (
	"github.com/OpenTodoApp/opentodo/internal/flow"
)

// Available tasks for the agent tools (OpenSpec change project-flow-modes):
// the same rule as the web app (internal/flow, shared vectors), over the
// snapshot's rows and the caller's logical today.

// flowStates computes every task's flow state for the given local date.
func (snap *snapshot) flowStates(today string) flow.States {
	in := flow.Input{Today: today}
	for _, p := range snap.projList {
		in.Projects = append(in.Projects, flow.ProjectOf(p))
	}
	for _, s := range snap.sectionRows {
		in.Sections = append(in.Sections, flow.SectionOf(s))
	}
	for _, t := range snap.tasks {
		in.Tasks = append(in.Tasks, flow.TaskOf(t))
	}
	return flow.Compute(in)
}

// sectionOut is a section in the project resource: its id, flow and name.
type sectionOut struct {
	ID        string   `json:"id"`
	FlowMode  string   `json:"flow_mode"`
	Untrusted nameText `json:"untrusted_text"`
}
