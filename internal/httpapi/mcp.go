package httpapi

import (
	"errors"
	"io"
	"mime"
	"net/http"
	"strings"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/mcp"
)

// MCP endpoint (OpenSpec change `mcp-server`): streamable HTTP in stateless
// mode, JSON-RPC handled by internal/mcp. Off by default; while disabled the
// path answers 404 before credentials are looked at (design D5).

// mcpMaxBody caps an MCP request body (spec "Limits and no outbound calls").
const mcpMaxBody = 1 << 20

// WithMCPSettings shares the owner's MCP toggle with the caller (main seeds the
// OPENTODO_MCP preset through it). Without it New builds its own.
func WithMCPSettings(m *mcp.Settings) Option { return func(s *Server) { s.mcpSettings = m } }

func (s *Server) registerMCPRoutes(mux *http.ServeMux) {
	if s.mcpSettings == nil {
		s.mcpSettings = mcp.NewSettings(s.sync.DB())
	}
	s.mcp = mcp.New(s.sync, mcp.Options{Version: s.version, Log: s.log})
	// Every method reaches the handler so a disabled endpoint is 404 for all of
	// them and an enabled one can answer 405 for anything but POST.
	mux.HandleFunc("/mcp", s.handleMCP)
	// Status for every signed-in user (the AI assistants section shows it to
	// members too); changing it is owner only.
	mux.Handle("GET /api/v1/settings/mcp", s.requireAuth(s.handleGetMCPSettings))
	mux.Handle("PUT /api/v1/settings/mcp", s.requireAuth(s.handlePutMCPSettings))
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
	if s.limiter.blocked(ip) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many attempts, try again later")
		return
	}
	// Bearer API tokens only: the session cookie is never consulted, so there is
	// no browser-originated access and nothing to forge (design D2).
	var u *auth.User
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		var err error
		u, _, err = s.auth.UserByTokenScope(r.Context(), strings.TrimSpace(strings.TrimPrefix(h, "Bearer ")))
		if err != nil && !errors.Is(err, auth.ErrNotFound) {
			s.internal(w, err)
			return
		}
	}
	if u == nil {
		s.limiter.hit(ip)
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
	out, malformed := s.mcp.Handle(r.Context(), u.ID, body)
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

func (s *Server) mcpStatus(r *http.Request) map[string]any {
	return map[string]any{"enabled": s.mcpSettings.Enabled(r.Context()), "endpoint": s.publicOrigin(r) + "/mcp"}
}

func (s *Server) handleGetMCPSettings(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.mcpStatus(r))
}

func (s *Server) handlePutMCPSettings(w http.ResponseWriter, r *http.Request) {
	if !requireOwner(w, r, "the AI assistants (MCP) setting") {
		return
	}
	var in struct {
		Enabled *bool `json:"enabled"`
	}
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if in.Enabled == nil {
		writeError(w, http.StatusBadRequest, "invalid_input", "enabled: must be true or false")
		return
	}
	if err := s.mcpSettings.Set(r.Context(), userFrom(r.Context()).ID, *in.Enabled, s.audit); err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, s.mcpStatus(r))
}
