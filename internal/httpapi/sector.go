package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/OpenTodoApp/opentodo/internal/flow"
	"github.com/OpenTodoApp/opentodo/internal/sector"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// checkSector normalises the time sector of a task body (OpenSpec change
// time-sectors, design D1): a valid period is kept, null and "" clear it
// (stored as ""), and anything else is refused with the message the caller
// answers as 400 invalid_input. Relative words are refused: REST has no viewer
// date.
func checkSector(body map[string]json.RawMessage) string {
	raw, has := body["sector"]
	if !has {
		return ""
	}
	if string(raw) == "null" {
		body["sector"] = json.RawMessage(`""`)
		return ""
	}
	var v string
	if json.Unmarshal(raw, &v) != nil || sector.Check(v) != nil {
		return `task.sector: must be a period "YYYY-Www", "YYYY-MM" or "YYYY-Qn", or null or "" for none`
	}
	return ""
}

// checkTaskFlow checks how a task's subtasks flow (OpenSpec change
// subtask-flow): "", "parallel" or "sequential"; anything else is refused with
// the message the caller answers as 400 invalid_input. null clears it (stored as "").
func checkTaskFlow(body map[string]json.RawMessage) string {
	raw, has := body["flow_mode"]
	if !has {
		return ""
	}
	if string(raw) == "null" {
		body["flow_mode"] = json.RawMessage(`""`)
		return ""
	}
	var v string
	if json.Unmarshal(raw, &v) != nil || !flow.ValidTask(v) {
		return `task.flow_mode: must be "", "parallel" or "sequential"`
	}
	return ""
}

// taskBodyOK runs the task field checks REST does before the op path: the
// energy (400 invalid_energy), the time sector and the subtask flow (400 invalid_input).
func taskBodyOK(w http.ResponseWriter, body map[string]json.RawMessage) bool {
	if !energyOK(w, body) {
		return false
	}
	for _, msg := range []string{checkSector(body), checkTaskFlow(body)} {
		if msg != "" {
			writeError(w, http.StatusBadRequest, "invalid_input", msg)
			return false
		}
	}
	return true
}

// presentSector gives a task representation its sector, null when none
// (time-sectors D9, as the agent tools show it).
func presentSector(e opsync.Entity) {
	if e == nil {
		return
	}
	var v string
	if raw, ok := e["sector"]; !ok || json.Unmarshal(raw, &v) != nil || v == "" {
		e["sector"] = json.RawMessage("null")
	}
}
