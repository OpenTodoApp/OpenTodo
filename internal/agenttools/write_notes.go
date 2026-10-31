package agenttools

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/ids"
	"github.com/OpenTodoApp/opentodo/internal/relay"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Note write tools (OpenSpec change notes-overview, design D12, D13):
// create_note, update_note, append_to_note, trash_note and note_to_task.
// Text is Markdown: a replacement writes only description (devices fold it
// into the document, docs/sync.md "Mergeable documents" rule 3) and carries a
// version check; an append writes only one `appends.<id>` key (rule 5) and
// never replaces anything. Results carry ids and statuses, never text.

// MaxNoteText caps a note's Markdown body and one append, in characters.
const MaxNoteText = 20000

var (
	noteTitleProp = map[string]any{"type": "string", "maxLength": 500, "description": "Note title; empty reads \"Untitled note\"."}
	noteDescProp  = map[string]any{"type": "string", "maxLength": MaxNoteText, "description": "The note's text (Markdown)."}
	noteLabelsArg = map[string]any{"type": "array", "maxItems": 50, "items": map[string]any{"type": "string"}, "description": "Label names (case-insensitive) or ids; create missing labels with create_label first."}
	noteIDsProp   = map[string]any{"type": "array", "minItems": 1, "maxItems": PerCall, "items": map[string]any{"type": "string"},
		"description": fmt.Sprintf("Note ids (see list_notes), at most %d.", PerCall)}
	appendIDRe = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)
)

func init() {
	register(tool{def: func(Caller) Definition {
		return writeDef("create_note", "Create a note",
			"Create a standalone note (not a task): a title and a Markdown text, optionally in a project and with labels. Returns its id.",
			object(nil, map[string]any{
				"title":       noteTitleProp,
				"description": noteDescProp,
				"project_id":  map[string]any{"type": "string", "description": "Project id (see list_projects); omit for a personal note."},
				"label_ids":   noteLabelsArg,
				"id":          chosenIDProp,
			}), false, false, []string{"title", "description"}, false)
	}, plan: (*Registry).planCreateNote})

	register(tool{def: func(Caller) Definition {
		return writeDef("update_note", "Update a note",
			"Change a standalone note's title, project, labels or text. description replaces the whole text and needs base_version, the body_version get_note returned: when the note changed since, the call is refused with body_changed; read it again and retry. To add text at the end without replacing anything, use append_to_note.",
			object([]string{"id"}, map[string]any{
				"id":           map[string]any{"type": "string", "description": "Note id."},
				"title":        noteTitleProp,
				"project_id":   map[string]any{"type": []string{"string", "null"}, "description": "Project id, or null for a personal note. A note cannot move between projects that are shared differently."},
				"label_ids":    noteLabelsArg,
				"description":  noteDescProp,
				"base_version": map[string]any{"type": "string", "maxLength": 200, "description": "body_version from get_note; required with description."},
			}), true, true, []string{"title", "description"}, false)
	}, plan: (*Registry).planUpdateNote})

	register(tool{def: func(Caller) Definition {
		return writeDef("append_to_note", "Append to a note",
			"Add Markdown text at the end of a standalone note (note_id) or of a task's note (task_id). Nothing is replaced: edits made on devices meanwhile are kept, and every device merges the text at the end once. Give exactly one of note_id and task_id.",
			object([]string{"text"}, map[string]any{
				"note_id":   map[string]any{"type": "string", "description": "Standalone note id."},
				"task_id":   map[string]any{"type": "string", "description": "Task id."},
				"text":      map[string]any{"type": "string", "minLength": 1, "maxLength": MaxNoteText, "description": "Text to append (Markdown)."},
				"append_id": map[string]any{"type": "string", "maxLength": 64, "description": "Optional id of this append (letters, digits, - and _); retrying with the same id never appends twice."},
			}), false, true, []string{"text"}, true)
	}, plan: (*Registry).planAppendToNote})

	register(tool{def: func(Caller) Definition {
		return writeDef("trash_note", "Move notes to the Trash",
			"Move standalone notes to the Trash, where the user can restore them. Only notes created with this same token are accepted; nothing is ever deleted permanently.",
			object([]string{"ids"}, map[string]any{"ids": noteIDsProp}), true, true, nil, false)
	}, plan: (*Registry).planTrashNote})

	register(tool{def: func(Caller) Definition {
		return writeDef("note_to_task", "Turn a note into a task",
			"Turn a standalone note into a task with the same title, text, project and labels; the note goes to the Trash. One change: undo restores the note. Returns the task id.",
			object([]string{"id"}, map[string]any{"id": map[string]any{"type": "string", "description": "Note id."}}), false, false, nil, false)
	}, plan: (*Registry).planNoteToTask})
}

