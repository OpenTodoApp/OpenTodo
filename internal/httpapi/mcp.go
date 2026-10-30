package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/agenttools"
	"github.com/OpenTodoApp/opentodo/internal/auth"
	"github.com/OpenTodoApp/opentodo/internal/mcp"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// MCP endpoint (OpenSpec changes `mcp-server` and `mcp-write-tools`):
// streamable HTTP in stateless mode, JSON-RPC handled by internal/mcp over the
// agent tool registry (internal/agenttools). Off by default; while disabled the
// path answers 404 before credentials are looked at (design D5). Write tools
// need the owner's switch, the user's switch and an `agent` token, all read on
// every request (mcp-write-tools D3).

// mcpMaxBody caps an MCP request body (spec "Limits and no outbound calls").
const mcpMaxBody = 1 << 20

func (s *Server) registerMCPRoutes(mux *routes) {
	s.agentAccess = agenttools.NewAccess(s.sync.DB())
	s.agentExclusions = agenttools.NewExclusions(s.sync.DB())
	s.agentTools = agenttools.New(s.sync, agenttools.Options{
		Audit: s.audit, Log: s.log, Exclusions: s.agentExclusions,
		LocalToday: func() string { return localToday(s.now()) },
		// Relative reminders follow a new due date (deadline reminders a new
		// deadline), as for a REST write, and a task that gets a due date gets
		// the person's default reminder (default-reminders D6).
		ExtraOps: func(ctx context.Context, uid string, c agenttools.Change, ts int64, device string) ([]opsync.Op, error) {
			if c.Entity != "task" {
				return nil, nil
			}
			return s.agentReminderOps(ctx, uid, c.EntityID, c.Create, c.Patch, ts, device)
		},
	})
	s.mcp = mcp.New(s.sync, mcp.Options{Version: s.version, Log: s.log, Tools: s.agentTools, IssuesResource: s.issuesResource})
	// Every method reaches the handler so a disabled endpoint is 404 for all of
	// them and an enabled one can answer 405 for anything but POST.
	mux.handle("/mcp", public("assistants authenticate with a bearer token in the handler").DemoDenied(), s.handleMCP)
	// Status for every signed-in user (the AI assistants section shows it to
	// members too); changing it is owner only.
	mux.handle("GET /api/v1/settings/mcp", signedIn, s.handleGetMCPSettings)
	mux.handle("PUT /api/v1/settings/mcp", ownerOnly("manage the AI assistants (MCP) setting").Credential().DemoDenied(), s.handlePutMCPSettings)
	// The user's own "Allow AI assistants to make changes" switch: sessions and
	// full tokens only, so an assistant can never flip it (mcp-write-tools D3).
	mux.handle("GET /api/v1/me/agent-access", signedIn.FullTokens(), s.handleGetAgentAccess)
	mux.handle("PUT /api/v1/me/agent-access", signedIn.FullTokens().DemoDenied(), s.handlePutAgentAccess)
	s.registerAgentExclusionRoutes(mux)
}

func (s *Server) handleMCP(w http.ResponseWriter, r *http.Request) {
	if !s.mcpSettings.Enabled(r.Context()) {
		writeError(w, http.StatusNotFound, "not_found", "not found")
		return
	}
	if r.Method != http.MethodPost {
		// No server-initiated SSE stream (GET) and no sessions to end (DELETE).
		w.Header().Set("Allow", http.MethodPost)
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "the MCP endpoint accepts POST only")
		return
	}
	// DNS-rebinding defence required by the MCP transport: a browser-originated
	// request must come from this server's own origin.
	if r.Header.Get("Origin") != "" && !s.originAllowed(r) {
		writeError(w, http.StatusForbidden, "bad_origin", "cross-site request rejected")
		return
	}
	ip := clientIP(r)
	if s.mcpLimiter.blocked(ip) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many attempts, try again later")
		return
	}
	// Bearer API tokens only: the session cookie is never consulted, so there is
	// no browser-originated access and nothing to forge (design D2).
	var u *auth.User
	var tok auth.TokenInfo
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		var err error
		u, tok, err = s.auth.UserByTokenInfo(r.Context(), strings.TrimSpace(strings.TrimPrefix(h, "Bearer ")))
		if err != nil && !errors.Is(err, auth.ErrNotFound) {
			s.internal(w, err)
			return
		}
	}
	if u == nil {
		s.mcpLimiter.hit(ip)
		w.Header().Set("WWW-Authenticate", `Bearer realm="OpenTodo MCP"`)
		writeError(w, http.StatusUnauthorized, "unauthorized", "an API token is required: Authorization: Bearer <token>")
		return
	}
	if !acceptsJSON(r.Header.Get("Accept")) {
		writeError(w, http.StatusNotAcceptable, "not_acceptable", "responses are application/json; this server opens no event streams")
		return
	}
	if v := r.Header.Get("MCP-Protocol-Version"); v != "" && !mcp.SupportedVersion(v) {
		writeError(w, http.StatusBadRequest, "unsupported_protocol_version", "unsupported MCP-Protocol-Version "+v)
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, mcpMaxBody))
	if err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			writeError(w, http.StatusRequestEntityTooLarge, "too_large", "request body exceeds 1 MB")
			return
		}
		writeError(w, http.StatusBadRequest, "bad_request", "could not read the request body")
		return
	}
	caller, err := s.agentCaller(r.Context(), u, tok)
	if err != nil {
		s.internal(w, err)
		return
	}
	out, malformed := s.mcp.HandleVersion(r.Context(), caller, r.Header.Get("MCP-Protocol-Version"), body)
	if out == nil {
		w.WriteHeader(http.StatusAccepted)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	if malformed {
		w.WriteHeader(http.StatusBadRequest)
	}
	_, _ = w.Write(out)
}

