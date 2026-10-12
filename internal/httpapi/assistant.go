package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/agenttools"
	"github.com/pixari/opentodo/internal/assistant"
	"github.com/pixari/opentodo/internal/auth"
)

// In-app assistant (OpenSpec change `in-app-assistant`): the owner's settings
// and provider keys, the user's consent and own key, usage, and the turn
// route that streams an answer and at most one proposed change set. The
// server never applies a proposal: the browser does, after review, through
// mutateMany with device assistant:<device-id>.

// Turn limits (design D5).
const (
	turnMaxBody     = 256 << 10
	turnMaxMessages = 40
	turnTimeout     = 5 * time.Minute
)

// WithAssistantSetup adjusts the assistant service after it is built (tests
// point the providers at httptest fakes through it).
func WithAssistantSetup(f func(*assistant.Service)) Option {
	return func(s *Server) { s.assistantSetup = f }
}

func (s *Server) registerAssistantRoutes(mux *http.ServeMux) {
	store := assistant.NewStore(s.sync.DB(), s.cfg.DataDir, nil)
	s.assistant = assistant.NewService(store, &assistant.Loop{Tools: s.agentTools, Sync: s.sync, Log: s.log})
	if s.assistantSetup != nil {
		s.assistantSetup(s.assistant)
	}
	mux.Handle("GET /api/v1/settings/assistant", s.requireAuth(s.handleGetAssistantSettings))
	mux.Handle("PUT /api/v1/settings/assistant", s.requireAuth(s.handlePutAssistantSettings))
	mux.Handle("POST /api/v1/settings/assistant/test", s.requireAuth(s.handleTestAssistant))
	mux.Handle("GET /api/v1/me/assistant", s.requireAuth(s.handleGetMyAssistant))
	mux.Handle("PUT /api/v1/me/assistant", s.requireAuth(s.handlePutMyAssistant))
	mux.Handle("GET /api/v1/me/assistant/usage", s.requireAuth(s.handleMyAssistantUsage))
	mux.Handle("POST /api/v1/assistant/turn", s.requireAuth(s.handleAssistantTurn))
}

// ---- owner settings ----

func (s *Server) assistantSettings(ctx context.Context) assistant.Settings {
	set, err := s.assistant.Store.Settings(ctx)
	if err != nil {
		s.log.Error("assistant settings unreadable; treating the assistant as off", "err", err)
		set = assistant.Defaults()
	}
	if s.demo != nil {
		set.Enabled = false
	}
	return set
}

// ownerView is the owner's settings with key presence flags, never keys.
func (s *Server) ownerView(ctx context.Context) (map[string]any, error) {
	set := s.assistantSettings(ctx)
	sec, err := s.assistant.Store.Secrets()
	if err != nil {
		return nil, err
	}
	providers := map[string]any{}
	for _, n := range assistant.ProviderNames {
		p := set.Providers[n]
		v := map[string]any{"enabled": p.Enabled, "model": p.Model, "key_set": sec.Has(assistant.OperatorKey(n)), "label": assistant.ProviderLabel(n)}
		if n == assistant.Compatible {
			v["base_url"] = p.BaseURL
		}
		providers[n] = v
	}
	return map[string]any{
		"enabled": set.Enabled, "active": set.Active(), "providers": providers, "default_provider": set.DefaultProvider,
		"allow_member_keys": set.AllowMemberKeys, "monthly_token_cap_per_user": set.MonthlyTokenCap,
		"allow_private_endpoint": set.AllowPrivateEndpoint,
		"anthropic_models":       assistant.AnthropicModels,
		"default_model":          assistant.DefaultAnthropicModel,
	}, nil
}

// memberView is the status every account may read: no keys, no base URL.
func (s *Server) memberView(ctx context.Context) map[string]any {
	set := s.assistantSettings(ctx)
	p := set.Providers[set.DefaultProvider]
	return map[string]any{"enabled": set.Active(), "provider": set.DefaultProvider, "provider_label": assistant.ProviderLabel(set.DefaultProvider),
		"model": p.Model, "allow_member_keys": set.AllowMemberKeys, "monthly_token_cap_per_user": set.MonthlyTokenCap}
}

