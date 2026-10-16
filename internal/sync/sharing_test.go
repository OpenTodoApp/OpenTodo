package sync

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"testing"
)

// sharingFixture: alice owns project "p" with two tasks; bob and carol have
// accounts. Nothing is shared until a test says so.
type sharingFixture struct {
	t   *testing.T
	ctx context.Context
	s   *Service
	ts  int64
}

func newSharing(t *testing.T) *sharingFixture {
	t.Helper()
	f := &sharingFixture{t: t, ctx: context.Background(), s: newTestService(t), ts: 1000}
	for _, u := range []string{"alice", "bob", "carol"} {
		if _, err := f.s.db.Exec(`INSERT INTO users(id,email,name,password_hash,created_at) VALUES(?,?,?,'h',1)`, u, u+"@example.com", u); err != nil {
			t.Fatal(err)
		}
	}
	f.apply("alice", "A",
		f.op("project", "p", "name", `"Home"`),
		f.op("task", "t1", "title", `"Milk"`), f.op("task", "t1", "project_id", `"p"`),
		f.op("task", "t2", "title", `"Bread"`), f.op("task", "t2", "project_id", `"p"`),
		f.op("task", "inbox", "title", `"Private"`), f.op("task", "inbox", "project_id", `null`),
		f.op("project", "secret", "name", `"Diary"`),
	)
	return f
}

var opCounter int

func (f *sharingFixture) op(entity, id, field, value string) Op {
	f.ts++
	opCounter++
	return Op{ID: fmt.Sprintf("op-%d", opCounter), Entity: entity, EntityID: id, Field: field, Value: []byte(value), TS: f.ts}
}

func (f *sharingFixture) apply(user, device string, ops ...Op) ApplyResult {
	f.t.Helper()
	for i := range ops {
		ops[i].Device = device
	}
	res, err := f.s.Apply(f.ctx, user, ops)
	if err != nil {
		f.t.Fatal(err)
	}
	return res
}

func (f *sharingFixture) add(actor, target, role string) {
	f.t.Helper()
	if _, err := f.s.AddMember(f.ctx, actor, "p", target, role); err != nil {
		f.t.Fatalf("add %s as %s: %v", target, role, err)
	}
}

func (f *sharingFixture) field(user, entity, id, field string) string {
	f.t.Helper()
	e, err := f.s.Get(f.ctx, user, entity, id)
	if err != nil {
		f.t.Fatal(err)
	}
	if e == nil {
		return "<none>"
	}
	return string(e[field])
}

// pullAll drains Pull like a device does and returns every op it received.
func (f *sharingFixture) pullAll(user, device string, cursor int64) ([]Op, int64) {
	f.t.Helper()
	var all []Op
	for i := 0; i < 100; i++ {
		ops, next, more, err := f.s.Pull(f.ctx, user, cursor, device, 3)
		if err != nil {
			f.t.Fatal(err)
		}
		if next < cursor {
			f.t.Fatalf("cursor went backwards: %d -> %d", cursor, next)
		}
		all = append(all, ops...)
		cursor = next
		if !more {
			return all, cursor
		}
	}
	f.t.Fatal("pull never finished")
	return nil, 0
}

func entityIDs(ops []Op) []string {
	var out []string
	for _, o := range ops {
		if !slices.Contains(out, o.EntityID) {
			out = append(out, o.EntityID)
		}
	}
	slices.Sort(out)
	return out
}

func rejectedIDs(res ApplyResult) []string {
	var out []string
	for _, r := range res.Rejected {
		out = append(out, r.ID+":"+r.Reason)
	}
	return out
}

