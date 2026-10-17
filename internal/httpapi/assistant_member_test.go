package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/pixari/opentodo/internal/assistant"
)

// Tests of the member's own provider (OpenSpec change
// `assistant-member-provider`) through the real HTTP stack, against httptest
// fakes of the Anthropic Messages API and of the Chat Completions endpoints of
// OpenAI and Gemini. No test contacts a real provider.

const (
	memberOpenAIKey = "sk-member-OPENAI-KEY-4242"
	memberGeminiKey = "AIza-member-GEMINI-KEY-9191"
)

// fakeChat is a Chat Completions endpoint that answers every request with a
// short text and records the key and model it was sent.
type fakeChat struct {
	srv    *httptest.Server
	mu     sync.Mutex
	hits   atomic.Int32
	keys   []string
	models []string
	status int
}

func newFakeChat(t *testing.T) *fakeChat {
	f := &fakeChat{}
	f.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.hits.Add(1)
		raw, _ := io.ReadAll(r.Body)
		var body map[string]any
		_ = json.Unmarshal(raw, &body)
		f.mu.Lock()
		f.keys = append(f.keys, strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
		model, _ := body["model"].(string)
		f.models = append(f.models, model)
		status := f.status
		f.mu.Unlock()
		if status != 0 {
			w.WriteHeader(status)
			fmt.Fprint(w, `{"error":{"type":"invalid_api_key","message":"bad key"}}`)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		chunk := func(v any) {
			b, _ := json.Marshal(v)
			fmt.Fprintf(w, "data: %s\n\n", b)
		}
		chunk(map[string]any{"choices": []any{map[string]any{"index": 0, "delta": map[string]any{"content": "OK from chat."}}}})
		chunk(map[string]any{"choices": []any{map[string]any{"index": 0, "delta": map[string]any{}, "finish_reason": "stop"}}})
		chunk(map[string]any{"choices": []any{}, "usage": map[string]any{"prompt_tokens": 400, "completion_tokens": 100}})
		fmt.Fprint(w, "data: [DONE]\n\n")
	}))
	t.Cleanup(f.srv.Close)
	return f
}

func (f *fakeChat) last() (key, model string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.keys) == 0 {
		return "", ""
	}
	return f.keys[len(f.keys)-1], f.models[len(f.models)-1]
}

type ownProviderEnv struct {
	owner, member *env
	anthropic     *fakeLLM
	openai        *fakeChat
	gemini        *fakeChat
	svc           *assistant.Service
	logs          *syncBuffer
}

type syncBuffer struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (s *syncBuffer) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.b.Write(p)
}

func (s *syncBuffer) String() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.b.String()
}

func withLogger(l *slog.Logger) Option { return func(s *Server) { s.log = l } }

// newOwnProviderEnv: an owner on Anthropic with member keys allowed (unless
// allow is false) and a registered member; all three hosts are fakes.
func newOwnProviderEnv(t *testing.T, extra map[string]any) *ownProviderEnv {
	t.Helper()
	me := &ownProviderEnv{anthropic: newFakeLLM(t), openai: newFakeChat(t), gemini: newFakeChat(t), logs: &syncBuffer{}}
	me.owner = newEnvWith(t, true, withLogger(slog.New(slog.NewTextHandler(me.logs, &slog.HandlerOptions{Level: slog.LevelDebug}))),
		WithAssistantSetup(func(s *assistant.Service) {
			s.AnthropicBaseURL = me.anthropic.srv.URL
			s.OpenAIBaseURL = me.openai.srv.URL + "/v1"
			s.GeminiBaseURL = me.gemini.srv.URL + "/v1beta/openai"
			s.Fixed = me.anthropic.srv.Client()
			me.svc = s
		}))
	resp, out := me.owner.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"})
	me.owner.mustStatus(resp, 201, out)
	settings := map[string]any{"allow_member_keys": true}
	for k, v := range extra {
		settings[k] = v
	}
	me.owner.enableAssistant(settings)
	me.member = newClientAt(me.owner, "10.0.0.21")
	resp, out = me.member.do("POST", "/api/v1/auth/register", map[string]string{"email": "member@example.com", "name": "Member", "password": "correct horse battery"})
	me.member.mustStatus(resp, 201, out)
	return me
}

