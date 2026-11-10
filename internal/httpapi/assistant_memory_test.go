package httpapi

import (
	"encoding/json"
	"slices"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/assistant"
)

// assistant-memory 2.3 ("Told once"): a consent to the disclosure before memory
// keeps counting; the person is told once, the assistant keeps working, Got it
// hides it for every device, and a new consent names memory.
func TestMemoryNotice(t *testing.T) {
	e, llm, _ := assistantEnv(t)
	e.enableAssistant(nil)
	out := e.consentAssistant("anthropic")
	if out["memory_notice"] != false || !slices.Contains(toStrings(out["fields"]), "your memory items, with every message") {
		t.Fatalf("current consent: %v", out)
	}
	ageConsent(t, e, assistant.MemoryDisclosureVersion-1)
	resp, out := e.do("GET", "/api/v1/me/assistant", nil)
	e.mustStatus(resp, 200, out)
	if out["memory_notice"] != true || out["disclosure_notice"] != false || out["consented"] != true {
		t.Fatalf("version 5 consent: %v", out)
	}
	// The assistant keeps working, and the turn's instructions carry the memory.
	e.syncOps("devA", rop("m1", "memory", "mem1", "text", "Does not work on Fridays", 1), rop("m2", "memory", "mem1", "position", 1, 1))
	if code, _, events := e.turn(ask("plan my week")); code != 200 || len(named(events, "done")) != 1 {
		t.Fatalf("turn with the notice: %d %v", code, events)
	}
	llm.mu.Lock()
	body, _ := json.Marshal(llm.bodies[len(llm.bodies)-1]["system"])
	llm.mu.Unlock()
	if !strings.Contains(string(body), "Does not work on Fridays") || !strings.Contains(string(body), "stated preferences") {
		t.Fatalf("system text: %s", body)
	}
	resp, out = e.do("POST", "/api/v1/me/assistant/disclosure-seen", nil)
	e.mustStatus(resp, 200, out)
	if out["memory_notice"] != false {
		t.Fatalf("after Got it: %v", out)
	}
	// A consent before the complete list hears both, once.
	ageConsent(t, e, 2)
	if _, err := e.sync.DB().Exec(`UPDATE assistant_consent SET seen_version = 0`); err != nil {
		t.Fatal(err)
	}
	_, out = e.do("GET", "/api/v1/me/assistant", nil)
	if out["memory_notice"] != true || out["disclosure_notice"] != true {
		t.Fatalf("version 2 consent: %v", out)
	}
}

// "Memory stays in the app": the export carries memory for the person's
// session and full tokens, never for read or agent tokens.
func TestExportMemoryByScope(t *testing.T) {
	e := ownerEnv(t)
	e.syncOps("devA", rop("m1", "memory", "mem1", "text", "Anna is my manager", 1), rop("m2", "memory", "mem2", "deleted_at", 5, 1))
	resp, out := e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, 200, out)
	if list, _ := out["memory"].([]any); len(list) != 2 {
		t.Fatalf("session export memory = %v", out["memory"])
	}
	bc := e.bearerClient()
	for scope, want := range map[string]bool{"full": true, "read": false, "agent": false} {
		secret := e.token(scope)
		resp, out := bc.do("GET", "/api/v1/export", nil, "Authorization", "Bearer "+secret)
		bc.mustStatus(resp, 200, out)
		if _, has := out["memory"]; has != want {
			t.Fatalf("%s token export has memory: %v", scope, has)
		}
	}
}
