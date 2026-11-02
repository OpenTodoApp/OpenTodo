package httpapi

import (
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/assistant"
)

// ageConsent makes every stored consent name an older disclosure, as one
// accepted before assistant-disclosure-accuracy did.
func ageConsent(t *testing.T, e *env, version int) {
	t.Helper()
	if _, err := e.sync.DB().Exec(`UPDATE assistant_consent SET disclosure_version = ?`, version); err != nil {
		t.Fatal(err)
	}
}

// assistant-disclosure-notice 1.2: an older consent sees the notice once,
// Got it hides it for every device, a current consent never sees it.
func TestDisclosureNoticeRoute(t *testing.T) {
	e, _, _ := assistantEnv(t)
	anon := newClientFor(e)
	if resp, out := anon.do("POST", "/api/v1/me/assistant/disclosure-seen", nil); resp.StatusCode != 401 {
		t.Fatalf("anonymous: %d %v", resp.StatusCode, out)
	}
	e.enableAssistant(nil)
	// No consent on record: nothing to attach Got it to.
	resp, out := e.do("POST", "/api/v1/me/assistant/disclosure-seen", nil)
	if resp.StatusCode != 409 || errCode(out) != "consent_required" {
		t.Fatalf("without consent: %d %v", resp.StatusCode, out)
	}
	out = e.consentAssistant("anthropic")
	if out["disclosure_notice"] != false {
		t.Fatalf("current consent: %v", out)
	}
	ageConsent(t, e, 2)
	resp, out = e.do("GET", "/api/v1/me/assistant", nil)
	e.mustStatus(resp, 200, out)
	if out["disclosure_notice"] != true || out["consented"] != true {
		t.Fatalf("older consent: %v", out)
	}
	// The assistant keeps working while the notice is shown.
	if code, _, events := e.turn(ask("what is due today?")); code != 200 || len(named(events, "done")) != 1 {
		t.Fatalf("turn with the notice: %d %v", code, events)
	}
	// A read token cannot dismiss it for the person.
	secret := e.token("read")
	bc := e.bearerClient()
	if resp, out := bc.do("POST", "/api/v1/me/assistant/disclosure-seen", nil, "Authorization", "Bearer "+secret); resp.StatusCode != 403 {
		t.Fatalf("read token: %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("POST", "/api/v1/me/assistant/disclosure-seen", nil)
	e.mustStatus(resp, 200, out)
	c := out["consent"].(map[string]any)
	if out["disclosure_notice"] != false || c["seen_version"].(float64) != assistant.DisclosureVersion || c["disclosure_version"].(float64) != 2 || out["consented"] != true {
		t.Fatalf("after Got it: %v", out)
	}
	// Another device reads the same status.
	resp, out = e.do("GET", "/api/v1/me/assistant", nil)
	e.mustStatus(resp, 200, out)
	if out["disclosure_notice"] != false {
		t.Fatalf("refreshed: %v", out)
	}
	// Turning off and accepting again names the current list: no notice.
	resp, out = e.do("PUT", "/api/v1/me/assistant", map[string]any{"consent": false})
	e.mustStatus(resp, 200, out)
	out = e.consentAssistant("anthropic")
	if out["disclosure_notice"] != false {
		t.Fatalf("new consent: %v", out)
	}
}

// The on-device consent of an encrypted account gets the same notice.
func TestDisclosureNoticeOnDevice(t *testing.T) {
	e, _, _ := assistantEnv(t)
	resp, out := e.do("PUT", "/api/v1/settings/assistant", deviceSettings(true, []string{"anthropic"}, nil))
	e.mustStatus(resp, 200, out)
	m := newClientAt(e, "10.0.0.9")
	resp, out = m.do("POST", "/api/v1/auth/register", map[string]string{"email": "m@example.com", "name": "M", "password": "correct horse battery"})
	m.mustStatus(resp, 201, out)
	resp, out = m.do("PUT", "/api/v1/encryption/keys", keyRecord(1, 1))
	m.mustStatus(resp, 201, out)
	m.consentAssistant("device:anthropic")
	ageConsent(t, e, 3)
	resp, out = m.do("GET", "/api/v1/me/assistant", nil)
	m.mustStatus(resp, 200, out)
	if out["disclosure_notice"] != true || out["device"].(map[string]any)["consented_provider"] != "anthropic" {
		t.Fatalf("older device consent: %v", out)
	}
	resp, out = m.do("POST", "/api/v1/me/assistant/disclosure-seen", nil)
	m.mustStatus(resp, 200, out)
	if out["disclosure_notice"] != false || out["device"].(map[string]any)["consented_provider"] != "anthropic" {
		t.Fatalf("after Got it: %v", out)
	}
}
