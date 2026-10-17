package auth

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	opsync "github.com/pixari/opentodo/internal/sync"
)

const pw = "correct horse battery"

// invited registers an account through an invitation issued by the owner.
func invited(t *testing.T, s *Service, owner *User, email string) *User {
	t.Helper()
	_, secret, err := s.CreateInvitation(context.Background(), owner, "", 0)
	if err != nil {
		t.Fatal(err)
	}
	u, err := s.Register(context.Background(), email, strings.Split(email, "@")[0], pw, secret)
	if err != nil {
		t.Fatal(err)
	}
	return u
}

func promote(t *testing.T, s *Service, owner *User, u *User) {
	t.Helper()
	if _, err := s.SetRole(context.Background(), owner.ID, u.ID, RoleAdmin); err != nil {
		t.Fatal(err)
	}
	u.Role = RoleAdmin
}

func session(t *testing.T, s *Service, u *User) string {
	t.Helper()
	secret, _, err := s.CreateSession(context.Background(), u.ID, "test")
	if err != nil {
		t.Fatal(err)
	}
	return secret
}

func TestAuthorizeMatrix(t *testing.T) {
	owner := &User{ID: "o", Role: RoleOwner}
	admin := &User{ID: "a", Role: RoleAdmin}
	admin2 := &User{ID: "a2", Role: RoleAdmin}
	member := &User{ID: "m", Role: RoleMember}
	member2 := &User{ID: "m2", Role: RoleMember}
	actors := []*User{owner, admin, member}
	targets := []*User{owner, admin, admin2, member, member2}
	memberActions := map[Action]bool{ActionDeactivate: true, ActionReactivate: true, ActionResetPassword: true, ActionDelete: true}

	want := func(actor *User, action Action, target *User) error {
		switch action {
		case ActionChangePassword:
			return nil
		case ActionInvite, ActionListUsers:
			if actor.Role == RoleMember {
				return ErrForbidden
			}
			return nil
		}
		if target.ID == actor.ID {
			return ErrSelfAction
		}
		if target.Role == RoleOwner {
			return ErrForbidden
		}
		switch {
		case actor.Role == RoleOwner:
			return nil
		case actor.Role == RoleAdmin && memberActions[action] && target.Role == RoleMember:
			return nil
		}
		return ErrForbidden
	}
	// The table spelled out for the cases the design calls out.
	explicit := []struct {
		actor  *User
		action Action
		target *User
		err    error
	}{
		{owner, ActionDeactivate, owner, ErrSelfAction},
		{owner, ActionChangeRole, admin, nil},
		{owner, ActionTransfer, member, nil},
		{admin, ActionDeactivate, member, nil},
		{admin, ActionDelete, admin2, ErrForbidden},
		{admin, ActionResetPassword, owner, ErrForbidden},
		{admin, ActionChangeRole, member, ErrForbidden},
		{admin, ActionTransfer, member, ErrForbidden},
		{admin, ActionInvite, nil, nil},
		{member, ActionListUsers, nil, ErrForbidden},
		{member, ActionDeactivate, member2, ErrForbidden},
		{member, ActionChangePassword, nil, nil},
	}
	for _, c := range explicit {
		if got := Authorize(c.actor, c.action, c.target); !errors.Is(got, c.err) && !(got == nil && c.err == nil) {
			t.Errorf("explicit %s %s: %v, want %v", c.actor.Role, c.action, got, c.err)
		}
	}
	for _, a := range actors {
		for _, action := range Actions {
			for _, tg := range targets {
				got, exp := Authorize(a, action, tg), want(a, action, tg)
				if !errors.Is(got, exp) && !(got == nil && exp == nil) {
					t.Errorf("%s %s on %s(%s): %v, want %v", a.Role, action, tg.Role, tg.ID, got, exp)
				}
			}
		}
	}
	if Authorize(nil, ActionChangePassword, nil) == nil {
		t.Error("nil actor must be refused")
	}
}

