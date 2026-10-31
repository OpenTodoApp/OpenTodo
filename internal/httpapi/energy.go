package httpapi

import (
	"encoding/json"
	"net/http"
	"slices"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// checkEnergy normalises the energy of a task body (OpenSpec change
// task-energy, design D7): "deep", "medium" and "low" are kept, null and ""
// clear it (stored as ""), and anything else is refused with the message the
// caller answers as 400 invalid_energy.
func checkEnergy(body map[string]json.RawMessage) string {
	raw, has := body["energy"]
	if !has {
		return ""
	}
	if string(raw) == "null" {
		body["energy"] = json.RawMessage(`""`)
		return ""
	}
	var e string
	if json.Unmarshal(raw, &e) != nil || (e != "" && !slices.Contains(opsync.EnergyLevels, e)) {
		return `task.energy: must be "deep", "medium", "low", or null or "" for none`
	}
	return ""
}

// energyOK runs checkEnergy and answers 400 invalid_energy when it refuses.
func energyOK(w http.ResponseWriter, body map[string]json.RawMessage) bool {
	if msg := checkEnergy(body); msg != "" {
		writeError(w, http.StatusBadRequest, "invalid_energy", msg)
		return false
	}
	return true
}

// presentEnergy gives a task representation its energy, null when none
// (task-energy, "Energy through the API, CLI and agent tools").
func presentEnergy(e opsync.Entity) {
	if e == nil {
		return
	}
	var v string
	if raw, ok := e["energy"]; !ok || json.Unmarshal(raw, &v) != nil || v == "" {
		e["energy"] = json.RawMessage("null")
	}
}
