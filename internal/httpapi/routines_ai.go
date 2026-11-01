package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/OpenTodoApp/opentodo/internal/assistant"
	"github.com/OpenTodoApp/opentodo/internal/rules"
	"github.com/OpenTodoApp/opentodo/internal/ruleval"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// The AI steps of routines (OpenSpec change routines-ai-step): the engine's
// provider calls through the assistant, step availability, and the proposal
// routes. Proposals hold content while they wait: their routes need a session
// or a full or admin token (FullTokens refuses read and agent tokens) and are
// refused on a demo instance.

// routineAI makes a routine's AI calls through the in-app assistant with the
// owner's settings as this server reads them (off on a demo).
type routineAI struct{ s *Server }

func (a routineAI) call(c rules.AICall, uid string) assistant.RoutineCall {
	return assistant.RoutineCall{UserID: uid, Instruction: c.Instruction, Context: c.Context, Answer: c.Answer, MaxTokens: c.MaxTokens}
}

func (a routineAI) Estimate(c rules.AICall) int64 { return assistant.EstimateTokens(a.call(c, "")) }

func (a routineAI) Complete(ctx context.Context, uid string, c rules.AICall) (rules.AIAnswer, error) {
	if a.s.assistant == nil {
		return rules.AIAnswer{}, &rules.AIError{Code: ruleval.ReasonAINotConfigured, Msg: "the assistant is not set up on this server"}
	}
	ans, err := a.s.assistant.Routine(ctx, a.s.assistantSettings(ctx), a.call(c, uid))
	out := rules.AIAnswer{Text: ans.Text, Lines: ans.Lines, Input: ans.Input, Output: ans.Output}
	// The log holds the provider, the outcome and the counts, never text.
	a.s.log.Info("routine AI call", "provider", ans.Provider, "own_key", ans.Own, "input_tokens", ans.Input, "output_tokens", ans.Output, "failed", err != nil)
	if err == nil {
		return out, nil
	}
	var re *assistant.RoutineError
	if errors.As(err, &re) {
		return out, &rules.AIError{Code: re.Code, Msg: re.Msg}
	}
	if pe, ok := assistant.AsProviderError(err); ok {
		msg := pe.Msg
		if pe.Code == assistant.CodeProviderAuth && ans.Own {
			msg = assistant.OwnKeyRejected()
		}
		return out, &rules.AIError{Code: pe.Code, Msg: msg}
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return out, &rules.AIError{Code: assistant.CodeProviderError, Msg: "the provider did not answer within 60 seconds"}
	}
	return out, err
}

// routineAIEnv adds what AI steps need to the availability environment: the
// assistant usable by the user with consent for routines (D1, D10). An
// encrypted account's AI steps need a device (routines run there).
func (s *Server) routineAIEnv(ctx context.Context, uid string, env *ruleval.Env) {
	if s.assistant == nil || env.Encrypted {
		return
	}
	configured, consented, err := s.assistant.RoutineReady(ctx, uid, s.assistantSettings(ctx))
	if err != nil {
		s.log.Error("routine AI availability", "err", err)
		return
	}
	env.AI, env.AIConsent = configured, consented
}

// checkRuleAI validates the two AI fields of a rule body (D4, D11).
func checkRuleAI(body map[string]json.RawMessage) error {
	if raw, has := body["ai_apply"]; has {
		var v string
		if json.Unmarshal(raw, &v) != nil || (v != "" && v != "auto") {
			return invalidRule(`rule.ai_apply must be "auto" or ""`)
		}
	}
	if raw, has := body["ai_budget"]; has {
		var v float64
		if json.Unmarshal(raw, &v) != nil || !rules.ValidAIBudget(v) {
			return invalidRule("rule.ai_budget must be 0 (the default, 20000) or a whole number from 1000 to 200000")
		}
	}
	return nil
}

// annotateRuleAI adds a routine's AI mode and the step Apply without asking
// cannot run with (read-only, dropped on write like the other annotations).
func (s *Server) annotateRuleAI(ctx context.Context, uid string, e opsync.Entity) {
	if mode := s.ruleAIMode(ctx, uid, e); mode != nil {
		e["ai_mode"] = jsonRaw(mode)
	}
}

