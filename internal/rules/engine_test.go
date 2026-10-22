package rules

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/ids"
	"github.com/pixari/opentodo/internal/notify"
	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
)

type sinkCall struct{ kind, rule, task string }

type fakeSink struct{ calls []sinkCall }

func (f *fakeSink) RuleFired(_ context.Context, e notify.RuleEvent) {
	f.calls = append(f.calls, sinkCall{"fired", e.RuleID, e.TaskID})
}
func (f *fakeSink) RulePaused(_ context.Context, e notify.RuleEvent) {
	f.calls = append(f.calls, sinkCall{"paused", e.RuleID, ""})
}

type harness struct {
	t     *testing.T
	ctx   context.Context
	sync  *opsync.Service
	e     *Engine
	sink  *fakeSink
	clock time.Time
	n     int
}

// newHarness: alice and bob, an engine observing the sync service, a fixed
// clock (Wednesday 2026-10-21 12:00 UTC).
func newHarness(t *testing.T) *harness {
	t.Helper()
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	for _, u := range []string{"alice", "bob"} {
		if _, err := db.Exec(`INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,1)`, u, u+"@example.org", u, "x", "member"); err != nil {
			t.Fatal(err)
		}
	}
	h := &harness{t: t, ctx: context.Background(), sync: opsync.NewService(db), sink: &fakeSink{}, clock: time.Date(2026, 10, 21, 12, 0, 0, 0, time.UTC)}
	h.e = New(db, h.sync, slog.New(slog.NewTextHandler(io.Discard, nil)))
	h.e.Notify = h.sink
	h.e.SetClock(func() time.Time { return h.clock })
	h.sync.SetObserver(h.e.Observe)
	return h
}

// write applies fields of one entity as user from device.
func (h *harness) write(user, device, entity, id string, fields map[string]any) {
	h.t.Helper()
	h.n++
	var ops []opsync.Op
	for f, v := range fields {
		b, _ := json.Marshal(v)
		ops = append(ops, opsync.Op{ID: ids.New(), Entity: entity, EntityID: id, Field: f, Value: b, TS: h.sync.ServerTSAt(h.clock.UnixMilli()), Device: device})
	}
	if _, err := h.sync.ApplyStrict(h.ctx, user, ops); err != nil {
		h.t.Fatal(err)
	}
}

func (h *harness) rule(user, id, name string, trigger, condition, actions string) {
	h.t.Helper()
	fields := map[string]any{"name": name, "enabled": true, "trigger": json.RawMessage(trigger), "actions": json.RawMessage(actions),
		"condition": json.RawMessage("null"), "position": 1, "created_at": 1, "deleted_at": nil}
	if condition != "" {
		fields["condition"] = json.RawMessage(condition)
	}
	h.write(user, "laptop", "rule", id, fields)
}

func (h *harness) task(user, id string, fields map[string]any) {
	h.t.Helper()
	base := map[string]any{"title": id, "labels": []string{}, "priority": 4, "created_at": 1, "deleted_at": nil, "completed_at": nil}
	for k, v := range fields {
		base[k] = v
	}
	h.write(user, "phone", "task", id, base)
}

func (h *harness) get(user, id string) opsync.Entity {
	h.t.Helper()
	e, err := h.sync.Get(h.ctx, user, "task", id)
	if err != nil || e == nil {
		h.t.Fatalf("task %s: %v", id, err)
	}
	return e
}

func (h *harness) runs(ruleID string) []Run {
	h.t.Helper()
	r, err := h.e.Store.Runs(h.ctx, ruleID, 100)
	if err != nil {
		h.t.Fatal(err)
	}
	return r
}

func outcomes(rs []Run) []string {
	out := []string{}
	for _, r := range rs {
		out = append(out, r.Outcome+":"+r.Reason)
	}
	slices.Sort(out)
	return out
}

