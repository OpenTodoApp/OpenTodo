package rules

import (
	"context"
	"encoding/json"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/agenttools"
	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/notesearch"
	"github.com/OpenTodoApp/opentodo/internal/ruleval"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
	"github.com/OpenTodoApp/opentodo/internal/templatelib"
)

// Standalone notes in routines (OpenSpec change notes-in-routines): the note
// events of a batch, the quiet wait of note.edited, the notes a run reads and
// the note steps.

// notePrefix marks a note's id where the queue and the run log keep the id of
// the item a run is about (their task_id columns): "note:<id>".
const notePrefix = "note:"

// NoteEditQuiet is how long a note has no change to its title or text before
// note.edited fires (D2).
const NoteEditQuiet = 5 * time.Minute

func noteSubject(id string) string {
	if id == "" {
		return ""
	}
	return notePrefix + id
}

func subjectNote(s string) (string, bool) { return strings.CutPrefix(s, notePrefix) }

// splitSubject reads a stored subject into a task id or a note id.
func splitSubject(s string) (task, note string) {
	if id, ok := subjectNote(s); ok {
		return "", id
	}
	return s, ""
}

// noteContent reports a change to a note's title or text.
func noteContent(c opsync.Change) bool {
	for f := range c.Fields {
		if f == "title" || f == "description" || f == "notes_doc" || strings.HasPrefix(f, opsync.AppendPrefix) {
			return true
		}
	}
	return false
}

// DeriveNote lists the note events of one change of a standalone note (spec
// "Event triggers"); the author and depth are filled in by Observe.
func DeriveNote(c opsync.Change) []Event {
	var out []Event
	ev := func(kind string) Event { return Event{NoteID: c.EntityID, Kind: kind} }
	created := false
	if f, ok := c.Fields["created_at"]; ok && opsync.IsNull(f.From) && !opsync.IsNull(f.To) {
		out, created = append(out, ev(ruleval.NoteCreated)), true
	}
	if f, ok := c.Fields["labels"]; ok {
		before := listOf(f.From)
		for _, id := range listOf(f.To) {
			if !slices.Contains(before, id) {
				x := ev(ruleval.NoteLabelAdded)
				x.LabelID = id
				out = append(out, x)
			}
		}
	}
	if !created && noteContent(c) {
		out = append(out, ev(ruleval.NoteEdited))
	}
	return out
}

// derive lists the events of one change of a task or a standalone note.
func derive(c opsync.Change) []Event {
	if c.Entity == "note" {
		return DeriveNote(c)
	}
	return Derive(c)
}

// worldNotes reads the standalone notes a world sees, once: a shared
// routine's project's, a workspace's (the notes of its projects and its own
// notes without a project), or all the user's.
func (e *Engine) worldNotes(ctx context.Context, w *world) map[string]opsync.Entity {
	if w.notes != nil {
		return w.notes
	}
	w.notes = map[string]opsync.Entity{}
	rows, err := e.Sync.List(ctx, w.uid, "note", false)
	if err != nil {
		e.Log.Error("rules: notes", "err", err)
		return w.notes
	}
	var part *opsync.Partition
	if w.workspace != "" {
		part = w.partition()
	}
	for _, n := range rows {
		pid := str(n, "project_id")
		switch {
		case w.project != "" && pid != w.project:
			continue
		case part != nil && noteWorkspace(part, n) != w.workspace:
			continue
		}
		w.notes[str(n, "id")] = n
	}
	return w.notes
}

// noteWorkspace is a note's workspace: its project's, or its own.
func noteWorkspace(p *opsync.Partition, n opsync.Entity) string {
	if pid := str(n, "project_id"); pid != "" {
		if _, ok := p.Projects[pid]; ok {
			return p.Project(pid)
		}
	}
	return p.Own(str(n, "workspace_id"))
}

// noteChanged is each note's logical date of its newest field change.
func (e *Engine) noteChanged(ctx context.Context, w *world) map[string]string {
	if w.noteDates != nil {
		return w.noteDates
	}
	w.noteDates, w.noteMs = map[string]string{}, map[string]int64{}
	last, err := e.Sync.LastChanged(ctx, w.uid, "note")
	if err != nil {
		return w.noteDates
	}
	for id, ms := range last {
		w.noteDates[id] = ruleval.LogicalDate(ms, w.offset, w.dayStart)
		w.noteMs[id] = ms
	}
	return w.noteDates
}

