package importer

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// ---- helpers shared by the tests in this package ----

func normalized(t *testing.T, o Options) Options {
	t.Helper()
	if err := o.Normalize(); err != nil {
		t.Fatal(err)
	}
	return o
}

func counter() func() string {
	n := 0
	return func() string { n++; return fmt.Sprintf("id%03d", n) }
}

func entities(docs ...string) []opsync.Entity {
	out := make([]opsync.Entity, 0, len(docs))
	for _, d := range docs {
		var e opsync.Entity
		if err := json.Unmarshal([]byte(d), &e); err != nil {
			panic(err)
		}
		out = append(out, e)
	}
	return out
}

func fieldString(c change, name string) string {
	for _, f := range c.fields {
		if f.name == name {
			var s string
			_ = json.Unmarshal(f.value, &s)
			return s
		}
	}
	return ""
}

type harness struct {
	t    *testing.T
	db   *sql.DB
	sync *opsync.Service
	svc  *Service
	uid  string
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	h := &harness{t: t, db: db, sync: opsync.NewService(db), uid: "u1"}
	h.svc = New(db, h.sync, slog.New(slog.NewTextHandler(io.Discard, nil)))
	h.addUser("u1")
	return h
}

func (h *harness) addUser(id string) {
	h.t.Helper()
	if _, err := h.db.Exec(`INSERT INTO users(id,email,password_hash,created_at) VALUES(?,?,?,?)`, id, id+"@example.com", "x", 1); err != nil {
		h.t.Fatal(err)
	}
}

// write applies ops from a simulated device, one field per entry.
func (h *harness) write(device string, ts int64, entity, id string, fields map[string]any) {
	h.t.Helper()
	var ops []opsync.Op
	for f, v := range fields {
		b, _ := json.Marshal(v)
		ops = append(ops, opsync.Op{ID: fmt.Sprintf("%s-%s-%s-%d", device, id, f, ts), Entity: entity, EntityID: id, Field: f, Value: b, TS: ts, Device: device})
	}
	if _, err := h.sync.Apply(context.Background(), h.uid, ops); err != nil {
		h.t.Fatal(err)
	}
}

func (h *harness) run(data string, opts Options) *Job {
	h.t.Helper()
	job, err := h.svc.Start(context.Background(), h.uid, []byte(data), opts)
	if err != nil {
		h.t.Fatalf("start: %v", err)
	}
	h.svc.Wait()
	j, err := h.svc.Job(context.Background(), h.uid, job.ID)
	if err != nil {
		h.t.Fatal(err)
	}
	return j
}

func (h *harness) list(entity string, deleted bool) []opsync.Entity {
	h.t.Helper()
	l, err := h.sync.List(context.Background(), h.uid, entity, deleted)
	if err != nil {
		h.t.Fatal(err)
	}
	return l
}

func (h *harness) count(q string, args ...any) int {
	h.t.Helper()
	var n int
	if err := h.db.QueryRow(q, args...).Scan(&n); err != nil {
		h.t.Fatal(err)
	}
	return n
}

func byTitle(list []opsync.Entity) map[string]opsync.Entity {
	out := map[string]opsync.Entity{}
	for _, e := range list {
		out[str(e, "title")+str(e, "name")] = e
	}
	return out
}

// ---- tests ----