func (me *ownProviderEnv) chooseOpenAI(t *testing.T) map[string]any {
	t.Helper()
	resp, out := me.member.do("PUT", "/api/v1/me/assistant", map[string]any{"own_provider": "openai", "own_model": "gpt-member-1", "own_key": memberOpenAIKey})
	me.member.mustStatus(resp, 200, out)
	return out
}

func (me *ownProviderEnv) setOwner(t *testing.T, body map[string]any) {
	t.Helper()
	resp, out := me.owner.do("PUT", "/api/v1/settings/assistant", body)
	me.owner.mustStatus(resp, 200, out)
}

// TestMemberProviderResolution is the resolution matrix: the member's own
// provider only while member keys are allowed and the key is set; otherwise
// the owner's provider; the choice is kept while the owner disallows it.
func TestMemberProviderResolution(t *testing.T) {
	me := newOwnProviderEnv(t, nil)
	// Before any choice: the server's assistant.
	resp, out := me.member.do("GET", "/api/v1/me/assistant", nil)
	me.member.mustStatus(resp, 200, out)
	if out["source"] != "server" || out["provider"] != "anthropic" || out["own_provider"] != nil || out["cap_member_keys"] != false {
		t.Fatalf("before: %v", out)
	}
	out = me.chooseOpenAI(t)
	own := out["own_provider"].(map[string]any)
	if out["source"] != "own" || out["provider"] != "openai" || out["provider_label"] != "OpenAI" || out["model"] != "gpt-member-1" ||
		own["key_set"] != true || out["own_key_in_use"] != true || out["server_provider"] != "anthropic" || out["consented"] != false {
		t.Fatalf("after choosing: %v", out)
	}
	raw, _ := json.Marshal(out)
	if strings.Contains(string(raw), memberOpenAIKey) {
		t.Fatal("the member's key was returned")
	}
	// Consent names the member's provider: a disclosure for the owner's is stale.
	resp, out = me.member.do("PUT", "/api/v1/me/assistant", map[string]any{"consent": true, "provider": "anthropic"})
	if resp.StatusCode != 409 || errCode(out) != "provider_changed" {
		t.Fatalf("stale consent: %d %v", resp.StatusCode, out)
	}
	me.member.consentAssistant("openai")
	code, body, events := me.member.turn(ask("what is due today?"))
	if code != 200 || len(named(events, "done")) != 1 {
		t.Fatalf("turn: %d %v %v", code, body, events)
	}
	if key, model := me.openai.last(); key != memberOpenAIKey || model != "gpt-member-1" {
		t.Fatalf("openai got key %q model %q", key, model)
	}
	if me.anthropic.hits.Load() != 0 || me.gemini.hits.Load() != 0 {
		t.Fatal("another provider was contacted")
	}
	if u := named(events, "usage"); len(u) != 1 || u[0].data["own_key"] != true || u[0].data["cap"].(float64) != 0 {
		t.Fatalf("usage event %v", u)
	}
	// The owner's own turns still go to Anthropic with the operator key.
	me.owner.consentAssistant("anthropic")
	if code, _, _ := me.owner.turn(ask("hi")); code != 200 || me.anthropic.keys[len(me.anthropic.keys)-1] != fakeKey {
		t.Fatalf("owner turn: %d", code)
	}

	// The owner disallows member keys: the choice is kept but ignored, and
	// the member must accept a disclosure naming the owner's provider.
	me.setOwner(t, map[string]any{"allow_member_keys": false})
	resp, out = me.member.do("GET", "/api/v1/me/assistant", nil)
	me.member.mustStatus(resp, 200, out)
	if out["source"] != "server" || out["provider"] != "anthropic" || out["consented"] != false || out["own_provider"] == nil {
		t.Fatalf("disallowed: %v", out)
	}
	hits := me.openai.hits.Load()
	if code, body, _ := me.member.turn(ask("hi")); code != 403 || errCode(body) != "consent_required" {
		t.Fatalf("turn after disallow: %d %v", code, body)
	}
	me.member.consentAssistant("anthropic")
	if code, _, _ := me.member.turn(ask("hi")); code != 200 || me.anthropic.keys[len(me.anthropic.keys)-1] != fakeKey {
		t.Fatalf("server turn: %d", code)
	}
	if me.openai.hits.Load() != hits {
		t.Fatal("the member's provider was used although the owner disallowed member keys")
	}
	// Choosing or storing keys is refused now; removing is not.
	resp, out = me.member.do("PUT", "/api/v1/me/assistant", map[string]any{"own_provider": "gemini", "own_model": "gemini-x", "own_key": memberGeminiKey})
	if resp.StatusCode != 403 || errCode(out) != "forbidden" {
		t.Fatalf("choose while disallowed: %d %v", resp.StatusCode, out)
	}
	// Allowed again: the kept choice is back in effect (after consent).
	me.setOwner(t, map[string]any{"allow_member_keys": true})
	resp, out = me.member.do("GET", "/api/v1/me/assistant", nil)
	me.member.mustStatus(resp, 200, out)
	if out["source"] != "own" || out["provider"] != "openai" || out["consented"] != false {
		t.Fatalf("allowed again: %v", out)
	}
	// Switching provider asks again; Gemini then gets the member's key.
	resp, out = me.member.do("PUT", "/api/v1/me/assistant", map[string]any{"own_provider": "gemini", "own_model": "gemini-2.5-flash", "own_key": memberGeminiKey})
	me.member.mustStatus(resp, 200, out)
	if out["provider"] != "gemini" || out["consented"] != false {
		t.Fatalf("switched: %v", out)
	}
	// Leaving OpenAI removed the key stored for it.
	sec, _ := me.svc.Store.Secrets()
	mid := userIDOf(t, me.member)
	if sec.Has(assistant.UserKey(mid, "openai")) || !sec.Has(assistant.UserKey(mid, "gemini")) {
		t.Fatal("switching provider kept the old key or lost the new one")
	}
	me.member.consentAssistant("gemini")
	if code, _, _ := me.member.turn(ask("hi")); code != 200 {
		t.Fatalf("gemini turn: %d", code)
	}
	if key, model := me.gemini.last(); key != memberGeminiKey || model != "gemini-2.5-flash" {
		t.Fatalf("gemini got %q %q", key, model)
	}
	// Back to the server's assistant: the chosen provider's key is removed.
	resp, out = me.member.do("PUT", "/api/v1/me/assistant", map[string]any{"own_provider": ""})
	me.member.mustStatus(resp, 200, out)
	if out["source"] != "server" || out["own_provider"] != nil || out["provider"] != "anthropic" {
		t.Fatalf("back to server: %v", out)
	}
	sec, _ = me.svc.Store.Secrets()
	if sec.Has(assistant.UserKey(mid, "gemini")) {
		t.Fatal("the gemini key survived going back to the server's assistant")
	}
	// The member's provider choice is audited by name, never a key.
	resp, out = me.owner.do("GET", "/api/v1/audit?limit=200", nil)
	me.owner.mustStatus(resp, 200, out)
	if a := fmt.Sprint(out); !strings.Contains(a, "assistant.own_provider") || !strings.Contains(a, "assistant.own_key.gemini") {
		t.Fatalf("audit %v", out)
	}
	for _, needle := range []string{memberOpenAIKey, memberGeminiKey} {
		if n := dbContains(t, me.owner, needle); n != "" {
			t.Fatalf("a member key is stored in %s", n)
		}
		if strings.Contains(me.logs.String(), needle) {
			t.Fatal("a member key reached the server log")
		}
	}
}

