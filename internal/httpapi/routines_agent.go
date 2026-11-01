package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/agenttools"
	"github.com/OpenTodoApp/opentodo/internal/ids"
	"github.com/OpenTodoApp/opentodo/internal/rules"
	"github.com/OpenTodoApp/opentodo/internal/ruleval"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// routineTools serves the MCP routine tools (routines-engine D11) with the
// same checks as the REST routes and the rules engine's runs.
type routineTools struct{ s *Server }

func (rt routineTools) Check(ctx context.Context, uid string, body map[string]json.RawMessage, existing opsync.Entity) ([]ruleval.StepWarning, error) {
	s := rt.s
	if len(body) > 0 {
		if err := s.checkRule(ctx, uid, body, existing); err != nil {
			var c *errRuleConflict
			switch {
			case errors.Is(err, errInvalidRule):
				return nil, &agenttools.ToolError{Code: "invalid_argument", Message: strings.TrimPrefix(err.Error(), errInvalidRule.Error()+": ")}
			case errors.As(err, &c):
				return nil, &agenttools.ToolError{Code: c.code, Message: c.msg}
			}
			return nil, err
		}
	}
	row := opsync.Entity{}
	for k, v := range existing {
		row[k] = v
	}
	for k, v := range body {
		row[k] = v
	}
	return s.routineWarnings(ctx, uid, row), nil
}

func (rt routineTools) Runs(ctx context.Context, uid, ruleID, outcome string, limit int) (any, error) {
	return rt.s.rules.Store.UserRuns(ctx, uid, rules.RunFilter{RuleID: ruleID, Outcome: outcome, Limit: limit})
}

func (rt routineTools) Run(ctx context.Context, uid, ruleID, runID string) (any, bool, error) {
	run, err := rt.s.rules.Store.RunByID(ctx, uid, runID)
	if errors.Is(err, rules.ErrRunNotFound) || (err == nil && run.RuleID != ruleID) {
		return nil, false, nil
	}
	return run, err == nil, err
}

func (rt routineTools) RunNow(ctx context.Context, uid, ruleID, taskID string, test bool) (map[string]any, int, error) {
	res, err := rt.s.rules.RunNow(ctx, uid, rules.RunRequest{RuleID: ruleID, RunID: ids.New(), TaskID: taskID, Test: test, Source: rules.SourceMCP})
	if err != nil {
		code := "run_refused"
		switch {
		case errors.Is(err, rules.ErrNotFound):
			code = "not_found"
		case errors.Is(err, rules.ErrTaskRequired):
			code = "task_required"
		case errors.Is(err, rules.ErrRateLimited):
			code = "rate_limited"
		case errors.Is(err, rules.ErrPausedRule):
			code = "paused"
		case errors.Is(err, rules.ErrOff):
			code = "automations_off"
		case errors.Is(err, rules.ErrInvalidDraft):
			code = "invalid_argument"
		default:
			return nil, 0, err
		}
		return nil, 0, &agenttools.ToolError{Code: code, Message: err.Error()}
	}
	b, _ := json.Marshal(res)
	out := map[string]any{}
	_ = json.Unmarshal(b, &out)
	writes := res.Run.Writes
	if res.Test {
		writes = 0
	}
	return out, writes, nil
}

func (rt routineTools) State(ctx context.Context, uid string) (map[string]string, map[string]int64) {
	paused, _ := rt.s.rules.Store.Paused(ctx, uid)
	last := map[string]int64{}
	if sums, err := rt.s.rules.Store.Summaries(ctx, uid); err == nil {
		for id, sum := range sums {
			last[id] = sum.LastRun
		}
	}
	return paused, last
}
