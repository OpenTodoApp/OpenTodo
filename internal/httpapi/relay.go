package httpapi

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/agenttools"
	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/relay"
)

// Device relay (OpenSpec change mcp-device-relay): an encrypted account's
// opted-in device answers the decrypt and encrypt steps of MCP tool calls.
// No handler here logs a request or response body (security review T10).

func (s *Server) registerRelayRoutes(mux *routes) {
	s.relayStore = relay.NewStore(s.sync.DB())
	s.relayHub = relay.NewHub()
	mux.handle("GET /api/v1/relay/devices", signedIn.sessionOnly().demoDenied(), s.handleListRelayDevices)
	mux.handle("PUT /api/v1/relay/devices/{device}", signedIn.sessionOnly().recent().demoDenied(), s.handlePutRelayDevice)
	mux.handle("DELETE /api/v1/relay/devices/{device}", signedIn.sessionOnly().demoDenied(), s.handleDeleteRelayDevice)
	mux.handle("GET /api/v1/relay/events", signedIn.sessionOnly().demoDenied(), s.handleRelayEvents)
	mux.handle("POST /api/v1/relay/answers/{id}", signedIn.sessionOnly().demoDenied(), s.handleRelayAnswer)
}

// relayFor is the agenttools.Relay of one account.
type relayFor struct {
	hub *relay.Hub
	uid string
}

func (r relayFor) Do(ctx context.Context, op relay.Op, items []relay.Item, call relay.Call) ([]relay.Result, error) {
	return r.hub.Do(ctx, r.uid, op, items, call)
}

// relayCaller sets c.Relay when the account has an opted-in device.
func (s *Server) relayCaller(ctx context.Context, c *agenttools.Caller) error {
	if !c.Encrypted || s.relayStore == nil {
		return nil
	}
	any, err := s.relayStore.Any(ctx, c.UserID)
	if err != nil || !any {
		return err
	}
	c.Relay = relayFor{hub: s.relayHub, uid: c.UserID}
	return nil
}

type relayDeviceJSON struct {
	DeviceID  string `json:"deviceId"`
	Label     string `json:"label"`
	EnabledAt int64  `json:"enabledAt"`
	Online    bool   `json:"online"`
	// ThisSession is true for the device opted in by the calling session.
	ThisSession bool `json:"thisSession"`
}

func (s *Server) handleListRelayDevices(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := userFrom(ctx).ID
	list, err := s.relayStore.List(ctx, uid)
	if err != nil {
		s.internal(w, err)
		return
	}
	sess := sessionFrom(ctx)
	online := s.relayHub.Online(uid)
	out := make([]relayDeviceJSON, 0, len(list))
	for _, d := range list {
		out = append(out, relayDeviceJSON{DeviceID: d.DeviceID, Label: d.Label, EnabledAt: d.EnabledAt,
			Online: online, ThisSession: sess != nil && d.SessionHash == sess.TokenHash})
	}
	writeJSON(w, http.StatusOK, map[string]any{"devices": out})
}

func (s *Server) handlePutRelayDevice(w http.ResponseWriter, r *http.Request) {
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
		writeError(w, http.StatusConflict, "not_encrypted", "only an account with end-to-end encryption relays through a device")
		return
	}
	if !s.mcpSettings.Enabled(ctx) {
		writeError(w, http.StatusConflict, "mcp_disabled", "the server owner has turned AI assistants (MCP) off")
		return
	}
	created, err := s.relayStore.Enable(ctx, u.ID, device, strings.TrimSpace(in.Label), sess.TokenHash)
	if err != nil {
		s.internal(w, err)
		return
	}
	if created && s.audit != nil {
		s.audit.Record(ctx, audit.RelayEnabled(u.ID, device, strings.TrimSpace(in.Label)))
	}
	w.WriteHeader(http.StatusNoContent)
}

// relayReasons are the reasons a device may give for opting out.
var relayReasons = map[string]bool{"user": true, "locked": true}

func (s *Server) handleDeleteRelayDevice(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := userFrom(ctx).ID
	reason := r.URL.Query().Get("reason")
	if reason == "" {
		reason = "user"
	}
	if !relayReasons[reason] {
		writeError(w, http.StatusBadRequest, "invalid_input", "reason: user or locked")
		return
	}
	d, err := s.relayStore.Disable(ctx, uid, r.PathValue("device"))
	if err != nil {
		s.internal(w, err)
		return
	}
	s.relayHub.CloseDevice(uid, r.PathValue("device"))
	if d != nil && s.audit != nil {
		s.audit.Record(ctx, audit.RelayDisabled(uid, d.DeviceID, d.Label, reason))
	}
	w.WriteHeader(http.StatusNoContent)
}

