package rules

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/relay"
)

// routines-ai-step 3.3, 3.4: device runs of an encrypted account, with a
// synthetic device standing in for the relay.

// fakeDevices is the account's devices: which are opted in and online, and
// the routine.run requests sent to them.
type fakeDevices struct {
	opted, ai bool
	online    []string
	sent      []relay.RoutineRun
	to        []string
}

func (f *fakeDevices) Opted(context.Context, string) (bool, bool, error) { return f.opted, f.ai, nil }

func (f *fakeDevices) Online(_, device string) bool {
	for _, d := range f.online {
		if d == device {
			return true
		}
	}
	return false
}

func (f *fakeDevices) Send(_ string, _ bool, prefer string, run relay.RoutineRun) (relay.Sent, error) {
	if len(f.online) == 0 {
		return relay.Sent{}, relay.ErrNoDevice
	}
	d := f.online[0]
	if f.Online("", prefer) {
		d = prefer
	}
	f.sent = append(f.sent, run)
	f.to = append(f.to, d)
	return relay.Sent{DeviceID: d, SessionHash: "sess-" + d}, nil
}

const envelope = "enc:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

func sealed(n int) string { return fmt.Sprintf("enc:v1:%s%04d", strings.Repeat("B", 40), n) }

func deviceHarness(t *testing.T) (*harness, *fakeDevices) {
	h, _, _ := routineHarness(t)
	if _, err := h.e.db.Exec(`INSERT INTO encryption_keys(user_id, version, kdf, salt, iterations, wrapped_passphrase, wrapped_recovery, created_at, updated_at)
		VALUES ('alice', 1, 1, 's', 600000, 'p', 'r', 1, 1)`); err != nil {
		t.Fatal(err)
	}
	d := &fakeDevices{opted: true, online: []string{"laptop"}}
	h.e.Devices = d
	return h, d
}

// groceries is a content routine: it creates a task from a literal title.
const groceries = `[{"id":"a","kind":"create_tasks","in":{"title":{"literal":"Milk"}}}]`

func TestDeviceRunCommit(t *testing.T) {
	h, d := deviceHarness(t)
	h.routine("alice", "g", "Groceries", `{"kind":"manual"}`, "", groceries)
	res := h.runNow("alice", "g", "", false)
	if res.Run.Outcome != OutcomeWaiting || res.Run.DeviceID != "laptop" || len(d.sent) != 1 {
		t.Fatalf("dispatch: %+v sent %v", res.Run, d.sent)
	}
	req := d.sent[0]
	if req.RuleID != "g" || req.RunID != res.Run.RunID || req.Rev == "" || req.Op != relay.OpRoutineRun {
		t.Fatalf("request %+v", req)
	}
	steps := []StepRecord{{StepID: "a", Kind: "create_tasks", Status: StepOK, Items: 1, OutType: "tasks", IDs: []string{"new1"}}}
	commit := DeviceCommit{Steps: steps, Outcome: OutcomeApplied, Changes: []DeviceChange{{Entity: "task", ID: "new1", Create: true,
		Fields: map[string]json.RawMessage{"title": json.RawMessage(`"Milk"`), "priority": json.RawMessage(`4`), "created_at": json.RawMessage(`1`)}}}}
	// Another device's session is refused; plaintext content is refused.
	if _, err := h.e.CommitDeviceRun(h.ctx, "alice", req.RunID, "sess-phone", commit); !errors.Is(err, ErrNotYourRun) {
		t.Fatalf("other device: %v", err)
	}
	if _, err := h.e.CommitDeviceRun(h.ctx, "alice", req.RunID, "sess-laptop", commit); !errors.Is(err, ErrPlaintext) {
		t.Fatalf("plaintext: %v", err)
	}
	commit.Changes[0].Fields["title"] = json.RawMessage(`"` + sealed(1) + `"`)
	done, err := h.e.CommitDeviceRun(h.ctx, "alice", req.RunID, "sess-laptop", commit)
	if err != nil || done.Run.Outcome != OutcomeApplied || done.Run.Writes != 1 {
		t.Fatalf("commit: %+v %v", done.Run, err)
	}
	row := h.get("alice", "new1")
	if strOf(row["title"]) != sealed(1) {
		t.Fatalf("task %v", row)
	}
	var device string
	if err := h.e.db.QueryRow(`SELECT device FROM ops WHERE entity_id = 'new1' AND field = 'title'`).Scan(&device); err != nil || device != Device("g") {
		t.Fatalf("written by %q: %v", device, err)
	}
	// Twice: the run is closed.
	if _, err := h.e.CommitDeviceRun(h.ctx, "alice", req.RunID, "sess-laptop", commit); !errors.Is(err, ErrRunClosed) {
		t.Fatalf("second commit: %v", err)
	}
	// Undo run works on a device run.
	if _, err := h.e.Undo(h.ctx, "alice", "g", req.RunID); err != nil {
		t.Fatalf("undo: %v", err)
	}
}

