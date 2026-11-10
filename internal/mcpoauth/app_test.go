package mcpoauth

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/OpenTodoApp/opentodo/internal/store/storetest"
)

// appStore is a store over a migrated database holding one person, u1, and a
// clock the test moves.
func appStore(t *testing.T) (*Store, *time.Time) {
	t.Helper()
	db, err := storetest.OpenDir(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if _, err := db.Exec(`INSERT INTO users(id,email,password_hash,created_at) VALUES('u1','a@example.com','x',0)`); err != nil {
		t.Fatal(err)
	}
	now := time.UnixMilli(1_800_000_000_000)
	s := New(db)
	s.SetClock(func() time.Time { return now })
	return s, &now
}

func s256(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

const appVerifier = "app-verifier-0123456789-abcdefghijklmnopqrstuvwxyz"

// The built-in client is seeded by the migration, left out of the owner's
// list, cannot be deleted, and has no secret the MCP token endpoint would take.
func TestAppClientIsBuiltIn(t *testing.T) {
	s, _ := appStore(t)
	ctx := context.Background()
	c, err := s.Client(ctx, AppClientID)
	if err != nil || !c.BuiltIn() || c.SecretSet || len(c.RedirectURIs) != 0 {
		t.Fatalf("seeded client: %+v %v", c, err)
	}
	list, err := s.ListClients(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range list {
		if c.ID == AppClientID {
			t.Fatal("the app's client is listed with the MCP clients")
		}
	}
	if _, err := s.DeleteClient(ctx, AppClientID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("delete built-in: %v", err)
	}
	if _, err := s.Authenticate(ctx, AppClientID, ""); !errors.Is(err, ErrBadSecret) {
		t.Fatalf("authenticate built-in: %v", err)
	}
}

// A code is used once, expires after CodeTTL and is bound to the challenge and
// the state; a failed attempt uses it up too.
func TestAppCode(t *testing.T) {
	s, now := appStore(t)
	ctx := context.Background()
	newCode := func() string {
		code, err := s.CreateAppCode(ctx, "u1", s256(appVerifier), "state-1", " iPhone\n")
		if err != nil {
			t.Fatal(err)
		}
		return code
	}
	code := newCode()
	c, err := s.ConsumeAppCode(ctx, code, appVerifier, "state-1")
	if err != nil || c.UserID != "u1" || c.Device != "iPhone" {
		t.Fatalf("consume: %+v %v", c, err)
	}
	if _, err := s.ConsumeAppCode(ctx, code, appVerifier, "state-1"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("second use: %v", err)
	}
	for name, try := range map[string][2]string{
		"no verifier":    {"", "state-1"},
		"wrong verifier": {strings.Repeat("x", 43), "state-1"},
		"wrong state":    {appVerifier, "state-2"},
	} {
		code := newCode()
		if _, err := s.ConsumeAppCode(ctx, code, try[0], try[1]); !errors.Is(err, ErrMismatch) {
			t.Fatalf("%s: %v", name, err)
		}
		if _, err := s.ConsumeAppCode(ctx, code, appVerifier, "state-1"); !errors.Is(err, ErrNotFound) {
			t.Fatalf("%s: the code survived a failed attempt: %v", name, err)
		}
	}
	code = newCode()
	*now = now.Add(CodeTTL + time.Second)
	if _, err := s.ConsumeAppCode(ctx, code, appVerifier, "state-1"); !errors.Is(err, ErrExpired) {
		t.Fatalf("expired: %v", err)
	}
}

// Every refresh rotates the token; the old one coming back finds the grant it
// belonged to, which is what reuse detection revokes.
func TestAppGrantRotation(t *testing.T) {
	s, now := appStore(t)
	ctx := context.Background()
	g, first, err := s.CreateAppGrant(ctx, "u1", strings.Repeat("é", 80))
	if err != nil {
		t.Fatal(err)
	}
	if !utf8.ValidString(g.Device) || len(g.Device) > MaxDevice {
		t.Fatalf("device = %q", g.Device)
	}
	second, err := s.RotateAppRefresh(ctx, g.ID, first)
	if err != nil || second == first {
		t.Fatalf("rotate: %q %v", second, err)
	}
	if _, err := s.RotateAppRefresh(ctx, g.ID, first); !errors.Is(err, ErrReused) {
		t.Fatalf("rotate a used token: %v", err)
	}
	if _, err := s.AppGrantByRefresh(ctx, first); !errors.Is(err, ErrNotFound) {
		t.Fatalf("the used token still resolves: %v", err)
	}
	used, err := s.AppGrantByUsedRefresh(ctx, first)
	if err != nil || used.ID != g.ID {
		t.Fatalf("used token: %+v %v", used, err)
	}
	if cur, err := s.AppGrantByRefresh(ctx, second); err != nil || cur.ID != g.ID {
		t.Fatalf("current token: %+v %v", cur, err)
	}
	// A deactivated account gets no new grant.
	if _, err := s.db.Exec(`INSERT INTO users(id,email,password_hash,created_at) VALUES('u2','b@example.com','x',0)`); err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec(`INSERT INTO user_status(user_id,deactivated_at) VALUES('u2',1)`); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.CreateAppGrant(ctx, "u2", "iPhone"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("grant for a deactivated account: %v", err)
	}
	// A second device is a second grant.
	if _, _, err := s.CreateAppGrant(ctx, "u1", "iPad"); err != nil {
		t.Fatal(err)
	}
	list, err := s.AppGrants(ctx, "u1")
	if err != nil || len(list) != 2 {
		t.Fatalf("grants: %+v %v", list, err)
	}
	// Revoking deletes the grant: neither token resolves any more.
	if _, err := s.RevokeAppGrant(ctx, "someone-else", g.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("revoke another person's grant: %v", err)
	}
	if _, err := s.RevokeAppGrant(ctx, "u1", g.ID); err != nil {
		t.Fatal(err)
	}
	for _, tok := range []string{first, second} {
		if _, err := s.AppGrantByRefresh(ctx, tok); !errors.Is(err, ErrNotFound) {
			t.Fatalf("a revoked grant's token resolves: %v", err)
		}
		if _, err := s.AppGrantByUsedRefresh(ctx, tok); !errors.Is(err, ErrNotFound) {
			t.Fatalf("a revoked grant's used token resolves: %v", err)
		}
	}
	if _, err := s.RotateAppRefresh(ctx, g.ID, second); !errors.Is(err, ErrNotFound) {
		t.Fatalf("rotate on a revoked grant: %v", err)
	}
	// An expired grant is no longer live and leaves the list.
	*now = now.Add(RefreshTTL + time.Hour)
	list, _ = s.AppGrants(ctx, "u1")
	if len(list) != 0 {
		t.Fatalf("expired grants listed: %+v", list)
	}
}

func TestAppRequestShapes(t *testing.T) {
	if !ValidChallenge(s256(appVerifier)) || ValidChallenge("short") || ValidChallenge(strings.Repeat("=", 43)) {
		t.Fatal("challenge shape")
	}
	if got := CleanDevice("  Ana’s\tiPhone\x7f "); got != "Ana’siPhone" {
		t.Fatalf("CleanDevice = %q", got)
	}
}