func TestObserveLabelAddedOnAPhone(t *testing.T) {
	h := newHarness(t)
	h.write("alice", "laptop", "project", "work", map[string]any{"name": "Work", "created_at": 1, "deleted_at": nil})
	h.write("alice", "laptop", "section", "waiting", map[string]any{"name": "Waiting", "project_id": "work", "created_at": 1, "deleted_at": nil})
	h.write("alice", "laptop", "label", "lw", map[string]any{"name": "waiting", "created_at": 1, "deleted_at": nil})
	h.rule("alice", "r1", "Waiting", `{"kind":"label.added","label_id":"lw"}`, "", `{"section":{"project_id":"work","section_id":"waiting"}}`)
	h.task("alice", "t1", nil)
	h.e.Drain(h.ctx)
	h.write("alice", "phone", "task", "t1", map[string]any{"labels": []string{"lw"}})
	h.e.Drain(h.ctx)
	got := h.get("alice", "t1")
	if strOf(got["project_id"]) != "work" || strOf(got["section_id"]) != "waiting" {
		t.Fatalf("task not moved: %s %s", got["project_id"], got["section_id"])
	}
	rs := h.runs("r1")
	if len(rs) != 1 || rs[0].Outcome != OutcomeApplied || rs[0].TaskID != "t1" || rs[0].Depth != 2 {
		t.Fatalf("runs %+v", rs)
	}
	// History: the batch carries the rule's device.
	var device string
	if err := h.e.db.QueryRow(`SELECT device FROM ops WHERE entity_id = 't1' AND field = 'section_id' ORDER BY seq DESC LIMIT 1`).Scan(&device); err != nil || device != "rule:r1" {
		t.Fatalf("device %q %v", device, err)
	}
	// Another label change does not fire again.
	h.write("alice", "phone", "task", "t1", map[string]any{"priority": 2})
	h.e.Drain(h.ctx)
	if len(h.runs("r1")) != 1 {
		t.Fatal("fired again")
	}
}

func TestImportDoesNotFireRules(t *testing.T) {
	h := newHarness(t)
	h.rule("alice", "r1", "Due", `{"kind":"task.created"}`, "", `{"priority":1}`)
	h.write("alice", "import", "task", "imp", map[string]any{"title": "x", "labels": []string{}, "priority": 4, "created_at": 1, "deleted_at": nil, "completed_at": nil})
	h.e.Drain(h.ctx)
	if len(h.runs("r1")) != 0 {
		t.Fatal("import fired a rule")
	}
	h.task("alice", "hand", nil)
	h.e.Drain(h.ctx)
	if p := string(h.get("alice", "hand")["priority"]); p != "1" {
		t.Fatalf("priority %s", p)
	}
}

func TestStaleOperationAndOtherAuthor(t *testing.T) {
	h := newHarness(t)
	h.rule("alice", "r1", "Done", `{"kind":"task.completed"}`, "", `{"add_labels":["x"]}`)
	// A batch by bob (a member of Alice's shared project) never fires Alice's rule.
	h.e.Observe(h.ctx, []opsync.Change{{UserID: "bob", Entity: "task", EntityID: "t", Origin: "bob-phone",
		Fields: map[string]opsync.FieldChange{"completed_at": {From: json.RawMessage("null"), To: json.RawMessage("5")}}}})
	if n, _ := h.e.Store.Pending(h.ctx); n != 0 {
		t.Fatalf("queued %d", n)
	}
	// A losing op produces no change, hence no event.
	h.task("alice", "t1", nil)
	h.e.Drain(h.ctx)
	h.write("alice", "phone", "task", "t1", map[string]any{"completed_at": 9})
	h.e.Drain(h.ctx)
	before := len(h.runs("r1"))
	op := opsync.Op{ID: ids.New(), Entity: "task", EntityID: "t1", Field: "completed_at", Value: json.RawMessage("null"), TS: 1, Device: "old"}
	if _, err := h.sync.Apply(h.ctx, "alice", []opsync.Op{op}); err != nil {
		t.Fatal(err)
	}
	if n, _ := h.e.Store.Pending(h.ctx); n != 0 || before != 1 {
		t.Fatalf("pending %d runs %d", n, before)
	}
}

func TestConditionFailsAndNothingToChange(t *testing.T) {
	h := newHarness(t)
	h.rule("alice", "r1", "P1 today", `{"kind":"task.created"}`, `{"project":"none","priority":{"in":[1]}}`, `{"due":"today"}`)
	h.rule("alice", "r2", "P1", `{"kind":"task.created"}`, "", `{"priority":1}`)
	h.task("alice", "t4", map[string]any{"priority": 4})
	h.task("alice", "t1", map[string]any{"priority": 1})
	h.e.Drain(h.ctx)
	if got := outcomes(h.runs("r1")); len(got) != 1 {
		t.Fatalf("r1 %v", got)
	}
	got := outcomes(h.runs("r2"))
	if !slices.Equal(got, []string{"already_matched:", "applied:"}) {
		t.Fatalf("r2 %v", got)
	}
}

