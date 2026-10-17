package sync

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/notify"
)

// commentOps builds the ops of a new comment in one batch.
func (f *sharingFixture) commentOps(id, task, author, body string, extra ...Op) []Op {
	ops := []Op{
		f.op("comment", id, "task_id", `"`+task+`"`),
		f.op("comment", id, "author_id", `"`+author+`"`),
		f.op("comment", id, "body", mustJSON(body)),
		f.op("comment", id, "parent_id", `null`),
		f.op("comment", id, "created_at", `1000`),
	}
	return append(ops, extra...)
}

// withDevice stamps ops like a REST write.
func withDevice(ops []Op) []Op {
	for i := range ops {
		ops[i].Device = ServerDevice
	}
	return ops
}

func mustJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func reasons(res ApplyResult) []string {
	var out []string
	for _, r := range res.Rejected {
		out = append(out, r.Reason)
	}
	return out
}

func TestValidateCommentOps(t *testing.T) {
	ok := []Op{
		{Entity: "comment", Field: "task_id", Value: []byte(`"t1"`)},
		{Entity: "comment", Field: "parent_id", Value: []byte(`null`)},
		{Entity: "comment", Field: "body", Value: []byte(`"**hi**"`)},
		{Entity: "comment", Field: "author_id", Value: []byte(`"alice"`)},
		{Entity: "comment", Field: "mentions", Value: []byte(`["bob"]`)},
		{Entity: "comment", Field: "created_at", Value: []byte(`1`)},
		{Entity: "comment", Field: "edited_at", Value: []byte(`null`)},
		{Entity: "comment", Field: "deleted_at", Value: []byte(`2`)},
	}
	bad := []Op{
		{Entity: "comment", Field: "body", Value: []byte(`42`)},
		{Entity: "comment", Field: "task_id", Value: []byte(`""`)},
		{Entity: "comment", Field: "task_id", Value: []byte(`null`)},
		{Entity: "comment", Field: "author_id", Value: []byte(`null`)},
		{Entity: "comment", Field: "mentions", Value: []byte(`"bob"`)},
		{Entity: "comment", Field: "reactions", Value: []byte(`[]`)},
		{Entity: "comment", Field: "body", Value: []byte(mustJSON(string(make([]byte, MaxValueBytes))))},
	}
	for i, op := range ok {
		op.ID, op.EntityID, op.Device, op.TS = "o", "c", "d", 1
		if err := Validate(op); err != nil {
			t.Errorf("ok[%d] %s: %v", i, op.Field, err)
		}
	}
	for i, op := range bad {
		op.ID, op.EntityID, op.Device, op.TS = "o", "c", "d", 1
		if err := Validate(op); !errors.Is(err, ErrInvalidOp) {
			t.Errorf("bad[%d] %s accepted", i, op.Field)
		}
	}
}