// notesFor loads the snapshot and the caller's live standalone notes by id,
// with the overlay of changes planned earlier in the turn.
func (r *Registry) notesFor(ctx context.Context, c Caller, overlay ChangeSet) (*snapshot, map[string]opsync.Entity, error) {
	snap, err := r.loadFor(ctx, c, overlay)
	if err != nil {
		return nil, nil, err
	}
	list, err := r.liveNotes(ctx, c.UserID, snap)
	if err != nil {
		return nil, nil, err
	}
	notes := make(map[string]opsync.Entity, len(list))
	for _, n := range list {
		notes[rawStr(n, "id")] = n
	}
	for _, ch := range overlay {
		if ch.Entity != "note" {
			continue
		}
		n, ok := notes[ch.EntityID]
		if !ok && !ch.Create {
			continue
		}
		if !ok {
			n = opsync.Entity{"id": raw(ch.EntityID)}
		}
		notes[ch.EntityID] = merge(n, ch.Patch)
	}
	for id, n := range notes {
		if deleted(n) {
			delete(notes, id)
		}
	}
	return snap, notes, nil
}

func noteResult(tool string, items []map[string]any, changed int) map[string]any {
	return map[string]any{"tool": tool, "results": items, "changed": changed,
		"undo": "Every change is in the note's history and can be undone; trashed notes can be restored from the Trash."}
}

// noteLabels resolves label_ids like a task's labels.
func (snap *snapshot) noteLabels(a args) (json.RawMessage, bool, error) {
	if !a.present("label_ids") {
		return nil, false, nil
	}
	lids, err := snap.labelIDsFor("", a["label_ids"])
	if err != nil {
		return nil, false, err
	}
	return raw(lids), true, nil
}

// ---- create_note ----

func (r *Registry) planCreateNote(ctx context.Context, c Caller, a args, overlay ChangeSet) (Plan, error) {
	if err := a.only("", "title", "description", "project_id", "label_ids", "id"); err != nil {
		return Plan{}, err
	}
	title, _, err := a.contentText(c, "title", false, 500)
	if err != nil {
		return Plan{}, err
	}
	desc, _, err := a.contentText(c, "description", false, MaxNoteText)
	if err != nil {
		return Plan{}, err
	}
	id, err := a.chosenID("")
	if err != nil {
		return Plan{}, err
	}
	chosen := id != ""
	if !chosen {
		id = ids.New()
	}
	pid, err := a.str("project_id")
	if err != nil {
		return Plan{}, err
	}
	snap, _, err := r.notesFor(ctx, c, overlay)
	if err != nil {
		return Plan{}, err
	}
	now := stamp()
	patch := map[string]json.RawMessage{"title": raw(strings.TrimSpace(title)), "description": raw(desc), "project_id": nullRaw,
		"labels": raw([]string{}), "position": raw(now), "created_at": raw(now), "deleted_at": nullRaw}
	if pid != "" {
		if _, ok := snap.projects[pid]; !ok {
			return Plan{}, notFound("project", []string{pid})
		}
		if role := snap.role(pid); !opsync.CanWrite(role, "note", "title") {
			return Plan{}, forbidden([]map[string]any{{"project_id": pid, "reason": "forbidden", "role": role}})
		}
		patch["project_id"] = raw(pid)
	}
	if v, has, err := snap.noteLabels(a); err != nil {
		return Plan{}, err
	} else if has {
		patch["labels"] = v
	}
	if err := checkPatch("", "note", id, patch); err != nil {
		return Plan{}, err
	}
	cs := ChangeSet{{Entity: "note", EntityID: id, Create: true, Patch: patch}}
	if chosen {
		if err := r.claimIDs(ctx, c, cs, map[string]bool{id: true}); err != nil {
			return Plan{}, err
		}
	}
	return Plan{Result: noteResult("create_note", []map[string]any{{"id": id, "status": "created"}}, 1), Changes: cs, Count: 1}, nil
}

// ---- update_note ----

