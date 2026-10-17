package sync

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"testing"
	"time"
)

// Tests of OpenSpec change sync-convergence.

// A device that announces clock_skew gets ops stamped too far ahead refused,
// with the server's time, and nothing of them is stored; the rest of the batch
// is applied. Without the announcement they are clamped as before.
func TestClockSkewRefusedWithServerTime(t *testing.T) {
	s := newTestService(t)
	fixed := time.UnixMilli(10_000_000)
	s.now = func() time.Time { return fixed }
	ctx := WithClockSkewRefusal(context.Background())
	far := fixed.UnixMilli() + MaxFutureSkewMs + 1
	res, err := s.Apply(ctx, "u", []Op{
		op("fast", "task", "t1", "title", `"from the fast clock"`, far, "A"),
		op("ok", "task", "t1", "priority", `2`, fixed.UnixMilli()+MaxFutureSkewMs, "A"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Applied != 1 || len(res.Rejected) != 1 {
		t.Fatalf("res = %+v", res)
	}
	if r := res.Rejected[0]; r.ID != "fast" || r.Reason != ReasonClockSkew || r.ServerTime != fixed.UnixMilli() {
		t.Fatalf("rejection = %+v", r)
	}
	if len(res.Restore) != 0 {
		t.Fatalf("a clock refusal restores nothing: %+v", res.Restore)
	}
	e, _ := s.Get(context.Background(), "u", "task", "t1")
	if _, ok := e["title"]; ok {
		t.Fatalf("refused title stored: %s", e["title"])
	}
	// The same op, stamped again with a corrected clock, is stored.
	res, err = s.Apply(ctx, "u", []Op{op("fast", "task", "t1", "title", `"from the fast clock"`, fixed.UnixMilli()+1, "A")})
	if err != nil || res.Applied != 1 {
		t.Fatalf("re-sent: %+v %v", res, err)
	}
	// ApplyStrict callers (server writers) get a RejectedError.
	_, err = s.ApplyStrict(ctx, "u", []Op{op("strict", "task", "t2", "title", `"x"`, far, "A")})
	var rej *RejectedError
	if !errors.As(err, &rej) || rej.Reason != ReasonClockSkew {
		t.Fatalf("strict: %v", err)
	}
}

// device simulates the client protocol: a local last-writer-wins copy of one
// field, an HLC with an offset, and the clock_skew handling (correct the
// clock, stamp the refused op again, re-send).
type device struct {
	id     string
	skew   int64 // how far its system clock runs ahead
	offset int64 // HLC correction learned from the server
	last   int64
	value  string
	ts     int64
	vdev   string
	seq    int
	outbox []Op
}

func (d *device) hlc(now int64) int64 {
	d.last = max(now+d.skew+d.offset, d.last+1)
	return d.last
}

func (d *device) edit(now int64, v string) {
	d.seq++
	ts := d.hlc(now)
	d.value, d.ts, d.vdev = v, ts, d.id
	d.outbox = append(d.outbox, op(fmt.Sprintf("%s-%d", d.id, d.seq), "task", "t1", "title", string(jsonOf(v)), ts, d.id))
}

func (d *device) receive(o Op) {
	if Wins(o.TS, o.Device, d.ts, d.vdev) {
		var v string
		_ = json.Unmarshal(o.Value, &v)
		d.value, d.ts, d.vdev = v, o.TS, o.Device
	}
}

// exchange sends the outbox and pulls; refused ops are stamped again after the
// clock correction and stay queued for the next exchange.
func (d *device) exchange(t *testing.T, s *Service, ctx context.Context, cursor *int64) {
	t.Helper()
	sent := d.outbox
	d.outbox = nil
	res, err := s.Apply(ctx, "u", sent)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range res.Rejected {
		if r.Reason != ReasonClockSkew {
			t.Fatalf("unexpected rejection %+v", r)
		}
		now := s.now().UnixMilli()
		// Correct the clock and cap the last issued timestamp at server time
		// (hlcClockRefused in web/src/lib/hlc.ts).
		d.offset = r.ServerTime - (now + d.skew)
		d.last = min(d.last, r.ServerTime)
		for _, o := range sent {
			if o.ID == r.ID {
				o.TS = d.hlc(now)
				if d.vdev == d.id {
					d.ts = o.TS // the local copy carries the new clock too
				}
				d.outbox = append(d.outbox, o)
			}
		}
	}
	ops, next, _, err := s.Pull(ctx, "u", *cursor, d.id, 100)
	if err != nil {
		t.Fatal(err)
	}
	*cursor = next
	for _, o := range ops {
		d.receive(o)
	}
}

// A device whose clock runs an hour fast no longer freezes a field: after its
// edit is refused and re-stamped, a later edit from a correctly set device wins
// on the server and on both devices.
func TestFastClockDeviceConverges(t *testing.T) {
	s := newTestService(t)
	now := int64(50_000_000)
	s.now = func() time.Time { return time.UnixMilli(now) }
	ctx := WithClockSkewRefusal(context.Background())
	fast := &device{id: "fast", skew: 3_600_000}
	good := &device{id: "good"}
	var cf, cg int64

	fast.edit(now, "fast edit")
	fast.exchange(t, s, ctx, &cf) // refused, re-stamped
	fast.exchange(t, s, ctx, &cf) // stored
	now += 60_000
	good.exchange(t, s, ctx, &cg)
	good.edit(now, "later edit")
	good.exchange(t, s, ctx, &cg)
	now += 1000
	fast.exchange(t, s, ctx, &cf)

	e, _ := s.Get(context.Background(), "u", "task", "t1")
	if string(e["title"]) != `"later edit"` {
		t.Fatalf("server title = %s", e["title"])
	}
	if fast.value != "later edit" || good.value != "later edit" {
		t.Fatalf("devices diverged: fast %q, good %q", fast.value, good.value)
	}
	// The fast device's next edit still wins: its clock was corrected, not frozen.
	now += 1000
	fast.edit(now, "fast again")
	fast.exchange(t, s, ctx, &cf)
	good.exchange(t, s, ctx, &cg)
	if good.value != "fast again" {
		t.Fatalf("good = %q", good.value)
	}
}

// A device that confirms backfill pages gets a lost page again: progress
// advances only when its next exchange echoes the served page.
func TestBackfillPageResentUntilConfirmed(t *testing.T) {
	f := newSharing(t)
	for i := 0; i < 4; i++ {
		f.apply("bob", "B", f.op("task", fmt.Sprintf("b%d", i), "title", `"mine"`))
	}
	_, c1 := f.pullAll("bob", "B1", 0)
	f.add("alice", "bob", RoleEditor)
	f.s.pullBudget = 1 // one op per page
	pull := func(ack int64) PullResult {
		t.Helper()
		r, err := f.s.PullWith(f.ctx, "bob", c1, "B1", MaxOpsPerRequest, PullOptions{ConfirmBackfill: true, BackfillAck: ack})
		if err != nil {
			t.Fatal(err)
		}
		return r
	}
	first := pull(0)
	if len(first.Ops) != 1 || !first.More || first.BackfillSeq == 0 || first.Cursor != c1 {
		t.Fatalf("first page = %+v", first)
	}
	// The page was lost: the retry, which echoes nothing, gets it again.
	again := pull(0)
	if len(again.Ops) != 1 || again.Ops[0].ID != first.Ops[0].ID {
		t.Fatalf("lost page not resent: %+v", again)
	}
	// Confirmed: the next page follows; a stale echo does not skip ahead.
	var history []Op
	history = append(history, again.Ops...)
	ack := again.BackfillSeq
	for i := 0; i < 20; i++ {
		r := pull(ack)
		if !r.More {
			break
		}
		if len(r.Ops) != 1 || r.Ops[0].ID == history[len(history)-1].ID {
			t.Fatalf("page %d = %+v", i, r)
		}
		// Lose every second page once.
		if i%2 == 0 {
			if again := pull(ack); again.Ops[0].ID != r.Ops[0].ID {
				t.Fatalf("lost page %d not resent", i)
			}
		}
		history = append(history, r.Ops...)
		ack = r.BackfillSeq
	}
	if ids := entityIDs(history); !slices.Equal(ids, []string{"p", "t1", "t2"}) {
		t.Fatalf("replayed %v", ids)
	}
	// Older devices (no confirmation) keep the previous behaviour.
	var n int
	if err := f.s.db.QueryRow(`SELECT COUNT(*) FROM member_backfills WHERE user_id = 'bob' AND device = 'B1' AND done_seq < upto_seq`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("pending backfills = %d, %v", n, err)
	}
}

// One server clock: writers sharing the service never issue the same
// timestamp, even within one millisecond or when their own clock lags.
func TestServerTSStrictlyIncreasing(t *testing.T) {
	s := newTestService(t)
	s.now = func() time.Time { return time.UnixMilli(1_000) }
	a, b, c := s.ServerTS(), s.ServerTSAt(1_000), s.ServerTSAt(500)
	if !(a == 1_000 && b == 1_001 && c == 1_002) {
		t.Fatalf("ts = %d %d %d", a, b, c)
	}
	if d := s.ServerTSAt(5_000); d != 5_000 {
		t.Fatalf("floor = %d", d)
	}
}

// The server's device id carries a per-process suffix and stays reserved and
// trusted under both forms.
func TestServerDeviceForms(t *testing.T) {
	if !strings.HasPrefix(ServerDevice, "server:") || len(ServerDevice) <= len("server:") {
		t.Fatalf("ServerDevice = %q", ServerDevice)
	}
	for _, d := range []string{"server", ServerDevice, "server:other"} {
		if !IsServerDevice(d) || !ReservedDevice(d) {
			t.Fatalf("%q not recognised as the server's", d)
		}
	}
	for _, d := range []string{"serverless", "phone", "assistant:x"} {
		if IsServerDevice(d) {
			t.Fatalf("%q recognised as the server's", d)
		}
	}
}

// Post-commit observers and notification sinks run even when the request's
// context is cancelled right after the commit (client disconnected).
func TestPostCommitSurvivesCancelledContext(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	ctx, cancel := context.WithCancel(f.ctx)
	var observed []error
	f.s.SetObserver(func(octx context.Context, _ []Change) {
		cancel() // the client goes away while the batch is reported
		observed = append(observed, octx.Err())
	})
	sink := &recordingSink{s: f.s}
	f.s.AddSink(sink)
	if _, err := f.s.Apply(ctx, "alice", []Op{{ID: "assign-1", Entity: "task", EntityID: "t1", Field: "assignee_id", Value: []byte(`"bob"`), TS: 900_000, Device: "A"}}); err != nil {
		t.Fatal(err)
	}
	if len(observed) != 1 || observed[0] != nil {
		t.Fatalf("observer ctx err = %v", observed)
	}
	if len(sink.events) != 1 || sink.events[0].TaskTitle != "Milk" || sink.seen[0] != `"bob"` {
		t.Fatalf("assignment events = %+v, seen %v", sink.events, sink.seen)
	}
}

// Deleting an account unassigns its tasks in projects other accounts own, with
// server ops every member's devices pull, and observers learn the changes once
// the deletion committed (task-assignment "Unassign on departure").
func TestAccountDeletionUnassignsInOthersProjects(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	f.apply("alice", "A", f.op("task", "t1", "assignee_id", `"bob"`))
	var observed []Change
	f.s.SetObserver(func(_ context.Context, c []Change) { observed = append(observed, c...) })
	_, cursor := f.pullAll("alice", "A2", 0)

	ctx, deletion := WithAccountDeletion(f.ctx)
	tx, err := f.s.db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	notify, err := f.s.DeleteAccountData(ctx, tx, "bob")
	if err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if len(observed) != 0 {
		t.Fatal("observer ran before the deletion committed")
	}
	f.s.ObserveAccountDeletion(ctx, deletion)

	if !slices.Contains(notify, "alice") {
		t.Fatalf("notify = %v", notify)
	}
	if got := f.field("alice", "task", "t1", "assignee_id"); got != "null" {
		t.Fatalf("assignee after deletion = %s", got)
	}
	ops, _ := f.pullAll("alice", "A2", cursor)
	if len(ops) != 1 || ops[0].Field != "assignee_id" || !IsServerDevice(ops[0].Device) || ops[0].Actor != "alice" {
		t.Fatalf("pulled = %+v", ops)
	}
	if len(observed) != 1 || observed[0].EntityID != "t1" || string(observed[0].Fields["assignee_id"].To) != "null" {
		t.Fatalf("observed = %+v", observed)
	}
}

// A due date must exist and its time be a clock reading.
func TestDueRejectsImpossibleDatesAndTimes(t *testing.T) {
	for _, v := range []string{
		`{"date":"2026-13-99"}`, `{"date":"2026-02-31"}`, `{"date":"2026-00-10"}`,
		`{"date":"2026-05-01","time":"99:99"}`, `{"date":"2026-05-01","time":"24:00"}`, `{"date":"2026-05-01","time":"12:60"}`,
	} {
		if err := Validate(op("d", "task", "t", "due", v, 1, "A")); !errors.Is(err, ErrInvalidOp) {
			t.Errorf("due %s accepted: %v", v, err)
		}
	}
	for _, v := range []string{`null`, `{"date":"2028-02-29"}`, `{"date":"2026-05-01","time":"00:00"}`, `{"date":"2026-05-01","time":"23:59"}`} {
		if err := Validate(op("d", "task", "t", "due", v, 1, "A")); err != nil {
			t.Errorf("due %s refused: %v", v, err)
		}
	}
}
