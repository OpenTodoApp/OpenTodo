package auth

import (
	"context"
	"strings"
	"testing"
)

// TestSecretsStoredOnlyAsHashes (external-security-review, threat model
// "Stolen or unlocked device" and "API token holders"): a session secret and an
// API token secret never reach the database as given; only their hash does, so
// a copy of the database or a backup cannot be replayed as a credential.
func TestSecretsStoredOnlyAsHashes(t *testing.T) {
	ctx := context.Background()
	s, db := newService(t, false)
	owner := mustOwner(t, s)
	session, _, err := s.CreateSession(ctx, owner.ID, "test")
	if err != nil {
		t.Fatal(err)
	}
	_, token, err := s.CreateToken(ctx, owner.ID, "script")
	if err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{session, token} {
		if len(secret) < 32 {
			t.Fatalf("secret %q is too short to test", secret)
		}
		for _, table := range []string{"sessions", "api_tokens"} {
			var hashes []string
			rows, err := db.QueryContext(ctx, "SELECT token_hash FROM "+table)
			if err != nil {
				t.Fatal(err)
			}
			for rows.Next() {
				var h string
				if err := rows.Scan(&h); err != nil {
					t.Fatal(err)
				}
				hashes = append(hashes, h)
			}
			if err := rows.Err(); err != nil {
				t.Fatal(err)
			}
			rows.Close()
			for _, h := range hashes {
				if strings.Contains(h, secret) || h == secret {
					t.Fatalf("%s stores a secret as given", table)
				}
			}
			if table == "sessions" && secret == session && !contains(hashes, hashToken(session)) {
				t.Fatalf("sessions holds no hash of the session secret: %v", hashes)
			}
			if table == "api_tokens" && secret == token && !contains(hashes, hashToken(token)) {
				t.Fatalf("api_tokens holds no hash of the token secret: %v", hashes)
			}
		}
	}
	// The secrets still work: the hash is what is looked up.
	if _, err := s.UserBySession(ctx, session); err != nil {
		t.Fatalf("session lookup: %v", err)
	}
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}