func TestLoginDeactivatedCorrectPassword(t *testing.T) {
	ctx := context.Background()
	s, db := newService(t, false)
	owner := mustOwner(t, s)
	m := invited(t, s, owner, "m@example.com")
	if _, err := s.Deactivate(ctx, owner.ID, m.ID); err != nil {
		t.Fatal(err)
	}
	var before sql.NullInt64
	db.QueryRow("SELECT last_login_at FROM user_status WHERE user_id = ?", m.ID).Scan(&before)
	_, err := s.Authenticate(ctx, "m@example.com", pw)
	var d *DeactivatedLogin
	if !errors.Is(err, ErrAccountDeactivated) || !errors.As(err, &d) || d.UserID != m.ID {
		t.Fatalf("err = %v", err)
	}
	if errors.Is(err, ErrInvalidCredentials) {
		t.Fatal("deactivated must not look like a wrong password")
	}
	if _, _, err := s.CreateSession(ctx, m.ID, "x"); !errors.Is(err, ErrAccountDeactivated) {
		t.Fatalf("session for deactivated account: %v", err)
	}
	var after sql.NullInt64
	db.QueryRow("SELECT last_login_at FROM user_status WHERE user_id = ?", m.ID).Scan(&after)
	if before != after {
		t.Fatalf("last login changed: %v -> %v", before, after)
	}
}

func TestLoginDeactivatedWrongPasswordIsUniform(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, false)
	owner := mustOwner(t, s)
	m := invited(t, s, owner, "m@example.com")
	if _, err := s.Deactivate(ctx, owner.ID, m.ID); err != nil {
		t.Fatal(err)
	}
	_, err := s.Authenticate(ctx, "m@example.com", "wrong password here")
	if !errors.Is(err, ErrInvalidCredentials) || errors.Is(err, ErrAccountDeactivated) {
		t.Fatalf("err = %v", err)
	}
	if err.Error() != ErrInvalidCredentials.Error() {
		t.Fatalf("message differs: %q", err.Error())
	}
}

func TestLastLoginRecorded(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, false)
	owner := mustOwner(t, s)
	at := time.UnixMilli(1_800_000_000_000)
	s.SetClock(func() time.Time { return at })
	if _, err := s.Authenticate(ctx, "owner@example.com", pw); err != nil {
		t.Fatal(err)
	}
	session(t, s, owner)
	u, err := s.AdminUserByID(ctx, owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	if u.LastLoginAt == nil || *u.LastLoginAt != at.UnixMilli() {
		t.Fatalf("lastLoginAt = %v", u.LastLoginAt)
	}
}

func TestListUsersIncludesInvitedAccount(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, false)
	owner := mustOwner(t, s)
	m := invited(t, s, owner, "m@example.com")
	session(t, s, m) // the registration sign-in
	list, err := s.ListUsers(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 || list[0].ID != owner.ID || list[1].ID != m.ID {
		t.Fatalf("list = %+v", list)
	}
	got := list[1]
	if got.Role != RoleMember || got.Status != StatusActive || got.LastLoginAt == nil || got.Email != "m@example.com" {
		t.Fatalf("member entry = %+v", got)
	}
}

func TestSetRolePromoteDemote(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, false)
	owner := mustOwner(t, s)
	m := invited(t, s, owner, "m@example.com")
	u, err := s.SetRole(ctx, owner.ID, m.ID, RoleAdmin)
	if err != nil || u.Role != RoleAdmin {
		t.Fatalf("promote: %+v %v", u, err)
	}
	// The admin's existing session now carries the role.
	sec := session(t, s, m)
	if got, _ := s.UserBySession(ctx, sec); got.Role != RoleAdmin || !s.CanListUsers(got) {
		t.Fatalf("session role = %+v", got)
	}
	// Admins cannot change roles.
	m2 := invited(t, s, owner, "m2@example.com")
	if _, err := s.SetRole(ctx, m.ID, m2.ID, RoleAdmin); !errors.Is(err, ErrForbidden) {
		t.Fatalf("admin promotes: %v", err)
	}
	u, err = s.SetRole(ctx, owner.ID, m.ID, RoleMember)
	if err != nil || u.Role != RoleMember {
		t.Fatalf("demote: %+v %v", u, err)
	}
	if got, _ := s.UserBySession(ctx, sec); got.Role != RoleMember || s.CanListUsers(got) {
		t.Fatalf("session role after demote = %+v", got)
	}
	// Deactivated target and unknown target.
	if _, err := s.Deactivate(ctx, owner.ID, m2.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SetRole(ctx, owner.ID, m2.ID, RoleAdmin); !errors.Is(err, ErrAccountDeactivated) {
		t.Fatalf("deactivated target: %v", err)
	}
	if _, err := s.SetRole(ctx, owner.ID, "nope", RoleAdmin); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown target: %v", err)
	}
}

