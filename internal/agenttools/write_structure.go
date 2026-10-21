package agenttools

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"

	"github.com/pixari/opentodo/internal/iconset"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Project and section structure (OpenSpec change mcp-projects, design D1, D2,
// D4): update_project, set_favourite and the section tools. Archiving and
// deleting stay out; a project's description stays read-only.

// gap is the distance between neighbours a new position keeps (web/src/lib/ordering.ts GAP).
const gap = 1000

var (
	colorProp    = map[string]any{"type": "string", "description": "Colour as #rrggbb."}
	iconProp     = map[string]any{"type": []string{"string", "null"}, "description": "An icon name from list_icons, or null for none."}
	positionProp = map[string]any{"type": "number", "description": "Sort position: smaller comes first."}
	chosenIDProp = map[string]any{"type": "string", "description": "Optional id (a UUID) you choose for the new item; refused as conflict when anything already has it."}
	sectionName  = map[string]any{"type": "string", "minLength": 1, "maxLength": 200, "description": "Section name."}
)

func init() {
	register(tool{def: func(Caller) Definition {
		return writeDef("update_project", "Update a project",
			"Rename, recolour or give an icon to a project, move it under another project (parent_id, null for the top level) or change its position. Archiving, deleting and the project's description are not available.",
			object([]string{"id"}, map[string]any{
				"id":        map[string]any{"type": "string", "description": "Project id."},
				"name":      map[string]any{"type": "string", "minLength": 1, "maxLength": 200, "description": "New name."},
				"color":     colorProp,
				"icon":      iconProp,
				"parent_id": map[string]any{"type": []string{"string", "null"}, "description": "Parent project id, or null for the top level."},
				"position":  positionProp,
			}), false, true, []string{"name"}, false)
	}, plan: (*Registry).planUpdateProject})

	register(tool{def: func(Caller) Definition {
		return writeDef("set_favourite", "Add to or remove from Favourites",
			"Pin a project to the user's Favourites in the sidebar (at the end) or remove it; the other entries keep their order.",
			object([]string{"kind", "id", "favourite"}, map[string]any{
				"kind":      map[string]any{"type": "string", "enum": []string{"project"}, "description": "What to pin: project."},
				"id":        map[string]any{"type": "string", "description": "Project id."},
				"favourite": map[string]any{"type": "boolean", "description": "true to pin, false to remove."},
			}), false, true, nil, false)
	}, plan: (*Registry).planSetFavourite})

	register(tool{def: func(Caller) Definition {
		item := object([]string{"name"}, map[string]any{
			"name": sectionName, "color": colorProp, "icon": iconProp, "position": positionProp, "id": chosenIDProp,
		})
		return writeDef("create_sections", "Create sections",
			fmt.Sprintf("Create up to %d sections in one project, after its existing sections unless position is given. Returns their ids in order.", PerCall),
			object([]string{"project_id", "items"}, map[string]any{
				"project_id":        map[string]any{"type": "string", "description": "Project id."},
				"items":             map[string]any{"type": "array", "minItems": 1, "maxItems": PerCall, "items": item},
				"client_request_id": requestIDProp,
			}), false, false, []string{"name"}, true)
	}, plan: (*Registry).planCreateSections})

	register(tool{def: func(Caller) Definition {
		return writeDef("update_sections", "Update sections",
			fmt.Sprintf("Rename, recolour, give an icon to or move up to %d sections.", PerCall),
			object([]string{"updates"}, map[string]any{
				"updates": map[string]any{"type": "array", "minItems": 1, "maxItems": PerCall, "items": object([]string{"id"}, map[string]any{
					"id": map[string]any{"type": "string", "description": "Section id."}, "name": sectionName, "color": map[string]any{"type": []string{"string", "null"}, "description": "Colour as #rrggbb, or null for the default."},
					"icon": iconProp, "position": positionProp,
				})},
			}), false, true, []string{"name"}, false)
	}, plan: (*Registry).planUpdateSections})

	register(tool{def: func(Caller) Definition {
		return writeDef("reorder_sections", "Reorder sections",
			"Put the listed sections of one project first, in the given order; sections not listed keep their order after them.",
			object([]string{"project_id", "ids"}, map[string]any{
				"project_id": map[string]any{"type": "string", "description": "Project id."},
				"ids":        map[string]any{"type": "array", "minItems": 1, "maxItems": PerCall, "items": map[string]any{"type": "string"}, "description": "Section ids in the new order."},
			}), false, true, nil, false)
	}, plan: (*Registry).planReorderSections})
}

// ---- shared argument readers ----

// icon reads an icon argument: a catalogue name or null (design D2).
func (a args) icon(prefix string) (json.RawMessage, bool, error) {
	v, ok := a["icon"]
	if !ok {
		return nil, false, nil
	}
	if string(v) == "null" {
		return nullRaw, true, nil
	}
	var name string
	if json.Unmarshal(v, &name) != nil || !iconset.Valid(name) {
		return nil, false, argErr(prefix + "icon: not an icon of the catalogue; find one with list_icons")
	}
	return raw(name), true, nil
}

// position reads an optional finite position.
func (a args) position(prefix string) (json.RawMessage, bool, error) {
	if !a.present("position") {
		return nil, false, nil
	}
	var f float64
	if json.Unmarshal(a["position"], &f) != nil {
		return nil, false, argErr(prefix + "position: must be a number")
	}
	return raw(f), true, nil
}

var uuidRe = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// chosenID reads an item's optional caller-chosen id (design D4).
func (a args) chosenID(prefix string) (string, error) {
	v, err := a.str("id")
	if err != nil {
		return "", argErr(prefix + err.Error())
	}
	if v == "" {
		return "", nil
	}
	v = strings.ToLower(v)
	if !uuidRe.MatchString(v) {
		return "", argErr(prefix + "id: must be a UUID")
	}
	return v, nil
}

// claimIDs checks caller-chosen ids of a create (design D4): an id nothing has
// yet is free; one this same request created before (a retry with the same
// client_request_id, recognised by its derived op id) is a replay; anything
// else is a conflict and refuses the whole call.
func (r *Registry) claimIDs(ctx context.Context, c Caller, cs ChangeSet, chosen map[string]bool) error {
	for _, ch := range cs {
		if !chosen[ch.EntityID] {
			continue
		}
		// Any account's entity counts: ids are global in the op log.
		var x string
		err := r.sync.DB().QueryRowContext(ctx, `SELECT op_id FROM ops WHERE entity_id = ? LIMIT 1`, ch.EntityID).Scan(&x)
		if errors.Is(err, sql.ErrNoRows) {
			continue
		}
		if err != nil {
			return err
		}
		if ch.opSeed != "" {
			err := r.sync.DB().QueryRowContext(ctx, `SELECT op_id FROM ops WHERE user_id = ? AND op_id = ?`, c.UserID, ch.OpID("created_at")).Scan(&x)
			if err == nil {
				continue
			}
			if !errors.Is(err, sql.ErrNoRows) {
				return err
			}
		}
		return &ToolError{Code: "conflict", Message: "the id you chose is already used; nothing was created", Data: map[string]any{"id": ch.EntityID}}
	}
	return nil
}

// ---- update_project ----

func (r *Registry) planUpdateProject(ctx context.Context, c Caller, a args, overlay ChangeSet) (Plan, error) {
	if err := a.only("", "id", "name", "color", "icon", "parent_id", "position"); err != nil {
		return Plan{}, err
	}
	id, err := a.str("id")
	if err != nil || id == "" {
		return Plan{}, argErr("id: the project id is required")
	}
	patch := map[string]json.RawMessage{}
	if v, has, err := a.contentText(c, "name", false, 200); err != nil {
		return Plan{}, err
	} else if has {
		if strings.TrimSpace(v) == "" {
			return Plan{}, argErr("name: must not be empty")
		}
		patch["name"] = raw(strings.TrimSpace(v))
	}
	if a.present("color") {
		col, err := a.color("")
		if err != nil {
			return Plan{}, err
		}
		patch["color"] = col
	}
	if v, has, err := a.icon(""); err != nil {
		return Plan{}, err
	} else if has {
		patch["icon"] = v
	}
	if v, has, err := a.position(""); err != nil {
		return Plan{}, err
	} else if has {
		patch["position"] = v
	}
	snap, err := r.loadFor(ctx, c, overlay)
	if err != nil {
		return Plan{}, err
	}
	p, ok := snap.projects[id]
	if !ok {
		return Plan{}, notFound("project", []string{id})
	}
	if v, ok := a["parent_id"]; ok {
		parent, err := snap.projectParent(id, v)
		if err != nil {
			return Plan{}, err
		}
		patch["parent_id"] = parent
	}
	if len(patch) == 0 {
		return Plan{}, argErr("nothing to change: give name, color, icon, parent_id or position")
	}
	role := snap.role(id)
	for f := range patch {
		if !opsync.CanWrite(role, "project", f) {
			return Plan{}, forbidden([]map[string]any{{"id": id, "reason": "forbidden", "role": role}})
		}
	}
	if err := checkPatch("", "project", id, patch); err != nil {
		return Plan{}, err
	}
	for f, v := range patch {
		if opsync.SameJSON(p[f], v) {
			delete(patch, f)
		}
	}
	if len(patch) == 0 {
		return Plan{Result: result("update_project", []map[string]any{{"id": id, "status": "unchanged"}}, 0)}, nil
	}
	cs := ChangeSet{{Entity: "project", EntityID: id, Patch: patch, Base: base(p, patch)}}
	return Plan{Result: result("update_project", []map[string]any{{"id": id, "status": "updated"}}, 1), Changes: cs, Count: 1}, nil
}

// projectParent checks a new parent the way REST does (project-hierarchy): null,
// or a live project that is neither the project itself nor one of its descendants.
func (snap *snapshot) projectParent(id string, v json.RawMessage) (json.RawMessage, error) {
	if string(v) == "null" {
		return nullRaw, nil
	}
	var parent string
	if json.Unmarshal(v, &parent) != nil || strings.TrimSpace(parent) == "" {
		return nil, argErr("parent_id: must be a project id or null")
	}
	if _, ok := snap.projects[parent]; !ok {
		return nil, notFound("project", []string{parent})
	}
	seen := map[string]bool{}
	for cur := parent; cur != "" && !seen[cur]; {
		if cur == id {
			return nil, &ToolError{Code: "invalid", Message: "a project cannot be moved under itself or one of its sub-projects; nothing was changed",
				Data: map[string]any{"id": id, "parent_id": parent}}
		}
		seen[cur] = true
		next, ok := snap.projects[cur]
		if !ok {
			break
		}
		cur = rawStr(next, "parent_id")
	}
	return raw(parent), nil
}

// ---- set_favourite ----

func (r *Registry) planSetFavourite(ctx context.Context, c Caller, a args, overlay ChangeSet) (Plan, error) {
	if err := a.only("", "kind", "id", "favourite"); err != nil {
		return Plan{}, err
	}
	kind, err := a.str("kind")
	if err != nil || kind != "project" {
		return Plan{}, argErr(`kind: must be "project"`)
	}
	id, err := a.str("id")
	if err != nil || id == "" {
		return Plan{}, argErr("id: the project id is required")
	}
	if !a.present("favourite") {
		return Plan{}, argErr("favourite: is required")
	}
	on, err := a.boolean("favourite")
	if err != nil {
		return Plan{}, err
	}
	snap, err := r.loadFor(ctx, c, overlay)
	if err != nil {
		return Plan{}, err
	}
	if _, ok := snap.projects[id]; !ok {
		return Plan{}, notFound("project", []string{id})
	}
	prefs, err := r.get(ctx, c.UserID, "user_prefs", "me")
	if err != nil {
		return Plan{}, err
	}
	var current string
	if prefs != nil {
		current = rawStr(prefs, "favourites")
	}
	list := FavouriteEntries(current)
	entry := kind + ":" + id
	next := make([]string, 0, len(list)+1)
	has := false
	for _, e := range list {
		if e == entry {
			has = true
			if !on {
				continue
			}
		}
		next = append(next, e)
	}
	if on && !has {
		next = append(next, entry)
	}
	if on == has {
		return Plan{Result: result("set_favourite", []map[string]any{{"id": id, "status": "unchanged"}}, 0)}, nil
	}
	patch := map[string]json.RawMessage{"favourites": raw(strings.Join(next, ","))}
	if err := checkPatch("", "user_prefs", "me", patch); err != nil {
		return Plan{}, err
	}
	b := map[string]json.RawMessage{"favourites": raw(current)}
	cs := ChangeSet{{Entity: "user_prefs", EntityID: "me", Patch: patch, Base: b}}
	return Plan{Result: result("set_favourite", []map[string]any{{"id": id, "status": "updated", "favourite": on}}, 1), Changes: cs, Count: 1}, nil
}

// FavouriteEntries parses user_prefs.favourites like parseFavourites in
// web/src/lib/favourites.ts: trimmed kind:id entries in order, de-duplicated.
func FavouriteEntries(s string) []string {
	var out []string
	seen := map[string]bool{}
	for _, part := range strings.Split(s, ",") {
		e := strings.TrimSpace(part)
		if e != "" && strings.Contains(e, ":") && !seen[e] {
			seen[e] = true
			out = append(out, e)
		}
	}
	return out
}

// ---- sections ----

// liveSections lists a project's live sections in position order.
func (r *Registry) liveSections(ctx context.Context, uid, projectID string) ([]opsync.Entity, error) {
	all, err := r.list(ctx, uid, "section", false)
	if err != nil {
		return nil, err
	}
	var out []opsync.Entity
	for _, s := range all {
		if rawStr(s, "project_id") == projectID && !deleted(s) {
			out = append(out, s)
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return num(out[i], "position") < num(out[j], "position") })
	return out, nil
}

// sectionRoleCheck refuses a section change the caller's role does not allow.
func (snap *snapshot) sectionRoleCheck(projectID string, fields ...string) error {
	role := snap.role(projectID)
	for _, f := range fields {
		if !opsync.CanWrite(role, "section", f) {
			return forbidden([]map[string]any{{"project_id": projectID, "reason": "forbidden", "role": role}})
		}
	}
	return nil
}

func (r *Registry) planCreateSections(ctx context.Context, c Caller, a args, overlay ChangeSet) (Plan, error) {
	if err := a.only("", "project_id", "items", "client_request_id"); err != nil {
		return Plan{}, err
	}
	pid, err := a.str("project_id")
	if err != nil || pid == "" {
		return Plan{}, argErr("project_id: the project id is required")
	}
	list, err := a.items("items")
	if err != nil {
		return Plan{}, err
	}
	seed, err := a.requestID(c)
	if err != nil {
		return Plan{}, err
	}
	snap, err := r.loadFor(ctx, c, overlay)
	if err != nil {
		return Plan{}, err
	}
	if _, ok := snap.projects[pid]; !ok {
		return Plan{}, notFound("project", []string{pid})
	}
	if err := snap.sectionRoleCheck(pid, "name", "position"); err != nil {
		return Plan{}, err
	}
	existing, err := r.liveSections(ctx, c.UserID, pid)
	if err != nil {
		return Plan{}, err
	}
	next := float64(stamp())
	if n := len(existing); n > 0 {
		next = num(existing[n-1], "position") + gap
	}
	now := stamp()
	var cs ChangeSet
	var out []map[string]any
	chosen := map[string]bool{}
	for i, it := range list {
		p := fmt.Sprintf("items[%d].", i)
		if err := it.only(p, "name", "color", "icon", "position", "id"); err != nil {
			return Plan{}, err
		}
		name, _, err := it.contentText(c, "name", true, 200)
		if err != nil {
			return Plan{}, argErr(p + err.Error())
		}
		id, err := it.chosenID(p)
		if err != nil {
			return Plan{}, err
		}
		if id == "" {
			id = entityID(seed, i)
		} else {
			if chosen[id] {
				return Plan{}, argErr(p + "id: each id may appear only once per call")
			}
			chosen[id] = true
		}
		patch := map[string]json.RawMessage{"name": raw(strings.TrimSpace(name)), "project_id": raw(pid), "position": raw(next),
			"color": nullRaw, "icon": nullRaw, "created_at": raw(now), "deleted_at": nullRaw}
		next += gap
		if it.present("color") {
			col, err := it.color("")
			if err != nil {
				return Plan{}, argErr(p + err.Error())
			}
			patch["color"] = col
		}
		if v, has, err := it.icon(p); err != nil {
			return Plan{}, err
		} else if has {
			patch["icon"] = v
		}
		if v, has, err := it.position(p); err != nil {
			return Plan{}, err
		} else if has {
			patch["position"] = v
		}
		if err := checkPatch(p, "section", id, patch); err != nil {
			return Plan{}, err
		}
		cs = append(cs, Change{Entity: "section", EntityID: id, Create: true, Patch: patch, opSeed: seed})
		out = append(out, map[string]any{"id": id, "status": "created"})
	}
	if err := r.claimIDs(ctx, c, cs, chosen); err != nil {
		return Plan{}, err
	}
	return Plan{Result: result("create_sections", out, len(cs)), Changes: cs, Count: len(cs)}, nil
}

func (r *Registry) planUpdateSections(ctx context.Context, c Caller, a args, overlay ChangeSet) (Plan, error) {
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
	var cs ChangeSet
	var out []map[string]any
	var missing []string
	seen := map[string]bool{}
	for i, it := range list {
		p := fmt.Sprintf("updates[%d].", i)
		if err := it.only(p, "id", "name", "color", "icon", "position"); err != nil {
			return Plan{}, err
		}
		id, err := it.str("id")
		if err != nil || id == "" {
			return Plan{}, argErr(p + "id: the section id is required")
		}
		if seen[id] {
			return Plan{}, argErr(p + "id: each section may appear only once per call")
		}
		seen[id] = true
		pid, ok := snap.sectionProject[id]
		if !ok {
			missing = append(missing, id)
			continue
		}
		patch := map[string]json.RawMessage{}
		if v, has, err := it.contentText(c, "name", false, 200); err != nil {
			return Plan{}, argErr(p + err.Error())
		} else if has {
			if strings.TrimSpace(v) == "" {
				return Plan{}, argErr(p + "name: must not be empty")
			}
			patch["name"] = raw(strings.TrimSpace(v))
		}
		if v, ok := it["color"]; ok {
			if string(v) == "null" {
				patch["color"] = nullRaw
			} else {
				col, err := it.color("")
				if err != nil {
					return Plan{}, argErr(p + err.Error())
				}
				patch["color"] = col
			}
		}
		if v, has, err := it.icon(p); err != nil {
			return Plan{}, err
		} else if has {
			patch["icon"] = v
		}
		if v, has, err := it.position(p); err != nil {
			return Plan{}, err
		} else if has {
			patch["position"] = v
		}
		if len(patch) == 0 {
			return Plan{}, argErr(p + "nothing to change: give name, color, icon or position")
		}
		fields := make([]string, 0, len(patch))
		for f := range patch {
			fields = append(fields, f)
		}
		if err := snap.sectionRoleCheck(pid, fields...); err != nil {
			return Plan{}, err
		}
		if err := checkPatch(p, "section", id, patch); err != nil {
			return Plan{}, err
		}
		cur, err := r.get(ctx, c.UserID, "section", id)
		if err != nil {
			return Plan{}, err
		}
		for f, v := range patch {
			if cur != nil && opsync.SameJSON(cur[f], v) {
				delete(patch, f)
			}
		}
		if len(patch) == 0 {
			out = append(out, map[string]any{"id": id, "status": "unchanged"})
			continue
		}
		cs = append(cs, Change{Entity: "section", EntityID: id, Patch: patch, Base: base(cur, patch)})
		out = append(out, map[string]any{"id": id, "status": "updated"})
	}
	if len(missing) > 0 {
		return Plan{}, notFound("section", missing)
	}
	return Plan{Result: result("update_sections", out, len(cs)), Changes: cs, Count: len(cs)}, nil
}

func (r *Registry) planReorderSections(ctx context.Context, c Caller, a args, overlay ChangeSet) (Plan, error) {
	if err := a.only("", "project_id", "ids"); err != nil {
		return Plan{}, err
	}
	pid, err := a.str("project_id")
	if err != nil || pid == "" {
		return Plan{}, argErr("project_id: the project id is required")
	}
	order, err := a.idList("ids")
	if err != nil {
		return Plan{}, err
	}
	snap, err := r.loadFor(ctx, c, overlay)
	if err != nil {
		return Plan{}, err
	}
	if _, ok := snap.projects[pid]; !ok {
		return Plan{}, notFound("project", []string{pid})
	}
	if err := snap.sectionRoleCheck(pid, "position"); err != nil {
		return Plan{}, err
	}
	live, err := r.liveSections(ctx, c.UserID, pid)
	if err != nil {
		return Plan{}, err
	}
	byID := map[string]opsync.Entity{}
	for _, s := range live {
		byID[str(s, "id")] = s
	}
	var missing []string
	for _, id := range order {
		if _, ok := byID[id]; !ok {
			missing = append(missing, id)
		}
	}
	if len(missing) > 0 {
		return Plan{}, notFound("section", missing)
	}
	// The listed sections go before every other one, one gap apart; sections
	// not listed keep their positions (and so their order after them).
	listed := map[string]bool{}
	for _, id := range order {
		listed[id] = true
	}
	start := float64(stamp())
	first := true
	for _, s := range live {
		if listed[str(s, "id")] {
			continue
		}
		if pos := num(s, "position"); first || pos < start {
			start, first = pos, false
		}
	}
	if first {
		start = float64(len(order)+1) * gap
	}
	var cs ChangeSet
	var out []map[string]any
	for i, id := range order {
		pos := raw(start - float64(len(order)-i)*gap)
		cur := byID[id]
		if opsync.SameJSON(cur["position"], pos) {
			out = append(out, map[string]any{"id": id, "status": "unchanged"})
			continue
		}
		patch := map[string]json.RawMessage{"position": pos}
		cs = append(cs, Change{Entity: "section", EntityID: id, Patch: patch, Base: base(cur, patch)})
		out = append(out, map[string]any{"id": id, "status": "updated"})
	}
	return Plan{Result: result("reorder_sections", out, len(cs)), Changes: cs, Count: len(cs)}, nil
}