func TestScopeResolutionForNewAndExistingTasks(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	scopeOf := func(id string) string {
		var sc string
		if err := f.s.db.QueryRow(`SELECT DISTINCT scope_id FROM scope_fields WHERE entity_id = ?`, id).Scan(&sc); err != nil {
			t.Fatalf("%s: %v", id, err)
		}
		return sc
	}
	// New task: project_id later in the same batch decides the scope of every op.
	f.apply("bob", "B", f.op("task", "n1", "title", `"New"`), f.op("task", "n1", "project_id", `"p"`))
	// New task without project_id: the author's Inbox.
	f.apply("bob", "B", f.op("task", "n2", "title", `"Mine"`))
	// Existing task, later edit without project_id: stays where it is.
	f.apply("bob", "B", f.op("task", "n1", "priority", `1`))
	// A new task in an unshared project of the author is personal.
	f.apply("bob", "B", f.op("project", "bp", "name", `"Bob's"`), f.op("task", "n3", "project_id", `"bp"`), f.op("task", "n3", "title", `"x"`))
	for id, want := range map[string]string{"n1": "project:p", "n2": "user:bob", "n3": "user:bob", "bp": "user:bob", "t1": "project:p", "inbox": "user:alice", "secret": "user:alice"} {
		if got := scopeOf(id); got != want {
			t.Errorf("scope of %s = %s, want %s", id, got, want)
		}
	}
	if f.field("alice", "task", "n1", "priority") != "1" {
		t.Fatal("alice does not see bob's edit in the shared project")
	}
	if f.field("alice", "task", "n2", "title") != "<none>" || f.field("bob", "task", "inbox", "title") != "<none>" {
		t.Fatal("personal tasks leaked across users")
	}
}

func TestProjectIdAcrossScopesIsRejected(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	f.apply("bob", "B", f.op("project", "bp", "name", `"Bob's"`))
	toInbox := f.op("task", "t1", "project_id", `null`)
	toPersonal := f.op("task", "t1", "project_id", `"bp"`)
	intoShared := f.op("task", "own", "project_id", `"p"`)
	f.apply("bob", "B", f.op("task", "own", "title", `"Own"`))
	res := f.apply("bob", "B", toInbox, toPersonal, intoShared)
	want := []string{toInbox.ID + ":scope_change", toPersonal.ID + ":scope_change", intoShared.ID + ":scope_change"}
	if !slices.Equal(rejectedIDs(res), want) || res.Applied != 0 {
		t.Fatalf("rejected = %v, applied %d", rejectedIDs(res), res.Applied)
	}
	if f.field("alice", "task", "t1", "project_id") != `"p"` {
		t.Fatal("task left the shared project")
	}
	// The owner is refused the same way: who can see a task never changes.
	res = f.apply("alice", "A", f.op("task", "inbox", "project_id", `"p"`))
	if len(res.Rejected) != 1 || res.Rejected[0].Reason != ReasonScopeChange {
		t.Fatalf("owner move into shared project = %+v", res.Rejected)
	}
	// Moving within one scope stays allowed.
	f.apply("alice", "A", f.op("project", "q", "name", `"Q"`))
	if res := f.apply("alice", "A", f.op("task", "inbox", "project_id", `"q"`)); res.Applied != 1 {
		t.Fatalf("move inside personal scope = %+v", res)
	}
	// Cross-scope move as the client does it: copy in the destination + tombstone.
	res = f.apply("bob", "B",
		f.op("task", "t1-copy", "title", `"Milk"`), f.op("task", "t1-copy", "project_id", `null`),
		f.op("task", "t1", "deleted_at", `5`))
	if res.Applied != 3 || len(res.Rejected) != 0 {
		t.Fatalf("copy + tombstone = %+v", res)
	}
	if f.field("alice", "task", "t1", "deleted_at") != "5" || f.field("alice", "task", "t1-copy", "title") != "<none>" || f.field("bob", "task", "t1-copy", "title") != `"Milk"` {
		t.Fatal("copy + tombstone did not land in the right scopes")
	}
}

