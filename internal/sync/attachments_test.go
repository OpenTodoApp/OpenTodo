package sync

import (
	"slices"
	"testing"
	"time"
)

// attachmentOps builds the ops of a new file attachment in one batch.
func (f *sharingFixture) attachmentOps(id, task, author string, size int, extra ...Op) []Op {
	ops := []Op{
		f.op("attachment", id, "task_id", `"`+task+`"`),
		f.op("attachment", id, "author_id", `"`+author+`"`),
		f.op("attachment", id, "comment_id", `null`),
		f.op("attachment", id, "name", `"photo.png"`),
		f.op("attachment", id, "mime", `"image/png"`),
		f.op("attachment", id, "size", mustJSON(size)),
		f.op("attachment", id, "sha256", `"abc"`),
		f.op("attachment", id, "url", `null`),
		f.op("attachment", id, "encrypted", `false`),
		f.op("attachment", id, "created_at", `1000`),
	}
	return append(ops, extra...)
}

func TestValidateAttachmentOps(t *testing.T) {
	cases := []struct {
		field, value string
		ok           bool
	}{
		{"name", `"report.pdf"`, true}, {"name", `""`, false}, {"name", `"a/b.png"`, false}, {"name", `"a\\b.png"`, false},
		{"name", mustJSON(string(make([]rune, 256))), false}, {"name", `"enc:v1:abc/def=="`, true},
		{"url", `"https://example.com/x"`, true}, {"url", `"http://example.com"`, true}, {"url", `null`, true},
		{"url", `"javascript:alert(1)"`, false}, {"url", `"file:///etc/passwd"`, false}, {"url", `"ftp://x"`, false},
		{"size", `0`, true}, {"size", `1048576`, true}, {"size", `-1`, false}, {"size", `1.5`, false},
		{"uploaded_at", `null`, true}, {"encrypted", `"yes"`, false},
	}
	for _, c := range cases {
		err := Validate(Op{ID: "o", Entity: "attachment", EntityID: "a1", Field: c.field, Value: []byte(c.value), TS: 1, Device: "D"})
		if (err == nil) != c.ok {
			t.Errorf("%s %s: ok=%v err=%v", c.field, c.value, c.ok, err)
		}
	}
}

func TestAttachmentAuthorship(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleViewer)
	f.add("alice", "carol", RoleAdmin)

	// A viewer may attach a file to a shared task, as they may comment.
	if res := f.apply("bob", "B", f.attachmentOps("a1", "t1", "bob", 10)...); len(res.Rejected) != 0 {
		t.Fatalf("viewer attach: %+v", res.Rejected)
	}
	if f.field("alice", "attachment", "a1", "name") != `"photo.png"` {
		t.Fatal("owner should see the shared attachment")
	}
	// A forged author is refused.
	if res := f.apply("bob", "B", f.attachmentOps("a2", "t1", "alice", 10)...); res.Applied != 0 || len(res.Rejected) != 10 {
		t.Fatalf("forged author: %+v", res)
	}
	// Only the author renames; immutable fields never change.
	if res := f.apply("carol", "C", f.op("attachment", "a1", "name", `"x.png"`)); len(res.Rejected) != 1 {
		t.Fatalf("rename by other: %+v", res)
	}
	if res := f.apply("bob", "B", f.op("attachment", "a1", "name", `"renamed.png"`)); len(res.Rejected) != 0 {
		t.Fatalf("author rename: %+v", res)
	}
	for _, field := range []string{"size", "mime", "sha256", "task_id"} {
		val := map[string]string{"size": `99`, "mime": `"text/html"`, "sha256": `"zzz"`, "task_id": `"t2"`}[field]
		if res := f.apply("bob", "B", f.op("attachment", "a1", field, val)); len(res.Rejected) != 1 {
			t.Fatalf("immutable %s: %+v", field, res)
		}
	}
	// The admin removes someone else's attachment; uploaded_at is the server's alone.
	if res := f.apply("bob", "B", f.op("attachment", "a1", "uploaded_at", `5000`)); len(res.Rejected) != 1 {
		t.Fatalf("device uploaded_at: %+v", res)
	}
	up := f.op("attachment", "a1", "uploaded_at", `5000`)
	up.Device = ServerDevice
	if _, err := f.s.ApplyStrict(f.ctx, "bob", []Op{up}); err != nil {
		t.Fatalf("server uploaded_at: %v", err)
	}
	if res := f.apply("carol", "C", f.op("attachment", "a1", "deleted_at", `6000`)); len(res.Rejected) != 0 {
		t.Fatalf("admin remove: %+v", res)
	}
}

