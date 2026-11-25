package httpapi

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/audit"
	ob "github.com/OpenTodoApp/opentodo/internal/outbound"
	"github.com/OpenTodoApp/opentodo/internal/push"
)

// iPhone push through the OpenTodo relay (OpenSpec change ios-push-relay,
// design D8): the owner's switch and the relay's address, and the routes the
// iPhone app registers, reports and removes its device with. Registered only
// with web push; every route answers 403 relay-off while the switch is off,
// and none of them is offered on a demo instance.

// Due route requests per device (D8).
const (
	appleDueLimit  = 30
	appleDueWindow = time.Hour
)

func (s *Server) registerApplePushRoutes(mux *routes) {
	if s.set == nil || s.set.Apple == nil || s.set.AppleRelay == nil {
		return
	}
	s.switchRoutes(mux, "/api/v1/settings/push/apple-relay", switchRoute{sw: s.set.AppleRelay,
		get: signedIn, put: ownerOnly("manage iPhone push through the relay").DemoDenied(),
		more: s.appleRelayBody, putMore: s.appleRelayBody})
	mux.handle("PUT /api/v1/settings/push/apple-relay/url", ownerOnly("manage iPhone push through the relay").DemoDenied(), s.handleAppleRelayURL)
	mux.handle("POST /api/v1/push/apple", signedIn.SessionOnly().DemoDenied(), s.appleGate(s.handleAppleRegister))
	mux.handle("PUT /api/v1/push/apple/{id}/schedule", signedIn.SessionOnly().DemoDenied(), s.appleGate(s.handleAppleSchedule))
	mux.handle("DELETE /api/v1/push/apple/{id}", signedIn.SessionOnly().DemoDenied(), s.appleGate(s.handleAppleDelete))
	mux.handle("GET /api/v1/push/apple/status", signedIn.SessionOnly().DemoDenied(), s.appleGate(s.handleAppleStatus))
	s.appleDueLimiter = s.limit("push.apple.due", appleDueLimit, appleDueWindow)
	mux.handle("GET /api/v1/push/apple/due", public("notification extension: its own device due token").DemoDenied(), s.appleGate(s.handleAppleDue))
}

// appleRelayBody adds the address in use, and what fixes it, to the switch's answer.
func (s *Server) appleRelayBody(r *http.Request) map[string]any {
	out := map[string]any{"url": s.set.AppleRelayURL(r.Context()), "urlFixedBy": nil}
	if s.cfg.AppleRelayURL != "" {
		out["urlFixedBy"] = "OPENTODO_APPLE_RELAY"
	}
	return out
}

// appleGate answers 403 relay-off while the owner's switch is off, before
// anything else: nothing reaches the relay then.
func (s *Server) appleGate(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !s.set.Apple.On(r.Context()) {
			writeError(w, http.StatusForbidden, "relay-off", "iPhone push through the relay is off on this server")
			return
		}
		next(w, r)
	}
}

// handleAppleRelayURL sets the relay's address ("" restores the project's
// relay). The environment's address wins; a private address needs the
// owner's "allow private network targets".
func (s *Server) handleAppleRelayURL(w http.ResponseWriter, r *http.Request) {
	var in struct {
		URL *string `json:"url"`
	}
	if err := readJSON(r, &in); err != nil || in.URL == nil {
		badBodyWith(w, err, "invalid_input", `body must be {"url": "https://…"}`)
		return
	}
	if s.cfg.AppleRelayURL != "" {
		writeError(w, http.StatusConflict, "set_by_environment", "OPENTODO_APPLE_RELAY sets this on the server")
		return
	}
	v := strings.TrimRight(strings.TrimSpace(*in.URL), "/")
	if v != "" {
		if err := push.CheckRelayURL(v); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
			return
		}
		if err := s.hooks.CheckTarget(r.Context(), v); errors.Is(err, ob.ErrPrivateTarget) {
			writeError(w, http.StatusBadRequest, "private_target", "the relay address is on a private network; allow private network targets first")
			return
		} else if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
			return
		}
	}
	before := s.set.AppleRelayURL(r.Context())
	var err error
	if v == "" {
		err = s.settings.Delete(r.Context(), push.AppleRelayURLKey)
	} else {
		err = s.settings.Set(r.Context(), push.AppleRelayURLKey, v)
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	after := s.set.AppleRelayURL(r.Context())
	if before != after {
		s.audit.Record(r.Context(), audit.SettingsChanged(userFrom(r.Context()).ID, push.AppleRelayURLKey, before, after))
	}
	writeJSON(w, http.StatusOK, s.appleRelayBody(r))
}

