package httpapi

import (
	"strings"
	"testing"
)

// TestOwnerTestUsesOnScreenValues (assistant-test-unsaved-settings): the
// owner's test uses the typed model and key without saving them, a typed key
// replaces the saved one for that request only, "" means no key, an empty
// model is refused before any request, and the key is never logged.
func TestOwnerTestUsesOnScreenValues(t *testing.T) {
	me := newOwnProviderEnv(t, nil)
	const typed = "sk-owner-TYPED-OPENAI-7777"
	resp, out := me.owner.do("POST", "/api/v1/settings/assistant/test", map[string]any{"provider": "openai", "model": "gpt-5.4-mini-2026-03-17", "key": typed})
	me.owner.mustStatus(resp, 200, out)
	if out["ok"] != true {
		t.Fatalf("unsaved model and key: %v", out)
	}
	if key, model := me.openai.last(); key != typed || model != "gpt-5.4-mini-2026-03-17" {
		t.Fatalf("sent key %q model %q", key, model)
	}
	resp, out = me.owner.do("GET", "/api/v1/settings/assistant", nil)
	me.owner.mustStatus(resp, 200, out)
	openai := out["providers"].(map[string]any)["openai"].(map[string]any)
	if openai["model"] != "" || openai["key_set"] != false {
		t.Fatalf("a test must not save: %v", openai)
	}
	if strings.Contains(me.logs.String(), typed) {
		t.Fatal("the typed key reached the log")
	}

	// A saved key is used until another is typed; the typed one is not kept.
	me.setOwner(t, map[string]any{"enabled": true, "default_provider": "anthropic", "allow_member_keys": true,
		"providers": map[string]any{"anthropic": map[string]any{"enabled": true, "model": "claude-opus-5-5"}, "openai": map[string]any{"enabled": true, "model": "gpt-saved"}},
		"keys":      map[string]any{"openai": "sk-owner-SAVED"}})
	resp, out = me.owner.do("POST", "/api/v1/settings/assistant/test", map[string]any{"provider": "openai", "model": "gpt-edited"})
	me.owner.mustStatus(resp, 200, out)
	if key, model := me.openai.last(); key != "sk-owner-SAVED" || model != "gpt-edited" {
		t.Fatalf("saved key with edited model: %q %q", key, model)
	}
	resp, out = me.owner.do("POST", "/api/v1/settings/assistant/test", map[string]any{"provider": "openai", "key": "sk-owner-REPLACEMENT"})
	me.owner.mustStatus(resp, 200, out)
	if key, model := me.openai.last(); key != "sk-owner-REPLACEMENT" || model != "gpt-saved" {
		t.Fatalf("replacement key: %q %q", key, model)
	}
	resp, out = me.owner.do("POST", "/api/v1/settings/assistant/test", map[string]any{"provider": "openai"})
	me.owner.mustStatus(resp, 200, out)
	if key, _ := me.openai.last(); key != "sk-owner-SAVED" {
		t.Fatalf("saved key after a replacement test: %q", key)
	}

	// "Remove saved key" on screen: no key, no request.
	before := me.openai.hits.Load()
	resp, out = me.owner.do("POST", "/api/v1/settings/assistant/test", map[string]any{"provider": "openai", "key": ""})
	me.owner.mustStatus(resp, 200, out)
	if out["ok"] != false || out["code"] != "no_key" || me.openai.hits.Load() != before {
		t.Fatalf("removed key: %v", out)
	}
	// Empty model: 400 naming the model, no request.
	resp, out = me.owner.do("POST", "/api/v1/settings/assistant/test", map[string]any{"provider": "openai", "model": " "})
	if resp.StatusCode != 400 || errCode(out) != "invalid_input" || !strings.Contains(errMessage(out), "providers.openai.model") || me.openai.hits.Load() != before {
		t.Fatalf("empty model: %d %v", resp.StatusCode, out)
	}
}

// TestMemberTestUsesOnScreenValues (assistant-test-unsaved-settings): a
// member tests a provider they have not saved, a key saved for another
// provider is never used, and the compatible endpoint is refused.
func TestMemberTestUsesOnScreenValues(t *testing.T) {
	me := newOwnProviderEnv(t, nil)
	resp, out := me.member.do("POST", "/api/v1/me/assistant/test", map[string]any{"provider": "gemini", "model": "gemini-test-1", "key": memberGeminiKey})
	me.member.mustStatus(resp, 200, out)
	if out["ok"] != true {
		t.Fatalf("test before saving: %v", out)
	}
	if key, model := me.gemini.last(); key != memberGeminiKey || model != "gemini-test-1" {
		t.Fatalf("sent %q %q", key, model)
	}
	resp, out = me.member.do("GET", "/api/v1/me/assistant", nil)
	me.member.mustStatus(resp, 200, out)
	if out["own_provider"] != nil {
		t.Fatalf("a test must not save: %v", out["own_provider"])
	}
	if strings.Contains(me.logs.String(), memberGeminiKey) {
		t.Fatal("the typed key reached the log")
	}

	me.chooseOpenAI(t)
	before := me.anthropic.hits.Load()
	resp, out = me.member.do("POST", "/api/v1/me/assistant/test", map[string]any{"provider": "anthropic", "model": "claude-opus-5-5"})
	me.member.mustStatus(resp, 200, out)
	if out["ok"] != false || out["code"] != "no_key" || me.anthropic.hits.Load() != before {
		t.Fatalf("key saved for another provider: %v", out)
	}
	resp, out = me.member.do("POST", "/api/v1/me/assistant/test", map[string]any{"provider": "compatible", "model": "x", "key": "k"})
	if resp.StatusCode != 400 || errCode(out) != "invalid_input" {
		t.Fatalf("compatible: %d %v", resp.StatusCode, out)
	}
}
