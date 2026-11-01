package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/agenttools"
	"github.com/OpenTodoApp/opentodo/internal/mail"
	"github.com/OpenTodoApp/opentodo/internal/rules"
	"github.com/OpenTodoApp/opentodo/internal/ruleval"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Routines (OpenSpec change routines-engine): the routes added to the rules
// collection. A routine is a rule with steps; every route is refused on a demo
// instance, like the rest of /api/v1/rules.

// wireRoutines gives the engine the agent tool registry it plans steps through
// (a registry of its own: routines are the user's automation, so no project
// kept away from assistants and no agent audit applies) and the availability
// environment.
func (s *Server) wireRoutines() {
	if s.rules == nil {
		return
	}
	s.rules.Tools = agenttools.New(s.sync, agenttools.Options{Log: s.log, Now: s.now, UserZone: s.tzLocation,
		LocalToday: func() string { return localToday(s.now()) }})
	s.rules.Env = s.routineEnv
	s.rules.Mail = routineMailer{s}
	s.rules.AI = routineAI{s}
	s.rules.Devices = routineDevices{s}
}

// routineMailer sends an Email me step to the account's own verified address
// (internal/mail kind routine) in the account's language, with a link to the run.
type routineMailer struct{ s *Server }

func (m routineMailer) message(ctx context.Context, uid string, rm rules.RoutineMail) (mail.Message, bool) {
	var email string
	var verified bool
	if err := m.s.sync.DB().QueryRowContext(ctx, `SELECT email, email_verified_at IS NOT NULL FROM users WHERE id = ?`, uid).Scan(&email, &verified); err != nil || email == "" || !verified {
		return mail.Message{}, false
	}
	lang := "en"
	if prefs, err := m.s.sync.Get(ctx, uid, "user_prefs", "me"); err == nil && prefs != nil {
		if l := idOf(prefs["language"]); l != "" && l != "system" {
			lang = l
		}
	}
	origin := m.s.cfg.Origin()
	return mail.Message{Kind: mail.KindRoutine, To: email, Lang: lang, UserID: uid, ActorID: uid, Origin: origin,
		Vars: mail.Vars{Link: origin + "/routines/" + rm.RuleID + "?run=" + rm.RunID, Routine: &mail.RoutineVars{Name: rm.RuleName, Subject: rm.Subject, Text: rm.Text}}}, true
}

func (m routineMailer) SendRoutine(ctx context.Context, uid string, rm rules.RoutineMail) error {
	msg, ok := m.message(ctx, uid, rm)
	if !ok {
		return errors.New("routine email: no verified address")
	}
	return m.s.mail.Send(ctx, msg)
}

func (m routineMailer) RefuseRoutine(ctx context.Context, uid string, rm rules.RoutineMail, reason string) {
	if msg, ok := m.message(ctx, uid, rm); ok {
		m.s.mail.RecordFailure(ctx, msg, reason)
	}
}

func (s *Server) registerRoutineRoutes(mux *routes) {
	user := signedIn.DemoDenied()
	mux.handle("POST /api/v1/rules/test", user, s.handleRoutineDraftTest)
	mux.handle("POST /api/v1/rules/{id}/run", user, s.handleRoutineRun)
	mux.handle("GET /api/v1/rules/{id}/runs/{run}", user, s.handleRoutineRunGet)
	mux.handle("POST /api/v1/rules/{id}/runs/{run}/undo", user, s.handleRoutineUndo)
	mux.handle("POST /api/v1/rules/{id}/runs/{run}/dismiss", user, s.handleRoutineDismiss)
	mux.handle("GET /api/v1/me/rules/runs", user, s.handleMyRoutineRuns)
	mux.handle("GET /api/v1/me/rules/catalogue", user, s.handleRoutineCatalogue)
	s.registerRoutineAIRoutes(mux)
	s.registerRoutineDeviceRoutes(mux)
}

// routineEnv is what step availability reads for a user (design D15).
func (s *Server) routineEnv(ctx context.Context, uid string) ruleval.Env {
	env := ruleval.Env{Demo: s.cfg.Demo, Automations: s.ruleSwitch != nil && s.ruleSwitch.On(ctx), EmailConfigured: s.mail.Enabled(ctx)}
	db := s.sync.DB()
	var verified int
	_ = db.QueryRowContext(ctx, `SELECT email != '' AND email_verified_at IS NOT NULL FROM users WHERE id = ?`, uid).Scan(&verified)
	env.EmailVerified = verified == 1
	env.Encrypted, _ = s.keys().Enabled(ctx, uid)
	if rows, err := db.QueryContext(ctx, `SELECT id FROM webhooks WHERE user_id = ? AND enabled = 1 ORDER BY id`, uid); err == nil {
		for rows.Next() {
			var id string
			if rows.Scan(&id) == nil {
				env.Webhooks = append(env.Webhooks, id)
			}
		}
		if rows.Err() != nil {
			env.Webhooks = nil
		}
		rows.Close()
	}
	if prefs, err := s.sync.Get(ctx, uid, "user_prefs", "me"); err == nil && prefs != nil {
		env.Energy = idOf(prefs["energy"]) == "on"
	}
	s.routineAIEnv(ctx, uid, &env)
	return env
}

