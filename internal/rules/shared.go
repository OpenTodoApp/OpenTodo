package rules

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/notify"
	"github.com/OpenTodoApp/opentodo/internal/ruleval"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Routines of a shared project (OpenSpec change routines-shared): a rule with
// a project_id that lives in the project's scope. It runs as its run-as
// person (the author of the winning enabled: true, D4), sees only its project
// (D3), pauses when someone else edits it (D5) or when the run-as person no
// longer edits the project (D9).

// Pause reasons of a shared routine.
const (
	PausedEditedByOther = "edited_by_other"
	PausedRunAsLeft     = "run_as_left"
	PausedRunAsViewer   = "run_as_viewer"
)

// FallbackNotRunAs: Apply without asking was turned on by someone other than
// the run-as person, so runs are proposals (D6).
const FallbackNotRunAs = "not_run_as"

// MaxSharedRules bounds a shared project's live routines (D2).
const MaxSharedRules = 50

// ErrForbidden is the answer to a member whose role does not allow the
// request (a viewer's Run now or Undo of a shared routine).
var ErrForbidden = errors.New("your role in this project does not allow this")

// definitionFields are the fields whose change by someone other than the
// run-as person pauses a shared routine (D5).
var definitionFields = []string{"trigger", "condition", "steps", "actions", "ai_apply", "ai_budget"}

// canEdit reports a role that writes a shared project's routines.
func canEdit(role string) bool {
	return role == opsync.RoleOwner || role == opsync.RoleAdmin || role == opsync.RoleEditor
}

// projectRole is a user's role in a shared project ("" for none); shared is
// false when the project is not shared.
func (e *Engine) projectRole(ctx context.Context, pid, uid string) (role string, shared bool, err error) {
	var owner string
	err = e.db.QueryRowContext(ctx, `SELECT owner_id FROM project_scopes WHERE project_id = ?`, pid).Scan(&owner)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	err = e.db.QueryRowContext(ctx, `SELECT role FROM project_members WHERE project_id = ? AND user_id = ?`, pid, uid).Scan(&role)
	if errors.Is(err, sql.ErrNoRows) {
		return "", true, nil
	}
	return role, true, err
}

// RoleIn is a user's role in a shared rule's project, "" for a personal rule
// or a non-member (the REST routes decide who may run and undo, D4, D7).
func (e *Engine) RoleIn(ctx context.Context, uid, ruleID string) (role, projectID string, err error) {
	pid, err := e.ruleProject(ctx, ruleID)
	if err != nil || pid == "" {
		return "", "", err
	}
	role, _, err = e.projectRole(ctx, pid, uid)
	return role, pid, err
}

// ruleProject is the shared project a rule lives in ("" for a personal rule).
func (e *Engine) ruleProject(ctx context.Context, ruleID string) (string, error) {
	var scope string
	err := e.db.QueryRowContext(ctx, `SELECT scope_id FROM scope_fields WHERE entity = 'rule' AND entity_id = ? LIMIT 1`, ruleID).Scan(&scope)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	pid, _ := strings.CutPrefix(scope, "project:")
	if pid == scope {
		return "", nil
	}
	return pid, nil
}

// enabledAuthor is the author of a rule's winning enabled op ("" when none):
// the run-as person when the server has not recorded one (a routine that
// moved into the shared scope with the first share).
func (e *Engine) enabledAuthor(ctx context.Context, ruleID string) string {
	var uid string
	_ = e.db.QueryRowContext(ctx, `SELECT o.user_id FROM ops o JOIN scope_fields f ON f.entity = o.entity AND f.entity_id = o.entity_id
		AND f.field = o.field AND f.ts = o.ts AND f.device = o.device
		WHERE o.entity = 'rule' AND o.entity_id = ? AND o.field = 'enabled' AND f.value = 'true' ORDER BY o.seq DESC LIMIT 1`, ruleID).Scan(&uid)
	return uid
}

// runAs is a shared routine's run-as person, recorded or derived.
func (e *Engine) runAs(ctx context.Context, ruleID string, st State) string {
	if st.RunAs != "" {
		return st.RunAs
	}
	return e.enabledAuthor(ctx, ruleID)
}

// States reads the server state of rules, by id (absent: the zero state).
func (s *Store) States(ctx context.Context, ids []string) (map[string]State, error) {
	out := map[string]State{}
	for _, id := range ids {
		st, found, err := s.State(ctx, id)
		if err != nil {
			return nil, err
		}
		if found {
			out[id] = st
		}
	}
	return out, nil
}

