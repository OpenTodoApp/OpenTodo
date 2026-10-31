package sync

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"maps"
	"slices"
	"strings"
	"testing"
	"time"
)

// compactEnv is a sync service whose clock the test moves (received_at comes
// from it) with helpers to write ops and run compaction.
type compactEnv struct {
	t   *testing.T
	ctx context.Context
	s   *Service
	now time.Time
	n   int
}

var compactStart = time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)

func newCompactEnv(t *testing.T) *compactEnv {
	t.Helper()
	e := &compactEnv{t: t, ctx: context.Background(), s: newTestService(t), now: compactStart}
	e.s.SetClock(func() time.Time { return e.now })
	return e
}

const day = 24 * time.Hour

// advance moves the server's clock.
func (e *compactEnv) advance(d time.Duration) { e.now = e.now.Add(d) }

// op builds an op with a unique id, stamped at the server's time plus skew ms.
func (e *compactEnv) op(entity, id, field, value, device string, ts int64) Op {
	e.n++
	if ts == 0 {
		ts = e.now.UnixMilli() + int64(e.n)
	}
	return Op{ID: fmt.Sprintf("c-%d", e.n), Entity: entity, EntityID: id, Field: field, Value: []byte(value), TS: ts, Device: device}
}

func (e *compactEnv) apply(user string, ops ...Op) {
	e.t.Helper()
	res, err := e.s.Apply(e.ctx, user, ops)
	if err != nil {
		e.t.Fatal(err)
	}
	if len(res.Rejected) > 0 {
		e.t.Fatalf("rejected: %v", rejectedIDs(res))
	}
}

func (e *compactEnv) compact() CompactResult {
	e.t.Helper()
	res, err := e.s.CompactNotes(e.ctx, e.now, 0, time.Hour)
	if err != nil {
		e.t.Fatal(err)
	}
	return res
}

// count is the number of ops matching where (over ops o).
func (e *compactEnv) count(where string, args ...any) int {
	e.t.Helper()
	var n int
	if err := e.s.db.QueryRow(`SELECT COUNT(*) FROM ops o WHERE `+where, args...).Scan(&n); err != nil {
		e.t.Fatal(err)
	}
	return n
}

// orphanScopes is the number of op_scopes rows without their op.
func (e *compactEnv) orphanScopes() int {
	e.t.Helper()
	var n int
	_ = e.s.db.QueryRow(`SELECT COUNT(*) FROM op_scopes s WHERE NOT EXISTS (SELECT 1 FROM ops o WHERE o.seq = s.seq)`).Scan(&n)
	return n
}

func doc(parts ...string) string {
	slices.Sort(parts)
	return quoted("ydoc:v1:" + base64.StdEncoding.EncodeToString([]byte(strings.Join(parts, "\n"))))
}

func TestCompactFieldsCoverDocFields(t *testing.T) {
	listed := map[string]bool{}
	for _, f := range CompactFields {
		listed[f.Entity+"."+f.Field] = true
		if f.Daily && IsDocField(f.Entity, f.Field) {
			t.Errorf("%s.%s: a document field is never thinned per day", f.Entity, f.Field)
		}
	}
	for name := range DocFields {
		entity := strings.SplitN(name, ".", 2)[0]
		if !listed[name] || !listed[entity+".description"] {
			t.Errorf("%s: missing from CompactFields with its description", name)
		}
	}
}

