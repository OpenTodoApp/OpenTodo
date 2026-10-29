package assistant

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
)

// Provider is a model provider (design D3). Adding one means implementing it.
type Provider interface {
	// Start begins a conversation for one turn; Next then runs model calls.
	Start(req Request) Conversation
}

// Conversation is one turn's provider-native history (Anthropic keeps thinking
// blocks here so they pass back unchanged within the tool loop).
type Conversation interface {
	// Next runs one model call, streaming text deltas through onText.
	Next(ctx context.Context, onText func(string)) (Round, error)
	// AddToolResults answers every tool call of the last round in one message.
	AddToolResults(results []ToolResult)
}

// Message is one message of the device-local conversation: user or assistant text.
// Untrusted marks text the user pasted (assistant-skills D3): the loop wraps it
// as untrusted data and folds it into the user's next message before any
// provider sees it.
type Message struct {
	Role      string `json:"role"`
	Text      string `json:"text"`
	Untrusted bool   `json:"untrusted,omitempty"`
}

// ToolDef is a tool offered to the model (from the registry).
type ToolDef struct {
	Name        string
	Description string
	Schema      map[string]any
}

// Request is everything a provider needs to start a turn.
type Request struct {
	System    string
	Messages  []Message
	Tools     []ToolDef
	MaxTokens int64
}

// ToolCall is a tool call requested by the model.
type ToolCall struct {
	ID   string
	Name string
	Args json.RawMessage
}

// ToolResult answers one ToolCall.
type ToolResult struct {
	ID      string
	Content string
	IsError bool
}

// Stop is a normalised stop reason.
type Stop string

const (
	StopEndTurn   Stop = "end_turn"
	StopToolUse   Stop = "tool_use"
	StopMaxTokens Stop = "max_tokens"
	StopRefusal   Stop = "refusal"
	StopPauseTurn Stop = "pause_turn"
)

// Round is the outcome of one model call.
type Round struct {
	Stop Stop
	// RawStop is the provider's own value (for unknown reasons).
	RawStop   string
	ToolCalls []ToolCall
	Input     int64
	Output    int64
}

// Provider error codes (design D5). Messages never contain the key.
const (
	CodeProviderError       = "provider_error"
	CodeProviderAuth        = "provider_auth"
	CodeProviderRateLimited = "provider_rate_limited"
	// CodeProviderNotFound is the provider's own 404: no such model or endpoint
	// (assistant-providers-fix D2), distinct from OpenTodo's not_found.
	CodeProviderNotFound = "provider_not_found"
	CodeNoToolSupport    = "no_tool_support"
)

// ProviderError is a failed provider request, safe to show and log: status,
// the provider's error type and a fixed message, never request content or keys.
type ProviderError struct {
	Code   string
	Status int
	Type   string
	Msg    string
}

func (e *ProviderError) Error() string {
	s := e.Code
	if e.Status != 0 {
		s += fmt.Sprintf(" (HTTP %d", e.Status)
		if e.Type != "" {
			s += " " + e.Type
		}
		s += ")"
	}
	if e.Msg != "" {
		s += ": " + e.Msg
	}
	return s
}

// Fixed messages of provider_not_found (assistant-providers-fix D2). They
// never carry the provider's own text.
const (
	notFoundMsg           = "the provider has no such model or endpoint (HTTP 404): check the model id"
	notFoundCompatibleMsg = notFoundMsg + " and the base URL (it usually ends in /v1)"
)

// providerErr classifies an HTTP status into a ProviderError (the Anthropic
// SDK's errors; Chat Completions providers go through chatError).
func providerErr(status int, typ string) *ProviderError {
	switch {
	case status == 401 || status == 403:
		return authErr(status, typ)
	case status == 429:
		return &ProviderError{Code: CodeProviderRateLimited, Status: status, Type: typ, Msg: "the provider is rate limiting requests; try again in a moment"}
	case status >= 500:
		return &ProviderError{Code: CodeProviderError, Status: status, Type: typ, Msg: "the provider had a problem; try again in a moment"}
	}
	return &ProviderError{Code: CodeProviderError, Status: status, Type: typ, Msg: "the provider refused the request"}
}

func authErr(status int, typ string) *ProviderError {
	return &ProviderError{Code: CodeProviderAuth, Status: status, Type: typ, Msg: "the provider rejected the API key; the server owner can check it in Settings → Integrations → Assistant"}
}

// chatError classifies a failed Chat Completions request of provider name
// from its status and its error body (assistant-providers-fix D1): a 400 that
// marks an invalid key is provider_auth, a 404 is provider_not_found, any
// other answer as providerErr. The provider's message only classifies.
func chatError(name string, status int, body []byte) *ProviderError {
	typ, badKey := readChatError(body)
	switch {
	case status == 400 && badKey:
		return authErr(status, typ)
	case status == 404:
		msg := notFoundMsg
		if name == Compatible {
			msg = notFoundCompatibleMsg
		}
		return &ProviderError{Code: CodeProviderNotFound, Status: status, Type: typ, Msg: msg}
	}
	return providerErr(status, typ)
}

// AsProviderError unwraps a ProviderError.
func AsProviderError(err error) (*ProviderError, bool) {
	var pe *ProviderError
	ok := errors.As(err, &pe)
	return pe, ok
}
