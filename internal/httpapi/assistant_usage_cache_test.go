package httpapi

import (
	"fmt"
	"net/http"
	"testing"
)

// cachedReply answers like Anthropic on a turn whose system text and tools
// came from the prompt cache: 18,000 cache-read, 2,000 fresh input, 300 output.
func cachedReply(w http.ResponseWriter, _ map[string]any) {
	w.Header().Set("Content-Type", "text/event-stream")
	fmt.Fprint(w, `event: message_start
data: {"type":"message_start","message":{"id":"m","type":"message","role":"assistant","model":"claude-opus-5-5","content":[],"usage":{"input_tokens":2000,"cache_read_input_tokens":18000,"cache_creation_input_tokens":0,"output_tokens":1}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Nothing is overdue."}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":300}}

event: message_stop
data: {"type":"message_stop"}

`)
}

// TestAssistantUsageCache: the scenarios "A cached turn", "Usage route
// reports cache" and "Unauthenticated usage request" (assistant-usage-cache).
func TestAssistantUsageCache(t *testing.T) {
	e, llm, _ := assistantEnv(t)
	e.enableAssistant(nil)
	e.consentAssistant("anthropic")
	llm.set(cachedReply)

	_, _, events := e.turn(ask("what's overdue?"))
	usage := named(events, "usage")
	if len(usage) != 1 {
		t.Fatalf("events %v", events)
	}
	d := usage[0].data
	if d["input"].(float64) != 2000 || d["cached"].(float64) != 18000 || d["cache_write"].(float64) != 0 || d["output"].(float64) != 300 || d["month_total"].(float64) != 4100 {
		t.Fatalf("usage event %v", d)
	}

	resp, out := e.do("GET", "/api/v1/me/assistant/usage", nil)
	e.mustStatus(resp, 200, out)
	if out["cached_tokens"].(float64) != 18000 || out["input_tokens"].(float64) != 2000 || out["total_tokens"].(float64) != 20300 || out["counted_tokens"].(float64) != 4100 {
		t.Fatalf("usage %v", out)
	}

	resp, out = newClientFor(e).do("GET", "/api/v1/me/assistant/usage", nil)
	if resp.StatusCode != 401 || out["error"].(map[string]any)["code"] != "unauthorized" {
		t.Fatalf("anonymous: %d %v", resp.StatusCode, out)
	}
}