func bodyChanged(current string) *ToolError {
	return &ToolError{Code: "body_changed", Message: "the note's text changed since you read it (on a device or by another call); nothing was changed. Read it again with get_note and retry with its body_version.",
		Data: map[string]any{"current_version": current}}
}

func (r *Registry) planUpdateNote(ctx context.Context, c Caller, a args, overlay ChangeSet) (Plan, error) {
	if err := a.only("", "id", "title", "project_id", "label_ids", "description", "base_version"); err != nil {
		return Plan{}, err
	}
	id, err := a.str("id")
	if err != nil || id == "" {
		return Plan{}, argErr("id: the note id is required")
	}
	snap, notes, err := r.notesFor(ctx, c, overlay)
	if err != nil {
		return Plan{}, err
	}
	patch := map[string]json.RawMessage{}
	if v, has, err := a.contentText(c, "title", false, 500); err != nil {
		return Plan{}, err
	} else if has {
		patch["title"] = raw(strings.TrimSpace(v))
	}
	baseVersion, err := a.str("base_version")
	if err != nil {
		return Plan{}, err
	}
	if v, has, err := a.contentText(c, "description", false, MaxNoteText); err != nil {
		return Plan{}, err
	} else if has {
		if baseVersion == "" {
			return Plan{}, toolErr("invalid_input", "description replaces the note's whole text and needs base_version, the body_version get_note returned; to add text at the end use append_to_note")
		}
		patch["description"] = raw(v)
	} else if baseVersion != "" {
		return Plan{}, argErr("base_version: only with description")
	}
	target, moving := "", false
	if v, ok := a["project_id"]; ok {
		moving = true
		patch["project_id"] = nullRaw
		if string(v) != "null" {
			if target, err = a.str("project_id"); err != nil {
				return Plan{}, err
			}
			if _, ok := snap.projects[target]; !ok && target != "" {
				return Plan{}, notFound("project", []string{target})
			}
			if target != "" {
				patch["project_id"] = raw(target)
			}
		}
	}
	if v, has, err := snap.noteLabels(a); err != nil {
		return Plan{}, err
	} else if has {
		patch["labels"] = v
	}
	if len(patch) == 0 {
		return Plan{}, argErr("nothing to change: give at least one field besides id")
	}
	n, ok := notes[id]
	if !ok {
		return Plan{}, notFound("note", []string{id})
	}
	from := rawStr(n, "project_id")
	if moving && snap.scopeKey(from) != snap.scopeKey(target) {
		return Plan{}, &ToolError{Code: "scope_change", Message: "a note cannot move between projects that are shared differently (or between a shared project and a personal one); nothing was changed",
			Data: map[string]any{"items": []any{map[string]any{"id": id, "reason": "scope_change"}}}}
	}
	role := snap.role(from)
	for f := range patch {
		if !opsync.CanWrite(role, "note", f) {
			return Plan{}, forbidden([]map[string]any{{"id": id, "reason": "forbidden", "role": role}})
		}
	}
	if err := checkPatch("", "note", id, patch); err != nil {
		return Plan{}, err
	}
	ch := Change{Entity: "note", EntityID: id, Patch: patch, Base: base(n, patch)}
	if _, has := patch["description"]; has {
		infos, err := r.sync.BodyInfos(ctx, c.UserID, "note", id)
		if err != nil {
			return Plan{}, err
		}
		current := opsync.FormatBodyVersion(0, "")
		if info, ok := infos[id]; ok {
			current = info.Version
		}
		if current != baseVersion {
			return Plan{}, bodyChanged(current)
		}
		ch.bodyVersion = baseVersion
	}
	return Plan{Result: noteResult("update_note", []map[string]any{{"id": id, "status": "updated"}}, 1), Changes: ChangeSet{ch}, Count: 1}, nil
}

// ---- append_to_note ----