func TestCommentScopeFollowsTask(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleViewer)
	// A comment on a shared task lives in the project's scope; one on a personal
	// task in the author's personal scope.
	f.apply("alice", "A", f.commentOps("c1", "t1", "alice", "shared")...)
	f.apply("alice", "A", f.commentOps("c2", "inbox", "alice", "private")...)
	scopeOf := func(id string) string {
		var sc string
		if err := f.s.db.QueryRow(`SELECT DISTINCT scope_id FROM scope_fields WHERE entity='comment' AND entity_id=?`, id).Scan(&sc); err != nil {
			t.Fatal(err)
		}
		return sc
	}
	if got := scopeOf("c1"); got != ProjectScope("p") {
		t.Fatalf("c1 scope = %s", got)
	}
	if got := scopeOf("c2"); got != PersonalScope("alice") {
		t.Fatalf("c2 scope = %s", got)
	}
	if f.field("bob", "comment", "c1", "body") != `"shared"` || f.field("bob", "comment", "c2", "body") != "<none>" {
		t.Fatal("bob should see the shared comment only")
	}
	// A task created in the same batch places its comment (batch-local lookup).
	f.add("alice", "carol", RoleEditor)
	ops := []Op{f.op("task", "t9", "title", `"New"`), f.op("task", "t9", "project_id", `"p"`)}
	ops = append(ops, f.commentOps("c9", "t9", "carol", "first")...)
	if res := f.apply("carol", "C", ops...); len(res.Rejected) != 0 {
		t.Fatalf("rejected %v", res.Rejected)
	}
	if scopeOf("c9") != ProjectScope("p") {
		t.Fatal("c9 not in the project scope")
	}
	// Bob as a viewer may comment; a non-member, or an unknown task, may not.
	if res := f.apply("bob", "B", f.commentOps("c3", "t1", "bob", "viewer note")...); len(res.Rejected) != 0 {
		t.Fatalf("viewer comment rejected: %v", res.Rejected)
	}
	f.s.db.Exec(`INSERT INTO users(id,email,name,password_hash,created_at) VALUES('dave','dave@example.com','dave','h',1)`)
	if res := f.apply("dave", "D", f.commentOps("c4", "t1", "dave", "intruder")...); len(res.Rejected) != 5 || res.Applied != 0 {
		t.Fatalf("non-member: %+v", res)
	}
	if res := f.apply("bob", "B", f.commentOps("c5", "nope", "bob", "?")...); len(res.Rejected) != 5 {
		t.Fatalf("unknown task: %+v", res)
	}
	// Sharing a project later carries the comments of its tasks into the new scope.
	f.apply("alice", "A", f.op("project", "q", "name", `"Later"`), f.op("task", "tq", "title", `"Q"`), f.op("task", "tq", "project_id", `"q"`))
	f.apply("alice", "A", f.commentOps("cq", "tq", "alice", "before sharing")...)
	if _, err := f.s.AddMember(f.ctx, "alice", "q", "bob", RoleViewer); err != nil {
		t.Fatal(err)
	}
	if scopeOf("cq") != ProjectScope("q") || f.field("bob", "comment", "cq", "body") != `"before sharing"` {
		t.Fatal("comment not relabelled on first share")
	}
}

func TestCommentForgedAuthorIsRejected(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	res := f.apply("bob", "B", f.commentOps("c1", "t1", "alice", "forged")...)
	if res.Applied != 0 || len(res.Rejected) != 5 || slices.ContainsFunc(res.Rejected, func(r Rejection) bool { return r.Reason != ReasonForbidden }) {
		t.Fatalf("forged = %+v", res)
	}
	if f.field("alice", "comment", "c1", "body") != "<none>" {
		t.Fatal("forged comment stored")
	}
	// Strict (REST) batches refuse the whole request.
	_, err := f.s.ApplyStrict(f.ctx, "bob", withDevice(f.commentOps("c2", "t1", "alice", "forged")))
	var rej *RejectedError
	if !errors.As(err, &rej) || rej.Reason != ReasonForbidden {
		t.Fatalf("strict = %v", err)
	}
	// The author of an existing comment cannot be changed, not even by the author.
	f.apply("bob", "B", f.commentOps("c3", "t1", "bob", "mine")...)
	if res := f.apply("bob", "B", f.op("comment", "c3", "author_id", `"alice"`)); len(res.Rejected) != 1 {
		t.Fatalf("author change = %+v", res)
	}
	if res := f.apply("bob", "B", f.op("comment", "c3", "task_id", `"t2"`)); len(res.Rejected) != 1 {
		t.Fatalf("task change = %+v", res)
	}
	// The response restores the server's value.
	res = f.apply("bob", "B", f.op("comment", "c3", "author_id", `"carol"`))
	if len(res.Restore) != 1 || string(res.Restore[0].Value) != `"bob"` || res.Restore[0].Actor != "bob" {
		t.Fatalf("restore = %+v", res.Restore)
	}
}

