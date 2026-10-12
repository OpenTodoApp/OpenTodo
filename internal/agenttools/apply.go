package agenttools

import (
	"context"
	"errors"
	"sort"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/ids"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Apply turns a ChangeSet into ops and applies them as one batch with
// ApplyStrict as the caller's user, device agent:<token-id> and one server
// timestamp, then wakes devices with NotifyApplied (design D4). Sharing roles,
// validation and comment rules are checked per op exactly as for REST writes;
// one refused op refuses the whole batch and nothing is stored.
func (r *Registry) Apply(ctx context.Context, c Caller, cs ChangeSet) (opsync.ApplyResult, error) {
	if len(cs) == 0 {
		return opsync.ApplyResult{}, nil
	}
	device := c.Device()
	ts := r.opTS()
	var ops []opsync.Op
	for _, ch := range cs {
		fields := make([]string, 0, len(ch.Patch))
		for f := range ch.Patch {
			fields = append(fields, f)
		}
		sort.Strings(fields)
		for _, f := range fields {
			id := ids.New()
			if ch.opSeed != "" {
				id = ids.NameID("agent-op", ch.opSeed+":"+ch.Entity+":"+ch.EntityID+":"+f)
			}
			ops = append(ops, opsync.Op{ID: id, Entity: ch.Entity, EntityID: ch.EntityID, Field: f, Value: ch.Patch[f], TS: ts, Device: device})
		}
		if r.extraOps != nil {
			extra, err := r.extraOps(ctx, c.UserID, ch, ts, device)
			if err != nil {
				return opsync.ApplyResult{}, err
			}
			ops = append(ops, extra...)
		}
	}
	res, err := r.sync.ApplyStrict(ctx, c.UserID, ops)
	if err != nil {
		return res, applyError(err)
	}
	if res.Applied > 0 {
		r.sync.NotifyApplied(res, device)
	}
	return res, nil
}

// applyError maps a refused batch onto a tool error the assistant can explain.
func applyError(err error) error {
	var rej *opsync.RejectedError
	switch {
	case errors.As(err, &rej):
		item := map[string]any{"entity": rej.Op.Entity, "id": rej.Op.EntityID, "reason": rej.Reason}
		msg := "the change was refused and nothing was applied"
		switch rej.Reason {
		case opsync.ReasonForbidden:
			msg = "your role does not allow this change; nothing was applied"
		case opsync.ReasonScopeChange:
			msg = "a task cannot move between projects that are shared differently; nothing was applied"
		case opsync.ReasonRateLimited:
			msg = "too many comments in a short time; nothing was applied"
			return &ToolError{Code: "rate_limited", Message: msg, Data: map[string]any{"retry_after_seconds": 60, "items": []any{item}}}
		}
		return &ToolError{Code: rej.Reason, Message: msg, Data: map[string]any{"items": []any{item}}}
	case errors.Is(err, opsync.ErrWriteLimit):
		return toolErr("write_limit", "this account's write budget is used up; nothing was applied")
	case errors.Is(err, opsync.ErrInvalidOp):
		return argErr(strings.TrimPrefix(err.Error(), opsync.ErrInvalidOp.Error()+": "))
	}
	return err
}

// opTS issues strictly increasing timestamps for agent writes from the wall
// clock, like the REST clock: two calls within one millisecond must not tie
// under last-writer-wins. (Registry.now only decides calendar dates.)
func (r *Registry) opTS() int64 {
	r.clockMu.Lock()
	defer r.clockMu.Unlock()
	r.lastTS = max(time.Now().UnixMilli(), r.lastTS+1)
	return r.lastTS
}

// stamp is a wall-clock Unix millisecond value for created_at, completed_at
// and deleted_at fields.
func stamp() int64 { return time.Now().UnixMilli() }