func TestShareRelabelsExistingOpsAndFields(t *testing.T) {
	f := newSharing(t)
	type row struct {
		seq   int64
		opID  string
		scope string
	}
	snapshot := func() map[string]row {
		rows, err := f.s.db.Query(`SELECT o.seq, o.op_id, o.entity_id, s.scope_id FROM ops o JOIN op_scopes s ON s.seq = o.seq`)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		out := map[string]row{}
		for rows.Next() {
			var r row
			var id string
			if err := rows.Scan(&r.seq, &r.opID, &id, &r.scope); err != nil {
				t.Fatal(err)
			}
			out[r.opID] = r
			_ = id
		}
		return out
	}
	before := snapshot()
	_, aliceCursor := f.pullAll("alice", "A2", 0)
	f.add("alice", "bob", RoleViewer)
	after := snapshot()
	if len(after) != len(before) {
		t.Fatalf("ops count changed: %d -> %d", len(before), len(after))
	}
	moved := 0
	for id, b := range before {
		a := after[id]
		if a.seq != b.seq || a.opID != b.opID {
			t.Fatalf("op %s changed seq/op_id: %+v -> %+v", id, b, a)
		}
		if a.scope != b.scope {
			moved++
			if a.scope != "project:p" {
				t.Fatalf("op %s moved to %s", id, a.scope)
			}
		}
	}
	if moved != 5 { // project name + 2 fields of each of the 2 tasks
		t.Fatalf("relabelled %d ops, want 5", moved)
	}
	var n int
	_ = f.s.db.QueryRow(`SELECT COUNT(*) FROM scope_fields WHERE scope_id = 'project:p'`).Scan(&n)
	if n != 5 {
		t.Fatalf("fields in project scope = %d, want 5", n)
	}
	// The owner's other device keeps its cursor and receives nothing new.
	if ops, _ := f.pullAll("alice", "A2", aliceCursor); len(ops) != 0 {
		t.Fatalf("owner device re-received %d ops after sharing", len(ops))
	}
	// Personal data of the owner is untouched and invisible to bob.
	if f.field("alice", "task", "inbox", "title") != `"Private"` || f.field("bob", "project", "secret", "name") != "<none>" {
		t.Fatal("sharing leaked or lost personal data")
	}
}

func TestViewerWritesAreRejectedPerOp(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleViewer)
	edit := f.op("task", "t1", "title", `"Oat milk"`)
	create := f.op("task", "new", "project_id", `"p"`)
	personal := f.op("task", "mine", "title", `"Mine"`)
	res := f.apply("bob", "B", edit, create, personal)
	want := []string{edit.ID + ":forbidden", create.ID + ":forbidden"}
	if !slices.Equal(rejectedIDs(res), want) || res.Applied != 1 {
		t.Fatalf("rejected = %v, applied = %d", rejectedIDs(res), res.Applied)
	}
	if f.field("alice", "task", "t1", "title") != `"Milk"` || f.field("alice", "task", "new", "project_id") != "<none>" {
		t.Fatal("a viewer's write reached the shared project")
	}
	var n int
	_ = f.s.db.QueryRow(`SELECT COUNT(*) FROM ops WHERE op_id IN (?,?)`, edit.ID, create.ID).Scan(&n)
	if n != 0 {
		t.Fatal("rejected ops were stored")
	}
	// Labels and views stay personal for everyone, viewers included.
	if res := f.apply("bob", "B", f.op("label", "l1", "name", `"x"`), f.op("view", "v1", "name", `"y"`)); res.Applied != 2 {
		t.Fatalf("personal label/view = %+v", res)
	}
}

func TestEditorCannotEditProjectFields(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	f.add("alice", "carol", RoleAdmin)
	rename := f.op("project", "p", "name", `"Mine now"`)
	res := f.apply("bob", "B", rename, f.op("task", "t1", "completed_at", `9`), f.op("task", "t2", "deleted_at", `9`))
	if !slices.Equal(rejectedIDs(res), []string{rename.ID + ":forbidden"}) || res.Applied != 2 {
		t.Fatalf("editor batch = %v applied %d", rejectedIDs(res), res.Applied)
	}
	// Admin: renames, recolours, archives, but cannot delete the project.
	del := f.op("project", "p", "deleted_at", `9`)
	res = f.apply("carol", "C", f.op("project", "p", "name", `"Renamed"`), f.op("project", "p", "archived", `true`), del)
	if !slices.Equal(rejectedIDs(res), []string{del.ID + ":forbidden"}) || res.Applied != 2 {
		t.Fatalf("admin batch = %v applied %d", rejectedIDs(res), res.Applied)
	}
	// Owner may delete.
	if res := f.apply("alice", "A", f.op("project", "p", "deleted_at", `9`)); res.Applied != 1 {
		t.Fatalf("owner delete = %+v", res)
	}
	// Non-members cannot write to the shared project or its tasks at all.
	res = f.apply("mallory", "M", f.op("project", "p", "name", `"x"`), f.op("task", "t1", "title", `"x"`))
	if len(res.Rejected) != 2 || res.Applied != 0 {
		t.Fatalf("non-member = %+v", res)
	}
}

