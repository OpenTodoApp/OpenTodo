package agenttools

import (
	"encoding/json"

	"github.com/OpenTodoApp/opentodo/internal/flow"
)

// Flows of projects and sections (OpenSpec change project-flow-modes): the
// agent tools accept the closed sets REST accepts.

var (
	projectFlowProp = map[string]any{"type": "string", "enum": []string{flow.Parallel, flow.Sequential, flow.Area},
		"description": "How the project's tasks flow: parallel (any order), sequential (one step at a time, in list order) or area (an ongoing list with no progress and never without a next action)."}
	sectionFlowProp = map[string]any{"type": "string", "enum": []string{"", flow.Parallel, flow.Sequential},
		"description": "How the section's tasks flow: \"\" follows the project, parallel offers them together, sequential one at a time."}
)

// flowMode reads an optional flow_mode argument of a project or a section.
func (a args) flowMode(prefix, entity string) (json.RawMessage, bool, error) {
	v, ok := a["flow_mode"]
	if !ok {
		return nil, false, nil
	}
	var s string
	if json.Unmarshal(v, &s) != nil {
		return nil, false, argErr(prefix + "flow_mode: must be a string")
	}
	if entity == "project" && !flow.ValidProject(s) {
		return nil, false, argErr(prefix + "flow_mode: must be parallel, sequential or area")
	}
	if entity == "section" && !flow.ValidSection(s) {
		return nil, false, argErr(prefix + "flow_mode: must be \"\", parallel or sequential")
	}
	return raw(s), true, nil
}
