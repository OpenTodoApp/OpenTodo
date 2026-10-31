package agenttools

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/relay"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// The project note in update_project and the archive tool (OpenSpec change
// agent-tools-complete, design D3 and D4).

// MaxProjectNote caps the Markdown an assistant sends as a project's note or
// as one appended block, in characters; the stored note also stays within the
// op value limit.
const MaxProjectNote = 20000

var (
	projectNoteProp = map[string]any{"type": "string", "maxLength": MaxProjectNote,
		"description": "The project's whole note (Markdown); replaces what is there. Prefer append_description to add to it."}
	projectAppendProp = map[string]any{"type": "string", "minLength": 1, "maxLength": MaxProjectNote,
		"description": "Markdown added at the end of the project's note, after a blank line; nothing written before changes."}
)

func init() {
	register(tool{def: func(Caller) Definition {
		return writeDef("archive_projects", "Archive or unarchive a project",
			"Archive a project together with its sub-projects (archived true), as archiving it in the app does, or bring one project back (archived false; its sub-projects stay archived). One project per call. Needs the owner or admin role on a shared project. Archived projects and their tasks leave the sidebar and the task lists until unarchived; nothing is deleted.",
			object([]string{"id", "archived"}, map[string]any{
				"id":       map[string]any{"type": "string", "description": "Project id."},
				"archived": map[string]any{"type": "boolean", "description": "true to archive with the sub-projects, false to unarchive this project."},
			}), false, true, nil, false)
	}, plan: (*Registry).planArchiveProjects})
}

// projectNote reads update_project's description or append_description into
// the new value of project.description (D3). notes_doc is never written: a
// device folds the new description into the document. For an encrypted account
// an append works only through an opted-in device, which decrypts the note here
// and encrypts the result in relayEncrypt.
func (r *Registry) projectNote(ctx context.Context, c Caller, a args, p opsync.Entity, role string) (json.RawMessage, bool, error) {
	hasDesc, hasAppend := a.present("description"), a.present("append_description")
	if !hasDesc && !hasAppend {
		return nil, false, nil
	}
	id := rawStr(p, "id")
	if !opsync.CanWrite(role, "project", "description") {
		return nil, false, forbidden([]map[string]any{{"id": id, "reason": "forbidden", "role": role}})
	}
	var note string
	if hasDesc {
		v, _, err := a.contentText(c, "description", false, MaxProjectNote)
		if err != nil {
			return nil, false, err
		}
		note = v
	} else {
		if c.Encrypted && !c.relayed() {
			// The server cannot read the note it would append to.
			return nil, false, encryptionErr()
		}
		text, _, err := a.text("append_description", true, MaxProjectNote)
		if err != nil {
			return nil, false, err
		}
		cur := rawStr(p, "description")
		if c.relayed() && e2ee.IsCiphertext(cur) {
			res, err := c.Relay.Do(ctx, relay.Decrypt, []relay.Item{{Entity: "project", ID: id, Field: "description", Value: cur}}, relayCall(c, "update_project", true))
			if err != nil {
				return nil, false, relayToolErr(err)
			}
			if len(res) != 1 || res[0].Error != "" {
				return nil, false, relayToolErr(&relay.Error{Code: relay.CodeUnavailable})
			}
			cur = res[0].Value
		}
		note = AppendBlock(cur, text)
	}
	v := raw(note)
	if len(v) > opsync.MaxValueBytes {
		return nil, false, &ToolError{Code: "invalid", Message: "the note would become too long; nothing was changed", Data: map[string]any{"id": id}}
	}
	return v, true, nil
}

// AppendBlock adds Markdown at the end of a note after a blank line.
func AppendBlock(note, text string) string {
	note = strings.TrimRight(note, " \t\r\n")
	if note == "" {
		return text
	}
	return note + "\n\n" + text
}

// descendants lists the live sub-projects of id at any depth, in a stable order.
func (snap *snapshot) descendants(id string) []string {
	children := map[string][]string{}
	for pid, p := range snap.projects {
		if parent := rawStr(p, "parent_id"); parent != "" {
			children[parent] = append(children[parent], pid)
		}
	}
	var out []string
	seen := map[string]bool{id: true}
	queue := []string{id}
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		kids := children[cur]
		sort.Strings(kids)
		for _, k := range kids {
			if !seen[k] {
				seen[k] = true
				out = append(out, k)
				queue = append(queue, k)
			}
		}
	}
	return out
}

func (r *Registry) planArchiveProjects(ctx context.Context, c Caller, a args, overlay ChangeSet) (Plan, error) {
	if err := a.only("", "id", "archived"); err != nil {
		return Plan{}, err
	}
	id, err := a.str("id")
	if err != nil || id == "" {
		return Plan{}, argErr("id: the project id is required")
	}
	if !a.present("archived") {
		return Plan{}, argErr("archived: is required (true or false)")
	}
	on, err := a.boolean("archived")
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
	targets := []string{id}
	if on {
		// The project-organization rule: archiving takes the sub-projects along,
		// one op per project.
		targets = append(targets, snap.descendants(id)...)
	}
	var refused []map[string]any
	for _, pid := range targets {
		if role := snap.role(pid); !opsync.CanWrite(role, "project", "archived") {
			refused = append(refused, map[string]any{"id": pid, "reason": "forbidden", "role": role})
		}
	}
	if len(refused) > 0 {
		return Plan{}, forbidden(refused)
	}
	var cs ChangeSet
	var out []map[string]any
	for _, pid := range targets {
		p := snap.projects[pid]
		patch := map[string]json.RawMessage{"archived": raw(on)}
		if boolean(p, "archived") == on {
			out = append(out, map[string]any{"id": pid, "status": "unchanged", "archived": on})
			continue
		}
		cs = append(cs, Change{Entity: "project", EntityID: pid, Patch: patch, Base: base(p, patch)})
		status := "archived"
		if !on {
			status = "unarchived"
		}
		out = append(out, map[string]any{"id": pid, "status": status, "archived": on})
	}
	if len(cs) > PerCall {
		return Plan{}, argErr(fmt.Sprintf("id: archiving this project would change %d projects, more than %d per call", len(cs), PerCall))
	}
	return Plan{Result: result("archive_projects", out, len(cs)), Changes: cs, Count: len(cs)}, nil
}