func TestSetRoleRejectsOwnerValue(t *testing.T) {
	ctx := context.Background()
	s, db := newService(t, false)
	owner := mustOwner(t, s)
	m := invited(t, s, owner, "m@example.com")
	for _, role := range []string{RoleOwner, "superuser", ""} {
		if _, err := s.SetRole(ctx, owner.ID, m.ID, role); !errors.Is(err, ErrInvalidRole) {
			t.Fatalf("role %q: %v", role, err)
		}
	}
	if n := countRows(t, db, "SELECT COUNT(*) FROM users WHERE role = 'owner'"); n != 1 {
		t.Fatalf("owners = %d", n)
	}
}

func TestSetRoleSelf(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, false)
	owner := mustOwner(t, s)
	for _, role := range []string{RoleAdmin, RoleMember} {
		if _, err := s.SetRole(ctx, owner.ID, owner.ID, role); !errors.Is(err, ErrSelfAction) {
			t.Fatalf("self %s: %v", role, err)
		}
	}
	if _, err := s.Deactivate(ctx, owner.ID, owner.ID); !errors.Is(err, ErrSelfAction) {
		t.Fatalf("self deactivate: %v", err)
	}
	if _, err := s.DeleteUser(ctx, owner.ID, owner.ID, owner.Email); !errors.Is(err, ErrSelfAction) {
		t.Fatalf("self delete: %v", err)
	}
	if _, _, err := s.IssuePasswordReset(ctx, owner.ID, owner.ID, 0); !errors.Is(err, ErrSelfAction) {
		t.Fatalf("self reset: %v", err)
	}
}

func TestDeactivateRevokesEverything(t *testing.T) {
	ctx := context.Background()
	s, db := newService(t, false)
	sy := opsync.NewService(db)
	owner := mustOwner(t, s)
	a := invited(t, s, owner, "a@example.com")
	promote(t, s, owner, a)
	sess1, sess2 := session(t, s, a), session(t, s, a)
	_, tok, err := s.CreateToken(ctx, a.ID, "script")
	if err != nil {
		t.Fatal(err)
	}
	inv, invSecret, err := s.CreateInvitation(ctx, a, "", 0)
	if err != nil {
		t.Fatal(err)
	}
	_, resetSecret, err := s.IssuePasswordReset(ctx, owner.ID, a.ID, 0)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := sy.Apply(ctx, a.ID, []opsync.Op{{ID: "o1", Entity: "task", EntityID: "t1", Field: "title", Value: []byte(`"Milk"`), TS: 1, Device: "d"}}); err != nil {
		t.Fatal(err)
	}
	opsBefore := countRows(t, db, "SELECT COUNT(*) FROM ops WHERE user_id = ?", a.ID)

	u, err := s.Deactivate(ctx, owner.ID, a.ID)
	if err != nil || u.Status != StatusDeactivated {
		t.Fatalf("deactivate: %+v %v", u, err)
	}
	if n := countRows(t, db, "SELECT COUNT(*) FROM sessions WHERE user_id = ?", a.ID); n != 0 {
		t.Fatalf("sessions left = %d", n)
	}
	if n := countRows(t, db, "SELECT COUNT(*) FROM api_tokens WHERE user_id = ?", a.ID); n != 0 {
		t.Fatalf("tokens left = %d", n)
	}
	for _, sec := range []string{sess1, sess2} {
		if _, err := s.UserBySession(ctx, sec); !errors.Is(err, ErrNotFound) {
			t.Fatalf("session still valid: %v", err)
		}
	}
	if _, err := s.UserByToken(ctx, tok); !errors.Is(err, ErrNotFound) {
		t.Fatalf("token still valid: %v", err)
	}
	list, _ := s.ListInvitations(ctx)
	for _, i := range list {
		if i.ID == inv.ID && i.Status != InvitationRevoked {
			t.Fatalf("invitation status = %s", i.Status)
		}
	}
	if _, err := s.PreviewInvitation(ctx, invSecret); !errors.Is(err, ErrInvitationInvalid) {
		t.Fatalf("invitation link: %v", err)
	}
	if err := s.ResetPassword(ctx, resetSecret, "a brand new password"); !errors.Is(err, ErrResetInvalid) {
		t.Fatalf("reset link: %v", err)
	}
	if n := countRows(t, db, "SELECT COUNT(*) FROM ops WHERE user_id = ?", a.ID); n != opsBefore || n == 0 {
		t.Fatalf("ops changed: %d -> %d", opsBefore, n)
	}
	if _, err := s.Deactivate(ctx, owner.ID, a.ID); !errors.Is(err, ErrAccountDeactivated) {
		t.Fatalf("second deactivate: %v", err)
	}
	// A deactivated admin cannot act.
	m := invited(t, s, owner, "m@example.com")
	if _, err := s.Deactivate(ctx, a.ID, m.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("deactivated admin acts: %v", err)
	}
	// Nobody can deactivate the owner, and the database refuses it too.
	if _, err := s.Deactivate(ctx, m.ID, owner.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("member deactivates owner: %v", err)
	}
	if _, err := db.Exec("INSERT INTO user_status(user_id,deactivated_at) VALUES(?,1) ON CONFLICT(user_id) DO UPDATE SET deactivated_at=1", owner.ID); err == nil {
		t.Fatal("database allowed deactivating the owner")
	}
}

