package assistant

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// ---- Anthropic Messages streaming fake ----

type sseBlock struct {
	kind      string // text, tool_use, thinking
	text      string
	id, name  string
	input     string // raw JSON of a tool call
	signature string
}

// anthropicStream renders one streamed message as Messages API events.
func anthropicStream(blocks []sseBlock, stop string, in, out int) string {
	var b strings.Builder
	ev := func(name string, v any) {
		raw, _ := json.Marshal(v)
		fmt.Fprintf(&b, "event: %s\ndata: %s\n\n", name, raw)
	}
	ev("message_start", map[string]any{"type": "message_start", "message": map[string]any{"id": "msg_1", "type": "message", "role": "assistant",
		"model": "claude-opus-5-5", "content": []any{}, "stop_reason": nil, "stop_sequence": nil, "usage": map[string]any{"input_tokens": in, "output_tokens": 1}}})
	for i, bl := range blocks {
		switch bl.kind {
		case "text":
			ev("content_block_start", map[string]any{"type": "content_block_start", "index": i, "content_block": map[string]any{"type": "text", "text": ""}})
			for _, part := range strings.SplitAfter(bl.text, " ") {
				ev("content_block_delta", map[string]any{"type": "content_block_delta", "index": i, "delta": map[string]any{"type": "text_delta", "text": part}})
			}
		case "thinking":
			ev("content_block_start", map[string]any{"type": "content_block_start", "index": i, "content_block": map[string]any{"type": "thinking", "thinking": "", "signature": ""}})
			ev("content_block_delta", map[string]any{"type": "content_block_delta", "index": i, "delta": map[string]any{"type": "thinking_delta", "thinking": bl.text}})
			ev("content_block_delta", map[string]any{"type": "content_block_delta", "index": i, "delta": map[string]any{"type": "signature_delta", "signature": bl.signature}})
		case "tool_use":
			ev("content_block_start", map[string]any{"type": "content_block_start", "index": i, "content_block": map[string]any{"type": "tool_use", "id": bl.id, "name": bl.name, "input": map[string]any{}}})
			half := len(bl.input) / 2
			for _, part := range []string{bl.input[:half], bl.input[half:]} {
				ev("content_block_delta", map[string]any{"type": "content_block_delta", "index": i, "delta": map[string]any{"type": "input_json_delta", "partial_json": part}})
			}
		}
		ev("content_block_stop", map[string]any{"type": "content_block_stop", "index": i})
	}
	ev("message_delta", map[string]any{"type": "message_delta", "delta": map[string]any{"stop_reason": stop, "stop_sequence": nil}, "usage": map[string]any{"output_tokens": out}})
	ev("message_stop", map[string]any{"type": "message_stop"})
	return b.String()
}

type recorded struct {
	mu      sync.Mutex
	bodies  []map[string]any
	headers []http.Header
	paths   []string
}

func (r *recorded) add(req *http.Request) map[string]any {
	raw, _ := io.ReadAll(req.Body)
	var m map[string]any
	_ = json.Unmarshal(raw, &m)
	r.mu.Lock()
	defer r.mu.Unlock()
	r.bodies = append(r.bodies, m)
	r.headers = append(r.headers, req.Header.Clone())
	r.paths = append(r.paths, req.URL.Path)
	return m
}

func (r *recorded) n() int { r.mu.Lock(); defer r.mu.Unlock(); return len(r.bodies) }

// fakeAnthropic answers each request with the next scripted response.
func fakeAnthropic(t *testing.T, responses ...func(w http.ResponseWriter, body map[string]any)) (*httptest.Server, *recorded) {
	rec := &recorded{}
	var i atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := rec.add(r)
		n := int(i.Add(1)) - 1
		if n >= len(responses) {
			n = len(responses) - 1
		}
		responses[n](w, body)
	}))
	t.Cleanup(srv.Close)
	return srv, rec
}

func sse(stream string) func(w http.ResponseWriter, _ map[string]any) {
	return func(w http.ResponseWriter, _ map[string]any) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, stream)
	}
}