func TestDeviceRunRoutineChanged(t *testing.T) {
	h, d := deviceHarness(t)
	h.routine("alice", "g", "Groceries", `{"kind":"manual"}`, "", groceries)
	h.runNow("alice", "g", "", false)
	h.write("alice", "phone", "rule", "g", map[string]any{"steps": json.RawMessage(`[{"id":"a","kind":"create_tasks","in":{"title":{"literal":"Bread"}}}]`)})
	_, err := h.e.CommitDeviceRun(h.ctx, "alice", d.sent[0].RunID, "sess-laptop", DeviceCommit{})
	if !errors.Is(err, ErrRoutineChanged) {
		t.Fatalf("changed: %v", err)
	}
	run, _ := h.e.Store.RunByID(h.ctx, "alice", d.sent[0].RunID)
	if run.Outcome != OutcomeFailed || run.Reason != ReasonRoutineChanged {
		t.Fatalf("run %+v", run)
	}
}

// "Laptop closed for the weekend" and "Missed" (D9).
func TestDeviceRunWaiting(t *testing.T) {
	h, d := deviceHarness(t)
	d.online = nil
	h.routine("alice", "g", "Groceries", `{"kind":"manual"}`, "", groceries)
	friday := h.runNow("alice", "g", "", false)
	if friday.Run.Outcome != OutcomeWaiting || friday.Run.DeviceID != "" {
		t.Fatalf("friday %+v", friday.Run)
	}
	h.clock = h.clock.Add(20 * time.Hour)
	saturday := h.runNow("alice", "g", "", false)
	if run, _ := h.e.Store.RunByID(h.ctx, "alice", friday.Run.RunID); run.Outcome != OutcomeSkipped || run.Reason != ReasonSuperseded {
		t.Fatalf("friday after saturday %+v", run)
	}
	inbox, err := h.e.Store.InboxRuns(h.ctx, "alice", 0, false)
	if err != nil || len(inbox) != 1 || inbox[0].Kind != InboxWaiting || inbox[0].RunID != saturday.Run.RunID {
		t.Fatalf("inbox %+v %v", inbox, err)
	}
	// The laptop opens: it gets the Saturday occurrence.
	d.online = []string{"laptop"}
	h.e.DispatchWaiting(h.ctx, "alice", "laptop")
	if len(d.sent) != 1 || d.sent[0].RunID != saturday.Run.RunID {
		t.Fatalf("sent %+v", d.sent)
	}
	// Nobody commits for 24 hours: missed, a failure.
	next, ok, err := h.e.nextMiss(h.ctx)
	if err != nil || !ok || !next.Equal(time.UnixMilli(saturday.Run.At).Add(WaitLimit)) {
		t.Fatalf("next miss %v %v %v", next, ok, err)
	}
	h.clock = h.clock.Add(WaitLimit)
	if err := h.e.missWaiting(h.ctx); err != nil {
		t.Fatal(err)
	}
	run, _ := h.e.Store.RunByID(h.ctx, "alice", saturday.Run.RunID)
	if run.Outcome != OutcomeMissed || run.Reason != ReasonNoDevice {
		t.Fatalf("saturday %+v", run)
	}
	if _, err := h.e.CommitDeviceRun(h.ctx, "alice", run.RunID, "sess-laptop", DeviceCommit{}); !errors.Is(err, ErrRunClosed) {
		t.Fatalf("late commit: %v", err)
	}
}