func TestReactivateDoesNotRestoreTokens(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, false)
	owner := mustOwner(t, s)
	m := invited(t, s, owner, "m@example.com")
	_, tok, _ := s.CreateToken(ctx, m.ID, "script")
	if _, err := s.Reactivate(ctx, owner.ID, m.ID); !errors.Is(err, ErrAccountActive) {
		t.Fatalf("reactivate active: %v", err)
	}
	if _, err := s.Deactivate(ctx, owner.ID, m.ID); err != nil {
		t.Fatal(err)
	}
	u, err := s.Reactivate(ctx, owner.ID, m.ID)
	if err != nil || u.Status != StatusActive || u.Role != RoleMember {
		t.Fatalf("reactivate: %+v %v", u, err)
	}
	if _, err := s.UserByToken(ctx, tok); !errors.Is(err, ErrNotFound) {
		t.Fatalf("old token works again: %v", err)
	}
	if _, err := s.Authenticate(ctx, "m@example.com", pw); err != nil {
		t.Fatalf("sign-in after reactivation: %v", err)
	}
}

func TestDeleteUserRemovesOnlyTheirData(t *testing.T) {
	ctx := context.Background()
	s, db := newService(t, false)
	s.SetBeforeDelete(opsync.DeleteAccountData)
	sy := opsync.NewService(db)
	owner := mustOwner(t, s)
	m := invited(t, s, owner, "m@example.com")
	other := invited(t, s, owner, "other@example.com")
	for i, u := range []*User{m, other} {
		if _, err := sy.Apply(ctx, u.ID, []opsync.Op{{ID: fmt.Sprintf("o%d", i), Entity: "task", EntityID: fmt.Sprintf("t%d", i), Field: "title", Value: []byte(`"x"`), TS: 1, Device: "d"}}); err != nil {
			t.Fatal(err)
		}
	}
	session(t, s, m)
	otherOps := countRows(t, db, "SELECT COUNT(*) FROM ops WHERE user_id = ?", other.ID)
	otherFields := countRows(t, db, "SELECT COUNT(*) FROM scope_fields WHERE scope_id = ?", opsync.PersonalScope(other.ID))

	if _, err := s.DeleteUser(ctx, owner.ID, m.ID, "not-it@example.com"); !errors.Is(err, ErrConfirmationMismatch) {
		t.Fatalf("mismatch: %v", err)
	}
	if _, err := s.DeleteUser(ctx, owner.ID, m.ID, ""); !errors.Is(err, ErrConfirmationMismatch) {
		t.Fatalf("missing: %v", err)
	}
	if _, err := s.DeleteUser(ctx, owner.ID, "nope", "x"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown: %v", err)
	}
	if _, err := s.DeleteUser(ctx, owner.ID, m.ID, "M@Example.com"); err != nil {
		t.Fatal(err)
	}
	for q, want := range map[string]int{
		"SELECT COUNT(*) FROM users WHERE id = ?":                                         0,
		"SELECT COUNT(*) FROM ops WHERE user_id = ?":                                      0,
		"SELECT COUNT(*) FROM sessions WHERE user_id = ?":                                 0,
		"SELECT COUNT(*) FROM scope_fields WHERE scope_id = 'user:' || ?":                 0,
		"SELECT COUNT(*) FROM op_scopes WHERE scope_id = 'user:' || ?":                    0,
		"SELECT COUNT(*) FROM password_resets WHERE user_id = ?":                          0,
		"SELECT COUNT(*) FROM audit_events WHERE name = 'user.deleted' AND target_id = ?": 1,
	} {
		if n := countRows(t, db, q, m.ID); n != want {
			t.Errorf("%s = %d, want %d", q, n, want)
		}
	}
	if n := countRows(t, db, "SELECT COUNT(*) FROM ops WHERE user_id = ?", other.ID); n != otherOps {
		t.Fatalf("other ops %d -> %d", otherOps, n)
	}
	if n := countRows(t, db, "SELECT COUNT(*) FROM scope_fields WHERE scope_id = ?", opsync.PersonalScope(other.ID)); n != otherFields {
		t.Fatalf("other fields %d -> %d", otherFields, n)
	}
	// The email can register again through an invitation.
	invited(t, s, owner, "m@example.com")
	// The owner can never be deleted, not even through the database.
	if _, err := db.Exec("DELETE FROM users WHERE id = ?", owner.ID); err == nil {
		t.Fatal("database allowed deleting the owner")
	}
}