// relayEndSession opts out the devices a session opted in (sign-out).
func (s *Server) relayEndSession(ctx context.Context, uid, sessionHash string) {
	if s.relayStore == nil {
		return
	}
	ended, err := s.relayStore.DisableSession(ctx, uid, sessionHash)
	if err != nil {
		s.log.Warn("relay: end session", "err", err)
		return
	}
	for _, d := range ended {
		s.relayHub.CloseDevice(uid, d.DeviceID)
		if s.audit != nil {
			s.audit.Record(ctx, audit.RelayDisabled(uid, d.DeviceID, d.Label, "signed_out"))
		}
	}
}

// relayEndAccount opts out every device of an account (encryption turned off).
func (s *Server) relayEndAccount(ctx context.Context, uid string) {
	if s.relayStore == nil {
		return
	}
	ended, err := s.relayStore.DisableAll(ctx, uid)
	if err != nil {
		s.log.Warn("relay: end account", "err", err)
		return
	}
	s.relayHub.CloseAccount(uid)
	for _, d := range ended {
		if s.audit != nil {
			s.audit.Record(ctx, audit.RelayDisabled(uid, d.DeviceID, d.Label, "encryption_off"))
		}
	}
}

// relayAllowed reports whether this session's device may hold a relay stream.
func (s *Server) relayAllowed(ctx context.Context, uid, device, sessionHash string) (bool, error) {
	if !s.mcpSettings.Enabled(ctx) {
		return false, nil
	}
	d, err := s.relayStore.Get(ctx, uid, device)
	if err != nil || d == nil {
		return false, err
	}
	return d.SessionHash == sessionHash, nil
}

// handleRelayEvents serves GET /api/v1/relay/events?device=&key=: the opted-in
// device's relay stream. key is the device's ephemeral ECDH P-256 public key;
// the first event, hello, carries the stream id and the server's key.
func (s *Server) handleRelayEvents(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid, sess := userFrom(ctx).ID, sessionFrom(ctx)
	device := r.URL.Query().Get("device")
	pub, err := base64.RawURLEncoding.DecodeString(r.URL.Query().Get("key"))
	if device == "" || err != nil || len(pub) == 0 {
		writeError(w, http.StatusBadRequest, "invalid_input", "device and key are required")
		return
	}
	ok, err := s.relayAllowed(ctx, uid, device, sess.TokenHash)
	if err != nil {
		s.internal(w, err)
		return
	}
	if !ok {
		writeError(w, http.StatusForbidden, "not_opted_in", "this device is not opted in to answer AI connectors from this session")
		return
	}
	ip := clientIP(r)
	if !s.streams.acquire(ip) {
		w.Header().Set("Retry-After", "30")
		writeError(w, http.StatusServiceUnavailable, "busy", "too many live streams are open, try again later")
		return
	}
	defer s.streams.release(ip)
	st, err := s.relayHub.Open(uid, device, sess.TokenHash, pub)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_input", "key: not a P-256 public key")
		return
	}
	defer s.relayHub.Close(st)

	rc := http.NewResponseController(w)
	_ = rc.SetReadDeadline(time.Time{})
	_ = rc.SetWriteDeadline(time.Time{})
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache")
	h.Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	hello, _ := json.Marshal(map[string]string{"stream": st.ID, "key": st.ServerKey()})
	if _, err := fmt.Fprintf(w, "event: hello\ndata: %s\n\n", hello); err != nil {
		return
	}
	if rc.Flush() != nil {
		return
	}
	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-st.Done():
			return
		case ev := <-st.Events():
			if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.Name, ev.Data); err != nil {
				return
			}
			if rc.Flush() != nil {
				return
			}
		case <-ticker.C:
			// Re-check the session, the opt-in and the owner switch every beat.
			u, cur, _, err := s.authenticateSession(r)
			if err != nil || u == nil || u.ID != uid || cur == nil || cur.TokenHash != sess.TokenHash {
				return
			}
			if ok, err := s.relayAllowed(ctx, uid, device, sess.TokenHash); err != nil || !ok {
				return
			}
			s.relayHub.Seen(st)
			if _, err := fmt.Fprint(w, ": ping\n\n"); err != nil {
				return
			}
			if rc.Flush() != nil {
				return
			}
		}
	}
}

// maxRelayAnswer bounds an answer body: 2 MB of values, sealed and encoded.
const maxRelayAnswer = 4 << 20

func (s *Server) handleRelayAnswer(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid, sess := userFrom(ctx).ID, sessionFrom(ctx)
	r.Body = http.MaxBytesReader(w, r.Body, maxRelayAnswer)
	var in struct {
		Box string `json:"box"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Box == "" {
		writeError(w, http.StatusBadRequest, "invalid_input", "box is required")
		return
	}
	if err := s.relayHub.Answer(uid, sess.TokenHash, r.PathValue("id"), in.Box); err != nil {
		if errors.Is(err, relay.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "no such relay request for this device")
			return
		}
		s.internal(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