// matchNote reads a note for the matcher: only its project and labels count
// (D3); unchanged reads its newest change.
func (e *Engine) matchNote(ctx context.Context, w *world, c *ruleval.Condition, n opsync.Entity) bool {
	mc := ruleval.Context{UserID: w.uid, Today: w.today, Parent: w.parent, Open: func(string) bool { return true },
		Changed: func(id string) string { return e.noteChanged(ctx, w)[id] }}
	return ruleval.Matches(c, ruleval.Task{ID: str(n, "id"), ProjectID: str(n, "project_id"), Labels: listOf(n["labels"])}, mc)
}

// processNote runs one note event against a rule it triggers.
func (e *Engine) processNote(ctx context.Context, w *world, r *rule, ev Event) {
	if !r.isRoutine() {
		return // a note trigger needs steps (D2)
	}
	n, ok := e.worldNotes(ctx, w)[ev.NoteID]
	if !ok || !opsync.IsNull(n["deleted_at"]) {
		return
	}
	if ev.Kind == ruleval.NoteLabelAdded && !slices.Contains(listOf(n["labels"]), r.Trigger.LabelID) {
		return
	}
	if r.HasCondition && !e.matchNote(ctx, w, &r.Condition, n) {
		return
	}
	key := ev.Occurrence
	if key == "" {
		key = "evt:" + strconv.FormatInt(ev.ID, 10) + ":" + noteSubject(ev.NoteID)
	}
	if ev.Kind == ruleval.NoteEdited {
		// Keyed by the rule, the note and the time of its last change (D2):
		// a replay after a restart answers the first run.
		key = "edited:" + ev.NoteID + ":" + strconv.FormatInt(ev.CreatedAt, 10)
	}
	e.routineRunOn(ctx, w, r, key, ev.Depth+1, ruleval.Value{Type: ruleval.TNote, ID: ev.NoteID}, noteSubject(ev.NoteID))
}

// ---- the notes a run reads ----

// allNotes is the run's view of the notes, with its planned changes laid over.
func (st *runState) allNotes() map[string]opsync.Entity {
	if st.notes == nil {
		st.notes = map[string]opsync.Entity{}
		for id, n := range st.e.worldNotes(st.ctx, st.w) {
			st.notes[id] = n
		}
	}
	return st.notes
}

func (st *runState) note(id string) opsync.Entity { return st.allNotes()[id] }

// liveNote reports a standalone note the run sees that is not in the Trash.
func (st *runState) liveNote(id string) (opsync.Entity, bool) {
	n, ok := st.allNotes()[id]
	return n, ok && opsync.IsNull(n["deleted_at"])
}

func notesVal(list []string) ruleval.Value {
	if list == nil {
		list = []string{}
	}
	return ruleval.Value{Type: ruleval.TNotes, IDs: list}
}

// writableNote refuses a note in a project where the run-as person only
// views, naming the project, before anything is written (D7).
func (st *runState) writableNote(n opsync.Entity) error {
	pid := str(n, "project_id")
	if pid == "" || !st.w.shared[pid] {
		return nil
	}
	role, _, err := st.e.projectRole(st.ctx, pid, st.w.uid)
	if err != nil {
		return err
	}
	if !canEdit(role) {
		return failf("forbidden", "the note %s is in %s, where you can only view", str(n, "id"), e2ee.Display(str(st.projects[pid], "name")))
	}
	return nil
}

// ---- the note steps ----

func (st *runState) noteStep(s *ruleval.Step, in map[string]ruleval.Value, at int) (ruleval.Value, string, error) {
	switch s.Kind {
	case "find_notes":
		return st.findNotes(s, in)
	case "get_note":
		id := in["note"].ID
		if v, ok := lit[map[string]string](s, "note"); ok {
			id = v["note"]
		}
		if _, ok := st.liveNote(id); !ok {
			return none(), "", failf(ErrCodeNotFound, "note %s not found", id)
		}
		return ruleval.Value{Type: ruleval.TNote, ID: id}, "", nil
	case "create_note":
		return st.createNote(s, in, at)
	case "note_from_template":
		return st.noteFromTemplate(s, in, at)
	case "change_notes":
		return st.changeNotes(s, in, at)
	case "note_to_task":
		return st.noteToTask(in)
	}
	return none(), "", nil
}

