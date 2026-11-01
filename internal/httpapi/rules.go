package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/rules"
	"github.com/OpenTodoApp/opentodo/internal/ruleval"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Automation rules (OpenSpec change automation-rules, design D10): the rule
// entity through the generic collection handlers with checkRule, the run log,
// the dry run, the user's "pause all" and the owner switch. Every route is
// refused on a demo instance.

// applyRuleDefaults fills the defaults of a rule being created: on, no
// condition, live.
func applyRuleDefaults(body map[string]json.RawMessage) {
	// A routine of more than one step stores its card in steps (routines-engine D2).
	if raw, has := body["steps"]; has && !isNullish(raw) {
		if _, has := body["actions"]; !has {
			body["actions"] = json.RawMessage("null")
		}
	}
	for f, v := range map[string]string{"enabled": "true", "condition": "null", "steps": "null", "deleted_at": "null"} {
		if _, has := body[f]; !has {
			body[f] = json.RawMessage(v)
		}
	}
}

// errInvalidRule marks a body checkRule refused; the message names the field.
var errInvalidRule = errors.New("invalid rule")

// errRuleConflict marks a rule refused for the account's state (the limit,
// an encrypted account's comment); code is the error code.
type errRuleConflict struct{ code, msg string }

func (e *errRuleConflict) Error() string { return e.msg }

func invalidRule(format string, args ...any) error {
	return fmt.Errorf("%w: %s", errInvalidRule, fmt.Sprintf(format, args...))
}

func (s *Server) registerRuleRoutes(mux *routes) {
	if s.rules != nil {
		// A due or deadline a rule moves carries its reminders along, as a REST PATCH does.
		s.rules.Reminder = s.reminderOpsForTaskAs
	}
	user := signedIn.DemoDenied()
	asRules := func(h http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			r.SetPathValue("collection", "rules")
			h(w, r)
		}
	}
	mux.handle("GET /api/v1/rules", user, asRules(s.handleList))
	mux.handle("POST /api/v1/rules", user, asRules(s.handleCreate))
	mux.handle("GET /api/v1/rules/{id}", user, asRules(s.handleGet))
	mux.handle("PATCH /api/v1/rules/{id}", user, asRules(s.handlePatch))
	mux.handle("DELETE /api/v1/rules/{id}", user, asRules(s.handleDelete))
	mux.handle("GET /api/v1/rules/{id}/runs", user, s.handleRuleRuns)
	mux.handle("POST /api/v1/rules/{id}/test", user, s.handleRuleTest)
	mux.handle("GET /api/v1/me/rules", user, s.handleMyRules)
	mux.handle("PUT /api/v1/me/rules/paused", user, s.handleRulesPaused)
	s.wireRoutines()
	s.registerRoutineRoutes(mux)
	s.switchRoutes(mux, "/api/v1/settings/automations", switchRoute{sw: s.ruleSwitch,
		get: ownerOnly("see the automations setting").DemoDenied(), put: ownerOnly("manage the automations setting").DemoDenied(),
		more: s.automationsLock, putMore: s.automationsLock})
}

// ruleError answers a checkRule refusal.
func (s *Server) ruleError(w http.ResponseWriter, err error) {
	var c *errRuleConflict
	switch {
	case errors.Is(err, errInvalidRule):
		writeError(w, http.StatusBadRequest, "invalid_input", strings.TrimPrefix(err.Error(), errInvalidRule.Error()+": "))
	case errors.As(err, &c):
		writeError(w, http.StatusConflict, c.code, c.msg)
	default:
		s.internal(w, err)
	}
}

// checkRule validates a rule body for REST (design D10): shapes through
// internal/ruleval, then every id resolved against the user's live data, a
// shared project refused as a project action's target, the comment action
// refused for an encrypted account, and at most rules.MaxRules rules.
func (s *Server) checkRule(ctx context.Context, uid string, body map[string]json.RawMessage, existing opsync.Entity) error {
	if existing == nil {
		for _, f := range []string{"name", "trigger"} {
			if _, has := body[f]; !has {
				return invalidRule("rule.%s is required", f)
			}
		}
		live, err := s.sync.List(ctx, uid, "rule", false)
		if err != nil {
			return err
		}
		if len(live) >= rules.MaxRules {
			return &errRuleConflict{"limit_reached", fmt.Sprintf("at most %d rules per account", rules.MaxRules)}
		}
	}
	if raw, has := body["name"]; has {
		var name string
		if json.Unmarshal(raw, &name) != nil || strings.TrimSpace(name) == "" {
			return invalidRule("rule.name must not be empty")
		}
	}
	if err := checkRuleAI(body); err != nil {
		return err
	}
	return s.checkRuleParts(ctx, uid, body, existing)
}

// fieldOf is a field of the body, or of the stored rule when the body leaves it out.
func fieldOf(body map[string]json.RawMessage, existing opsync.Entity, f string) json.RawMessage {
	if v, has := body[f]; has {
		return v
	}
	if existing != nil {
		return existing[f]
	}
	return nil
}

