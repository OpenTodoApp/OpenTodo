package assistant

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
)

// AnthropicProvider talks to the Messages API through the official Go SDK
// (design D3): streaming, strict tools from the registry, tool_choice auto
// only (forced tool use is a 400 on current models), adaptive thinking (never
// disabled: a 400 on Claude Opus 5.5) with an explicit effort, and stop_reason
// checked before content is used.
type AnthropicProvider struct {
	Key    string
	Model  string
	Effort anthropic.OutputConfigEffort
	// BaseURL overrides the API host (tests only; never a setting).
	BaseURL string
	HTTP    *http.Client
	// MaxRetries for 429 and 5xx answers before the stream starts (SDK backoff).
	MaxRetries int
}

// DefaultEffort is the effort of chat turns: the Opus 5.5 default, set
// explicitly so a model change does not silently change cost.
const DefaultEffort = anthropic.OutputConfigEffortMedium

func (p *AnthropicProvider) client() anthropic.Client {
	opts := []option.RequestOption{
		// The key comes from Settings only: never ANTHROPIC_* variables, profiles
		// or a base URL from the environment.
		option.WithoutEnvironmentDefaults(),
		option.WithAPIKey(p.Key),
		option.WithMaxRetries(p.MaxRetries),
		// No telemetry (AGENTS.md rule 5): the SDK emits OpenTelemetry spans
		// through the global provider unless told not to; OpenTodo never
		// registers one, and this keeps it off even if a library ever does.
		option.WithoutOpenTelemetry(),
	}
	if p.BaseURL != "" {
		opts = append(opts, option.WithBaseURL(p.BaseURL))
	}
	if p.HTTP != nil {
		opts = append(opts, option.WithHTTPClient(p.HTTP))
	}
	return anthropic.NewClient(opts...)
}

// Start implements Provider.
func (p *AnthropicProvider) Start(req Request) Conversation {
	tools := make([]anthropic.ToolUnionParam, 0, len(req.Tools))
	for _, t := range req.Tools {
		schema := strictSchema(t.Schema, false)
		props, _ := schema["properties"].(map[string]any)
		if props == nil {
			props = map[string]any{}
		}
		var required []string
		switch r := schema["required"].(type) {
		case []string:
			required = r
		case []any:
			for _, v := range r {
				if s, ok := v.(string); ok {
					required = append(required, s)
				}
			}
		}
		tp := anthropic.ToolParam{
			Name:        t.Name,
			Description: anthropic.String(t.Description),
			Strict:      anthropic.Bool(true),
			InputSchema: anthropic.ToolInputSchemaParam{
				Properties:  props,
				Required:    required,
				ExtraFields: map[string]any{"additionalProperties": false},
			},
		}
		tools = append(tools, anthropic.ToolUnionParam{OfTool: &tp})
	}
	effort := p.Effort
	if effort == "" {
		effort = DefaultEffort
	}
	params := anthropic.MessageNewParams{
		Model:      anthropic.Model(p.Model),
		MaxTokens:  req.MaxTokens,
		System:     []anthropic.TextBlockParam{{Text: req.System}},
		Messages:   anthropicMessages(req.Messages),
		Tools:      tools,
		ToolChoice: anthropic.ToolChoiceUnionParam{OfAuto: &anthropic.ToolChoiceAutoParam{}},
		Thinking:   anthropic.ThinkingConfigParamUnion{OfAdaptive: &anthropic.ThinkingConfigAdaptiveParam{}},
		OutputConfig: anthropic.OutputConfigParam{
			Effort: effort,
		},
		// Tools and system repeat on every round of the tool loop.
		CacheControl: anthropic.NewCacheControlEphemeralParam(),
	}
	return &anthropicConv{client: p.client(), params: params}
}