// findNotes finds live standalone notes (never task or project notes) by
// project with its sub-projects, labels, change window and words, newest
// change first, at most limit (D5).
func (st *runState) findNotes(s *ruleval.Step, in map[string]ruleval.Value) (ruleval.Value, string, error) {
	limit := ruleval.MaxListItems
	if n, ok := lit[float64](s, "limit"); ok && n >= 1 && int(n) < limit {
		limit = int(n)
	}
	var cond ruleval.Condition
	if v, ok := st.entityIn(s, in, "project"); ok && v.ID != "" {
		cond.Project = &ruleval.ProjectPred{In: []string{v.ID}, Descendants: true}
	}
	if a, ok := s.In["labels"]; ok {
		c, err := ruleval.ParseCondition(json.RawMessage(`{"labels":` + string(a.Lit) + `}`))
		if err != nil {
			return none(), "", failf(ErrCodeInvalid, "%s", err)
		}
		cond.Labels = c.Labels
	}
	if d, ok := lit[float64](s, "unchanged_days"); ok {
		n := int(d)
		cond.Unchanged = &n
	}
	within, hasWithin := lit[float64](s, "within_days")
	words, _ := lit[string](s, "words")
	terms := notesearch.ParseQuery(words)
	dates := st.e.noteChanged(st.ctx, st.w)
	type hit struct {
		id string
		ms int64
	}
	var hits []hit
	for id, n := range st.allNotes() {
		if !opsync.IsNull(n["deleted_at"]) || !st.e.matchNote(st.ctx, st.w, &cond, n) {
			continue
		}
		if hasWithin && (dates[id] == "" || dates[id] <= ruleval.AddDays(st.w.today, -int(within))) {
			continue
		}
		if strings.TrimSpace(words) != "" && !notesearch.Match(str(n, "title"), str(n, "description"), terms).Matched {
			continue
		}
		hits = append(hits, hit{id, st.w.noteMs[id]})
	}
	slices.SortFunc(hits, func(a, b hit) int {
		if a.ms != b.ms {
			return int(b.ms - a.ms)
		}
		return strings.Compare(a.id, b.id)
	})
	out := make([]string, 0, min(len(hits), limit))
	for _, h := range hits {
		if len(out) == limit {
			return notesVal(out), StepTruncated, nil
		}
		out = append(out, h.id)
	}
	return notesVal(out), "", nil
}

// createNote writes a new standalone note through create_note (D4): in a
// shared routine in its project without labels, in a workspace routine in
// that workspace.
func (st *runState) createNote(s *ruleval.Step, in map[string]ruleval.Value, at int) (ruleval.Value, string, error) {
	title, _ := st.textIn(s, in, "title")
	text, _ := st.textIn(s, in, "text")
	pid := ""
	if v, ok := st.entityIn(s, in, "project"); ok && v.ID != "" {
		pid = v.ID
	}
	labels, _ := lit[[]string](s, "labels")
	return st.writeNote(title, text, pid, labels, at)
}

// writeNote plans a new note through create_note.
func (st *runState) writeNote(title, text, pid string, labels []string, at int) (ruleval.Value, string, error) {
	id := ids2("routine-note", st.r.ID, st.runID, strconv.Itoa(at), strconv.Itoa(st.seq))
	args := map[string]any{"title": title, "description": text, "id": id}
	if labels != nil && st.w.project == "" {
		args["label_ids"] = labels
	}
	if st.w.project != "" {
		pid = st.w.project
	}
	if pid != "" {
		args["project_id"] = pid
	}
	p, err := st.tool("create_note", args)
	if err != nil {
		return none(), "", err
	}
	created := createdIDs(p, "note")
	if len(created) == 0 {
		return none(), "", failf(ErrCodeInvalid, "create_note planned no note")
	}
	if pid == "" && st.w.workspace != "" && !st.w.workspaceDefault {
		st.lay(agenttools.Change{Entity: "note", EntityID: created[0], Patch: map[string]json.RawMessage{"workspace_id": raw(st.w.workspace)}})
	}
	return ruleval.Value{Type: ruleval.TNote, ID: created[0]}, "", nil
}