// TestMemberProviderValidation: the compatible endpoint, unknown providers,
// bad model ids and a missing key are refused and store nothing.
func TestMemberProviderValidation(t *testing.T) {
	me := newOwnProviderEnv(t, nil)
	long := strings.Repeat("a", 101)
	for _, c := range []struct {
		body  map[string]any
		field string
	}{
		{map[string]any{"own_provider": "compatible", "own_model": "llama", "own_key": "k"}, "own_provider"},
		{map[string]any{"own_provider": "skynet", "own_model": "x", "own_key": "k"}, "own_provider"},
		{map[string]any{"own_provider": "openai", "own_model": "", "own_key": "k"}, "own_model"},
		{map[string]any{"own_provider": "openai", "own_model": long, "own_key": "k"}, "own_model"},
		{map[string]any{"own_provider": "openai", "own_model": "gpt 4", "own_key": "k"}, "own_model"},
		{map[string]any{"own_provider": "gemini", "own_model": "models/gemini", "own_key": "k"}, "own_model"},
		{map[string]any{"own_provider": "anthropic", "own_model": "claude-custom", "own_key": "k"}, "own_model"},
		{map[string]any{"own_provider": "openai", "own_model": "gpt-x"}, "own_key"},
		{map[string]any{"own_model": "gpt-x"}, "own_model"},
		{map[string]any{"own_provider": "openai", "own_model": "gpt-x", "base_url": "http://10.0.0.1"}, "base_url"},
	} {
		resp, out := me.member.do("PUT", "/api/v1/me/assistant", c.body)
		if resp.StatusCode != 400 || errCode(out) != "invalid_input" || !strings.Contains(fmt.Sprint(out), c.field) {
			t.Fatalf("%v: %d %v", c.body, resp.StatusCode, out)
		}
	}
	mid := userIDOf(t, me.member)
	if c, _ := me.svc.Store.MemberChoice(context.Background(), mid); c != nil {
		t.Fatalf("a refused choice was stored: %+v", c)
	}
	sec, _ := me.svc.Store.Secrets()
	for _, p := range assistant.ProviderNames {
		if sec.Has(assistant.UserKey(mid, p)) {
			t.Fatalf("a refused request stored a %s key", p)
		}
	}
	// Valid ids: OpenAI fine-tune style and an offered Anthropic model.
	for _, body := range []map[string]any{
		{"own_provider": "openai", "own_model": "ft:gpt-4o-mini:org:custom_1.2", "own_key": memberOpenAIKey},
		{"own_provider": "anthropic", "own_model": "claude-haiku-5-5", "own_key": "sk-ant-member"},
		{"own_model": "claude-sonnet-5-5"},
	} {
		resp, out := me.member.do("PUT", "/api/v1/me/assistant", body)
		me.member.mustStatus(resp, 200, out)
	}
	if c, _ := me.svc.Store.MemberChoice(context.Background(), mid); c == nil || c.Provider != "anthropic" || c.Model != "claude-sonnet-5-5" {
		t.Fatalf("choice %+v", c)
	}
	// Auth: anonymous 401, a read token 403.
	resp, out := newClientFor(me.owner).do("PUT", "/api/v1/me/assistant", map[string]any{"own_provider": "openai"})
	if resp.StatusCode != 401 {
		t.Fatalf("anonymous: %d %v", resp.StatusCode, out)
	}
	read := me.member.token("read")
	resp, out = me.member.bearerClient().do("PUT", "/api/v1/me/assistant", map[string]any{"own_provider": "openai", "own_model": "gpt-x", "own_key": "k"}, "Authorization", "Bearer "+read)
	if resp.StatusCode != 403 {
		t.Fatalf("read token: %d %v", resp.StatusCode, out)
	}
	// Removing the key of the chosen provider goes back to the server's assistant.
	resp, out = me.member.do("PUT", "/api/v1/me/assistant", map[string]any{"own_key": ""})
	me.member.mustStatus(resp, 200, out)
	if out["source"] != "server" || out["own_provider"] != nil {
		t.Fatalf("after removing the key: %v", out)
	}
}