func TestResetLinkSingleUseUnderConcurrency(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, false)
	owner := mustOwner(t, s)
	m := invited(t, s, owner, "m@example.com")
	pr, secret, err := s.IssuePasswordReset(ctx, owner.ID, m.ID, 0)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(secret, "otr_") || pr.ExpiresAt <= time.Now().Add(23*time.Hour).UnixMilli() {
		t.Fatalf("reset = %+v %q", pr, secret)
	}
	p, err := s.PreviewPasswordReset(ctx, secret)
	if err != nil || p.Email != "m@example.com" {
		t.Fatalf("preview: %+v %v", p, err)
	}
	var wg sync.WaitGroup
	var mu sync.Mutex
	ok, invalid := 0, 0
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			err := s.ResetPassword(ctx, secret, fmt.Sprintf("new password number %d", i))
			mu.Lock()
			defer mu.Unlock()
			switch {
			case err == nil:
				ok++
			case errors.Is(err, ErrResetInvalid):
				invalid++
			default:
				t.Error(err)
			}
		}(i)
	}
	wg.Wait()
	if ok != 1 || invalid != 4 {
		t.Fatalf("ok=%d invalid=%d", ok, invalid)
	}
	if _, err := s.PreviewPasswordReset(ctx, secret); !errors.Is(err, ErrResetInvalid) {
		t.Fatalf("used link previews: %v", err)
	}
	if _, err := s.Authenticate(ctx, "m@example.com", pw); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("old password still works: %v", err)
	}
}

func TestNewResetRevokesOld(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, false)
	owner := mustOwner(t, s)
	m := invited(t, s, owner, "m@example.com")
	_, first, _ := s.IssuePasswordReset(ctx, owner.ID, m.ID, 0)
	_, second, err := s.IssuePasswordReset(ctx, owner.ID, m.ID, 2*time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.ResetPassword(ctx, first, "a brand new password"); !errors.Is(err, ErrResetInvalid) {
		t.Fatalf("old link: %v", err)
	}
	if err := s.ResetPassword(ctx, second, "short"); !errors.Is(err, ErrWeakPassword) {
		t.Fatalf("weak: %v", err)
	}
	if err := s.ResetPassword(ctx, second, "a brand new password"); err != nil {
		t.Fatalf("new link: %v", err)
	}
	for _, ttl := range []time.Duration{30 * time.Minute, 73 * time.Hour} {
		if _, _, err := s.IssuePasswordReset(ctx, owner.ID, m.ID, ttl); !errors.Is(err, ErrInvalidResetExpiry) {
			t.Fatalf("ttl %v: %v", ttl, err)
		}
	}
	if _, err := s.Deactivate(ctx, owner.ID, m.ID); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.IssuePasswordReset(ctx, owner.ID, m.ID, 0); !errors.Is(err, ErrAccountDeactivated) {
		t.Fatalf("deactivated target: %v", err)
	}
}

