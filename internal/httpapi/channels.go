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

func (s *Server) registerChannelRoutes(mux *routes) {
	s.channelLimiter = newRateLimiter(channels.TestsPerHour, time.Hour)
	s.switchRoutes(mux, "/api/v1/settings/notification-channels", switchRoute{sw: s.set.ChannelsOn,
		get: signedIn.DemoDenied(), put: ownerOnly("manage notification channels on this server").DemoDenied(),
		after: func(_ context.Context, _, on bool) {
			if on && s.channels != nil {
				s.channels.Wake()
			}
		}})
	mux.handle("GET /api/v1/notification-channels", signedIn.DemoDenied(), s.channelsGate(s.handleListChannels))
	mux.handle("POST /api/v1/notification-channels", signedIn.DemoDenied(), s.channelsGate(s.handleCreateChannel))
	mux.handle("PATCH /api/v1/notification-channels/{id}", signedIn.DemoDenied(), s.channelsGate(s.handlePatchChannel))
	mux.handle("DELETE /api/v1/notification-channels/{id}", signedIn.DemoDenied(), s.channelsGate(s.handleDeleteChannel))
	mux.handle("POST /api/v1/notification-channels/{id}/test", signedIn.DemoDenied(), s.channelsGate(s.handleTestChannel))
	mux.handle("GET /api/v1/notification-channels/{id}/deliveries", signedIn.DemoDenied(), s.channelsGate(s.handleChannelDeliveries))
}

// channelsGate answers 404 channels_disabled while the owner switch is off.
func (s *Server) channelsGate(next http.HandlerFunc) http.HandlerFunc {
	return switchGate(s.set.ChannelsOn, "channels_disabled", "the server owner has turned notification channels off")(next)
}

// channelError maps service errors onto the JSON error envelope.
func (s *Server) channelError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, channels.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "notification channel not found")
	case errors.Is(err, channels.ErrLimit):
		writeError(w, http.StatusConflict, "limit_reached", fmt.Sprintf("at most %d notification channels per account", channels.MaxPerUser))
	case errors.Is(err, channels.ErrPrivateTarget):
		writeErrorWith(w, http.StatusBadRequest, "private_target",
			"url: the address resolves to a private, loopback or link-local address; the server owner can allow private network targets in Settings → Integrations → Webhooks",
			map[string]any{"field": "url"})
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