func TestRejectionIsIdempotentOnRetry(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleViewer)
	batch := []Op{f.op("task", "t1", "title", `"x"`), f.op("task", "mine", "title", `"Mine"`)}
	first := f.apply("bob", "B", batch...)
	second := f.apply("bob", "B", batch...)
	if !slices.Equal(rejectedIDs(first), rejectedIDs(second)) || len(second.Rejected) != 1 {
		t.Fatalf("first %v, second %v", rejectedIDs(first), rejectedIDs(second))
	}
	if first.Applied != 1 || second.Applied != 0 || second.Duplicates != 1 {
		t.Fatalf("first %+v second %+v", first, second)
	}
	if f.field("alice", "task", "t1", "title") != `"Milk"` {
		t.Fatal("retry stored a rejected op")
	}
}

func TestRejectedFieldsComeBackWithServerValue(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	// Bob edits as editor, then is downgraded; alice edits afterwards.
	f.apply("bob", "B", f.op("task", "t1", "title", `"Oat milk"`))
	if _, err := f.s.SetMemberRole(f.ctx, "alice", "p", "bob", RoleViewer); err != nil {
		t.Fatal(err)
	}
	f.apply("alice", "A", f.op("task", "t2", "title", `"Rye"`))
	r1, r2, r3 := f.op("task", "t1", "title", `"Soy"`), f.op("task", "t2", "title", `"Wheat"`), f.op("task", "t2", "priority", `1`)
	res := f.apply("bob", "B", r1, r2, r3)
	if len(res.Rejected) != 3 {
		t.Fatalf("rejected = %v", rejectedIDs(res))
	}
	got := map[string]string{}
	for _, o := range res.Restore {
		got[o.EntityID+"."+o.Field] = string(o.Value) + "@" + o.Device
		if o.ID == "" || o.Seq == 0 {
			t.Fatalf("restore op lacks identity: %+v", o)
		}
	}
	want := map[string]string{"t1.title": `"Oat milk"@B`, "t2.title": `"Rye"@A`}
	if len(got) != len(want) || got["t1.title"] != want["t1.title"] || got["t2.title"] != want["t2.title"] {
		t.Fatalf("restore = %v, want %v (priority has no server value)", got, want)
	}
}

func TestPullIsScopedToMemberships(t *testing.T) {
	f := newSharing(t)
	f.apply("bob", "B", f.op("task", "bobs", "title", `"Bob only"`))
	f.apply("carol", "C", f.op("task", "carols", "title", `"Carol only"`))
	f.add("alice", "bob", RoleEditor)
	f.apply("bob", "B", f.op("task", "t1", "priority", `2`))
	bob, _ := f.pullAll("bob", "B2", 0)
	if got := entityIDs(bob); !slices.Equal(got, []string{"bobs", "p", "t1", "t2"}) {
		t.Fatalf("bob sees %v", got)
	}
	carol, _ := f.pullAll("carol", "C2", 0)
	if got := entityIDs(carol); !slices.Equal(got, []string{"carols"}) {
		t.Fatalf("carol sees %v", got)
	}
	alice, _ := f.pullAll("alice", "A2", 0)
	if got := entityIDs(alice); !slices.Equal(got, []string{"inbox", "p", "secret", "t1", "t2"}) {
		t.Fatalf("alice sees %v", got)
	}
	// Collections union the scopes the same way.
	list, err := f.s.List(f.ctx, "bob", "task", false)
	if err != nil || len(list) != 3 {
		t.Fatalf("bob's tasks = %d, %v", len(list), err)
	}
}

