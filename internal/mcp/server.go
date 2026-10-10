// Package mcp is the read-only Model Context Protocol server (OpenSpec change
// `mcp-server`). It implements the subset of JSON-RPC 2.0 and MCP a stateless,
// read-only server needs (design D1): initialize, ping, tools/list, tools/call,
// resources/list, resources/templates/list and resources/read. Every tool and
// resource is answered from the materialised reads of internal/sync, so it sees
// exactly what the REST API shows the same user: the personal scope plus the
// shared projects they are a member of, never a tombstoned entity.
//
// Nothing in this package writes: it holds no op-building code and only calls
// sync.Service read methods. The HTTP layer (internal/httpapi) owns transport
// concerns (enablement, bearer authentication, Origin, body size).
package mcp

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"time"

	opsync "github.com/pixari/opentodo/internal/sync"
)

// ProtocolVersions are the MCP revisions this server implements, newest first.
// Negotiation echoes the client's version when listed and answers the newest
// otherwise (design D1). 2025-03-26 is the first revision with the streamable
// HTTP transport.
var ProtocolVersions = []string{"2025-11-25", "2025-06-18", "2025-03-26"}

// SupportedVersion reports whether v is one of ProtocolVersions.
func SupportedVersion(v string) bool {
	for _, p := range ProtocolVersions {
		if p == v {
			return true
		}
	}
	return false
}

// JSON-RPC and MCP error codes.
const (
	CodeParseError       = -32700
	CodeInvalidRequest   = -32600
	CodeMethodNotFound   = -32601
	CodeInvalidParams    = -32602
	CodeInternalError    = -32603
	CodeResourceNotFound = -32002
)

// MaxItems caps every list in a response (design D3).
const MaxItems = 200

// Server answers MCP requests for one authenticated user at a time.
type Server struct {
	sync    *opsync.Service
	version string
	log     *slog.Logger
	now     func() time.Time
}

// Options configure a Server.
type Options struct {
	Version string           // server version reported by initialize
	Log     *slog.Logger     // debug log of method and duration (nil: discard)
	Now     func() time.Time // clock for server_time and date views (nil: time.Now)
}

// New wires a Server over the sync service's materialised reads.
func New(syncSvc *opsync.Service, opts Options) *Server {
	s := &Server{sync: syncSvc, version: opts.Version, log: opts.Log, now: opts.Now}
	if s.log == nil {
		s.log = slog.New(slog.DiscardHandler)
	}
	if s.now == nil {
		s.now = time.Now
	}
	if s.version == "" {
		s.version = "dev"
	}
	return s
}

// rpcError is a JSON-RPC error object.
type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

func (e *rpcError) Error() string { return e.Message }

func invalidParams(msg string) *rpcError { return &rpcError{Code: CodeInvalidParams, Message: msg} }

type response struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

var nullID = json.RawMessage("null")

// Handle processes one POST body for userID. It returns the JSON body to send
// (nil when the message carried only notifications or responses, which the
// transport answers with 202) and whether the body was malformed at the top
// level (the transport then answers 400).
func (s *Server) Handle(ctx context.Context, userID string, body []byte) (out []byte, malformed bool) {
	body = bytes.TrimSpace(body)
	if len(body) > 0 && body[0] == '[' {
		var batch []json.RawMessage
		if err := json.Unmarshal(body, &batch); err != nil {
			return encode(response{JSONRPC: "2.0", ID: nullID, Error: &rpcError{Code: CodeParseError, Message: "parse error: " + err.Error()}}), true
		}
		if len(batch) == 0 {
			return encode(response{JSONRPC: "2.0", ID: nullID, Error: &rpcError{Code: CodeInvalidRequest, Message: "invalid request: empty batch"}}), true
		}
		var replies []response
		for _, msg := range batch {
			if r := s.handleOne(ctx, userID, msg); r != nil {
				replies = append(replies, *r)
			}
		}
		if len(replies) == 0 {
			return nil, false
		}
		return encode(replies), false
	}
	var probe any
	if err := json.Unmarshal(body, &probe); err != nil {
		return encode(response{JSONRPC: "2.0", ID: nullID, Error: &rpcError{Code: CodeParseError, Message: "parse error: invalid JSON"}}), true
	}
	r := s.handleOne(ctx, userID, body)
	if r == nil {
		return nil, false
	}
	return encode(r), r.Error != nil && (r.Error.Code == CodeInvalidRequest || r.Error.Code == CodeParseError)
}

func encode(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		b, _ = json.Marshal(response{JSONRPC: "2.0", ID: nullID, Error: &rpcError{Code: CodeInternalError, Message: "internal error"}})
	}
	return b
}

