package sync

import (
	"encoding/json"
	"errors"
	"slices"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/store"
)

// Entity id ownership (OpenSpec change entity-id-ownership, security finding
// H1): an id names one entity on the server. These tests use the sharing
// fixture: alice owns the unshared project "p" (tasks t1, t2), the private
// Inbox task "inbox" and the project "secret".

// legacyWrite stores ops in a scope without the resolver, as data written
// before entity-id-ownership could be.
func (f *sharingFixture) legacyWrite(user, scope string, ops ...Op) {
	f.t.Helper()
	tx, err := f.s.db.BeginTx(f.ctx, nil)
	if err != nil {
		f.t.Fatal(err)
	}
	defer tx.Rollback()
	for _, op := range ops {
		op.Device = "legacy"
		if _, err := writeOp(f.ctx, tx, user, op, scope, 1, newChangeTracker(user)); err != nil {
			f.t.Fatal(err)
		}
	}
	if err := tx.Commit(); err != nil {
		f.t.Fatal(err)
	}
}

// scopesOf lists the scopes holding fields of one entity.
func (f *sharingFixture) scopesOf(entity, id string) []string {
	f.t.Helper()
	out, err := scopesHolding(f.ctx, f.s.db, entity, id)
	if err != nil {
		f.t.Fatal(err)
	}
	return out
}

// bobSharesWithAlice: bob creates the project "bp" and adds alice to it. No
// consent is needed, so any account can put alice in a project with itself.
func (f *sharingFixture) bobSharesWithAlice() {
	f.t.Helper()
	f.apply("bob", "B", f.op("project", "bp", "name", `"Bob's"`))
	if _, err := f.s.AddMember(f.ctx, "bob", "bp", "alice", RoleEditor); err != nil {
		f.t.Fatal(err)
	}
}

func reasonsOf(res ApplyResult) []string {
	var out []string
	for _, r := range res.Rejected {
		out = append(out, r.Reason)
	}
	return out
}

// TestSquattedTaskIDIsRefused is the H1 attack end to end: bob learns the id
// of alice's private task and creates a task with that id in a project he
// shares with her. Before entity-id-ownership the write was accepted, alice's
// later private edits went into bob's project, and bob could purge her task.
func TestSquattedTaskIDIsRefused(t *testing.T) {
	t.Parallel()
	f := newSharing(t)
	f.bobSharesWithAlice()

	squat := []Op{f.op("task", "inbox", "title", `"hijacked"`), f.op("task", "inbox", "project_id", `"bp"`)}
	res := f.apply("bob", "B", squat...)
	if res.Applied != 0 || !slices.Equal(reasonsOf(res), []string{ReasonForbidden, ReasonForbidden}) || len(res.Restore) != 0 {
		t.Fatalf("squat = %+v", res)
	}
	// The refusal is the one of any write to a task bob cannot see: it says
	// nothing about the task and hands nothing back.
	other := f.apply("bob", "B", f.op("task", "t1", "title", `"x"`))
	if !slices.Equal(reasonsOf(other), []string{ReasonForbidden}) || len(other.Restore) != 0 {
		t.Fatalf("write to an invisible task = %+v", other)
	}
	// The same through ApplyStrict (REST, CalDAV, MCP, rules, email, issues).
	strictOp := f.op("task", "inbox", "title", `"hijacked"`)
	strictOp.Device = "B"
	_, err := f.s.ApplyStrict(f.ctx, "bob", []Op{strictOp})
	var rej *RejectedError
	if !errors.As(err, &rej) || rej.Reason != ReasonForbidden {
		t.Fatalf("strict squat: %v", err)
	}

	// Alice's task stays hers and her edits stay private.
	if got := f.field("alice", "task", "inbox", "title"); got != `"Private"` {
		t.Fatalf("alice's title = %s", got)
	}
	if res := f.apply("alice", "A", f.op("task", "inbox", "description", `"my secret note"`)); res.Applied != 1 {
		t.Fatalf("alice's edit = %+v", res)
	}
	if got := f.scopesOf("task", "inbox"); !slices.Equal(got, []string{"user:alice"}) {
		t.Fatalf("inbox lives in %v", got)
	}
	if got := f.field("bob", "task", "inbox", "description"); got != "<none>" {
		t.Fatalf("bob reads %s", got)
	}
	ops, _ := f.pullAll("bob", "B", 0)
	if slices.Contains(entityIDs(ops), "inbox") {
		t.Fatal("bob's devices received alice's private task")
	}
	// And bob cannot remove it.
	if _, err := f.s.Purge(f.ctx, "bob", "task", []string{"inbox"}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("bob purges alice's task: %v", err)
	}
	if got := f.field("alice", "task", "inbox", "title"); got != `"Private"` {
		t.Fatalf("alice's task after bob's attempts = %s", got)
	}
}

