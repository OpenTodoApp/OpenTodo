package agenttools

import (
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/OpenTodoApp/opentodo/internal/relay"
)

// TestRelayRequestsNameTheCall (relay-request-transparency D2): every relay
// request of a call names the tool, the token and the call's arguments,
// compact and cut to relay.MaxArgs bytes.
func TestRelayRequestsNameTheCall(t *testing.T) {
	f := newFixture(t)
	f.task("u1", "t1", fakeSeal("task", "t1", "title", "Call the plumber"), nil)
	fr := &fakeRelay{}
	c := agent("u1")
	c.TokenName = "Claude.ai"
	c.Encrypted, c.Relay = true, fr
	f.mustCall(c, "get_task", map[string]any{"id": "t1"})
	if len(fr.about) != 1 || fr.about[0] != (relay.Call{Tool: "get_task", Token: "Claude.ai", Args: `{"id":"t1"}`}) {
		t.Fatalf("read request names %+v", fr.about)
	}
	long := strings.Repeat("é", 400)
	f.mustCall(c, "create_tasks", map[string]any{"items": []any{map[string]any{"title": long}}})
	w := fr.about[len(fr.about)-1]
	if w.Tool != "create_tasks" || !w.Write || len(w.Args) > relay.MaxArgs || !utf8.ValidString(w.Args) || !strings.HasPrefix(w.Args, `{"items":[{"title":"é`) {
		t.Fatalf("write request names %+v (%d bytes)", w, len(w.Args))
	}
	// A transport cannot bring arguments of its own: Call sets them.
	fr.about = nil
	c.relayArgs = "forged"
	f.mustCall(c, "get_task", map[string]any{"id": "t1"})
	if len(fr.about) != 1 || fr.about[0].Args != `{"id":"t1"}` {
		t.Fatalf("args = %+v", fr.about)
	}
}
