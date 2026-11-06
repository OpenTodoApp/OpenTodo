package relay

import (
	"context"
	"strings"
	"testing"
)

// TestRequestCarriesTheCall (relay-request-transparency): the call a request
// serves, its arguments included, reaches the device inside the sealed box
// and never in the clear on the stream.
func TestRequestCarriesTheCall(t *testing.T) {
	h := NewHub()
	dev := newFakeDevice(t)
	s, err := h.Open("u1", "laptop", "sess", dev.pub())
	if err != nil {
		t.Fatal(err)
	}
	dev.connect(t, s)
	call := Call{Tool: "search_tasks", Token: "Claude.ai", Args: `{"query":"plumber"}`}
	got := make(chan request, 1)
	go func() {
		ev := <-s.Events()
		if strings.Contains(ev.Data, "plumber") || strings.Contains(ev.Data, "search_tasks") {
			t.Error("the call is on the stream in the clear")
		}
		id, req := dev.open(t, ev)
		got <- req
		_ = h.Answer("u1", "sess", id, dev.seal(id, answerBody{Results: []Result{{Value: "x"}}}))
	}()
	if _, err := h.Do(context.Background(), "u1", Decrypt, []Item{{Entity: "task", ID: "t1", Field: "title", Value: "enc:v1:x"}}, call); err != nil {
		t.Fatal(err)
	}
	if req := <-got; req.Call != call {
		t.Fatalf("device got %+v, want %+v", req.Call, call)
	}
}