func apiError(status int, typ string) func(w http.ResponseWriter, _ map[string]any) {
	return func(w http.ResponseWriter, _ map[string]any) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("retry-after-ms", "5")
		w.WriteHeader(status)
		fmt.Fprintf(w, `{"type":"error","error":{"type":%q,"message":"nope"}}`, typ)
	}
}

const testKey = "sk-ant-TEST-KEY-never-shown"

func anthropicFor(srv *httptest.Server) *AnthropicProvider {
	return &AnthropicProvider{Key: testKey, Model: "claude-opus-5-5", BaseURL: srv.URL, HTTP: srv.Client(), MaxRetries: 2}
}

// TestAnthropicRequestShape: the Messages request is streamed with strict
// tools from the registry, tool_choice auto, adaptive thinking (never
// disabled) and an explicit effort; parallel tool results go back in one user
// message; thinking blocks are passed back unchanged.
func TestAnthropicRequestShape(t *testing.T) {
	f := newFixture(t)
	f.task("u1", "a", "Water plants", map[string]any{"due": map[string]any{"date": "2026-10-14"}})
	srv, rec := fakeAnthropic(t,
		sse(anthropicStream([]sseBlock{
			{kind: "thinking", text: "Let me look.", signature: "SIG-1"},
			{kind: "text", text: "Looking. "},
			{kind: "tool_use", id: "toolu_1", name: "today_summary", input: `{"timezone":"UTC"}`},
			{kind: "tool_use", id: "toolu_2", name: "get_task", input: `{"id":"missing"}`},
		}, "tool_use", 100, 20)),
		sse(anthropicStream([]sseBlock{{kind: "text", text: "You have one task due on Wednesday."}}, "end_turn", 150, 30)),
	)
	res, _, text := run(f, anthropicFor(srv), "what is due this week?")
	if res.Err != nil || res.Stop != StopEndTurn {
		t.Fatalf("turn: %+v", res)
	}
	if text != "Looking. You have one task due on Wednesday." {
		t.Fatalf("streamed text %q", text)
	}
	if res.Input != 250 || res.Output != 50 {
		t.Fatalf("usage %d/%d", res.Input, res.Output)
	}
	if rec.n() != 2 {
		t.Fatalf("%d requests", rec.n())
	}
	b := rec.bodies[0]
	h := rec.headers[0]
	if rec.paths[0] != "/v1/messages" || h.Get("X-Api-Key") != testKey || h.Get("Anthropic-Version") == "" {
		t.Fatalf("path %s headers %v", rec.paths[0], h)
	}
	if b["stream"] != true || b["model"] != "claude-opus-5-5" || b["max_tokens"].(float64) != MaxOutputTokens {
		t.Fatalf("body %v", b)
	}
	if tc := b["tool_choice"].(map[string]any); tc["type"] != "auto" {
		t.Fatalf("tool_choice %v", tc)
	}
	if th, ok := b["thinking"].(map[string]any); ok && th["type"] != "adaptive" {
		t.Fatalf("thinking %v", th)
	}
	if oc := b["output_config"].(map[string]any); oc["effort"] != "medium" {
		t.Fatalf("output_config %v", oc)
	}
	tools := b["tools"].([]any)
	if len(tools) < 10 {
		t.Fatalf("%d tools", len(tools))
	}
	for _, tl := range tools {
		m := tl.(map[string]any)
		s := m["input_schema"].(map[string]any)
		if m["strict"] != true || s["additionalProperties"] != false || s["type"] != "object" {
			t.Fatalf("tool %v", m)
		}
	}
	raw, _ := json.Marshal(tools)
	for _, kw := range []string{`"maxLength"`, `"maxItems"`, `"minimum"`, `"maximum"`} {
		if strings.Contains(string(raw), kw) {
			t.Fatalf("tools carry %s, outside the strict subset", kw)
		}
	}
	for _, name := range []string{"share_project", "add_member", "update_project", "purge"} {
		if strings.Contains(string(raw), `"name":"`+name+`"`) {
			t.Fatalf("offered %s", name)
		}
	}
	// Second request: the assistant turn with its thinking block, then one user
	// message carrying both tool results, the failed one flagged.
	msgs := rec.bodies[1]["messages"].([]any)
	asst := msgs[len(msgs)-2].(map[string]any)
	user := msgs[len(msgs)-1].(map[string]any)
	asstRaw, _ := json.Marshal(asst)
	if asst["role"] != "assistant" || !strings.Contains(string(asstRaw), `"signature":"SIG-1"`) || !strings.Contains(string(asstRaw), `"type":"thinking"`) {
		t.Fatalf("assistant turn %s", asstRaw)
	}
	blocks := user["content"].([]any)
	if user["role"] != "user" || len(blocks) != 2 {
		t.Fatalf("tool results %v", user)
	}
	first, second := blocks[0].(map[string]any), blocks[1].(map[string]any)
	if first["tool_use_id"] != "toolu_1" || first["is_error"] == true || second["tool_use_id"] != "toolu_2" || second["is_error"] != true {
		t.Fatalf("results %v", blocks)
	}
	if !strings.Contains(fmt.Sprint(b["system"]), "untrusted_text") {
		t.Fatal("system prompt missing")
	}
}