// TestSquatRefusedForEveryEntity: the rule holds for every entity whose id a
// client chooses and the server places by lookup.
func TestSquatRefusedForEveryEntity(t *testing.T) {
	t.Parallel()
	f := newSharing(t)
	f.apply("alice", "A",
		f.op("section", "s-a", "name", `"Doing"`), f.op("section", "s-a", "project_id", `"p"`),
		f.op("field", "f-a", "name", `"Cost"`), f.op("field", "f-a", "project_id", `"p"`),
		f.op("rule", "r-a", "name", `"Mine"`))
	f.apply("alice", "A", f.commentOps("c-a", "inbox", "alice", "private")...)
	f.apply("alice", "A", f.attachmentOps("a-a", "inbox", "alice", 10)...)
	f.apply("alice", "A", f.entryOps("e-a", "inbox", "alice", 1000, 2000)...)
	f.bobSharesWithAlice()
	f.apply("bob", "B", f.op("task", "bt", "title", `"Bob's task"`), f.op("task", "bt", "project_id", `"bp"`))

	cases := map[string][]Op{
		"project":    {f.op("project", "secret", "name", `"Mine now"`)},
		"section":    {f.op("section", "s-a", "name", `"x"`), f.op("section", "s-a", "project_id", `"bp"`)},
		"field":      {f.op("field", "f-a", "name", `"x"`), f.op("field", "f-a", "project_id", `"bp"`)},
		"rule":       {f.op("rule", "r-a", "name", `"x"`)},
		"comment":    f.commentOps("c-a", "bt", "bob", "x"),
		"attachment": f.attachmentOps("a-a", "bt", "bob", 10),
		"time_entry": f.entryOps("e-a", "bt", "bob", 1000, 2000),
	}
	for name, ops := range cases {
		res := f.apply("bob", "B", ops...)
		if res.Applied != 0 || len(res.Restore) != 0 {
			t.Errorf("%s: %+v", name, res)
		}
		for _, r := range res.Rejected {
			if r.Reason != ReasonForbidden {
				t.Errorf("%s: reason %s", name, r.Reason)
			}
		}
	}
	for entity, id := range map[string]string{"project": "secret", "section": "s-a", "field": "f-a", "rule": "r-a",
		"comment": "c-a", "attachment": "a-a", "time_entry": "e-a"} {
		if got := f.scopesOf(entity, id); !slices.Equal(got, []string{"user:alice"}) {
			t.Errorf("%s %s lives in %v", entity, id, got)
		}
	}
	// Personal entities stay per account: a label, view or reminder id of
	// alice's means nothing in bob's scope (project_prefs is keyed by a project
	// id on purpose, one record per member).
	f.apply("alice", "A", f.op("label", "l-a", "name", `"errand"`))
	if res := f.apply("bob", "B", f.op("label", "l-a", "name", `"bob's"`)); res.Applied != 1 {
		t.Fatalf("bob's label = %+v", res)
	}
	if got := f.field("alice", "label", "l-a", "name"); got != `"errand"` {
		t.Fatalf("alice's label = %s", got)
	}
}

