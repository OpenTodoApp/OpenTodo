package sync

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"testing"
	"time"
)

// Standalone notes (OpenSpec change notes-overview): the entity, its scope and
// sharing, the Trash, pending appends and the body version.

func TestNoteOpsApplyAndOversizedDocumentIsRefused(t *testing.T) {
	f := newSharing(t)
	res := f.apply("alice", "A",
		f.op("note", "n1", "title", `"Packing list"`),
		f.op("note", "n1", "description", `"- socks"`),
		f.op("note", "n1", "notes_doc", `"ydoc:v1:AAAA"`),
		f.op("note", "n1", "labels", `["l1"]`),
		f.op("note", "n1", "project_id", `null`),
	)
	if res.Applied != 5 || len(res.Rejected) != 0 {
		t.Fatalf("applied %d, rejected %v", res.Applied, res.Rejected)
	}
	if got := f.field("alice", "note", "n1", "title"); got != `"Packing list"` {
		t.Fatalf("title = %s", got)
	}
	big := `"ydoc:v1:` + strings.Repeat("A", MaxDocBytes) + `"`
	if err := Validate(Op{ID: "x", Entity: "note", EntityID: "n1", Field: "notes_doc", Value: []byte(big), TS: 1, Device: "A"}); !errors.Is(err, ErrInvalidOp) {
		t.Fatalf("oversized document: %v", err)
	}
	// A note is never a task: the task list does not hold it.
	tasks, err := f.s.List(f.ctx, "alice", "task", false)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range tasks {
		if string(e["id"]) == `"n1"` {
			t.Fatal("the note is listed as a task")
		}
	}
}

func TestNotesFollowTheirSharedProject(t *testing.T) {
	f := newSharing(t)
	f.apply("alice", "A",
		f.op("note", "n1", "title", `"Plan"`), f.op("note", "n1", "project_id", `"p"`),
		f.op("note", "mine", "title", `"Diary"`), f.op("note", "mine", "project_id", `null`),
	)
	var seqBefore int64
	if err := f.s.db.QueryRow(`SELECT MIN(seq) FROM ops WHERE entity = 'note' AND entity_id = 'n1'`).Scan(&seqBefore); err != nil {
		t.Fatal(err)
	}
	f.add("alice", "bob", RoleEditor)
	f.add("alice", "carol", RoleViewer)
	// Sharing relabels the project's notes and keeps their seq.
	var scope string
	var seq int64
	if err := f.s.db.QueryRow(`SELECT s.scope_id, o.seq FROM ops o JOIN op_scopes s ON s.seq = o.seq WHERE o.entity = 'note' AND o.entity_id = 'n1' ORDER BY o.seq LIMIT 1`).Scan(&scope, &seq); err != nil {
		t.Fatal(err)
	}
	if scope != ProjectScope("p") || seq != seqBefore {
		t.Fatalf("relabel: scope %s seq %d (was %d)", scope, seq, seqBefore)
	}
	// A new member replays the note; the personal note stays private.
	ops, _ := f.pullAll("bob", "B", 0)
	ids := entityIDs(ops)
	if !slices.Contains(ids, "n1") || slices.Contains(ids, "mine") {
		t.Fatalf("bob received %v", ids)
	}
	// Editors write notes, viewers do not.
	if res := f.apply("bob", "B", f.op("note", "n1", "title", `"Plan v2"`)); len(res.Rejected) != 0 {
		t.Fatalf("editor refused: %v", res.Rejected)
	}
	res := f.apply("carol", "C", f.op("note", "n1", "title", `"Viewer"`))
	if len(res.Rejected) != 1 || res.Rejected[0].Reason != ReasonForbidden {
		t.Fatalf("viewer: %+v", res)
	}
	// Moving the personal note into the shared project is a scope change.
	res = f.apply("alice", "A", f.op("note", "mine", "project_id", `"p"`))
	if len(res.Rejected) != 1 || res.Rejected[0].Reason != ReasonScopeChange {
		t.Fatalf("scope change: %+v", res)
	}
}

