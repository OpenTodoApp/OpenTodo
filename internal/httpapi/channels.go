package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/channels"
)

// Notification channels (OpenSpec change notification-channels): a person's
// ntfy, Pushover, Gotify and webhook channels and the owner switch. Every route
// is refused on a demo instance (outbound requests, secrets).

// WithChannels hands the server the channel service the tenant also
// registers as a sink and runs as a worker.
func WithChannels(svc *channels.Service) Option { return func(s *Server) { s.channels = svc } }

// Channels is the delivery channel service (the tenant runs its worker).
func (s *Server) Channels() *channels.Service { return s.channels }

func (s *Server) registerChannelRoutes(mux *routes) {
	if s.channels == nil {
		s.channels = channels.New(s.sync.DB(), s.cfg.DataDir, channels.Options{Version: s.version, Log: s.log,
			AllowPrivate: s.allowPrivate(), Encrypted: s.keys().Enabled, BaseOrigin: s.baseOrigin()})
	}
	s.channelLimiter = newRateLimiter(channels.TestsPerHour, time.Hour)
	mux.handle("GET /api/v1/settings/notification-channels", signedIn.demoDenied(), s.handleGetChannelsSetting)
	mux.handle("PUT /api/v1/settings/notification-channels", ownerOnly("manage notification channels on this server").demoDenied(), s.handlePutChannelsSetting)
	mux.handle("GET /api/v1/notification-channels", signedIn.demoDenied(), s.channelsGate(s.handleListChannels))
	mux.handle("POST /api/v1/notification-channels", signedIn.demoDenied(), s.channelsGate(s.handleCreateChannel))
	mux.handle("PATCH /api/v1/notification-channels/{id}", signedIn.demoDenied(), s.channelsGate(s.handlePatchChannel))
	mux.handle("DELETE /api/v1/notification-channels/{id}", signedIn.demoDenied(), s.channelsGate(s.handleDeleteChannel))
	mux.handle("POST /api/v1/notification-channels/{id}/test", signedIn.demoDenied(), s.channelsGate(s.handleTestChannel))
	mux.handle("GET /api/v1/notification-channels/{id}/deliveries", signedIn.demoDenied(), s.channelsGate(s.handleChannelDeliveries))
}

// baseOrigin is OPENTODO_BASE_URL's origin, "" when not configured.
func (s *Server) baseOrigin() string {
	if s.cfg.BaseURL == nil {
		return ""
	}
	return s.cfg.BaseURL.Scheme + "://" + s.cfg.BaseURL.Host
}

func (s *Server) handleGetChannelsSetting(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"enabled": s.channels.On(r.Context())})
}

func (s *Server) handlePutChannelsSetting(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Enabled *bool `json:"enabled"`
	}
	if err := readJSON(r, &in); err != nil || in.Enabled == nil {
		badBodyWith(w, err, "invalid_input", `body must be {"enabled": true|false}`)
		return
	}
	before, err := s.channels.SetEnabled(r.Context(), *in.Enabled)
	if err != nil {
		s.internal(w, err)
		return
	}
	if before != *in.Enabled {
		s.audit.Record(r.Context(), audit.SettingsChanged(userFrom(r.Context()).ID, channels.SettingKey, boolText(before), boolText(*in.Enabled)))
	}
	writeJSON(w, http.StatusOK, map[string]any{"enabled": *in.Enabled})
}

// channelsGate answers 404 channels_disabled while the owner switch is off.
func (s *Server) channelsGate(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !s.channels.On(r.Context()) {
			writeError(w, http.StatusNotFound, "channels_disabled", "the server owner has turned notification channels off")
			return
		}
		next(w, r)
	}
}