func (r *Registry) planAppendToNote(ctx context.Context, c Caller, a args, overlay ChangeSet) (Plan, error) {
	if err := a.only("", "note_id", "task_id", "text", "append_id"); err != nil {
		return Plan{}, err
	}
	noteID, err := a.str("note_id")
	if err != nil {
		return Plan{}, err
	}
	taskID, err := a.str("task_id")
	if err != nil {
		return Plan{}, err
	}
	if (noteID == "") == (taskID == "") {
		return Plan{}, argErr("give exactly one of note_id and task_id")
	}
	text, _, err := a.contentText(c, "text", true, MaxNoteText)
	if err != nil {
		return Plan{}, err
	}
	aid, err := a.str("append_id")
	if err != nil {
		return Plan{}, err
	}
	if aid != "" && !appendIDRe.MatchString(aid) {
		return Plan{}, argErr("append_id: 1 to 64 letters, digits, - or _")
	}
	if aid == "" {
		// An envelope is sealed for its field, appends.<append_id>: the caller
		// must have chosen the id it sealed for.
		if e2ee.IsEnvelope(text) {
			return Plan{}, argErr("append_id: required with ciphertext text (seal the text for the field appends.<append_id>)")
		}
		aid = ids.New()
	}
	snap, notes, err := r.notesFor(ctx, c, overlay)
	if err != nil {
		return Plan{}, err
	}
	entity, id, e := "note", noteID, notes[noteID]
	if taskID != "" {
		entity, id, e = "task", taskID, snap.task(taskID)
		if e != nil && !snap.visible(e, true) {
			e = nil
		}
	}
	if e == nil {
		return Plan{}, notFound(entity, []string{id})
	}
	field := opsync.AppendPrefix + aid
	if role := snap.role(rawStr(e, "project_id")); !opsync.CanWrite(role, entity, field) {
		return Plan{}, forbidden([]map[string]any{{"id": id, "reason": "forbidden", "role": role}})
	}
	pending := 0
	for f, v := range e {
		if _, ok := opsync.AppendID(f); ok && string(v) != `""` {
			pending++
		}
	}
	if _, taken := e[field]; taken {
		return Plan{}, applyError(&opsync.RejectedError{Op: opsync.Op{Entity: entity, EntityID: id, Field: field}, Reason: opsync.ReasonAppendTaken})
	}
	if pending >= opsync.MaxPendingAppends {
		return Plan{}, applyError(&opsync.RejectedError{Op: opsync.Op{Entity: entity, EntityID: id, Field: field}, Reason: opsync.ReasonTooManyAppends})
	}
	patch := map[string]json.RawMessage{field: raw(text)}
	if err := checkPatch("", entity, id, patch); err != nil {
		return Plan{}, err
	}
	item := map[string]any{"id": id, "kind": entity, "append_id": aid, "status": "appended"}
	return Plan{Result: noteResult("append_to_note", []map[string]any{item}, 1),
		Changes: ChangeSet{{Entity: entity, EntityID: id, Patch: patch, Base: map[string]json.RawMessage{field: nullRaw}}}, Count: 1}, nil
}

// ---- trash_note ----

func (r *Registry) planTrashNote(ctx context.Context, c Caller, a args, overlay ChangeSet) (Plan, error) {
	if err := a.only("", "ids"); err != nil {
		return Plan{}, err
	}
	list, err := a.idList("ids")
	if err != nil {
		return Plan{}, err
	}
	snap, notes, err := r.notesFor(ctx, c, overlay)
	if err != nil {
		return Plan{}, err
	}
	var missing []string
	for _, id := range list {
		if _, ok := notes[id]; !ok {
			missing = append(missing, id)
		}
	}
	if len(missing) > 0 {
		return Plan{}, notFound("note", missing)
	}
	// Only the token's own creations, like trash_tasks (mcp-write-tools D6).
	var foreign []string
	for _, id := range list {
		if overlayCreated(overlay, id) {
			continue
		}
		dev, err := r.sync.CreatedBy(ctx, c.UserID, "note", id)
		if err != nil {
			return Plan{}, err
		}
		if dev != c.Device() {
			foreign = append(foreign, id)
		}
	}
	if len(foreign) > 0 {
		return Plan{}, &ToolError{Code: "not_permitted", Message: "trash_note accepts only notes created with this same token; nothing was changed",
			Data: map[string]any{"ids": foreign}}
	}
	var refused []map[string]any
	for _, id := range list {
		if role := snap.role(rawStr(notes[id], "project_id")); !opsync.CanWrite(role, "note", "deleted_at") {
			refused = append(refused, map[string]any{"id": id, "reason": "forbidden", "role": role})
		}
	}
	if len(refused) > 0 {
		return Plan{}, forbidden(refused)
	}
	now := stamp()
	var cs ChangeSet
	var out []map[string]any
	for _, id := range list {
		patch := map[string]json.RawMessage{"deleted_at": raw(now)}
		cs = append(cs, Change{Entity: "note", EntityID: id, Patch: patch, Base: base(notes[id], patch)})
		out = append(out, map[string]any{"id": id, "status": "trashed"})
	}
	return Plan{Result: noteResult("trash_note", out, len(cs)), Changes: cs, Count: len(cs)}, nil
}

