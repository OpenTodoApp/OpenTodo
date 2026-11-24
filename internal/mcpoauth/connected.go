package mcpoauth

import (
	"context"
)

// Connected apps (OpenSpec change connected-apps-list): the grants a person
// gave AI apps, listed in Settings next to the signed-in OpenTodo apps so they
// can see and disconnect them.

// ConnectedGrant is one of a person's live grants with what Settings shows.
type ConnectedGrant struct {
	Grant
	// ClientName is the name the client registered with.
	ClientName string
	// LastUsedAt is the later of the last exchange and the access token's last
	// request; 0 when neither happened.
	LastUsedAt int64
}

// ConnectedGrants lists userID's grants that are neither revoked nor expired,
// most recently used first. The last exchange is when the current access token
// was minted: its expiry less AccessTTL.
func (s *Store) ConnectedGrants(ctx context.Context, userID string) ([]ConnectedGrant, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT g.id,g.client_id,g.user_id,g.scope,g.token_id,g.access_expires_at,g.refresh_expires_at,g.revoked_at,g.created_at,c.name,
		MAX(CASE WHEN g.access_expires_at > 0 THEN g.access_expires_at - ? ELSE 0 END, COALESCE(t.last_used_at, 0)) AS used
		FROM mcp_oauth_grant g JOIN mcp_oauth_client c ON c.id = g.client_id LEFT JOIN api_tokens t ON t.id = g.token_id
		WHERE g.user_id = ? AND g.revoked_at = 0 AND g.refresh_expires_at >= ?
		ORDER BY used DESC, g.created_at DESC, g.id`, AccessTTL.Milliseconds(), userID, s.now().UnixMilli())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ConnectedGrant{}
	for rows.Next() {
		var c ConnectedGrant
		g := &c.Grant
		if err := rows.Scan(&g.ID, &g.ClientID, &g.UserID, &g.Scope, &g.TokenID, &g.AccessExpiresAt, &g.RefreshExpiresAt, &g.RevokedAt, &g.CreatedAt, &c.ClientName, &c.LastUsedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()
	for i := range out {
		g, err := s.withWorkspaces(ctx, out[i].Grant)
		if err != nil {
			return nil, err
		}
		out[i].Grant = g
	}
	return out, nil
}