func TestDuplicateDetectionOrder(t *testing.T) {
	h := newHarness(t)
	// An existing open task with the same title, project (Inbox) and due date.
	h.write("web", 1000, "task", "existing", map[string]any{"title": "Call mom", "due": map[string]string{"date": "2026-10-11"}, "priority": 4})
	h.write("web", 1000, "task", "done", map[string]any{"title": "Done thing", "completed_at": 5, "priority": 4})
	csv := "id,title,due_date\n1,call MOM ,2026-10-11\n2,Call mom,2026-10-12\n3,Done thing,\n"
	plan, err := h.svc.Preview(context.Background(), h.uid, []byte(csv), Options{})
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]RowResult{}
	for _, r := range plan.Rows {
		got[r.SourceID] = r
	}
	if r := got["id:1"]; r.Outcome != OutcomeSkip || r.Reason != ReasonPossibleDuplicate {
		t.Fatalf("fingerprint match = %+v", r)
	}
	if got["id:2"].Outcome != OutcomeCreate || got["id:3"].Outcome != OutcomeCreate {
		t.Fatalf("different due date / completed task must not match: %+v", got)
	}
	if plan.Totals.PossibleDuplicates != 1 || plan.Totals.Create != 2 || plan.Totals.Skip != 1 {
		t.Fatalf("totals = %+v", plan.Totals)
	}
	// duplicates=import keeps the row, flagged.
	plan, _ = h.svc.Preview(context.Background(), h.uid, []byte(csv), Options{Duplicates: "import"})
	if plan.Rows[0].Outcome != OutcomeCreate || len(plan.Rows[0].Warnings) == 0 {
		t.Fatalf("duplicates=import row = %+v", plan.Rows[0])
	}
	// After importing, the remembered source id wins over the fingerprint.
	h.run(csv, Options{Duplicates: "import"})
	plan, _ = h.svc.Preview(context.Background(), h.uid, []byte(csv), Options{})
	for _, r := range plan.Rows {
		if r.Outcome != OutcomeSkip || r.Reason != ReasonAlreadyImported {
			t.Fatalf("second preview row = %+v", r)
		}
	}
	// Own export: an existing id is skipped by default, updated when overwriting.
	export := `{"format":"opentodo-export","version":1,"tasks":[{"id":"existing","title":"Call mom!","priority":4}]}`
	plan, _ = h.svc.Preview(context.Background(), h.uid, []byte(export), Options{})
	if plan.Rows[0].Outcome != OutcomeSkip || plan.Rows[0].Reason != ReasonExists {
		t.Fatalf("own export default = %+v", plan.Rows[0])
	}
	plan, _ = h.svc.Preview(context.Background(), h.uid, []byte(export), Options{Existing: "overwrite"})
	if plan.Rows[0].Outcome != OutcomeUpdate {
		t.Fatalf("own export overwrite = %+v", plan.Rows[0])
	}
}

func TestReimportSameFileSkipsAll(t *testing.T) {
	for _, name := range []string{"generic.json", "items.json", "lists.json", "tasks.csv"} {
		h := newHarness(t)
		data := string(fixture(t, name))
		first := h.run(data, Options{})
		if first.Status != StatusDone || first.Totals.Written == 0 {
			t.Fatalf("%s: first import %+v", name, first)
		}
		opsBefore := h.count(`SELECT COUNT(*) FROM ops`)
		plan, err := h.svc.Preview(context.Background(), h.uid, []byte(data), Options{})
		if err != nil {
			t.Fatal(err)
		}
		if plan.Totals.Create != 0 || plan.Totals.Update != 0 {
			t.Fatalf("%s: re-preview totals %+v rows %+v", name, plan.Totals, plan.Rows)
		}
		for _, r := range plan.Rows {
			if r.Kind == KindTask && r.Outcome == OutcomeSkip && r.Reason != ReasonAlreadyImported {
				t.Fatalf("%s: row %+v", name, r)
			}
		}
		second := h.run(data, Options{})
		if second.Totals.Written != 0 || h.count(`SELECT COUNT(*) FROM ops`) != opsBefore {
			t.Fatalf("%s: second import wrote %d entities", name, second.Totals.Written)
		}
	}
}