func TestNewMemberReplaysHistoryBehindCursor(t *testing.T) {
	f := newSharing(t)
	// Bob's two devices are already up to date with his own data.
	for i := 0; i < 4; i++ {
		f.apply("bob", "B", f.op("task", fmt.Sprintf("b%d", i), "title", `"mine"`))
	}
	_, c1 := f.pullAll("bob", "B1", 0)
	_, c2 := f.pullAll("bob", "B2", 0)
	f.add("alice", "bob", RoleEditor)
	f.apply("alice", "A", f.op("task", "t3", "title", `"After"`), f.op("task", "t3", "project_id", `"p"`))
	// First page after joining is history, cursor unchanged, more = true.
	ops, next, more, err := f.s.Pull(f.ctx, "bob", c1, "B1", 3)
	if err != nil || next != c1 || !more || len(ops) != 3 {
		t.Fatalf("first page: %d ops, cursor %d->%d, more %v, %v", len(ops), c1, next, more, err)
	}
	got, end := f.pullAll("bob", "B1", c1)
	got = append(ops, got...)
	if ids := entityIDs(got); !slices.Equal(ids, []string{"p", "t1", "t2", "t3"}) {
		t.Fatalf("device 1 received %v", ids)
	}
	if end <= c1 {
		t.Fatalf("cursor did not advance after catch-up: %d", end)
	}
	// History is per device: the second device replays it too.
	got2, _ := f.pullAll("bob", "B2", c2)
	if ids := entityIDs(got2); !slices.Equal(ids, []string{"p", "t1", "t2", "t3"}) {
		t.Fatalf("device 2 received %v", ids)
	}
	// A device that starts from zero after joining gets it through the regular pull, once.
	fresh, _ := f.pullAll("bob", "B3", 0)
	seen := map[string]int{}
	for _, o := range fresh {
		seen[o.ID]++
		if seen[o.ID] > 1 {
			t.Fatalf("op %s delivered twice", o.ID)
		}
	}
	// Replaying is over: the next exchange is the regular one.
	if ops, _, more, _ := f.s.Pull(f.ctx, "bob", end, "B1", 3); len(ops) != 0 || more {
		t.Fatalf("after catch-up: %d ops more=%v", len(ops), more)
	}
}

func TestRemovedMemberReceivesNothing(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	_, cursor := f.pullAll("bob", "B", 0)
	if _, err := f.s.RemoveMember(f.ctx, "alice", "p", "bob"); err != nil {
		t.Fatal(err)
	}
	f.apply("alice", "A", f.op("task", "t1", "title", `"After removal"`))
	if ops, _ := f.pullAll("bob", "B", cursor); len(ops) != 0 {
		t.Fatalf("removed member received %d ops", len(ops))
	}
	// Mixed batch: personal op applied, queued op for the old project rejected.
	queued := f.op("task", "t1", "title", `"Queued"`)
	res := f.apply("bob", "B", queued, f.op("task", "mine", "title", `"Mine"`))
	if !slices.Equal(rejectedIDs(res), []string{queued.ID + ":forbidden"}) || res.Applied != 1 {
		t.Fatalf("mixed batch = %v applied %d", rejectedIDs(res), res.Applied)
	}
	if len(res.Restore) != 0 {
		t.Fatal("server values of a project the member left were sent back")
	}
	ms, err := f.s.Memberships(f.ctx, "bob")
	if err != nil || len(ms) != 0 {
		t.Fatalf("memberships = %+v, %v", ms, err)
	}
	if f.field("bob", "task", "t1", "title") != "<none>" {
		t.Fatal("removed member still reads the project")
	}
	// Re-adding replays the history again (the device purged it).
	f.add("alice", "bob", RoleViewer)
	got, _ := f.pullAll("bob", "B", cursor)
	if ids := entityIDs(got); !slices.Contains(ids, "t1") || !slices.Contains(ids, "p") {
		t.Fatalf("re-added member received %v", ids)
	}
}

func TestDowngradeWhileOfflineIsDeterministic(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	f.add("alice", "carol", RoleAdmin)
	// Bob edits five tasks offline (queued ops carry timestamps from before the downgrade).
	var queued []Op
	for i := 0; i < 5; i++ {
		id := fmt.Sprintf("q%d", i)
		f.apply("alice", "A", f.op("task", id, "title", `"orig"`), f.op("task", id, "project_id", `"p"`))
		queued = append(queued, f.op("task", id, "title", `"bob offline"`))
	}
	if _, err := f.s.SetMemberRole(f.ctx, "carol", "p", "bob", RoleViewer); err != nil {
		t.Fatal(err)
	}
	_, carolCursor := f.pullAll("carol", "C", 0)
	res := f.apply("bob", "B", queued...)
	if len(res.Rejected) != 5 || res.Applied != 0 {
		t.Fatalf("downgraded batch = %+v", res)
	}
	for _, r := range res.Rejected {
		if r.Reason != ReasonForbidden {
			t.Fatalf("reason = %s", r.Reason)
		}
	}
	if len(res.Restore) != 5 {
		t.Fatalf("restore = %d ops, want 5", len(res.Restore))
	}
	for _, o := range res.Restore {
		if string(o.Value) != `"orig"` {
			t.Fatalf("restore value = %s", o.Value)
		}
	}
	if ops, _ := f.pullAll("carol", "C", carolCursor); len(ops) != 0 {
		t.Fatal("other members saw the refused edits")
	}
}