// Without an opted-in device content routines keep being skipped; content-free
// ones run on the server.
func TestDeviceRunNeedsOptIn(t *testing.T) {
	h, d := deviceHarness(t)
	d.opted = false
	h.routine("alice", "g", "Groceries", `{"kind":"manual"}`, "", groceries)
	if res := h.runNow("alice", "g", "", false); res.Run.Outcome != OutcomeSkipped || res.Run.Reason != ErrCodeEncrypted {
		t.Fatalf("no device: %+v", res.Run)
	}
	d.opted = true
	h.task("alice", "o1", map[string]any{"due": map[string]string{"date": "2026-10-01"}})
	h.routine("alice", "free", "Overdue", `{"kind":"manual"}`, "", `[{"id":"a","kind":"find_tasks","in":{"condition":{"literal":{"due":"overdue"}}}},
		{"id":"b","kind":"change_tasks","in":{"tasks":{"ref":"a"},"set":{"literal":{"due":"tomorrow"}}}}]`)
	if res := h.runNow("alice", "free", "", false); res.Run.Outcome != OutcomeApplied || len(d.sent) != 0 {
		t.Fatalf("content-free: %+v", res.Run)
	}
}

// Run now on the device in hand: nothing goes over the relay; that session commits.
func TestDeviceRunInHand(t *testing.T) {
	h, d := deviceHarness(t)
	h.routine("alice", "g", "Groceries", `{"kind":"manual"}`, "", groceries)
	res, err := h.e.RunNow(h.ctx, "alice", RunRequest{RuleID: "g", RunID: "mine", Device: "phone", Session: "sess-in-hand"})
	if err != nil || res.DeviceRun == nil || res.Run.DeviceID != "phone" || len(d.sent) != 0 {
		t.Fatalf("in hand: %+v %v sent %v", res, err, d.sent)
	}
	run, err := h.e.FailDeviceRun(h.ctx, "alice", "mine", "sess-in-hand", DeviceFail{Step: 0, Code: "not_found",
		Steps: []StepRecord{{StepID: "a", Kind: "create_tasks", Status: StepFailed, Error: "not_found"}}})
	if err != nil || run.Outcome != OutcomeFailed || run.Reason != "not_found" || run.FailedStep != 0 {
		t.Fatalf("fail: %+v %v", run, err)
	}
}