func TestCommitWritesOnlyOps(t *testing.T) {
	h := newHarness(t)
	job := h.run(string(fixture(t, "generic.json")), Options{TimeZone: "Europe/Berlin"})
	if job.Status != StatusDone || job.Totals.Error != 1 || len(job.Errors) != 1 {
		t.Fatalf("job = %+v", job)
	}
	// Every materialized field is the winner of an op stamped with device "import";
	// nothing reached the fields table except through sync.Apply.
	if n := h.count(`SELECT COUNT(*) FROM scope_fields`); n == 0 || n != job.Totals.Ops {
		t.Fatalf("fields %d, ops written %d", n, job.Totals.Ops)
	}
	if n := h.count(`SELECT COUNT(*) FROM scope_fields f WHERE NOT EXISTS (SELECT 1 FROM ops o JOIN op_scopes s ON s.seq = o.seq WHERE s.scope_id = f.scope_id AND o.entity = f.entity
		AND o.entity_id = f.entity_id AND o.field = f.field AND o.value = f.value AND o.ts = f.ts AND o.device = 'import')`); n != 0 {
		t.Fatalf("%d fields without a matching import op", n)
	}
	tasks := byTitle(h.list("task", false))
	projects := byTitle(h.list("project", false))
	labels := byTitle(h.list("label", false))
	beds, seeds := tasks["Plan the beds"], tasks["Buy seeds"]
	if str(beds, "project_id") != str(projects["Garden"], "id") || str(projects["Garden"], "parent_id") != str(projects["Home"], "id") {
		t.Fatalf("projects not wired: %v %v", beds, projects)
	}
	if str(seeds, "parent_id") != str(beds, "id") || str(seeds, "project_id") != str(beds, "project_id") || isNull(seeds["completed_at"]) {
		t.Fatalf("subtask = %v", seeds)
	}
	var lbl []string
	_ = json.Unmarshal(beds["labels"], &lbl)
	if len(lbl) != 3 || labels["Spring"] == nil || labels["outside"] == nil {
		t.Fatalf("labels = %v / %v", lbl, labels)
	}
	if string(beds["due"]) != `{"date":"2026-11-02","time":"10:30"}` || string(beds["priority"]) != "1" {
		t.Fatalf("beds = %v", beds)
	}
	if _, ok := tasks["Bad priority"]; ok {
		t.Fatal("bad row was written")
	}
	var device string
	if err := h.db.QueryRow(`SELECT DISTINCT device FROM ops`).Scan(&device); err != nil || device != Device {
		t.Fatalf("op device = %q %v", device, err)
	}
	// Items are remembered for duplicate detection and undo.
	if n := h.count(`SELECT COUNT(*) FROM import_items WHERE job_id = ? AND action = 'created'`, job.ID); n != job.Totals.Written {
		t.Fatalf("items %d, written %d", n, job.Totals.Written)
	}
}

func TestCommitBatchesLargeImports(t *testing.T) {
	h := newHarness(t)
	var b strings.Builder
	b.WriteString("title,project\n")
	for i := 0; i < 450; i++ { // ~7 ops per task: several batches of at most 1,000 ops
		fmt.Fprintf(&b, "Task %d,Bulk\n", i)
	}
	batches := 0
	h.svc.beforeBatch = func(string) { batches++ }
	job := h.run(b.String(), Options{})
	if job.Status != StatusDone || job.Totals.Written != 451 || batches < 3 {
		t.Fatalf("job = %+v batches = %d", job.Totals, batches)
	}
	if n := len(h.list("task", false)); n != 450 {
		t.Fatalf("tasks = %d", n)
	}
}

func TestAbortLeavesAccountUnchanged(t *testing.T) {
	h := newHarness(t)
	h.write("web", 1000, "task", "keep", map[string]any{"title": "Keep me", "priority": 4})
	before := h.count(`SELECT COUNT(*) FROM ops`)
	job := h.run(string(fixture(t, "tasks.csv")), Options{Errors: "abort"})
	if job.Status != StatusFailed || !strings.Contains(job.Message, "row 5") || job.FinishedAt == nil {
		t.Fatalf("job = %+v", job)
	}
	if h.count(`SELECT COUNT(*) FROM ops`) != before || len(h.list("task", true)) != 1 {
		t.Fatal("abort wrote something")
	}
	// skip_rows writes the good rows and reports the bad ones.
	job = h.run(string(fixture(t, "tasks.csv")), Options{})
	if job.Status != StatusDone || job.Totals.Error != 3 || len(job.Errors) != 3 || job.Errors[0].Row != 5 {
		t.Fatalf("skip_rows job = %+v", job)
	}
	if n := len(h.list("task", false)); n != 4 {
		t.Fatalf("tasks after skip_rows = %d", n)
	}
}