func TestCommentEditByOtherIsForbidden(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	f.add("alice", "carol", RoleAdmin)
	f.apply("bob", "B", f.commentOps("c1", "t1", "bob", "original")...)
	for _, who := range []string{"alice", "carol"} {
		res := f.apply(who, "X", f.op("comment", "c1", "body", `"hijacked"`), f.op("comment", "c1", "edited_at", `5000`))
		if len(res.Rejected) != 2 || res.Rejected[0].Reason != ReasonForbidden {
			t.Fatalf("%s edit = %+v", who, res)
		}
		if len(res.Restore) != 1 || string(res.Restore[0].Value) != `"original"` {
			t.Fatalf("restore = %+v", res.Restore)
		}
	}
	if f.field("alice", "comment", "c1", "body") != `"original"` {
		t.Fatal("body changed by another account")
	}
	res := f.apply("bob", "B", f.op("comment", "c1", "body", `"edited"`), f.op("comment", "c1", "edited_at", `6000`))
	if len(res.Rejected) != 0 || f.field("carol", "comment", "c1", "body") != `"edited"` {
		t.Fatalf("author edit = %+v", res)
	}
}

func TestAdminCanDeleteComment(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	f.add("alice", "carol", RoleAdmin)
	f.apply("bob", "B", f.commentOps("c1", "t1", "bob", "one")...)
	f.apply("bob", "B", f.commentOps("c2", "t1", "bob", "two")...)
	f.apply("carol", "C", f.commentOps("c3", "t1", "carol", "three")...)
	// An editor cannot delete someone else's comment; the admin and owner can.
	if res := f.apply("bob", "B", f.op("comment", "c3", "deleted_at", `7000`)); len(res.Rejected) != 1 {
		t.Fatalf("editor delete = %+v", res)
	}
	if res := f.apply("carol", "C", f.op("comment", "c1", "deleted_at", `7000`)); len(res.Rejected) != 0 {
		t.Fatalf("admin delete = %+v", res)
	}
	if res := f.apply("alice", "A", f.op("comment", "c2", "deleted_at", `7000`)); len(res.Rejected) != 0 {
		t.Fatalf("owner delete = %+v", res)
	}
	// The author deletes their own.
	if res := f.apply("carol", "C", f.op("comment", "c3", "deleted_at", `7000`)); len(res.Rejected) != 0 {
		t.Fatalf("author delete = %+v", res)
	}
	list, err := f.s.TaskComments(f.ctx, "bob", "t1")
	if err != nil || len(list) != 0 {
		t.Fatalf("live comments = %v, %v", list, err)
	}
	// Purging the task purges its comments and leaves markers.
	f.apply("alice", "A", f.op("task", "t1", "deleted_at", `8000`))
	pr, err := f.s.Purge(f.ctx, "alice", "task", []string{"t1"})
	if err != nil || pr.Comments != 3 {
		t.Fatalf("purge = %+v, %v", pr, err)
	}
	var n int
	f.s.db.QueryRow(`SELECT COUNT(*) FROM ops WHERE entity='comment'`).Scan(&n)
	if n != 0 {
		t.Fatalf("%d comment ops left", n)
	}
	// Late comment ops for the purged task are discarded, not resurrected.
	res := f.apply("bob", "B", f.commentOps("c4", "t1", "bob", "late")...)
	if res.Applied != 0 || len(res.Rejected) != 0 || res.Duplicates != 5 {
		t.Fatalf("late comment = %+v", res)
	}
}

