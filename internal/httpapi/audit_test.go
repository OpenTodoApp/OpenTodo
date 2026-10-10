package httpapi

import (
	"context"
	"testing"

	"github.com/pixari/opentodo/internal/audit"
)

// events reads the log directly (bypassing the API) for one event name.
func (e *env) events(name audit.Name) []audit.Entry {
	e.t.Helper()
	list, _, err := audit.New(e.db, nil).List(context.Background(), audit.Filter{Name: name, Limit: audit.MaxLimit})
	if err != nil {
		e.t.Fatal(err)
	}
	return list
}

func str(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func TestAuthEventsRecorded(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("GET", "/api/v1/me", nil)
	e.mustStatus(resp, 200, out)
	ownerID := out["user"].(map[string]any)["id"].(string)

	// Registration starts a session: recorded as a sign-in by registration.
	reg := e.events(audit.LoginSucceededName)
	if len(reg) != 1 || reg[0].Details["method"] != "register" || str(reg[0].ActorID) != ownerID {
		t.Fatalf("registration sign-in = %+v", reg)
	}

	other := newClientAt(e, "203.0.113.9")
	// Wrong password for an existing account: target set, no actor, reason, no address by default.
	resp, out = other.do("POST", "/api/v1/auth/login", map[string]string{"email": "owner@example.com", "password": "nope nope nope"},
		"User-Agent", "audit-test-browser")
	other.mustStatus(resp, 401, out)
	// Unknown account: same response, no target, and the submitted email is not stored.
	resp, out = other.do("POST", "/api/v1/auth/login", map[string]string{"email": "ghost@example.com", "password": "nope nope nope"})
	other.mustStatus(resp, 401, out)
	failed := e.events(audit.LoginFailedName)
	if len(failed) != 2 {
		t.Fatalf("login.failed events = %d, want 2", len(failed))
	}
	unknown, wrong := failed[0], failed[1]
	if wrong.Outcome != audit.Failure || wrong.ActorID != nil || str(wrong.TargetID) != ownerID ||
		wrong.Details["reason"] != audit.ReasonWrongPassword || wrong.IP != nil || wrong.UserAgent != "audit-test-browser" {
		t.Fatalf("wrong password event = %+v", wrong)
	}
	if unknown.TargetID != nil || unknown.Details["reason"] != audit.ReasonUnknownAccount || unknown.Details["email"] != "" {
		t.Fatalf("unknown account event = %+v", unknown)
	}
	for _, ev := range failed {
		for _, v := range ev.Details {
			if v == "nope nope nope" {
				t.Fatal("password stored in the audit log")
			}
		}
	}

	resp, out = other.do("POST", "/api/v1/auth/login", map[string]string{"email": "owner@example.com", "password": "correct horse battery"})
	other.mustStatus(resp, 200, out)
	ok := e.events(audit.LoginSucceededName)
	if len(ok) != 2 || ok[0].Details["method"] != "password" || str(ok[0].ActorID) != ownerID {
		t.Fatalf("login.succeeded = %+v", ok)
	}

	// Token create and revoke.
	resp, out = other.do("POST", "/api/v1/tokens", map[string]string{"name": "laptop script"})
	other.mustStatus(resp, 201, out)
	tokID := out["token"].(map[string]any)["id"].(string)
	created := e.events(audit.TokenCreatedName)
	if len(created) != 1 || created[0].Details["token_name"] != "laptop script" || created[0].Details["token_id"] != tokID ||
		str(created[0].ActorID) != ownerID || created[0].Outcome != audit.Success {
		t.Fatalf("token.created = %+v", created)
	}
	resp, out = other.do("DELETE", "/api/v1/tokens/"+tokID, nil)
	other.mustStatus(resp, 204, out)
	if rv := e.events(audit.TokenRevokedName); len(rv) != 1 || rv[0].Details["token_id"] != tokID {
		t.Fatalf("token.revoked = %+v", rv)
	}

	// Export.
	resp, out = other.do("GET", "/api/v1/export", nil)
	other.mustStatus(resp, 200, out)
	if ex := e.events(audit.ExportRequestedName); len(ex) != 1 || str(ex[0].ActorID) != ownerID {
		t.Fatalf("export.requested = %+v", ex)
	}

	// Sign-out.
	resp, out = other.do("POST", "/api/v1/auth/logout", nil)
	other.mustStatus(resp, 204, out)
	if lo := e.events(audit.LogoutName); len(lo) != 1 || str(lo[0].ActorID) != ownerID {
		t.Fatalf("logout = %+v", lo)
	}
	// Signing out without a session records nothing.
	resp, out = other.do("POST", "/api/v1/auth/logout", nil)
	other.mustStatus(resp, 204, out)
	if lo := e.events(audit.LogoutName); len(lo) != 1 {
		t.Fatalf("anonymous logout recorded: %d", len(lo))
	}

	// Task edits are not events.
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Buy milk"})
	e.mustStatus(resp, 201, out)
	var n int
	if err := e.db.QueryRow("SELECT COUNT(*) FROM audit_events WHERE details LIKE '%Buy milk%' OR name LIKE 'task%'").Scan(&n); err != nil || n != 0 {
		t.Fatalf("task write reached the audit log (%d, %v)", n, err)
	}
}

func TestLoginRateLimitRecordsOneEvent(t *testing.T) {
	e := ownerEnv(t)
	c := newClientAt(e, "198.51.100.77")
	for i := 0; i < 25; i++ {
		c.do("POST", "/api/v1/auth/login", map[string]string{"email": "owner@example.com", "password": "nope nope nope"})
	}
	var limited, wrong int
	for _, ev := range e.events(audit.LoginFailedName) {
		switch ev.Details["reason"] {
		case audit.ReasonRateLimited:
			limited++
		case audit.ReasonWrongPassword:
			wrong++
		}
	}
	if wrong != 10 || limited != 1 {
		t.Fatalf("wrong_password = %d (want 10), rate_limited = %d (want 1)", wrong, limited)
	}
}

func TestWebhookPolicyChangeRecorded(t *testing.T) {
	owner, member := memberEnv(t)
	ownerID := owner.userID()
	owner.allowPrivate(true)
	owner.allowPrivate(true) // unchanged: no second event
	owner.allowPrivate(false)
	resp, out := member.do("PUT", "/api/v1/settings/webhooks", map[string]any{"allowPrivate": true})
	member.mustStatus(resp, 403, out)
	var policy []audit.Entry
	for _, ev := range owner.events(audit.SettingsChangedName) {
		if ev.Details["setting"] == "webhooks_allow_private" {
			policy = append(policy, ev)
		}
	}
	if len(policy) != 2 {
		t.Fatalf("webhook policy events = %+v, want 2", policy)
	}
	if str(policy[0].ActorID) != ownerID || policy[0].Details["from"] != "true" || policy[0].Details["to"] != "false" ||
		policy[1].Details["from"] != "false" || policy[1].Details["to"] != "true" {
		t.Fatalf("webhook policy events = %+v", policy)
	}
}