// checkRuleParts validates the trigger, condition, actions and steps of a rule
// body (a create, a patch or an unsaved draft): a rule needs actions or steps;
// steps are type-checked against the trigger's output (routines-engine).
func (s *Server) checkRuleParts(ctx context.Context, uid string, body map[string]json.RawMessage, existing opsync.Entity) error {
	actions, steps := fieldOf(body, existing, "actions"), fieldOf(body, existing, "steps")
	if isNullish(actions) && isNullish(steps) {
		return invalidRule("a rule needs actions or steps")
	}
	ref := refs{}
	if raw, has := body["trigger"]; has {
		tr, err := ruleval.ParseTrigger(raw)
		if err != nil {
			return invalidRule("%s", err.Error())
		}
		ref.label(tr.LabelID)
		ref.project(tr.ProjectID, tr.SectionID)
	}
	if raw, has := body["condition"]; has && !isNullish(raw) {
		c, err := ruleval.ParseCondition(raw)
		if err != nil {
			return invalidRule("%s", err.Error())
		}
		if c.Labels != nil {
			for _, l := range [][]string{c.Labels.Any, c.Labels.All, c.Labels.None} {
				ref.label(l...)
			}
		}
		if c.Project != nil {
			for _, p := range c.Project.In {
				ref.project(p, nil)
			}
		}
	}
	if raw, has := body["steps"]; has && !isNullish(raw) {
		trig, err := ruleval.ParseTrigger(fieldOf(body, existing, "trigger"))
		if err != nil {
			return invalidRule("%s", err.Error())
		}
		cond := !isNullish(fieldOf(body, existing, "condition"))
		if err := s.checkSteps(ctx, uid, raw, ruleval.TriggerOutput(trig.Kind, cond), &ref); err != nil {
			return err
		}
	}
	if raw, has := body["actions"]; has && !isNullish(raw) {
		a, err := ruleval.ParseActions(raw)
		if err != nil {
			return invalidRule("%s", err.Error())
		}
		ref.label(a.AddLabels...)
		ref.label(a.RemoveLabels...)
		if a.Section != nil {
			ref.project(a.Section.ProjectID, a.Section.SectionID)
			ref.moveTo = a.Section.ProjectID
		}
		if a.Comment != nil {
			if on, _ := s.keys().Enabled(ctx, uid); on {
				return &errRuleConflict{"encryption_enabled", "a rule cannot write a comment for an encrypted account: the server cannot encrypt it"}
			}
		}
		ref.webhook = a.WebhookID
	}
	return s.resolveRuleRefs(ctx, uid, ref)
}

// refs are the ids a rule names.
type refs struct {
	labels   []string
	projects []string
	sections map[string]string // section -> its project
	moveTo   string
	webhook  string
	// Routine steps (routines-engine): tasks, saved views, webhooks and the
	// projects tasks move into.
	tasks       []string
	views       []string
	webhooks    []string
	moveTargets []string
}

func (r *refs) label(ids ...string) {
	for _, id := range ids {
		if id != "" {
			r.labels = append(r.labels, id)
		}
	}
}

func (r *refs) project(id string, section *string) {
	if id == "" {
		return
	}
	r.projects = append(r.projects, id)
	if section != nil && *section != "" {
		if r.sections == nil {
			r.sections = map[string]string{}
		}
		r.sections[*section] = id
	}
}

// resolveRuleRefs checks the named ids exist for the user and are not deleted.
func (s *Server) resolveRuleRefs(ctx context.Context, uid string, ref refs) error {
	live := func(entity, id string) (opsync.Entity, error) {
		e, err := s.sync.Get(ctx, uid, entity, id)
		if err != nil || e == nil || e.Deleted() {
			return nil, err
		}
		return e, nil
	}
	for _, id := range ref.labels {
		if e, err := live("label", id); err != nil {
			return err
		} else if e == nil {
			return invalidRule("label %s does not exist", id)
		}
	}
	for _, id := range ref.projects {
		if e, err := live("project", id); err != nil {
			return err
		} else if e == nil {
			return invalidRule("project %s does not exist", id)
		}
	}
	for sid, pid := range ref.sections {
		e, err := live("section", sid)
		if err != nil {
			return err
		}
		if e == nil || idOf(e["project_id"]) != pid {
			return invalidRule("section %s does not belong to project %s", sid, pid)
		}
	}
	for _, pid := range append(ref.moveTargets, ref.moveTo) {
		if pid == "" {
			continue
		}
		_, shared, _, err := s.sync.ProjectStatus(ctx, uid, pid)
		if err != nil {
			return err
		}
		if shared {
			return invalidRule("a rule cannot move tasks into or out of a shared project")
		}
	}
	for _, id := range ref.tasks {
		if e, err := live("task", id); err != nil {
			return err
		} else if e == nil {
			return invalidRule("task %s does not exist", id)
		}
	}
	for _, id := range ref.views {
		if e, err := live("view", id); err != nil {
			return err
		} else if e == nil {
			return invalidRule("saved view %s does not exist", id)
		}
	}
	for _, id := range append(ref.webhooks, ref.webhook) {
		if id == "" {
			continue
		}
		var n int
		if err := s.sync.DB().QueryRowContext(ctx, `SELECT COUNT(*) FROM webhooks WHERE id = ? AND user_id = ?`, id, uid).Scan(&n); err != nil {
			return err
		}
		if n == 0 {
			return invalidRule("webhook %s does not exist", id)
		}
	}
	return nil
}