func TestAnthropicStopReasonsAndErrors(t *testing.T) {
	f := newFixture(t)
	t.Run("refusal", func(t *testing.T) {
		srv, _ := fakeAnthropic(t, sse(anthropicStream([]sseBlock{{kind: "text", text: "Partial "}}, "refusal", 10, 2)))
		res, _, _ := run(f, anthropicFor(srv), "x")
		if res.Stop != StopRefusal || res.Message != RefusalMessage || len(res.Changes) != 0 || res.Input != 10 {
			t.Fatalf("%+v", res)
		}
	})
	t.Run("max_tokens", func(t *testing.T) {
		srv, _ := fakeAnthropic(t, sse(anthropicStream([]sseBlock{{kind: "tool_use", id: "t", name: "complete_tasks", input: `{"ids":["a"`}}, "max_tokens", 10, 2)))
		res, _, _ := run(f, anthropicFor(srv), "x")
		if res.Stop != StopMaxTokens || len(res.Changes) != 0 {
			t.Fatalf("%+v", res)
		}
	})
	t.Run("bad key is provider_auth without the key", func(t *testing.T) {
		srv, rec := fakeAnthropic(t, apiError(401, "authentication_error"))
		res, _, _ := run(f, anthropicFor(srv), "x")
		pe, ok := AsProviderError(res.Err)
		if !ok || pe.Code != CodeProviderAuth || strings.Contains(pe.Error(), testKey) || rec.n() != 1 {
			t.Fatalf("%v (%d requests)", res.Err, rec.n())
		}
	})
	t.Run("400 is not retried", func(t *testing.T) {
		srv, rec := fakeAnthropic(t, apiError(400, "invalid_request_error"))
		res, _, _ := run(f, anthropicFor(srv), "x")
		if pe, ok := AsProviderError(res.Err); !ok || pe.Code != CodeProviderError || pe.Status != 400 || rec.n() != 1 {
			t.Fatalf("%v (%d requests)", res.Err, rec.n())
		}
	})
	t.Run("429 and 529 are retried with backoff", func(t *testing.T) {
		srv, rec := fakeAnthropic(t, apiError(429, "rate_limit_error"), apiError(529, "overloaded_error"), sse(anthropicStream([]sseBlock{{kind: "text", text: "ok"}}, "end_turn", 1, 1)))
		res, _, _ := run(f, anthropicFor(srv), "x")
		if res.Err != nil || rec.n() != 3 {
			t.Fatalf("%v (%d requests)", res.Err, rec.n())
		}
	})
	t.Run("rate limited after retries", func(t *testing.T) {
		srv, rec := fakeAnthropic(t, apiError(429, "rate_limit_error"))
		res, _, _ := run(f, anthropicFor(srv), "x")
		if pe, ok := AsProviderError(res.Err); !ok || pe.Code != CodeProviderRateLimited || rec.n() != 3 {
			t.Fatalf("%v (%d requests)", res.Err, rec.n())
		}
	})
}