func TestAttachmentCommentRules(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	f.apply("alice", "A", f.commentOps("c-alice", "t1", "alice", "mine")...)
	f.apply("bob", "B", f.commentOps("c-bob", "t1", "bob", "his")...)
	f.apply("bob", "B", f.commentOps("c-bob-t2", "t2", "bob", "other task")...)
	withComment := func(id, comment string) []Op {
		ops := f.attachmentOps(id, "t1", "bob", 10)
		for i := range ops {
			if ops[i].Field == "comment_id" {
				ops[i].Value = []byte(`"` + comment + `"`)
			}
		}
		return ops
	}
	if res := f.apply("bob", "B", withComment("a1", "c-bob")...); len(res.Rejected) != 0 {
		t.Fatalf("own comment: %+v", res.Rejected)
	}
	if res := f.apply("bob", "B", withComment("a2", "c-alice")...); res.Applied != 0 {
		t.Fatalf("comment of another author: %+v", res)
	}
	if res := f.apply("bob", "B", withComment("a3", "c-bob-t2")...); res.Applied != 0 {
		t.Fatalf("comment of another task: %+v", res)
	}
	// A comment created in the same batch as its attachment.
	ops := append(f.commentOps("c-new", "t1", "bob", "with a file"), withComment("a4", "c-new")...)
	if res := f.apply("bob", "B", ops...); len(res.Rejected) != 0 {
		t.Fatalf("batch comment: %+v", res.Rejected)
	}
}

func TestAttachmentLimitAndPurgedTask(t *testing.T) {
	f := newSharing(t)
	f.s.SetAttachmentLimit(func() int64 { return 100 })
	if res := f.apply("alice", "A", f.attachmentOps("big", "t1", "alice", 101)...); res.Applied != 0 || len(res.Rejected) == 0 || res.Rejected[0].Reason != ReasonTooLarge {
		t.Fatalf("too large: %+v", res)
	}
	if res := f.apply("alice", "A", f.attachmentOps("ok", "t1", "alice", 100)...); len(res.Rejected) != 0 {
		t.Fatalf("at the limit: %+v", res)
	}
	// Ops for an attachment of a purged task are discarded, not stored.
	f.apply("alice", "A", f.op("task", "inbox", "deleted_at", `8000`))
	if _, err := f.s.Purge(f.ctx, "alice", "task", []string{"inbox"}); err != nil {
		t.Fatal(err)
	}
	res := f.apply("alice", "A", f.attachmentOps("late", "inbox", "alice", 10)...)
	if res.Applied != 0 || len(res.Rejected) != 0 || res.Duplicates != 10 {
		t.Fatalf("late attachment: %+v", res)
	}
}

func TestServerDeviceIsReserved(t *testing.T) {
	if !ReservedDevice("server") || ReservedDevice("a-device-uuid") {
		t.Fatal("server device should be reserved, device uuids not")
	}
}

type fakeBlobs struct {
	files   map[string]time.Time
	removed []string
}

func (b *fakeBlobs) Remove(id string) error {
	delete(b.files, id)
	b.removed = append(b.removed, id)
	return nil
}

func (b *fakeBlobs) Walk(fn func(string, time.Time) error) error {
	for id, mod := range b.files {
		if err := fn(id, mod); err != nil {
			return err
		}
	}
	return nil
}

