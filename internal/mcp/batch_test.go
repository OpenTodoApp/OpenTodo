package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

// OpenSpec change bound-hostile-input: batches are bounded, and refused under
// protocol revisions that removed them.

func pingBatch(n int) []byte {
	msgs := make([]string, n)
	for i := range msgs {
		msgs[i] = fmt.Sprintf(`{"jsonrpc":"2.0","id":%d,"method":"ping"}`, i)
	}
	return []byte("[" + strings.Join(msgs, ",") + "]")
}

func TestBatchSizeLimit(t *testing.T) {
	f := newFixture(t)
	out, malformed := f.srv.Handle(context.Background(), u1, pingBatch(MaxBatch))
	var replies []map[string]any
	if err := json.Unmarshal(out, &replies); err != nil || malformed || len(replies) != MaxBatch {
		t.Fatalf("batch at the limit: malformed=%v %.200s", malformed, out)
	}
	out, malformed = f.srv.Handle(context.Background(), u1, pingBatch(MaxBatch+1))
	var r map[string]any
	if err := json.Unmarshal(out, &r); err != nil || !malformed || errCode(r) != CodeInvalidRequest {
		t.Fatalf("oversized batch: malformed=%v %.200s", malformed, out)
	}
}

func TestBatchRefusedAfter20250326(t *testing.T) {
	f := newFixture(t)
	for _, v := range []string{"2025-06-18", "2025-11-25"} {
		out, malformed := f.srv.HandleVersion(context.Background(), u1, v, pingBatch(2))
		var r map[string]any
		if err := json.Unmarshal(out, &r); err != nil || !malformed || errCode(r) != CodeInvalidRequest {
			t.Fatalf("%s batch: malformed=%v %s", v, malformed, out)
		}
	}
	for _, v := range []string{"", "2025-03-26"} {
		out, _ := f.srv.HandleVersion(context.Background(), u1, v, pingBatch(2))
		var replies []map[string]any
		if err := json.Unmarshal(out, &replies); err != nil || len(replies) != 2 {
			t.Fatalf("%q batch: %s", v, out)
		}
	}
	// A single message is fine under every revision.
	if out, malformed := f.srv.HandleVersion(context.Background(), u1, "2025-06-18", []byte(`{"jsonrpc":"2.0","id":1,"method":"ping"}`)); malformed || !strings.Contains(string(out), `"result"`) {
		t.Fatalf("single message: %s", out)
	}
}

func TestBatchResponseBudget(t *testing.T) {
	f := newFixture(t)
	for i := 0; i < 50; i++ {
		f.task("u1", fmt.Sprintf("t%02d", i), strings.Repeat("long title ", 20), nil)
	}
	one := `{"jsonrpc":"2.0","id":%d,"method":"tools/call","params":{"name":"list_tasks","arguments":{}}}`
	single := f.rpc("u1", fmt.Sprintf(one, 0))
	b, _ := json.Marshal(single)
	old := maxBatchResponseBytes
	maxBatchResponseBytes = 2*len(b) - 10 // spent after two replies
	defer func() { maxBatchResponseBytes = old }()

	msgs := make([]string, 5)
	for i := range msgs {
		msgs[i] = fmt.Sprintf(one, i)
	}
	msgs = append(msgs, `{"jsonrpc":"2.0","method":"notifications/initialized"}`)
	out, _ := f.srv.Handle(context.Background(), u1, []byte("["+strings.Join(msgs, ",")+"]"))
	if len(out) > 3*len(b) {
		t.Fatalf("batch answer %d bytes, budget %d", len(out), maxBatchResponseBytes)
	}
	var replies []map[string]any
	if err := json.Unmarshal(out, &replies); err != nil || len(replies) != 5 {
		t.Fatalf("replies: %v %.300s", err, out)
	}
	for i, r := range replies {
		if r["id"] != float64(i) {
			t.Fatalf("reply %d has id %v", i, r["id"])
		}
		over := errCode(r) == CodeInternalError
		if (i < 2 && over) || (i >= 2 && !over) {
			t.Fatalf("reply %d: %.200v", i, r)
		}
	}
}
