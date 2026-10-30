package audit

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/store"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

func newRecorder(t *testing.T) (*Recorder, *sql.DB) {
	t.Helper()
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return New(db, nil), db
}

// allConstructors calls every constructor with sample values. Adding a name to
// the catalogue without a constructor here fails TestEveryNameHasAConstructor.
func allConstructors() []Event {
	return []Event{
		NameChanged("u"), EmailChangeRequested("u"), EmailChanged("u"), AvatarChanged("u"),
		LoginSucceeded("u", "u@example.com", "password"),
		LoginFailed("u", "u@example.com", ReasonWrongPassword),
		Logout("u"),
		EmailSent("o", "u", "password_reset", "u@example.com"),
		EmailFailed("", "", "verify_signup", "x@example.com", "rate_limited"),
		PublicLinkCreated("o", "pl1", "p1", "tick"),
		PublicLinkRevoked("o", "pl1", "p1"),
		ProjectAgentAccess("o", "p1", "allowed", "kept_away"),
		TaskPagePublished("o", "tp1", "reply"),
		TaskPageRevoked("o", "tp1"),
		AgentWrite("u", "complete_tasks", "t", "Desk assistant", 3),
		AgentWrite("u", "create_tasks", "t", "Desk assistant", 0).Failed("writes_disabled_by_user"),
		RelayEnabled("u", "device-1", "Laptop"),
		RelayDisabled("u", "device-1", "Laptop", "locked"),
		WorkspaceCreated("u", "w"), WorkspaceRenamed("u", "w"), WorkspaceDeleted("u", "w"), WorkspaceTransferred("u", "v", "w"),
		WorkspaceMemberAdded("u", "v", "w", "member"), WorkspaceMemberRoleChanged("u", "v", "w", "member", "admin"), WorkspaceMemberRemoved("u", "v", "w"),
		WorkspaceGroupCreated("u", "w", "g"), WorkspaceGroupDeleted("u", "w", "g"),
		WorkspaceGroupMemberAdded("u", "v", "w", "g"), WorkspaceGroupMemberRemoved("u", "v", "w", "g"),
		ProjectMemberAdded("u", "v", "p", "editor"), ProjectGrantAdded("u", "p", "g", "editor"), ProjectGrantChanged("u", "p", "g", "editor", "viewer"), ProjectGrantRemoved("u", "p", "g"),
		WorkspaceInviteCreated("u", "i", "w", "member", "x@example.com"), WorkspaceInviteAccepted("v", "u", "i", "w", "member"), WorkspaceInviteRevoked("u", "i", "w"),
		MemberInvitationCreated("u", "v", "i", "project", "p", "editor"), MemberInvitationAccepted("v", "u", "i", "workspace", "w", "member"),
		MemberInvitationDeclined("v", "u", "i", "project", "p", "viewer"), MemberInvitationCancelled("u", "", "i", "project", "p", "editor"),
		MFAEnrolled("u", "totp"),
		MFADisabled("o", "u", "totp"),
		MFAReset("o", "u"),
		MFAChallengeFailed("u", "wrong_code"),
		PasskeyRegistered("u", "pk1", "YubiKey"),
		PasskeyDeleted("u", "u", "pk1", "YubiKey"),
		TokenCreated("u", "t1", "laptop script"),
		TokenRevoked("u", "t1", "laptop script"),
		AppPasswordCreated("u", "a1", "iPhone"),
		AppPasswordRevoked("u", "a1", "iPhone"),
		CalendarFeedCreated("u"), CalendarFeedRotated("u"), CalendarFeedRevoked("u"),
		EmailInboxCreated("u"),
		EmailInboxRotated("u"),
		EmailInboxUpdated("u", "enabled", "true", "false"),
		IssueConnectionCreated("u", "c1", "github"),
		IssueConnectionUpdated("u", "c1", "github", "token"),
		IssueConnectionDeleted("u", "c1", "gitlab"),
		CalendarConnectionCreated("u", "c1", "caldav"),
		CalendarConnectionUpdated("u", "c1", "google", "password"),
		CalendarConnectionDeleted("u", "c1", "caldav"),
		NotificationChannelCreated("u", "n1", "ntfy"),
		NotificationChannelUpdated("u", "n1", "gotify", "token"),
		NotificationChannelDeleted("u", "n1", "webhook"),
		InvitationCreated("o", "i1", "a@example.com"),
		InvitationAccepted("u", "u@example.com", "i1"),
		InvitationRevoked("o", "i1"),
		ProjectInviteCreated("o", "pi1", "p1", "editor", "a@example.com"),
		ProjectInviteRevoked("o", "pi1", "p1"),
		ProjectInviteAccepted("u", "o", "pi1", "p1", "editor"),
		RoleChanged("o", "u", "member", "admin"),
		SettingsChanged("o", KeyRetentionDays, "90", "30"),
		IdentityLinked("u", "authentik"),
		IdentityUnlinked("u", "authentik"),
		ExportRequested("u", "json"),
		AuditExported("o", 12),
		BackupCreated("o", "b1"),
		BackupRestored("o", "b1").Failed("checksum_mismatch"),
		BackupRestoreRequested("o", "opentodo-20261013-030000-4f1c0a9e.tar.gz", "archive"),
		BackupRestoreFailed("o", "opentodo-20261013-030000-4f1c0a9e.tar.gz", "integrity"),
		BackupSafetyCopyDeleted("o", "opentodo.db.pre-restore-20261013-030000"),
		UserDeactivated("o", "u"),
		UserReactivated("o", "u"),
		UserDeleted("o", "u", "u@example.com"),
		PasswordResetIssued("o", "u", "r1"),
		PasswordResetCompleted("u", "r1"),
		PasswordChanged("u"),
		SignedOutEverywhere("u", 2, 1, 3, 1),
		OwnerTransferred("o", "u"),
	}
}

