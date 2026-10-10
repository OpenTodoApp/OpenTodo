package httpapi

import (
	"testing"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/webauthn"
	"github.com/pixari/opentodo/internal/webauthn/testauth"
)

// passkeyOwner returns a signed-in owner on a passkey-capable server and the owner id.
func passkeyOwner(t *testing.T) (*env, string) {
	t.Helper()
	e := newEnvWithBase(t, testBase, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "name": "Owner", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	return e, out["user"].(map[string]any)["id"].(string)
}

func TestPasskeyRegisteredRecorded(t *testing.T) {
	e, ownerID := passkeyOwner(t)
	resp, out := e.registerPasskey(testauth.New(t, webauthn.AlgES256), "Phone")
	e.mustStatus(resp, 201, out)
	pkID := out["passkey"].(map[string]any)["id"].(string)
	ev := e.events(audit.PasskeyRegisteredName)
	if len(ev) != 1 || str(ev[0].ActorID) != ownerID || ev[0].Details["passkey_id"] != pkID || ev[0].Details["passkey_name"] != "Phone" {
		t.Fatalf("passkey.registered = %+v", ev)
	}
}

func TestPasskeyDeletedRecorded(t *testing.T) {
	e, ownerID := passkeyOwner(t)
	resp, out := e.registerPasskey(testauth.New(t, webauthn.AlgES256), "Laptop")
	e.mustStatus(resp, 201, out)
	pkID := out["passkey"].(map[string]any)["id"].(string)
	resp, out = e.do("DELETE", "/api/v1/passkeys/"+pkID, nil)
	e.mustStatus(resp, 204, out)
	// A second delete is a 404 and records nothing.
	resp, out = e.do("DELETE", "/api/v1/passkeys/"+pkID, nil)
	e.mustStatus(resp, 404, out)
	ev := e.events(audit.PasskeyDeletedName)
	if len(ev) != 1 || str(ev[0].ActorID) != ownerID || ev[0].Details["passkey_id"] != pkID || ev[0].Details["passkey_name"] != "Laptop" {
		t.Fatalf("passkey.deleted = %+v", ev)
	}
}

func TestPasskeyLoginRecorded(t *testing.T) {
	e, ownerID := passkeyOwner(t)
	key := testauth.New(t, webauthn.AlgES256)
	resp, out := e.registerPasskey(key, "Phone")
	e.mustStatus(resp, 201, out)
	other := newClientFor(e)
	resp, out = other.loginWithPasskey(key)
	other.mustStatus(resp, 200, out)
	var viaPasskey int
	for _, ev := range e.events(audit.LoginSucceededName) {
		if ev.Details["method"] == "passkey" {
			viaPasskey++
			if str(ev.ActorID) != ownerID || ev.Details["email"] != "o@example.com" {
				t.Fatalf("passkey sign-in event = %+v", ev)
			}
		}
	}
	if viaPasskey != 1 {
		t.Fatalf("passkey sign-ins recorded = %d, want 1", viaPasskey)
	}
}

func TestPasskeyLoginFailureRecorded(t *testing.T) {
	e, ownerID := passkeyOwner(t)
	// Unknown credential: no target.
	resp, out := newClientFor(e).loginWithPasskey(testauth.New(t, webauthn.AlgES256))
	if resp.StatusCode != 401 {
		t.Fatalf("unknown passkey = %d %v", resp.StatusCode, out)
	}
	// Counter regression on a registered key: target is the account.
	key := testauth.New(t, webauthn.AlgES256)
	key.Counter = 100
	resp, out = e.registerPasskey(key, "Key")
	e.mustStatus(resp, 201, out)
	resp, out = newClientFor(e).loginWithPasskey(key)
	e.mustStatus(resp, 200, out)
	key.Counter = 50
	resp, out = newClientFor(e).loginWithPasskey(key)
	if resp.StatusCode != 401 {
		t.Fatalf("regression = %d %v", resp.StatusCode, out)
	}
	failed := e.events(audit.LoginFailedName)
	if len(failed) != 2 {
		t.Fatalf("login.failed = %+v, want 2", failed)
	}
	regression, unknown := failed[0], failed[1]
	if unknown.TargetID != nil || unknown.Details["reason"] != audit.ReasonUnknownPasskey {
		t.Fatalf("unknown passkey event = %+v", unknown)
	}
	if str(regression.TargetID) != ownerID || regression.ActorID != nil || regression.Details["reason"] != audit.ReasonPasskeyCounter {
		t.Fatalf("counter regression event = %+v", regression)
	}
}

func TestPasskeyLoginRateLimitRecordsOneEvent(t *testing.T) {
	e := newEnvWithBase(t, testBase, false)
	for i := 0; i < 25; i++ {
		e.do("POST", "/api/v1/auth/passkey", map[string]any{"credential": map[string]any{"rawId": "AAAA"}})
	}
	var limited int
	for _, ev := range e.events(audit.LoginFailedName) {
		if ev.Details["reason"] == audit.ReasonRateLimited {
			limited++
		}
	}
	if limited != 1 {
		t.Fatalf("rate_limited events = %d, want 1", limited)
	}
	// Challenge requests have their own limiter and record nothing when refused.
	for i := 0; i < 15; i++ {
		e.do("POST", "/api/v1/auth/passkey/options", map[string]any{})
	}
	if n := len(e.events(audit.LoginFailedName)); n != 1 {
		t.Fatalf("options refusals were recorded: %d events", n)
	}
}
