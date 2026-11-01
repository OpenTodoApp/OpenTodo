package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/OpenTodoApp/opentodo/internal/assistant"
	"github.com/OpenTodoApp/opentodo/internal/httpapi/httpx"
	"github.com/OpenTodoApp/opentodo/internal/ruleval"
)

// Describe it (OpenSpec change routines-describe-it, design D2-D4): the
// assistant drafts a routine from one sentence. One assistant turn with the
// one tool draft_routine; the draft is checked like a create (the REST rule
// checks, every id resolved) plus the draft rules (no task chosen by hand,
// only available steps), retried once with the errors, and answered. Nothing
// is saved, enabled, tested or run: the editor opens the draft unsaved. An
// encrypted account drafts on its device (D5) and never calls this route.

const (
	routineDraftPath   = "POST /api/v1/assistant/routine-draft"
	routineDraftBody   = 8 << 10
	routineDraftWindow = time.Hour
)

func (s *Server) registerRoutineDraft(mux *routes) {
	s.routineDraftLimiter = newRateLimiter(assistant.DraftsPerHour, routineDraftWindow)
	mux.handle(routineDraftPath, signedIn.SessionOnly().DemoDenied(), s.handleRoutineDraft)
}

func (s *Server) handleRoutineDraft(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	set := s.assistantSettings(ctx)
	if !set.Enabled {
		writeError(w, http.StatusNotFound, "not_found", "the assistant is not enabled on this server")
		return
	}
	u := userFrom(ctx)
	if enc, err := s.keys().Enabled(ctx, u.ID); err != nil {
		s.internal(w, err)
		return
	} else if enc {
		writeError(w, http.StatusConflict, "encryption_enabled", "an encrypted account describes routines on its device; nothing is sent through the server")
		return
	}
	if !set.Active() {
		writeError(w, http.StatusNotFound, "not_found", "the assistant is not enabled on this server")
		return
	}
	route, err := s.assistant.Store.Resolve(ctx, u.ID, set)
	if err != nil {
		s.internal(w, err)
		return
	}
	consent, err := s.assistant.Store.Consent(ctx, u.ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	if !consent.Valid(route.Provider) {
		writeError(w, http.StatusForbidden, "consent_required", "read which data is sent to "+assistant.ProviderLabel(route.Provider)+" and accept before describing a routine")
		return
	}
	var in struct {
		Text string `json:"text"`
	}
	if err := readJSONLimit(r, &in, routineDraftBody); err != nil {
		if errors.Is(err, httpx.ErrBodyTooLarge) {
			writeError(w, http.StatusRequestEntityTooLarge, "too_large", fmt.Sprintf("describe the routine in at most %d characters", assistant.MaxDraftText))
			return
		}
		badBodyWith(w, err, "invalid_input", `body must be {"text": "…"}`)
		return
	}
	text := strings.TrimSpace(in.Text)
	if text == "" {
		writeError(w, http.StatusBadRequest, "invalid_input", "text: describe what should happen, and when")
		return
	}
	if utf8.RuneCountInString(text) > assistant.MaxDraftText {
		writeError(w, http.StatusRequestEntityTooLarge, "too_large", fmt.Sprintf("describe the routine in at most %d characters", assistant.MaxDraftText))
		return
	}
	usage, err := s.assistant.Store.Usage(ctx, u.ID, set.MonthlyTokenCap)
	if err != nil {
		s.internal(w, err)
		return
	}
	capped := set.MonthlyTokenCap > 0 && (!route.Own || set.CapMemberKeys)
	if capped && usage.Counted(set.CapMemberKeys) >= set.MonthlyTokenCap {
		writeErrorWith(w, http.StatusTooManyRequests, "assistant_quota",
			fmt.Sprintf("you have used this month's assistant allowance of %d tokens; it resets on %s", set.MonthlyTokenCap, usage.ResetsAt),
			map[string]any{"resets_at": usage.ResetsAt})
		return
	}
	release, err := s.assistant.Acquire(u.ID)
	switch {
	case errors.Is(err, assistant.ErrTurnInProgress):
		writeError(w, http.StatusConflict, "turn_in_progress", "another answer is still being written; wait for it or stop it first")
		return
	case errors.Is(err, assistant.ErrBusy):
		w.Header().Set("Retry-After", "5")
		writeError(w, http.StatusServiceUnavailable, "assistant_busy", "the assistant is busy on this server; try again in a few seconds")
		return
	}
	defer release()
	if !s.routineDraftLimiter.allow(u.ID) {
		w.Header().Set("Retry-After", fmt.Sprint(int(s.routineDraftLimiter.retryAfter(u.ID).Seconds())+1))
		writeError(w, http.StatusTooManyRequests, "rate_limited", fmt.Sprintf("at most %d routine drafts an hour; try again later", assistant.DraftsPerHour))
		return
	}
	prov, err := s.assistant.ProviderFor(route, set)
	if errors.Is(err, assistant.ErrNoKey) {
		writeError(w, http.StatusConflict, "no_key", "no API key is configured for "+assistant.ProviderLabel(route.Provider)+"; ask the server owner")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	env := s.routineEnv(ctx, u.ID)
	kinds := []string{}
	for _, k := range ruleval.Steps {
		if ruleval.Available(k.Kind, env).Available {
			kinds = append(kinds, k.Kind)
		}
	}
	start := time.Now()
	ans, err := s.assistant.DraftRoutine(ctx, prov, assistant.DraftCall{
		UserID: u.ID, Text: text, Names: s.draftNames(ctx, u.ID), Kinds: kinds, Own: route.Own,
		Check: func(ctx context.Context, d assistant.RoutineDraft) ([]assistant.DraftProblem, []ruleval.StepWarning) {
			return s.checkDraft(ctx, u.ID, env, d)
		},
	})
	// Logs hold the provider, outcome, duration and token counts only (in-app-assistant D8).
	s.log.Info("assistant routine draft", "provider", route.Provider, "own_key", route.Own, "duration_ms", time.Since(start).Milliseconds(),
		"input_tokens", ans.Input, "output_tokens", ans.Output, "drafted", ans.Draft != nil, "errors", len(ans.Errors), "failed", err != nil)
	if err != nil {
		status, code, msg := s.draftError(err, route.Own)
		writeError(w, status, code, msg)
		return
	}
	total := usage.Counted(set.CapMemberKeys)
	if !route.Own || set.CapMemberKeys {
		total += ans.Input + ans.Output
	}
	draftCap := set.MonthlyTokenCap
	if !capped {
		draftCap = 0
	}
	errs, warns := ans.Errors, ans.Warnings
	if errs == nil {
		errs = []assistant.DraftProblem{}
	}
	if warns == nil {
		warns = []ruleval.StepWarning{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"draft": ans.Draft, "note": ans.Note, "errors": errs, "warnings": warns,
		"usage": map[string]any{"input": ans.Input, "output": ans.Output, "month_total": total, "cap": draftCap, "own_key": route.Own}})
}

// draftError is the status, code and message of a draft turn that failed.
func (s *Server) draftError(err error, own bool) (int, string, string) {
	var re *assistant.RoutineError
	if errors.As(err, &re) {
		return http.StatusUnprocessableEntity, re.Code, re.Msg
	}
	if _, ok := assistant.AsProviderError(err); ok || errors.Is(err, context.DeadlineExceeded) {
		code, msg := s.turnError(err, own)
		if code == "timeout" {
			return http.StatusGatewayTimeout, code, msg
		}
		return http.StatusBadGateway, code, msg
	}
	s.log.Error("assistant routine draft failed", "err", err)
	return http.StatusBadGateway, "provider_error", "the provider could not answer"
}

// checkDraft checks a draft for the user: the REST checks of a create (shape,
// types, every id resolved) and, as errors, the steps not available to them
// (a draft uses only available steps); the warnings are those steps.
func (s *Server) checkDraft(ctx context.Context, uid string, env ruleval.Env, d assistant.RoutineDraft) ([]assistant.DraftProblem, []ruleval.StepWarning) {
	var probs []assistant.DraftProblem
	if d.Name == "" {
		probs = append(probs, assistant.DraftProblem{Code: "invalid_input", Message: "name: a routine needs a name"})
	}
	name, _ := json.Marshal(d.Name)
	body := map[string]json.RawMessage{"name": name, "trigger": d.Trigger, "condition": d.Condition, "steps": d.Steps}
	if err := s.checkRuleParts(ctx, uid, body, nil); err != nil {
		var c *errRuleConflict
		p := assistant.DraftProblem{Code: "invalid_input", Message: strings.TrimPrefix(err.Error(), errInvalidRule.Error()+": ")}
		switch {
		case errors.As(err, &c):
			p.Code, p.Message = c.code, c.msg
		case !errors.Is(err, errInvalidRule):
			s.log.Error("routine draft check failed", "err", err)
			p.Message = "the draft could not be checked"
		}
		if rest, ok := strings.CutPrefix(p.Message, "step "); ok {
			if id, _, ok := strings.Cut(rest, ":"); ok && !strings.Contains(id, " ") {
				p.Step = id
			}
		}
		probs = append(probs, p)
	}
	warns := []ruleval.StepWarning{}
	if steps, err := ruleval.ParseSteps(d.Steps); err == nil {
		if w := ruleval.Unavailable(steps, env); w != nil {
			warns = w
		}
	}
	for _, w := range warns {
		probs = append(probs, assistant.DraftProblem{Step: w.Step, Code: assistant.CodeDraftUnavailable,
			Message: fmt.Sprintf("step %s: %s is not available to this person (%s); use another step or say so in the note", w.Step, w.Kind, w.Message)})
	}
	return probs, warns
}

// draftNames are the user's containers a draft may name (D2): live projects
// (not archived), their sections, labels, saved views, and enabled webhooks
// by their host only (a webhook's address may hold a secret).
func (s *Server) draftNames(ctx context.Context, uid string) assistant.DraftNames {
	out := assistant.DraftNames{}
	str := func(row map[string]json.RawMessage, f string) string {
		var v string
		_ = json.Unmarshal(row[f], &v)
		return v
	}
	list := func(entity string) []map[string]json.RawMessage {
		rows, err := s.sync.List(ctx, uid, entity, false)
		if err != nil {
			s.log.Error("routine draft names not read", "entity", entity, "err", err)
			return nil
		}
		out := make([]map[string]json.RawMessage, 0, len(rows))
		for _, r := range rows {
			out = append(out, map[string]json.RawMessage(r))
		}
		return out
	}
	live := map[string]bool{}
	for _, p := range list("project") {
		if string(p["archived"]) == "true" {
			continue
		}
		live[str(p, "id")] = true
		out.Projects = append(out.Projects, assistant.DraftName{ID: str(p, "id"), Name: str(p, "name")})
	}
	for _, sec := range list("section") {
		if pid := str(sec, "project_id"); live[pid] {
			out.Sections = append(out.Sections, assistant.DraftName{ID: str(sec, "id"), Name: str(sec, "name"), Project: pid})
		}
	}
	for _, l := range list("label") {
		out.Labels = append(out.Labels, assistant.DraftName{ID: str(l, "id"), Name: str(l, "name")})
	}
	for _, v := range list("view") {
		out.Views = append(out.Views, assistant.DraftName{ID: str(v, "id"), Name: str(v, "name")})
	}
	rows, err := s.sync.DB().QueryContext(ctx, `SELECT id, url FROM webhooks WHERE user_id = ? AND enabled = 1 ORDER BY id`, uid)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var id, raw string
			if rows.Scan(&id, &raw) == nil {
				host := ""
				if u, err := url.Parse(raw); err == nil {
					host = u.Hostname()
				}
				out.Webhooks = append(out.Webhooks, assistant.DraftName{ID: id, Name: host})
			}
		}
		if rows.Err() != nil {
			out.Webhooks = nil
		}
	}
	return out
}