// secretFields are names that would mean a credential or one-time secret is
// being logged.
var secretFields = []string{"password", "password_hash", "secret", "token", "token_hash", "plain", "code", "otp", "totp_code", "recovery_code", "recovery_codes", "invitation", "link", "cookie", "session"}

func TestConstructorsNeverCarryEntityFields(t *testing.T) {
	deny := map[string]string{}
	// Field names that also name an audit detail and are never content: a frame's
	// planning source is a "project:<id>" key (calendar-frames D1), while a
	// restore's source is the backup it came from.
	shared := map[string]bool{"frame.source": true}
	for entity, fields := range opsync.Schema {
		for f, def := range fields {
			if shared[entity+"."+f] && !def.Content {
				continue
			}
			deny[f] = entity + " field"
		}
	}
	for _, f := range secretFields {
		deny[f] = "secret"
	}
	for k := range allowedDetailKeys {
		if why, bad := deny[k]; bad {
			t.Errorf("allowed detail key %q is a %s", k, why)
		}
	}
	for _, e := range allConstructors() {
		if err := Validate(e); err != nil {
			t.Errorf("%s: %v", e.Name, err)
		}
		for k, v := range e.Details() {
			if why, bad := deny[k]; bad {
				t.Errorf("%s carries detail %q, a %s", e.Name, k, why)
			}
			if !allowedDetailKeys[k] {
				t.Errorf("%s carries detail %q outside the allow-list", e.Name, k)
			}
			if len(v) > 300 {
				t.Errorf("%s detail %q is suspiciously long", e.Name, k)
			}
		}
	}
}

func TestEveryNameHasAConstructor(t *testing.T) {
	seen := map[Name]bool{}
	for _, e := range allConstructors() {
		seen[e.Name] = true
	}
	for _, n := range Names {
		if !seen[n] {
			t.Errorf("catalogue name %q has no constructor in allConstructors", n)
		}
	}
	for _, n := range PersonalNames {
		if !Known(n) {
			t.Errorf("personal name %q not in catalogue", n)
		}
	}
}

func TestRecordRejectsUnknownNamesAndKeys(t *testing.T) {
	r, db := newRecorder(t)
	ctx := context.Background()
	tx, _ := db.BeginTx(ctx, nil)
	defer tx.Rollback()
	if err := r.RecordTx(ctx, tx, Event{Name: "task.updated", Outcome: Success}); !errors.Is(err, ErrUnknownEvent) {
		t.Fatalf("unknown name: %v", err)
	}
	bad := Logout("u")
	bad.details = map[string]string{"title": "Buy milk"}
	if err := r.RecordTx(ctx, tx, bad); !errors.Is(err, ErrDetailKey) {
		t.Fatalf("unknown key: %v", err)
	}
}

