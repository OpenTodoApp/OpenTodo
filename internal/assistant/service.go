package assistant

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Concurrency limits (design D5).
const (
	// MaxConcurrentTurns is the server-wide cap on running turns.
	MaxConcurrentTurns = 8
)

// Service ties the store, the providers and the turn limits together.
type Service struct {
	Store *Store
	Loop  *Loop
	Net   Network
	// AnthropicBaseURL and Fixed override the built-in hosts' URL and client
	// (tests point them at httptest fakes; never settings).
	AnthropicBaseURL string
	OpenAIBaseURL    string
	GeminiBaseURL    string
	Fixed            *http.Client
	// Backoff between retries of the Chat Completions adapter (tests: 1 ms).
	Backoff time.Duration

	mu       sync.Mutex
	running  map[string]bool
	inFlight int
	max      int
}

// NewService wires a service with the default limits.
func NewService(store *Store, loop *Loop) *Service {
	return &Service{Store: store, Loop: loop, running: map[string]bool{}, max: MaxConcurrentTurns}
}

// SetMaxConcurrent changes the server-wide cap (tests).
func (s *Service) SetMaxConcurrent(n int) {
	s.mu.Lock()
	s.max = n
	s.mu.Unlock()
}

// Busy reasons of Acquire.
var (
	ErrTurnInProgress = errors.New("turn_in_progress")
	ErrBusy           = errors.New("assistant_busy")
)

// Acquire reserves the user's single turn slot and one of the server-wide
// slots; release frees both.
func (s *Service) Acquire(userID string) (release func(), err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.running[userID] {
		return nil, ErrTurnInProgress
	}
	if s.inFlight >= s.max {
		return nil, ErrBusy
	}
	s.running[userID] = true
	s.inFlight++
	var once sync.Once
	return func() {
		once.Do(func() {
			s.mu.Lock()
			delete(s.running, userID)
			s.inFlight--
			s.mu.Unlock()
		})
	}, nil
}

// ErrNoKey means the provider needs a key and none is stored.
var ErrNoKey = errors.New("no_key")

// ProviderFor builds the provider of a turn on route r (see Store.Resolve).
// A member's own provider is always a built-in host on the fixed client.
func (s *Service) ProviderFor(r Route, set Settings) (Provider, error) {
	if r.Member && !IsMemberProvider(r.Provider) {
		return nil, errors.New("members cannot use this provider")
	}
	return s.provider(r.Provider, r.base, r.key, set.AllowPrivateEndpoint)
}

func (s *Service) fixed() *http.Client {
	if s.Fixed != nil {
		return s.Fixed
	}
	return FixedClient()
}

func (s *Service) provider(name string, p ProviderSettings, key string, allowPrivate bool) (Provider, error) {
	if name != Compatible && key == "" {
		return nil, ErrNoKey
	}
	switch name {
	case Anthropic:
		return &AnthropicProvider{Key: key, Model: p.Model, BaseURL: s.AnthropicBaseURL, HTTP: s.fixed(), MaxRetries: 2}, nil
	case OpenAI:
		return &ChatProvider{Name: OpenAI, BaseURL: or(s.OpenAIBaseURL, OpenAIBaseURL), Key: key, Model: p.Model, HTTP: s.fixed(), Retries: 2, Backoff: s.Backoff}, nil
	case Gemini:
		return &ChatProvider{Name: Gemini, BaseURL: or(s.GeminiBaseURL, GeminiBaseURL), Key: key, Model: p.Model, HTTP: s.fixed(), Retries: 2, Backoff: s.Backoff}, nil
	case Compatible:
		return &ChatProvider{Name: Compatible, BaseURL: p.BaseURL, Key: key, Model: p.Model, HTTP: s.Net.CompatibleClient(allowPrivate), Retries: 2, Backoff: s.Backoff}, nil
	}
	return nil, errors.New("unknown provider")
}

