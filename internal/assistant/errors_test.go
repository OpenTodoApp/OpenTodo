package assistant

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// Provider error vectors (assistant-providers-fix D5): status and body of a
// failed Chat Completions request → code and type, shared with the device's
// classifier in web/src/lib/assistantDevice/providers.ts.

type errorVector struct {
	Name     string `json:"name"`
	Provider string `json:"provider"`
	Status   int    `json:"status"`
	Body     string `json:"body"`
	Code     string `json:"code"`
	Type     string `json:"type"`
	// Hint is true when the not-found message also asks to check the base URL.
	Hint bool `json:"hint"`
}

const (
	googleBadKey   = `[{"error":{"code":400,"message":"Please pass a valid API key","status":"INVALID_ARGUMENT"}}]`
	googleNotFound = `[{"error":{"code":404,"message":"models/gemini-nope is not found for API version v1main, or is not supported for generateContent.","status":"NOT_FOUND"}}]`
)

var errorVectors = []errorVector{
	{Name: "Google invalid key (array, 400 INVALID_ARGUMENT)", Provider: Gemini, Status: 400, Body: googleBadKey, Code: CodeProviderAuth, Type: "INVALID_ARGUMENT"},
	{Name: "Google invalid key with the API_KEY_INVALID reason", Provider: Gemini, Status: 400, Body: `[{"error":{"code":400,"message":"API key not valid.","status":"INVALID_ARGUMENT","details":[{"@type":"type.googleapis.com/google.rpc.ErrorInfo","reason":"API_KEY_INVALID"}]}}]`, Code: CodeProviderAuth, Type: "INVALID_ARGUMENT"},
	{Name: "Google unknown model (array, 404 NOT_FOUND)", Provider: Gemini, Status: 404, Body: googleNotFound, Code: CodeProviderNotFound, Type: "NOT_FOUND"},
	{Name: "Google wrong path (404, empty body)", Provider: Gemini, Status: 404, Body: "", Code: CodeProviderNotFound},
	{Name: "OpenAI invalid_api_key object (401)", Provider: OpenAI, Status: 401, Body: `{"error":{"message":"Incorrect API key provided: sk-abc.","type":"invalid_request_error","param":null,"code":"invalid_api_key"}}`, Code: CodeProviderAuth, Type: "invalid_request_error"},
	{Name: "OpenAI invalid_api_key with a 400", Provider: OpenAI, Status: 400, Body: `{"error":{"message":"Incorrect API key provided.","code":"invalid_api_key"}}`, Code: CodeProviderAuth, Type: "invalid_api_key"},
	{Name: "Compatible 404 with an empty body", Provider: Compatible, Status: 404, Body: "", Code: CodeProviderNotFound, Hint: true},
	{Name: "Rate limited", Provider: OpenAI, Status: 429, Body: `{"error":{"type":"rate_limit_exceeded","message":"slow down"}}`, Code: CodeProviderRateLimited, Type: "rate_limit_exceeded"},
	{Name: "Provider problem", Provider: Gemini, Status: 503, Body: `[{"error":{"code":503,"message":"The model is overloaded.","status":"UNAVAILABLE"}}]`, Code: CodeProviderError, Type: "UNAVAILABLE"},
	{Name: "Plain 400 schema refusal", Provider: Compatible, Status: 400, Body: `{"error":{"type":"invalid_request_error","message":"tools are not supported"}}`, Code: CodeProviderError, Type: "invalid_request_error"},
	{Name: "Google schema refusal is not a key problem", Provider: Gemini, Status: 400, Body: `[{"error":{"code":400,"message":"Invalid JSON payload received. Unknown name \"type\"","status":"INVALID_ARGUMENT"}}]`, Code: CodeProviderError, Type: "INVALID_ARGUMENT"},
	{Name: "Body that is not JSON", Provider: Compatible, Status: 400, Body: "<html>Bad Request</html>", Code: CodeProviderError},
}

func TestDeviceErrorVectors(t *testing.T) {
	for _, v := range errorVectors {
		got := chatError(v.Provider, v.Status, []byte(v.Body))
		if got.Code != v.Code || got.Type != v.Type || got.Status != v.Status {
			t.Errorf("%s: got %s/%q/%d, want %s/%q", v.Name, got.Code, got.Type, got.Status, v.Code, v.Type)
		}
		if hint := strings.Contains(got.Msg, "base URL"); hint != v.Hint {
			t.Errorf("%s: base URL hint %v, want %v (%q)", v.Name, hint, v.Hint, got.Msg)
		}
		for _, leak := range []string{"Please pass", "Incorrect API key", "sk-abc", "is not found", "slow down"} {
			if strings.Contains(got.Error(), leak) {
				t.Errorf("%s: the provider's text reached the error: %q", v.Name, got.Error())
			}
		}
	}
	checkFile(t, "errors.vectors.json", errorVectors)
}

func TestProviderErrorBodyIsBounded(t *testing.T) {
	long := `{"error":{"type":"` + strings.Repeat("x", 200) + `"}}`
	if typ, _ := readChatError([]byte(long)); len(typ) > 64 {
		t.Fatalf("type not clipped: %d", len(typ))
	}
	if typ, bad := readChatError([]byte(`[]`)); typ != "" || bad {
		t.Fatal("empty array")
	}
}