// checkSteps validates a routine's steps for REST: the shape, the types
// against the trigger's output, and every id the steps name.
func (s *Server) checkSteps(ctx context.Context, uid string, raw json.RawMessage, trigger ruleval.Type, ref *refs) error {
	steps, err := ruleval.ParseSteps(raw)
	if err == nil {
		_, err = ruleval.Check(steps, trigger)
	}
	if err != nil {
		var se *ruleval.StepError
		if errors.As(err, &se) && se.Step != "" {
			return invalidRule("step %s: %s", se.Step, se.Msg)
		}
		return invalidRule("%s", err.Error())
	}
	ruleval.Walk(steps, func(st *ruleval.Step) { collectStepRefs(st, ref) })
	return nil
}

// collectStepRefs adds the ids a step names to the refs a rule must resolve.
func collectStepRefs(st *ruleval.Step, ref *refs) {
	lit := func(name string) json.RawMessage {
		if a, ok := st.In[name]; ok && !a.IsRef() {
			return a.Lit
		}
		return nil
	}
	for _, name := range []string{"project", "parent", "of"} {
		var p map[string]string
		if json.Unmarshal(lit(name), &p) == nil && p["project"] != "" {
			ref.project(p["project"], nil)
		}
	}
	var t map[string]string
	if json.Unmarshal(lit("task"), &t) == nil && t["task"] != "" {
		ref.tasks = append(ref.tasks, t["task"])
	}
	var labels []string
	if json.Unmarshal(lit("labels"), &labels) == nil {
		ref.label(labels...)
	}
	var id string
	if json.Unmarshal(lit("view"), &id) == nil && id != "" {
		ref.views = append(ref.views, id)
	}
	if json.Unmarshal(lit("webhook_id"), &id) == nil && id != "" {
		ref.webhooks = append(ref.webhooks, id)
	}
	for _, name := range []string{"condition", "where"} {
		if c, err := ruleval.ParseCondition(lit(name)); err == nil && lit(name) != nil {
			ref.condition(&c)
		}
	}
	if set, err := ruleval.ParseStepActions(lit("set")); err == nil {
		ref.label(set.AddLabels...)
		ref.label(set.RemoveLabels...)
		if set.Section != nil {
			ref.project(set.Section.ProjectID, set.Section.SectionID)
			ref.moveTargets = append(ref.moveTargets, set.Section.ProjectID)
		}
		if set.WebhookID != "" {
			ref.webhooks = append(ref.webhooks, set.WebhookID)
		}
	}
}

// condition adds the ids a condition names.
func (r *refs) condition(c *ruleval.Condition) {
	if c.Labels != nil {
		for _, l := range [][]string{c.Labels.Any, c.Labels.All, c.Labels.None} {
			r.label(l...)
		}
	}
	if c.Project != nil {
		for _, p := range c.Project.In {
			r.project(p, nil)
		}
	}
}

// routineWarnings names a rule's steps that are not available now (design D15).
func (s *Server) routineWarnings(ctx context.Context, uid string, row opsync.Entity) []ruleval.StepWarning {
	if isNullish(row["steps"]) {
		return []ruleval.StepWarning{}
	}
	steps, err := ruleval.ParseSteps(row["steps"])
	if err != nil {
		return []ruleval.StepWarning{}
	}
	env := s.routineEnv(ctx, uid)
	if idOf(row["project_id"]) != "" {
		// A shared routine's availability (routines-shared D3): the run-as
		// person's environment, plaintext, without personal steps.
		if _, shared, _, err := s.sync.ProjectStatus(ctx, uid, idOf(row["project_id"])); err == nil && shared {
			env = s.routineEnv(ctx, s.runAsOf(ctx, uid, row))
			env.Shared, env.Encrypted = true, false
		}
	}
	out := ruleval.Unavailable(steps, env)
	if out == nil {
		out = []ruleval.StepWarning{}
	}
	return out
}