func TestAttachmentLifecycle(t *testing.T) {
	f := newSharing(t)
	now := time.Date(2026, 10, 15, 12, 0, 0, 0, time.UTC)
	f.s.now = func() time.Time { return now }
	blobs := &fakeBlobs{files: map[string]time.Time{"a1": now, "a2": now, "old": now.Add(-40 * 24 * time.Hour)}}
	f.s.SetBlobStore(blobs)

	// Purging a task purges its attachments and removes their files after commit.
	f.apply("alice", "A", f.attachmentOps("a1", "inbox", "alice", 10)...)
	f.apply("alice", "A", f.op("task", "inbox", "deleted_at", `8000`))
	pr, err := f.s.Purge(f.ctx, "alice", "task", []string{"inbox"})
	if err != nil || pr.Attachments != 1 || !slices.Contains(blobs.removed, "a1") {
		t.Fatalf("purge = %+v, %v, removed %v", pr, err, blobs.removed)
	}
	var n int
	f.s.db.QueryRow(`SELECT COUNT(*) FROM ops WHERE entity='attachment'`).Scan(&n)
	if n != 0 {
		t.Fatalf("%d attachment ops left", n)
	}

	// Retention purges a 31-day-old removed attachment; a fresh removal stays.
	f.apply("alice", "A", f.attachmentOps("a2", "t1", "alice", 10)...)
	f.apply("alice", "A", f.attachmentOps("a3", "t1", "alice", 10)...)
	f.apply("alice", "A", f.op("attachment", "a2", "deleted_at", mustJSON(now.Add(-31*24*time.Hour).UnixMilli())))
	f.apply("alice", "A", f.op("attachment", "a3", "deleted_at", mustJSON(now.Add(-3*24*time.Hour).UnixMilli())))
	res, err := f.s.RetentionPass(f.ctx, 30)
	if err != nil || res.Attachments != 1 || !slices.Contains(blobs.removed, "a2") || slices.Contains(blobs.removed, "a3") {
		t.Fatalf("retention = %+v, %v, removed %v", res, err, blobs.removed)
	}
	if f.field("alice", "attachment", "a3", "name") != `"photo.png"` {
		t.Fatal("the recent removal was purged")
	}
}

func TestOrphanSweep(t *testing.T) {
	f := newSharing(t)
	now := time.Date(2026, 10, 15, 12, 0, 0, 0, time.UTC)
	f.s.now = func() time.Time { return now }
	blobs := &fakeBlobs{files: map[string]time.Time{
		"young-orphan": now.Add(-3 * 24 * time.Hour),
		"old-orphan":   now.Add(-8 * 24 * time.Hour),
		"a1":           now.Add(-30 * 24 * time.Hour),
	}}
	f.s.SetBlobStore(blobs)
	f.apply("alice", "A", f.attachmentOps("a1", "t1", "alice", 10)...)
	n, err := f.s.SweepOrphans(f.ctx)
	if err != nil || n != 1 || !slices.Equal(blobs.removed, []string{"old-orphan"}) {
		t.Fatalf("sweep = %d, %v, removed %v", n, err, blobs.removed)
	}
}

// note-attachments 1.2: "Attach to a note offline", "Two parents" and "Viewer of a shared note".
func TestNoteAttachments(t *testing.T) {
	f := newSharing(t)
	noteOps := func(id, author string, extra ...Op) []Op {
		ops := f.attachmentOps(id, "x", author, 10, extra...)
		out := []Op{}
		for _, op := range ops {
			if op.Field != "task_id" {
				out = append(out, op)
			}
		}
		return out
	}
	// A note and its photo in one batch (offline, then synced).
	ops := append([]Op{f.op("note", "n1", "title", `"Whiteboard"`), f.op("note", "n1", "project_id", `"p"`)},
		noteOps("a1", "alice", f.op("attachment", "a1", "note_id", `"n1"`))...)
	if res := f.apply("alice", "A", ops...); len(res.Rejected) != 0 {
		t.Fatalf("attach: %+v", res.Rejected)
	}
	// Both parents, or none, are refused.
	two := append(f.attachmentOps("a2", "t1", "alice", 10), f.op("attachment", "a2", "note_id", `"n1"`))
	if res := f.apply("alice", "A", two...); len(res.Rejected) == 0 {
		t.Fatal("two parents accepted")
	}
	if res := f.apply("alice", "A", noteOps("a3", "alice")...); len(res.Rejected) == 0 {
		t.Fatal("no parent accepted")
	}
	// Sharing the project takes the note's attachment along; a viewer may attach, not remove another's.
	f.add("alice", "carol", RoleViewer)
	if got := f.field("carol", "attachment", "a1", "note_id"); got != `"n1"` {
		t.Fatalf("carol sees %s", got)
	}
	if res := f.apply("carol", "C", noteOps("a4", "carol", f.op("attachment", "a4", "note_id", `"n1"`))...); len(res.Rejected) != 0 {
		t.Fatalf("viewer attach: %+v", res.Rejected)
	}
	if res := f.apply("carol", "C", f.op("attachment", "a1", "deleted_at", `5`)); len(res.Rejected) != 1 {
		t.Fatalf("viewer removed alice's: %+v", res)
	}
	if res := f.apply("alice", "A", f.op("attachment", "a1", "note_id", `"other"`)); len(res.Rejected) != 1 {
		t.Fatalf("parent changed: %+v", res)
	}
}