// fakeGemini answers every request with status and body and counts them.
func fakeGemini(t *testing.T, status int, body string) (*Service, *atomic.Int32) {
	t.Helper()
	var n atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n.Add(1)
		w.WriteHeader(status)
		_, _ = io.WriteString(w, body)
	}))
	t.Cleanup(srv.Close)
	svc := NewService(newTestStore(t), nil)
	svc.GeminiBaseURL, svc.Fixed, svc.Backoff = srv.URL, srv.Client(), time.Millisecond
	return svc, &n
}

func geminiSettings() Settings {
	s := Defaults()
	s.Enabled = true
	s.DefaultProvider = Gemini
	s.Providers[Gemini] = ProviderSettings{Enabled: true, Model: "gemini-x"}
	return s
}

// TestTestConnectionGeminiBadKey: Google's 400 for a wrong key reads as a
// rejected key after one request, and Google's message stays out.
func TestTestConnectionGeminiBadKey(t *testing.T) {
	svc, n := fakeGemini(t, 400, googleBadKey)
	key := "AIza-WRONG"
	got := svc.TestConnection(context.Background(), Gemini, geminiSettings(), Draft{Key: &key})
	if got.OK || got.Code != CodeProviderAuth || got.Status != 400 {
		t.Fatalf("%+v", got)
	}
	if n.Load() != 1 {
		t.Fatalf("%d requests, want 1", n.Load())
	}
	raw, _ := json.Marshal(got)
	if strings.Contains(string(raw), "Please pass") || strings.Contains(string(raw), key) {
		t.Fatalf("provider text or key in the result: %s", raw)
	}
}

func TestTestConnectionNotFound(t *testing.T) {
	svc, n := fakeGemini(t, 404, googleNotFound)
	key := "AIza-OK"
	got := svc.TestConnection(context.Background(), Gemini, geminiSettings(), Draft{Key: &key})
	if got.Code != CodeProviderNotFound || got.Status != 404 || got.Message != notFoundMsg || n.Load() != 1 {
		t.Fatalf("%+v after %d requests", got, n.Load())
	}

	// A compatible base URL without /v1: the message adds the base URL.
	var paths []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		w.WriteHeader(404)
	}))
	defer srv.Close()
	got = svc.TestConnection(context.Background(), Compatible, compatibleSettings(srv.URL+"/api", true), Draft{})
	if got.Code != CodeProviderNotFound || got.Message != notFoundCompatibleMsg || len(paths) != 1 {
		t.Fatalf("%+v after %v", got, paths)
	}
}

func TestTrimBaseURL(t *testing.T) {
	for in, want := range map[string]string{
		"https://openrouter.ai/api/v1/chat/completions/": "https://openrouter.ai/api/v1",
		"https://openrouter.ai/api/v1/chat/completions":  "https://openrouter.ai/api/v1",
		"http://192.168.1.20:11434/v1":                   "http://192.168.1.20:11434/v1",
		"http://localhost:11434/v1/":                     "http://localhost:11434/v1/",
		"https://x.example/chat/completions?x=1":         "https://x.example/chat/completions?x=1",
		"":                                               "",
	} {
		if got := TrimBaseURL(in); got != want {
			t.Errorf("TrimBaseURL(%q) = %q, want %q", in, got, want)
		}
	}
}

// TestCompatiblePastedEndpoint: a pasted full endpoint is saved trimmed and a
// test sends exactly one request to base + /chat/completions.
func TestCompatiblePastedEndpoint(t *testing.T) {
	var paths []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		_, _ = io.WriteString(w, chatText("OK", "stop"))
	}))
	defer srv.Close()
	st := newTestStore(t)
	svc := NewService(st, nil)
	pasted := srv.URL + "/v1/chat/completions/"
	if got := svc.TestConnection(context.Background(), Compatible, compatibleSettings(pasted, true), Draft{}); !got.OK {
		t.Fatalf("%+v", got)
	}
	draft := pasted
	if got := svc.TestConnection(context.Background(), Compatible, compatibleSettings("http://unused.invalid/v1", true), Draft{BaseURL: &draft}); !got.OK {
		t.Fatalf("draft: %+v", got)
	}
	if len(paths) != 2 || paths[0] != "/v1/chat/completions" || paths[1] != "/v1/chat/completions" {
		t.Fatalf("paths %v", paths)
	}
	saved, err := st.SaveSettings(context.Background(), "owner", compatibleSettings(pasted, true), nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := saved.Providers[Compatible].BaseURL; got != srv.URL+"/v1" {
		t.Fatalf("saved %q", got)
	}
	again, _ := st.Settings(context.Background())
	if got := again.Providers[Compatible].BaseURL; got != srv.URL+"/v1" {
		t.Fatalf("stored %q", got)
	}
	plain, err := st.SaveSettings(context.Background(), "owner", compatibleSettings("http://192.168.1.20:11434/v1", true), nil, nil, nil)
	if err != nil || plain.Providers[Compatible].BaseURL != "http://192.168.1.20:11434/v1" {
		t.Fatalf("%v %q", err, plain.Providers[Compatible].BaseURL)
	}
	// A URL saved before the trim existed is trimmed where the provider is built.
	p, err := svc.provider(Compatible, ProviderSettings{Model: "m", BaseURL: pasted}, "", true)
	if err != nil || p.(*ChatProvider).BaseURL != srv.URL+"/v1" {
		t.Fatalf("%v %+v", err, p)
	}
}