// TestAnthropicCancellation: stopping a turn (the browser goes away) cancels
// the provider request mid-stream.
func TestAnthropicCancellation(t *testing.T) {
	f := newFixture(t)
	released := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		full := anthropicStream([]sseBlock{{kind: "text", text: "Hello there"}}, "end_turn", 1, 1)
		_, _ = io.WriteString(w, full[:strings.Index(full, "event: content_block_stop")])
		w.(http.Flusher).Flush()
		<-r.Context().Done()
		close(released)
	}))
	defer srv.Close()
	ctx, cancel := context.WithCancel(context.Background())
	var got string
	res := f.loop.Run(ctx, anthropicFor(srv), TurnInput{UserID: "u1", Zone: time.UTC, Messages: []Message{{Role: "user", Text: "hi"}}},
		Events{Text: func(s string) { got += s; cancel() }})
	if !errors.Is(res.Err, context.Canceled) || got == "" {
		t.Fatalf("err %v text %q", res.Err, got)
	}
	select {
	case <-released:
	case <-time.After(5 * time.Second):
		t.Fatal("the provider request was not cancelled")
	}
}

// ---- Chat Completions fake ----

func chatChunk(v any) string {
	raw, _ := json.Marshal(v)
	return "data: " + string(raw) + "\n\n"
}

func chatText(text, finish string) string {
	var b strings.Builder
	for _, part := range strings.SplitAfter(text, " ") {
		b.WriteString(chatChunk(map[string]any{"choices": []any{map[string]any{"index": 0, "delta": map[string]any{"content": part}}}}))
	}
	b.WriteString(chatChunk(map[string]any{"choices": []any{map[string]any{"index": 0, "delta": map[string]any{}, "finish_reason": finish}}}))
	b.WriteString(chatChunk(map[string]any{"choices": []any{}, "usage": map[string]any{"prompt_tokens": 40, "completion_tokens": 7}}))
	b.WriteString("data: [DONE]\n\n")
	return b.String()
}

func chatToolCalls(calls ...ToolCall) string {
	var b strings.Builder
	for i, c := range calls {
		args := string(c.Args)
		half := len(args) / 2
		b.WriteString(chatChunk(map[string]any{"choices": []any{map[string]any{"index": 0, "delta": map[string]any{"tool_calls": []any{
			map[string]any{"index": i, "id": c.ID, "type": "function", "function": map[string]any{"name": c.Name, "arguments": args[:half]}}}}}}}))
		b.WriteString(chatChunk(map[string]any{"choices": []any{map[string]any{"index": 0, "delta": map[string]any{"tool_calls": []any{
			map[string]any{"index": i, "function": map[string]any{"arguments": args[half:]}}}}}}}))
	}
	b.WriteString(chatChunk(map[string]any{"choices": []any{map[string]any{"index": 0, "delta": map[string]any{}, "finish_reason": "tool_calls"}}}))
	b.WriteString(chatChunk(map[string]any{"choices": []any{}, "usage": map[string]any{"prompt_tokens": 30, "completion_tokens": 9}}))
	b.WriteString("data: [DONE]\n\n")
	return b.String()
}

func chatFor(srv *httptest.Server, name string) *ChatProvider {
	return &ChatProvider{Name: name, BaseURL: srv.URL + "/v1", Key: "sk-TEST-KEY", Model: "test-model", HTTP: srv.Client(), Retries: 2, Backoff: time.Millisecond}
}