func TestMembershipRules(t *testing.T) {
	f := newSharing(t)
	ctx := f.ctx
	if _, err := f.s.AddMember(ctx, "bob", "p", "carol", RoleViewer); !errors.Is(err, ErrNotFound) {
		t.Fatalf("non-member add = %v", err)
	}
	if _, err := f.s.AddMember(ctx, "alice", "p", "bob", RoleOwner); !errors.Is(err, ErrInvalidMember) {
		t.Fatalf("add as owner = %v", err)
	}
	if _, err := f.s.AddMember(ctx, "alice", "nope", "bob", RoleViewer); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown project = %v", err)
	}
	f.add("alice", "bob", RoleAdmin)
	if _, err := f.s.AddMember(ctx, "alice", "p", "bob", RoleViewer); !errors.Is(err, ErrAlreadyMember) {
		t.Fatalf("duplicate add = %v", err)
	}
	// Admin adds an editor, may not add an admin, may not touch the owner.
	if _, err := f.s.AddMember(ctx, "bob", "p", "carol", RoleAdmin); !errors.Is(err, ErrForbidden) {
		t.Fatalf("admin grants admin = %v", err)
	}
	if _, err := f.s.AddMember(ctx, "bob", "p", "carol", RoleViewer); err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.SetMemberRole(ctx, "bob", "p", "carol", RoleEditor); err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.SetMemberRole(ctx, "bob", "p", "alice", RoleViewer); !errors.Is(err, ErrForbidden) {
		t.Fatalf("admin changes owner = %v", err)
	}
	if _, err := f.s.RemoveMember(ctx, "carol", "p", "bob"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("editor removes admin = %v", err)
	}
	if _, err := f.s.RemoveMember(ctx, "alice", "p", "alice"); !errors.Is(err, ErrOwnerMustTransfer) {
		t.Fatalf("owner leaves = %v", err)
	}
	// Carol leaves on her own.
	ch, err := f.s.RemoveMember(ctx, "carol", "p", "carol")
	if err != nil || ch.From != RoleEditor || !slices.Contains(ch.Audience, "alice") {
		t.Fatalf("leave = %+v, %v", ch, err)
	}
	m, err := f.s.ProjectMembers(ctx, "bob", "p")
	if err != nil || len(m.Members) != 2 || m.Members[0].UserID != "alice" || m.OwnerID != "alice" || m.Role != RoleAdmin {
		t.Fatalf("members = %+v, %v", m, err)
	}
	if _, err := f.s.ProjectMembers(ctx, "carol", "p"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("former member lists = %v", err)
	}
	// An unshared project lists only its owner; other users get not found.
	if m, err := f.s.ProjectMembers(ctx, "alice", "secret"); err != nil || len(m.Members) != 1 || m.Role != RoleOwner {
		t.Fatalf("unshared = %+v, %v", m, err)
	}
	if _, err := f.s.ProjectMembers(ctx, "bob", "secret"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("someone else's project = %v", err)
	}
}

func TestOwnerTransfer(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	if _, err := f.s.TransferOwnership(f.ctx, "alice", "p", "carol"); !errors.Is(err, ErrInvalidMember) {
		t.Fatalf("transfer to non-member = %v", err)
	}
	if _, err := f.s.TransferOwnership(f.ctx, "bob", "p", "bob"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("editor transfers = %v", err)
	}
	if _, err := f.s.TransferOwnership(f.ctx, "alice", "p", "bob"); err != nil {
		t.Fatal(err)
	}
	ms, _ := f.s.Memberships(f.ctx, "alice")
	if len(ms) != 1 || ms[0].Role != RoleAdmin || ms[0].OwnerID != "bob" {
		t.Fatalf("alice after transfer = %+v", ms)
	}
	// The new owner has every owner right, the previous owner only admin rights.
	del := f.op("project", "p", "deleted_at", `1`)
	if res := f.apply("alice", "A", del); len(res.Rejected) != 1 {
		t.Fatal("previous owner may still delete")
	}
	if res := f.apply("bob", "B", f.op("project", "p", "deleted_at", `1`)); res.Applied != 1 {
		t.Fatalf("new owner delete = %+v", res)
	}
	if _, err := f.s.RemoveMember(f.ctx, "alice", "p", "alice"); err != nil {
		t.Fatalf("previous owner can leave: %v", err)
	}
}