// TestMemberKeyCap: turns on a member's own key are outside the monthly cap
// unless the owner turns on cap_member_keys; concurrency limits still apply.
func TestMemberKeyCap(t *testing.T) {
	me := newOwnProviderEnv(t, map[string]any{"monthly_token_cap_per_user": 1000})
	me.chooseOpenAI(t)
	me.member.consentAssistant("openai")
	mid := userIDOf(t, me.member)
	// The member already used the whole allowance on the server's key.
	if err := me.svc.Store.AddUsage(context.Background(), mid, 900, 100, false); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 3; i++ {
		if code, body, _ := me.member.turn(ask("hi")); code != 200 {
			t.Fatalf("own-key turn %d at the cap: %d %v", i, code, body)
		}
	}
	resp, out := me.member.do("GET", "/api/v1/me/assistant/usage", nil)
	me.member.mustStatus(resp, 200, out)
	own := out["own_key"].(map[string]any)
	if out["total_tokens"].(float64) != 2500 || out["counted_tokens"].(float64) != 1000 || own["total_tokens"].(float64) != 1500 || own["turns"].(float64) != 3 || out["cap_member_keys"] != false {
		t.Fatalf("usage %v", out)
	}
	// The owner counts member keys: the member is over the cap.
	me.setOwner(t, map[string]any{"cap_member_keys": true})
	hits := me.openai.hits.Load()
	if code, body, _ := me.member.turn(ask("hi")); code != 429 || errCode(body) != "assistant_quota" {
		t.Fatalf("capped own-key turn: %d %v", code, body)
	}
	if me.openai.hits.Load() != hits {
		t.Fatal("a capped turn reached the provider")
	}
	resp, out = me.member.do("GET", "/api/v1/me/assistant/usage", nil)
	me.member.mustStatus(resp, 200, out)
	if out["counted_tokens"].(float64) != 2500 || out["cap_member_keys"] != true {
		t.Fatalf("usage with cap_member_keys %v", out)
	}
	// Owner view and audit carry the switch; the owner sees one member on their own key.
	resp, out = me.owner.do("GET", "/api/v1/settings/assistant", nil)
	me.owner.mustStatus(resp, 200, out)
	if out["cap_member_keys"] != true || out["own_key_members"].(float64) != 1 {
		t.Fatalf("owner view %v", out)
	}
	resp, out = me.owner.do("GET", "/api/v1/audit?limit=100", nil)
	me.owner.mustStatus(resp, 200, out)
	if !strings.Contains(fmt.Sprint(out), "assistant.cap_member_keys") {
		t.Fatalf("audit %v", out)
	}
	// Concurrency limits apply to own-key turns too.
	me.setOwner(t, map[string]any{"cap_member_keys": false})
	release, err := me.svc.Acquire(mid)
	if err != nil {
		t.Fatal(err)
	}
	if code, body, _ := me.member.turn(ask("hi")); code != 409 || errCode(body) != "turn_in_progress" {
		t.Fatalf("own-key turn while one runs: %d %v", code, body)
	}
	release()
}