// TestPredictedIDCannotCaptureAWrite: some ids are derived (a recurring task's
// occurrence record is named after the series id and the date). Bob, who knows
// the id alice's device will use, creates it first in the project he shares
// with her; alice's write that places the record in her own scope is refused
// as a whole instead of filling bob's task.
func TestPredictedIDCannotCaptureAWrite(t *testing.T) {
	t.Parallel()
	f := newSharing(t)
	f.bobSharesWithAlice()
	occ := OccurrenceID("inbox", "2026-10-26")
	f.apply("bob", "B", f.op("task", occ, "title", `"bait"`), f.op("task", occ, "project_id", `"bp"`))
	res := f.apply("alice", "A",
		f.op("task", occ, "title", `"Private"`), f.op("task", occ, "description", `"my secret note"`),
		f.op("task", occ, "project_id", `null`))
	if res.Applied != 0 || !slices.Equal(reasonsOf(res), []string{ReasonScopeChange, ReasonScopeChange, ReasonScopeChange}) {
		t.Fatalf("alice's occurrence = %+v", res)
	}
	if got := f.field("bob", "task", occ, "description"); got != "" {
		t.Fatalf("bob reads %s", got)
	}
	// A batch that keeps the task where it is still applies.
	if res := f.apply("alice", "A", f.op("task", occ, "priority", `1`), f.op("task", occ, "project_id", `"bp"`)); res.Applied != 2 {
		t.Fatalf("edit in place = %+v", res)
	}
}

// TestLegacySquatRoutesToTheOwner: a squat written before entity-id-ownership
// stays in the database. Alice's writes go to her own task (the copy with the
// earliest op), bob's writes to his copy are refused, and his purge of it
// leaves alice's reminders alone.
func TestLegacySquatRoutesToTheOwner(t *testing.T) {
	t.Parallel()
	f := newSharing(t)
	f.apply("alice", "A", f.op("reminder", "rem", "task_id", `"inbox"`), f.op("reminder", "rem", "offset_minutes", `10`))
	f.bobSharesWithAlice()
	f.legacyWrite("bob", ProjectScope("bp"), f.op("task", "inbox", "title", `"hijacked"`), f.op("task", "inbox", "project_id", `"bp"`))

	if res := f.apply("alice", "A", f.op("task", "inbox", "description", `"my secret note"`)); res.Applied != 1 {
		t.Fatalf("alice's edit = %+v", res)
	}
	var scope string
	if err := f.s.db.QueryRow(`SELECT scope_id FROM scope_fields WHERE entity = 'task' AND entity_id = 'inbox' AND field = 'description'`).Scan(&scope); err != nil || scope != "user:alice" {
		t.Fatalf("alice's edit went to %q (%v)", scope, err)
	}
	if got := f.field("alice", "task", "inbox", "title"); got != `"Private"` {
		t.Fatalf("alice is shown %s", got)
	}
	list, err := f.s.List(f.ctx, "alice", "task", false)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range list {
		if string(e["id"]) == `"inbox"` && string(e["title"]) != `"Private"` {
			t.Fatalf("alice's list shows %s", e["title"])
		}
	}
	res := f.apply("bob", "B", f.op("task", "inbox", "title", `"again"`), f.op("task", "inbox", "deleted_at", `5`))
	if !slices.Equal(reasonsOf(res), []string{ReasonForbidden, ReasonForbidden}) {
		t.Fatalf("bob writes his squat = %+v", res)
	}
	if got := f.field("bob", "task", "inbox", "description"); got != "" {
		t.Fatalf("bob reads %s", got)
	}

	// A squat that was already in the trash can still be purged by bob; alice's
	// reminder on her own task survives it.
	f.legacyWrite("bob", ProjectScope("bp"), f.op("task", "inbox", "deleted_at", `5`))
	if _, err := f.s.Purge(f.ctx, "bob", "task", []string{"inbox"}); err != nil {
		t.Fatal(err)
	}
	if got := f.field("alice", "reminder", "rem", "task_id"); got != `"inbox"` {
		t.Fatalf("alice's reminder = %s", got)
	}
}

// TestLegacyDisjointCopiesKeepWorking: two accounts that imported the same
// export before entity-id-ownership hold the same ids in their own personal
// scopes. Nobody sees both, so each keeps editing their own copy.
func TestLegacyDisjointCopiesKeepWorking(t *testing.T) {
	t.Parallel()
	f := newSharing(t)
	f.legacyWrite("bob", PersonalScope("bob"), f.op("task", "inbox", "title", `"Bob's copy"`), f.op("project", "secret", "name", `"Bob's"`))
	if res := f.apply("bob", "B", f.op("task", "inbox", "title", `"Bob's edit"`), f.op("project", "secret", "name", `"Bob's edit"`)); res.Applied != 2 {
		t.Fatalf("bob's edit = %+v", res)
	}
	if res := f.apply("alice", "A", f.op("task", "inbox", "title", `"Alice's edit"`)); res.Applied != 1 {
		t.Fatalf("alice's edit = %+v", res)
	}
	if a, b := f.field("alice", "task", "inbox", "title"), f.field("bob", "task", "inbox", "title"); a != `"Alice's edit"` || b != `"Bob's edit"` {
		t.Fatalf("alice %s, bob %s", a, b)
	}
}