func TestMentionsFilteredToMembers(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	res := f.apply("alice", "A", f.commentOps("c1", "t1", "alice", "@bob @carol", f.op("comment", "c1", "mentions", `["bob","carol","bob","ghost"]`))...)
	if len(res.Rejected) != 0 || f.field("bob", "comment", "c1", "mentions") != `["bob"]` {
		t.Fatalf("stored mentions = %s (%+v)", f.field("bob", "comment", "c1", "mentions"), res)
	}
	// The filtered op travels back to the author's device with its original clock.
	if len(res.Restore) != 1 || string(res.Restore[0].Value) != `["bob"]` || res.Restore[0].Device != "A" {
		t.Fatalf("restore = %+v", res.Restore)
	}
	// Mentions on a personal task are ignored.
	f.apply("alice", "A", f.commentOps("c2", "inbox", "alice", "@bob", f.op("comment", "c2", "mentions", `["bob"]`))...)
	if f.field("alice", "comment", "c2", "mentions") != `[]` {
		t.Fatalf("personal mentions = %s", f.field("alice", "comment", "c2", "mentions"))
	}
	// An unchanged list is not echoed.
	if res := f.apply("alice", "A", f.op("comment", "c1", "mentions", `["bob"]`)); len(res.Restore) != 0 {
		t.Fatalf("echoed unchanged mentions: %+v", res.Restore)
	}
}

type mentionSink struct{ events []notify.Mentioned }

func (m *mentionSink) Assigned(context.Context, notify.Assigned) {}
func (m *mentionSink) Mentioned(_ context.Context, e notify.Mentioned) {
	m.events = append(m.events, e)
}

func TestMentionNotifiesMember(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	f.add("alice", "carol", RoleViewer)
	rec := &mentionSink{}
	inbox := notify.NewInApp(f.s.db, nil)
	f.s.AddSink(rec)
	f.s.AddSink(inbox)
	f.apply("alice", "A", f.commentOps("c1", "t1", "alice", "Can you   check\nthis @bob?", f.op("comment", "c1", "mentions", `["bob","alice","mallory"]`))...)
	if len(rec.events) != 1 {
		t.Fatalf("events = %+v", rec.events)
	}
	e := rec.events[0]
	if e.RecipientID != "bob" || e.ActorID != "alice" || e.ActorName != "alice" || e.TaskID != "t1" || e.TaskTitle != "Milk" ||
		e.ProjectID != "p" || e.ProjectName != "Home" || e.CommentID != "c1" || e.Excerpt != "Can you check this @bob?" {
		t.Fatalf("event = %+v", e)
	}
	list, unread, err := inbox.List(f.ctx, "bob")
	if err != nil || len(list) != 1 || unread != 1 || list[0].Kind != notify.KindMentioned {
		t.Fatalf("bob's notifications = %+v %d %v", list, unread, err)
	}
	// An edit that adds carol notifies only carol; re-sending notifies nobody.
	f.apply("alice", "A", f.op("comment", "c1", "mentions", `["bob","carol"]`))
	f.apply("alice", "A", f.op("comment", "c1", "mentions", `["bob","carol"]`))
	if len(rec.events) != 2 || rec.events[1].RecipientID != "carol" {
		t.Fatalf("events after edit = %+v", rec.events)
	}
	// Personal tasks never notify.
	f.apply("alice", "A", f.commentOps("c2", "inbox", "alice", "@bob", f.op("comment", "c2", "mentions", `["bob"]`))...)
	if len(rec.events) != 2 {
		t.Fatalf("personal mention notified: %+v", rec.events)
	}
}

func TestCommentRateLimit(t *testing.T) {
	f := newSharing(t)
	f.s.SetCommentRateLimit(2, time.Minute)
	for i, id := range []string{"c1", "c2"} {
		if res := f.apply("alice", "A", f.commentOps(id, "t1", "alice", "ok")...); len(res.Rejected) != 0 {
			t.Fatalf("comment %d rejected: %+v", i, res)
		}
	}
	res := f.apply("alice", "A", f.commentOps("c3", "t1", "alice", "too many")...)
	if !slices.Contains(reasons(res), ReasonRateLimited) || f.field("alice", "comment", "c3", "author_id") != "<none>" {
		t.Fatalf("third comment = %+v", res)
	}
	// Editing is not creating: still allowed.
	if res := f.apply("alice", "A", f.op("comment", "c1", "body", `"edited"`)); len(res.Rejected) != 0 {
		t.Fatalf("edit limited: %+v", res)
	}
	// Other accounts have their own window; the window passes.
	if _, err := f.s.ApplyStrict(f.ctx, "alice", withDevice(f.commentOps("c4", "t1", "alice", "strict"))); err == nil {
		t.Fatal("strict batch over the limit accepted")
	}
	f.s.now = func() time.Time { return time.Now().Add(2 * time.Minute) }
	if res := f.apply("alice", "A", f.commentOps("c5", "t1", "alice", "later")...); len(res.Rejected) != 0 {
		t.Fatalf("after the window: %+v", res)
	}
}

