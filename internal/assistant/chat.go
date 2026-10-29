package assistant

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/textutil"
)

// ChatProvider is the Chat Completions wire format on the standard library
// (design D3), used for OpenAI, Gemini (Google's OpenAI-compatible endpoint)
// and any compatible endpoint (Ollama, LM Studio, OpenRouter and others):
// `/chat/completions` with stream, stream_options.include_usage, tools and
// tool_choice auto. Never used for Anthropic.
type ChatProvider struct {
	// Name is openai, gemini or compatible (request details differ slightly).
	Name    string
	BaseURL string
	Key     string
	Model   string
	HTTP    *http.Client
	// Retries for 429 and 5xx answers before the stream starts.
	Retries int
	Backoff time.Duration
}

// Start implements Provider.
func (p *ChatProvider) Start(req Request) Conversation {
	msgs := []map[string]any{{"role": "system", "content": req.System}}
	for _, m := range req.Messages {
		if m.Text == "" {
			continue
		}
		role := "user"
		if m.Role == "assistant" {
			role = "assistant"
		}
		msgs = append(msgs, map[string]any{"role": role, "content": m.Text})
	}
	var tools []map[string]any
	for _, t := range req.Tools {
		schema := t.Schema
		if p.Name == Gemini {
			// Gemini's function declarations take an OpenAPI subset without type lists.
			schema = strictSchema(t.Schema, true)
		}
		tools = append(tools, map[string]any{"type": "function", "function": map[string]any{
			"name": t.Name, "description": t.Description, "parameters": schema,
		}})
	}
	return &chatConv{p: p, messages: msgs, tools: tools, maxTokens: req.MaxTokens}
}

type chatConv struct {
	p         *ChatProvider
	messages  []map[string]any
	tools     []map[string]any
	maxTokens int64
}

func (c *chatConv) body() ([]byte, error) {
	b := map[string]any{
		"model":          c.p.Model,
		"messages":       c.messages,
		"stream":         true,
		"stream_options": map[string]any{"include_usage": true},
	}
	if len(c.tools) > 0 {
		b["tools"] = c.tools
		b["tool_choice"] = "auto"
	}
	if c.maxTokens > 0 {
		if c.p.Name == OpenAI {
			b["max_completion_tokens"] = c.maxTokens
		} else {
			b["max_tokens"] = c.maxTokens
		}
	}
	return json.Marshal(b)
}

// maxStreamLine bounds one SSE line (a tool call's arguments arrive in pieces).
const maxStreamLine = 1 << 20

func (c *chatConv) Next(ctx context.Context, onText func(string)) (Round, error) {
	body, err := c.body()
	if err != nil {
		return Round{}, err
	}
	resp, err := c.post(ctx, body)
	if err != nil {
		return Round{}, err
	}
	defer resp.Body.Close()

	type callAcc struct {
		id, name string
		args     strings.Builder
	}
	var calls []*callAcc
	var text strings.Builder
	var r Round
	finish := ""
	sc := bufio.NewScanner(resp.Body)
	sc.Buffer(make([]byte, 64*1024), maxStreamLine)
	for sc.Scan() {
		line := sc.Text()
		data, ok := strings.CutPrefix(line, "data:")
		if !ok {
			continue
		}
		data = strings.TrimSpace(data)
		if data == "[DONE]" {
			break
		}
		var chunk struct {
			Choices []struct {
				Delta struct {
					Content   *string `json:"content"`
					ToolCalls []struct {
						Index    *int   `json:"index"`
						ID       string `json:"id"`
						Function struct {
							Name      string `json:"name"`
							Arguments string `json:"arguments"`
						} `json:"function"`
					} `json:"tool_calls"`
				} `json:"delta"`
				FinishReason *string `json:"finish_reason"`
			} `json:"choices"`
			Usage *struct {
				PromptTokens     int64 `json:"prompt_tokens"`
				CompletionTokens int64 `json:"completion_tokens"`
			} `json:"usage"`
			Error *struct {
				Type string `json:"type"`
			} `json:"error"`
		}
		if json.Unmarshal([]byte(data), &chunk) != nil {
			return Round{}, &ProviderError{Code: CodeProviderError, Msg: "the provider sent a stream this server could not read"}
		}
		if chunk.Error != nil {
			return Round{}, &ProviderError{Code: CodeProviderError, Type: chunk.Error.Type, Msg: "the provider reported an error while answering"}
		}
		if chunk.Usage != nil {
			r.Input, r.Output = chunk.Usage.PromptTokens, chunk.Usage.CompletionTokens
		}
		for _, ch := range chunk.Choices {
			if ch.Delta.Content != nil && *ch.Delta.Content != "" {
				text.WriteString(*ch.Delta.Content)
				onText(*ch.Delta.Content)
			}
			for _, tc := range ch.Delta.ToolCalls {
				i := len(calls)
				if tc.Index != nil {
					i = *tc.Index
				} else if tc.ID == "" && len(calls) > 0 {
					i = len(calls) - 1
				}
				if i < 0 || i > 128 {
					return Round{}, &ProviderError{Code: CodeProviderError, Msg: "the provider sent too many tool calls"}
				}
				for len(calls) <= i {
					calls = append(calls, &callAcc{})
				}
				if tc.ID != "" {
					calls[i].id = tc.ID
				}
				if tc.Function.Name != "" {
					calls[i].name = tc.Function.Name
				}
				calls[i].args.WriteString(tc.Function.Arguments)
			}
			if ch.FinishReason != nil && *ch.FinishReason != "" {
				finish = *ch.FinishReason
			}
		}
	}
	if err := sc.Err(); err != nil {
		if ctx.Err() != nil {
			return Round{}, ctx.Err()
		}
		return Round{}, &ProviderError{Code: CodeProviderError, Msg: "the provider's answer was cut off"}
	}
	r.RawStop = finish
	switch finish {
	case "stop":
		r.Stop = StopEndTurn
	case "tool_calls", "function_call":
		r.Stop = StopToolUse
	case "length":
		r.Stop = StopMaxTokens
	case "content_filter":
		r.Stop = StopRefusal
	case "":
		// Some compatible servers end the stream without a finish reason.
		if len(calls) > 0 {
			r.Stop = StopToolUse
		} else {
			r.Stop = StopEndTurn
		}
	default:
		r.Stop = Stop(finish)
	}
	if r.Stop == StopEndTurn && len(calls) > 0 {
		r.Stop = StopToolUse // some servers report "stop" with tool calls
	}
	if r.Stop == StopToolUse {
		var tcs []map[string]any
		for i, cl := range calls {
			if cl.id == "" {
				cl.id = fmt.Sprintf("call_%d", i)
			}
			args := cl.args.String()
			if strings.TrimSpace(args) == "" {
				args = "{}"
			}
			r.ToolCalls = append(r.ToolCalls, ToolCall{ID: cl.id, Name: cl.name, Args: json.RawMessage(args)})
			tcs = append(tcs, map[string]any{"id": cl.id, "type": "function", "function": map[string]any{"name": cl.name, "arguments": args}})
		}
		msg := map[string]any{"role": "assistant", "tool_calls": tcs}
		if text.Len() > 0 {
			msg["content"] = text.String()
		} else {
			msg["content"] = nil
		}
		c.messages = append(c.messages, msg)
	}
	return r, nil
}