// RunAsOf is each shared rule's run-as person (REST annotations, the CLI and
// MCP): recorded, or the author of the winning enabled: true.
func (e *Engine) RunAsOf(ctx context.Context, ids []string) map[string]string {
	out := map[string]string{}
	states, err := e.Store.States(ctx, ids)
	if err != nil {
		return out
	}
	for _, id := range ids {
		if u := e.runAs(ctx, id, states[id]); u != "" {
			out[id] = u
		}
	}
	return out
}

// observeRule keeps a rule's server state in step with its winning changes:
// turning it on clears the pause and starts its watermark at now; for a
// shared routine its author becomes the run-as person (D4), and a change to
// its definition by someone else pauses it (D5).
func (e *Engine) observeRule(ctx context.Context, c opsync.Change) {
	shared := strings.HasPrefix(c.ScopeID, "project:")
	f, on := c.Fields["enabled"]
	on = on && string(f.To) == "true"
	edited := false
	for _, name := range definitionFields {
		if _, ok := c.Fields[name]; ok {
			edited = true
		}
	}
	if !on && !(shared && edited) {
		return
	}
	st, _, err := e.Store.State(ctx, c.EntityID)
	if err != nil {
		return
	}
	now := e.now().UnixMilli()
	switch {
	case on:
		st.PausedReason, st.Refusals, st.Watermark, st.PausedBy = "", nil, now, ""
		if shared {
			st.RunAs, st.RunAsSince = c.UserID, now
		}
	case st.PausedReason != "":
		return
	default:
		runAs := e.runAs(ctx, c.EntityID, st)
		if runAs == "" || runAs == c.UserID {
			return
		}
		st.RunAs = runAs
		st.PausedReason, st.PausedBy = PausedEditedByOther, c.UserID
	}
	owner := c.UserID
	if shared && st.RunAs != "" {
		owner = st.RunAs
	}
	if err := e.Store.SaveState(context.WithoutCancel(ctx), c.EntityID, owner, st); err != nil {
		e.Log.Error("rules: rule state", "err", err)
	}
}

// sharedEvents derives the events of a change to a shared project's task for
// the project's enabled routines (D3): one set per run-as person, marked with
// the project, whoever wrote the batch.
func (e *Engine) sharedEvents(ctx context.Context, c opsync.Change, depth int) []Event {
	pid, ok := strings.CutPrefix(c.ScopeID, "project:")
	if !ok || pid == c.ScopeID {
		return nil
	}
	rows, err := e.db.QueryContext(ctx, `SELECT f.entity_id, COALESCE(s.run_as, ''), COALESCE(s.paused_reason, '') FROM scope_fields f
		LEFT JOIN rule_state s ON s.rule_id = f.entity_id
		WHERE f.scope_id = ? AND f.entity = 'rule' AND f.field = 'enabled' AND f.value = 'true'
		AND NOT EXISTS (SELECT 1 FROM scope_fields d WHERE d.scope_id = f.scope_id AND d.entity = 'rule' AND d.entity_id = f.entity_id
			AND d.field = 'deleted_at' AND d.value != 'null')
		ORDER BY f.entity_id`, c.ScopeID)
	if err != nil {
		e.Log.Error("rules: shared routines", "err", err)
		return nil
	}
	type routine struct{ id, runAs, paused string }
	var list []routine
	for rows.Next() {
		var r routine
		if err := rows.Scan(&r.id, &r.runAs, &r.paused); err != nil {
			rows.Close()
			return nil
		}
		list = append(list, r)
	}
	rows.Close()
	if rows.Err() != nil {
		return nil
	}
	seen := map[string]bool{}
	var out []Event
	for _, r := range list {
		if r.paused != "" {
			continue
		}
		u := r.runAs
		if u == "" {
			u = e.enabledAuthor(ctx, r.id)
		}
		if u == "" {
			continue
		}
		if !seen[u] {
			// A run-as person who left no longer sees the routine: pause it
			// here, where the project's batch names it (D9).
			if role, _, err := e.projectRole(ctx, pid, u); err == nil && !canEdit(role) {
				e.pauseLost(context.WithoutCancel(ctx), r.id, e.ruleName(ctx, c.ScopeID, r.id), pid, u, role)
				continue
			}
		}
		if seen[u] {
			continue
		}
		seen[u] = true
		// assigned.to_me means assigned to the run-as person.
		as := c
		as.UserID = u
		for _, ev := range Derive(as) {
			ev.UserID, ev.Origin, ev.Depth, ev.ForProject = u, c.Origin, depth, pid
			out = append(out, ev)
		}
	}
	return out
}