// ruleAIMode is a routine's AI mode as the routes show it, nil without AI steps.
func (s *Server) ruleAIMode(ctx context.Context, uid string, e opsync.Entity) map[string]any {
	if s.rules == nil || isNullish(e["steps"]) {
		return nil
	}
	steps, err := ruleval.ParseSteps(e["steps"])
	if err != nil || !ruleval.HasAI(steps) {
		return nil
	}
	mode, err := s.rules.AIMode(ctx, uid, idOf(e["id"]))
	if err != nil {
		return nil
	}
	out := map[string]any{"auto": mode.Auto, "asked": mode.Asked, "reason": mode.Reason, "at": mode.At}
	if step, what := ruleval.AutoBlocker(steps); what != "" {
		out["blocked"] = map[string]string{"step": step, "what": what}
	}
	return out
}

func (s *Server) registerRoutineAIRoutes(mux *routes) {
	p := signedIn.FullTokens().DemoDenied()
	mux.handle("GET /api/v1/me/rules/proposals", p, s.handleProposals)
	mux.handle("GET /api/v1/me/rules/proposals/{id}", p, s.handleProposal)
	mux.handle("POST /api/v1/me/rules/proposals/{id}/apply", p, s.handleApplyProposal)
	mux.handle("DELETE /api/v1/me/rules/proposals/{id}", p, s.handleDismissProposal)
	mux.handle("GET /api/v1/rules/{id}/ai-usage", signedIn.DemoDenied(), s.handleRoutineAIUsage)
}

func (s *Server) proposalError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, rules.ErrProposalNotFound):
		writeError(w, http.StatusNotFound, "not_found", "proposal not found")
	case errors.Is(err, rules.ErrProposalClosed):
		writeError(w, http.StatusConflict, "proposal_closed", err.Error())
	case errors.Is(err, rules.ErrProposalEncrypted):
		writeError(w, http.StatusConflict, "encrypted", err.Error())
	case errors.Is(err, rules.ErrNoItems):
		writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
	default:
		s.routineError(w, err)
	}
}

func (s *Server) handleProposals(w http.ResponseWriter, r *http.Request) {
	out := []rules.Proposal{}
	if s.rules != nil {
		list, err := s.rules.Store.Proposals(r.Context(), userFrom(r.Context()).ID)
		if err != nil {
			s.internal(w, err)
			return
		}
		out = list
	}
	writeJSON(w, http.StatusOK, map[string]any{"proposals": out})
}

func (s *Server) handleProposal(w http.ResponseWriter, r *http.Request) {
	if s.rules == nil {
		writeError(w, http.StatusNotFound, "not_found", "proposal not found")
		return
	}
	p, err := s.rules.GetProposal(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"))
	if err != nil {
		s.proposalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (s *Server) handleApplyProposal(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Items *[]string `json:"items"`
	}
	if err := readJSONLimit(r, &in, 64<<10); err != nil {
		badBodyWith(w, err, "invalid_input", `body must be {"items"?: [item key, …]}`)
		return
	}
	if s.rules == nil {
		writeError(w, http.StatusNotFound, "not_found", "proposal not found")
		return
	}
	var keys []string
	if in.Items != nil {
		keys = *in.Items
		if keys == nil {
			keys = []string{}
		}
	}
	res, err := s.rules.ApplyProposal(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"), keys)
	if err != nil {
		s.proposalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleDismissProposal(w http.ResponseWriter, r *http.Request) {
	if s.rules == nil {
		writeError(w, http.StatusNotFound, "not_found", "proposal not found")
		return
	}
	if err := s.rules.DismissProposal(r.Context(), userFrom(r.Context()).ID, r.PathValue("id")); err != nil {
		s.proposalError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleRoutineAIUsage answers a routine's AI tokens of the last 7 days, its
// daily budget and its AI mode (the editor's AI settings, D12).
func (s *Server) handleRoutineAIUsage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := userFrom(ctx).ID
	row, err := s.sync.Get(ctx, uid, "rule", r.PathValue("id"))
	if err != nil {
		s.internal(w, err)
		return
	}
	if row == nil || row.Deleted() || s.rules == nil {
		writeError(w, http.StatusNotFound, "not_found", "routine not found")
		return
	}
	days, err := s.rules.Store.AIUsage(ctx, uid, r.PathValue("id"))
	if err != nil {
		s.internal(w, err)
		return
	}
	var budget float64
	_ = json.Unmarshal(row["ai_budget"], &budget)
	writeJSON(w, http.StatusOK, map[string]any{"days": days, "budget": rules.AIBudget(budget), "mode": s.ruleAIMode(ctx, uid, row)})
}