func (c *chatConv) AddToolResults(results []ToolResult) {
	for _, r := range results {
		content := r.Content
		if r.IsError {
			// The wire format has no error flag: say it in the content.
			content = "ERROR: " + content
		}
		c.messages = append(c.messages, map[string]any{"role": "tool", "tool_call_id": r.ID, "content": content})
	}
}

// post sends the request, retrying 429 and 5xx answers with backoff before
// any of the stream has been read. Errors carry status and type only.
func (c *chatConv) post(ctx context.Context, body []byte) (*http.Response, error) {
	url := strings.TrimRight(c.p.BaseURL, "/") + "/chat/completions"
	backoff := c.p.Backoff
	if backoff == 0 {
		backoff = 500 * time.Millisecond
	}
	for attempt := 0; ; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
		if err != nil {
			return nil, &ProviderError{Code: CodeProviderError, Msg: "the provider URL is not valid"}
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "text/event-stream")
		if c.p.Key != "" {
			req.Header.Set("Authorization", "Bearer "+c.p.Key)
		}
		resp, err := c.p.HTTP.Do(req)
		if err != nil {
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			if errors.Is(err, ErrPrivateTarget) {
				return nil, &ProviderError{Code: CodeProviderError, Type: "private_target", Msg: "the endpoint resolves to a private network address and the server owner has not allowed private endpoints"}
			}
			return nil, &ProviderError{Code: CodeProviderError, Msg: "the provider could not be reached"}
		}
		if resp.StatusCode == http.StatusOK {
			return resp, nil
		}
		errBody, _ := io.ReadAll(io.LimitReader(resp.Body, maxErrorBody))
		resp.Body.Close()
		retry := resp.StatusCode == 429 || resp.StatusCode >= 500
		if resp.StatusCode >= 300 && resp.StatusCode < 400 {
			return nil, &ProviderError{Code: CodeProviderError, Status: resp.StatusCode, Msg: "the endpoint answered with a redirect, which this server does not follow"}
		}
		if !retry || attempt >= c.p.Retries {
			return nil, chatError(c.p.Name, resp.StatusCode, errBody)
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(backoff << attempt):
		}
	}
}

// maxErrorBody bounds the part of an error answer that is read.
const maxErrorBody = 4096

// readChatError reads an error body as {"error":{…}} or as an array whose
// first element is one (Google's form). typ is the error's type, else its
// string code, else its status, clipped. badKey reports an error that marks an
// invalid API key: a details reason API_KEY_INVALID, OpenAI's code
// invalid_api_key, or INVALID_ARGUMENT with a message naming the API key. The
// message is used for that test only and then dropped.
func readChatError(b []byte) (typ string, badKey bool) {
	type env struct {
		Error *struct {
			Type    string `json:"type"`
			Code    any    `json:"code"`
			Status  string `json:"status"`
			Message string `json:"message"`
			Details []struct {
				Reason string `json:"reason"`
			} `json:"details"`
		} `json:"error"`
	}
	var e env
	if json.Unmarshal(b, &e) != nil {
		var arr []env
		if json.Unmarshal(b, &arr) != nil || len(arr) == 0 {
			return "", false
		}
		e = arr[0]
	}
	if e.Error == nil {
		return "", false
	}
	er := e.Error
	code, _ := er.Code.(string)
	for _, s := range []string{er.Type, code, er.Status} {
		if s != "" {
			typ = clip(s)
			break
		}
	}
	for _, d := range er.Details {
		if d.Reason == "API_KEY_INVALID" {
			badKey = true
		}
	}
	if code == "invalid_api_key" || (er.Status == "INVALID_ARGUMENT" && strings.Contains(strings.ToLower(er.Message), "api key")) {
		badKey = true
	}
	return typ, badKey
}

// clip keeps a provider's error code or type short and on one line, cut
// without splitting a character.
func clip(s string) string {
	return strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f {
			return -1
		}
		return r
	}, textutil.Truncate(s, 64))
}
