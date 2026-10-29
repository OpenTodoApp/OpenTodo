package httpapi

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/assistant"
)

// TestTurnGeminiErrors (assistant-providers-fix): a turn on Google Gemini
// whose key Google rejects with a 400, and whose model Google does not serve,
// ends with provider_auth and provider_not_found, without the key or Google's
// own text in the stream.
func TestTurnGeminiErrors(t *testing.T) {
	var status atomic.Int32
	var body atomic.Value
	gemini := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(int(status.Load()))
		_, _ = io.WriteString(w, body.Load().(string))
	}))
	defer gemini.Close()
	e := newEnvWith(t, true, WithAssistantSetup(func(s *assistant.Service) {
		s.GeminiBaseURL = gemini.URL
		s.Fixed = gemini.Client()
	}))
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("PUT", "/api/v1/settings/assistant", map[string]any{"enabled": true, "default_provider": "gemini",
		"providers": map[string]any{"gemini": map[string]any{"enabled": true, "model": "gemini-x"}},
		"keys":      map[string]any{"gemini": fakeKey}})
	e.mustStatus(resp, 200, out)
	e.consentAssistant("gemini")

	for _, c := range []struct {
		status    int
		body      string
		code      string
		inMessage string
	}{
		{400, `[{"error":{"code":400,"message":"Please pass a valid API key","status":"INVALID_ARGUMENT"}}]`, "provider_auth", "Settings"},
		{404, `[{"error":{"code":404,"message":"models/gemini-x is not found","status":"NOT_FOUND"}}]`, "provider_not_found", "check the model id"},
	} {
		status.Store(int32(c.status))
		body.Store(c.body)
		_, _, events := e.turn(ask("hi"))
		errs := named(events, "error")
		all := fmt.Sprint(events)
		if len(errs) != 1 || errs[0].data["code"] != c.code || !strings.Contains(errs[0].data["message"].(string), c.inMessage) {
			t.Fatalf("%d: %v", c.status, events)
		}
		for _, leak := range []string{fakeKey, "Please pass", "is not found"} {
			if strings.Contains(all, leak) {
				t.Fatalf("%d: %q in the stream: %s", c.status, leak, all)
			}
		}
	}
}