func TestPullIncludesActorAndIgnoresClientValue(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	op := f.op("task", "t1", "title", `"Bob's milk"`)
	op.Actor = "alice" // forged: must be ignored
	f.apply("bob", "B", op)
	ops, _ := f.pullAll("alice", "A2", 0)
	var found bool
	for _, o := range ops {
		if o.Actor == "" {
			t.Fatalf("op without actor: %+v", o)
		}
		if o.ID == op.ID {
			found = true
			if o.Actor != "bob" {
				t.Fatalf("actor = %q, want bob", o.Actor)
			}
		}
	}
	if !found {
		t.Fatal("bob's op not pulled")
	}
	b, _ := json.Marshal(ops[0])
	var m map[string]any
	_ = json.Unmarshal(b, &m)
	if m["actor"] != "alice" {
		t.Fatalf("serialized op = %s", b)
	}
	// Activity is attributed from the same column.
	act, err := f.s.ActivityOps(f.ctx, "alice", "task", "t1")
	if err != nil || len(act) == 0 || act[len(act)-1].Actor != "bob" {
		t.Fatalf("activity ops = %+v, %v", act, err)
	}
	if _, err := f.s.ActivityOps(f.ctx, "carol", "task", "t1"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("carol activity = %v", err)
	}
}

// TestThreadOrder uses the same comments as the client's "thread order with
// deleted parent" test (web/src/lib/ops.test.ts) and must give the same order.
func TestThreadOrder(t *testing.T) {
	c := func(id string, created int, parent string) Entity {
		e := Entity{"id": json.RawMessage(QuoteJSON(id)), "task_id": json.RawMessage(`"t"`), "created_at": json.RawMessage(mustJSON(created)), "parent_id": json.RawMessage("null")}
		if parent != "" {
			e["parent_id"] = json.RawMessage(QuoteJSON(parent))
		}
		return e
	}
	list := []Entity{c("r2", 40, "a"), c("b", 20, ""), c("a", 10, ""), c("r1", 30, "a"), c("rr", 50, "r1"), c("orphan", 15, "missing"), c("x", 60, "y"), c("y", 70, "x")}
	var got []string
	for _, e := range ThreadOrder(list) {
		got = append(got, e.str("id"))
	}
	if want := []string{"a", "r1", "r2", "rr", "orphan", "b", "x", "y"}; !slices.Equal(got, want) {
		t.Fatalf("order = %v, want %v", got, want)
	}
}

// TestAgentDeviceCommentNeverNotifies: a comment written with an AI
// assistant's device (agent:<token-id>) sends no mention notification, even
// when its ops carry mentions (mcp-write-tools D9.3).
func TestAgentDeviceCommentNeverNotifies(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	rec := &mentionSink{}
	f.s.AddSink(rec)
	f.apply("alice", AgentDevice("tok"), f.commentOps("c1", "t1", "alice", "ping @bob", f.op("comment", "c1", "mentions", `["bob"]`))...)
	if len(rec.events) != 0 {
		t.Fatalf("assistant comment notified: %+v", rec.events)
	}
	// The same comment from a device does notify (the rule is the device).
	f.apply("alice", "A", f.commentOps("c2", "t1", "alice", "ping @bob", f.op("comment", "c2", "mentions", `["bob"]`))...)
	if len(rec.events) != 1 {
		t.Fatalf("device comment: %+v", rec.events)
	}
}
