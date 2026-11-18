package httpapi

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"github.com/OpenTodoApp/opentodo/internal/audit"
	"github.com/OpenTodoApp/opentodo/internal/mcpoauth"
)

// Connected apps (OpenSpec change connected-apps-list): people see the AI
// apps they connected over OAuth (Gemini, ChatGPT, Claude) in Settings, next
// to the signed-in OpenTodo apps, and disconnect one. Disconnecting ends the
// grant, so its refresh token is refused, and deletes its current access
// token. Deleting that access token under API tokens does the same. Neither
// depends on the owner's MCP switch, so an app stays visible and removable
// while MCP is off.

const connectedAppsPath = "/api/v1/me/oauth-grants"

func (s *Server) registerConnectedAppsRoutes(mux *routes) {
	mux.handle("GET "+connectedAppsPath, signedIn, s.handleListConnectedApps)
	mux.handle("DELETE "+connectedAppsPath+"/{id}", signedIn.DemoDenied(), s.handleDisconnectApp)
}

// connectedApp is one row of GET /api/v1/me/oauth-grants: what Settings
// shows, never a token, a token's id or a hash.
type connectedApp struct {
	ID         string   `json:"id"`
	ClientID   string   `json:"clientId"`
	ClientName string   `json:"clientName"`
	Scope      string   `json:"scope"`
	Workspaces []string `json:"workspaces"`
	CreatedAt  int64    `json:"createdAt"`
	LastUsedAt *int64   `json:"lastUsedAt"`
}

// handleListConnectedApps lists the caller's live grants.
func (s *Server) handleListConnectedApps(w http.ResponseWriter, r *http.Request) {
	grants, err := s.mcpOAuth.ConnectedGrants(r.Context(), userFrom(r.Context()).ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	out := make([]connectedApp, 0, len(grants))
	for _, g := range grants {
		a := connectedApp{ID: g.ID, ClientID: g.ClientID, ClientName: g.ClientName, Scope: g.Scope,
			Workspaces: g.Workspaces, CreatedAt: g.CreatedAt}
		if a.Workspaces == nil {
			a.Workspaces = []string{}
		}
		if g.LastUsedAt > 0 {
			used := g.LastUsedAt
			a.LastUsedAt = &used
		}
		out = append(out, a)
	}
	writeJSON(w, http.StatusOK, map[string]any{"grants": out})
}

// handleDisconnectApp ends one of the caller's grants. Another person's grant,
// a revoked one and an unknown id are all 404.
func (s *Server) handleDisconnectApp(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	g, err := s.mcpOAuth.GrantByID(r.Context(), r.PathValue("id"))
	if errors.Is(err, mcpoauth.ErrNotFound) || (err == nil && (g.UserID != u.ID || g.Revoked())) {
		writeError(w, http.StatusNotFound, "not_found", "no such connected app")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	if err := s.disconnectGrant(r.Context(), g, audit.DisconnectedInSettings); err != nil {
		s.internal(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// disconnectGrant revokes g, deletes the access token it holds and records
// mcp_oauth.disconnected with how the person did it.
func (s *Server) disconnectGrant(ctx context.Context, g mcpoauth.Grant, method string) error {
	tokenID, err := s.mcpOAuth.RevokeGrant(ctx, g.ID)
	if err != nil {
		return err
	}
	if tokenID != "" {
		_ = s.auth.DeleteToken(ctx, g.UserID, tokenID)
	}
	s.audit.Record(ctx, audit.MCPOAuthDisconnected(g.UserID, g.ClientID, method))
	return nil
}

// endGrantOfToken ends the grant whose access token the person just deleted
// under API tokens, so the app cannot mint another with its refresh token.
// g is the grant read before the deletion; ErrNotFound means the token was an
// ordinary API token.
func (s *Server) endGrantOfToken(ctx context.Context, userID string, g mcpoauth.Grant, lookup error) {
	if lookup != nil || g.UserID != userID || g.Revoked() {
		if lookup != nil && !errors.Is(lookup, mcpoauth.ErrNotFound) {
			slog.Error("api tokens: reading the grant of a deleted token", "err", lookup)
		}
		return
	}
	if err := s.disconnectGrant(ctx, g, audit.DisconnectedByToken); err != nil {
		slog.Error("api tokens: ending the grant of a deleted token", "grant", g.ID, "err", err)
	}
}