// anthropicMessages turns the device conversation into alternating turns that
// start with the user (consecutive messages of one role are joined).
func anthropicMessages(in []Message) []anthropic.MessageParam {
	var out []anthropic.MessageParam
	var role, text string
	flush := func() {
		if text == "" {
			return
		}
		if role == "assistant" {
			out = append(out, anthropic.NewAssistantMessage(anthropic.NewTextBlock(text)))
		} else {
			out = append(out, anthropic.NewUserMessage(anthropic.NewTextBlock(text)))
		}
	}
	for _, m := range in {
		r := "user"
		if m.Role == "assistant" {
			r = "assistant"
		}
		if m.Text == "" {
			continue
		}
		if len(out) == 0 && role == "" && r == "assistant" {
			continue // the conversation must start with the user
		}
		if r == role {
			text += "\n\n" + m.Text
			continue
		}
		flush()
		role, text = r, m.Text
	}
	flush()
	return out
}

type anthropicConv struct {
	client anthropic.Client
	params anthropic.MessageNewParams
}

func (c *anthropicConv) Next(ctx context.Context, onText func(string)) (Round, error) {
	stream := c.client.Messages.NewStreaming(ctx, c.params)
	defer stream.Close()
	msg := anthropic.Message{}
	for stream.Next() {
		ev := stream.Current()
		if err := msg.Accumulate(ev); err != nil {
			return Round{}, &ProviderError{Code: CodeProviderError, Msg: "the provider sent a stream this server could not read"}
		}
		if d, ok := ev.AsAny().(anthropic.ContentBlockDeltaEvent); ok {
			if t, ok := d.Delta.AsAny().(anthropic.TextDelta); ok && t.Text != "" {
				onText(t.Text)
			}
		}
	}
	if err := stream.Err(); err != nil {
		return Round{}, anthropicError(ctx, err)
	}
	r := Round{
		RawStop: string(msg.StopReason),
		Input:   msg.Usage.InputTokens + msg.Usage.CacheCreationInputTokens + msg.Usage.CacheReadInputTokens,
		Output:  msg.Usage.OutputTokens,
	}
	switch msg.StopReason {
	case anthropic.StopReasonEndTurn, anthropic.StopReasonStopSequence:
		r.Stop = StopEndTurn
	case anthropic.StopReasonToolUse:
		r.Stop = StopToolUse
	case anthropic.StopReasonMaxTokens, anthropic.StopReasonModelContextWindowExceeded:
		r.Stop = StopMaxTokens
	case anthropic.StopReasonRefusal:
		r.Stop = StopRefusal
	case anthropic.StopReasonPauseTurn:
		r.Stop = StopPauseTurn
	default:
		r.Stop = Stop(msg.StopReason)
	}
	if r.Stop == StopToolUse || r.Stop == StopPauseTurn {
		// The assistant turn goes back unchanged, thinking blocks included.
		c.params.Messages = append(c.params.Messages, msg.ToParam())
	}
	if r.Stop == StopToolUse {
		for _, b := range msg.Content {
			if tu, ok := b.AsAny().(anthropic.ToolUseBlock); ok {
				args := json.RawMessage(tu.JSON.Input.Raw())
				if len(args) == 0 {
					args = tu.Input
				}
				r.ToolCalls = append(r.ToolCalls, ToolCall{ID: tu.ID, Name: tu.Name, Args: args})
			}
		}
	}
	return r, nil
}

func (c *anthropicConv) AddToolResults(results []ToolResult) {
	blocks := make([]anthropic.ContentBlockParamUnion, 0, len(results))
	for _, r := range results {
		blocks = append(blocks, anthropic.NewToolResultBlock(r.ID, r.Content, r.IsError))
	}
	c.params.Messages = append(c.params.Messages, anthropic.NewUserMessage(blocks...))
}

// anthropicError maps the SDK's typed errors onto ProviderError (status and
// error type only: the SDK's own message includes the request URL and body).
func anthropicError(ctx context.Context, err error) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	var apiErr *anthropic.Error
	if errors.As(err, &apiErr) {
		return providerErr(apiErr.StatusCode, string(apiErr.Type()))
	}
	return &ProviderError{Code: CodeProviderError, Msg: "the provider could not be reached"}
}
