package relay

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/store"
)

// routines-ai-step 3.2: routine.run requests over the relay and the routines
// opt-in that survives locking.

func openRoutine(t *testing.T, d *fakeDevice, ev Event) RoutineRun {
	t.Helper()
	if ev.Name != "routine" {
		t.Fatalf("event %q, want routine", ev.Name)
	}
	var env struct{ ID, Box string }
	if err := json.Unmarshal([]byte(ev.Data), &env); err != nil {
		t.Fatal(err)
	}
	raw, _ := b64.DecodeString(env.Box)
	n := d.aead.NonceSize()
	plain, err := d.aead.Open(nil, raw[:n], raw[n:], []byte(env.ID))
	if err != nil {
		t.Fatalf("routine request does not open: %v", err)
	}
	var r RoutineRun
	if err := json.Unmarshal(plain, &r); err != nil {
		t.Fatal(err)
	}
	if env.ID != r.RunID {
		t.Fatalf("envelope id %q, run %q", env.ID, r.RunID)
	}
	return r
}

func TestSendRoutineToSuitableDevice(t *testing.T) {
	h := NewHub()
	mcpOnly := newFakeDevice(t)
	plain := newFakeDevice(t)
	withAI := newFakeDevice(t)
	sm, _ := h.OpenWith("u1", "tablet", "s1", mcpOnly.pub(), Roles{MCP: true})
	sp, _ := h.OpenWith("u1", "phone", "s2", plain.pub(), Roles{Routines: true, Caps: []string{CapRoutines}})
	sa, _ := h.OpenWith("u1", "laptop", "s3", withAI.pub(), Roles{Routines: true, Caps: []string{CapRoutines, CapAI}})
	plain.connect(t, sp)
	withAI.connect(t, sa)
	_ = sm

	// The MCP-only stream never gets a routine; AI routines need the ai capability.
	if _, err := h.SendRoutine("u1", true, "phone", RoutineRun{RuleID: "r", RunID: "run1"}); err != nil {
		t.Fatal(err)
	}
	got := openRoutine(t, withAI, <-sa.Events())
	if got.Op != OpRoutineRun || got.RuleID != "r" || got.RunID != "run1" {
		t.Fatalf("request %+v", got)
	}
	// A routine without AI prefers the asked device.
	sent, err := h.SendRoutine("u1", false, "phone", RoutineRun{RuleID: "r", RunID: "run2", TaskID: "t1"})
	if err != nil || sent.DeviceID != "phone" || sent.SessionHash != "s2" {
		t.Fatalf("sent %+v %v", sent, err)
	}
	if r := openRoutine(t, plain, <-sp.Events()); r.TaskID != "t1" {
		t.Fatalf("request %+v", r)
	}
	if !h.CanRun("u1", true) || h.CanRun("u2", false) {
		t.Fatal("CanRun")
	}
	// AI connectors' calls never go to a routines-only stream.
	h.Close(sm)
	if h.Online("u1") {
		t.Fatal("a routines stream counts as online for AI connectors")
	}
	if _, err := h.Do(context.Background(), "u1", Decrypt, []Item{{Entity: "task", ID: "t", Field: "title", Value: "enc:v1:x"}}, Call{Tool: "get_task"}); err == nil {
		t.Fatal("a relayed call reached a routines-only stream")
	}
	h.Close(sa)
	if _, err := h.SendRoutine("u1", true, "", RoutineRun{RunID: "run3"}); !errors.Is(err, ErrNoDevice) {
		t.Fatalf("no AI device: %v", err)
	}
}

func TestRoutinesOptIn(t *testing.T) {
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	if _, err := db.Exec(`INSERT INTO users (id, email, name, password_hash, created_at) VALUES ('u1', 'a@b.c', 'A', '', 1)`); err != nil {
		t.Fatal(err)
	}
	s := NewStore(db)
	if fresh, err := s.EnableRoutines(ctx, "u1", "laptop", "Laptop", "sess"); err != nil || !fresh {
		t.Fatalf("enable routines: %v %v", fresh, err)
	}
	if fresh, err := s.Enable(ctx, "u1", "laptop", "Laptop", "sess"); err != nil || !fresh {
		t.Fatalf("enable mcp: %v %v", fresh, err)
	}
	if any, _ := s.Any(ctx, "u1"); !any {
		t.Fatal("mcp opt-in not counted")
	}
	// Locking ends the AI connector opt-in only.
	if d, err := s.Disable(ctx, "u1", "laptop"); err != nil || d == nil {
		t.Fatalf("disable mcp: %v %v", d, err)
	}
	if any, _ := s.Any(ctx, "u1"); any {
		t.Fatal("mcp opt-in survived")
	}
	opted, ai, err := s.RoutineDevices(ctx, "u1")
	if err != nil || !opted || ai {
		t.Fatalf("routines after lock: %v %v %v", opted, ai, err)
	}
	if err := s.SetCapabilities(ctx, "u1", "laptop", []string{"ai", "routines", "bogus", "ai"}); err != nil {
		t.Fatal(err)
	}
	d, _ := s.Get(ctx, "u1", "laptop")
	if d == nil || !d.Routines || d.MCP || len(d.Capabilities) != 2 || !d.Has(CapAI) {
		t.Fatalf("device %+v", d)
	}
	if _, ai, _ := s.RoutineDevices(ctx, "u1"); !ai {
		t.Fatal("ai capability not read")
	}
	// Turning it off from any device removes the row.
	if d, err := s.DisableRoutines(ctx, "u1", "laptop"); err != nil || d == nil {
		t.Fatalf("disable routines: %v %v", d, err)
	}
	if d, _ := s.Get(ctx, "u1", "laptop"); d != nil {
		t.Fatalf("row kept: %+v", d)
	}
	// Sign-out ends both.
	_, _ = s.EnableRoutines(ctx, "u1", "phone", "Phone", "s2")
	_, _ = s.Enable(ctx, "u1", "phone", "Phone", "s2")
	if ended, _ := s.DisableSession(ctx, "u1", "s2"); len(ended) != 1 {
		t.Fatalf("ended %v", ended)
	}
	if opted, _, _ := s.RoutineDevices(ctx, "u1"); opted {
		t.Fatal("routines opt-in survived sign-out")
	}
	// A new session's opt-in does not keep the old session's other opt-in.
	_, _ = s.Enable(ctx, "u1", "tab", "Tab", "old")
	_, _ = s.EnableRoutines(ctx, "u1", "tab", "Tab", "new")
	if d, _ := s.Get(ctx, "u1", "tab"); d.MCP || !d.Routines || d.SessionHash != "new" {
		t.Fatalf("rebound %+v", d)
	}
	// Encryption off ends everything.
	if all, _ := s.DisableAll(ctx, "u1"); len(all) != 1 {
		t.Fatalf("all %v", all)
	}
}