// ownRule reports whether id is one of the user's live rules.
func (s *Server) ownRule(ctx context.Context, uid, id string) (bool, error) {
	e, err := s.sync.Get(ctx, uid, "rule", id)
	return err == nil && e != nil && !e.Deleted(), err
}

func (s *Server) handleRuleRuns(w http.ResponseWriter, r *http.Request) {
	uid, id := userFrom(r.Context()).ID, r.PathValue("id")
	if ok, err := s.ownRule(r.Context(), uid, id); err != nil {
		s.internal(w, err)
		return
	} else if !ok {
		writeError(w, http.StatusNotFound, "not_found", "rule not found")
		return
	}
	if s.rules == nil {
		writeJSON(w, http.StatusOK, map[string]any{"runs": []any{}})
		return
	}
	runs, err := s.rules.Store.Runs(r.Context(), id, rules.KeepRuns)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"runs": runs})
}

func (s *Server) handleRuleTest(w http.ResponseWriter, r *http.Request) {
	var in struct {
		TaskID string `json:"task_id"`
	}
	if err := readJSON(r, &in); err != nil || in.TaskID == "" {
		badBodyWith(w, err, "invalid_input", `body must be {"task_id": string}`)
		return
	}
	if s.rules == nil {
		writeError(w, http.StatusNotFound, "not_found", "rule not found")
		return
	}
	uid := userFrom(r.Context()).ID
	out, err := s.rules.Test(r.Context(), uid, r.PathValue("id"), in.TaskID)
	if errors.Is(err, rules.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "rule or task not found")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	// The rule's answer, and each step's plan (routines-engine D8): a rule is
	// read as its one Change tasks step.
	res, err := s.rules.TestRule(r.Context(), uid, r.PathValue("id"), in.TaskID)
	if err != nil && !errors.Is(err, rules.ErrInvalidDraft) {
		s.routineError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"matches": out.Matches, "changes": out.Changes, "skipped": out.Skipped, "steps": res.Steps, "writes": res.Writes})
}

// automationsStatus is the profile's automations object: whether rules run on
// this server and whether the user paused theirs.
func (s *Server) automationsStatus(ctx context.Context, uid string) map[string]any {
	on := s.rules != nil && s.ruleSwitch != nil && s.ruleSwitch.On(ctx)
	paused := false
	if s.rules != nil {
		paused, _ = s.rules.Store.UserPaused(ctx, uid)
	}
	return map[string]any{"enabled": on, "paused": paused}
}

// handleMyRules is the Rules page's server state: the switches, and per rule
// its last run, its 7-day run count and the server's pause.
func (s *Server) handleMyRules(w http.ResponseWriter, r *http.Request) {
	uid := userFrom(r.Context()).ID
	out := s.automationsStatus(r.Context(), uid)
	perRule := map[string]map[string]any{}
	if s.rules != nil {
		sums, err := s.rules.Store.Summaries(r.Context(), uid)
		if err != nil {
			s.internal(w, err)
			return
		}
		for id, sum := range sums {
			perRule[id] = map[string]any{"last_run": sum.LastRun, "runs_7d": sum.Week}
		}
		paused, err := s.rules.Store.Paused(r.Context(), uid)
		if err != nil {
			s.internal(w, err)
			return
		}
		for id, reason := range paused {
			if perRule[id] == nil {
				perRule[id] = map[string]any{}
			}
			perRule[id]["paused_reason"] = reason
		}
	}
	out["rules"] = perRule
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleRulesPaused(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Paused *bool `json:"paused"`
	}
	if err := readJSON(r, &in); err != nil || in.Paused == nil {
		badBodyWith(w, err, "invalid_input", `body must be {"paused": true|false}`)
		return
	}
	uid := userFrom(r.Context()).ID
	if s.rules != nil {
		if err := s.rules.Store.SetUserPaused(r.Context(), uid, *in.Paused); err != nil {
			s.internal(w, err)
			return
		}
	}
	writeJSON(w, http.StatusOK, s.automationsStatus(r.Context(), uid))
}

// automationsLock tells the Settings screen whether OPENTODO_AUTOMATIONS fixes the switch.
func (s *Server) automationsLock(*http.Request) map[string]any {
	return map[string]any{"locked": s.ruleSwitch.Locked(), "locked_by": s.ruleSwitch.FixedBy()}
}
