package agenttools

import (
	"context"
	"encoding/json"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// MaxOpenProposal is the most items an open proposal a turn sends back may hold
// (OpenSpec change assistant-proposal-editing, design D3).
const MaxOpenProposal = 50

// openEntities are the entities an open proposal may hold: those the write tools plan.
var openEntities = map[string]bool{"task": true, "project": true, "section": true, "label": true, "comment": true, "reminder": true, "note": true}

// OpenProposal checks an open proposal a turn sends back before the loop plans on
// top of it (assistant-proposal-editing D3): every item names an entity a write
// tool plans, every field and base value is one the op schema accepts, a change
// to an existing entity names one the user can see and has not kept away from
// AI assistants, and a new entity's id names nothing visible yet. It returns the
// items kept, in order, and how many were left out.
func (r *Registry) OpenProposal(ctx context.Context, userID string, items ChangeSet) (ChangeSet, int, error) {
	if len(items) == 0 {
		return nil, 0, nil
	}
	snap, err := r.load(ctx, userID)
	if err != nil {
		return nil, 0, err
	}
	visible := map[string]map[string]bool{"task": {}, "project": {}, "section": {}, "label": {}, "note": {}}
	for _, t := range snap.tasks {
		if snap.visible(t, true) {
			visible["task"][rawStr(t, "id")] = true
		}
	}
	for id := range snap.projects {
		visible["project"][id] = true
	}
	for id := range snap.sectionProject {
		visible["section"][id] = true
	}
	for id := range snap.labels {
		visible["label"][id] = true
	}
	notes, err := r.liveNotes(ctx, userID, snap)
	if err != nil {
		return nil, 0, err
	}
	for _, n := range notes {
		visible["note"][rawStr(n, "id")] = true
	}
	var kept ChangeSet
	seen := map[string]bool{}
	for _, c := range items {
		key := c.Entity + "\x00" + c.EntityID
		if !openEntities[c.Entity] || seen[key] || !opsync.ValidEntityID(c.EntityID) || len(c.Patch) == 0 || !openFields(c) {
			continue
		}
		known := visible[c.Entity][c.EntityID]
		if c.Create == known {
			// A change to something not visible, or a new entity under a visible id.
			continue
		}
		seen[key] = true
		kept = append(kept, Change{Entity: c.Entity, EntityID: c.EntityID, Create: c.Create, Patch: c.Patch, Base: c.Base})
	}
	return kept, len(items) - len(kept), nil
}

// openFields reports whether every patch and base value is a field of the entity
// with a value the op schema accepts.
func openFields(c Change) bool {
	check := func(f string, v json.RawMessage) bool {
		return opsync.Validate(opsync.Op{ID: "open", Entity: c.Entity, EntityID: c.EntityID, Field: f, Value: v, TS: 1, Device: "open"}) == nil
	}
	for f, v := range c.Patch {
		if !check(f, v) {
			return false
		}
	}
	for f, v := range c.Base {
		if !check(f, v) {
			return false
		}
	}
	return true
}