// changeNotes changes each note: labels written whole from the current list,
// a project (a move across sharing scopes copies the note and trashes the
// original, as the device does), pin or unpin for the run-as person, or the
// Trash (D4).
func (st *runState) changeNotes(s *ruleval.Step, in map[string]ruleval.Value, at int) (ruleval.Value, string, error) {
	list := in["notes"]
	if list.Type == ruleval.TNote {
		list = notesVal([]string{list.ID})
	}
	add, _ := lit[[]string](s, "add_labels")
	remove, _ := lit[[]string](s, "remove_labels")
	target, move := "", false
	if v, ok := st.entityIn(s, in, "project"); ok {
		target, move = v.ID, true
	}
	if np, _ := lit[bool](s, "no_project"); np {
		move = true
	}
	pin, hasPin := lit[bool](s, "pin")
	trash, _ := lit[bool](s, "trash")
	var out []string
	refused := 0
	for i, id := range list.IDs {
		st.seq = i
		n, ok := st.liveNote(id)
		if !ok {
			refused++
			continue
		}
		if err := st.writableNote(n); err != nil {
			return none(), "", err
		}
		if hasPin {
			if _, err := st.tool("set_favourite", map[string]any{"kind": "note", "id": id, "favourite": pin}); err != nil {
				return none(), "", err
			}
		}
		if trash {
			if _, err := st.tool("trash_note", map[string]any{"ids": []string{id}}); err != nil {
				return none(), "", err
			}
			out = append(out, id)
			continue
		}
		args := map[string]any{"id": id}
		if len(add) > 0 || len(remove) > 0 {
			labels := []string{}
			for _, l := range listOf(n["labels"]) {
				if !slices.Contains(remove, l) {
					labels = append(labels, l)
				}
			}
			for _, l := range add {
				if !slices.Contains(labels, l) {
					labels = append(labels, l)
				}
			}
			if !slices.Equal(labels, listOf(n["labels"])) {
				args["label_ids"] = labels
			}
		}
		from := str(n, "project_id")
		if move && target != from {
			if st.scopeOf(from) != st.scopeOf(target) {
				nid, err := st.copyNote(n, target, args, at)
				if err != nil {
					return none(), "", err
				}
				out = append(out, nid)
				continue
			}
			if target == "" {
				args["project_id"] = nil
			} else {
				args["project_id"] = target
			}
		}
		if len(args) > 1 {
			if _, err := st.tool("update_note", args); err != nil {
				return none(), "", err
			}
		}
		out = append(out, id)
	}
	status := ""
	if refused > 0 {
		status = StepSkipped
	}
	return notesVal(out), status, nil
}

// scopeOf is the sharing scope a project puts a note in.
func (st *runState) scopeOf(pid string) string {
	if pid != "" && st.w.shared[pid] {
		return pid
	}
	return ""
}

// copyNote moves a note across sharing scopes as the device does: a copy in
// the target with the note's title, text and labels, and the original in the
// Trash. On an encrypted account the server cannot reseal the text.
func (st *runState) copyNote(n opsync.Entity, target string, args map[string]any, at int) (string, error) {
	if st.w.encrypted {
		return "", failf(ErrCodeEncrypted, "moving a note into a project shared differently needs a device on an encrypted account")
	}
	labels := listOf(n["labels"])
	if l, ok := args["label_ids"].([]string); ok {
		labels = l
	}
	id := ids2("routine-note-copy", st.r.ID, st.runID, strconv.Itoa(at), str(n, "id"))
	copyArgs := map[string]any{"title": str(n, "title"), "description": str(n, "description"), "id": id}
	if target != "" {
		copyArgs["project_id"] = target
	}
	if !st.w.shared[target] && len(labels) > 0 {
		copyArgs["label_ids"] = labels
	}
	if _, err := st.tool("create_note", copyArgs); err != nil {
		return "", err
	}
	if _, err := st.tool("trash_note", map[string]any{"ids": []string{str(n, "id")}}); err != nil {
		return "", err
	}
	return id, nil
}