// acceptsJSON reports whether an Accept header admits an application/json
// answer. An absent header does; one that lists only text/event-stream does not.
func acceptsJSON(h string) bool {
	if strings.TrimSpace(h) == "" {
		return true
	}
	for _, part := range strings.Split(h, ",") {
		mt, _, err := mime.ParseMediaType(strings.TrimSpace(part))
		if err != nil {
			continue
		}
		switch mt {
		case "application/json", "application/*", "*/*":
			return true
		}
	}
	return false
}

// agentCaller reads the switches for this request: they are server state,
// consulted on every call so turning one off takes effect at once.
func (s *Server) agentCaller(ctx context.Context, u *auth.User, tok auth.TokenInfo) (agenttools.Caller, error) {
	c := agenttools.Caller{UserID: u.ID, TokenID: tok.ID, TokenName: tok.Name, Scope: tok.Scope,
		OwnerAllowsWrites: s.mcpSettings.WritesEnabled(ctx)}
	var err error
	if c.UserAllowsWrites, err = s.agentAccess.AllowsWrites(ctx, u.ID); err != nil {
		return c, err
	}
	if c.Encrypted, err = s.keys().Enabled(ctx, u.ID); err != nil {
		return c, err
	}
	return c, s.relayCaller(ctx, &c)
}

func (s *Server) mcpStatus(r *http.Request) map[string]any {
	return map[string]any{"enabled": s.mcpSettings.Enabled(r.Context()), "writes_enabled": s.mcpSettings.WritesEnabled(r.Context()),
		"endpoint": s.publicOrigin(r) + "/mcp"}
}

func (s *Server) handleGetMCPSettings(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.mcpStatus(r))
}

func (s *Server) handlePutMCPSettings(w http.ResponseWriter, r *http.Request) {
	var in map[string]json.RawMessage
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	var enabled, writes *bool
	for k, v := range in {
		var b bool
		if json.Unmarshal(v, &b) != nil {
			writeError(w, http.StatusBadRequest, "invalid_input", k+": must be true or false")
			return
		}
		switch k {
		case "enabled":
			enabled = &b
		case "writes_enabled":
			writes = &b
		default:
			writeError(w, http.StatusBadRequest, "invalid_input", k+": unknown setting (expected enabled or writes_enabled)")
			return
		}
	}
	if enabled == nil && writes == nil {
		writeError(w, http.StatusBadRequest, "invalid_input", "enabled: must be true or false")
		return
	}
	actor := userFrom(r.Context()).ID
	if enabled != nil {
		if err := s.mcpSettings.Set(r.Context(), actor, *enabled, s.audit); err != nil {
			s.internal(w, err)
			return
		}
	}
	if writes != nil {
		if err := s.mcpSettings.SetWrites(r.Context(), actor, *writes, s.audit); err != nil {
			s.internal(w, err)
			return
		}
	}
	writeJSON(w, http.StatusOK, s.mcpStatus(r))
}

// ---- the user's agent access switch ----

func (s *Server) agentAccessStatus(r *http.Request, allow bool) map[string]any {
	return map[string]any{"allow_writes": allow, "owner_allows_writes": s.mcpSettings.WritesEnabled(r.Context()),
		"mcp_enabled": s.mcpSettings.Enabled(r.Context())}
}

func (s *Server) handleGetAgentAccess(w http.ResponseWriter, r *http.Request) {
	allow, err := s.agentAccess.AllowsWrites(r.Context(), userFrom(r.Context()).ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, s.agentAccessStatus(r, allow))
}

func (s *Server) handlePutAgentAccess(w http.ResponseWriter, r *http.Request) {
	var in map[string]json.RawMessage
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	var allow bool
	v, ok := in["allow_writes"]
	if !ok || json.Unmarshal(v, &allow) != nil || len(in) != 1 {
		writeError(w, http.StatusBadRequest, "invalid_input", "allow_writes: must be true or false")
		return
	}
	if err := s.agentAccess.Set(r.Context(), userFrom(r.Context()).ID, allow, s.audit); err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, s.agentAccessStatus(r, allow))
}
