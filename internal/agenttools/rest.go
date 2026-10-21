package agenttools

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/pixari/opentodo/internal/ids"
)

// Agent REST routes (OpenSpec change `agent-ready-cli`, design D8). An `agent`
// token's write on one of the fixed REST content routes is translated by the
// transport into one or more tool calls and run here as ONE write call: one
// pass of the permission gate, one call against the per-minute limit, every
// plan laid over the previous ones, one Apply batch and one agent.write audit
// event per tool. So validation, limits (shared with MCP), E2EE refusal,
// mention suppression and attribution are exactly the MCP write tools'.

// ToolCall is one tool invocation of a combined REST write.
type ToolCall struct {
	Name string
	Args json.RawMessage
}

// CallAll runs write tools as one write call and returns each tool's result in
// order. Tools marked REST-only (update_project) are reachable here and nowhere
// else: MCP's tools/list and tools/call never see them.
func (r *Registry) CallAll(ctx context.Context, c Caller, calls []ToolCall) ([]map[string]any, error) {
	if len(calls) == 0 {
		return nil, argErr("nothing to change")
	}
	counts := make([]int, len(calls))
	out, err := r.writeAll(ctx, c, calls, counts)
	if c.Scope == ScopeAgent {
		for i, call := range calls {
			r.record(ctx, c, call.Name, counts[i], err)
		}
	}
	return out, err
}

// PlanAll plans the calls of CallAll without writing, checking the gate or
// counting against limits. The REST transport uses it to recognise a replayed
// Idempotency-Key before anything is applied.
func (r *Registry) PlanAll(ctx context.Context, c Caller, calls []ToolCall) ([]Plan, error) {
	var overlay ChangeSet
	plans := make([]Plan, 0, len(calls))
	for _, call := range calls {
		p, err := r.planWrite(ctx, c, call.Name, call.Args, overlay)
		if err != nil {
			return nil, err
		}
		overlay = append(overlay, p.Changes...)
		plans = append(plans, p)
	}
	return plans, nil
}

func (r *Registry) writeAll(ctx context.Context, c Caller, calls []ToolCall, counts []int) ([]map[string]any, error) {
	if denial := c.WriteDenial(); denial != "" {
		return nil, toolErr(denial, denialMessage(denial))
	}
	if ok, retry := r.limits.AllowCall(c.TokenID); !ok {
		return nil, rateLimited(retry, fmt.Sprintf("at most %d write calls per minute for each token", PerMinute))
	}
	plans, err := r.PlanAll(ctx, c, calls)
	if err != nil {
		return nil, err
	}
	var all ChangeSet
	total := 0
	for _, p := range plans {
		all = append(all, p.Changes...)
		total += p.Count
	}
	if total > PerCall {
		return nil, argErr(fmt.Sprintf("at most %d items per call (got %d)", PerCall, total))
	}
	if ok, retry := r.limits.Reserve(c.TokenID, total); !ok {
		return nil, rateLimited(retry, fmt.Sprintf("at most %d changed items per UTC day for each token", PerDay))
	}
	res, err := r.Apply(ctx, c, all)
	if err != nil {
		r.limits.Refund(c.TokenID, total)
		return nil, err
	}
	if res.Applied == 0 {
		r.limits.Refund(c.TokenID, total)
	}
	out := make([]map[string]any, len(plans))
	for i, p := range plans {
		counts[i] = p.Count
		out[i] = p.Result
	}
	return out, nil
}

// planWrite is Plan for write tools, REST-only ones included.
func (r *Registry) planWrite(ctx context.Context, c Caller, name string, rawArgs json.RawMessage, overlay ChangeSet) (Plan, error) {
	t, d, ok := lookupAll(name, c)
	if !ok || d.Kind != KindWrite {
		return Plan{}, argErr("unknown write tool: " + name)
	}
	a, err := parseArgs(rawArgs)
	if err != nil {
		return Plan{}, err
	}
	if c.Encrypted {
		for _, f := range d.ContentFields {
			if a.plainContent(f) {
				return Plan{}, encryptionErr()
			}
		}
	}
	return t.plan(r, ctx, c, a, overlay)
}

// OpID is the op id Apply gives field f of this change: derived from the
// client_request_id for keyed creates, "" (random at Apply) otherwise.
func (ch Change) OpID(field string) string {
	if ch.opSeed == "" {
		return ""
	}
	return ids.NameID("agent-op", ch.opSeed+":"+ch.Entity+":"+ch.EntityID+":"+field)
}

// KeyedChange names the entity that item i of a create with this
// client_request_id plans, with its derived op ids (Change.OpID), so a
// transport can recognise a replay the planner answers without changes (an
// existing label).
func KeyedChange(c Caller, clientRequestID, entity string, i int) Change {
	seed := requestSeed(c, clientRequestID)
	return Change{Entity: entity, EntityID: entityID(seed, i), Create: true, opSeed: seed}
}
