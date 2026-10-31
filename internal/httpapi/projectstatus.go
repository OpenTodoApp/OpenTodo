package httpapi

import (
	"encoding/json"
	"fmt"
)

// checkProjectStatus validates status on a project write (OpenSpec change
// project-review-cadence, project-organization "Maintenance status"): REST
// accepts only active and maintenance, while sync accepts any string so a newer
// client's value is kept.
func checkProjectStatus(body map[string]json.RawMessage) string {
	raw, has := body["status"]
	if !has {
		return ""
	}
	var v string
	if json.Unmarshal(raw, &v) != nil || (v != "active" && v != "maintenance") {
		return fmt.Sprintf("project.status must be active or maintenance, got %s", raw)
	}
	return ""
}

// defaultProjectStatus gives every project representation its status: "active"
// when unset or empty, any other stored value as it is.
func defaultProjectStatus(e map[string]json.RawMessage) {
	if e == nil {
		return
	}
	if raw, has := e["status"]; !has || string(raw) == `""` {
		e["status"] = json.RawMessage(`"active"`)
	}
}
