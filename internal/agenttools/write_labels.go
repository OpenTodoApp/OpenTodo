package agenttools

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// update_labels (OpenSpec change agent-tools-complete, design D5): rename,
// recolour and reorder the caller's labels. Labels are personal; a rename is
// one op on the label and none on tasks, which hold label ids. No tool deletes
// or merges labels.

func init() {
	register(tool{def: func(Caller) Definition {
		return writeDef("update_labels", "Update labels",
			fmt.Sprintf("Rename, recolour or move up to %d of the user's labels. A rename changes the label everywhere it is used; a name already taken by another label of the same workspace is refused.", PerCall),
			object([]string{"updates"}, map[string]any{
				"updates": map[string]any{"type": "array", "minItems": 1, "maxItems": PerCall, "items": object([]string{"id"}, map[string]any{
					"id":       map[string]any{"type": "string", "description": "Label id (see list_projects or a task's labels)."},
					"name":     map[string]any{"type": "string", "minLength": 1, "maxLength": 100, "description": "New name."},
					"color":    colorProp,
					"position": positionProp,
				})},
			}), false, true, []string{"name"}, false)
	}, plan: (*Registry).planUpdateLabels})
}

func (r *Registry) planUpdateLabels(ctx context.Context, c Caller, a args, overlay ChangeSet) (Plan, error) {
	if err := a.only("", "updates"); err != nil {
		return Plan{}, err
	}
	list, err := a.items("updates")
	if err != nil {
		return Plan{}, err
	}
	snap, err := r.loadFor(ctx, c, overlay)
	if err != nil {
		return Plan{}, err
	}
	byID := map[string]opsync.Entity{}
	for _, l := range snap.labelList {
		if !deleted(l) {
			byID[rawStr(l, "id")] = l
		}
	}
	// Names after this call, so two renames in one call are checked together.
	names := map[string]string{}
	for id, l := range byID {
		names[id] = plainOrEmpty(l, "name")
	}
	var cs ChangeSet
	var out []map[string]any
	var missing []string
	seen := map[string]bool{}
	for i, it := range list {
		p := fmt.Sprintf("updates[%d].", i)
		if err := it.only(p, "id", "name", "color", "position"); err != nil {
			return Plan{}, err
		}
		id, err := it.str("id")
		if err != nil || id == "" {
			return Plan{}, argErr(p + "id: the label id is required")
		}
		if seen[id] {
			return Plan{}, argErr(p + "id: each label may appear only once per call")
		}
		seen[id] = true
		cur, ok := byID[id]
		if !ok {
			missing = append(missing, id)
			continue
		}
		patch := map[string]json.RawMessage{}
		if v, has, err := it.contentText(c, "name", false, 100); err != nil {
			return Plan{}, argErr(p + err.Error())
		} else if has {
			v = strings.TrimSpace(v)
			if v == "" {
				return Plan{}, argErr(p + "name: must not be empty")
			}
			patch["name"] = raw(v)
			names[id] = plainOrEmpty(opsync.Entity{"name": raw(v)}, "name")
		}
		if it.present("color") {
			col, err := it.color("")
			if err != nil {
				return Plan{}, argErr(p + err.Error())
			}
			patch["color"] = col
		}
		if v, has, err := it.position(p); err != nil {
			return Plan{}, err
		} else if has {
			patch["position"] = v
		}
		if len(patch) == 0 {
			return Plan{}, argErr(p + "nothing to change: give name, color or position")
		}
		if err := checkPatch(p, "label", id, patch); err != nil {
			return Plan{}, err
		}
		for f, v := range patch {
			if opsync.SameJSON(cur[f], v) {
				delete(patch, f)
			}
		}
		if len(patch) == 0 {
			out = append(out, map[string]any{"id": id, "status": "unchanged"})
			continue
		}
		cs = append(cs, Change{Entity: "label", EntityID: id, Patch: patch, Base: base(cur, patch)})
		out = append(out, map[string]any{"id": id, "status": "updated"})
	}
	if len(missing) > 0 {
		return Plan{}, notFound("label", missing)
	}
	// The creating-device rule of labels "Label entity": one live label per name
	// (ignoring case) in a workspace. Ciphertext names are never compared.
	for _, ch := range cs {
		if _, renamed := ch.Patch["name"]; !renamed || names[ch.EntityID] == "" {
			continue
		}
		ws := rawStr(byID[ch.EntityID], "workspace_id")
		for other, name := range names {
			if other != ch.EntityID && strings.EqualFold(name, names[ch.EntityID]) && rawStr(byID[other], "workspace_id") == ws {
				return Plan{}, &ToolError{Code: "invalid", Message: "another label of this workspace (existing_id) already has that name; nothing was changed",
					Data: map[string]any{"id": ch.EntityID, "existing_id": other}}
			}
		}
	}
	return Plan{Result: result("update_labels", out, len(cs)), Changes: cs, Count: len(cs)}, nil
}
