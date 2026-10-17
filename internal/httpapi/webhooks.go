package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/pixari/opentodo/internal/webhook"
)

// Option customises the Server built by New.
type Option func(*Server)

// WithWebhooks enables the /api/v1/webhooks routes and the owner policy route
// (OpenSpec change `webhooks`). Without it those routes answer 503.
func WithWebhooks(svc *webhook.Service) Option {
	return func(s *Server) { s.hooks = svc }
}

// registerWebhookRoutes adds the webhook routes. Every route requires
// authentication and is scoped to the caller; the policy route is owner-only.
func (s *Server) registerWebhookRoutes(mux *routes) {
	mux.handle("GET /api/v1/webhooks", signedIn, s.withHooks(s.handleListWebhooks))
	mux.handle("POST /api/v1/webhooks", signedIn.demoDenied(), s.withHooks(s.handleCreateWebhook))
	mux.handle("GET /api/v1/webhooks/{id}", signedIn, s.withHooks(s.handleGetWebhook))
	mux.handle("PATCH /api/v1/webhooks/{id}", signedIn.demoDenied(), s.withHooks(s.handlePatchWebhook))
	mux.handle("DELETE /api/v1/webhooks/{id}", signedIn.demoDenied(), s.withHooks(s.handleDeleteWebhook))
	mux.handle("POST /api/v1/webhooks/{id}/test", signedIn.demoDenied(), s.withHooks(s.handleTestWebhook))
	mux.handle("GET /api/v1/webhooks/{id}/deliveries", signedIn, s.withHooks(s.handleListDeliveries))
	mux.handle("POST /api/v1/webhooks/{id}/deliveries/{did}/redeliver", signedIn.demoDenied(), s.withHooks(s.handleRedeliver))
	mux.handle("GET /api/v1/settings/webhooks", ownerOnly("manage the webhook policy"), s.withHooks(s.handleGetWebhookPolicy))
	mux.handle("PUT /api/v1/settings/webhooks", ownerOnly("manage the webhook policy").demoDenied(), s.withHooks(s.handlePutWebhookPolicy))
}

func (s *Server) withHooks(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if s.hooks == nil {
			writeError(w, http.StatusServiceUnavailable, "unavailable", "webhooks are not enabled on this server")
			return
		}
		next(w, r)
	}
}

// webhookError maps service errors onto the JSON error envelope.
func (s *Server) webhookError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, webhook.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "webhook not found")
	case errors.Is(err, webhook.ErrPrivateTarget):
		writeError(w, http.StatusBadRequest, "private_target",
			"url: the target resolves to a private, loopback or link-local address; the server owner can allow private network targets in Settings → Integrations → Webhooks")
	case errors.Is(err, webhook.ErrLimit):
		writeError(w, http.StatusConflict, "limit_reached", "at most 20 webhooks per account")
	case errors.Is(err, webhook.ErrInvalid):
		writeError(w, http.StatusBadRequest, "invalid_input", strings.TrimPrefix(err.Error(), webhook.ErrInvalid.Error()+": "))
	default:
		s.internal(w, err)
	}
}

// decodeWebhookPatch reads create/update input. Presence matters for PATCH, so
// the body is decoded field by field.
func decodeWebhookPatch(r *http.Request) (webhook.Patch, error) {
	var raw map[string]json.RawMessage
	var p webhook.Patch
	if err := readJSON(r, &raw); err != nil {
		return p, err
	}
	bad := func(field, msg string) error { return errors.New(field + ": " + msg) }
	if v, ok := raw["url"]; ok {
		var u string
		if err := json.Unmarshal(v, &u); err != nil {
			return p, bad("url", "must be a string")
		}
		p.URL = &u
	}
	if v, ok := raw["events"]; ok {
		p.EventsSet = true
		if string(v) != "null" {
			if err := json.Unmarshal(v, &p.Events); err != nil {
				return p, bad("events", "must be an array of event names")
			}
		}
	}
	if v, ok := raw["projectId"]; ok {
		p.ProjectIDSet = true
		if string(v) != "null" {
			var id string
			if err := json.Unmarshal(v, &id); err != nil {
				return p, bad("projectId", "must be a project id or null")
			}
			p.ProjectID = &id
		}
	}
	if v, ok := raw["enabled"]; ok {
		var b bool
		if err := json.Unmarshal(v, &b); err != nil {
			return p, bad("enabled", "must be a boolean")
		}
		p.Enabled = &b
	}
	return p, nil
}

func (s *Server) handleListWebhooks(w http.ResponseWriter, r *http.Request) {
	list, err := s.hooks.List(r.Context(), userFrom(r.Context()).ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"webhooks": list, "events": webhook.Events})
}

func (s *Server) handleCreateWebhook(w http.ResponseWriter, r *http.Request) {
	p, err := decodeWebhookPatch(r)
	if err != nil {
		badBodyWith(w, err, "invalid_input", err.Error())
		return
	}
	hook, err := s.hooks.Create(r.Context(), userFrom(r.Context()).ID, p)
	if err != nil {
		s.webhookError(w, err)
		return
	}
	// The only response that ever carries the secret.
	writeJSON(w, http.StatusCreated, map[string]any{"webhook": hook})
}

func (s *Server) handleGetWebhook(w http.ResponseWriter, r *http.Request) {
	hook, err := s.hooks.Get(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"))
	if err != nil {
		s.webhookError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"webhook": hook})
}

func (s *Server) handlePatchWebhook(w http.ResponseWriter, r *http.Request) {
	p, err := decodeWebhookPatch(r)
	if err != nil {
		badBodyWith(w, err, "invalid_input", err.Error())
		return
	}
	hook, err := s.hooks.Update(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"), p)
	if err != nil {
		s.webhookError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"webhook": hook})
}

func (s *Server) handleDeleteWebhook(w http.ResponseWriter, r *http.Request) {
	if err := s.hooks.Delete(r.Context(), userFrom(r.Context()).ID, r.PathValue("id")); err != nil {
		s.webhookError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleTestWebhook(w http.ResponseWriter, r *http.Request) {
	d, err := s.hooks.Test(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"))
	if err != nil {
		s.webhookError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": d.Status == "delivered", "delivery": d})
}

func (s *Server) handleListDeliveries(w http.ResponseWriter, r *http.Request) {
	list, err := s.hooks.Deliveries(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"))
	if err != nil {
		s.webhookError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deliveries": list})
}

func (s *Server) handleRedeliver(w http.ResponseWriter, r *http.Request) {
	d, err := s.hooks.Redeliver(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"), r.PathValue("did"))
	if errors.Is(err, webhook.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "delivery not found")
		return
	}
	if err != nil {
		s.webhookError(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"delivery": d})
}

func (s *Server) handleGetWebhookPolicy(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"allowPrivate": s.hooks.AllowPrivate(r.Context())})
}

func (s *Server) handlePutWebhookPolicy(w http.ResponseWriter, r *http.Request) {
	var in struct {
		AllowPrivate *bool `json:"allowPrivate"`
	}
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	if in.AllowPrivate == nil {
		writeError(w, http.StatusBadRequest, "invalid_input", "allowPrivate: must be true or false")
		return
	}
	if err := s.hooks.SetAllowPrivateAs(r.Context(), userFrom(r.Context()).ID, *in.AllowPrivate, s.audit); err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"allowPrivate": *in.AllowPrivate})
}