func (s *Server) handleGetAssistantSettings(w http.ResponseWriter, r *http.Request) {
	if u := userFrom(r.Context()); u.Role != "owner" {
		writeJSON(w, http.StatusOK, s.memberView(r.Context()))
		return
	}
	v, err := s.ownerView(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (s *Server) handlePutAssistantSettings(w http.ResponseWriter, r *http.Request) {
	if !requireOwner(w, r, "the assistant settings") {
		return
	}
	cur := s.assistantSettings(r.Context())
	var in struct {
		assistant.Settings
		Keys map[string]*string `json:"keys"`
	}
	in.Settings = cur
	// Provider objects are replaced as a whole, so start from a fresh map.
	in.Settings.Providers = map[string]assistant.ProviderSettings{}
	for k, v := range cur.Providers {
		in.Settings.Providers[k] = v
	}
	body := http.MaxBytesReader(w, r.Body, 64<<10)
	dec := json.NewDecoder(body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_input", "invalid JSON body: "+strings.TrimPrefix(err.Error(), "json: "))
		return
	}
	actor := userFrom(r.Context()).ID
	_, err := s.assistant.Store.SaveSettings(r.Context(), actor, in.Settings, in.Keys, s.assistant.Net.CheckBaseURL, s.audit)
	var inv *assistant.InvalidError
	switch {
	case errors.As(err, &inv):
		writeError(w, http.StatusBadRequest, "invalid_input", inv.Error())
		return
	case errors.Is(err, assistant.ErrPrivateTarget):
		writeError(w, http.StatusBadRequest, "private_target", "the base URL resolves to a private, loopback or link-local address; turn on \"Allow private endpoints\" to use a model server on your own network")
		return
	case err != nil:
		s.internal(w, err)
		return
	}
	v, err := s.ownerView(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (s *Server) handleTestAssistant(w http.ResponseWriter, r *http.Request) {
	if !requireOwner(w, r, "the assistant settings") {
		return
	}
	var in struct {
		Provider string `json:"provider"`
	}
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	}
	res := s.assistant.TestConnection(r.Context(), in.Provider, s.assistantSettings(r.Context()))
	if res.Code == "invalid_input" {
		writeError(w, http.StatusBadRequest, "invalid_input", "provider: "+res.Message)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

// ---- the user's consent, own key and usage ----

// consentFields lists what the disclosure says may be sent.
var consentFields = []string{"task titles and descriptions", "project, section and label names", "due dates, priorities and completion",
	"comments", "names of members of shared projects", "your display name, today's date and your time zone", "the messages you type"}

// requireSession refuses API tokens: only a signed-in person uses the
// assistant or decides about consent (design D5).
func requireSession(w http.ResponseWriter, r *http.Request) bool {
	if sessionFrom(r.Context()) == nil {
		writeError(w, http.StatusForbidden, "session_required", "the assistant is used from the app while signed in; API tokens cannot use it")
		return false
	}
	return true
}

func (s *Server) myAssistant(ctx context.Context, u *auth.User) (map[string]any, error) {
	set := s.assistantSettings(ctx)
	encrypted, err := s.keys().Enabled(ctx, u.ID)
	if err != nil {
		return nil, err
	}
	consent, err := s.assistant.Store.Consent(ctx, u.ID)
	if err != nil {
		return nil, err
	}
	sec, err := s.assistant.Store.Secrets()
	if err != nil {
		return nil, err
	}
	reason := ""
	switch {
	case !set.Enabled:
		reason = "disabled"
	case !set.Active():
		reason = "no_provider"
	case encrypted:
		reason = "encryption_enabled"
	}
	p := set.Providers[set.DefaultProvider]
	out := map[string]any{
		"available": reason == "", "enabled": set.Active(), "reason": reason,
		"provider": set.DefaultProvider, "provider_label": assistant.ProviderLabel(set.DefaultProvider), "model": p.Model,
		"consented": consent.Valid(set.DefaultProvider), "disclosure_version": assistant.DisclosureVersion, "fields": consentFields,
		"allow_member_keys": set.AllowMemberKeys, "own_key_set": sec.Has(assistant.UserKey(u.ID, set.DefaultProvider)),
		"operator_key_set": sec.Has(assistant.OperatorKey(set.DefaultProvider)) || set.DefaultProvider == assistant.Compatible,
	}
	if consent != nil {
		out["consent"] = consent
	}
	return out, nil
}

func (s *Server) handleGetMyAssistant(w http.ResponseWriter, r *http.Request) {
	v, err := s.myAssistant(r.Context(), userFrom(r.Context()))
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (s *Server) handlePutMyAssistant(w http.ResponseWriter, r *http.Request) {
	if !s.requireSessionOrFull(w, r) {
		return
	}
	u := userFrom(r.Context())
	var in struct {
		Consent  *bool   `json:"consent"`
		Provider string  `json:"provider"`
		OwnKey   *string `json:"own_key"`
	}
	body := http.MaxBytesReader(w, r.Body, 16<<10)
	dec := json.NewDecoder(body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_input", "invalid JSON body: "+strings.TrimPrefix(err.Error(), "json: "))
		return
	}
	set := s.assistantSettings(r.Context())
	if in.Consent == nil && in.OwnKey == nil {
		writeError(w, http.StatusBadRequest, "invalid_input", "consent: true or false, or own_key, is required")
		return
	}
	if in.OwnKey != nil {
		if !set.AllowMemberKeys {
			writeError(w, http.StatusForbidden, "forbidden", "the server owner has not allowed members to bring their own key")
			return
		}
		if len(*in.OwnKey) > 1024 {
			writeError(w, http.StatusBadRequest, "invalid_input", "own_key: at most 1024 characters")
			return
		}
	}
	if in.Consent != nil && *in.Consent {
		if !set.Active() {
			writeError(w, http.StatusConflict, "assistant_disabled", "the assistant is not enabled on this server")
			return
		}
		if enc, err := s.keys().Enabled(r.Context(), u.ID); err != nil {
			s.internal(w, err)
			return
		} else if enc {
			writeError(w, http.StatusConflict, "encryption_enabled", "the assistant cannot read end-to-end encrypted tasks")
			return
		}
		// The disclosure the person accepted must name the provider in effect.
		if in.Provider != set.DefaultProvider {
			writeError(w, http.StatusConflict, "provider_changed", "the provider changed; read the updated disclosure and accept again")
			return
		}
	}
	if in.OwnKey != nil {
		if err := s.assistant.Store.SetUserKey(r.Context(), u.ID, set.DefaultProvider, *in.OwnKey, s.audit); err != nil {
			s.internal(w, err)
			return
		}
	}
	if in.Consent != nil {
		if err := s.assistant.Store.SetConsent(r.Context(), u.ID, set.DefaultProvider, *in.Consent); err != nil {
			s.internal(w, err)
			return
		}
	}
	s.handleGetMyAssistant(w, r)
}

func (s *Server) handleMyAssistantUsage(w http.ResponseWriter, r *http.Request) {
	set := s.assistantSettings(r.Context())
	u, err := s.assistant.Store.Usage(r.Context(), userFrom(r.Context()).ID, set.MonthlyTokenCap)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, usageView(u))
}

func usageView(u assistant.Usage) map[string]any {
	return map[string]any{"month": u.Month, "input_tokens": u.InputTokens, "output_tokens": u.OutputTokens, "total_tokens": u.Total(),
		"turns": u.Turns, "cap": u.Cap, "resets_at": u.ResetsAt}
}

// ---- the turn ----

type turnRequest struct {
	Messages []assistant.Message `json:"messages"`
	Timezone string              `json:"timezone"`
	View     string              `json:"view"`
	Selected []string            `json:"selected"`
}

func (s *Server) handleAssistantTurn(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	set := s.assistantSettings(ctx)
	if !set.Active() {
		writeError(w, http.StatusNotFound, "not_found", "the assistant is not enabled on this server")
		return
	}
	if !requireSession(w, r) {
		return
	}
	u := userFrom(ctx)
	if enc, err := s.keys().Enabled(ctx, u.ID); err != nil {
		s.internal(w, err)
		return
	} else if enc {
		writeError(w, http.StatusConflict, "encryption_enabled", "the assistant cannot read end-to-end encrypted tasks; your tasks never leave your devices unencrypted")
		return
	}
	consent, err := s.assistant.Store.Consent(ctx, u.ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	if !consent.Valid(set.DefaultProvider) {
		writeError(w, http.StatusForbidden, "consent_required", "read which data is sent to "+assistant.ProviderLabel(set.DefaultProvider)+" and accept before the first message")
		return
	}
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, turnMaxBody))
	if err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			writeError(w, http.StatusRequestEntityTooLarge, "too_large", "a turn is at most 256 KB; start a new conversation or clear older messages")
			return
		}
		writeError(w, http.StatusBadRequest, "bad_request", "could not read the request body")
		return
	}
	var in turnRequest
	if err := json.Unmarshal(raw, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_input", "invalid JSON body")
		return
	}
	if len(in.Messages) > turnMaxMessages {
		writeError(w, http.StatusRequestEntityTooLarge, "too_large", fmt.Sprintf("a turn carries at most %d messages", turnMaxMessages))
		return
	}
	if msg := validateTurn(in); msg != "" {
		writeError(w, http.StatusBadRequest, "invalid_input", msg)
		return
	}
	zone, err := agenttools.ParseZone(in.Timezone, "timezone")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_input", "timezone: must be an IANA time zone such as Europe/Rome")
		return
	}
	usage, err := s.assistant.Store.Usage(ctx, u.ID, set.MonthlyTokenCap)
	if err != nil {
		s.internal(w, err)
		return
	}
	if set.MonthlyTokenCap > 0 && usage.Total() >= set.MonthlyTokenCap {
		writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": map[string]any{"code": "assistant_quota",
			"message":   fmt.Sprintf("you have used this month's assistant allowance of %d tokens; it resets on %s", set.MonthlyTokenCap, usage.ResetsAt),
			"resets_at": usage.ResetsAt}})
		return
	}
	release, err := s.assistant.Acquire(u.ID)
	switch {
	case errors.Is(err, assistant.ErrTurnInProgress):
		writeError(w, http.StatusConflict, "turn_in_progress", "another answer is still being written; wait for it or stop it first")
		return
	case errors.Is(err, assistant.ErrBusy):
		w.Header().Set("Retry-After", "5")
		writeError(w, http.StatusServiceUnavailable, "assistant_busy", "the assistant is busy on this server; try again in a few seconds")
		return
	}
	defer release()
	prov, err := s.assistant.ProviderFor(u.ID, set)
	if errors.Is(err, assistant.ErrNoKey) {
		writeError(w, http.StatusConflict, "no_key", "no API key is configured for "+assistant.ProviderLabel(set.DefaultProvider)+"; ask the server owner")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}

	// Stream server-sent events from here on.
	rc := http.NewResponseController(w)
	_ = rc.SetWriteDeadline(time.Now().Add(turnTimeout + 30*time.Second))
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-store")
	h.Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	send := func(event string, data any) {
		b, _ := json.Marshal(data)
		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, b)
		_ = rc.Flush()
	}
	tctx, cancel := context.WithTimeout(ctx, turnTimeout)
	defer cancel()
	start := time.Now()
	res := s.assistant.Loop.Run(tctx, prov, assistant.TurnInput{
		UserID: u.ID, UserName: u.Name, Zone: zone, Messages: in.Messages, View: in.View, Selected: in.Selected,
	}, assistant.Events{
		Text:   func(t string) { send("text", map[string]string{"text": t}) },
		Status: func(t string) { send("status", map[string]string{"text": t}) },
	})
	// Usage is counted from the provider's usage fields, whatever the outcome
	// (a refusal still costs tokens), in a context that outlives a disconnect.
	if res.Input+res.Output > 0 {
		if err := s.assistant.Store.AddUsage(context.WithoutCancel(ctx), u.ID, res.Input, res.Output); err != nil {
			s.log.Error("assistant usage not recorded", "err", err)
		}
	}
	// Logs hold the provider, outcome, duration and token counts only (design D8).
	s.log.Info("assistant turn", "provider", set.DefaultProvider, "stop", string(res.Stop), "duration_ms", time.Since(start).Milliseconds(),
		"input_tokens", res.Input, "output_tokens", res.Output, "proposed", len(res.Changes), "failed", res.Err != nil)
	if ctx.Err() != nil {
		return // the browser went away (stopped or closed)
	}
	total := usage.Total() + res.Input + res.Output
	send("usage", map[string]any{"input": res.Input, "output": res.Output, "month_total": total, "cap": set.MonthlyTokenCap})
	if res.Err != nil {
		code, msg := "provider_error", "the provider could not answer"
		if pe, ok := assistant.AsProviderError(res.Err); ok {
			code, msg = pe.Code, pe.Msg
		} else if errors.Is(res.Err, context.DeadlineExceeded) {
			code, msg = "timeout", "the answer took too long and was stopped"
		} else {
			s.log.Error("assistant turn failed", "err", res.Err)
		}
		send("error", map[string]string{"code": code, "message": msg})
		return
	}
	if len(res.Changes) > 0 {
		send("changeset", map[string]any{"items": res.Changes, "limit": assistant.MaxEntities})
	}
	done := map[string]any{"stop_reason": string(res.Stop), "server_time": time.Now().UTC().Format(time.RFC3339)}
	if res.Message != "" {
		done["message"] = res.Message
	}
	send("done", done)
}

func validateTurn(in turnRequest) string {
	if len(in.Messages) == 0 {
		return "messages: at least one message is required"
	}
	for i, m := range in.Messages {
		if m.Role != "user" && m.Role != "assistant" {
			return fmt.Sprintf("messages[%d].role: must be user or assistant", i)
		}
	}
	last := in.Messages[len(in.Messages)-1]
	if last.Role != "user" || strings.TrimSpace(last.Text) == "" {
		return "messages: the last message must be the user's question"
	}
	if len(in.Selected) > 200 {
		return "selected: at most 200 ids"
	}
	if len(in.View) > 40 {
		return "view: unknown view"
	}
	return ""
}