func (s *Server) handleAppleRegister(w http.ResponseWriter, r *http.Request) {
	var in push.AppleInput
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	d, err := s.set.Apple.Register(r.Context(), userFrom(r.Context()).ID, sessionFrom(r.Context()).TokenHash, in)
	switch {
	case errors.Is(err, push.ErrInvalidApple):
		writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
	case errors.Is(err, push.ErrRelayOff):
		writeError(w, http.StatusForbidden, "relay-off", "iPhone push through the relay is off on this server")
	case errors.Is(err, push.ErrRelayUnreachable):
		s.log.Warn("push relay registration failed", "err", err)
		writeError(w, http.StatusBadGateway, "relay-unreachable", "the push relay could not be reached")
	case err != nil:
		s.internal(w, err)
	default:
		writeJSON(w, http.StatusCreated, map[string]any{"registration": d.Public()})
	}
}

func (s *Server) handleAppleSchedule(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Cursor *int64 `json:"cursor"`
		Until  *int64 `json:"until"`
	}
	if err := readJSON(r, &in); err != nil || in.Cursor == nil || in.Until == nil || *in.Cursor < 0 || *in.Until < 0 {
		badBodyWith(w, err, "invalid_input", `body must be {"cursor": n, "until": ms}`)
		return
	}
	renew, err := s.set.Apple.ReportSchedule(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"), *in.Cursor, *in.Until)
	if errors.Is(err, push.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "registration not found")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"renew": renew})
}

func (s *Server) handleAppleDelete(w http.ResponseWriter, r *http.Request) {
	err := s.set.Apple.Delete(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"))
	if errors.Is(err, push.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "registration not found")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// relayFailingAfter is how long a registration's wakes fail before the
// delivery check reports the relay as unreachable (D8).
const relayFailingAfter = 3 * 24 * time.Hour

// handleAppleStatus is the relay's part of the delivery check (D10): whether
// the relay answers and with which protocol, and, with ?device=, that
// device's registration. Behind appleGate, so nothing is probed while the
// owner's switch is off.
func (s *Server) handleAppleStatus(w http.ResponseWriter, r *http.Request) {
	relay := map[string]any{"reached": true, "protocol": 0, "error": nil}
	if p, err := s.set.Apple.RelayHealth(r.Context()); err != nil {
		relay["reached"], relay["error"] = false, "the push relay could not be reached"
	} else {
		relay["protocol"] = p
	}
	out := map[string]any{"relay": relay}
	if dev := r.URL.Query().Get("device"); dev != "" {
		d, err := s.set.Apple.DeviceForCaller(r.Context(), userFrom(r.Context()).ID, dev)
		if err != nil {
			s.internal(w, err)
			return
		}
		out["registration"] = nil
		if d != nil {
			failing := d.FailingSince != nil && s.now().Sub(time.UnixMilli(*d.FailingSince)) >= relayFailingAfter
			out["registration"] = map[string]any{"id": d.ID, "expiresAt": d.HandleExpiresAt, "failures": d.Failures, "relayUnreachable": failing}
		}
	}
	writeJSON(w, http.StatusOK, out)
}

// handleAppleDue answers the notification extension: the reminders of the
// device's user due now, authenticated by the device's due token alone.
func (s *Server) handleAppleDue(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	tok, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "a device due token is required")
		return
	}
	d, err := s.set.Apple.DeviceForDueToken(r.Context(), strings.TrimSpace(tok))
	if errors.Is(err, push.ErrUnknownDueToken) {
		writeError(w, http.StatusUnauthorized, "unauthorized", "unknown device due token")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	if !s.appleDueLimiter.allow(d.ID) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many requests from this device, try again later")
		return
	}
	items, err := s.set.Apple.Due(r.Context(), d)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"reminders": items})
}