// annotateRules adds to every rule representation steps and condition (null
// when unset), the server's pause and, for a routine, the warnings for
// unavailable steps. They are read-only: stripAnnotations drops them.
func (s *Server) annotateRules(ctx context.Context, uid string, list ...opsync.Entity) {
	var paused map[string]string
	if s.rules != nil {
		paused, _ = s.rules.Store.Paused(ctx, uid)
	}
	for _, e := range list {
		if e == nil {
			continue
		}
		for _, f := range []string{"condition", "steps", "actions"} {
			if _, has := e[f]; !has {
				e[f] = json.RawMessage("null")
			}
		}
		e["paused_reason"] = json.RawMessage("null")
		if reason := paused[idOf(e["id"])]; reason != "" {
			e["paused_reason"] = jsonRaw(reason)
		}
		if w := s.routineWarnings(ctx, uid, e); len(w) > 0 {
			e["warnings"] = jsonRaw(w)
		}
		s.annotateRuleAI(ctx, s.runAsOf(ctx, uid, e), e)
	}
	s.annotateShared(ctx, uid, list)
}

func jsonRaw(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

// routineError answers an engine refusal.
func (s *Server) routineError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, rules.ErrNotFound), errors.Is(err, rules.ErrRunNotFound):
		writeError(w, http.StatusNotFound, "not_found", "routine, run or task not found")
	case errors.Is(err, rules.ErrTaskRequired):
		writeError(w, http.StatusBadRequest, "task_required", err.Error())
	case errors.Is(err, rules.ErrInvalidDraft):
		writeError(w, http.StatusBadRequest, "invalid_input", "the routine is not valid")
	case errors.Is(err, rules.ErrRateLimited):
		w.Header().Set("Retry-After", "60")
		writeError(w, http.StatusTooManyRequests, "rate_limited", "at most 60 runs a minute")
	case errors.Is(err, rules.ErrPausedRule):
		writeError(w, http.StatusConflict, "paused", err.Error())
	case errors.Is(err, rules.ErrOff):
		writeError(w, http.StatusConflict, "automations_off", err.Error())
	case errors.Is(err, rules.ErrAlreadyUndone):
		writeError(w, http.StatusConflict, "already_undone", err.Error())
	case errors.Is(err, rules.ErrForbidden):
		writeError(w, http.StatusForbidden, "forbidden", err.Error())
	default:
		s.internal(w, err)
	}
}