func TestSecondJobConflicts(t *testing.T) {
	h := newHarness(t)
	release := make(chan struct{})
	var once sync.Once
	started := make(chan struct{})
	h.svc.beforeBatch = func(string) {
		once.Do(func() { close(started) })
		<-release
	}
	first, err := h.svc.Start(context.Background(), h.uid, []byte("title\nA\n"), Options{})
	if err != nil {
		t.Fatal(err)
	}
	<-started
	_, err = h.svc.Start(context.Background(), h.uid, []byte("title\nB\n"), Options{})
	var ce *ConflictError
	if !errors.As(err, &ce) || ce.JobID != first.ID {
		t.Fatalf("second start err = %v", err)
	}
	if _, err := h.svc.Undo(context.Background(), h.uid, first.ID); !errors.As(err, &ce) {
		t.Fatalf("undo of a running job err = %v", err)
	}
	running, _ := h.svc.Job(context.Background(), h.uid, first.ID)
	if running.Status != StatusRunning {
		t.Fatalf("status = %s", running.Status)
	}
	// Another user is not blocked.
	h.addUser("u2")
	other := &harness{t: t, db: h.db, sync: h.sync, svc: h.svc, uid: "u2"}
	if _, err := other.svc.Start(context.Background(), "u2", []byte("title\nC\n"), Options{}); err != nil {
		t.Fatalf("other user: %v", err)
	}
	close(release)
	h.svc.Wait()
	if j, _ := h.svc.Job(context.Background(), h.uid, first.ID); j.Status != StatusDone {
		t.Fatalf("first job = %+v", j)
	}
	if _, err := h.svc.Start(context.Background(), h.uid, []byte("title\nB\n"), Options{}); err != nil {
		t.Fatalf("start after finish: %v", err)
	}
	h.svc.Wait()
}

func TestRestartMarksRunningJobFailed(t *testing.T) {
	h := newHarness(t)
	if _, err := h.db.Exec(`INSERT INTO import_jobs(id,user_id,profile,status,totals_json,created_at) VALUES('j1','u1','csv','running','{"written":3}',1)`); err != nil {
		t.Fatal(err)
	}
	svc := New(h.db, h.sync, nil)
	j, err := svc.Job(context.Background(), "u1", "j1")
	if err != nil || j.Status != StatusFailed || j.Totals.Written != 3 || !strings.Contains(j.Message, "restart") {
		t.Fatalf("job = %+v %v", j, err)
	}
}

const ownExport = `{"format":"opentodo-export","version":1,
 "labels":[{"id":"l1","name":"errand","color":"#ef4444","position":1,"created_at":1}],
 "projects":[{"id":"p1","name":"Home","color":"#22c55e","position":1,"archived":false,"parent_id":null,"created_at":1}],
 "tasks":[{"id":"t1","title":"Original","description":"","project_id":"p1","priority":4,"labels":["l1"],"position":1,"created_at":1},
          {"id":"t2","title":"Gone","priority":4,"position":2,"created_at":1,"deleted_at":9}]}`