// TestCompactionWindowAndWinners: the winner stays at any age, received_at
// (not ts) decides the window, other fields are never touched.
func TestCompactionWindowAndWinners(t *testing.T) {
	e := newCompactEnv(t)
	old := e.now.Add(-90 * day).UnixMilli()
	// t1: three saves now; their superseded ones will be 31 days old.
	e.apply("u1", e.op("task", "t1", "title", `"a"`, "A", 0), e.op("task", "t1", "title", `"b"`, "A", 0), e.op("task", "t1", "due", `{"date":"2026-09-02"}`, "A", 0))
	for i := 0; i < 3; i++ {
		e.apply("u1", e.op("task", "t1", "notes_doc", doc(fmt.Sprint(i)), "A", 0))
	}
	// p1: one save a year ago would be the winner forever; here a single op.
	e.apply("u1", e.op("project", "p1", "notes_doc", doc("only"), "A", 0), e.op("project", "p1", "description", `"only"`, "A", 0))
	e.advance(29 * day)
	if res := e.compact(); res.OpsRemoved != 0 {
		t.Fatalf("29 days: removed %d", res.OpsRemoved)
	}
	// t2: a 90-day-old ts received today (an offline device) is kept, though superseded.
	e.apply("u1", e.op("task", "t2", "notes_doc", doc("late"), "B", old), e.op("task", "t2", "notes_doc", doc("now"), "A", 0))
	e.advance(2 * day)
	res := e.compact()
	if res.OpsRemoved != 2 || res.ValueBytesRemoved <= 0 || res.More || res.Next != 0 {
		t.Fatalf("31 days: %+v, want 2 removed", res)
	}
	if n := e.count(`entity_id = 't1' AND field = 'notes_doc'`); n != 1 {
		t.Fatalf("t1 docs left = %d, want the winner", n)
	}
	if n := e.count(`entity_id = 't1' AND field IN ('title', 'due')`); n != 3 {
		t.Fatalf("other fields touched: %d left", n)
	}
	if n := e.count(`entity_id = 't2'`); n != 2 {
		t.Fatalf("late arrival removed inside its window: %d left", n)
	}
	if n := e.count(`entity_id = 'p1'`); n != 2 {
		t.Fatalf("lone winners removed: %d left", n)
	}
	got, _ := e.s.Get(e.ctx, "u1", "task", "t1")
	if string(got["notes_doc"]) != doc("2") {
		t.Fatalf("winner = %s", got["notes_doc"])
	}
	if e.orphanScopes() != 0 {
		t.Fatal("op_scopes rows left behind")
	}
	// A year later the winners are still there; t2's late op goes.
	e.advance(365 * day)
	e.compact()
	if n := e.count(`entity_id IN ('p1', 't1')`); n != 6 {
		t.Fatalf("winners after a year: %d", n)
	}
	if n := e.count(`entity_id = 't2'`); n != 1 {
		t.Fatalf("t2 after its window: %d", n)
	}
}

