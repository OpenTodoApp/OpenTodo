package calsync

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/calfeed"
	"github.com/pixari/opentodo/internal/calsync/calsynctest"
	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
)

var quietLog = slog.New(slog.NewTextHandler(io.Discard, nil))

type harness struct {
	t     *testing.T
	ctx   context.Context
	db    *sql.DB
	sync  *opsync.Service
	w     *Worker
	srv   *calsynctest.Server
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
	h := &harness{t: t, ctx: context.Background(), db: db, sync: opsync.NewService(db), srv: calsynctest.New(),
		clock: time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC)}
	t.Cleanup(h.srv.Close)
	for _, u := range []string{"alice", "bob"} {
		if _, err := db.Exec(`INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,1)`,
			u, u+"@example.org", u, "x", map[string]string{"alice": "owner", "bob": "member"}[u]); err != nil {
			t.Fatal(err)
		}
	}
	h.w = NewWorker(db, dir, h.sync, func(context.Context) bool { return true }, config.GoogleConfig{}, "test", quietLog)
	h.w.SetClock(func() time.Time { return h.clock })
	h.w.Tasks = h.feedTasks
	return h
}

// feedTasks is the task feed's selection, simplified for tests: open tasks with a due.
func (h *harness) feedTasks(ctx context.Context, userID string) ([]calfeed.FeedTask, error) {
	list, err := h.sync.List(ctx, userID, "task", false)
	if err != nil {
		return nil, err
	}
	mod, err := h.sync.Modified(ctx, userID, "task")
	if err != nil {
		return nil, err
	}
	var out []calfeed.FeedTask
	for _, t := range list {
		if string(t["completed_at"]) != "" && string(t["completed_at"]) != "null" {
			continue
		}
		var due struct {
			Date string  `json:"date"`
			Time *string `json:"time"`
			TZ   *string `json:"tz"`
		}
		if json.Unmarshal(t["due"], &due) != nil || due.Date == "" {
			continue
		}
		id := str(t["id"])
		ft := calfeed.FeedTask{ID: id, Title: str(t["title"]), Description: str(t["description"]), Date: due.Date, Time: due.Time, TZ: due.TZ, Modified: mod[id]}
		_ = json.Unmarshal(t["estimate_minutes"], &ft.Estimate)
		out = append(out, ft)
	}
	return out, nil
}

func str(v json.RawMessage) string {
	var s string
	_ = json.Unmarshal(v, &s)
	return s
}

// connect creates alice's CalDAV connection to the fake server, writing into "work".
func (h *harness) connect(dateOnly bool) *Connection {
	h.t.Helper()
	base, d, err := h.w.DiscoverCalDAV(h.ctx, h.srv.URL, h.srv.User, h.srv.Password)
	if err != nil {
		h.t.Fatalf("discover: %v", err)
	}
	c, err := h.w.Store.Create(h.ctx, &Connection{UserID: "alice", Provider: ProviderCalDAV, Name: "Fake", ServerURL: base, Username: h.srv.User,
		PrincipalURL: d.Principal, HomeURL: d.Home, Calendars: d.Calendars})
	if err != nil {
		h.t.Fatal(err)
	}
	if err := h.w.Secrets.Set(c.ID, h.srv.Password); err != nil {
		h.t.Fatal(err)
	}
	target := h.srv.CalendarURL("work")
	if c, err = h.w.Store.Update(h.ctx, "alice", c.ID, Patch{TargetURL: &target, IncludeDateOnly: &dateOnly}); err != nil {
		h.t.Fatal(err)
	}
	return c
}

func (h *harness) cycle(c *Connection) RunCounts {
	h.t.Helper()
	n, err := h.w.Cycle(h.ctx, c)
	if err != nil {
		h.t.Fatalf("cycle: %v", err)
	}
	return n
}

// task creates a task for user through the op log, as a device would.
func (h *harness) task(user, id string, fields map[string]any) {
	h.t.Helper()
	h.edit(user, id, fields)
}

// edit writes a device's ops to a task.
func (h *harness) edit(user, id string, fields map[string]any) {
	h.t.Helper()
	h.clock = h.clock.Add(time.Second)
	var ops []opsync.Op
	for f, v := range fields {
		raw, _ := json.Marshal(v)
		h.seq++
		ops = append(ops, opsync.Op{ID: fmt.Sprintf("dev-%d", h.seq), Entity: "task", EntityID: id, Field: f, Value: raw,
			TS: h.sync.ServerTSAt(h.clock.UnixMilli()), Device: "phone"})
	}
	if _, err := h.sync.ApplyStrict(h.ctx, user, ops); err != nil {
		h.t.Fatal(err)
	}
}

func (h *harness) get(user, id string) opsync.Entity {
	h.t.Helper()
	e, err := h.sync.Get(h.ctx, user, "task", id)
	if err != nil {
		h.t.Fatal(err)
	}
	return e
}

func (h *harness) conn(id string) *Connection {
	h.t.Helper()
	c, err := h.w.Store.ByID(h.ctx, id)
	if err != nil {
		h.t.Fatal(err)
	}
	return c
}

// event is a calendar object as a calendar app writes it after a change.
func event(uid, summary, start, end string, modified time.Time) string {
	return strings.Join([]string{"BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Fake//EN", "BEGIN:VEVENT", "UID:" + uid,
		"DTSTAMP:" + modified.UTC().Format("20060102T150405Z"), "LAST-MODIFIED:" + modified.UTC().Format("20060102T150405Z"),
		"SUMMARY:" + summary, start, end, "END:VEVENT", "END:VCALENDAR", ""}, "\r\n")
}

func due(e opsync.Entity) map[string]string {
	var d map[string]string
	_ = json.Unmarshal(e["due"], &d)
	return d
}
