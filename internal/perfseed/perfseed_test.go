package perfseed

import (
	"bytes"
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	gosync "sync"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/e2ee/crypt"
	"github.com/OpenTodoApp/opentodo/internal/filter"
	"github.com/OpenTodoApp/opentodo/internal/store"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// The fixture of the performance budgets (OpenSpec change performance-10k) and
// the server's count checks at its size: counts, not times, so they cannot
// flake on a slow runner.

var fixedNow = time.Date(2026, 11, 2, 12, 0, 0, 0, time.UTC)

// fixture is the 10,000-task account, built once for every test here.
var fixture struct {
	once gosync.Once
	dir  string
	sum  Summary
	took time.Duration
	err  error
}

func build(t *testing.T) (string, Summary) {
	t.Helper()
	fixture.once.Do(func() {
		dir, err := os.MkdirTemp("", "perfseed-")
		if err != nil {
			fixture.err = err
			return
		}
		start := time.Now()
		fixture.dir = dir
		fixture.sum, fixture.err = Run(context.Background(), dir, Options{Now: fixedNow})
		fixture.took = time.Since(start)
	})
	if fixture.err != nil {
		t.Fatal(fixture.err)
	}
	return fixture.dir, fixture.sum
}

func TestMain(m *testing.M) {
	code := m.Run()
	if fixture.dir != "" {
		os.RemoveAll(fixture.dir)
	}
	os.Exit(code)
}

func TestFixtureComposition(t *testing.T) {
	_, s := build(t)
	t.Logf("fixture: %d ops in %s", s.Ops, fixture.took.Round(time.Millisecond))
	want := map[string]int{"task": Tasks, "task:open": OpenTasks, "task:completed": DoneTasks, "task:trashed": TrashedTasks, "task:big-open": BigOpen,
		"task:subtask": Subtasks, "task:notes": WithNotes, "task:dated": Dated, "task:recurring": Recurring, "project": Projects, "section": Sections,
		"label": Labels, "reminder": Reminders, "comment": Comments, "time_entry": TimeEntries, "view": Views}
	for k, n := range want {
		if s.Counts[k] != n {
			t.Errorf("%s: %d, want %d", k, s.Counts[k], n)
		}
	}
	if s.SearchHits != SearchHits || len(s.Shared) != SharedCount || s.Counts["task:shared"] == 0 || len(s.PlainTasks) < 100 {
		t.Errorf("summary: %+v", s)
	}
	// The saved view the benchmark evaluates has eight clauses and parses.
	if err := filter.Parse(s.ViewQuery); err != nil {
		t.Errorf("view query %q: %v", s.ViewQuery, err)
	}
	if fixture.took > 2*time.Minute {
		t.Errorf("the fixture took %s to build", fixture.took)
	}
}

// TestFixtureIsDeterministic: the same seed builds the same entities, values
// and op ids (account ids come from the auth service and are replaced).
func TestFixtureIsDeterministic(t *testing.T) {
	if testing.Short() {
		t.Skip("builds the fixture a second time")
	}
	dirA, a := build(t)
	dirB := t.TempDir()
	b, err := Run(context.Background(), dirB, Options{Now: fixedNow})
	if err != nil {
		t.Fatal(err)
	}
	norm := func(s Summary) Summary { s.OwnerID, s.MemberID, s.Token = "", "", ""; return s }
	if !reflect.DeepEqual(norm(a), norm(b)) {
		t.Fatalf("summaries differ:\n%+v\n%+v", norm(a), norm(b))
	}
	if x, y := pullAll(t, dirA, a), pullAll(t, dirB, b); x != y {
		t.Fatal("a pull from cursor 0 differs between two builds of the same seed")
	}
}

// TestEncryptedVariant: the encrypted account seals its personal content with
// the key its record unwraps with Passphrase, and keeps shared projects plain.
func TestEncryptedVariant(t *testing.T) {
	if testing.Short() {
		t.Skip("builds the fixture a second time")
	}
	dir := t.TempDir()
	s, err := Run(context.Background(), dir, Options{Now: fixedNow, Encrypted: true})
	if err != nil {
		t.Fatal(err)
	}
	db, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	rec, err := e2ee.NewStore(db).Get(context.Background(), s.OwnerID)
	if err != nil || rec == nil {
		t.Fatalf("key record: %v %v", rec, err)
	}
	key, err := crypt.UnlockWithPassphrase(*rec, s.Passphrase)
	if err != nil {
		t.Fatal(err)
	}
	list, err := opsync.NewService(db).List(context.Background(), s.OwnerID, "task", false)
	if err != nil {
		t.Fatal(err)
	}
	shared := map[string]bool{}
	for _, p := range s.Shared {
		shared[p] = true
	}
	sealed, plain := 0, 0
	for _, task := range list {
		var id, title, project string
		_ = json.Unmarshal(task["id"], &id)
		_ = json.Unmarshal(task["title"], &title)
		_ = json.Unmarshal(task["project_id"], &project)
		if shared[project] {
			if e2ee.IsCiphertext(title) {
				t.Fatalf("task %s of a shared project is encrypted", id)
			}
			plain++
			continue
		}
		if _, err := crypt.Open(key, "task", id, "title", title); err != nil {
			t.Fatalf("task %s: %v", id, err)
		}
		sealed++
	}
	if sealed == 0 || plain == 0 {
		t.Fatalf("sealed %d, plain %d", sealed, plain)
	}
}

// pullAll is every op the owner pulls from cursor 0, as text, account ids replaced.
func pullAll(t *testing.T, dir string, s Summary) string {
	t.Helper()
	db, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	svc := opsync.NewService(db)
	var out strings.Builder
	cursor := int64(0)
	for {
		ops, next, more, err := svc.Pull(context.Background(), s.OwnerID, cursor, "", 1000)
		if err != nil {
			t.Fatal(err)
		}
		for _, o := range ops {
			fmt.Fprintf(&out, "%s %s %s %s %s %d\n", o.ID, o.Entity, o.EntityID, o.Field, o.Value, o.TS)
		}
		cursor = next
		if !more {
			break
		}
	}
	return strings.NewReplacer(s.OwnerID, "OWNER", s.MemberID, "MEMBER").Replace(out.String())
}

// TestPullPageQueriesDoNotGrowWithTheAccount: a pull page of the 10,000-task
// account, 60 projects of which 3 shared, runs as many statements as a page of
// an account with one project, shared too.
func TestPullPageQueriesDoNotGrowWithTheAccount(t *testing.T) {
	dir, s := build(t)
	page := func(svc *opsync.Service, log *queryLog, user string) int {
		log.reset()
		ctx := context.Background()
		if _, err := svc.PullWith(ctx, user, 0, "dev", opsync.MaxOpsPerRequest, opsync.PullOptions{}); err != nil {
			t.Fatal(err)
		}
		if _, err := svc.Memberships(ctx, user); err != nil {
			t.Fatal(err)
		}
		if _, err := svc.Workspaces(ctx, user); err != nil {
			t.Fatal(err)
		}
		return log.count()
	}
	bigSvc, bigLog := counting(t, filepath.Join(dir, "opentodo.db"))
	big := page(bigSvc, bigLog, s.OwnerID)

	small := t.TempDir()
	db, err := store.Open(small)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO users(id,email,name,password_hash,created_at) VALUES('u','u@example.com','u','h',1)`); err != nil {
		t.Fatal(err)
	}
	var ops []opsync.Op
	for i, f := range []string{"name", "position"} {
		ops = append(ops, opsync.Op{ID: fmt.Sprint("p", i), Entity: "project", EntityID: "p", Field: f, Value: json.RawMessage(`1`), TS: 1, Device: "d"})
	}
	ops[0].Value = json.RawMessage(`"P"`)
	for i := range 20 {
		ops = append(ops, opsync.Op{ID: fmt.Sprint("t", i), Entity: "task", EntityID: fmt.Sprint("t", i), Field: "project_id", Value: json.RawMessage(`"p"`), TS: 2, Device: "d"})
	}
	svc := opsync.NewService(db)
	if _, err := svc.Apply(context.Background(), "u", ops); err != nil {
		t.Fatal(err)
	}
	// Shared like the fixture's projects, so both run the shared-scope reads.
	if _, err := db.Exec(`INSERT INTO users(id,email,name,password_hash,created_at) VALUES('v','v@example.com','v','h',1)`); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.AddMember(context.Background(), "u", "p", "v", opsync.RoleEditor); err != nil {
		t.Fatal(err)
	}
	db.Close()
	smallSvc, smallLog := counting(t, filepath.Join(small, "opentodo.db"))
	few := page(smallSvc, smallLog, "u")
	t.Logf("statements of one pull page: %d with %d projects (3 shared), %d with 1", big, Projects, few)
	if big > few {
		t.Fatalf("a pull page at %d projects ran %d statements, %d at one project: the cost grows with the account", Projects, big, few)
	}
}

// TestPushStatementsPerOp: a push of 100 ops to the 10,000-task account runs a
// bounded number of statements per op.
func TestPushStatementsPerOp(t *testing.T) {
	dir, s := build(t)
	// A copy: this test writes.
	cp := t.TempDir()
	b, err := os.ReadFile(filepath.Join(dir, "opentodo.db"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(cp, "opentodo.db"), b, 0o600); err != nil {
		t.Fatal(err)
	}
	svc, log := counting(t, filepath.Join(cp, "opentodo.db"))
	var ops []opsync.Op
	for i, id := range s.PlainTasks[:100] {
		ops = append(ops, opsync.Op{ID: fmt.Sprint("push-", i), Entity: "task", EntityID: id, Field: "title", Value: json.RawMessage(`"Edited"`),
			TS: fixedNow.UnixMilli() + int64(i), Device: "bench"})
	}
	log.reset()
	res, err := svc.Apply(context.Background(), s.OwnerID, ops)
	if err != nil || res.Applied != 100 {
		t.Fatalf("%+v %v", res, err)
	}
	n := log.count()
	t.Logf("a push of 100 ops ran %d statements (%.1f per op)", n, float64(n)/100)
	// Measured 2026-11-02 (see the log line): the bound allows some growth
	// per op, never a statement per task of the account.
	if per := float64(n) / 100; per > 12 {
		t.Fatalf("a push of 100 ops ran %d statements, %.1f per op, want at most 12", n, per)
	}
}

// TestServerDoesNotLinkPerfseed: the fixture builder is a development tool.
func TestServerDoesNotLinkPerfseed(t *testing.T) {
	gobin, err := exec.LookPath("go")
	if err != nil {
		if gobin, err = exec.LookPath(filepath.Join(os.Getenv("GOROOT"), "bin", "go")); err != nil {
			t.Skip("the go command is not on PATH")
		}
	}
	out, err := exec.Command(gobin, "list", "-deps", "../../cmd/opentodo").CombinedOutput()
	if err != nil {
		t.Fatalf("go list: %v\n%s", err, out)
	}
	if bytes.Contains(out, []byte("internal/perfseed")) || bytes.Contains(out, []byte("internal/perf\n")) {
		t.Fatal("the server binary links the performance fixture or benchmark")
	}
}

// ---- statement counting (as internal/sync's query cost tests) ----

type queryLog struct {
	mu gosync.Mutex
	n  int
}

func (l *queryLog) add()   { l.mu.Lock(); l.n++; l.mu.Unlock() }
func (l *queryLog) reset() { l.mu.Lock(); l.n = 0; l.mu.Unlock() }
func (l *queryLog) count() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.n
}

type countingConn interface {
	driver.Conn
	driver.ConnBeginTx
	driver.ConnPrepareContext
	driver.QueryerContext
	driver.ExecerContext
}

type logConn struct {
	countingConn
	log *queryLog
}

func (c *logConn) QueryContext(ctx context.Context, q string, args []driver.NamedValue) (driver.Rows, error) {
	c.log.add()
	return c.countingConn.QueryContext(ctx, q, args)
}

func (c *logConn) ExecContext(ctx context.Context, q string, args []driver.NamedValue) (driver.Result, error) {
	c.log.add()
	return c.countingConn.ExecContext(ctx, q, args)
}

func (c *logConn) PrepareContext(ctx context.Context, q string) (driver.Stmt, error) {
	c.log.add()
	return c.countingConn.PrepareContext(ctx, q)
}

type logConnector struct {
	d   driver.Driver
	dsn string
	log *queryLog
}

func (c logConnector) Connect(context.Context) (driver.Conn, error) {
	conn, err := c.d.Open(c.dsn)
	if err != nil {
		return nil, err
	}
	return &logConn{countingConn: conn.(countingConn), log: c.log}, nil
}

func (c logConnector) Driver() driver.Driver { return c.d }

// counting opens a database file over a connection that counts statements.
func counting(t *testing.T, path string) (*opsync.Service, *queryLog) {
	t.Helper()
	base, err := store.Open(filepath.Dir(path))
	if err != nil {
		t.Fatal(err)
	}
	drv := base.Driver()
	base.Close()
	log := &queryLog{}
	db := sql.OpenDB(logConnector{d: drv, dsn: "file:" + path + "?_pragma=busy_timeout(5000)&_pragma=foreign_keys(ON)", log: log})
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { db.Close() })
	return opsync.NewService(db), log
}
