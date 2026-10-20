package issues

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
)

var quietLog = slog.New(slog.NewTextHandler(io.Discard, nil))

// fakeProvider is an in-memory issue tracker: it pages, filters by state,
// updated-since and repository like the real APIs, and answers conditional
// requests with 304 while nothing changed.
type fakeProvider struct {
	mu      sync.Mutex
	issues  []Issue
	version int
	calls   []Request
	errs    []error // returned by the next List calls, in order
	login   string
}

func (f *fakeProvider) set(list ...Issue) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, is := range list {
		replaced := false
		for i := range f.issues {
			if f.issues[i].Key == is.Key {
				f.issues[i], replaced = is, true
			}
		}
		if !replaced {
			f.issues = append(f.issues, is)
		}
	}
	f.version++
}

func (f *fakeProvider) remove(key string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := f.issues[:0]
	for _, is := range f.issues {
		if is.Key != key {
			out = append(out, is)
		}
	}
	f.issues = out
	f.version++
}

func (f *fakeProvider) Account(context.Context) (Account, error) {
	login := f.login
	if login == "" {
		login = "octo"
	}
	return Account{Login: login, CanReadIssues: true}, nil
}

func (f *fakeProvider) List(_ context.Context, r Request) (*Page, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, r)
	if len(f.errs) > 0 {
		err := f.errs[0]
		f.errs = f.errs[1:]
		if err != nil {
			return nil, err
		}
	}
	etag := fmt.Sprintf(`"v%d-%d-%v"`, f.version, r.Since, r.All)
	if r.Page <= 1 && r.ETag != "" && r.ETag == etag {
		return &Page{NotModified: true, ETag: etag}, nil
	}
	var match []Issue
	for _, is := range f.issues {
		if r.Repo != "" && !strings.HasPrefix(is.Key, r.Repo+"#") {
			continue
		}
		if !r.All && is.State != Open {
			continue
		}
		if r.Since > 0 && is.UpdatedAt < r.Since-1000 {
			continue
		}
		match = append(match, is)
	}
	sort.SliceStable(match, func(i, j int) bool { return match[i].UpdatedAt < match[j].UpdatedAt })
	page := max(r.Page, 1)
	lo := min((page-1)*PerPage, len(match))
	hi := min(lo+PerPage, len(match))
	return &Page{Issues: append([]Issue(nil), match[lo:hi]...), ETag: etag, More: hi < len(match)}, nil
}

func (f *fakeProvider) listCalls() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.calls)
}

type harness struct {
	t     *testing.T
	ctx   context.Context
	db    *sql.DB
	sync  *opsync.Service
	w     *Worker
	fake  *fakeProvider
	clock time.Time
	seq   int
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	dir := t.TempDir()
	db, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	h := &harness{t: t, ctx: context.Background(), db: db, sync: opsync.NewService(db), fake: &fakeProvider{},
		clock: time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC)}
	for _, u := range []string{"alice", "bob"} {
		if _, err := db.Exec(`INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,1)`,
			u, u+"@example.org", u, "x", map[string]string{"alice": "owner", "bob": "member"}[u]); err != nil {
			t.Fatal(err)
		}
	}
	h.w = NewWorker(db, dir, h.sync, func(context.Context) bool { return true }, "test", quietLog)
	h.w.NewProvider = func(*Connection, string) (Provider, error) { return h.fake, nil }
	h.w.SetClock(func() time.Time { return h.clock })
	return h
}

// connect creates a connection for user with a token, targeting project (or the Inbox).
func (h *harness) connect(user string, in Input) *Connection {
	h.t.Helper()
	if in.Provider == "" {
		in.Provider = GitHub
	}
	if in.Host == "" {
		in.Host = "http://127.0.0.1"
	}
	if in.IntervalMinutes == 0 {
		in.IntervalMinutes = DefaultIntervalMins
	}
	in.Filter = in.Filter.Normalize()
	in.Enabled = true
	c, err := h.w.Store.Create(h.ctx, user, in)
	if err != nil {
		h.t.Fatal(err)
	}
	if err := h.w.Tokens.Set(c.ID, "pat-"+c.ID); err != nil {
		h.t.Fatal(err)
	}
	return c
}

func (h *harness) poll(c *Connection) (RunCounts, error) {
	h.t.Helper()
	return h.w.Poll(h.ctx, c)
}

func (h *harness) mustPoll(c *Connection) RunCounts {
	h.t.Helper()
	n, err := h.poll(c)
	if err != nil {
		h.t.Fatalf("poll: %v", err)
	}
	return n
}

func (h *harness) conn(id string) *Connection {
	h.t.Helper()
	c, err := h.w.Store.ByID(h.ctx, id)
	if err != nil {
		h.t.Fatal(err)
	}
	return c
}

func (h *harness) task(user, connID, key string) opsync.Entity {
	h.t.Helper()
	e, err := h.sync.Get(h.ctx, user, "task", TaskID(connID, key))
	if err != nil {
		h.t.Fatal(err)
	}
	return e
}

func (h *harness) tasks(user string) []opsync.Entity {
	h.t.Helper()
	list, err := h.sync.List(h.ctx, user, "task", false)
	if err != nil {
		h.t.Fatal(err)
	}
	return list
}

// edit writes a device's op to a task, as a phone would.
func (h *harness) edit(user, taskID, field string, value any) {
	h.t.Helper()
	raw, _ := json.Marshal(value)
	h.clock = h.clock.Add(time.Second)
	h.seq++
	op := opsync.Op{ID: fmt.Sprintf("dev-%d", h.seq), Entity: "task", EntityID: taskID, Field: field, Value: raw,
		TS: h.sync.ServerTSAt(h.clock.UnixMilli()), Device: "phone"}
	if _, err := h.sync.ApplyStrict(h.ctx, user, []opsync.Op{op}); err != nil {
		h.t.Fatal(err)
	}
}

func (h *harness) opCount() int {
	h.t.Helper()
	var n int
	if err := h.db.QueryRow(`SELECT COUNT(*) FROM ops`).Scan(&n); err != nil {
		h.t.Fatal(err)
	}
	return n
}

func strField(e opsync.Entity, f string) string {
	var s string
	_ = json.Unmarshal(e[f], &s)
	return s
}

func at(day, hour int) int64 {
	return time.Date(2026, 10, day, hour, 0, 0, 0, time.UTC).UnixMilli()
}

func issue(key, title string, updated int64) Issue {
	repo, n, _ := strings.Cut(key, "#")
	return Issue{Key: key, Title: title, Body: "Body of " + title, URL: "https://github.com/" + repo + "/issues/" + n, State: Open, UpdatedAt: updated}
}