// forUser keeps the rules a user's engine runs: their personal rules and the
// shared routines that run as them (D4). Shared marks the latter.
func (e *Engine) forUser(ctx context.Context, uid string, list []rule) ([]rule, error) {
	var shared []string
	for i := range list {
		if list[i].ProjectID != "" {
			shared = append(shared, list[i].ID)
		}
	}
	if len(shared) == 0 {
		return list, nil
	}
	homes := map[string]bool{}
	for _, id := range shared {
		pid, err := e.ruleProject(ctx, id)
		if err != nil {
			return nil, err
		}
		homes[id] = pid != ""
	}
	states, err := e.Store.States(ctx, shared)
	if err != nil {
		return nil, err
	}
	out := list[:0]
	for _, r := range list {
		if homes[r.ID] {
			if e.runAs(ctx, r.ID, states[r.ID]) != uid {
				continue
			}
			r.Shared = true
		}
		out = append(out, r)
	}
	return out, nil
}

// bound is the world a shared routine's run reads (D3): the project's tasks,
// sections and the project itself, no labels, plaintext (D10). It returns
// nil when the project is gone or in the Trash.
func (w *world) bound(pid string) *world {
	p, ok := w.projectRows[pid]
	if !ok || !opsync.IsNull(p["deleted_at"]) {
		return nil
	}
	b := *w
	b.project = pid
	b.encrypted = false
	b.tasks, b.parent, b.projectRows = map[string]opsync.Entity{}, map[string]string{pid: ""}, map[string]opsync.Entity{pid: p}
	b.labels, b.labelNames, b.labelName = map[string]bool{}, map[string]bool{}, map[string]string{}
	b.sections, b.sectionName = map[string]string{}, map[string]string{}
	b.tracked, b.changed = nil, nil
	for id, t := range w.tasks {
		if str(t, "project_id") == pid {
			b.tasks[id] = t
		}
	}
	for id, sp := range w.sections {
		if sp == pid {
			b.sections[id] = sp
			if n, ok := w.sectionName[id]; ok {
				b.sectionName[id] = n
			}
		}
	}
	return &b
}

// worldFor is the world one rule runs in: the user's, or for a shared
// routine its project's (nil: it cannot run now).
func (w *world) worldFor(r *rule) *world {
	if !r.Shared {
		return w
	}
	return w.bound(r.ProjectID)
}

// mayRun checks before a shared routine's run that its run-as person still
// edits the project; otherwise it pauses the routine and tells the project's
// owner, admins and editors (D9).
func (e *Engine) mayRun(ctx context.Context, r *rule, uid string) bool {
	if !r.Shared {
		return true
	}
	role, shared, err := e.projectRole(ctx, r.ProjectID, uid)
	if err != nil || !shared {
		return false
	}
	if canEdit(role) {
		return true
	}
	e.pauseLost(ctx, r.ID, r.Name, r.ProjectID, uid, role)
	return false
}

// pauseLost pauses one shared routine whose run-as person lost edit access.
func (e *Engine) pauseLost(ctx context.Context, ruleID, name, pid, runAs, role string) {
	st, _, err := e.Store.State(ctx, ruleID)
	if err != nil || st.PausedReason == PausedRunAsLeft || st.PausedReason == PausedRunAsViewer {
		return
	}
	st.RunAs = runAs
	st.PausedReason, st.PausedBy = PausedRunAsLeft, ""
	if role == opsync.RoleViewer {
		st.PausedReason = PausedRunAsViewer
	}
	if err := e.Store.SaveState(ctx, ruleID, runAs, st); err != nil {
		e.Log.Error("rules: pause shared routine", "err", err)
		return
	}
	e.forgetAll()
	sink, ok := e.Routine.(notify.RoutinePausedSink)
	if !ok {
		return
	}
	project, _, _ := e.Sync.ProjectName(ctx, pid)
	runAsName := e.Sync.UserNames(ctx, []string{runAs})[runAs]
	rows, err := e.db.QueryContext(ctx, `SELECT user_id FROM project_members WHERE project_id = ? AND role IN ('owner', 'admin', 'editor') AND user_id != ? ORDER BY user_id`, pid, runAs)
	if err != nil {
		return
	}
	var to []string
	for rows.Next() {
		var u string
		if rows.Scan(&u) == nil {
			to = append(to, u)
		}
	}
	rows.Close()
	if rows.Err() != nil {
		return
	}
	for _, u := range to {
		sink.RoutinePausedShared(ctx, notify.RoutinePausedShared{UserID: u, RuleID: ruleID, RuleName: e2ee.Display(name), ProjectID: pid,
			ProjectName: e2ee.Display(project), RunAsName: runAsName, Reason: st.PausedReason, At: e.now().UnixMilli()})
	}
}

