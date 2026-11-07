package httpapi

import (
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/audit"
	"github.com/OpenTodoApp/opentodo/internal/auth"
)

// A revoked device removes its local copy (OpenSpec change revoked-device-wipe).

// wipeState reads auth/status: the wipe key while signed in, the proof once
// the session was revoked.
func wipeState(t *testing.T, c *env) (authenticated bool, key, proof string) {
	t.Helper()
	resp, out := c.do("GET", "/api/v1/auth/status", nil)
	c.mustStatus(resp, 200, out)
	key, _ = out["wipeKey"].(string)
	if r, ok := out["revoked"].(map[string]any); ok {
		proof, _ = r["proof"].(string)
	}
	return out["authenticated"] == true, key, proof
}

func TestRevokedDeviceGetsProof(t *testing.T) {
	e := ownerEnv(t)
	phone := newClientAt(e, "203.0.113.90")
	resp, out := login(phone, "owner@example.com", "correct horse battery")
	phone.mustStatus(resp, 200, out)
	ok, key, proof := wipeState(t, phone)
	if !ok || len(key) < 40 || proof != "" {
		t.Fatalf("signed in: authenticated=%v key=%q proof=%q", ok, key, proof)
	}
	// The key is the session's: asked again it stays, another session has its own.
	if _, again, _ := wipeState(t, phone); again != key {
		t.Fatalf("key changed: %q then %q", key, again)
	}
	if _, own, _ := wipeState(t, e); own == key || own == "" {
		t.Fatalf("this browser's key %q, the phone's %q", own, key)
	}
	m, _ := e.member("member@example.com", "198.51.100.20")

	resp, out = e.do("POST", "/api/v1/me/sign-out-everywhere", nil)
	e.mustStatus(resp, 204, out)

	ok, _, proof = wipeState(t, phone)
	if ok || proof != auth.WipeProof(key) {
		t.Fatalf("revoked phone: authenticated=%v proof=%q, want %q", ok, proof, auth.WipeProof(key))
	}
	if proof == auth.WipeProof("another key") {
		t.Fatal("the proof does not depend on the key")
	}
	// Another account's devices keep working and get no proof.
	if ok, _, proof := wipeState(t, m); !ok || proof != "" {
		t.Fatalf("member after the owner signed out everywhere: authenticated=%v proof=%q", ok, proof)
	}
	// No cookie, or an unknown one: nothing.
	anon := newClientAt(e, "203.0.113.91")
	if _, _, proof := wipeState(t, anon); proof != "" {
		t.Fatalf("no cookie: proof %q", proof)
	}
}

func TestRevokedDeviceOnDeactivation(t *testing.T) {
	e := ownerEnv(t)
	m, mid := e.member("member@example.com", "198.51.100.21")
	_, key, _ := wipeState(t, m)
	resp, out := e.do("POST", "/api/v1/users/"+mid+"/deactivate", nil)
	e.mustStatus(resp, 200, out)
	if ok, _, proof := wipeState(t, m); ok || proof != auth.WipeProof(key) {
		t.Fatalf("deactivated member: authenticated=%v proof=%q", ok, proof)
	}
	// Deleting the account keeps it so (the record outlives the cascade).
	resp, out = e.do("POST", "/api/v1/users/"+mid+"/reactivate", nil)
	e.mustStatus(resp, 200, out)
	m2 := newClientAt(e, "198.51.100.22")
	resp, out = login(m2, "member@example.com", "member long password")
	m2.mustStatus(resp, 200, out)
	_, key2, _ := wipeState(t, m2)
	resp, out = e.do("DELETE", "/api/v1/users/"+mid, map[string]string{"confirmEmail": "member@example.com"})
	e.mustStatus(resp, 204, out)
	if ok, _, proof := wipeState(t, m2); ok || proof != auth.WipeProof(key2) {
		t.Fatalf("deleted member: authenticated=%v proof=%q", ok, proof)
	}
}

func TestPasswordChangeDoesNotWipe(t *testing.T) {
	e := ownerEnv(t)
	phone := newClientAt(e, "203.0.113.92")
	resp, out := login(phone, "owner@example.com", "correct horse battery")
	phone.mustStatus(resp, 200, out)
	if _, key, _ := wipeState(t, phone); key == "" {
		t.Fatal("no wipe key")
	}
	resp, out = e.do("POST", "/api/v1/me/password", map[string]string{"currentPassword": "correct horse battery", "newPassword": "another long passphrase"})
	if resp.StatusCode >= 300 {
		t.Fatalf("change password: %d %v", resp.StatusCode, out)
	}
	// The phone signs in again and keeps its copy (design D1).
	if ok, _, proof := wipeState(t, phone); ok || proof != "" {
		t.Fatalf("after a password change: authenticated=%v proof=%q", ok, proof)
	}
	var n int
	if err := e.db.QueryRow("SELECT COUNT(*) FROM revoked_sessions").Scan(&n); err != nil || n != 0 {
		t.Fatalf("revoked sessions after a password change = %d %v", n, err)
	}
}

func TestRevokedDeviceEndsRelay(t *testing.T) {
	e, _, _ := encryptedOwner(t)
	phone := newClientAt(e, "203.0.113.93")
	resp, out := login(phone, "owner@example.com", "correct horse battery")
	phone.mustStatus(resp, 200, out)
	resp, out = phone.do("PUT", "/api/v1/relay/devices/phone", map[string]any{"label": "Phone"})
	phone.mustStatus(resp, 204, out)
	resp, out = e.do("POST", "/api/v1/me/sign-out-everywhere", nil)
	e.mustStatus(resp, 204, out)
	var n int
	if err := e.db.QueryRow("SELECT COUNT(*) FROM relay_devices").Scan(&n); err != nil || n != 0 {
		t.Fatalf("relay opt-ins after sign out everywhere = %d %v", n, err)
	}
	reasons := map[string]string{}
	for _, ev := range e.events(audit.RelayDisabledName) {
		reasons[ev.Details["relay_device_id"]] = ev.Details["reason"]
	}
	if reasons["phone"] != "signed_out" {
		t.Fatalf("relay.disabled reasons = %v", reasons)
	}
}