// noteToTask turns a note into a task, as the note's menu does, in one batch.
func (st *runState) noteToTask(in map[string]ruleval.Value) (ruleval.Value, string, error) {
	id := in["note"].ID
	n, ok := st.liveNote(id)
	if !ok {
		return none(), "", failf(ErrCodeNotFound, "note %s not found", id)
	}
	if err := st.writableNote(n); err != nil {
		return none(), "", err
	}
	p, err := st.tool("note_to_task", map[string]any{"id": id})
	if err != nil {
		return none(), "", err
	}
	created := createdIDs(p, "task")
	if len(created) == 0 {
		return none(), "", failf(ErrCodeInvalid, "note_to_task planned no task")
	}
	return taskVal(created[0]), "", nil
}

// sortNotes orders notes by title, creation or last change.
func (st *runState) sortNotes(list ruleval.Value, by string, desc bool) ruleval.Value {
	st.e.noteChanged(st.ctx, st.w)
	rows := make([]ruleval.SortTask, 0, len(list.IDs))
	for _, id := range list.IDs {
		n := st.note(id)
		rows = append(rows, ruleval.SortTask{ID: id, Title: str(n, "title"), Created: int64(num(n, "created_at")), Changed: st.w.noteMs[id]})
	}
	out := []string{}
	for _, r := range ruleval.SortTasks(rows, by, desc) {
		out = append(out, r.ID)
	}
	return notesVal(out)
}

// filterNotes keeps the notes matching a condition's project and labels.
func (st *runState) filterNotes(list ruleval.Value, c *ruleval.Condition) ruleval.Value {
	out := []string{}
	for _, id := range list.IDs {
		if n, ok := st.liveNote(id); ok && st.e.matchNote(st.ctx, st.w, c, n) {
			out = append(out, id)
		}
	}
	return notesVal(out)
}

// ErrCodeTemplateMissing: a routine's note template is in the Trash or out of
// its reach (note-templates D5).
const ErrCodeTemplateMissing = "template_missing"

// noteFromTemplate creates a note from a user template or a built-in one,
// its placeholders filled with the step's date (the run's day by default),
// the person's date and time preferences and language (note-templates D5).
func (st *runState) noteFromTemplate(s *ruleval.Step, in map[string]ruleval.Value, at int) (ruleval.Value, string, error) {
	ref, _ := lit[string](s, "template")
	lang := st.lang()
	var title, body, pid string
	var labels []string
	if slug, ok := strings.CutPrefix(ref, "builtin:"); ok {
		b, found := templatelib.FindNote(slug)
		if !found {
			return none(), "", failf(ErrCodeTemplateMissing, "The template %s does not exist", slug)
		}
		title, body = b.Title.Pick(lang), b.Body.Pick(lang)
	} else {
		n, ok := st.liveNote(ref)
		if !ok || !boolOf(n, "template") {
			return none(), "", failf(ErrCodeTemplateMissing, "The template is in the Trash")
		}
		title, body, pid, labels = str(n, "title"), str(n, "description"), str(n, "project_id"), listOf(n["labels"])
	}
	if t, ok := st.textIn(s, in, "title"); ok && strings.TrimSpace(t) != "" {
		title = t
	}
	if v, ok := st.entityIn(s, in, "project"); ok && v.ID != "" {
		pid = v.ID
	}
	if l, ok := lit[[]string](s, "labels"); ok {
		labels = l
	}
	day := st.w.today
	if v, ok := in["date"]; ok {
		day = v.Date
	} else if a, ok := s.In["date"]; ok {
		if d, ok := ruleval.DateLiteral(a.Lit); ok {
			day = d.Resolve(st.w.today)
		}
	}
	prefs := st.prefs()
	clock := st.e.now().Add(time.Duration(st.w.offset) * time.Minute).UTC().Format("15:04")
	c := templatelib.FillContext{Date: day, Time: clock, Order: templatelib.Order(str(prefs, "date_format"), lang),
		Hour12: templatelib.Hour12(str(prefs, "time_format"), lang), Lang: lang}
	title, body = templatelib.Fill(title, body, c)
	if labels == nil {
		labels = []string{}
	}
	return st.writeNote(title, body, pid, labels, at)
}