func TestResetKeepsTokensDropsSessions(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, false)
	owner := mustOwner(t, s)
	m := invited(t, s, owner, "m@example.com")
	sec := session(t, s, m)
	_, tok, _ := s.CreateToken(ctx, m.ID, "script")
	device, _, err := s.CreateTrustedDevice(ctx, m.ID, "browser")
	if err != nil {
		t.Fatal(err)
	}
	_, secret, _ := s.IssuePasswordReset(ctx, owner.ID, m.ID, 0)
	if err := s.ResetPassword(ctx, secret, "a brand new password"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.UserBySession(ctx, sec); !errors.Is(err, ErrNotFound) {
		t.Fatalf("session survived: %v", err)
	}
	// Remembered browsers no longer skip the second factor (route-authorization-policy).
	if ok, err := s.TrustedDeviceValid(ctx, m.ID, device); err != nil || ok {
		t.Fatalf("trusted device survived the reset: %v %v", ok, err)
	}
	if _, err := s.UserByToken(ctx, tok); err != nil {
		t.Fatalf("token revoked: %v", err)
	}
	if _, err := s.Authenticate(ctx, "m@example.com", "a brand new password"); err != nil {
		t.Fatalf("new password: %v", err)
	}
}

// TestSelfServiceResetForgetsTrustedDevices: the emailed "Forgot password?"
// link ends sessions and remembered browsers like an administrator's link.
func TestSelfServiceResetForgetsTrustedDevices(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, false)
	owner := mustOwner(t, s)
	m := invited(t, s, owner, "m@example.com")
	device, _, err := s.CreateTrustedDevice(ctx, m.ID, "browser")
	if err != nil {
		t.Fatal(err)
	}
	_, _, secret, err := s.RequestPasswordReset(ctx, "m@example.com")
	if err != nil || secret == "" {
		t.Fatalf("request reset: %q %v", secret, err)
	}
	if err := s.ResetPassword(ctx, secret, "a brand new password"); err != nil {
		t.Fatal(err)
	}
	if ok, err := s.TrustedDeviceValid(ctx, m.ID, device); err != nil || ok {
		t.Fatalf("trusted device survived the reset: %v %v", ok, err)
	}
}

// TestSignOutEverywhere ends sessions and remembered browsers and revokes API
// tokens and app passwords of that account only, with one audit event.
func TestSignOutEverywhere(t *testing.T) {
	ctx := context.Background()
	s, db := newService(t, false)
	owner := mustOwner(t, s)
	m := invited(t, s, owner, "m@example.com")
	sec := session(t, s, m)
	ownerSec := session(t, s, owner)
	_, tok, _ := s.CreateToken(ctx, m.ID, "script")
	_, ownerTok, _ := s.CreateToken(ctx, owner.ID, "owner script")
	_, app, err := s.CreateAppPassword(ctx, m.ID, "phone")
	if err != nil {
		t.Fatal(err)
	}
	device, _, _ := s.CreateTrustedDevice(ctx, m.ID, "browser")
	if err := s.SignOutEverywhere(ctx, m.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.UserBySession(ctx, sec); !errors.Is(err, ErrNotFound) {
		t.Fatalf("session survived: %v", err)
	}
	if _, err := s.UserByToken(ctx, tok); !errors.Is(err, ErrNotFound) {
		t.Fatalf("token survived: %v", err)
	}
	if _, _, err := s.UserByAppPassword(ctx, "m@example.com", app); !errors.Is(err, ErrNotFound) {
		t.Fatalf("app password survived: %v", err)
	}
	if ok, _ := s.TrustedDeviceValid(ctx, m.ID, device); ok {
		t.Fatal("trusted device survived")
	}
	if _, err := s.UserBySession(ctx, ownerSec); err != nil {
		t.Fatalf("another account's session ended: %v", err)
	}
	if _, err := s.UserByToken(ctx, ownerTok); err != nil {
		t.Fatalf("another account's token revoked: %v", err)
	}
	if n := countRows(t, db, "SELECT COUNT(*) FROM audit_events WHERE name = 'sessions.revoked' AND actor_id = ?", m.ID); n != 1 {
		t.Fatalf("sessions.revoked events = %d", n)
	}
}

func TestResetExpired(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, false)
	owner := mustOwner(t, s)
	m := invited(t, s, owner, "m@example.com")
	clock := &fakeClock{t: time.Now()}
	s.SetClock(clock.now)
	_, secret, _ := s.IssuePasswordReset(ctx, owner.ID, m.ID, time.Hour)
	clock.advance(time.Hour + time.Second)
	if _, err := s.PreviewPasswordReset(ctx, secret); !errors.Is(err, ErrResetInvalid) {
		t.Fatalf("expired preview: %v", err)
	}
	if err := s.ResetPassword(ctx, secret, "a brand new password"); !errors.Is(err, ErrResetInvalid) {
		t.Fatalf("expired use: %v", err)
	}
	if err := s.ResetPassword(ctx, "otr_unknown", "a brand new password"); !errors.Is(err, ErrResetInvalid) {
		t.Fatalf("unknown: %v", err)
	}
}

