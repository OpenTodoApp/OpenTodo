package cli

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

const maxMCPStdioMessage = 1 << 20
const maxMCPResponse = 64 << 20

// cmdMCP bridges newline-delimited MCP stdio messages to the configured
// stateless streamable-HTTP endpoint. Stdout is reserved for protocol data;
// diagnostics continue to use the App's normal stderr error path.
func cmdMCP(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("mcp", g)
	allowFullToken := fs.Bool("allow-full-token", false, "allow a full-access API token")
	pos, err := a.parse(g, fs, "mcp", args)
	if err != nil {
		return a.helpOr("mcp", err)
	}
	if len(pos) != 0 {
		return usageErr("usage: ot mcp [--allow-full-token]")
	}

	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	if !*allowFullToken {
		_, cred, err := c.meAuth(ctx)
		if err != nil {
			return err
		}
		if cred.Scope == "" {
			return authErr("could not verify the configured token scope; use a read-only token or pass --allow-full-token")
		}
		if cred.Scope != "read" {
			return authErr("the configured token has %q scope; create a read-only token for MCP or pass --allow-full-token", cred.Scope)
		}
	}

	scanner := bufio.NewScanner(a.Stdin)
	scanner.Buffer(make([]byte, 64<<10), maxMCPStdioMessage+1)
	for scanner.Scan() {
		message := bytes.TrimSpace(scanner.Bytes())
		if len(message) == 0 {
			continue
		}
		response, status, err := c.mcp(ctx, message)
		if err != nil {
			switch {
			case status == http.StatusBadRequest && isJSONRPCError(response):
				// Parse and invalid-request errors are protocol responses. Forward
				// them instead of terminating the client's stdio session.
			case status > 0 && status != http.StatusUnauthorized && status != http.StatusForbidden:
				if id, ok := jsonRPCRequestID(message); ok {
					if writeErr := writeJSONRPCError(a.Stdout, id, err.Error()); writeErr != nil {
						return serverErr("write MCP error response: %v", writeErr)
					}
					continue
				}
				return err
			default:
				return err
			}
		}
		if status == http.StatusAccepted || len(bytes.TrimSpace(response)) == 0 {
			continue
		}
		if _, err := fmt.Fprintln(a.Stdout, string(bytes.TrimSpace(response))); err != nil {
			return serverErr("write MCP response: %v", err)
		}
	}
	if err := scanner.Err(); err != nil {
		if strings.Contains(err.Error(), "token too long") {
			return usageErr("MCP stdio message exceeds 1 MB")
		}
		return usageErr("read MCP stdio message: %v", err)
	}
	return nil
}

// mcp forwards one JSON-RPC message to the server's root /mcp endpoint.
func (c *client) mcp(ctx context.Context, message []byte) ([]byte, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.base+"/mcp", bytes.NewReader(message))
	if err != nil {
		return nil, 0, usageErr("invalid server URL %q: %v", c.base, err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "ot/"+Version)
	req.Header.Set("Authorization", "Bearer "+c.token)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, 0, c.unreachable(err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxMCPResponse+1))
	if err != nil {
		return nil, resp.StatusCode, c.unreachable(err)
	}
	if len(raw) > maxMCPResponse {
		return nil, resp.StatusCode, serverErr("MCP response exceeds 64 MB")
	}
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return raw, resp.StatusCode, nil
	}
	return raw, resp.StatusCode, c.mapError(resp.StatusCode, raw)
}

func isJSONRPCError(raw []byte) bool {
	var response struct {
		JSONRPC string          `json:"jsonrpc"`
		Error   json.RawMessage `json:"error"`
	}
	return json.Unmarshal(raw, &response) == nil && response.JSONRPC == "2.0" && len(response.Error) > 0
}

func jsonRPCRequestID(raw []byte) (json.RawMessage, bool) {
	var request struct {
		ID json.RawMessage `json:"id"`
	}
	if json.Unmarshal(raw, &request) != nil || len(request.ID) == 0 || bytes.Equal(request.ID, []byte("null")) {
		return nil, false
	}
	return request.ID, true
}

func writeJSONRPCError(w io.Writer, id json.RawMessage, message string) error {
	response := struct {
		JSONRPC string          `json:"jsonrpc"`
		ID      json.RawMessage `json:"id"`
		Error   struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}{JSONRPC: "2.0", ID: id}
	response.Error.Code = -32603
	response.Error.Message = message
	return json.NewEncoder(w).Encode(response)
}
