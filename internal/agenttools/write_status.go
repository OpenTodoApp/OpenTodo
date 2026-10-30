package agenttools

import "encoding/json"

// A project's status (OpenSpec change project-review-cadence): the agent tools
// accept the closed set REST accepts, and project output reads an empty or
// unknown stored value as active.

var projectStatusProp = map[string]any{"type": "string", "enum": []string{"active", "maintenance"},
	"description": "active, or maintenance: deliberately on low burn, so the project is never marked stalled or without a next action and its health reads Maintenance (a passed deadline still shows Late). Its tasks are listed as usual."}

// projectStatus reads an optional status argument of a project.
func (a args) projectStatus() (json.RawMessage, bool, error) {
	v, ok := a["status"]
	if !ok {
		return nil, false, nil
	}
	var s string
	if json.Unmarshal(v, &s) != nil || (s != "active" && s != "maintenance") {
		return nil, false, argErr("status: must be active or maintenance")
	}
	return raw(s), true, nil
}

// statusOf is a project's status as output: maintenance, else active.
func statusOf(stored string) string {
	if stored == "maintenance" {
		return stored
	}
	return "active"
}
