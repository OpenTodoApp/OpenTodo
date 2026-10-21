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
		if r.URL.Path == "/api/v1/me" {
			if r.Header.Get("Authorization") != "Bearer read-token" {
				t.Errorf("me request authorization = %q", r.Header.Get("Authorization"))
				http.Error(w, "bad auth", http.StatusBadRequest)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"user":{},"auth":{"method":"token","scope":"read","token_id":"mcp-token"}}`)
			return
		}
		if r.URL.Path != "/mcp" {
			http.NotFound(w, r)
			return
		}
		if r.Header.Get("Authorization") != "Bearer read-token" || r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("MCP headers = %v", r.Header)
			http.Error(w, "bad headers", http.StatusBadRequest)
			return
		}
		var request map[string]any
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Errorf("decode request: %v", err)
			http.Error(w, "bad request", http.StatusBadRequest)
			return
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
		if r.URL.Path != "/api/v1/me" {
			t.Errorf("unexpected request %s", r.URL.Path)
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"user":{},"auth":{"method":"token","scope":"full","token_id":"full-token"}}`)
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
	if !strings.Contains(stderr.String(), "create a read or agent token") || stdout.Len() != 0 {
		t.Fatalf("stdout %q, stderr %q", stdout.String(), stderr.String())
	}
}

func TestMCPBridgeAllowsFullTokenWithFlag(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/mcp" {
			t.Errorf("unexpected request %s", r.URL.Path)
			http.NotFound(w, r)
			return
		}
		if r.Header.Get("Authorization") != "Bearer full-token" {
			t.Errorf("authorization = %q", r.Header.Get("Authorization"))
			http.Error(w, "bad auth", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"jsonrpc":"2.0","id":1,"result":{}}`)
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
	if code := a.Main([]string{"mcp", "--allow-full-token"}); code != ExitOK {
		t.Fatalf("exit %d, stdout %q, stderr %q", code, stdout.String(), stderr.String())
	}
	if !strings.Contains(stdout.String(), `"id":1`) {
		t.Fatalf("stdout = %q", stdout.String())
	}
}

func TestMCPBridgeReadOnlyModeRejectsFullTokenOverride(t *testing.T) {
	tests := []struct {
		name string
		args []string
		env  bool
	}{
		{name: "flag", args: []string{"mcp", "--read-only", "--allow-full-token"}},
		{name: "environment", args: []string{"mcp", "--allow-full-token"}, env: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mcpCalls := 0
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/api/v1/me" {
					w.Header().Set("Content-Type", "application/json")
					_, _ = io.WriteString(w, `{"user":{},"auth":{"method":"token","scope":"full"}}`)
					return
				}
				mcpCalls++
				http.Error(w, "MCP request must not be forwarded", http.StatusInternalServerError)
			}))
			defer srv.Close()

			var stdout, stderr bytes.Buffer
			a := &App{
				Stdin:  strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"ping"}` + "\n"),
				Stdout: &stdout,
				Stderr: &stderr,
				Getenv: func(key string) string {
					switch key {
					case "OPENTODO_URL":
						return srv.URL
					case "OPENTODO_TOKEN":
						return "full-token"
					case "OPENTODO_READ_ONLY":
						if tt.env {
							return "1"
						}
					}
					return ""
				},
			}
			if code := a.Main(tt.args); code != ExitAuth {
				t.Fatalf("exit %d, stdout %q, stderr %q", code, stdout.String(), stderr.String())
			}
			if stdout.Len() != 0 || mcpCalls != 0 || !strings.Contains(stderr.String(), "read-only mode requires a read-only token") {
				t.Fatalf("MCP calls %d, stdout %q, stderr %q", mcpCalls, stdout.String(), stderr.String())
			}
		})
	}
}

func TestMCPBridgeRejectsOversizedMessage(t *testing.T) {
	var stdout, stderr bytes.Buffer
	a := &App{
		Stdin:  strings.NewReader(strings.Repeat("x", maxMCPStdioMessage+1) + "\n"),
		Stdout: &stdout,
		Stderr: &stderr,
		Getenv: func(key string) string {
			if key == "OPENTODO_URL" {
				return "https://example.invalid"
			}
			if key == "OPENTODO_TOKEN" {
				return "full-token"
			}
			return ""
		},
	}
	if code := a.Main([]string{"mcp", "--allow-full-token"}); code != ExitUsage {
		t.Fatalf("exit %d, stdout %q, stderr %q", code, stdout.String(), stderr.String())
	}
	if stdout.Len() != 0 || !strings.Contains(stderr.String(), "exceeds 1 MB") {
		t.Fatalf("stdout %q, stderr %q", stdout.String(), stderr.String())
	}
}

func TestMCPBridgeContinuesAfterProtocolAndTransientErrors(t *testing.T) {
	requestNumber := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/me" {
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"user":{},"auth":{"method":"token","scope":"read"}}`)
			return
		}
		requestNumber++
		w.Header().Set("Content-Type", "application/json")
		switch requestNumber {
		case 1:
			w.WriteHeader(http.StatusBadRequest)
			_, _ = io.WriteString(w, `{"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"parse error"}}`)
		case 2:
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = io.WriteString(w, `{"error":{"code":"rate_limited","message":"slow down"}}`)
		default:
			_, _ = io.WriteString(w, `{"jsonrpc":"2.0","id":3,"result":{}}`)
		}
	}))
	defer srv.Close()

	input := "{\n" +
		`{"jsonrpc":"2.0","id":2,"method":"ping"}` + "\n" +
		`{"jsonrpc":"2.0","id":3,"method":"ping"}` + "\n"
	var stdout, stderr bytes.Buffer
	a := &App{Stdin: strings.NewReader(input), Stdout: &stdout, Stderr: &stderr, Getenv: func(key string) string {
		if key == "OPENTODO_URL" {
			return srv.URL
		}
		if key == "OPENTODO_TOKEN" {
			return "read-token"
		}
		return ""
	}}
	if code := a.Main([]string{"mcp"}); code != ExitOK {
		t.Fatalf("exit %d, stderr %q", code, stderr.String())
	}
	lines := strings.Split(strings.TrimSpace(stdout.String()), "\n")
	if len(lines) != 3 || !strings.Contains(lines[0], `"code":-32700`) ||
		!strings.Contains(lines[1], `"id":2`) || !strings.Contains(lines[1], `"code":-32603`) ||
		!strings.Contains(lines[2], `"id":3`) {
		t.Fatalf("stdout = %q", stdout.String())
	}
}

func TestMCPBridgeServerUnreachableLeavesStdoutEmpty(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	url := srv.URL
	srv.Close()

	var stdout, stderr bytes.Buffer
	a := &App{
		Stdin:  strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"ping"}` + "\n"),
		Stdout: &stdout,
		Stderr: &stderr,
		Getenv: func(key string) string {
			if key == "OPENTODO_URL" {
				return url
			}
			if key == "OPENTODO_TOKEN" {
				return "read-token"
			}
			return ""
		},
	}
	if code := a.Main([]string{"mcp"}); code != ExitUnreachable {
		t.Fatalf("exit %d, stdout %q, stderr %q", code, stdout.String(), stderr.String())
	}
	if stdout.Len() != 0 {
		t.Fatalf("stdout = %q", stdout.String())
	}
}