// TestCompatibleAdapterStreamsToolCalls: streamed, parallel tool calls are
// assembled from pieces, run, answered in tool messages, and usage is read
// from the final chunk (stream_options.include_usage).
func TestCompatibleAdapterStreamsToolCalls(t *testing.T) {
	f := newFixture(t)
	f.task("u1", "a", "Water plants", map[string]any{"due": map[string]any{"date": "2026-10-10"}})
	srv, rec := fakeAnthropic(t,
		sse(chatToolCalls(call("call_1", "today_summary", map[string]any{"timezone": "UTC"}), call("call_2", "schedule_tasks", map[string]any{"ids": []string{"a"}, "due": map[string]any{"date": "2026-10-16"}}))),
		sse(chatText("Moved Water plants to Friday.", "stop")),
	)
	res, _, text := run(f, chatFor(srv, Compatible), "move overdue to Friday")
	if res.Err != nil || res.Stop != StopEndTurn || len(res.Changes) != 1 || text != "Moved Water plants to Friday." {
		t.Fatalf("%+v %q", res, text)
	}
	if res.Input != 70 || res.Output != 16 {
		t.Fatalf("usage %d/%d", res.Input, res.Output)
	}
	b := rec.bodies[0]
	if rec.paths[0] != "/v1/chat/completions" || rec.headers[0].Get("Authorization") != "Bearer sk-TEST-KEY" {
		t.Fatalf("%s %v", rec.paths[0], rec.headers[0])
	}
	if b["stream"] != true || b["tool_choice"] != "auto" || b["stream_options"].(map[string]any)["include_usage"] != true || b["max_tokens"].(float64) != MaxOutputTokens {
		t.Fatalf("body %v", b)
	}
	msgs := b["messages"].([]any)
	if msgs[0].(map[string]any)["role"] != "system" {
		t.Fatal("no system message")
	}
	second := rec.bodies[1]["messages"].([]any)
	n := len(second)
	asst, t1, t2 := second[n-3].(map[string]any), second[n-2].(map[string]any), second[n-1].(map[string]any)
	if asst["role"] != "assistant" || len(asst["tool_calls"].([]any)) != 2 || t1["role"] != "tool" || t1["tool_call_id"] != "call_1" || t2["tool_call_id"] != "call_2" {
		t.Fatalf("history %v", second[n-3:])
	}
	if !strings.Contains(t2["content"].(string), `"proposed":true`) {
		t.Fatalf("tool result %v", t2)
	}
	// OpenAI takes max_completion_tokens instead.
	srv2, rec2 := fakeAnthropic(t, sse(chatText("ok", "stop")))
	run(f, chatFor(srv2, OpenAI), "x")
	if rec2.bodies[0]["max_completion_tokens"] == nil || rec2.bodies[0]["max_tokens"] != nil {
		t.Fatalf("openai body %v", rec2.bodies[0])
	}
}

func TestCompatibleFinishReasonMapping(t *testing.T) {
	for _, tc := range []struct {
		finish string
		want   Stop
	}{{"stop", StopEndTurn}, {"length", StopMaxTokens}, {"content_filter", StopRefusal}, {"tool_calls", StopToolUse}, {"something_else", "something_else"}} {
		var stream string
		if tc.finish == "tool_calls" {
			stream = chatToolCalls(call("c", "list_projects", map[string]any{}))
		} else {
			stream = chatText("hi", tc.finish)
		}
		srv, _ := fakeAnthropic(t, sse(stream))
		conv := chatFor(srv, Compatible).Start(Request{System: "s", Messages: []Message{{Role: "user", Text: "x"}}})
		r, err := conv.Next(context.Background(), func(string) {})
		if err != nil || r.Stop != tc.want {
			t.Fatalf("%s: %v %v", tc.finish, r.Stop, err)
		}
	}
	// Errors: auth, retried rate limits, server errors; never the key.
	srv, rec := fakeAnthropic(t, apiError(401, "invalid_api_key"))
	_, err := chatFor(srv, Compatible).Start(Request{}).Next(context.Background(), func(string) {})
	if pe, ok := AsProviderError(err); !ok || pe.Code != CodeProviderAuth || strings.Contains(err.Error(), "sk-TEST-KEY") || rec.n() != 1 {
		t.Fatalf("%v", err)
	}
	srv, rec = fakeAnthropic(t, apiError(429, "rate_limit"), sse(chatText("ok", "stop")))
	if _, err := chatFor(srv, Compatible).Start(Request{}).Next(context.Background(), func(string) {}); err != nil || rec.n() != 2 {
		t.Fatalf("%v %d", err, rec.n())
	}
	srv, rec = fakeAnthropic(t, apiError(500, "server_error"))
	if _, err := chatFor(srv, Compatible).Start(Request{}).Next(context.Background(), func(string) {}); rec.n() != 3 {
		t.Fatalf("%v %d", err, rec.n())
	}
}

