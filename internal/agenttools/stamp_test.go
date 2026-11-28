package agenttools

import (
	"errors"
	"testing"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// A stale v2 ciphertext (e2ee-rollback D3) reaches the assistant's client
// (ot mcp --decrypt) as stale_ciphertext with the field's current timestamp,
// so it can seal the value again with a later stamp.
func TestStampFromEnvelope(t *testing.T) {
	err := applyError(&opsync.RejectedError{Op: opsync.Op{Entity: "task", EntityID: "t1", Field: "title"}, Reason: opsync.ReasonStaleCiphertext, Detail: "1764000000000"})
	var te *ToolError
	if !errors.As(err, &te) || te.Code != "stale_ciphertext" {
		t.Fatalf("err = %v", err)
	}
	items, _ := te.Data["items"].([]any)
	if len(items) != 1 || items[0].(map[string]any)["currentTs"] != int64(1764000000000) {
		t.Fatalf("data = %v", te.Data)
	}
	if err := applyError(&opsync.RejectedError{Reason: opsync.ReasonClockSkew}); !errors.As(err, &te) || te.Code != "clock_skew" {
		t.Fatalf("skew = %v", err)
	}
}