// CheckProject pauses the routines of a shared project whose run-as person no
// longer edits it, right after a membership change (D9).
func (e *Engine) CheckProject(ctx context.Context, pid string) {
	rows, err := e.db.QueryContext(ctx, `SELECT f.entity_id FROM scope_fields f WHERE f.scope_id = ? AND f.entity = 'rule' AND f.field = 'enabled' AND f.value = 'true'`,
		opsync.ProjectScope(pid))
	if err != nil {
		e.Log.Error("rules: check project routines", "err", err)
		return
	}
	var ids []string
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	rows.Close()
	if rows.Err() != nil {
		return
	}
	for _, id := range ids {
		st, _, err := e.Store.State(ctx, id)
		if err != nil || st.PausedReason != "" {
			continue
		}
		runAs := e.runAs(ctx, id, st)
		if runAs == "" {
			continue
		}
		role, _, err := e.projectRole(ctx, pid, runAs)
		if err != nil || canEdit(role) {
			continue
		}
		e.pauseLost(ctx, id, e.ruleName(ctx, opsync.ProjectScope(pid), id), pid, runAs, role)
	}
}

// ruleName is a rule's stored name in a scope.
func (e *Engine) ruleName(ctx context.Context, scope, id string) string {
	var raw, name string
	_ = e.db.QueryRowContext(ctx, `SELECT value FROM scope_fields WHERE scope_id = ? AND entity = 'rule' AND entity_id = ? AND field = 'name'`, scope, id).Scan(&raw)
	_ = json.Unmarshal([]byte(raw), &name)
	return name
}

// forgetAll drops every user's cached rule kinds (a shared routine changed:
// it runs for whoever it runs as).
func (e *Engine) forgetAll() {
	e.mu.Lock()
	e.kinds = map[string]map[string]bool{}
	e.changed = true
	e.mu.Unlock()
}

// sharedEncrypted reports a shared routine whose text is ciphertext (written
// by an older client): its run fails with a reason (D10).
func sharedEncrypted(r *rule) bool {
	if e2ee.IsCiphertext(r.Name) {
		return true
	}
	found := false
	ruleval.Walk(r.Steps, func(s *ruleval.Step) {
		for _, a := range s.In {
			if txt, _, ok := ruleval.TextLiteral(a.Lit); ok && e2ee.IsEnvelope(txt) {
				found = true
			}
		}
	})
	return found
}

// outsideProject checks a shared routine's planned changes against its
// project (D3): "" when every change stays in it, else the entity that
// would leave it.
func (st *runState) outsideProject() string {
	pid := st.w.project
	if pid == "" {
		return ""
	}
	taskIn := func(id string) bool {
		if t, ok := st.tasks[id]; ok {
			return str(t, "project_id") == pid
		}
		return false
	}
	for _, c := range st.overlay {
		switch c.Entity {
		case "task":
			if raw, ok := c.Patch["project_id"]; ok {
				if strOf(raw) != pid {
					return "task"
				}
				continue
			}
			if c.Create || !taskIn(c.EntityID) {
				return "task"
			}
		case "section":
			if raw, ok := c.Patch["project_id"]; ok && strOf(raw) != pid {
				return "section"
			}
			if _, ok := c.Patch["project_id"]; !ok && st.w.sections[c.EntityID] != pid {
				return "section"
			}
		case "project":
			if c.EntityID != pid {
				return "project"
			}
			for f := range c.Patch {
				if f != "description" && f != "notes_doc" && !strings.HasPrefix(f, opsync.AppendPrefix) {
					return "project"
				}
			}
		case "comment":
			if !taskIn(strOf(c.Patch["task_id"])) {
				return "comment"
			}
		case "note":
			if raw, ok := c.Patch["project_id"]; ok && strOf(raw) != pid {
				return "note"
			}
		default:
			return c.Entity
		}
	}
	return ""
}

// projectName is a shared routine's project name as people see it.
func (st *runState) projectName() string {
	return e2ee.Display(str(st.w.projectRows[st.w.project], "name"))
}

// fieldAuthor is the author of a rule field's op written at ts by device.
func (e *Engine) fieldAuthor(ctx context.Context, ruleID, field string, ts int64, device string) string {
	var uid string
	_ = e.db.QueryRowContext(ctx, `SELECT user_id FROM ops WHERE entity = 'rule' AND entity_id = ? AND field = ? AND ts = ? AND device = ? ORDER BY seq DESC LIMIT 1`,
		ruleID, field, ts, device).Scan(&uid)
	return uid
}
