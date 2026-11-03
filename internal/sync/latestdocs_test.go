package sync

import (
	"fmt"
	"slices"
	"testing"
)

// latestPull pulls everything with the "latest_docs" feature in pages of
// limit ops and returns the ops served, the final cursor and the pages.
func latestPull(t *testing.T, s *Service, user, device string, limit int) ([]Op, int64, int) {
	t.Helper()
	var all []Op
	cursor, pages := int64(0), 0
	for ; pages < 1000; pages++ {
		page, err := s.PullWith(t.Context(), user, cursor, device, limit, PullOptions{LatestDocs: true})
		if err != nil {
			t.Fatal(err)
		}
		if page.Cursor < cursor {
			t.Fatalf("cursor went back: %d -> %d", cursor, page.Cursor)
		}
		all = append(all, page.Ops...)
		cursor = page.Cursor
		if !page.More {
			return all, cursor, pages + 1
		}
	}
	t.Fatal("pull did not end")
	return nil, 0, 0
}

func fieldsOf(ops []Op) []string {
	var out []string
	for _, o := range ops {
		out = append(out, fmt.Sprintf("%s/%s/%s@%s", o.Entity, o.EntityID, o.Field, o.Device))
	}
	return out
}

// TestLatestDocsLeavesOutNoteHistory (notes-compaction-at-scale 2.1): a note
// saved fifty times by one device reaches a new device as its last document
// and its winning projection; every other field arrives in full, a folded
// append as its winner, a pending one as it is; the cursor reaches the end of
// the log and paging keeps the same result.
func TestLatestDocsLeavesOutNoteHistory(t *testing.T) {
	e := newCompactEnv(t)
	for i := 0; i < 50; i++ {
		ts := e.now.UnixMilli() + int64(10*i)
		e.apply("u1", e.op("task", "t1", "notes_doc", doc(fmt.Sprint(i)), "A", ts), e.op("task", "t1", "description", quoted(fmt.Sprint(i)), "A", ts),
			e.op("task", "t1", "title", quoted(fmt.Sprint(i)), "A", ts))
	}
	e.apply("u1", e.op("note", "n1", "appends.a1", `"text"`, "server", 0), e.op("task", "t1", "appends.a2", `"pending"`, "server", 0))
	e.apply("u1", e.op("note", "n1", "appends.a1", `""`, "A", 0))
	var top int64
	if err := e.s.db.QueryRow(`SELECT MAX(seq) FROM ops`).Scan(&top); err != nil {
		t.Fatal(err)
	}
	want := []string{"task/t1/notes_doc@A", "task/t1/description@A", "task/t1/appends.a2@server", "note/n1/appends.a1@A"}
	for _, limit := range []int{1000, 7, 1} {
		ops, cursor, _ := latestPull(t, e.s, "u1", "C", limit)
		if cursor != top {
			t.Fatalf("limit %d: cursor %d, want the head %d", limit, cursor, top)
		}
		var docs []string
		titles := 0
		for _, o := range ops {
			if o.Field == "title" {
				titles++
				continue
			}
			docs = append(docs, fieldsOf([]Op{o})[0])
			if o.Field == "notes_doc" && string(o.Value) != doc("49") {
				t.Fatalf("limit %d: document %s, want the last save", limit, o.Value)
			}
		}
		if titles != 50 {
			t.Fatalf("limit %d: %d titles, want every one", limit, titles)
		}
		if !slices.Equal(docs, want) {
			t.Fatalf("limit %d: note fields %v, want %v", limit, docs, want)
		}
	}
	// Without the feature the whole history still travels (older clients).
	all, _ := newSharingPull(t, e.s, "u1", "D")
	if len(all) != 50*3+3 {
		t.Fatalf("full pull: %d ops", len(all))
	}
}

func newSharingPull(t *testing.T, s *Service, user, device string) ([]Op, int64) {
	t.Helper()
	var all []Op
	cursor := int64(0)
	for {
		ops, next, more, err := s.Pull(t.Context(), user, cursor, device, 1000)
		if err != nil {
			t.Fatal(err)
		}
		all = append(all, ops...)
		cursor = next
		if !more {
			return all, cursor
		}
	}
}