func TestChangePasswordKeepsCurrentSession(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, false)
	owner := mustOwner(t, s)
	m := invited(t, s, owner, "m@example.com")
	keep, other := session(t, s, m), session(t, s, m)
	_, tok, _ := s.CreateToken(ctx, m.ID, "script")
	if err := s.ChangePassword(ctx, m.ID, pw, "short", SessionHash(keep)); !errors.Is(err, ErrWeakPassword) {
		t.Fatalf("weak: %v", err)
	}
	if err := s.ChangePassword(ctx, m.ID, pw, "another long password", SessionHash(keep)); err != nil {
		t.Fatal(err)
	}
	if _, err := s.UserBySession(ctx, keep); err != nil {
		t.Fatalf("current session dropped: %v", err)
	}
	if _, err := s.UserBySession(ctx, other); !errors.Is(err, ErrNotFound) {
		t.Fatalf("other session kept: %v", err)
	}
	if _, err := s.UserByToken(ctx, tok); err != nil {
		t.Fatalf("token dropped: %v", err)
	}
	if _, err := s.Authenticate(ctx, "m@example.com", pw); err == nil {
		t.Fatal("old password still works")
	}
	// Bearer-token request: no session to keep, all are dropped.
	if err := s.ChangePassword(ctx, m.ID, "another long password", "yet another long password", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.UserBySession(ctx, keep); !errors.Is(err, ErrNotFound) {
		t.Fatalf("session kept for bearer change: %v", err)
	}
}

func TestChangePasswordWrongCurrent(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, false)
	owner := mustOwner(t, s)
	if err := s.ChangePassword(ctx, owner.ID, "wrong password!", "another long password", ""); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("err = %v", err)
	}
	if _, err := s.Authenticate(ctx, "owner@example.com", pw); err != nil {
		t.Fatalf("password changed anyway: %v", err)
	}
}

func TestTransferOwnership(t *testing.T) {
	ctx := context.Background()
	s, db := newService(t, false)
	owner := mustOwner(t, s)
	a := invited(t, s, owner, "a@example.com")
	promote(t, s, owner, a)
	sec := session(t, s, owner)
	if _, err := s.TransferOwnership(ctx, owner.ID, a.ID, "wrong password!"); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("wrong password: %v", err)
	}
	if _, err := s.TransferOwnership(ctx, owner.ID, owner.ID, pw); !errors.Is(err, ErrSelfAction) {
		t.Fatalf("self: %v", err)
	}
	if _, err := s.TransferOwnership(ctx, a.ID, owner.ID, pw); !errors.Is(err, ErrForbidden) {
		t.Fatalf("admin transfers: %v", err)
	}
	u, err := s.TransferOwnership(ctx, owner.ID, a.ID, pw)
	if err != nil || u.Role != RoleOwner {
		t.Fatalf("transfer: %+v %v", u, err)
	}
	if n := countRows(t, db, "SELECT COUNT(*) FROM users WHERE role = 'owner'"); n != 1 {
		t.Fatalf("owners = %d", n)
	}
	prev, _ := s.UserBySession(ctx, sec)
	if prev == nil || prev.Role != RoleAdmin {
		t.Fatalf("previous owner = %+v", prev)
	}
}

