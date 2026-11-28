package rules

import (
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"strings"
	"testing"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Undo cannot put back an older v2 ciphertext (OpenSpec change e2ee-rollback,
// design D3): devices would refuse it as an older version, and the server
// refuses it as stale. The field is reported as not undoable; the rest of the
// run's changes go back.
func TestUndoSkipsEncryptedFields(t *testing.T) {
	h, _, _ := routineHarness(t)
	env := func(stamp int64) json.RawMessage {
		body := binary.BigEndian.AppendUint64(nil, uint64(stamp))
		body = append(body, []byte(strings.Repeat("n", 32))...)
		b, _ := json.Marshal("enc:v2:" + base64.RawURLEncoding.EncodeToString(body))
		return b
	}
	before := h.sync.ServerTSAt(h.clock.UnixMilli())
	// The device's title and priority before the run.
	if _, err := h.sync.ApplyStrict(h.ctx, "alice", []opsync.Op{
		{ID: "d1", Entity: "task", EntityID: "t1", Field: "title", Value: env(before), TS: before, Device: "phone"},
		{ID: "d2", Entity: "task", EntityID: "t1", Field: "priority", Value: json.RawMessage(`4`), TS: before, Device: "phone"},
		{ID: "d3", Entity: "task", EntityID: "t1", Field: "created_at", Value: json.RawMessage(`1`), TS: before, Device: "phone"},
	}); err != nil {
		t.Fatal(err)
	}
	// What a device run of routine r1 wrote: a new title and a priority.
	run := h.sync.ServerTSAt(h.clock.UnixMilli())
	dev := Device("r1")
	if _, err := h.sync.ApplyStrict(h.ctx, "alice", []opsync.Op{
		{ID: opID("r1", "k", "t1", "title"), Entity: "task", EntityID: "t1", Field: "title", Value: env(run), TS: run, Device: dev},
		{ID: opID("r1", "k", "t1", "priority"), Entity: "task", EntityID: "t1", Field: "priority", Value: json.RawMessage(`1`), TS: run, Device: dev},
	}); err != nil {
		t.Fatal(err)
	}
	ts := h.sync.ServerTSAt(h.clock.UnixMilli())
	ops, restored, sealed, err := h.e.undoEntity(h.ctx, "r1", "k", written{Entity: "task", ID: "t1", Fields: []string{"priority", "title"}}, h.clock.UnixMilli(), ts, dev)
	if err != nil || !restored || !sealed || len(ops) != 1 || ops[0].Field != "priority" {
		t.Fatalf("undo plan: %+v %v %v %v", ops, restored, sealed, err)
	}
	if _, err := h.sync.ApplyStrict(h.ctx, "alice", ops); err != nil {
		t.Fatal(err)
	}
	e, _ := h.sync.Get(h.ctx, "alice", "task", "t1")
	if string(e["priority"]) != "4" || string(e["title"]) != string(env(run)) {
		t.Fatalf("after undo: %s %s", e["priority"], e["title"])
	}
	// Written again as a new op, the earlier ciphertext is refused as stale.
	_, err = h.sync.ApplyStrict(h.ctx, "alice", []opsync.Op{{ID: "again", Entity: "task", EntityID: "t1", Field: "title", Value: env(before), TS: ts + 1, Device: dev}})
	if rej, ok := err.(*opsync.RejectedError); !ok || rej.Reason != opsync.ReasonStaleCiphertext {
		t.Fatalf("replay: %v", err)
	}
}