// An AI routine of an encrypted account: a proposal is one envelope; auto
// mode's limits fall back (D5, D8).
func TestDeviceRunAI(t *testing.T) {
	h, d := deviceHarness(t)
	d.ai = true
	h.routine("alice", "s", "Sort", `{"kind":"manual"}`, "", `[{"id":"a","kind":"ask_ai","in":{"instruction":{"literal":"ideas"},"answer":{"literal":"lines"}}},
		{"id":"b","kind":"create_tasks","in":{"text":{"ref":"a"}}}]`)
	res := h.runNow("alice", "s", "", false)
	runID := res.Run.RunID
	if res.Run.Outcome != OutcomeWaiting || d.sent[0].Auto {
		t.Fatalf("dispatch %+v %+v", res.Run, d.sent)
	}
	create := func(n int) []DeviceChange {
		var out []DeviceChange
		for i := range n {
			out = append(out, DeviceChange{Entity: "task", ID: fmt.Sprintf("n%d", i), Create: true, Fields: map[string]json.RawMessage{"title": json.RawMessage(`"` + sealed(i) + `"`)}})
		}
		return out
	}
	// Not in auto mode: writes are refused, the device commits a proposal.
	if _, err := h.e.CommitDeviceRun(h.ctx, "alice", runID, "sess-laptop", DeviceCommit{Changes: create(2)}); !errors.Is(err, ErrFallback) {
		t.Fatalf("writes without auto: %v", err)
	}
	done, err := h.e.CommitDeviceRun(h.ctx, "alice", runID, "sess-laptop", DeviceCommit{Tokens: 420, Proposal: &DeviceProposal{Envelope: envelope, Items: 2},
		Steps: []StepRecord{{StepID: "a", Kind: "ask_ai", Status: StepOK, Tokens: 420}, {StepID: "b", Kind: "create_tasks", Status: StepOK, Items: 2}}})
	if err != nil || done.Run.Outcome != OutcomeProposal || done.Run.Tokens != 420 {
		t.Fatalf("proposal: %+v %v", done.Run, err)
	}
	ps, _ := h.e.Store.Proposals(h.ctx, "alice")
	if len(ps) != 1 || !ps[0].Encrypted || ps[0].Items != 2 {
		t.Fatalf("proposals %+v", ps)
	}
	p, err := h.e.GetProposal(h.ctx, "alice", ps[0].ID)
	if err != nil || p.Envelope != envelope {
		t.Fatalf("proposal body %+v %v", p, err)
	}
	if usage, _ := h.e.Store.AIUsage(h.ctx, "alice", "s"); len(usage) != 1 || usage[0].Tokens != 420 {
		t.Fatalf("usage %+v", usage)
	}
	// Another device decrypts it and applies one of the two items (D3).
	if _, err := h.e.ApplyProposal(h.ctx, "alice", p.ID, nil); !errors.Is(err, ErrProposalEncrypted) {
		t.Fatalf("plaintext apply: %v", err)
	}
	plain := []DeviceChange{{Entity: "task", ID: "n0", Create: true, Fields: map[string]json.RawMessage{"title": json.RawMessage(`"Idea"`)}}}
	if _, err := h.e.ApplyEncryptedProposal(h.ctx, "alice", p.ID, EncryptedApply{Changes: plain}); !errors.Is(err, ErrPlaintext) {
		t.Fatalf("plaintext items: %v", err)
	}
	applied, err := h.e.ApplyEncryptedProposal(h.ctx, "alice", p.ID, EncryptedApply{Changes: create(1), Skipped: 1})
	if err != nil || applied.State != ProposalPartly || applied.Applied != 1 || applied.Skipped != 1 {
		t.Fatalf("apply: %+v %v", applied, err)
	}
	if row := h.get("alice", "n0"); strOf(row["title"]) != sealed(0) {
		t.Fatalf("applied task %v", row)
	}
	if _, err := h.e.ApplyEncryptedProposal(h.ctx, "alice", p.ID, EncryptedApply{Changes: create(1)}); !errors.Is(err, ErrProposalClosed) {
		t.Fatalf("twice: %v", err)
	}
	// Auto mode (switched on by the person): 21 items fall back.
	h.clock = h.clock.Add(time.Minute)
	h.write("alice", "laptop", "rule", "s", map[string]any{"ai_apply": "auto"})
	res = h.runNow("alice", "s", "", false)
	if !d.sent[len(d.sent)-1].Auto {
		t.Fatalf("auto not sent: %+v", d.sent)
	}
	if _, err := h.e.CommitDeviceRun(h.ctx, "alice", res.Run.RunID, "sess-laptop", DeviceCommit{Changes: create(21)}); !errors.Is(err, ErrFallback) {
		t.Fatalf("21 items: %v", err)
	}
	if mode, _ := h.e.AIMode(h.ctx, "alice", "s"); mode.Auto || mode.Reason != FallbackLimit {
		t.Fatalf("mode %+v", mode)
	}
}

func TestDeviceRunWriteLimit(t *testing.T) {
	h, d := deviceHarness(t)
	h.routine("alice", "g", "Groceries", `{"kind":"manual"}`, "", groceries)
	h.runNow("alice", "g", "", false)
	var many []DeviceChange
	for i := range MaxWrites + 1 {
		many = append(many, DeviceChange{Entity: "task", ID: fmt.Sprintf("m%d", i), Create: true, Fields: map[string]json.RawMessage{"priority": json.RawMessage(`4`)}})
	}
	if _, err := h.e.CommitDeviceRun(h.ctx, "alice", d.sent[0].RunID, "sess-laptop", DeviceCommit{Changes: many}); !errors.Is(err, ErrDeviceWrites) {
		t.Fatalf("write limit: %v", err)
	}
}
