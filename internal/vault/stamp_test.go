package vault

import (
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
)

func v2(stamp int64) json.RawMessage {
	body := binary.BigEndian.AppendUint64(nil, uint64(stamp))
	body = append(body, []byte(strings.Repeat("n", 32))...)
	b, _ := json.Marshal("enc:v2:" + base64.RawURLEncoding.EncodeToString(body))
	return b
}

// The vault's store keeps an older ciphertext out (e2ee-rollback D4): a v2
// value replayed under a newer timestamp, and a v1 value over one held as v2.
func TestStoreRefusesOlderCiphertext(t *testing.T) {
	s := Store{}
	op := func(id string, v json.RawMessage, ts int64) Op {
		return Op{ID: id, Entity: "task", EntityID: "t1", Field: "title", Value: v, TS: ts, Device: "A"}
	}
	if !s.Apply(op("a", v2(100), 100)) {
		t.Fatal("matching stamp not applied")
	}
	if s.Apply(op("b", v2(100), 200)) {
		t.Fatal("replayed under a later timestamp applied")
	}
	if got := s.Get("task", "t1")["title"]; got.TS != 100 {
		t.Fatalf("held = %+v", got)
	}
	// v1 over v2: refused from the writer release; the reader release applies
	// it, since honest writers still write v1 there.
	v1 := op("c", json.RawMessage(`"enc:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"`), 300)
	if got := OlderCiphertext(v1, s.Get("task", "t1")["title"], true); got != e2ee.WriterRelease {
		t.Fatalf("v1 over v2 refused = %v", got)
	}
	if !s.Apply(op("d", v2(400), 400)) {
		t.Fatal("a later value not applied")
	}
	// A title typed as "enc:v2: …" is text, not an envelope.
	if !s.Apply(Op{ID: "g", Entity: "task", EntityID: "t3", Field: "title", Value: json.RawMessage(`"enc:v2: release notes"`), TS: 5, Device: "A"}) {
		t.Fatal("typed title refused")
	}
	// v1 over v1 and plaintext stay as before.
	if !s.Apply(Op{ID: "e", Entity: "task", EntityID: "t2", Field: "title", Value: json.RawMessage(`"enc:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"`), TS: 5, Device: "A"}) ||
		!s.Apply(Op{ID: "f", Entity: "task", EntityID: "t2", Field: "title", Value: json.RawMessage(`"enc:v1:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"`), TS: 6, Device: "A"}) {
		t.Fatal("v1 refused")
	}
}
