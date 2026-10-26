package httpapi

import (
	"context"
	"errors"
	"net/http"

	opsync "github.com/pixari/opentodo/internal/sync"
)

// The REST write path (non-negotiable 2): every REST write applies its ops as
// one strict batch (all or nothing) and wakes the user's devices when anything
// applied.

// applyAs applies ops as uid in one strict batch and, when anything applied,
// wakes every device but device.
func (s *Server) applyAs(ctx context.Context, uid, device string, ops []opsync.Op) (opsync.ApplyResult, error) {
	res, err := s.sync.ApplyStrict(ctx, uid, ops)
	if err == nil && res.Applied > 0 {
		s.sync.NotifyApplied(res, device)
	}
	return res, err
}

// refusals answers the refusal reasons a REST write explains itself, by
// RejectedError.Reason; otherRefusal answers every reason not listed.
type refusals map[string]func(w http.ResponseWriter, rej *opsync.RejectedError)

// otherRefusal is the refusals key of every reason without its own entry.
const otherRefusal = "*"

// refuse is a refusal answered with a fixed error.
func refuse(status int, code, message string) func(http.ResponseWriter, *opsync.RejectedError) {
	return func(w http.ResponseWriter, _ *opsync.RejectedError) { writeError(w, status, code, message) }
}

// applyREST is applyAs from the server device for a REST request. It answers
// the error itself and then reports false: a write limit as writeLimited does,
// an invalid op 400 invalid_input, a refusal listed in reasons as listed, any
// other refusal as reasons[otherRefusal] or else 403 forbidden with the
// sentence forbidden, anything else 500.
func (s *Server) applyREST(w http.ResponseWriter, ctx context.Context, uid string, ops []opsync.Op, forbidden string, reasons refusals) (opsync.ApplyResult, bool) {
	// REST writes come from no browser device, so every connected device is woken.
	res, err := s.applyAs(ctx, uid, serverDevice, ops)
	if err == nil {
		return res, true
	}
	var rej *opsync.RejectedError
	isRej := errors.As(err, &rej)
	switch {
	case writeLimited(w, err):
	case errors.Is(err, opsync.ErrInvalidOp):
		writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
	case isRej && reasons[rej.Reason] != nil:
		reasons[rej.Reason](w, rej)
	case isRej && reasons[otherRefusal] != nil:
		reasons[otherRefusal](w, rej)
	case isRej:
		writeError(w, http.StatusForbidden, "forbidden", forbidden)
	default:
		s.internal(w, err)
	}
	return res, false
}