// TestProjectWorkspaceMustBeTheAuthors (security finding L10): a project joins
// only a workspace its author belongs to, and a value written elsewhere never
// counts, so nobody can block the deletion of someone else's workspace.
func TestProjectWorkspaceMustBeTheAuthors(t *testing.T) {
	t.Parallel()
	f := newSharing(t)
	joinWorkspace(t, f.s.db, "w-alice", "alice")
	f.apply("bob", "B", f.op("project", "bp", "name", `"Bob's"`))
	move := f.op("project", "bp", "workspace_id", `"w-alice"`)
	if res := f.apply("bob", "B", move); !slices.Equal(rejectedIDs(res), []string{move.ID + ":forbidden"}) {
		t.Fatalf("bob's move = %+v", res)
	}
	// Written before the check: ignored by the workspace's project list.
	f.legacyWrite("bob", PersonalScope("bob"), f.op("project", "bp", "workspace_id", `"w-alice"`))
	if ws, err := projectWorkspace(f.ctx, f.s.db, "bp"); err != nil || ws != "" {
		t.Fatalf("bp's workspace = %q (%v)", ws, err)
	}
	if _, err := f.s.DeleteWorkspace(f.ctx, "alice", "w-alice"); err != nil {
		t.Fatalf("alice deletes her empty workspace: %v", err)
	}
	// The author's own workspaces, created or default, are accepted.
	joinWorkspace(t, f.s.db, "w-bob", "bob")
	if res := f.apply("bob", "B", f.op("project", "bp", "workspace_id", `"w-bob"`)); res.Applied != 1 {
		t.Fatalf("bob's own workspace = %+v", res)
	}
	if ws, err := projectWorkspace(f.ctx, f.s.db, "bp"); err != nil || ws != "w-bob" {
		t.Fatalf("bp's workspace = %q (%v)", ws, err)
	}
	if res := f.apply("alice", "A", f.op("project", "p", "workspace_id", mustJSON(store.DefaultWorkspaceID("alice")))); res.Applied != 1 {
		t.Fatalf("alice's default workspace = %+v", res)
	}
}

// TestServerOccurrenceNamesItsProject: the server's occurrence record (REST,
// CalDAV and agent completions) always carries project_id, even for a series
// that never had one, so a record id created first in a shared project is
// refused as a whole instead of receiving the series' title.
func TestServerOccurrenceNamesItsProject(t *testing.T) {
	t.Parallel()
	f := newSharing(t)
	f.apply("alice", "A", f.op("task", "series", "title", `"Therapy"`), f.op("task", "series", "recurrence", `"every week"`),
		f.op("task", "series", "due", `{"date":"2026-10-12"}`))
	f.bobSharesWithAlice()
	existing, err := f.s.Get(f.ctx, "alice", "task", "series")
	if err != nil {
		t.Fatal(err)
	}
	body := map[string]json.RawMessage{"completed_at": json.RawMessage(`200`)}
	id, record, ok, err := f.s.RecurringCompletion(f.ctx, "alice", "series", body, existing, "2026-10-12")
	if err != nil || !ok || string(record["project_id"]) != "null" {
		t.Fatalf("record %s = %v (ok %v, %v)", id, record, ok, err)
	}
	f.apply("bob", "B", f.op("task", id, "title", `"bait"`), f.op("task", id, "project_id", `"bp"`))
	var ops []Op
	for field, v := range record {
		ops = append(ops, f.op("task", id, field, string(v)))
	}
	if res := f.apply("alice", "A", ops...); res.Applied != 0 {
		t.Fatalf("alice's record = %+v", res)
	}
	if got := f.field("bob", "task", id, "title"); got != `"bait"` {
		t.Fatalf("bob reads %s", got)
	}
}
