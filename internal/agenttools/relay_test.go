package agenttools

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"

	"github.com/pixari/opentodo/internal/e2ee"
	"github.com/pixari/opentodo/internal/relay"
)

// fakeRelay plays an opted-in device: an envelope is "enc:v1:" + base64url of
// "entity|id|field|plaintext" padded, so the test can check the binding.
type fakeRelay struct {
	calls []relay.Op
	asked [][]relay.Item
	err   error
}

func fakeSeal(entity, id, field, plain string) string {
	s := entity + "|" + id + "|" + field + "|" + plain
	for len(s) < 40 {
		s += " "
	}
	return "enc:v1:" + base64.RawURLEncoding.EncodeToString([]byte(s))
}

func (f *fakeRelay) Do(_ context.Context, op relay.Op, items []relay.Item, _ relay.Call) ([]relay.Result, error) {
	f.calls = append(f.calls, op)
	f.asked = append(f.asked, items)
	if f.err != nil {
		return nil, f.err
	}
	out := make([]relay.Result, len(items))
	for i, it := range items {
		if op == relay.Encrypt {
			out[i] = relay.Result{Value: fakeSeal(it.Entity, it.ID, it.Field, it.Value)}
			continue
		}
		raw, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(it.Value, "enc:v1:"))
		parts := strings.SplitN(strings.TrimRight(string(raw), " "), "|", 4)
		if err != nil || len(parts) != 4 || parts[0] != it.Entity || parts[1] != it.ID || parts[2] != it.Field {
			out[i] = relay.Result{Error: "decrypt_failed"}
			continue
		}
		out[i] = relay.Result{Value: parts[3]}
	}
	return out, nil
}

func TestRelayedReadDecryptsOnlyWhatIsShown(t *testing.T) {
	f := newFixture(t)
	f.task("u1", "t1", fakeSeal("task", "t1", "title", "Call the \"plumber\""), map[string]any{"description": fakeSeal("task", "t1", "description", "Ask about the leak")})
	f.task("u1", "t2", fakeSeal("task", "t2", "title", "Buy paint"), nil)
	f.task("u1", "t3", "enc:v1:"+strings.Repeat("Z", 40), nil) // not decryptable
	fr := &fakeRelay{}
	c := agent("u1")
	c.Encrypted, c.Relay = true, fr
	out := f.mustCall(c, "get_task", map[string]any{"id": "t1"})
	raw, _ := json.Marshal(out)
	if !strings.Contains(string(raw), `Call the \"plumber\"`) || !strings.Contains(string(raw), "Ask about the leak") {
		t.Fatalf("get_task = %s", raw)
	}
	if len(fr.asked) != 1 {
		t.Fatalf("device asked %d times", len(fr.asked))
	}
	for _, it := range fr.asked[0] {
		if it.ID != "t1" {
			t.Fatalf("asked for a value the result does not show: %+v", it)
		}
	}
	out = f.mustCall(c, "list_tasks", map[string]any{})
	raw, _ = json.Marshal(out)
	if !strings.Contains(string(raw), "Buy paint") || !strings.Contains(string(raw), e2ee.Placeholder) || strings.Contains(string(raw), "") {
		t.Fatalf("list_tasks = %s", raw)
	}
	// What is stored is still ciphertext.
	if !strings.HasPrefix(string(f.get("u1", "t2")["title"]), `"enc:v1:`) {
		t.Fatal("a read changed the stored title")
	}
}

func TestRelayedWriteStoresDeviceCiphertext(t *testing.T) {
	f := newFixture(t)
	fr := &fakeRelay{}
	c := agent("u1")
	c.Encrypted, c.Relay = true, fr
	out := f.mustCall(c, "create_tasks", map[string]any{"items": []any{map[string]any{"title": "Call the plumber"}}})
	raw, _ := json.Marshal(out)
	if strings.Contains(string(raw), "encryption_enabled") {
		t.Fatalf("create refused: %s", raw)
	}
	var ids []string
	_ = f.sync.DB().QueryRow(`SELECT COUNT(*) FROM ops WHERE field = 'title' AND value LIKE '%plumber%'`).Scan(new(int))
	rows, _ := f.sync.DB().Query(`SELECT entity_id, value FROM ops WHERE entity = 'task' AND field = 'title'`)
	for rows.Next() {
		var id, v string
		_ = rows.Scan(&id, &v)
		var s string
		_ = json.Unmarshal([]byte(v), &s)
		if s != fakeSeal("task", id, "title", "Call the plumber") {
			t.Fatalf("stored title %q is not the device's envelope for task %s", s, id)
		}
		ids = append(ids, id)
	}
	rows.Close()
	if len(ids) != 1 || len(fr.calls) != 1 || fr.calls[0] != relay.Encrypt {
		t.Fatalf("tasks %v, device calls %v", ids, fr.calls)
	}
	// The plaintext title never reached the database.
	var n int
	_ = f.sync.DB().QueryRow(`SELECT COUNT(*) FROM ops WHERE value LIKE '%plumber%'`).Scan(&n)
	if n != 0 {
		t.Fatalf("%d ops hold the plaintext", n)
	}
	// Without a relay the same call is refused as before.
	c.Relay = nil
	if _, err := f.call(c, "create_tasks", map[string]any{"items": []any{map[string]any{"title": "x"}}}); toolCode(err) != "encryption_enabled" {
		t.Fatalf("without a device: %v", err)
	}
}

func TestRelayErrorsWriteNothing(t *testing.T) {
	for _, code := range []string{relay.CodeUnavailable, relay.CodeTimeout, relay.CodeBusy, relay.CodeLimit, relay.CodeDeclined, relay.CodeRateLimited} {
		f := newFixture(t)
		c := agent("u1")
		c.Encrypted, c.Relay = true, &fakeRelay{err: &relay.Error{Code: code, RetryAfter: 5}}
		_, err := f.call(c, "create_tasks", map[string]any{"items": []any{map[string]any{"title": "Call the plumber"}}})
		if toolCode(err) != code {
			t.Fatalf("%s: got %v", code, err)
		}
		var n int
		_ = f.sync.DB().QueryRow(`SELECT COUNT(*) FROM ops`).Scan(&n)
		if n != 0 {
			t.Fatalf("%s: %d ops written", code, n)
		}
	}
}

func TestRelayedToolListIsPlain(t *testing.T) {
	f := newFixture(t)
	c := agent("u1")
	c.Encrypted, c.Relay = true, &fakeRelay{}
	for _, d := range f.reg.Definitions(c) {
		raw, _ := json.Marshal(d.InputSchema)
		if strings.Contains(string(raw), "ciphertext only") {
			t.Fatalf("%s still says ciphertext only", d.Name)
		}
	}
}