// TestCompactionSharedScope: a shared project's scope is compacted like a
// personal one; a member joining afterwards gets the winner in the catch-up.
func TestCompactionSharedScope(t *testing.T) {
	f := newSharing(t)
	now := time.UnixMilli(f.ts).Add(time.Hour)
	f.s.SetClock(func() time.Time { return now })
	f.add("alice", "bob", RoleEditor)
	f.apply("alice", "A", f.op("task", "t1", "notes_doc", doc("a")), f.op("task", "t1", "description", `"a"`))
	f.apply("bob", "B", f.op("task", "t1", "notes_doc", doc("a", "b")), f.op("task", "t1", "description", `"a b"`))
	f.apply("alice", "A", f.op("task", "inbox", "notes_doc", doc("x")))
	f.apply("alice", "A", f.op("task", "inbox", "notes_doc", doc("x", "y")))
	now = now.Add(31 * day)
	res, err := f.s.CompactNotes(f.ctx, now, 0, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	// One superseded document in each scope; the descriptions share a day, so
	// the earlier one goes too.
	if res.OpsRemoved != 3 {
		t.Fatalf("removed %d, want 3", res.OpsRemoved)
	}
	f.add("alice", "carol", RoleViewer)
	ops, _ := f.pullAll("carol", "C", 0)
	var docs []string
	for _, o := range ops {
		if o.Field == "notes_doc" {
			docs = append(docs, string(o.Value))
		}
	}
	if len(docs) != 1 || docs[0] != doc("a", "b") {
		t.Fatalf("carol's catch-up docs = %v", docs)
	}
}

// TestCompactionThinsDescriptionsPerUTCDay: the last description of each UTC
// day stays, including at the day's last millisecond and at midnight, and the
// winner counts as its day's revision.
func TestCompactionThinsDescriptionsPerUTCDay(t *testing.T) {
	e := newCompactEnv(t)
	d1 := time.Date(2026, 8, 2, 0, 0, 0, 0, time.UTC).UnixMilli()
	d2 := d1 + 86400000
	desc := func(ts int64, dev, v string) Op { return e.op("task", "t1", "description", quoted(v), dev, ts) }
	e.apply("u1",
		desc(d1, "A", "first of day 1"), desc(d1+1000, "A", "middle"), desc(d2-1, "A", "last of day 1"),
		desc(d2, "A", "midnight of day 2"), desc(d2+5000, "A", "day 2 a"), desc(d2+5000, "B", "day 2 b (device wins the tie)"),
		desc(d2+86400000*3, "A", "day 5 only"),
	)
	// The winner's day: an earlier revision of the same day goes, the winner stays.
	d9 := d1 + 86400000*8
	e.apply("u1", desc(d9, "A", "day 9 early"), desc(d9+10, "A", "winner"))
	e.advance(31 * day)
	res := e.compact()
	if res.OpsRemoved != 5 {
		t.Fatalf("removed %d, want 5", res.OpsRemoved)
	}
	rows, err := e.s.db.Query(`SELECT value FROM ops WHERE entity_id = 't1' ORDER BY ts, device`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var kept []string
	for rows.Next() {
		var v string
		_ = rows.Scan(&v)
		kept = append(kept, v)
	}
	want := []string{quoted("last of day 1"), quoted("day 2 b (device wins the tie)"), quoted("day 5 only"), quoted("winner")}
	if !slices.Equal(kept, want) {
		t.Fatalf("kept %v, want %v", kept, want)
	}
	// Running again changes nothing.
	if res := e.compact(); res.OpsRemoved != 0 {
		t.Fatalf("second run removed %d", res.OpsRemoved)
	}
}

// TestCompactionRecentRevisionsUntouched: twenty edits yesterday all stay.
func TestCompactionRecentRevisionsUntouched(t *testing.T) {
	e := newCompactEnv(t)
	for i := 0; i < 20; i++ {
		e.apply("u1", e.op("task", "t1", "description", quoted(fmt.Sprint(i)), "A", 0), e.op("task", "t1", "notes_doc", doc(fmt.Sprint(i)), "A", 0))
	}
	e.advance(day)
	if res := e.compact(); res.OpsRemoved != 0 {
		t.Fatalf("removed %d", res.OpsRemoved)
	}
}

// TestCompactionRechecksBeforeDeleting: a candidate that became the winner
// between selection and deletion is kept.
func TestCompactionRechecksBeforeDeleting(t *testing.T) {
	e := newCompactEnv(t)
	e.apply("u1", e.op("task", "t1", "notes_doc", doc("a"), "A", 0), e.op("task", "t1", "notes_doc", doc("b"), "A", 0))
	e.advance(31 * day)
	cutoff := e.now.Add(-CompactGrace).UnixMilli()
	seqs, err := e.s.compactCandidates(e.ctx, 0, 1<<40, cutoff, 10)
	if err != nil || len(seqs) != 1 {
		t.Fatalf("candidates %v, %v", seqs, err)
	}
	// Meanwhile the stored winner moves to the candidate (as a restore or a
	// relabel would rewrite scope_fields).
	if _, err := e.s.db.Exec(`UPDATE scope_fields SET ts = (SELECT ts FROM ops WHERE seq = ?), device = 'A' WHERE entity_id = 't1' AND field = 'notes_doc'`, seqs[0]); err != nil {
		t.Fatal(err)
	}
	n, _, err := e.s.compactDelete(e.ctx, seqs, cutoff)
	if err != nil || n != 0 {
		t.Fatalf("deleted %d, %v; want the new winner kept", n, err)
	}
	if c := e.count(`seq = ?`, seqs[0]); c != 1 {
		t.Fatal("new winner deleted")
	}
}

// TestCompactionResentOp: a deleted op sent again is stored again, loses, and
// a later run deletes it again.
func TestCompactionResentOp(t *testing.T) {
	e := newCompactEnv(t)
	first := e.op("task", "t1", "notes_doc", doc("a"), "A", 0)
	e.apply("u1", first, e.op("task", "t1", "notes_doc", doc("a", "b"), "B", 0))
	e.advance(31 * day)
	if res := e.compact(); res.OpsRemoved != 1 {
		t.Fatalf("removed %d", res.OpsRemoved)
	}
	e.apply("u1", first) // the device never got the acknowledgement
	if n := e.count(`op_id = ?`, first.ID); n != 1 {
		t.Fatalf("re-sent op stored %d times", n)
	}
	got, _ := e.s.Get(e.ctx, "u1", "task", "t1")
	if string(got["notes_doc"]) != doc("a", "b") {
		t.Fatalf("re-sent op won: %s", got["notes_doc"])
	}
	if res := e.compact(); res.OpsRemoved != 0 {
		t.Fatal("re-sent op deleted inside its new window")
	}
	e.advance(31 * day)
	if res := e.compact(); res.OpsRemoved != 1 {
		t.Fatalf("later run removed %d", res.OpsRemoved)
	}
}

// TestCompactionCursorsAndBudget: a pull whose cursor is inside a deleted
// range gets the next remaining ops and moves past the hole; paging still
// holds; a small budget stops after one chunk and resumes from the mark.
func TestCompactionCursorsAndBudget(t *testing.T) {
	e := newCompactEnv(t)
	e.s.compactChunk = 3
	e.apply("u1", e.op("task", "t0", "title", `"before"`, "A", 0))
	for i := 0; i < 10; i++ {
		e.apply("u1", e.op("task", "t1", "notes_doc", doc(fmt.Sprint(i)), "A", 0))
	}
	e.apply("u1", e.op("task", "t9", "title", `"after"`, "A", 0))
	ops, _, _, err := e.s.Pull(e.ctx, "u1", 0, "X", 3)
	if err != nil {
		t.Fatal(err)
	}
	cursor := ops[2].Seq // inside the range compaction will delete
	e.advance(31 * day)
	res, err := e.s.CompactNotes(e.ctx, e.now, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if !res.More || res.OpsRemoved != 3 || res.Next == 0 {
		t.Fatalf("budget 0: %+v, want one chunk and more", res)
	}
	for res.More {
		next, err := e.s.CompactNotes(e.ctx, e.now, res.Next, 0)
		if err != nil {
			t.Fatal(err)
		}
		next.OpsRemoved += res.OpsRemoved
		res = next
	}
	if res.OpsRemoved != 9 {
		t.Fatalf("removed %d over the pass, want 9", res.OpsRemoved)
	}
	var got []string
	for i := 0; i < 10; i++ {
		page, next, more, err := e.s.Pull(e.ctx, "u1", cursor, "X", 1)
		if err != nil {
			t.Fatal(err)
		}
		if len(page) > 1 || next < cursor {
			t.Fatalf("page %d ops, cursor %d -> %d", len(page), cursor, next)
		}
		for _, o := range page {
			got = append(got, o.EntityID+"."+o.Field)
		}
		cursor = next
		if !more {
			break
		}
	}
	if !slices.Equal(got, []string{"t1.notes_doc", "t9.title"}) {
		t.Fatalf("pulled after the hole: %v", got)
	}
}

// TestCompactionWindows: a pass examines the log in bounded ranges of sequence
// numbers, so stretches without notes are crossed and every old version found.
func TestCompactionWindows(t *testing.T) {
	e := newCompactEnv(t)
	e.s.SetCompactChunk(2) // a range of 8 sequence numbers per query
	for i := 0; i < 5; i++ {
		e.apply("u1", e.op("task", "t1", "notes_doc", doc(fmt.Sprint(i)), "A", 0))
		for j := 0; j < 12; j++ {
			e.apply("u1", e.op("task", fmt.Sprintf("x%d-%d", i, j), "title", `"filler"`, "A", 0))
		}
	}
	e.advance(31 * day)
	if res := e.compact(); res.OpsRemoved != 4 || res.More || res.Next != 0 {
		t.Fatalf("pass: %+v, want the 4 superseded documents", res)
	}
	if n := e.count(`field = 'title'`); n != 60 {
		t.Fatalf("titles left %d", n)
	}
}

// noteDevice simulates a client's note handling (docs/sync.md "Mergeable
// documents"): its document is a set of paragraphs (a CRDT stand-in; the
// server treats values as opaque), it merges every document it pulls, winning
// or losing, and republishes the union when it holds something the winner
// lacks (rule 1). It keeps the winning value per field like a client's rows.
type noteDevice struct {
	e      *compactEnv
	user   string
	name   string
	cursor int64
	doc    map[string]bool
	rows   map[string]Op
	outbox []Op
}

func (e *compactEnv) device(user, name string) *noteDevice {
	return &noteDevice{e: e, user: user, name: name, doc: map[string]bool{}, rows: map[string]Op{}}
}

func decodeDoc(t *testing.T, v []byte) []string {
	var s string
	if err := json.Unmarshal(v, &s); err != nil {
		t.Fatal(err)
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(s, "ydoc:v1:"))
	if err != nil {
		t.Fatal(err)
	}
	if len(raw) == 0 {
		return nil
	}
	return strings.Split(string(raw), "\n")
}

func (d *noteDevice) keep(o Op) {
	k := o.Entity + "/" + o.EntityID + "/" + o.Field
	if w, ok := d.rows[k]; !ok || o.TS > w.TS || (o.TS == w.TS && o.Device > w.Device) {
		d.rows[k] = o
	}
}

// edit types a paragraph into task t1's note offline.
func (d *noteDevice) edit(text string) {
	d.doc[text] = true
	d.save()
}

func (d *noteDevice) save() {
	parts := slices.Sorted(maps.Keys(d.doc))
	o := d.e.op("task", "t1", "notes_doc", doc(parts...), d.name, 0)
	desc := d.e.op("task", "t1", "description", quoted(strings.Join(parts, " ")), d.name, o.TS)
	d.outbox = append(d.outbox, o, desc)
	d.keep(o)
	d.keep(desc)
}

// sync pushes the outbox, pulls everything after the cursor, merges, and
// republishes the union once if the winner lacks something.
func (d *noteDevice) sync() {
	for round := 0; round < 2; round++ {
		if len(d.outbox) > 0 {
			d.e.apply(d.user, d.outbox...)
			d.outbox = nil
		}
		for {
			ops, next, more, err := d.e.s.Pull(d.e.ctx, d.user, d.cursor, d.name, 50)
			if err != nil {
				d.e.t.Fatal(err)
			}
			for _, o := range ops {
				if o.Field == "notes_doc" {
					for _, p := range decodeDoc(d.e.t, o.Value) {
						d.doc[p] = true
					}
				}
				d.keep(o)
			}
			d.cursor = next
			if !more {
				break
			}
		}
		w := d.rows["task/t1/notes_doc"]
		have := map[string]bool{}
		if w.Value != nil {
			for _, p := range decodeDoc(d.e.t, w.Value) {
				have[p] = true
			}
		}
		if maps.Equal(have, d.doc) {
			return
		}
		d.save()
	}
}

func (d *noteDevice) state() string {
	var out []string
	for k, o := range d.rows {
		out = append(out, k+"="+string(o.Value))
	}
	slices.Sort(out)
	return strings.Join(slices.Sorted(maps.Keys(d.doc)), "|") + " :: " + strings.Join(out, ";")
}

// TestCompactionConvergenceConcurrentEdits: devices A and B edit one note
// offline, both sync, the union is published; 31 days later compaction
// deletes the superseded documents; a new device pulling from cursor 0 ends
// with the same note and rows as A and B.
func TestCompactionConvergenceConcurrentEdits(t *testing.T) {
	e := newCompactEnv(t)
	a, b := e.device("u1", "A"), e.device("u1", "B")
	a.edit("shared start")
	a.sync()
	b.sync()
	a.edit("from A")
	b.edit("from B")
	a.edit("more from A")
	a.sync()
	b.sync() // pushes B's edit, pulls A's, republishes the union
	a.sync()
	b.sync()
	if a.state() != b.state() {
		t.Fatalf("A and B differ before compaction:\n%s\n%s", a.state(), b.state())
	}
	before := e.count(`field = 'notes_doc'`)
	e.advance(31 * day)
	if res := e.compact(); res.OpsRemoved == 0 {
		t.Fatal("nothing compacted")
	}
	if after := e.count(`field = 'notes_doc'`); after != 1 || before < 3 {
		t.Fatalf("docs %d -> %d", before, after)
	}
	a.sync()
	b.sync()
	c := e.device("u1", "C")
	c.sync()
	if c.state() != a.state() || a.state() != b.state() {
		t.Fatalf("diverged after compaction:\nA %s\nB %s\nC %s", a.state(), b.state(), c.state())
	}
	if !c.doc["from A"] || !c.doc["from B"] || !c.doc["more from A"] {
		t.Fatalf("an edit was lost: %v", c.doc)
	}
}

// TestCompactionLongOfflineDevice: a device offline for 45 days with a local
// edit syncs after compaction removed the documents it never pulled: it
// pushes, receives the winner, merges, republishes, and everyone converges.
func TestCompactionLongOfflineDevice(t *testing.T) {
	e := newCompactEnv(t)
	a, b := e.device("u1", "A"), e.device("u1", "B")
	a.edit("start")
	a.sync()
	b.sync()
	b.edit("written on the plane") // B goes offline here
	for i := 0; i < 5; i++ {
		a.edit(fmt.Sprintf("A day %d", i))
		a.sync()
		e.advance(day)
	}
	e.advance(40 * day)
	if res := e.compact(); res.OpsRemoved == 0 {
		t.Fatal("nothing compacted")
	}
	b.sync()
	a.sync()
	b.sync()
	c := e.device("u1", "C")
	c.sync()
	if a.state() != b.state() || b.state() != c.state() {
		t.Fatalf("diverged:\nA %s\nB %s\nC %s", a.state(), b.state(), c.state())
	}
	if !c.doc["written on the plane"] || !c.doc["A day 4"] {
		t.Fatalf("an edit was lost: %v", c.doc)
	}
}

// TestCompactionKeepsUnpulledInsideWindow: A pushes, B pushes a later document
// without pulling A's; compaction on day 10 keeps A's op, and a device
// signing in on day 12 merges both and publishes the union.
func TestCompactionKeepsUnpulledInsideWindow(t *testing.T) {
	e := newCompactEnv(t)
	a, b := e.device("u1", "A"), e.device("u1", "B")
	a.edit("from A")
	a.sync()
	b.doc["from B"] = true
	b.save()
	e.apply("u1", b.outbox...) // B pushed without pulling
	b.outbox = nil
	e.advance(10 * day)
	if res := e.compact(); res.OpsRemoved != 0 {
		t.Fatalf("removed %d inside the window", res.OpsRemoved)
	}
	ops, _, _, err := e.s.Pull(e.ctx, "u1", b.cursor, "B", 50)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, o := range ops {
		found = found || (o.Device == "A" && o.Field == "notes_doc")
	}
	if !found {
		t.Fatal("A's document not pullable from B's cursor")
	}
	e.advance(2 * day)
	c := e.device("u1", "C")
	c.sync()
	if !c.doc["from A"] || !c.doc["from B"] {
		t.Fatalf("C's note = %v", c.doc)
	}
	w := c.rows["task/t1/notes_doc"]
	if got := decodeDoc(t, w.Value); len(got) != 2 {
		t.Fatalf("union not published: %v", got)
	}
}
