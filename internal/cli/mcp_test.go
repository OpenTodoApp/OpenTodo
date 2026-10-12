package cli

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMCPBridgeInitializeAndToolsList(t *testing.T) {
	var requests []map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/tokens" {
			if r.Header.Get("Authorization") != "Bearer read-token" {
				t.Fatalf("token request authorization = %q", r.Header.Get("Authorization"))
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"tokens":[{"id":"mcp-token","name":"assistant","scope":"read","createdAt":1,"lastUsedAt":2}]}`)
			return
		}
		if r.URL.Path != "/mcp" {
			http.NotFound(w, r)
			return
		}
		if r.Header.Get("Authorization") != "Bearer read-token" || r.Header.Get("Content-Type") != "application/json" {
			t.Fatalf("MCP headers = %v", r.Header)
		}
		var request map[string]any
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatal(err)
		}
		requests = append(requests, request)
		if request["id"] == nil {
			w.WriteHeader(http.StatusAccepted)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if request["method"] == "initialize" {
			_, _ = io.WriteString(w, `{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-11-25","capabilities":{"tools":{}}}}`)
			return
		}
		_, _ = io.WriteString(w, `{"jsonrpc":"2.0","id":2,"result":{"tools":[]}}`)
	}))
	defer srv.Close()

	input := strings.Join([]string{
		`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}`,
		`{"jsonrpc":"2.0","method":"notifications/initialized"}`,
		`{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}`,
	}, "\n") + "\n"
	var stdout, stderr bytes.Buffer
	a := &App{
		Stdin:  strings.NewReader(input),
		Stdout: &stdout,
		Stderr: &stderr,
		Getenv: func(key string) string {
			switch key {
			case "OPENTODO_URL":
				return srv.URL
			case "OPENTODO_TOKEN":
				return "read-token"
			default:
				return ""
			}
		},
	}
	if code := a.Main([]string{"mcp"}); code != ExitOK {
		t.Fatalf("exit %d, stderr %q", code, stderr.String())
	}
	if len(requests) != 3 {
		t.Fatalf("forwarded %d messages, want 3", len(requests))
	}
	lines := strings.Split(strings.TrimSpace(stdout.String()), "\n")
	if len(lines) != 2 || !strings.Contains(lines[0], `"protocolVersion":"2025-11-25"`) || !strings.Contains(lines[1], `"tools":[]`) {
		t.Fatalf("stdout = %q", stdout.String())
	}
}

func TestMCPBridgeRejectsFullTokenByDefault(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/tokens" {
			t.Fatalf("unexpected request %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"tokens":[{"id":"full-token","name":"cli","scope":"full","createdAt":1,"lastUsedAt":2}]}`)
	}))
	defer srv.Close()

	var stdout, stderr bytes.Buffer
	a := &App{
		Stdin:  strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"ping"}` + "\n"),
		Stdout: &stdout,
		Stderr: &stderr,
		Getenv: func(key string) string {
			if key == "OPENTODO_URL" {
				return srv.URL
			}
			if key == "OPENTODO_TOKEN" {
				return "full-token"
			}
			return ""
		},
	}
	if code := a.Main([]string{"mcp"}); code != ExitAuth {
		t.Fatalf("exit %d, stdout %q, stderr %q", code, stdout.String(), stderr.String())
	}
	if !strings.Contains(stderr.String(), "read-only token") || stdout.Len() != 0 {
		t.Fatalf("stdout %q, stderr %q", stdout.String(), stderr.String())
	}
}