// handleOne answers one message, or returns nil for notifications and for
// responses (this server never sends requests, so there is nothing to match).
func (s *Server) handleOne(ctx context.Context, userID string, raw json.RawMessage) *response {
	var msg map[string]json.RawMessage
	if err := json.Unmarshal(raw, &msg); err != nil {
		if _, ok := err.(*json.SyntaxError); ok {
			return &response{JSONRPC: "2.0", ID: nullID, Error: &rpcError{Code: CodeParseError, Message: "parse error: invalid JSON"}}
		}
		return &response{JSONRPC: "2.0", ID: nullID, Error: &rpcError{Code: CodeInvalidRequest, Message: "invalid request: expected a JSON-RPC object"}}
	}
	id, hasID := msg["id"]
	if hasID && !validID(id) {
		return &response{JSONRPC: "2.0", ID: nullID, Error: &rpcError{Code: CodeInvalidRequest, Message: "invalid request: id must be a string or a number"}}
	}
	if !hasID {
		id = nullID
	}
	var version string
	if v, ok := msg["jsonrpc"]; !ok || json.Unmarshal(v, &version) != nil || version != "2.0" {
		return &response{JSONRPC: "2.0", ID: id, Error: &rpcError{Code: CodeInvalidRequest, Message: `invalid request: jsonrpc must be "2.0"`}}
	}
	rawMethod, hasMethod := msg["method"]
	if !hasMethod {
		_, isResult := msg["result"]
		_, isError := msg["error"]
		if hasID && (isResult || isError) {
			return nil // a response from the client: nothing to answer
		}
		return &response{JSONRPC: "2.0", ID: id, Error: &rpcError{Code: CodeInvalidRequest, Message: "invalid request: method is required"}}
	}
	var method string
	if json.Unmarshal(rawMethod, &method) != nil || method == "" {
		return &response{JSONRPC: "2.0", ID: id, Error: &rpcError{Code: CodeInvalidRequest, Message: "invalid request: method must be a non-empty string"}}
	}
	params := msg["params"]
	if len(params) > 0 && !bytes.Equal(params, nullID) {
		if t := bytes.TrimSpace(params); len(t) == 0 || (t[0] != '{' && t[0] != '[') {
			return &response{JSONRPC: "2.0", ID: id, Error: invalidParams("params must be an object")}
		}
	}
	start := time.Now()
	result, rerr := s.dispatch(ctx, userID, method, params, !hasID)
	// Method and duration only: arguments and results never reach the log (spec
	// "Limits and no outbound calls").
	s.log.Debug("mcp", "method", method, "ms", time.Since(start).Milliseconds())
	if !hasID {
		return nil // notifications never get an answer, not even an error
	}
	if rerr != nil {
		var re *rpcError
		if !errors.As(rerr, &re) {
			s.log.Error("mcp request failed", "method", method, "err", rerr)
			re = &rpcError{Code: CodeInternalError, Message: "internal error"}
		}
		return &response{JSONRPC: "2.0", ID: id, Error: re}
	}
	return &response{JSONRPC: "2.0", ID: id, Result: result}
}

func validID(id json.RawMessage) bool {
	t := bytes.TrimSpace(id)
	if len(t) == 0 {
		return false
	}
	switch {
	case t[0] == '"':
		var s string
		return json.Unmarshal(t, &s) == nil
	case t[0] == '-' || (t[0] >= '0' && t[0] <= '9'):
		var n json.Number
		return json.Unmarshal(t, &n) == nil
	}
	return false
}

func (s *Server) dispatch(ctx context.Context, userID, method string, params json.RawMessage, notification bool) (any, error) {
	if notification {
		// notifications/initialized, notifications/cancelled and any other
		// notification are accepted and ignored: there is no session state.
		return nil, nil
	}
	switch method {
	case "initialize":
		return s.initialize(params)
	case "ping":
		return struct{}{}, nil
	case "tools/list":
		return map[string]any{"tools": toolDefinitions()}, nil
	case "tools/call":
		return s.callTool(ctx, userID, params)
	case "resources/list":
		return map[string]any{"resources": resourceList()}, nil
	case "resources/templates/list":
		return map[string]any{"resourceTemplates": resourceTemplates()}, nil
	case "resources/read":
		return s.readResource(ctx, userID, params)
	}
	return nil, &rpcError{Code: CodeMethodNotFound, Message: "method not found: " + method}
}

// Instructions is the short orientation initialize hands to the assistant.
const Instructions = "Read-only access to this user's OpenTodo projects and tasks. " +
	"Due dates are floating calendar dates (and optional wall-clock times) unless they name a time zone; " +
	"pass the user's IANA time zone as `timezone` to tools that evaluate today or upcoming dates (default UTC). " +
	"Results carry server_time; changes made offline on a device appear only after it syncs. Nothing can be modified through this server."

func (s *Server) initialize(params json.RawMessage) (any, error) {
	var p struct {
		ProtocolVersion *string `json:"protocolVersion"`
	}
	if len(params) == 0 || json.Unmarshal(params, &p) != nil || p.ProtocolVersion == nil {
		return nil, invalidParams("protocolVersion is required")
	}
	version := ProtocolVersions[0]
	if SupportedVersion(*p.ProtocolVersion) {
		version = *p.ProtocolVersion
	}
	return map[string]any{
		"protocolVersion": version,
		"capabilities": map[string]any{
			"tools":     map[string]any{"listChanged": false},
			"resources": map[string]any{"subscribe": false, "listChanged": false},
		},
		"serverInfo":   map[string]any{"name": "opentodo", "title": "OpenTodo", "version": s.version},
		"instructions": Instructions,
	}, nil
}