func TestTwoRulesThatUndoEachOther(t *testing.T) {
	h := newHarness(t)
	for _, l := range []string{"x", "y"} {
		h.write("alice", "laptop", "label", l, map[string]any{"name": l, "created_at": 1, "deleted_at": nil})
	}
	h.rule("alice", "a", "A", `{"kind":"label.added","label_id":"x"}`, "", `{"remove_labels":["x"],"add_labels":["y"]}`)
	h.rule("alice", "b", "B", `{"kind":"label.added","label_id":"y"}`, "", `{"remove_labels":["y"],"add_labels":["x"]}`)
	h.task("alice", "t", nil)
	h.write("alice", "phone", "task", "t", map[string]any{"labels": []string{"x"}})
	for range 5 {
		h.e.Drain(h.ctx)
	}
	a, b := h.runs("a"), h.runs("b")
	if len(a) != 2 || len(b) != 1 {
		t.Fatalf("a %+v b %+v", a, b)
	}
	if a[0].Outcome != OutcomeStopped || a[0].Depth != 4 || b[0].Depth != 3 {
		t.Fatalf("a %+v b %+v", a, b)
	}
	if l := listOf(h.get("alice", "t")["labels"]); !slices.Equal(l, []string{"x"}) {
		t.Fatalf("labels %v", l)
	}
}