// ---- network policy ----

type fakeResolver struct {
	mu      sync.Mutex
	answers [][]netip.Addr
	calls   int
}

func (r *fakeResolver) LookupNetIP(_ context.Context, _, _ string) ([]netip.Addr, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	a := r.answers[min(r.calls, len(r.answers)-1)]
	r.calls++
	return a, nil
}

func newTestStore(t *testing.T) *Store {
	f := newFixture(t)
	return NewStore(f.sync.DB(), t.TempDir(), nil)
}

func compatibleSettings(base string, allowPrivate bool) Settings {
	s := Defaults()
	s.Enabled = true
	s.DefaultProvider = Compatible
	s.AllowPrivateEndpoint = allowPrivate
	s.Providers[Compatible] = ProviderSettings{Enabled: true, Model: "llama-custom", BaseURL: base}
	return s
}

func TestAssistantPrivateEndpointRefused(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()
	net0 := Network{Resolver: &fakeResolver{answers: [][]netip.Addr{{netip.MustParseAddr("10.0.0.5")}}}}
	_, err := st.SaveSettings(ctx, "owner", compatibleSettings("http://llm.lan:11434/v1", false), nil, net0.CheckBaseURL, nil)
	if !errors.Is(err, ErrPrivateTarget) {
		t.Fatalf("err %v", err)
	}
	for _, raw := range []string{"http://127.0.0.1:11434/v1", "http://169.254.169.254/v1", "http://[::1]/v1", "http://192.168.1.20:11434/v1"} {
		if _, err := st.SaveSettings(ctx, "owner", compatibleSettings(raw, false), nil, net0.CheckBaseURL, nil); !errors.Is(err, ErrPrivateTarget) {
			t.Fatalf("%s: %v", raw, err)
		}
	}
	if s, _ := st.Settings(ctx); s.Enabled {
		t.Fatal("refused settings were stored")
	}
	// The owner's switch allows a model server on the LAN.
	if _, err := st.SaveSettings(ctx, "owner", compatibleSettings("http://192.168.1.20:11434/v1", true), nil, net0.CheckBaseURL, nil); err != nil {
		t.Fatal(err)
	}
	// Static validation names the field.
	var inv *InvalidError
	bad := compatibleSettings("", true)
	if _, err := st.SaveSettings(ctx, "owner", bad, nil, net0.CheckBaseURL, nil); !errors.As(err, &inv) || inv.Field != "providers.compatible.base_url" {
		t.Fatalf("%v", err)
	}
	bad = compatibleSettings("ftp://x/v1", true)
	if _, err := st.SaveSettings(ctx, "owner", bad, nil, net0.CheckBaseURL, nil); !errors.As(err, &inv) {
		t.Fatalf("%v", err)
	}
	if _, err := st.SaveSettings(ctx, "owner", compatibleSettings("http://user:pw@llm.example.com/v1", true), nil, net0.CheckBaseURL, nil); !errors.As(err, &inv) {
		t.Fatalf("credentials in URL: %v", err)
	}
}