// channelError maps service errors onto the JSON error envelope.
func (s *Server) channelError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, channels.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "notification channel not found")
	case errors.Is(err, channels.ErrLimit):
		writeError(w, http.StatusConflict, "limit_reached", fmt.Sprintf("at most %d notification channels per account", channels.MaxPerUser))
	case errors.Is(err, channels.ErrPrivateTarget):
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": map[string]string{"code": "private_target", "field": "url",
			"message": "url: the address resolves to a private, loopback or link-local address; the server owner can allow private network targets in Settings → Integrations → Webhooks"}})
	case errors.Is(err, channels.ErrInvalid):
		msg := strings.TrimPrefix(err.Error(), channels.ErrInvalid.Error()+": ")
		field, text, _ := strings.Cut(msg, ": ")
		writeFieldError(w, field, text)
	default:
		s.internal(w, err)
	}
}

// channelInput is the body of POST and PATCH.
type channelInput struct {
	Kind          *string   `json:"kind"`
	Name          *string   `json:"name"`
	URL           *string   `json:"url"`
	Topic         *string   `json:"topic"`
	Token         *string   `json:"token"`
	UserKey       *string   `json:"userKey"`
	Events        *[]string `json:"events"`
	IncludeTitles *bool     `json:"includeTitles"`
	Enabled       *bool     `json:"enabled"`
	Lang          *string   `json:"lang"`
	Origin        *string   `json:"origin"`
	RotateSecret  bool      `json:"rotateSecret"`
}

func (in channelInput) service() channels.Input {
	return channels.Input{Kind: in.Kind, Name: in.Name, URL: in.URL, Topic: in.Topic, Token: in.Token, UserKey: in.UserKey, Events: in.Events,
		IncludeTitles: in.IncludeTitles, Enabled: in.Enabled, Lang: in.Lang, Origin: in.Origin, RotateSecret: in.RotateSecret}
}

func (s *Server) handleListChannels(w http.ResponseWriter, r *http.Request) {
	list, err := s.channels.List(r.Context(), userFrom(r.Context()).ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"channels": list, "kinds": channels.Kinds, "events": channels.Events})
}

func (s *Server) handleCreateChannel(w http.ResponseWriter, r *http.Request) {
	var in channelInput
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	uid := userFrom(r.Context()).ID
	c, secret, err := s.channels.Create(r.Context(), uid, in.service())
	if err != nil {
		s.channelError(w, err)
		return
	}
	s.audit.Record(r.Context(), audit.NotificationChannelCreated(uid, c.ID, c.Kind))
	out := map[string]any{"channel": c}
	if secret != "" {
		out["secret"] = secret
	}
	writeJSON(w, http.StatusCreated, out)
}

func (s *Server) handlePatchChannel(w http.ResponseWriter, r *http.Request) {
	var in channelInput
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	uid := userFrom(r.Context()).ID
	c, secret, changed, err := s.channels.Update(r.Context(), uid, r.PathValue("id"), in.service())
	if err != nil {
		s.channelError(w, err)
		return
	}
	if len(changed) > 0 {
		s.audit.Record(r.Context(), audit.NotificationChannelUpdated(uid, c.ID, c.Kind, strings.Join(changed, ",")))
	}
	out := map[string]any{"channel": c}
	if secret != "" {
		out["secret"] = secret
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleDeleteChannel(w http.ResponseWriter, r *http.Request) {
	uid := userFrom(r.Context()).ID
	c, err := s.channels.Delete(r.Context(), uid, r.PathValue("id"))
	if err != nil {
		s.channelError(w, err)
		return
	}
	s.audit.Record(context.WithoutCancel(r.Context()), audit.NotificationChannelDeleted(uid, c.ID, c.Kind))
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleTestChannel(w http.ResponseWriter, r *http.Request) {
	uid := userFrom(r.Context()).ID
	if _, err := s.channels.Get(r.Context(), uid, r.PathValue("id")); err != nil {
		s.channelError(w, err)
		return
	}
	if !s.channelLimiter.allow(uid) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", fmt.Sprintf("at most %d test messages per hour; try again later", channels.TestsPerHour))
		return
	}
	res, err := s.channels.Test(r.Context(), uid, r.PathValue("id"))
	if err != nil {
		s.channelError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleChannelDeliveries(w http.ResponseWriter, r *http.Request) {
	list, err := s.channels.Deliveries(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"))
	if err != nil {
		s.channelError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deliveries": list})
}
