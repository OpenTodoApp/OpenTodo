package httpapi

import (
	"context"
	"encoding/json"
	"sort"
	"strings"

	opsync "github.com/pixari/opentodo/internal/sync"
)

// CalDAV and workspaces (OpenSpec change workspaces, caldav-sync "Discovery and
// calendar collections"): one Inbox calendar per workspace — `inbox` for the
// default workspace, as before, and `inbox-<workspace id>` for the others —
// and display names prefixed with the workspace's name outside the default
// workspace. Paths never depend on a workspace, so moving a project renames
// its calendar instead of removing it.

const inboxPrefix = inboxCalendar + "-"

// davWorkspaces is what the calendar listing needs to know about workspaces.
type davWorkspaces struct {
	def   string
	names map[string]string // non-default workspace id -> name
	part  *opsync.Partition
}

// isInboxID reports whether a calendar segment names an Inbox calendar.
func isInboxID(cal string) bool { return cal == inboxCalendar || strings.HasPrefix(cal, inboxPrefix) }

func (d *davRequest) loadWorkspaces(ctx context.Context, v *davView) error {
	list, err := d.s.sync.Workspaces(ctx, v.uid)
	if err != nil {
		return err
	}
	w := &davWorkspaces{names: map[string]string{}}
	known := map[string]bool{}
	for _, ws := range list {
		known[ws.ID] = true
		if ws.Default {
			w.def = ws.ID
		} else {
			w.names[ws.ID] = ws.Name
		}
	}
	p := &opsync.Partition{Default: w.def, Known: known, Projects: map[string]opsync.PartitionProject{}, Tasks: map[string]opsync.PartitionTask{}}
	for id, pr := range v.projects {
		p.Projects[id] = opsync.PartitionProject{WorkspaceID: idOf(pr["workspace_id"]), ParentID: idOf(pr["parent_id"])}
	}
	for _, t := range v.tasks {
		p.Tasks[idOf(t["id"])] = opsync.PartitionTask{WorkspaceID: idOf(t["workspace_id"]), ProjectID: idOf(t["project_id"]), ParentID: idOf(t["parent_id"])}
	}
	w.part = p
	v.ws = w
	return nil
}

// inboxOf is the Inbox calendar of a workspace.
func (w *davWorkspaces) inboxOf(ws string) string {
	if _, other := w.names[ws]; other {
		return inboxPrefix + ws
	}
	return inboxCalendar
}

// inboxWorkspace returns the workspace of an Inbox calendar and whether cal
// names one this account has.
func (w *davWorkspaces) inboxWorkspace(cal string) (string, bool) {
	if cal == inboxCalendar {
		return w.def, true
	}
	ws, ok := strings.CutPrefix(cal, inboxPrefix)
	if !ok {
		return "", false
	}
	_, known := w.names[ws]
	return ws, known
}

// inboxes lists the Inbox calendars: the default workspace's, then the others by name.
func (w *davWorkspaces) inboxes() []string {
	ids := make([]string, 0, len(w.names))
	for id := range w.names {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool {
		if w.names[ids[i]] != w.names[ids[j]] {
			return w.names[ids[i]] < w.names[ids[j]]
		}
		return ids[i] < ids[j]
	})
	out := []string{inboxCalendar}
	for _, id := range ids {
		out = append(out, inboxPrefix+id)
	}
	return out
}

// displayName prefixes name with the workspace's name outside the default workspace.
func (w *davWorkspaces) displayName(ws, name string) string {
	if n, other := w.names[ws]; other {
		return n + " · " + name
	}
	return name
}

// workspaceValue is the workspace_id a task written into an Inbox calendar gets.
func (v *davView) workspaceValue(cal string) json.RawMessage {
	ws, _ := v.ws.inboxWorkspace(cal)
	if ws == "" || ws == v.ws.def {
		return json.RawMessage("null")
	}
	return mustJSON(ws)
}
