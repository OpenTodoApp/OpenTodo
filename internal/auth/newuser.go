package auth

import (
	"context"

	"github.com/pixari/opentodo/internal/store"
)

// insertUser writes a new account's users row and its default workspace
// (OpenSpec change workspaces, design D4) through q, which every account
// creation path passes as its transaction. The UNIQUE error of a taken email
// is returned unchanged for the caller to map to ErrEmailTaken.
func insertUser(ctx context.Context, q store.Execer, u *User, hash string) error {
	if _, err := q.ExecContext(ctx, "INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)",
		u.ID, u.Email, u.Name, hash, u.Role, u.CreatedAt); err != nil {
		return err
	}
	return store.EnsureDefaultWorkspace(ctx, q, u.ID, u.CreatedAt)
}