// note-attachments 1.4: a copy shares the original's file; the file stays
// while any row names it ("Original purged"), and a copy is checked.
func TestSharedFileCopies(t *testing.T) {
	f := newSharing(t)
	now := time.Date(2026, 10, 15, 12, 0, 0, 0, time.UTC)
	f.s.now = func() time.Time { return now }
	blobs := &fakeBlobs{files: map[string]time.Time{"a1": now}}
	f.s.SetBlobStore(blobs)
	note := func(id, att, file, sha string, extra ...Op) []Op {
		ops := []Op{f.op("note", id, "title", `"Trip"`)}
		for _, op := range f.attachmentOps(att, "x", "alice", 10, extra...) {
			switch op.Field {
			case "task_id":
			case "sha256":
				ops = append(ops, f.op("attachment", att, "sha256", mustJSON(sha)))
			default:
				ops = append(ops, op)
			}
		}
		ops = append(ops, f.op("attachment", att, "note_id", mustJSON(id)))
		if file != "" {
			ops = append(ops, f.op("attachment", att, "file_id", mustJSON(file)))
		}
		return ops
	}
	if res := f.apply("alice", "A", note("n1", "a1", "", "abc")...); len(res.Rejected) != 0 {
		t.Fatalf("original: %+v", res.Rejected)
	}
	// Not uploaded yet: a copy may not claim it is.
	if res := f.apply("alice", "A", note("n2", "c0", "a1", "abc", f.op("attachment", "c0", "uploaded_at", `5`))...); len(res.Rejected) == 0 {
		t.Fatal("copy claimed an unstored file")
	}
	f.apply("alice", "server", Op{ID: "up1", Entity: "attachment", EntityID: "a1", Field: "uploaded_at", Value: []byte(`5`), TS: f.ts + 100, Device: "server"})
	if res := f.apply("alice", "A", note("n2", "c1", "a1", "abc", f.op("attachment", "c1", "uploaded_at", `5`))...); len(res.Rejected) != 0 {
		t.Fatalf("copy: %+v", res.Rejected)
	}
	// Another digest, a copy of a copy, or someone else's file are refused.
	for name, ops := range map[string][]Op{
		"digest":    note("n3", "c2", "a1", "zzz"),
		"chain":     note("n3", "c3", "c1", "abc"),
		"elsewhere": nil,
	} {
		if ops == nil {
			ops = []Op{f.op("note", "n9", "title", `"Bob"`)}
			for _, op := range note("n9", "c4", "a1", "abc") {
				if op.Field != "author_id" {
					ops = append(ops, op)
				}
			}
			ops = append(ops, f.op("attachment", "c4", "author_id", `"bob"`))
			if res := f.apply("bob", "B", ops...); len(res.Rejected) == 0 {
				t.Fatalf("%s accepted", name)
			}
			continue
		}
		if res := f.apply("alice", "A", ops...); len(res.Rejected) == 0 {
			t.Fatalf("%s accepted", name)
		}
	}
	// Purging the original's note keeps the file for the copy; purging the copy removes it.
	f.apply("alice", "A", f.op("note", "n1", "deleted_at", `8000`))
	if _, err := f.s.Purge(f.ctx, "alice", "note", []string{"n1"}); err != nil || slices.Contains(blobs.removed, "a1") {
		t.Fatalf("original purged: %v, removed %v", err, blobs.removed)
	}
	f.apply("alice", "A", f.op("note", "n2", "deleted_at", `9000`))
	if _, err := f.s.Purge(f.ctx, "alice", "note", []string{"n2"}); err != nil || !slices.Contains(blobs.removed, "a1") {
		t.Fatalf("copy purged: %v, removed %v", err, blobs.removed)
	}
}