func (s *Server) handleRoutineRun(w http.ResponseWriter, r *http.Request) {
	var in struct {
		RunID  string `json:"run_id"`
		TaskID string `json:"task_id"`
		Test   bool   `json:"test"`
		// CallAI: a test runs its AI steps for real (routines-ai-step D11).
		CallAI bool `json:"call_ai"`
		// Device: Run now on the device in hand of an encrypted account
		// (routines-ai-step D7); only from that device's session.
		Device string `json:"device"`
	}
	if err := readJSON(r, &in); err != nil || in.RunID == "" || len(in.RunID) > 64 || len(in.Device) > 128 {
		badBodyWith(w, err, "invalid_input", `body must be {"run_id": string, "task_id"?: string, "test"?: bool, "call_ai"?: bool, "device"?: string}`)
		return
	}
	if s.rules == nil {
		writeError(w, http.StatusNotFound, "not_found", "rule not found")
		return
	}
	req := rules.RunRequest{RuleID: r.PathValue("id"), RunID: in.RunID, TaskID: in.TaskID, Test: in.Test, CallAI: in.CallAI}
	if in.Device != "" {
		sess := sessionFrom(r.Context())
		if sess == nil {
			writeError(w, http.StatusForbidden, "session_only", "only a signed-in device runs a routine itself")
			return
		}
		req.Device, req.Session = in.Device, sess.TokenHash
	}
	res, err := s.rules.RunNow(r.Context(), userFrom(r.Context()).ID, req)
	if err != nil {
		s.routineError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleRoutineRunGet(w http.ResponseWriter, r *http.Request) {
	if s.rules == nil {
		writeError(w, http.StatusNotFound, "not_found", "run not found")
		return
	}
	run, err := s.rules.Store.RunByID(r.Context(), userFrom(r.Context()).ID, r.PathValue("run"))
	if err == nil && run.RuleID != r.PathValue("id") {
		err = rules.ErrRunNotFound
	}
	if err != nil {
		s.routineError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, run)
}

func (s *Server) handleRoutineUndo(w http.ResponseWriter, r *http.Request) {
	if s.rules == nil {
		writeError(w, http.StatusNotFound, "not_found", "run not found")
		return
	}
	res, err := s.rules.Undo(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"), r.PathValue("run"))
	if err != nil {
		s.routineError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleMyRoutineRuns(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	if q.Get("for") == "inbox" {
		s.handleRoutineInbox(w, r)
		return
	}
	f := rules.RunFilter{Outcome: q.Get("outcome"), Source: q.Get("source"), RuleID: q.Get("rule")}
	if v := q.Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > rules.KeepRuns {
			writeError(w, http.StatusBadRequest, "invalid_input", "limit must be from 1 to 100")
			return
		}
		f.Limit = n
	}
	if v := q.Get("before"); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil || n < 1 {
			writeError(w, http.StatusBadRequest, "invalid_input", "before must be a run's position")
			return
		}
		f.Before = n
	}
	out := map[string]any{"runs": []rules.Run{}}
	if s.rules != nil {
		list, err := s.rules.Store.UserRuns(r.Context(), userFrom(r.Context()).ID, f)
		if err != nil {
			s.internal(w, err)
			return
		}
		out["runs"] = list
		limit := f.Limit
		if limit == 0 {
			limit = 50
		}
		if n := len(list); n > 0 && n == limit {
			out["before"] = list[n-1].ID
		}
	}
	writeJSON(w, http.StatusOK, out)
}

// catalogueEntry is one step kind as GET /api/v1/me/rules/catalogue lists it.
type catalogueEntry struct {
	ruleval.StepKind
	ruleval.Availability
}

func (s *Server) handleRoutineCatalogue(w http.ResponseWriter, r *http.Request) {
	env := s.routineEnv(r.Context(), userFrom(r.Context()).ID)
	out := make([]catalogueEntry, 0, len(ruleval.Steps))
	for _, k := range ruleval.Steps {
		out = append(out, catalogueEntry{StepKind: k, Availability: ruleval.Available(k.Kind, env)})
	}
	writeJSON(w, http.StatusOK, map[string]any{"steps": out})
}

func (s *Server) handleRoutineDraftTest(w http.ResponseWriter, r *http.Request) {
	var d rules.Draft
	if err := readJSON(r, &d); err != nil || len(d.Trigger) == 0 {
		badBodyWith(w, err, "invalid_input", `body must be {"trigger": …, "condition"?: …, "actions"?: …, "steps"?: […], "task_id"?: string}`)
		return
	}
	uid := userFrom(r.Context()).ID
	body := map[string]json.RawMessage{"name": json.RawMessage(`"draft"`), "trigger": d.Trigger}
	for f, v := range map[string]json.RawMessage{"condition": d.Condition, "actions": d.Actions, "steps": d.Steps} {
		if len(strings.TrimSpace(string(v))) > 0 {
			body[f] = v
		}
	}
	if d.ProjectID != "" {
		body["project_id"] = jsonRaw(d.ProjectID)
	}
	if err := s.checkRuleParts(r.Context(), uid, body, nil); err != nil {
		s.ruleError(w, err)
		return
	}
	if s.rules == nil {
		writeError(w, http.StatusNotFound, "not_found", "routines are not available")
		return
	}
	res, err := s.rules.TestDraft(r.Context(), uid, d)
	if err != nil {
		s.routineError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

// handleRoutineInbox answers the Inbox card "Routines since your last visit"
// (routines-editor D10): the runs it shows, after the later of the device's
// marker (since) and the synced one, and the synced marker itself.
func (s *Server) handleRoutineInbox(w http.ResponseWriter, r *http.Request) {
	var since int64
	if v := r.URL.Query().Get("since"); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil || n < 0 {
			writeError(w, http.StatusBadRequest, "invalid_input", "since must be a time in Unix milliseconds")
			return
		}
		since = n
	}
	out := map[string]any{"runs": []rules.InboxRun{}, "seen_at": 0, "hide_successes": false}
	if s.rules == nil {
		writeJSON(w, http.StatusOK, out)
		return
	}
	uid := userFrom(r.Context()).ID
	marker, hide, err := s.rules.Store.SeenPrefs(r.Context(), uid)
	if err != nil {
		s.internal(w, err)
		return
	}
	list, err := s.rules.Store.InboxRuns(r.Context(), uid, max(since, marker), hide)
	if err != nil {
		s.internal(w, err)
		return
	}
	out["runs"], out["seen_at"], out["hide_successes"] = list, marker, hide
	writeJSON(w, http.StatusOK, out)
}

// handleRoutineDismiss hides one success line of the Inbox card on every device.
func (s *Server) handleRoutineDismiss(w http.ResponseWriter, r *http.Request) {
	if s.rules == nil {
		writeError(w, http.StatusNotFound, "not_found", "run not found")
		return
	}
	if err := s.rules.Dismiss(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"), r.PathValue("run")); err != nil {
		s.routineError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