func TestNotesInTheTrash(t *testing.T) {
	f := newSharing(t)
	f.apply("alice", "A",
		f.op("note", "n1", "title", `"Trip"`), f.op("note", "n1", "deleted_at", "5000"),
		f.op("note", "n2", "title", `"Of the project"`), f.op("note", "n2", "project_id", `"secret"`),
		f.op("note", "n3", "title", `"Live"`),
	)
	// History leaves documents and pending appends out.
	f.apply("alice", "A", f.op("note", "n3", "notes_doc", `"ydoc:v1:AAAA"`), f.op("note", "n3", "appends.a1", `"later"`))
	h, err := f.s.History(f.ctx, "alice", "note", "n3", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	for _, cs := range h.ChangeSets {
		for _, c := range cs.Changes {
			if c.Field == "notes_doc" || strings.HasPrefix(c.Field, AppendPrefix) {
				t.Fatalf("history shows %s", c.Field)
			}
		}
	}
	if _, err := f.s.Purge(f.ctx, "alice", "note", []string{"n3"}); !errors.Is(err, ErrNotDeleted) {
		t.Fatalf("purge live note: %v", err)
	}
	res, err := f.s.Purge(f.ctx, "alice", "note", []string{"n1"})
	if err != nil || res.Notes != 1 {
		t.Fatalf("purge: %+v %v", res, err)
	}
	if got := f.field("alice", "note", "n1", "title"); got != "<none>" {
		t.Fatalf("purged note still has %s", got)
	}
	// Purging a project purges its notes.
	f.apply("alice", "A", f.op("project", "secret", "deleted_at", "6000"))
	res, err = f.s.Purge(f.ctx, "alice", "project", []string{"secret"})
	if err != nil || res.Notes != 1 {
		t.Fatalf("project purge: %+v %v", res, err)
	}
	// Retention purges an old trashed note.
	f.apply("alice", "A", f.op("note", "n3", "deleted_at", "7000"))
	res, err = f.s.PurgeExpired(f.ctx, time.UnixMilli(8000))
	if err != nil || res.Notes != 1 {
		t.Fatalf("retention: %+v %v", res, err)
	}
	if next, ok, err := f.s.NextRetention(f.ctx, 30); err != nil || ok {
		t.Fatalf("next retention after purge: %v %v %v", next, ok, err)
	}
}

func TestPendingAppendReceiptRules(t *testing.T) {
	f := newSharing(t)
	f.apply("alice", "A", f.op("note", "n1", "title", `"Meeting"`), f.op("task", "t1", "description", `"base"`))
	if res := f.apply("alice", "S", f.op("note", "n1", "appends.a1", `"- ship Friday"`)); len(res.Rejected) != 0 {
		t.Fatalf("first append: %v", res.Rejected)
	}
	// An append is written once: a second non-empty value is refused.
	res := f.apply("alice", "S", f.op("note", "n1", "appends.a1", `"- other"`))
	if len(res.Rejected) != 1 || res.Rejected[0].Reason != ReasonAppendTaken {
		t.Fatalf("second value: %+v", res)
	}
	if got := f.field("alice", "note", "n1", "appends.a1"); got != `"- ship Friday"` {
		t.Fatalf("stored append changed to %s", got)
	}
	// A device folds it: "" is accepted, and the key stays taken.
	if res := f.apply("alice", "A", f.op("note", "n1", "appends.a1", `""`)); len(res.Rejected) != 0 {
		t.Fatalf("fold: %v", res.Rejected)
	}
	if res := f.apply("alice", "S", f.op("note", "n1", "appends.a1", `"again"`)); len(res.Rejected) != 1 {
		t.Fatalf("value after fold: %+v", res)
	}
	// At most MaxPendingAppends pending; the next is too_many_appends.
	var ops []Op
	for i := range MaxPendingAppends {
		ops = append(ops, f.op("task", "t1", fmt.Sprintf("appends.b%d", i), `"x"`))
	}
	if res := f.apply("alice", "S", ops...); len(res.Rejected) != 0 {
		t.Fatalf("100 appends: %v", res.Rejected[0])
	}
	res = f.apply("alice", "S", f.op("task", "t1", "appends.over", `"x"`))
	if len(res.Rejected) != 1 || res.Rejected[0].Reason != ReasonTooManyAppends {
		t.Fatalf("101st: %+v", res)
	}
	// The projection plus pending appends stay within 64 KB.
	f.apply("alice", "A", f.op("note", "n2", "description", `"`+strings.Repeat("a", MaxValueBytes-100)+`"`))
	res = f.apply("alice", "S", f.op("note", "n2", "appends.big", `"`+strings.Repeat("b", 200)+`"`))
	if len(res.Rejected) != 1 || res.Rejected[0].Reason != ReasonTooLarge {
		t.Fatalf("too large: %+v", res)
	}
	// Appends on other entities are unknown fields.
	if err := Validate(Op{ID: "y", Entity: "project", EntityID: "p", Field: "appends.a", Value: []byte(`"x"`), TS: 1, Device: "A"}); err == nil {
		t.Fatal("project appends accepted")
	}
}

func TestBodyVersionCheck(t *testing.T) {
	f := newSharing(t)
	f.apply("alice", "A", f.op("note", "n1", "description", `"one"`), f.op("note", "n1", "title", `"T"`))
	infos, err := f.s.BodyInfos(f.ctx, "alice", "note", "n1")
	if err != nil {
		t.Fatal(err)
	}
	v := infos["n1"].Version
	if v == "" || v == "0" {
		t.Fatalf("version %q", v)
	}
	// A title change does not change the body version.
	f.apply("alice", "A", f.op("note", "n1", "title", `"T2"`))
	if infos, _ = f.s.BodyInfos(f.ctx, "alice", "note", "n1"); infos["n1"].Version != v {
		t.Fatalf("title moved the version: %s -> %s", v, infos["n1"].Version)
	}
	write := f.op("note", "n1", "description", `"two"`)
	write.Device = "server"
	if _, err := f.s.ApplyStrict(WithBodyVersion(f.ctx, "note", "n1", v), "alice", []Op{write}); err != nil {
		t.Fatalf("matching version: %v", err)
	}
	// The stale version is refused and nothing is written.
	stale := f.op("note", "n1", "description", `"three"`)
	stale.Device = "server"
	_, err = f.s.ApplyStrict(WithBodyVersion(f.ctx, "note", "n1", v), "alice", []Op{stale})
	var changed *BodyChangedError
	if !errors.As(err, &changed) || !errors.Is(err, ErrBodyChanged) || changed.Current == v {
		t.Fatalf("stale version: %v", err)
	}
	if got := f.field("alice", "note", "n1", "description"); got != `"two"` {
		t.Fatalf("description = %s", got)
	}
	// Pending appends: oldest first, and they move the version.
	f.apply("alice", "S", f.op("note", "n1", "appends.z", `"first"`), f.op("note", "n1", "appends.a", `"second"`))
	infos, _ = f.s.BodyInfos(f.ctx, "alice", "note", "")
	got := infos["n1"]
	if len(got.Appends) != 2 || got.Appends[0].ID != "z" || got.Appends[1].Text != "second" || got.Version == changed.Current {
		t.Fatalf("appends %+v version %s", got.Appends, got.Version)
	}
	if text := PlainText("two\n", got.Appends); text != "two\n\nfirst\n\nsecond" {
		t.Fatalf("plain text %q", text)
	}
}