func or(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

// TestResult is the outcome of "Test connection".
type TestResult struct {
	OK      bool   `json:"ok"`
	Code    string `json:"code,omitempty"`
	Message string `json:"message,omitempty"`
	Status  int    `json:"status,omitempty"`
}

// pingTool is the one tool of a connection test.
var pingTool = ToolDef{Name: "ping", Description: "Answer the connection test.", Schema: map[string]any{
	"type": "object", "additionalProperties": false, "required": []string{"ok"},
	"properties": map[string]any{"ok": map[string]any{"type": "boolean"}},
}}

// TestConnection sends a minimal request with one tool to the named provider
// (owner only; with TestMember the only requests made outside a user turn).
// An endpoint that refuses the request with the tool but accepts it without
// is reported as lacking tool support (design D3).
func (s *Service) TestConnection(ctx context.Context, name string, set Settings) TestResult {
	p, ok := set.Providers[name]
	if !ok {
		return TestResult{Code: "invalid_input", Message: "unknown provider"}
	}
	if strings.TrimSpace(p.Model) == "" {
		return TestResult{Code: "invalid_input", Message: "enter a model id first"}
	}
	if name == Compatible {
		if err := s.Net.CheckBaseURL(ctx, p.BaseURL, set.AllowPrivateEndpoint); err != nil {
			if errors.Is(err, ErrPrivateTarget) {
				return TestResult{Code: "private_target", Message: "the base URL resolves to a private network address; allow private endpoints to use a server on your network"}
			}
			return TestResult{Code: "invalid_input", Message: err.Error()}
		}
	}
	key, _, err := s.Store.KeyFor("", name, Settings{})
	if err != nil {
		return TestResult{Code: "internal", Message: "the key file could not be read"}
	}
	prov, err := s.provider(name, p, key, set.AllowPrivateEndpoint)
	if errors.Is(err, ErrNoKey) {
		return TestResult{Code: "no_key", Message: "save an API key for this provider first"}
	}
	if err != nil {
		return TestResult{Code: "internal", Message: err.Error()}
	}
	return s.test(ctx, prov)
}

// TestMember is a member's "Test connection" of their own provider, model and
// key (assistant-member-provider): only for a route on the member's own
// provider, so it only ever reaches a built-in host.
func (s *Service) TestMember(ctx context.Context, r Route, set Settings) TestResult {
	if !r.Member {
		return TestResult{Code: "invalid_input", Message: "choose your own provider and save your key first"}
	}
	prov, err := s.ProviderFor(r, set)
	if errors.Is(err, ErrNoKey) {
		return TestResult{Code: "no_key", Message: "save your API key first"}
	}
	if err != nil {
		return TestResult{Code: "internal", Message: err.Error()}
	}
	res := s.test(ctx, prov)
	if res.Code == CodeProviderAuth {
		res.Message = ownKeyRejected
	}
	return res
}

// ownKeyRejected replaces the provider_auth message on a member's own key.
const ownKeyRejected = "the provider rejected your API key; check it in Settings → AI → Assistant"

// OwnKeyRejected is the provider_auth message for a turn on the user's own key.
func OwnKeyRejected() string { return ownKeyRejected }

func (s *Service) test(ctx context.Context, prov Provider) TestResult {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	run := func(tools []ToolDef) error {
		conv := prov.Start(Request{System: "Connection test. Reply with OK.", Messages: []Message{{Role: "user", Text: "Reply with OK."}}, Tools: tools, MaxTokens: 64})
		_, err := conv.Next(ctx, func(string) {})
		return err
	}
	err := run([]ToolDef{pingTool})
	if err == nil {
		return TestResult{OK: true, Message: "Connected. The endpoint accepts tool definitions."}
	}
	pe, ok := AsProviderError(err)
	if !ok {
		return TestResult{Code: CodeProviderError, Message: "the provider could not be reached"}
	}
	if pe.Code == CodeProviderError && pe.Status >= 400 && pe.Status < 500 && pe.Status != 404 {
		if run(nil) == nil {
			return TestResult{Code: CodeNoToolSupport, Status: pe.Status, Message: "the endpoint answers, but it rejects tool definitions: this model or server does not support tool use, which the assistant needs"}
		}
	}
	return TestResult{Code: pe.Code, Status: pe.Status, Message: pe.Msg}
}