func TestSharedChangesReachEveryMember(t *testing.T) {
	f := newSharing(t)
	var changes []Change
	f.s.SetObserver(func(_ context.Context, c []Change) { changes = append(changes, c...) })
	f.add("alice", "bob", RoleEditor)
	f.add("alice", "carol", RoleViewer)
	aSub := f.s.Notifier().Subscribe("alice", "A")
	cSub := f.s.Notifier().Subscribe("carol", "C")
	res := f.apply("bob", "B", f.op("task", "t1", "priority", `1`))
	if !slices.Equal(res.Audience, []string{"bob", "alice", "carol"}) {
		t.Fatalf("audience = %v", res.Audience)
	}
	f.s.NotifyApplied(res, "B")
	for _, sub := range []*Subscription{aSub, cSub} {
		select {
		case seq := <-sub.C():
			if seq != res.Seq {
				t.Fatalf("wake-up cursor %d, want %d", seq, res.Seq)
			}
		default:
			t.Fatal("member not woken")
		}
	}
	if len(changes) != 1 || changes[0].ScopeID != "project:p" || changes[0].UserID != "bob" {
		t.Fatalf("changes = %+v", changes)
	}
	// Personal writes wake only the author.
	res = f.apply("bob", "B", f.op("task", "mine", "title", `"x"`))
	if !slices.Equal(res.Audience, []string{"bob"}) {
		t.Fatalf("personal audience = %v", res.Audience)
	}
	f.s.NotifyMembership([]string{"carol"})
	if seq := <-cSub.C(); seq != MembershipWake {
		t.Fatalf("membership wake = %d", seq)
	}
}

func TestApplyStrictRefusesWholeBatch(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleViewer)
	ops := []Op{f.op("task", "mine", "title", `"x"`), f.op("task", "t1", "title", `"y"`)}
	for i := range ops {
		ops[i].Device = "server"
	}
	_, err := f.s.ApplyStrict(f.ctx, "bob", ops)
	var rej *RejectedError
	if !errors.As(err, &rej) || rej.Reason != ReasonForbidden {
		t.Fatalf("strict = %v", err)
	}
	if f.field("bob", "task", "mine", "title") != "<none>" {
		t.Fatal("strict apply stored part of a refused batch")
	}
}

// TestEditorWritesProjectNote (project-notes D2): an editor may write the
// project's note and nothing else of the project; a viewer may write neither.
func TestEditorWritesProjectNote(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	f.add("alice", "carol", RoleViewer)
	note := f.op("project", "p", "description", `"# Trip plan"`)
	doc := f.op("project", "p", "notes_doc", `"ydoc:v1:AAEC"`)
	rename := f.op("project", "p", "name", `"Mine"`)
	res := f.apply("bob", "B", note, doc, rename)
	if !slices.Equal(rejectedIDs(res), []string{rename.ID + ":forbidden"}) || res.Applied != 2 {
		t.Fatalf("editor = %v applied %d", rejectedIDs(res), res.Applied)
	}
	for _, u := range []string{"alice", "bob", "carol"} {
		if got := f.field(u, "project", "p", "description"); got != `"# Trip plan"` {
			t.Fatalf("%s reads %s", u, got)
		}
	}
	viewer := f.op("project", "p", "description", `"vandalised"`)
	if res := f.apply("carol", "C", viewer); !slices.Equal(rejectedIDs(res), []string{viewer.ID + ":forbidden"}) {
		t.Fatalf("viewer = %v", rejectedIDs(res))
	}
	if !CanWrite(RoleEditor, "project", "notes_doc") || CanWrite(RoleEditor, "project", "archived") || CanWrite(RoleViewer, "project", "description") {
		t.Fatal("CanWrite")
	}
}
