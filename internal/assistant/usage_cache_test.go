package assistant

import (
	"context"
	"strings"
	"testing"
)

// Recorded usage payloads of each provider (assistant-usage-cache, risk
// "provider field drift"): every adapter reads its cache fields apart from
// fresh input.

// anthropicCachedStream is a message whose usage reports cache reads and
// writes in message_start, as the Messages API streams it.
const anthropicCachedStream = `event: message_start
data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","model":"claude-opus-5-5","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":2000,"cache_creation_input_tokens":500,"cache_read_input_tokens":18000,"output_tokens":1}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Nothing is overdue."}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":300}}

event: message_stop
data: {"type":"message_stop"}

`

func TestAnthropicReadsCacheUsage(t *testing.T) {
	f := newFixture(t)
	srv, _ := fakeAnthropic(t, sse(anthropicCachedStream))
	res, _, _ := run(f, anthropicFor(srv), "what's overdue?")
	if res.Err != nil {
		t.Fatal(res.Err)
	}
	want := Tokens{Input: 2000, CachedRead: 18000, CachedWrite: 500, Output: 300}
	if res.Tokens != want {
		t.Fatalf("tokens %+v, want %+v", res.Tokens, want)
	}
}

// chatCachedText is a Chat Completions answer whose final usage chunk
// reports prompt_tokens_details.cached_tokens (OpenAI, and Gemini through
// Google's OpenAI-compatible endpoint): prompt_tokens includes them.
const chatCachedText = `data: {"choices":[{"index":0,"delta":{"content":"Nothing is overdue."}}]}

data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: {"choices":[],"usage":{"prompt_tokens":20000,"completion_tokens":300,"total_tokens":20300,"prompt_tokens_details":{"cached_tokens":18000}}}

data: [DONE]

`

func TestChatReadsCachedTokens(t *testing.T) {
	for _, name := range []string{OpenAI, Gemini, Compatible} {
		t.Run(name, func(t *testing.T) {
			f := newFixture(t)
			srv, _ := fakeAnthropic(t, sse(chatCachedText))
			res, _, _ := run(f, chatFor(srv, name), "what's overdue?")
			if res.Err != nil {
				t.Fatal(res.Err)
			}
			want := Tokens{Input: 2000, CachedRead: 18000, Output: 300}
			if res.Tokens != want {
				t.Fatalf("tokens %+v, want %+v", res.Tokens, want)
			}
		})
	}
	// Without the details every prompt token is fresh input.
	f := newFixture(t)
	srv, _ := fakeAnthropic(t, sse(strings.Replace(chatCachedText, `,"prompt_tokens_details":{"cached_tokens":18000}`, "", 1)))
	res, _, _ := run(f, chatFor(srv, OpenAI), "x")
	if want := (Tokens{Input: 20000, Output: 300}); res.Tokens != want {
		t.Fatalf("tokens %+v, want %+v", res.Tokens, want)
	}
}

// TestCountedTokens: the scenario "A cached turn": cache reads count at one
// tenth, rounded up, and cache writes in full.
func TestCountedTokens(t *testing.T) {
	tk := Tokens{Input: 2000, CachedRead: 18000, Output: 300}
	if tk.Total() != 20300 || tk.Counted() != 4100 {
		t.Fatalf("total %d counted %d", tk.Total(), tk.Counted())
	}
	if got := (Tokens{CachedRead: 1, CachedWrite: 7}).Counted(); got != 8 {
		t.Fatalf("counted %d", got)
	}
}

// TestUsageStoresCache: the month's row keeps the cached parts apart; a row
// written before has none and counts as recorded.
func TestUsageStoresCache(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()
	if err := st.AddUsage(ctx, "u1", Tokens{Input: 100, Output: 20}, false); err != nil {
		t.Fatal(err)
	}
	if err := st.AddUsage(ctx, "u1", Tokens{Input: 2000, CachedRead: 18000, Output: 300}, true); err != nil {
		t.Fatal(err)
	}
	u, err := st.Usage(ctx, "u1", 0)
	if err != nil {
		t.Fatal(err)
	}
	if u.InputTokens != 2100 || u.CachedTokens != 18000 || u.OutputTokens != 320 || u.Total() != 20420 {
		t.Fatalf("%+v", u)
	}
	if u.Counted(true) != 4220 || u.Counted(false) != 120 {
		t.Fatalf("counted %d/%d", u.Counted(true), u.Counted(false))
	}
	if u.Own.CachedTokens != 18000 || u.Own.Total() != 20300 {
		t.Fatalf("own %+v", u.Own)
	}
}