func TestReplayedEvent(t *testing.T) {
	h := newHarness(t)
	h.rule("alice", "r1", "P1", `{"kind":"task.created"}`, "", `{"priority":1}`)
	h.task("alice", "t", nil)
	evs, _ := h.e.Store.Take(h.ctx, 10)
	h.e.Drain(h.ctx)
	// The worker restarted before marking the event done: it is seen again.
	if err := h.e.Store.Enqueue(h.ctx, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := h.e.db.Exec(`INSERT INTO rule_events (id, user_id, task_id, kind, origin, depth, created_at) VALUES (?, 'alice', 't', 'task.created', 'phone', 1, 1)`, evs[0].ID); err != nil {
		t.Fatal(err)
	}
	var before int
	_ = h.e.db.QueryRow(`SELECT COUNT(*) FROM ops`).Scan(&before)
	h.e.Drain(h.ctx)
	var after int
	_ = h.e.db.QueryRow(`SELECT COUNT(*) FROM ops`).Scan(&after)
	if after != before || len(h.runs("r1")) != 1 {
		t.Fatalf("ops %d -> %d runs %d", before, after, len(h.runs("r1")))
	}
}

func TestRunawayRulePaused(t *testing.T) {
	h := newHarness(t)
	h.rule("alice", "r1", "Busy", `{"kind":"task.created"}`, "", `{"priority":1}`)
	for m := range 4 {
		for i := range PerMinute + 1 {
			h.task("alice", fmt.Sprintf("t%d-%d", m, i), nil)
		}
		h.e.Drain(h.ctx)
		h.clock = h.clock.Add(time.Minute)
	}
	st, _, _ := h.e.Store.State(h.ctx, "r1")
	if st.PausedReason != PausedRunaway {
		t.Fatalf("state %+v", st)
	}
	paused := 0
	for _, c := range h.sink.calls {
		if c.kind == "paused" {
			paused++
		}
	}
	if paused != 1 {
		t.Fatalf("paused notifications %d", paused)
	}
	// Turning the rule back on clears the pause.
	h.write("alice", "laptop", "rule", "r1", map[string]any{"enabled": false})
	h.write("alice", "laptop", "rule", "r1", map[string]any{"enabled": true})
	if st, _, _ := h.e.Store.State(h.ctx, "r1"); st.PausedReason != "" {
		t.Fatalf("still paused %+v", st)
	}
}

func TestCommentAndNotification(t *testing.T) {
	h := newHarness(t)
	h.rule("alice", "r1", "Note", `{"kind":"task.created"}`, "", `{"comment":{"text":"Picked up by the waiting rule"},"notify":true}`)
	h.task("alice", "t", nil)
	h.e.Drain(h.ctx)
	comments, _ := h.sync.List(h.ctx, "alice", "comment", false)
	if len(comments) != 1 || strOf(comments[0]["body"]) != "Picked up by the waiting rule" || strOf(comments[0]["author_id"]) != "alice" {
		t.Fatalf("comments %v", comments)
	}
	if len(h.sink.calls) != 1 || h.sink.calls[0] != (sinkCall{"fired", "r1", "t"}) {
		t.Fatalf("sink %v", h.sink.calls)
	}
}

func TestCompletingARecurringTaskAndSubtasks(t *testing.T) {
	h := newHarness(t)
	h.rule("alice", "r1", "Done", `{"kind":"label.added","label_id":"done"}`, "", `{"state":"complete"}`)
	h.write("alice", "laptop", "label", "done", map[string]any{"name": "done", "created_at": 1, "deleted_at": nil})
	h.task("alice", "series", map[string]any{"due": map[string]string{"date": "2026-10-19"}, "recurrence": "every monday"})
	h.task("alice", "parent", nil)
	h.task("alice", "child", map[string]any{"parent_id": "parent"})
	h.write("alice", "phone", "task", "series", map[string]any{"labels": []string{"done"}})
	h.write("alice", "phone", "task", "parent", map[string]any{"labels": []string{"done"}})
	h.e.Drain(h.ctx)
	s := h.get("alice", "series")
	if !isNull(s["completed_at"]) || !strings.Contains(string(s["due"]), "2026-10-26") {
		t.Fatalf("series %s %s", s["completed_at"], s["due"])
	}
	if c := h.get("alice", "child"); isNull(c["completed_at"]) {
		t.Fatal("subtask left open")
	}
}

func TestSchedule(t *testing.T) {
	h := newHarness(t)
	// Sunday 2026-10-25, the rule is created on Wednesday.
	h.rule("alice", "r1", "Sunday sweep", `{"kind":"schedule","at":"18:00","weekdays":[7]}`, `{"due":"overdue"}`, `{"due":"tomorrow"}`)
	for i := range 11 {
		h.task("alice", fmt.Sprintf("o%d", i), map[string]any{"due": map[string]string{"date": "2026-10-20"}})
	}
	h.task("alice", "fine", map[string]any{"due": map[string]string{"date": "2026-10-30"}})
	h.e.Drain(h.ctx)
	h.e.Tick(h.ctx) // starts the watermark
	// Server down from 17:50 to 18:20 on Sunday.
	h.clock = time.Date(2026, 10, 25, 17, 50, 0, 0, time.UTC)
	h.e.Tick(h.ctx)
	h.clock = time.Date(2026, 10, 25, 18, 20, 0, 0, time.UTC)
	h.e.Tick(h.ctx)
	h.e.Drain(h.ctx)
	rs := h.runs("r1")
	var changes []change
	if len(rs) == 1 {
		_ = json.Unmarshal(rs[0].Changes, &changes)
	}
	if len(rs) != 1 || rs[0].Outcome != OutcomeApplied || len(changes) != 11 || rs[0].OccurrenceKey != "sched:2026-10-25T18:00" {
		t.Fatalf("runs %+v", rs)
	}
	if d := string(h.get("alice", "o3")["due"]); !strings.Contains(d, "2026-10-26") {
		t.Fatalf("due %s", d)
	}
	// Monday 18:00 does not fire again.
	h.clock = time.Date(2026, 10, 26, 18, 30, 0, 0, time.UTC)
	h.e.Tick(h.ctx)
	h.e.Drain(h.ctx)
	if rs := h.runs("r1"); len(rs) != 1 {
		t.Fatalf("runs %d", len(rs))
	}
}

func TestDueMovedAndOverdueOncePerDate(t *testing.T) {
	h := newHarness(t)
	h.rule("alice", "due", "Due", `{"kind":"due.reached"}`, "", `{"notify":true}`)
	h.rule("alice", "late", "Slipped", `{"kind":"overdue"}`, "", `{"add_labels":["slipped"]}`)
	h.write("alice", "laptop", "label", "slipped", map[string]any{"name": "slipped", "created_at": 1, "deleted_at": nil})
	h.task("alice", "t", map[string]any{"due": map[string]string{"date": "2026-10-21", "time": "15:00"}})
	h.e.Tick(h.ctx)
	// Moved to Friday 14:00 before 15:00.
	h.write("alice", "phone", "task", "t", map[string]any{"due": map[string]string{"date": "2026-10-23", "time": "14:00"}})
	step := func(to time.Time) {
		for h.clock.Before(to) {
			h.clock = h.clock.Add(30 * time.Minute)
			h.e.Tick(h.ctx)
		}
		h.e.Drain(h.ctx)
	}
	step(time.Date(2026, 10, 22, 12, 0, 0, 0, time.UTC))
	if n := len(h.runs("due")); n != 0 {
		t.Fatalf("fired for the old time: %d", n)
	}
	step(time.Date(2026, 10, 23, 14, 30, 0, 0, time.UTC))
	if n := len(h.runs("due")); n != 1 {
		t.Fatalf("due runs %d", n)
	}
	// Overdue at Saturday's day start; moved to Sunday, overdue again Monday.
	step(time.Date(2026, 10, 24, 1, 0, 0, 0, time.UTC))
	h.write("alice", "phone", "task", "t", map[string]any{"due": map[string]string{"date": "2026-10-25"}, "labels": []string{}})
	step(time.Date(2026, 10, 27, 1, 0, 0, 0, time.UTC))
	rs := h.runs("late")
	if len(rs) != 2 || rs[0].OccurrenceKey == rs[1].OccurrenceKey {
		t.Fatalf("overdue runs %+v", rs)
	}
}

func TestLargeSweepIsPartial(t *testing.T) {
	h := newHarness(t)
	h.rule("alice", "r1", "All", `{"kind":"schedule","at":"12:30","weekdays":[3]}`, "", `{"priority":2}`)
	ops := []opsync.Op{}
	for i := range 700 {
		id := fmt.Sprintf("t%03d", i)
		for f, v := range map[string]string{"title": `"x"`, "priority": "4", "labels": "[]", "created_at": "1", "deleted_at": "null", "completed_at": "null"} {
			ops = append(ops, opsync.Op{ID: ids.New(), Entity: "task", EntityID: id, Field: f, Value: json.RawMessage(v), TS: 5, Device: "import"})
		}
	}
	for len(ops) > 0 {
		n := min(len(ops), 600)
		if _, err := h.sync.ApplyStrict(h.ctx, "alice", ops[:n]); err != nil {
			t.Fatal(err)
		}
		ops = ops[n:]
	}
	h.e.Tick(h.ctx)
	h.clock = h.clock.Add(40 * time.Minute)
	h.e.Tick(h.ctx)
	h.e.Drain(h.ctx)
	rs := h.runs("r1")
	var changes []change
	if len(rs) == 1 {
		_ = json.Unmarshal(rs[0].Changes, &changes)
	}
	if len(rs) != 1 || rs[0].Outcome != OutcomePartial || len(changes) != PerRun || !strings.HasPrefix(rs[0].Reason, "200 ") {
		t.Fatalf("runs %+v", rs)
	}
	if p := string(h.get("alice", "t699")["priority"]); p != "4" {
		t.Fatalf("t699 changed: %s", p)
	}
}

func TestStorePrune(t *testing.T) {
	h := newHarness(t)
	for i := range KeepRuns + 20 {
		if err := h.e.Store.Record(h.ctx, "alice", Run{RuleID: "r", OccurrenceKey: fmt.Sprint(i), Outcome: OutcomeApplied}); err != nil {
			t.Fatal(err)
		}
		h.clock = h.clock.Add(time.Second)
	}
	if err := h.e.Store.Record(h.ctx, "alice", Run{RuleID: "r", OccurrenceKey: "0", Outcome: OutcomeApplied}); err != nil {
		t.Fatal(err)
	}
	if n, err := h.e.Store.Prune(h.ctx); err != nil || n != 20 {
		t.Fatalf("pruned %d %v", n, err)
	}
	if rs := h.runs("r"); len(rs) != KeepRuns || rs[0].OccurrenceKey != fmt.Sprint(KeepRuns+19) {
		t.Fatalf("kept %d", len(rs))
	}
	h.clock = h.clock.Add(KeepRunsFor + time.Hour)
	if n, _ := h.e.Store.Prune(h.ctx); n != KeepRuns {
		t.Fatalf("old runs left: pruned %d", n)
	}
}
