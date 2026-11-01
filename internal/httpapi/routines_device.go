package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/relay"
	"github.com/OpenTodoApp/opentodo/internal/rules"
)

// Device runs of an encrypted account's routines (OpenSpec change
// routines-ai-step, D7-D9): the routines opt-in of a device, the engine's
// view of the account's devices over the relay, and the routes a device
// commits a run's result through. Nothing here reads or logs content: a
// commit carries ciphertext and counts.

// routineDevices is the engine's rules.Devices over the relay store and hub.
type routineDevices struct{ s *Server }

func (d routineDevices) Opted(ctx context.Context, uid string) (bool, bool, error) {
	if d.s.relayStore == nil {
		return false, false, nil
	}
	return d.s.relayStore.RoutineDevices(ctx, uid)
}

func (d routineDevices) Online(uid, device string) bool {
	return d.s.relayHub != nil && d.s.relayHub.DeviceOnline(uid, device)
}

func (d routineDevices) Send(uid string, needAI bool, prefer string, run relay.RoutineRun) (relay.Sent, error) {
	if d.s.relayHub == nil {
		return relay.Sent{}, relay.ErrNoDevice
	}
	return d.s.relayHub.SendRoutine(uid, needAI, prefer, run)
}

func (s *Server) registerRoutineDeviceRoutes(mux *routes) {
	p := signedIn.SessionOnly().DemoDenied()
	mux.handle("POST /api/v1/me/rules/runs/{run}/commit", p, s.handleDeviceRunCommit)
	mux.handle("POST /api/v1/me/rules/runs/{run}/fail", p, s.handleDeviceRunFail)
}

// handlePutRoutinesDevice turns on "Run my routines on this device": an
// encrypted account's device, from a recently confirmed session. It does not
// need the owner's MCP switch: running the user's own routines sends nothing
// to a third party.
func (s *Server) handlePutRoutinesDevice(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	u, sess := userFrom(ctx), sessionFrom(ctx)
	device := r.PathValue("device")
	if device == "" || len(device) > 128 {
		writeError(w, http.StatusBadRequest, "invalid_input", "device: 1 to 128 characters")
		return
	}
	var in struct {
		Label string `json:"label"`
	}
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	enc, err := s.keys().Enabled(ctx, u.ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	if !enc {
		writeError(w, http.StatusConflict, "not_encrypted", "only an account with end-to-end encryption runs routines on its devices")
		return
	}
	if s.rules == nil {
		writeError(w, http.StatusConflict, "automations_off", "automations are turned off on this server")
		return
	}
	if _, err := s.relayStore.EnableRoutines(ctx, u.ID, device, strings.TrimSpace(in.Label), sess.TokenHash); err != nil {
		s.internal(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleDeleteRoutinesDevice turns it off, from any device of the account.
func (s *Server) handleDeleteRoutinesDevice(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := userFrom(ctx).ID
	d, err := s.relayStore.DisableRoutines(ctx, uid, r.PathValue("device"))
	if err != nil {
		s.internal(w, err)
		return
	}
	if d != nil {
		// The device's stream reopens with the roles it still has.
		s.relayHub.CloseDevice(uid, d.DeviceID)
	}
	w.WriteHeader(http.StatusNoContent)
}

// maxDeviceCommit bounds a commit body: 500 entities of ciphertext or one
// proposal envelope, with the step records.
const maxDeviceCommit = 8 << 20

func (s *Server) handleDeviceRunCommit(w http.ResponseWriter, r *http.Request) {
	if s.rules == nil {
		writeError(w, http.StatusNotFound, "not_found", "run not found")
		return
	}
	ctx := r.Context()
	r.Body = http.MaxBytesReader(w, r.Body, maxDeviceCommit)
	var in rules.DeviceCommit
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	res, err := s.rules.CommitDeviceRun(ctx, userFrom(ctx).ID, r.PathValue("run"), sessionFrom(ctx).TokenHash, in)
	if err != nil {
		s.deviceRunError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleDeviceRunFail(w http.ResponseWriter, r *http.Request) {
	if s.rules == nil {
		writeError(w, http.StatusNotFound, "not_found", "run not found")
		return
	}
	ctx := r.Context()
	r.Body = http.MaxBytesReader(w, r.Body, maxDeviceCommit)
	var in rules.DeviceFail
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	run, err := s.rules.FailDeviceRun(ctx, userFrom(ctx).ID, r.PathValue("run"), sessionFrom(ctx).TokenHash, in)
	if err != nil {
		s.deviceRunError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"run": run})
}

func (s *Server) deviceRunError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, rules.ErrNotYourRun):
		writeError(w, http.StatusForbidden, "forbidden", err.Error())
	case errors.Is(err, rules.ErrRunClosed):
		writeError(w, http.StatusConflict, "run_closed", err.Error())
	case errors.Is(err, rules.ErrRoutineChanged):
		writeError(w, http.StatusConflict, "routine_changed", err.Error())
	case errors.Is(err, rules.ErrFallback):
		writeError(w, http.StatusConflict, "fallback", err.Error())
	case errors.Is(err, rules.ErrDeviceWrites):
		writeError(w, http.StatusBadRequest, "write_limit", err.Error())
	case errors.Is(err, rules.ErrPlaintext):
		writeError(w, http.StatusBadRequest, "plaintext", err.Error())
	case errors.Is(err, rules.ErrBadCommit):
		writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
	default:
		s.routineError(w, err)
	}
}