func count(t *testing.T, db *sql.DB, where string, args ...any) int {
	t.Helper()
	var n int
	if err := db.QueryRow("SELECT COUNT(*) FROM audit_events WHERE "+where, args...).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestRecordRespectsAddressPolicy(t *testing.T) {
	r, db := newRecorder(t)
	ctx := WithRequest(context.Background(), "203.0.113.7", strings.Repeat("é", 150)) // 300 bytes

	// Off by default.
	r.Record(ctx, LoginSucceeded("u", "u@example.com", "password"))
	if n := count(t, db, "ip IS NULL AND name = 'login.succeeded'"); n != 1 {
		t.Fatalf("default: events without ip = %d, want 1", n)
	}
	var ua string
	if err := db.QueryRow("SELECT user_agent FROM audit_events LIMIT 1").Scan(&ua); err != nil {
		t.Fatal(err)
	}
	if len(ua) > MaxUserAgent || !strings.HasPrefix(strings.Repeat("é", 150), ua) || len(ua) < MaxUserAgent-1 {
		t.Fatalf("user agent not truncated on a rune boundary: %d bytes", len(ua))
	}

	on := true
	if _, err := r.UpdateSettings(context.Background(), "o", SettingsPatch{LogIP: &on}); err != nil {
		t.Fatal(err)
	}
	r.Record(ctx, Logout("u"))
	if n := count(t, db, "ip = '203.0.113.7' AND name = 'logout'"); n != 1 {
		t.Fatalf("enabled: logout events with ip = %d, want 1", n)
	}
	// No request metadata (e.g. a background job): no address even when enabled.
	r.Record(context.Background(), BackupCreated("o", "b1"))
	if n := count(t, db, "ip IS NULL AND name = 'backup.created'"); n != 1 {
		t.Fatal("event without request metadata carried an address")
	}
}

func TestDisablingAddressLoggingScrubs(t *testing.T) {
	r, db := newRecorder(t)
	ctx := WithRequest(context.Background(), "198.51.100.2", "test")
	on, off := true, false
	if _, err := r.UpdateSettings(ctx, "o", SettingsPatch{LogIP: &on}); err != nil {
		t.Fatal(err)
	}
	r.Record(ctx, LoginSucceeded("u", "", "password"))
	if n := count(t, db, "ip IS NOT NULL"); n < 1 {
		t.Fatal("no address recorded while enabled")
	}
	set, err := r.UpdateSettings(ctx, "o", SettingsPatch{LogIP: &off})
	if err != nil || set.LogIP {
		t.Fatalf("disable: %v %v", set, err)
	}
	if n := count(t, db, "ip IS NOT NULL"); n != 0 {
		t.Fatalf("%d events still carry an address after disabling", n)
	}
	// Both changes are recorded as settings.changed with old and new values.
	list, _, err := r.List(context.Background(), Filter{Name: SettingsChangedName})
	if err != nil || len(list) != 2 {
		t.Fatalf("settings events = %v %v", list, err)
	}
	if d := list[0].Details; d["setting"] != KeyLogIP || d["from"] != "true" || d["to"] != "false" {
		t.Fatalf("latest settings event = %v", d)
	}
}

func TestPruneByRetention(t *testing.T) {
	r, db := newRecorder(t)
	ctx := context.Background()
	now := time.Now()
	day := 24 * time.Hour
	insert := func(age time.Duration, n int) {
		for i := 0; i < n; i++ {
			if _, err := db.Exec("INSERT INTO audit_events(ts,name,outcome) VALUES(?, 'logout', 'success')", now.Add(-age).UnixMilli()); err != nil {
				t.Fatal(err)
			}
		}
	}
	insert(100*day, pruneBatch+5) // more than one batch, older than the 90-day default
	insert(40*day, 3)
	insert(time.Hour, 2)

	n, err := r.Prune(ctx)
	if err != nil || n != pruneBatch+5 {
		t.Fatalf("prune with default retention removed %d (%v), want %d", n, err, pruneBatch+5)
	}
	if left := count(t, db, "1=1"); left != 5 {
		t.Fatalf("left %d events, want 5", left)
	}

	thirty := 30
	if _, err := r.UpdateSettings(ctx, "o", SettingsPatch{RetentionDays: &thirty}); err != nil {
		t.Fatal(err)
	}
	if n, err := r.Prune(ctx); err != nil || n != 3 {
		t.Fatalf("prune with 30 days removed %d (%v), want 3", n, err)
	}
	// The recent events and the settings change survive.
	if left := count(t, db, "1=1"); left != 3 {
		t.Fatalf("left %d events, want 3", left)
	}
	if count(t, db, "name = 'settings.changed'") != 1 {
		t.Fatal("retention change was not recorded")
	}

	three := 3
	if _, err := r.UpdateSettings(ctx, "o", SettingsPatch{RetentionDays: &three}); !errors.Is(err, ErrInvalidRetention) {
		t.Fatalf("3 days: %v", err)
	}
}

// TestNextPruneIsTheRetentionDeadline: the housekeeping job (internal/jobs)
// prunes when the oldest event passes the retention, at startup when it
// already has.
func TestNextPruneIsTheRetentionDeadline(t *testing.T) {
	r, db := newRecorder(t)
	ctx := context.Background()
	if _, ok, err := r.NextPrune(ctx); ok || err != nil {
		t.Fatalf("empty log has a deadline: %v %v", ok, err)
	}
	old := time.Now().Add(-200 * 24 * time.Hour)
	if _, err := db.Exec("INSERT INTO audit_events(ts,name,outcome) VALUES(?, 'logout', 'success')", old.UnixMilli()); err != nil {
		t.Fatal(err)
	}
	at, ok, err := r.NextPrune(ctx)
	if err != nil || !ok || !at.Equal(time.UnixMilli(old.UnixMilli()).Add(90*24*time.Hour)) || at.After(time.Now()) {
		t.Fatalf("next prune %v %v %v, want past: 90 days after the event", at, ok, err)
	}
	if n, err := r.Prune(ctx); err != nil || n != 1 || count(t, db, "1=1") != 0 {
		t.Fatalf("prune: %d %v", n, err)
	}
}

func TestListFiltersAndCursor(t *testing.T) {
	r, _ := newRecorder(t)
	ctx := context.Background()
	for i := 0; i < 5; i++ {
		r.Record(ctx, LoginFailed("u1", "u1@example.com", ReasonWrongPassword))
		r.Record(ctx, LoginSucceeded("u2", "u2@example.com", "password"))
	}
	page, next, err := r.List(ctx, Filter{Name: LoginFailedName, Limit: 3})
	if err != nil || len(page) != 3 || next == 0 {
		t.Fatalf("page 1 = %d events, next %d, %v", len(page), next, err)
	}
	if page[0].ID < page[1].ID {
		t.Fatal("not newest first")
	}
	page2, next2, err := r.List(ctx, Filter{Name: LoginFailedName, Limit: 3, Cursor: next})
	if err != nil || len(page2) != 2 || next2 != 0 || page2[0].ID >= next {
		t.Fatalf("page 2 = %d events, next %d, %v", len(page2), next2, err)
	}
	// Deleted-account snapshot: no users row, email comes from details.
	if page[0].TargetEmail == nil || *page[0].TargetEmail != "u1@example.com" || page[0].ActorID != nil {
		t.Fatalf("entry = %+v", page[0])
	}
	other, _, _ := r.List(ctx, Filter{Actor: "u2", Outcome: Failure})
	if len(other) != 0 {
		t.Fatalf("actor+outcome filter leaked %d events", len(other))
	}
}

// TestWorkspaceEventsCarryIdsOnly (OpenSpec change workspaces, task 3.4): a
// workspace or group name never reaches the log, and the allow-list refuses a
// detail key that would carry one.
func TestWorkspaceEventsCarryIdsOnly(t *testing.T) {
	e := WorkspaceGroupMemberAdded("alice", "bob", "w-1", "g-1")
	if d := e.Details(); d["workspace"] != "w-1" || d["group"] != "g-1" || len(d) != 2 {
		t.Fatalf("details = %v", d)
	}
	named := e
	named.details = map[string]string{"workspace": "w-1", "name": "Family"}
	if err := Validate(named); err == nil {
		t.Fatal("a name detail passed validation")
	}
}