func TestOverwriteKeepsNewerDeviceEdit(t *testing.T) {
	h := newHarness(t)
	h.svc.now = func() time.Time { return time.UnixMilli(2_000_000) }
	h.run(ownExport, Options{})
	// A device edits the description; the import file changes only the title.
	h.write("phone", 2_500_000, "task", "t1", map[string]any{"description": "from phone"})
	changed := strings.Replace(ownExport, `"title":"Original"`, `"title":"From file"`, 1)
	opsBefore := h.count(`SELECT COUNT(*) FROM ops`)
	h.svc.now = func() time.Time { return time.UnixMilli(3_000_000) }
	job := h.run(changed, Options{Existing: "overwrite"})
	if job.Totals.Update != 1 || job.Totals.Ops != 2 { // t1.title and t1.description differ from the file
		t.Fatalf("overwrite totals = %+v", job.Totals)
	}
	if h.count(`SELECT COUNT(*) FROM ops`) != opsBefore+2 {
		t.Fatal("unchanged fields were rewritten")
	}
	// The unchanged priority keeps its original clock.
	var ts int64
	_ = h.db.QueryRow(`SELECT ts FROM scope_fields WHERE entity_id = 't1' AND field = 'priority'`).Scan(&ts)
	if ts != 2_000_000 {
		t.Fatalf("priority clock = %d", ts)
	}
	// A device edit made after the import (greater timestamp) beats it.
	h.write("phone", 3_500_000, "task", "t1", map[string]any{"title": "phone title"})
	if got := str(byTitle(h.list("task", false))["phone title"], "id"); got != "t1" {
		t.Fatalf("device edit lost: %v", h.list("task", false))
	}
}

func TestImportDoesNotResurrectDeleted(t *testing.T) {
	h := newHarness(t)
	h.run(ownExport, Options{})
	// The user deletes t1 after importing; the same file is imported with overwrite.
	h.write("web", time.Now().UnixMilli()+1000, "task", "t1", map[string]any{"deleted_at": 42})
	plan, err := h.svc.Preview(context.Background(), h.uid, []byte(ownExport), Options{Existing: "overwrite"})
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range plan.Rows {
		if r.SourceID == "t1" && (r.Outcome != OutcomeSkip || r.Reason != ReasonDeleted) {
			t.Fatalf("t1 = %+v", r)
		}
	}
	h.run(ownExport, Options{Existing: "overwrite"})
	if e, _ := h.sync.Get(context.Background(), h.uid, "task", "t1"); !e.Deleted() {
		t.Fatal("deleted task resurrected")
	}
	// A tombstone carried by the file is imported as a tombstone.
	if e, _ := h.sync.Get(context.Background(), h.uid, "task", "t2"); !e.Deleted() {
		t.Fatal("tombstone in the file was not imported")
	}
}

func TestUndoTombstonesCreatedOnly(t *testing.T) {
	h := newHarness(t)
	h.write("web", 1000, "project", "pw", map[string]any{"name": "Work"})
	h.write("web", 1000, "task", "mine", map[string]any{"title": "Mine", "priority": 4})
	h.svc.now = func() time.Time { return time.UnixMilli(2_000_000) }
	job := h.run("title,project,labels\nA,Work,x\nB,New,x\n", Options{})
	tasks := byTitle(h.list("task", false))
	newProject := str(tasks["B"], "project_id")
	// The user later adds a task to the imported project and tags their own task.
	h.write("web", 2_500_000, "task", "later", map[string]any{"title": "Later", "priority": 4, "project_id": newProject})
	lblID := str(byTitle(h.list("label", false))["x"], "id")
	h.write("web", 2_500_000, "task", "mine", map[string]any{"labels": []string{lblID}})
	h.svc.now = func() time.Time { return time.UnixMilli(3_000_000) }

	undone, err := h.svc.Undo(context.Background(), h.uid, job.ID)
	if err != nil {
		t.Fatal(err)
	}
	if undone.Status != StatusUndone || undone.UndoneAt == nil {
		t.Fatalf("job = %+v", undone)
	}
	left := byTitle(h.list("task", false))
	if _, ok := left["A"]; ok || len(left) != 2 {
		t.Fatalf("tasks after undo = %v", left)
	}
	if str(left["Later"], "project_id") != "" || string(left["Mine"]["labels"]) != "[]" {
		t.Fatalf("user's tasks not cleaned: %v", left)
	}
	projects := byTitle(h.list("project", false))
	if _, ok := projects["New"]; ok || projects["Work"] == nil {
		t.Fatalf("projects after undo = %v", projects)
	}
	if len(h.list("label", false)) != 0 {
		t.Fatal("imported label survived undo")
	}
	// Tombstones stay in the data (and so in the export).
	if len(h.list("task", true)) != 4 {
		t.Fatalf("tombstones missing: %d", len(h.list("task", true)))
	}
	// Idempotent: a second undo changes nothing.
	ops := h.count(`SELECT COUNT(*) FROM ops`)
	again, err := h.svc.Undo(context.Background(), h.uid, job.ID)
	if err != nil || again.Status != StatusUndone || h.count(`SELECT COUNT(*) FROM ops`) != ops {
		t.Fatalf("second undo: %+v %v", again, err)
	}
	// Undone jobs no longer count as already imported.
	plan, _ := h.svc.Preview(context.Background(), h.uid, []byte("title,project,labels\nA,Work,x\nB,New,x\n"), Options{})
	if plan.Totals.Create != 2 {
		t.Fatalf("after undo the file imports again: %+v", plan.Totals)
	}
	// Updated entities are left alone by undo.
	h.svc.now = time.Now
	h.run(ownExport, Options{})
	upd := h.run(strings.Replace(ownExport, `"title":"Original"`, `"title":"Changed"`, 1), Options{Existing: "overwrite"})
	if _, err := h.svc.Undo(context.Background(), h.uid, upd.ID); err != nil {
		t.Fatal(err)
	}
	if e, _ := h.sync.Get(context.Background(), h.uid, "task", "t1"); e.Deleted() || str(e, "title") != "Changed" {
		t.Fatalf("updated entity touched by undo: %v", e)
	}
	// Another user's job is not found.
	h.addUser("u2")
	if _, err := h.svc.Undo(context.Background(), "u2", job.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("foreign undo err = %v", err)
	}
}