// TestLegacyOwnKeyStillWorks: a key stored for the owner's provider before
// this change (no provider choice) is still used, and counts as the member's
// own key for the cap.
func TestLegacyOwnKeyStillWorks(t *testing.T) {
	me := newOwnProviderEnv(t, map[string]any{"monthly_token_cap_per_user": 100})
	resp, out := me.member.do("PUT", "/api/v1/me/assistant", map[string]any{"own_key": "sk-ant-LEGACY-OWN"})
	me.member.mustStatus(resp, 200, out)
	if out["source"] != "server" || out["own_key_in_use"] != true || out["own_key_set"] != true || out["server_own_key_set"] != true || out["own_provider"] != nil {
		t.Fatalf("legacy key: %v", out)
	}
	me.member.consentAssistant("anthropic")
	mid := userIDOf(t, me.member)
	_ = me.svc.Store.AddUsage(context.Background(), mid, 100, 0, false)
	if code, body, _ := me.member.turn(ask("hi")); code != 200 {
		t.Fatalf("legacy own-key turn: %d %v", code, body)
	}
	if k := me.anthropic.keys[len(me.anthropic.keys)-1]; k != "sk-ant-LEGACY-OWN" {
		t.Fatalf("key used %q", k)
	}
}

// TestMemberConnectionTest: session only, member keys allowed, a provider
// chosen on screen or saved, rate limited; a rejected key names the member's
// own key.
func TestMemberConnectionTest(t *testing.T) {
	me := newOwnProviderEnv(t, nil)
	resp, out := me.member.do("POST", "/api/v1/me/assistant/test", nil)
	if resp.StatusCode != 400 || errCode(out) != "invalid_input" {
		t.Fatalf("without a choice: %d %v", resp.StatusCode, out)
	}
	me.chooseOpenAI(t)
	resp, out = me.member.do("POST", "/api/v1/me/assistant/test", nil)
	me.member.mustStatus(resp, 200, out)
	if out["ok"] != true {
		t.Fatalf("test: %v", out)
	}
	if key, _ := me.openai.last(); key != memberOpenAIKey {
		t.Fatalf("test used key %q", key)
	}
	me.openai.mu.Lock()
	me.openai.status = 401
	me.openai.mu.Unlock()
	resp, out = me.member.do("POST", "/api/v1/me/assistant/test", nil)
	me.member.mustStatus(resp, 200, out)
	if out["ok"] != false || out["code"] != "provider_auth" || !strings.Contains(out["message"].(string), "your API key") {
		t.Fatalf("bad key: %v", out)
	}
	// Tokens cannot run it; anonymous is 401.
	full := me.member.token("full")
	resp, out = me.member.bearerClient().do("POST", "/api/v1/me/assistant/test", nil, "Authorization", "Bearer "+full)
	if resp.StatusCode != 403 || errCode(out) != "session_required" {
		t.Fatalf("token: %d %v", resp.StatusCode, out)
	}
	resp, _ = newClientFor(me.owner).do("POST", "/api/v1/me/assistant/test", nil)
	if resp.StatusCode != 401 {
		t.Fatalf("anonymous: %d", resp.StatusCode)
	}
	// Rate limit: 5 per 10 minutes per account (3 used above).
	for i := 0; i < 2; i++ {
		resp, out = me.member.do("POST", "/api/v1/me/assistant/test", nil)
		me.member.mustStatus(resp, 200, out)
	}
	resp, out = me.member.do("POST", "/api/v1/me/assistant/test", nil)
	if resp.StatusCode != 429 || errCode(out) != "rate_limited" || resp.Header.Get("Retry-After") == "" {
		t.Fatalf("rate limit: %d %v", resp.StatusCode, out)
	}
	// Disallowed member keys: 403.
	me.setOwner(t, map[string]any{"allow_member_keys": false})
	resp, out = me.member.do("POST", "/api/v1/me/assistant/test", nil)
	if resp.StatusCode != 403 {
		t.Fatalf("disallowed: %d %v", resp.StatusCode, out)
	}
}

// TestMemberKeysNotInBackupsOrExport: the DB snapshot and the export never
// hold a member's key; the secrets file does (0600).
func TestMemberKeysNotInExport(t *testing.T) {
	me := newOwnProviderEnv(t, nil)
	me.chooseOpenAI(t)
	req, _ := http.NewRequest("GET", me.member.srv.URL+"/api/v1/export", nil)
	req.Header.Set("X-Forwarded-For", me.member.ip)
	r, err := me.member.client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	exp, _ := io.ReadAll(r.Body)
	r.Body.Close()
	if r.StatusCode != 200 || strings.Contains(string(exp), memberOpenAIKey) {
		t.Fatalf("export %d holds the key: %v", r.StatusCode, strings.Contains(string(exp), memberOpenAIKey))
	}
	raw, err := os.ReadFile(me.svc.Store.SecretsPath())
	if err != nil || !strings.Contains(string(raw), "user:") {
		t.Fatalf("secrets file %v", err)
	}
	if n := dbContains(t, me.owner, memberOpenAIKey); n != "" {
		t.Fatalf("the key is stored in %s", n)
	}
}
