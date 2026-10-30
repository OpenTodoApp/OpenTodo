package httpapi

import (
	"encoding/json"
	"fmt"

	"github.com/OpenTodoApp/opentodo/internal/flow"
)

// checkFlowMode validates flow_mode on a project or section write (OpenSpec
// change project-flow-modes): REST accepts only the closed set, while sync
// accepts any string so a newer client's value is kept.
func checkFlowMode(entity string, body map[string]json.RawMessage) string {
	raw, has := body["flow_mode"]
	if !has {
		return ""
	}
	var v string
	if json.Unmarshal(raw, &v) != nil {
		return fmt.Sprintf("%s.flow_mode must be a string", entity)
	}
	switch entity {
	case "project":
		if !flow.ValidProject(v) {
			return fmt.Sprintf("project.flow_mode must be parallel, sequential or area, got %q", v)
		}
	case "section":
		if !flow.ValidSection(v) {
			return fmt.Sprintf("section.flow_mode must be \"\", parallel or sequential, got %q", v)
		}
	}
	return ""
}

// defaultFlowMode gives every project and section representation its flow_mode,
// "" when unset (OpenSpec change project-flow-modes, "Flow through the API").
func defaultFlowMode(e map[string]json.RawMessage) {
	if _, has := e["flow_mode"]; e != nil && !has {
		e["flow_mode"] = json.RawMessage(`""`)
	}
}