func TestUndoReachesDevices(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	job := h.run("title\nOne\nTwo\n", Options{})
	// A device syncs and receives the imported tasks (ops from device "import").
	ops, cursor, _, err := h.sync.Pull(ctx, h.uid, 0, "laptop", 1000)
	if err != nil || len(ops) == 0 {
		t.Fatalf("pull = %d ops, %v", len(ops), err)
	}
	sub := h.sync.Notifier().Subscribe(h.uid, "laptop")
	defer h.sync.Notifier().Unsubscribe(sub)
	if _, err := h.svc.Undo(ctx, h.uid, job.ID); err != nil {
		t.Fatal(err)
	}
	select {
	case <-sub.C():
	case <-time.After(time.Second):
		t.Fatal("device was not woken by undo")
	}
	ops, _, _, err = h.sync.Pull(ctx, h.uid, cursor, "laptop", 1000)
	if err != nil {
		t.Fatal(err)
	}
	tomb := 0
	for _, op := range ops {
		if op.Field == "deleted_at" && op.Entity == "task" && op.Device == Device {
			tomb++
		}
	}
	if tomb != 2 {
		t.Fatalf("device received %d tombstones, want 2 (%+v)", tomb, ops)
	}
}

func TestStartRejectsInvalidOptions(t *testing.T) {
	h := newHarness(t)
	h.addUser("u2")
	h.write("web", 1, "project", "theirs", map[string]any{"name": "x"})
	var oe *OptionError
	for _, o := range []Options{{TimeZone: "Nowhere/City"}, {TargetProject: "missing"}, {Errors: "explode"}} {
		if _, err := h.svc.Start(context.Background(), "u2", []byte("title\nA\n"), o); !errors.As(err, &oe) {
			t.Fatalf("options %+v err = %v", o, err)
		}
	}
	// u1's project is invisible to u2.
	if _, err := h.svc.Start(context.Background(), "u2", []byte("title\nA\n"), Options{TargetProject: "theirs"}); !errors.As(err, &oe) {
		t.Fatalf("foreign target err = %v", err)
	}
	if n := h.count(`SELECT COUNT(*) FROM import_jobs`); n != 0 {
		t.Fatalf("%d jobs created", n)
	}
	// A valid target receives unassigned tasks.
	j := h.run("title\nA\n", Options{TargetProject: "theirs"})
	if j.Status != StatusDone || str(byTitle(h.list("task", false))["A"], "project_id") != "theirs" {
		t.Fatalf("target project not applied: %+v", j)
	}
}
