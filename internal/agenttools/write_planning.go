package agenttools

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/e2ee"
	"github.com/pixari/opentodo/internal/location"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Planning fields in the write tools (OpenSpec change agent-planning-fields,
// design D1-D3): deadline, start, evening, blocked_by and location, written
// exactly as sent. The planner mirrors what ApplyStrict checks against state
// (blockers in scope and acyclic, a saved location that exists) so a planned
// batch never fails late.

// planningFields are the item keys this file reads.
var planningFields = []string{"deadline", "start", "evening", "blocked_by", "location"}

// planningProps are the schema properties of the five fields.
func planningProps() map[string]any {
	return map[string]any{
		"deadline": map[string]any{"type": []string{"string", "null"}, "format": "date",
			"description": "Must be done by this date (YYYY-MM-DD), separate from the do-on date; null removes it."},
		"start": map[string]any{"type": []string{"string", "null"},
			"description": "Do not show before this date (YYYY-MM-DD), or \"someday\" to park the task without a date; null makes it active. Written as sent: parking does not clear the do-on date, send due null too (schedule_tasks) if you mean that."},
		"evening": map[string]any{"type": "boolean", "description": "true puts the task in This Evening of its day; false takes it out."},
		"blocked_by": map[string]any{"type": "array", "maxItems": opsync.MaxBlockedBy, "items": map[string]any{"type": "string"},
			"description": "Ids of tasks this one waits for (same project sharing, never itself, no cycles); an empty array removes every blocker."},
		"location": map[string]any{"type": []string{"object", "null"}, "additionalProperties": false,
			"description": "Where the task happens: a saved location by place_id (its name, address and coordinates are copied), or a name, an address and/or lat and lon; null removes it.",
			"properties": map[string]any{
				"place_id": map[string]any{"type": "string", "description": "Id of one of the user's saved locations."},
				"name":     map[string]any{"type": "string", "maxLength": location.MaxName, "description": "Place name."},
				"address":  map[string]any{"type": "string", "maxLength": location.MaxAddress, "description": "Street address."},
				"lat":      map[string]any{"type": "number", "minimum": -90, "maximum": 90, "description": "Latitude."},
				"lon":      map[string]any{"type": "number", "minimum": -180, "maximum": 180, "description": "Longitude."},
			}},
	}
}

// addPlanningProps merges the five fields into a tool's item properties.
func addPlanningProps(props map[string]any) map[string]any {
	for k, v := range planningProps() {
		props[k] = v
	}
	return props
}

func calendarDate(v string) bool {
	t, err := time.Parse("2006-01-02", v)
	return err == nil && t.Format("2006-01-02") == v
}

// planningPatch reads an item's planning fields into patch. Blockers are read
// here and checked against state for the whole call by checkBlockers.
func (snap *snapshot) planningPatch(p string, it args, c Caller, patch map[string]json.RawMessage) error {
	if v, ok := it["deadline"]; ok {
		if string(v) == "null" {
			patch["deadline"] = nullRaw
		} else {
			var d string
			if json.Unmarshal(v, &d) != nil || !calendarDate(d) {
				return argErr(p + "deadline: must be a calendar date in YYYY-MM-DD form or null")
			}
			patch["deadline"] = raw(d)
		}
	}
	if v, ok := it["start"]; ok {
		if string(v) == "null" {
			patch["start"] = nullRaw
		} else {
			var d string
			if json.Unmarshal(v, &d) != nil || (d != "someday" && !calendarDate(d)) {
				return argErr(p + "start: must be a calendar date in YYYY-MM-DD form, \"someday\" or null")
			}
			patch["start"] = raw(d)
		}
	}
	if v, ok := it["evening"]; ok {
		var b bool
		if json.Unmarshal(v, &b) != nil {
			return argErr(p + "evening: must be true or false")
		}
		patch["evening"] = raw(b)
	}
	if v, ok := it["blocked_by"]; ok {
		var list []string
		if string(v) != "null" && json.Unmarshal(v, &list) != nil {
			return argErr(p + "blocked_by: must be an array of task ids")
		}
		seen := map[string]bool{}
		out := []string{}
		for _, id := range list {
			id = strings.TrimSpace(id)
			if id == "" || len(id) > opsync.MaxIDLen {
				return argErr(p + "blocked_by: ids must be non-empty strings")
			}
			if !seen[id] {
				seen[id] = true
				out = append(out, id)
			}
		}
		if len(out) > opsync.MaxBlockedBy {
			return argErr(fmt.Sprintf("%sblocked_by: at most %d tasks", p, opsync.MaxBlockedBy))
		}
		patch["blocked_by"] = raw(out)
	}
	if v, ok := it["location"]; ok {
		loc, err := snap.locationValue(p, v, c)
		if err != nil {
			return err
		}
		patch["location"] = loc
	}
	return nil
}

// locationValue checks a location argument: null, an encrypted account's
// envelope (stored as given), or a plaintext object; a place_id names one of
// the user's live saved locations, whose current values are copied next to it
// (task-locations D2) and rounded to six decimals.
func (snap *snapshot) locationValue(p string, v json.RawMessage, c Caller) (json.RawMessage, error) {
	if string(v) == "null" {
		return nullRaw, nil
	}
	if c.Encrypted {
		var s string
		if json.Unmarshal(v, &s) == nil && e2ee.IsEnvelope(s) {
			return v, nil
		}
	}
	l, err := decodeLocationArg(v)
	if err != nil {
		return nil, argErr(p + err.Error())
	}
	if l.PlaceID != "" {
		pl, ok := snap.places[l.PlaceID]
		if !ok {
			return nil, notFound("saved location", []string{l.PlaceID})
		}
		if name := plainOrEmpty(pl, "name"); name != "" {
			l.Name = name
		}
		if addr := plainOrEmpty(pl, "address"); addr != "" {
			l.Address = addr
		}
		if g, err := location.DecodeGeo(pl["geo"]); err == nil {
			lat, lon := g.Lat, g.Lon
			l.Lat, l.Lon = &lat, &lon
		}
	}
	if l.Lat != nil {
		lat, lon := location.Round6(*l.Lat), location.Round6(*l.Lon)
		l.Lat, l.Lon = &lat, &lon
	}
	if err := l.Validate(); err != nil {
		return nil, argErr(p + err.Error())
	}
	return raw(l), nil
}

// decodeLocationArg reads a location object; a lone place_id is allowed here
// (the saved location supplies the rest).
func decodeLocationArg(v json.RawMessage) (location.Location, error) {
	var probe map[string]json.RawMessage
	if json.Unmarshal(v, &probe) != nil {
		return location.Location{}, fmt.Errorf("location: must be an object or null")
	}
	if len(probe) == 1 {
		if pid, ok := probe["place_id"]; ok {
			var s string
			if json.Unmarshal(pid, &s) != nil || strings.TrimSpace(s) == "" || len(s) > location.MaxPlaceID {
				return location.Location{}, fmt.Errorf("location.place_id: must be the id of a saved location")
			}
			return location.Location{PlaceID: strings.TrimSpace(s)}, nil
		}
	}
	l, err := location.Decode(v)
	if err != nil {
		return location.Location{}, fmt.Errorf("location: %s", strings.TrimPrefix(err.Error(), "location "))
	}
	return l, nil
}

// blockerEntry is one planned blocked_by list with where it came from.
type blockerEntry struct {
	prefix  string // "items[0]." or "updates[1]."
	taskID  string
	project string // the task's project after the call
	list    []string
}

// checkBlockers checks every planned blocked_by list of a call against state:
// each id a live task the caller can see (or one this call creates), never the
// task itself, in the task's sharing scope, and no cycle through the lists the
// call leaves behind over the scope's stored graph.
func (r *Registry) checkBlockers(ctx context.Context, c Caller, snap *snapshot, entries []blockerEntry, created map[string]string) error {
	var missing []string
	for _, e := range entries {
		for _, id := range e.list {
			if id == e.taskID {
				return argErr(fmt.Sprintf("%sblocked_by: a task cannot wait for itself (%s)", e.prefix, id))
			}
			proj, ok := created[id]
			if !ok {
				t := snap.task(id)
				if t == nil {
					missing = append(missing, id)
					continue
				}
				proj = rawStr(t, "project_id")
			}
			if snap.scopeKey(proj) != snap.scopeKey(e.project) {
				return argErr(fmt.Sprintf("%sblocked_by: task %s is in a project shared differently; a task can only wait for tasks of the same sharing", e.prefix, id))
			}
		}
	}
	if len(missing) > 0 {
		sort.Strings(missing)
		return notFound("task", missing)
	}
	graphs := map[string]map[string][]string{}
	for _, e := range entries {
		if len(e.list) == 0 {
			continue
		}
		key := snap.scopeKey(e.project)
		if _, ok := graphs[key]; ok {
			continue
		}
		scope := opsync.PersonalScope(c.UserID)
		if key != "personal" {
			scope = opsync.ProjectScope(strings.TrimPrefix(key, "project:"))
		}
		g, err := r.sync.ScopeBlockedGraph(ctx, scope)
		if err != nil {
			return err
		}
		// Planned edits earlier in the turn (in-app overlay) are in the snapshot.
		for _, t := range snap.tasks {
			if snap.scopeKey(rawStr(t, "project_id")) == key {
				if l := stringList(t, "blocked_by"); len(l) > 0 {
					g[rawStr(t, "id")] = l
				}
			}
		}
		graphs[key] = g
	}
	for _, e := range entries {
		g := graphs[snap.scopeKey(e.project)]
		if g == nil {
			continue
		}
		g[e.taskID] = e.list
	}
	for _, e := range entries {
		g := graphs[snap.scopeKey(e.project)]
		for _, id := range e.list {
			if reaches(g, []string{id}, e.taskID) {
				return argErr(fmt.Sprintf("%sblocked_by: waiting for %s would close a cycle (that task already waits for this one, directly or through others)", e.prefix, id))
			}
		}
	}
	return nil
}

// reaches reports whether target is reachable from any of start (the sync rule).
func reaches(graph map[string][]string, start []string, target string) bool {
	seen := map[string]bool{}
	stack := append([]string(nil), start...)
	for len(stack) > 0 {
		id := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		if id == target {
			return true
		}
		if seen[id] {
			continue
		}
		seen[id] = true
		stack = append(stack, graph[id]...)
	}
	return false
}

// blockedNow reports whether any blocker is a live open task (task-dependencies
// "Blocked state is derived"): completed or deleted blockers do not block.
func (snap *snapshot) blockedNow(t opsync.Entity) bool {
	if !isOpen(t) {
		return false
	}
	for _, id := range stringList(t, "blocked_by") {
		if b := snap.task(id); b != nil && isOpen(b) {
			return true
		}
	}
	return false
}