// ---- note_to_task ----

func (r *Registry) planNoteToTask(ctx context.Context, c Caller, a args, overlay ChangeSet) (Plan, error) {
	if err := a.only("", "id"); err != nil {
		return Plan{}, err
	}
	id, err := a.str("id")
	if err != nil || id == "" {
		return Plan{}, argErr("id: the note id is required")
	}
	if c.Encrypted && !c.relayed() {
		// The note's text is sealed for the note; the task needs it sealed for
		// the task, which only the account key can do.
		return Plan{}, toolErr("encryption_enabled", "this account uses end-to-end encryption: the server cannot reseal a note's text for a new task. Turn the note into a task in the app or with ot notes to-task.")
	}
	snap, notes, err := r.notesFor(ctx, c, overlay)
	if err != nil {
		return Plan{}, err
	}
	n, ok := notes[id]
	if !ok {
		return Plan{}, notFound("note", []string{id})
	}
	role := snap.role(rawStr(n, "project_id"))
	if !opsync.CanWrite(role, "note", "deleted_at") || !opsync.CanWrite(role, "task", "title") {
		return Plan{}, forbidden([]map[string]any{{"id": id, "reason": "forbidden", "role": role}})
	}
	var override map[string]json.RawMessage
	if c.relayed() {
		if override, err = relayNoteValues(ctx, c, n); err != nil {
			return Plan{}, err
		}
	}
	taskID := ids.New()
	task, tomb := opsync.NoteToTask(n, stamp(), override)
	for f, def := range map[string]json.RawMessage{"project_id": nullRaw, "parent_id": nullRaw, "labels": raw([]string{}), "completed_at": nullRaw, "deleted_at": nullRaw, "due": nullRaw} {
		if _, ok := task[f]; !ok {
			task[f] = def
		}
	}
	if v, ok := task["notes_doc"]; ok && e2ee.IsCiphertextJSON(v) {
		// A document still sealed for the note (the device could not open it):
		// leave it out, and devices rebuild it from the description (rule 3).
		delete(task, "notes_doc")
	}
	if err := checkPatch("", "task", taskID, task); err != nil {
		return Plan{}, err
	}
	cs := ChangeSet{
		{Entity: "task", EntityID: taskID, Create: true, Patch: task},
		{Entity: "note", EntityID: id, Patch: tomb, Base: base(n, tomb)},
	}
	item := map[string]any{"id": id, "status": "converted", "task_id": taskID}
	return Plan{Result: noteResult("note_to_task", []map[string]any{item}, 2), Changes: cs, Count: 2}, nil
}

// relayNoteValues has the user's device decrypt a note's sealed title,
// description, document and pending appends for note_to_task; the plaintext
// stays in this call's memory and relayEncrypt seals it again for the new task
// before Apply (notes-overview D13). A document the device cannot open is left
// out (the task's document is rebuilt from the description); any other value
// it cannot open refuses the call.
func relayNoteValues(ctx context.Context, c Caller, n opsync.Entity) (map[string]json.RawMessage, error) {
	id := rawStr(n, "id")
	var items []relay.Item
	for f := range n {
		if !e2ee.IsContentField("note", f) || !e2ee.IsCiphertextJSON(n[f]) {
			continue
		}
		items = append(items, relay.Item{Entity: "note", ID: id, Field: f, Value: rawStr(n, f)})
	}
	if len(items) == 0 {
		return nil, nil
	}
	res, err := c.Relay.Do(ctx, relay.Decrypt, items, relayCall(c, "note_to_task", true))
	if err != nil {
		return nil, relayToolErr(err)
	}
	out := map[string]json.RawMessage{}
	for i, it := range items {
		ok := i < len(res) && res[i].Error == ""
		switch {
		case ok:
			out[it.Field] = raw(res[i].Value)
		case it.Field == "notes_doc":
		default:
			return nil, relayToolErr(&relay.Error{Code: relay.CodeUnavailable})
		}
	}
	return out, nil
}