// TestAssistantRebindingRefused: the name resolved to a public address at save
// time and to a private one when the turn connects; the connection is refused
// and nothing dials the private address.
func TestAssistantRebindingRefused(t *testing.T) {
	res := &fakeResolver{answers: [][]netip.Addr{{netip.MustParseAddr("93.184.216.34")}, {netip.MustParseAddr("10.0.0.5")}}}
	var dialed []string
	n := Network{Resolver: res, Dial: func(_ context.Context, _, addr string) (net.Conn, error) {
		dialed = append(dialed, addr)
		return nil, errors.New("test: no network")
	}}
	if err := n.CheckBaseURL(context.Background(), "http://llm.example.test/v1", false); err != nil {
		t.Fatal(err)
	}
	p := &ChatProvider{Name: Compatible, BaseURL: "http://llm.example.test/v1", Model: "m", HTTP: n.CompatibleClient(false), Backoff: time.Millisecond}
	_, err := p.Start(Request{}).Next(context.Background(), func(string) {})
	pe, ok := AsProviderError(err)
	if !ok || pe.Type != "private_target" || len(dialed) != 0 {
		t.Fatalf("err %v dialed %v", err, dialed)
	}
}

func TestAssistantNoRedirects(t *testing.T) {
	var hit atomic.Int32
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { hit.Add(1) }))
	defer target.Close()
	redirect := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, target.URL+"/v1/chat/completions", http.StatusTemporaryRedirect)
	}))
	defer redirect.Close()
	p := &ChatProvider{Name: Compatible, BaseURL: redirect.URL + "/v1", Model: "m", HTTP: Network{}.CompatibleClient(true), Backoff: time.Millisecond}
	_, err := p.Start(Request{}).Next(context.Background(), func(string) {})
	if pe, ok := AsProviderError(err); !ok || pe.Status != http.StatusTemporaryRedirect || hit.Load() != 0 {
		t.Fatalf("err %v, target hit %d", err, hit.Load())
	}
	if FixedClient().CheckRedirect == nil {
		t.Fatal("the built-in hosts' client follows redirects")
	}
}

// TestTestConnectionDetectsNoTools: an endpoint that refuses the request with
// a tool and accepts it without is reported as lacking tool support.
func TestTestConnectionDetectsNoTools(t *testing.T) {
	st := newTestStore(t)
	noTools := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		if strings.Contains(string(raw), `"tools"`) {
			w.WriteHeader(400)
			_, _ = io.WriteString(w, `{"error":{"type":"invalid_request_error","message":"tools are not supported"}}`)
			return
		}
		_, _ = io.WriteString(w, chatText("OK", "stop"))
	}))
	defer noTools.Close()
	svc := NewService(st, nil)
	svc.Backoff = time.Millisecond
	got := svc.TestConnection(context.Background(), Compatible, compatibleSettings(noTools.URL+"/v1", true), Draft{})
	if got.OK || got.Code != CodeNoToolSupport {
		t.Fatalf("%+v", got)
	}
	withTools := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, chatText("OK", "stop"))
	}))
	defer withTools.Close()
	if got := svc.TestConnection(context.Background(), Compatible, compatibleSettings(withTools.URL+"/v1", true), Draft{}); !got.OK {
		t.Fatalf("%+v", got)
	}
	// Private endpoint without the owner's switch, and a missing key.
	if got := svc.TestConnection(context.Background(), Compatible, compatibleSettings(withTools.URL+"/v1", false), Draft{}); got.Code != "private_target" {
		t.Fatalf("%+v", got)
	}
	// The on-screen private-endpoint switch counts before it is saved, both ways.
	on, off := true, false
	if got := svc.TestConnection(context.Background(), Compatible, compatibleSettings(withTools.URL+"/v1", false), Draft{AllowPrivateEndpoint: &on}); !got.OK {
		t.Fatalf("switch on, not saved: %+v", got)
	}
	if got := svc.TestConnection(context.Background(), Compatible, compatibleSettings(withTools.URL+"/v1", true), Draft{AllowPrivateEndpoint: &off}); got.Code != "private_target" {
		t.Fatalf("switch off, not saved: %+v", got)
	}
	s := Defaults()
	s.Providers[OpenAI] = ProviderSettings{Enabled: true, Model: "gpt-x"}
	if got := svc.TestConnection(context.Background(), OpenAI, s, Draft{}); got.Code != "no_key" {
		t.Fatalf("%+v", got)
	}
}