func TestTransferToDeactivatedRefused(t *testing.T) {
	ctx := context.Background()
	s, db := newService(t, false)
	owner := mustOwner(t, s)
	m := invited(t, s, owner, "m@example.com")
	if _, err := s.Deactivate(ctx, owner.ID, m.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.TransferOwnership(ctx, owner.ID, m.ID, pw); !errors.Is(err, ErrAccountDeactivated) {
		t.Fatalf("err = %v", err)
	}
	if n := countRows(t, db, "SELECT COUNT(*) FROM users WHERE role = 'owner' AND id = ?", owner.ID); n != 1 {
		t.Fatal("ownership moved")
	}
}

func TestConcurrentTransfersOneWins(t *testing.T) {
	ctx := context.Background()
	s, db := newService(t, false)
	owner := mustOwner(t, s)
	b := invited(t, s, owner, "b@example.com")
	c := invited(t, s, owner, "c@example.com")
	var wg sync.WaitGroup
	errs := make([]error, 2)
	for i, target := range []*User{b, c} {
		wg.Add(1)
		go func(i int, id string) {
			defer wg.Done()
			_, errs[i] = s.TransferOwnership(ctx, owner.ID, id, pw)
		}(i, target.ID)
	}
	wg.Wait()
	wins, forbidden := 0, 0
	for _, err := range errs {
		switch {
		case err == nil:
			wins++
		case errors.Is(err, ErrForbidden):
			forbidden++
		default:
			t.Fatal(err)
		}
	}
	if wins != 1 || forbidden != 1 {
		t.Fatalf("errs = %v", errs)
	}
	if n := countRows(t, db, "SELECT COUNT(*) FROM users WHERE role = 'owner'"); n != 1 {
		t.Fatalf("owners = %d", n)
	}
}

func TestAdminActionsAudited(t *testing.T) {
	ctx := context.Background()
	s, db := newService(t, false)
	s.SetBeforeDelete(opsync.DeleteAccountData)
	owner := mustOwner(t, s)
	m := invited(t, s, owner, "m@example.com")
	a := invited(t, s, owner, "a@example.com")
	count := func(name audit.Name) int {
		return countRows(t, db, "SELECT COUNT(*) FROM audit_events WHERE name = ?", string(name))
	}
	step := func(name audit.Name, fn func() error) {
		t.Helper()
		before := count(name)
		if err := fn(); err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if got := count(name) - before; got != 1 {
			t.Fatalf("%s: %d events, want 1", name, got)
		}
	}
	step(audit.RoleChangedName, func() error { _, err := s.SetRole(ctx, owner.ID, a.ID, RoleAdmin); return err })
	step(audit.UserDeactivatedName, func() error { _, err := s.Deactivate(ctx, a.ID, m.ID); return err })
	step(audit.UserReactivatedName, func() error { _, err := s.Reactivate(ctx, owner.ID, m.ID); return err })
	var secret string
	step(audit.PasswordResetIssuedName, func() error {
		var err error
		_, secret, err = s.IssuePasswordReset(ctx, a.ID, m.ID, 0)
		return err
	})
	step(audit.PasswordResetCompletedName, func() error { return s.ResetPassword(ctx, secret, "the new password 1") })
	step(audit.PasswordChangedName, func() error { return s.ChangePassword(ctx, m.ID, "the new password 1", "the new password 2", "") })
	step(audit.OwnerTransferredName, func() error { _, err := s.TransferOwnership(ctx, owner.ID, a.ID, pw); return err })
	step(audit.UserDeletedName, func() error { _, err := s.DeleteUser(ctx, a.ID, m.ID, "m@example.com"); return err })

	// A refused or rolled-back action records nothing.
	before := countRows(t, db, "SELECT COUNT(*) FROM audit_events")
	if _, err := s.Deactivate(ctx, owner.ID, a.ID); !errors.Is(err, ErrForbidden) { // owner is now admin
		t.Fatalf("refused: %v", err)
	}
	if _, err := s.DeleteUser(ctx, a.ID, owner.ID, "wrong@example.com"); !errors.Is(err, ErrConfirmationMismatch) {
		t.Fatalf("mismatch: %v", err)
	}
	if after := countRows(t, db, "SELECT COUNT(*) FROM audit_events"); after != before {
		t.Fatalf("rolled-back actions recorded %d events", after-before)
	}
	// No event carries a secret or a password.
	rows, err := db.Query("SELECT details FROM audit_events")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var d string
		rows.Scan(&d)
		for _, bad := range []string{secret, "the new password", pw, "otr_"} {
			if strings.Contains(d, bad) {
				t.Fatalf("event details %s contain %q", d, bad)
			}
		}
	}
}

func TestIssueOwnerPasswordReset(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, false)
	if _, _, _, err := s.IssueOwnerPasswordReset(ctx); !errors.Is(err, ErrNotFound) {
		t.Fatalf("no owner: %v", err)
	}
	owner := mustOwner(t, s)
	u, pr, secret, err := s.IssueOwnerPasswordReset(ctx)
	if err != nil || u.ID != owner.ID || pr.UserID != owner.ID {
		t.Fatalf("issue: %+v %+v %v", u, pr, err)
	}
	if err := s.ResetPassword(ctx, secret, "the owner's new password"); err != nil {
		t.Fatal(err)
	}
	if err := s.ResetPassword(ctx, secret, "the owner's new password"); !errors.Is(err, ErrResetInvalid) {
		t.Fatalf("second use: %v", err)
	}
}