// TestLatestDocsConvergence (2.2): concurrent edits that no device has merged
// yet reach a new device as each device's last document; it ends with the
// same note and rows as a new device that pulled the whole history, before and
// after the union is published, and after compaction.
func TestLatestDocsConvergence(t *testing.T) {
	e := newCompactEnv(t)
	a, b := e.device("u1", "A"), e.device("u1", "B")
	a.edit("start")
	a.sync()
	b.sync()
	for i := 0; i < 5; i++ {
		a.edit(fmt.Sprintf("A %d", i))
	}
	b.edit("B offline")
	b.edit("B offline again")
	// Both push without pulling: neither has the other's text yet.
	e.apply("u1", a.outbox...)
	e.apply("u1", b.outbox...)
	a.outbox, b.outbox = nil, nil
	check := func(when string) {
		t.Helper()
		c, d := e.device("u1", "C"+when), e.device("u1", "D"+when)
		c.latest = true
		c.sync()
		d.sync()
		if c.state() != d.state() {
			t.Fatalf("%s: latest and full pulls differ:\nC %s\nD %s", when, c.state(), d.state())
		}
		for _, p := range []string{"start", "A 4", "B offline again"} {
			if !c.doc[p] {
				t.Fatalf("%s: %q lost: %v", when, p, c.doc)
			}
		}
		if c.pulled > d.pulled || (when != "compacted" && c.pulled == d.pulled) {
			t.Fatalf("%s: latest pull received %d documents, the full one %d", when, c.pulled, d.pulled)
		}
	}
	check("unmerged")
	a.sync()
	b.sync()
	a.sync()
	check("merged")
	e.advance(31 * day)
	e.compact()
	check("compacted")
}

// TestLatestDocsPerScope (2.2): in a shared project each member device's last
// document arrives; the device's own ops stay out as always.
func TestLatestDocsPerScope(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	f.add("alice", "carol", RoleViewer)
	f.apply("alice", "A", f.op("task", "t1", "notes_doc", doc("a")), f.op("task", "t1", "notes_doc", doc("a", "a2")))
	f.apply("bob", "B", f.op("task", "t1", "notes_doc", doc("b")), f.op("task", "t1", "notes_doc", doc("b", "b2")))
	f.apply("alice", "A", f.op("task", "inbox", "notes_doc", doc("x")), f.op("task", "inbox", "notes_doc", doc("x", "y")))
	ops, _, _ := latestPull(t, f.s, "carol", "C", 1000)
	var got []string
	for _, o := range ops {
		if o.Field == "notes_doc" {
			got = append(got, o.EntityID+"="+string(o.Value))
		}
	}
	if want := []string{"t1=" + doc("a", "a2"), "t1=" + doc("b", "b2")}; !slices.Equal(got, want) {
		t.Fatalf("carol got %v, want %v", got, want)
	}
	ops, _, _ = latestPull(t, f.s, "alice", "A", 1000)
	for _, o := range ops {
		if o.Device == "A" {
			t.Fatalf("own op served: %+v", o)
		}
	}
	if len(ops) != 1 || string(ops[0].Value) != doc("b", "b2") {
		t.Fatalf("alice's device got %v", fieldsOf(ops))
	}
}

// TestLatestDocsByteBudget (2.1): left-out documents do not count against a
// page's byte budget, served ones do, and a page still carries one op when a
// single value is larger than the budget.
func TestLatestDocsByteBudget(t *testing.T) {
	e := newCompactEnv(t)
	e.s.pullBudget = 3000
	big := func(i int) string { return doc(fmt.Sprintf("%04d", i), string(make([]byte, 1000))) }
	for n := 0; n < 4; n++ {
		id := fmt.Sprintf("t%d", n)
		for i := 0; i < 20; i++ {
			e.apply("u1", e.op("task", id, "notes_doc", big(i), "A", 0))
		}
	}
	ops, _, pages := latestPull(t, e.s, "u1", "C", 1000)
	if len(ops) != 4 {
		t.Fatalf("served %d documents, want the 4 last ones", len(ops))
	}
	// Each served document is about 1.4 KB: two fit in 3,000 bytes.
	if pages != 2 {
		t.Fatalf("%d pages, want 2", pages)
	}
	e.s.pullBudget = 10
	if ops, _, pages = latestPull(t, e.s, "u1", "C", 1000); len(ops) != 4 || pages != 4 {
		t.Fatalf("over-budget values: %d ops in %d pages, want one per page", len(ops), pages)
	}
}
