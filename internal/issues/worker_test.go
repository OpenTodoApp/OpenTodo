package issues

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	opsync "github.com/pixari/opentodo/internal/sync"
)

// The poller against a fake provider (tasks 3.1–3.3): what becomes a task, how
// a task follows its issue, and how failures pace and stop a connection.

func TestNewIssueBecomesTask(t *testing.T) {
	h := newHarness(t)
	h.edit("alice", "seed", "title", "x") // a task of the user's own
	project := "work"
	h.sync.ApplyStrict(h.ctx, "alice", []opsync.Op{{ID: "p1", Entity: "project", EntityID: project, Field: "name", Value: json.RawMessage(`"Work"`), TS: h.sync.ServerTS(), Device: "phone"}})
	c := h.connect("alice", Input{ProjectID: &project})
	is := issue("acme/web#42", "Fix login redirect", at(1, 9))
	is.Body = "The redirect loses the **return** address."
	closed := issue("acme/web#7", "Old", at(1, 8))
	closed.State, closed.ClosedAt = Closed, at(1, 8)
	h.fake.set(is, closed)
	n := h.mustPoll(c)
	if n.Created != 1 || n.Partial {
		t.Fatalf("counts = %+v", n)
	}
	task := h.task("alice", c.ID, "acme/web#42")
	if strField(task, "title") != "Fix login redirect" || strField(task, "description") != is.Body || strField(task, "project_id") != "work" ||
		string(task["priority"]) != "4" || task["due"] != nil || string(task["completed_at"]) != "" && string(task["completed_at"]) != "null" {
		t.Fatalf("task = %v", task)
	}
	var o map[string]string
	_ = json.Unmarshal(task["origin"], &o)
	want := map[string]string{"kind": "issue", "provider": "github", "id": "acme/web#42", "url": "https://github.com/acme/web/issues/42", "title": "acme/web#42"}
	if fmt.Sprint(o) != fmt.Sprint(want) {
		t.Fatalf("origin = %v", o)
	}
	if h.task("alice", c.ID, "acme/web#7") != nil {
		t.Fatal("an issue closed before it was first seen became a task")
	}
	var device string
	h.db.QueryRow(`SELECT device FROM ops WHERE entity_id = ? AND field = 'title'`, TaskID(c.ID, "acme/web#42")).Scan(&device)
	if device != "issues:"+c.ID {
		t.Fatalf("device = %q", device)
	}
	// A second poll of the same versions writes nothing.
	before := h.opCount()
	h.clock = h.clock.Add(time.Hour)
	if n := h.mustPoll(h.conn(c.ID)); n.Created != 0 || h.opCount() != before {
		t.Fatalf("repeat: %+v, ops %d → %d", n, before, h.opCount())
	}
}

func TestInboxTargetAndSelfHostedOrigin(t *testing.T) {
	h := newHarness(t)
	c := h.connect("alice", Input{Provider: GitLab, Host: "http://127.0.0.1:8929"})
	is := Issue{Key: "team/app#5", Title: "Crash", URL: "https://gitlab.example.com/team/app/-/issues/5", State: Open, UpdatedAt: at(2, 9)}
	h.fake.set(is)
	h.mustPoll(c)
	task := h.task("alice", c.ID, "team/app#5")
	if v, ok := task["project_id"]; ok && string(v) != "null" {
		t.Fatalf("project = %s", v)
	}
	var o map[string]string
	_ = json.Unmarshal(task["origin"], &o)
	if o["kind"] != "issue" || o["provider"] != "gitlab" || o["id"] != "team/app#5" || o["url"] != is.URL {
		t.Fatalf("origin = %v", o)
	}
}

func TestTaskFollowsItsIssue(t *testing.T) {
	h := newHarness(t)
	c := h.connect("alice", Input{})
	is := issue("acme/web#42", "Fix login redirect", at(1, 9))
	h.fake.set(is)
	h.mustPoll(c)
	id := TaskID(c.ID, is.Key)

	// Issue closed: completed at the close time.
	h.clock = h.clock.Add(time.Hour)
	is.State, is.ClosedAt, is.UpdatedAt = Closed, at(3, 10), at(3, 10)
	h.fake.set(is)
	if n := h.mustPoll(h.conn(c.ID)); n.Completed != 1 {
		t.Fatalf("close counts = %+v", n)
	}
	if string(h.task("alice", c.ID, is.Key)["completed_at"]) != fmt.Sprint(at(3, 10)) {
		t.Fatalf("completed_at = %s", h.task("alice", c.ID, is.Key)["completed_at"])
	}
	// Reopened.
	h.clock = h.clock.Add(time.Hour)
	is.State, is.ClosedAt, is.UpdatedAt = Open, 0, at(4, 10)
	h.fake.set(is)
	if n := h.mustPoll(h.conn(c.ID)); n.Reopened != 1 {
		t.Fatalf("reopen counts = %+v", n)
	}
	if v := h.task("alice", c.ID, is.Key)["completed_at"]; string(v) != "null" {
		t.Fatalf("reopened completed_at = %s", v)
	}
	// Body edited at the provider: notes unchanged.
	h.clock = h.clock.Add(time.Hour)
	is.Body, is.UpdatedAt = "New body", at(5, 10)
	h.fake.set(is)
	h.mustPoll(h.conn(c.ID))
	if strField(h.task("alice", c.ID, is.Key), "description") != "Body of Fix login redirect" {
		t.Fatal("the notes followed the issue body")
	}
	// User renames, then the issue is renamed.
	h.edit("alice", id, "title", "Fix redirect (prod)")
	h.clock = h.clock.Add(time.Hour)
	is.UpdatedAt = at(6, 10) // a change that is not a rename
	h.fake.set(is)
	h.mustPoll(h.conn(c.ID))
	if got := strField(h.task("alice", c.ID, is.Key), "title"); got != "Fix redirect (prod)" {
		t.Fatalf("the user's title was overwritten: %q", got)
	}
	h.clock = h.clock.Add(time.Hour)
	is.Title, is.UpdatedAt = "Fix login redirect on mobile", at(7, 10)
	h.fake.set(is)
	if n := h.mustPoll(h.conn(c.ID)); n.Renamed != 1 {
		t.Fatalf("rename counts = %+v", n)
	}
	task := h.task("alice", c.ID, is.Key)
	var o map[string]string
	_ = json.Unmarshal(task["origin"], &o)
	if strField(task, "title") != "Fix login redirect on mobile" || o["title"] != "acme/web#42" {
		t.Fatalf("after the rename: %q, origin %v", strField(task, "title"), o)
	}
}

func TestUserCompletesFirstAndTrashedTask(t *testing.T) {
	h := newHarness(t)
	c := h.connect("alice", Input{})
	a, b := issue("acme/web#1", "A", at(1, 9)), issue("acme/web#2", "B", at(1, 10))
	h.fake.set(a, b)
	h.mustPoll(c)
	// User completes the task of an open issue; the issue changes but stays open.
	h.edit("alice", TaskID(c.ID, a.Key), "completed_at", h.clock.UnixMilli())
	h.clock = h.clock.Add(time.Hour)
	a.UpdatedAt = at(2, 9)
	h.fake.set(a)
	h.mustPoll(h.conn(c.ID))
	if v := h.task("alice", c.ID, a.Key)["completed_at"]; string(v) == "null" {
		t.Fatal("a poll reopened the user's completion")
	}
	// Trashed task: the issue closes, nothing is written for it.
	h.edit("alice", TaskID(c.ID, b.Key), "deleted_at", h.clock.UnixMilli())
	before := h.opCount()
	h.clock = h.clock.Add(time.Hour)
	b.State, b.ClosedAt, b.UpdatedAt = Closed, at(3, 9), at(3, 9)
	h.fake.set(b)
	if n := h.mustPoll(h.conn(c.ID)); n.Completed != 0 || h.opCount() != before {
		t.Fatalf("trashed: %+v, ops %d → %d", n, before, h.opCount())
	}
}

func TestOfflineEditConverges(t *testing.T) {
	h := newHarness(t)
	c := h.connect("alice", Input{})
	is := issue("acme/web#1", "A", at(1, 9))
	h.fake.set(is)
	h.mustPoll(c)
	id := TaskID(c.ID, is.Key)
	// The device renames offline (an earlier timestamp), the poll completes the task, then the device syncs.
	offlineTS := h.sync.ServerTSAt(h.clock.UnixMilli())
	h.clock = h.clock.Add(time.Hour)
	is.State, is.ClosedAt, is.UpdatedAt = Closed, at(2, 9), at(2, 9)
	h.fake.set(is)
	h.mustPoll(h.conn(c.ID))
	if _, err := h.sync.ApplyStrict(h.ctx, "alice", []opsync.Op{{ID: "offline-rename", Entity: "task", EntityID: id, Field: "title",
		Value: json.RawMessage(`"Device title"`), TS: offlineTS, Device: "phone"}}); err != nil {
		t.Fatal(err)
	}
	task := h.task("alice", c.ID, is.Key)
	if strField(task, "title") != "Device title" || string(task["completed_at"]) != fmt.Sprint(at(2, 9)) {
		t.Fatalf("converged task = %v", task)
	}
}

func TestLongBodyIsCut(t *testing.T) {
	h := newHarness(t)
	c := h.connect("alice", Input{})
	is := issue("acme/web#1", "Long", at(1, 9))
	is.Body = strings.Repeat("äbcdefghij\n", 200<<10/12)
	h.fake.set(is)
	h.mustPoll(c)
	d := strField(h.task("alice", c.ID, is.Key), "description")
	enc, _ := json.Marshal(d)
	if !strings.HasSuffix(d, TruncatedNote) || len(enc) > opsync.MaxValueBytes || !strings.HasPrefix(is.Body, strings.TrimSuffix(strings.TrimSuffix(d, TruncatedNote), "\n\n")) {
		t.Fatalf("description: %d bytes, ends %q", len(d), d[len(d)-40:])
	}
}

func TestUnchangedAnswersNotModified(t *testing.T) {
	h := newHarness(t)
	c := h.connect("alice", Input{})
	h.fake.set(issue("acme/web#1", "A", at(1, 9)))
	h.mustPoll(c)
	h.clock = h.clock.Add(time.Hour)
	h.mustPoll(h.conn(c.ID)) // the first poll after creation lists closed issues too: a new URL
	before, calls := h.opCount(), h.fake.listCalls()
	h.clock = h.clock.Add(time.Hour)
	h.mustPoll(h.conn(c.ID))
	last := h.fake.calls[len(h.fake.calls)-1]
	cc := h.conn(c.ID)
	if h.opCount() != before || h.fake.listCalls() != calls+1 || last.ETag == "" || *cc.LastPollAt != h.clock.UnixMilli() {
		t.Fatalf("304 poll: ops %d → %d, calls %d → %d, etag %q", before, h.opCount(), calls, h.fake.listCalls(), last.ETag)
	}
}

func TestOnlyChangesAreProcessed(t *testing.T) {
	h := newHarness(t)
	c := h.connect("alice", Input{})
	var list []Issue
	for i := 1; i <= 300; i++ {
		list = append(list, issue(fmt.Sprintf("acme/web#%d", i), fmt.Sprintf("Issue %d", i), at(1, 0)+int64(i)*1000))
	}
	h.fake.set(list...)
	h.mustPoll(c)
	h.mustPoll(h.conn(c.ID))
	before := h.opCount()
	renamed := list[150]
	renamed.Title, renamed.UpdatedAt = "Renamed", at(5, 0)
	h.fake.set(renamed)
	h.clock = h.clock.Add(time.Hour)
	if n := h.mustPoll(h.conn(c.ID)); n.Renamed != 1 {
		t.Fatalf("counts = %+v", n)
	}
	if got := h.opCount() - before; got != 1 {
		t.Fatalf("%d ops written for one rename", got)
	}
}

func TestPartialRun(t *testing.T) {
	h := newHarness(t)
	c := h.connect("alice", Input{})
	var list []Issue
	for i := 1; i <= 1500; i++ {
		list = append(list, issue(fmt.Sprintf("acme/web#%d", i), "I", at(1, 0)+int64(i)*1000))
	}
	h.fake.set(list...)
	n := h.mustPoll(c)
	cc := h.conn(c.ID)
	if n.Created != 1000 || !n.Partial || !cc.LastRun.Partial || cc.NextPollAt != h.clock.Add(time.Minute).UnixMilli() {
		t.Fatalf("first run: %+v, next %d", n, cc.NextPollAt)
	}
	h.clock = h.clock.Add(time.Minute)
	n = h.mustPoll(cc)
	if n.Created != 500 || n.Partial || len(h.tasks("alice")) != 1500 {
		t.Fatalf("second run: %+v, %d tasks", n, len(h.tasks("alice")))
	}
}

func TestHostDownBacksOff(t *testing.T) {
	h := newHarness(t)
	c := h.connect("alice", Input{})
	h.fake.set(issue("acme/web#1", "A", at(1, 9)))
	h.mustPoll(c)
	timeout := &Error{ReasonTimeout}
	h.fake.errs = []error{timeout, timeout, timeout}
	var waits []time.Duration
	for range 3 {
		h.clock = time.UnixMilli(h.conn(c.ID).NextPollAt)
		if _, err := h.poll(h.conn(c.ID)); ReasonOf(errors.Unwrap(err)) != ReasonTimeout && err.(*PollError).Reason != ReasonTimeout {
			t.Fatalf("err = %v", err)
		}
		cc := h.conn(c.ID)
		waits = append(waits, time.UnixMilli(cc.NextPollAt).Sub(h.clock))
		if cc.State != StateFailed || cc.LastError != ReasonTimeout || cc.LastSuccessAt == nil {
			t.Fatalf("status = %+v", cc)
		}
	}
	if waits[0] != time.Hour || waits[1] != 2*time.Hour || waits[2] != 4*time.Hour {
		t.Fatalf("waits = %v", waits)
	}
	if len(h.tasks("alice")) != 1 {
		t.Fatal("a failed poll changed the tasks")
	}
	h.clock = time.UnixMilli(h.conn(c.ID).NextPollAt)
	h.mustPoll(h.conn(c.ID))
	if cc := h.conn(c.ID); cc.BackoffSeconds != 0 || cc.NextPollAt != h.clock.Add(30*time.Minute).UnixMilli() || cc.State != StateOK {
		t.Fatalf("after success: %+v", cc)
	}
}

func TestTokenRevokedStops(t *testing.T) {
	h := newHarness(t)
	c := h.connect("alice", Input{})
	h.fake.errs = []error{&Error{ReasonUnauthorized}}
	if _, err := h.poll(c); err == nil {
		t.Fatal("no error")
	}
	cc := h.conn(c.ID)
	if cc.State != StateStopped || cc.StoppedReason != ReasonUnauthorized {
		t.Fatalf("status = %+v", cc)
	}
	h.clock = h.clock.Add(48 * time.Hour)
	if due, _ := h.w.Store.Due(h.ctx, 10); len(due) != 0 {
		t.Fatal("a stopped connection is due")
	}
	// A new token clears the stop.
	cc, _ = h.w.Store.Update(h.ctx, "alice", c.ID, Patch{TokenReplaced: true})
	if cc.StoppedReason != "" || cc.NextPollAt != h.clock.UnixMilli() {
		t.Fatalf("after a new token: %+v", cc)
	}
}

func TestTokenMissingAndEncryptedStop(t *testing.T) {
	h := newHarness(t)
	c := h.connect("alice", Input{})
	if err := h.w.Tokens.Delete(c.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := h.poll(c); err == nil || h.conn(c.ID).StoppedReason != ReasonTokenMissing || h.fake.listCalls() != 0 {
		t.Fatalf("token missing: %v %+v", err, h.conn(c.ID))
	}
	d := h.connect("bob", Input{})
	if _, err := h.db.Exec(`INSERT INTO encryption_keys(user_id,version,kdf,salt,iterations,wrapped_passphrase,wrapped_recovery,created_at,updated_at)
		VALUES('bob',1,1,'s',1,'p','r',1,1)`); err != nil {
		t.Fatal(err)
	}
	if _, err := h.poll(d); err == nil || h.conn(d.ID).StoppedReason != ReasonEncrypted {
		t.Fatalf("encrypted: %v %+v", err, h.conn(d.ID))
	}
}

func TestPrivateHostStops(t *testing.T) {
	h := newHarness(t)
	c := h.connect("alice", Input{})
	h.w.Dialer.AllowPrivate = func(context.Context) bool { return false }
	if _, err := h.poll(c); err == nil || h.conn(c.ID).StoppedReason != ReasonPrivateTarget || h.fake.listCalls() != 0 {
		t.Fatalf("private: %v %+v", err, h.conn(c.ID))
	}
}

func TestRateLimitWaitsForReset(t *testing.T) {
	h := newHarness(t)
	c := h.connect("alice", Input{})
	reset := h.clock.Add(20 * time.Minute).Truncate(time.Second)
	h.fake.errs = []error{&RateLimitedError{Until: reset}}
	_, err := h.poll(c)
	var pe *PollError
	if !errors.As(err, &pe) || pe.Reason != ReasonRateLimited || !pe.Until.Equal(reset) {
		t.Fatalf("err = %v", err)
	}
	cc := h.conn(c.ID)
	if cc.NextPollAt != reset.UnixMilli() || cc.LastError != ReasonRateLimited || cc.StoppedReason != "" || cc.BackoffSeconds != 0 {
		t.Fatalf("status = %+v", cc)
	}
	h.clock = reset.Add(-time.Second)
	calls := h.fake.listCalls()
	h.w.RunOnce(h.ctx)
	if h.fake.listCalls() != calls {
		t.Fatal("a request before the reset")
	}
}

func TestRestartDuringPollCreatesOneTask(t *testing.T) {
	h := newHarness(t)
	c := h.connect("alice", Input{})
	is := issue("acme/web#9", "Nine", at(1, 9))
	h.fake.set(is)
	h.mustPoll(c)
	// The link was never recorded (the server stopped between apply and link).
	if _, err := h.db.Exec(`DELETE FROM issue_links`); err != nil {
		t.Fatal(err)
	}
	if _, err := h.db.Exec(`UPDATE issue_connections SET since_ms = 0, etag = '{}'`); err != nil {
		t.Fatal(err)
	}
	h.clock = h.clock.Add(time.Hour)
	if n := h.mustPoll(h.conn(c.ID)); n.Created != 0 {
		t.Fatalf("counts = %+v", n)
	}
	if len(h.tasks("alice")) != 1 || h.conn(c.ID).TaskCount != 1 {
		t.Fatalf("%d tasks", len(h.tasks("alice")))
	}
}

// quota refuses every op after the first n, like a hosted tenant at its limit.
type quota struct{ left int }

func (q *quota) Admit(context.Context, *sql.Tx) (func(op opsync.Op) string, error) {
	return func(opsync.Op) string {
		if q.left <= 0 {
			return opsync.ReasonLimitOpsHour
		}
		q.left--
		return ""
	}, nil
}
func (q *quota) Stored(int) {}

func TestTenantLimitEndsRun(t *testing.T) {
	h := newHarness(t)
	c := h.connect("alice", Input{})
	var list []Issue
	for i := 1; i <= 150; i++ {
		list = append(list, issue(fmt.Sprintf("acme/web#%d", i), "I", at(1, 0)+int64(i)*1000))
	}
	h.fake.set(list...)
	// Enough for the first page of 100 tasks (6 ops each), not the second.
	q := &quota{left: 600}
	h.sync.SetQuota(q)
	_, err := h.poll(c)
	var pe *PollError
	if !errors.As(err, &pe) || pe.Reason != opsync.ReasonLimitOpsHour {
		t.Fatalf("err = %v", err)
	}
	if cc := h.conn(c.ID); cc.LastError != opsync.ReasonLimitOpsHour || len(h.tasks("alice")) != 100 {
		t.Fatalf("status %+v, %d tasks", cc, len(h.tasks("alice")))
	}
	q.left = 1 << 20
	h.clock = time.UnixMilli(h.conn(c.ID).NextPollAt)
	if n := h.mustPoll(h.conn(c.ID)); n.Created != 50 || len(h.tasks("alice")) != 150 {
		t.Fatalf("continued: %+v, %d tasks", n, len(h.tasks("alice")))
	}
}

func TestIssueNoLongerMatches(t *testing.T) {
	h := newHarness(t)
	c := h.connect("alice", Input{})
	a, b := issue("acme/web#1", "A", at(1, 9)), issue("acme/web#2", "B", at(1, 10))
	h.fake.set(a, b)
	h.mustPoll(c)
	h.fake.remove(b.Key) // unassigned: no longer listed
	h.clock = h.clock.Add(25 * time.Hour)
	if n := h.mustPoll(h.conn(c.ID)); n.Unlinked != 1 {
		t.Fatalf("counts = %+v", n)
	}
	if strField(h.task("alice", c.ID, b.Key), "title") != "B" {
		t.Fatal("the task of an unmatched issue changed")
	}
}

func TestRepositoryScopeWithLabel(t *testing.T) {
	h := newHarness(t)
	c := h.connect("alice", Input{Filter: Filter{Scope: ScopeRepositories, Repositories: []string{"acme/web"}, Labels: []string{"bug"}}})
	bug := issue("acme/web#1", "Bug", at(1, 9))
	bug.Labels = []string{"Bug"}
	plain := issue("acme/web#2", "Plain", at(1, 9))
	other := issue("acme/api#3", "Other repo", at(1, 9))
	other.Labels = []string{"bug"}
	h.fake.set(bug, plain, other)
	h.mustPoll(c)
	if len(h.tasks("alice")) != 1 || h.task("alice", c.ID, bug.Key) == nil {
		t.Fatalf("tasks = %d", len(h.tasks("alice")))
	}
	if r := h.fake.calls[0]; r.Repo != "acme/web" || r.Login != "octo" || r.Labels[0] != "bug" {
		t.Fatalf("request = %+v", r)
	}
}

func TestLabelMapping(t *testing.T) {
	h := newHarness(t)
	ts := h.sync.ServerTS()
	h.sync.ApplyStrict(h.ctx, "alice", []opsync.Op{{ID: "l1", Entity: "label", EntityID: "lbl-backend", Field: "name", Value: json.RawMessage(`"backend"`), TS: ts, Device: "phone"}})
	c := h.connect("alice", Input{MapLabels: true})
	is := issue("acme/web#1", "A", at(1, 9))
	is.Labels = []string{"bug", "Backend"}
	h.fake.set(is)
	h.mustPoll(c)
	var labels []string
	_ = json.Unmarshal(h.task("alice", c.ID, is.Key)["labels"], &labels)
	bugID := LabelID("alice", "bug")
	if fmt.Sprint(labels) != fmt.Sprint([]string{bugID, "lbl-backend"}) {
		t.Fatalf("labels = %v", labels)
	}
	l, _ := h.sync.Get(h.ctx, "alice", "label", bugID)
	if strField(l, "name") != "bug" || strField(l, "color") == "" {
		t.Fatalf("created label = %v", l)
	}
	// The user adds "this week"; the issue loses bug.
	h.edit("alice", TaskID(c.ID, is.Key), "labels", []string{bugID, "lbl-backend", "lbl-week"})
	h.clock = h.clock.Add(time.Hour)
	is.Labels, is.UpdatedAt = []string{"Backend"}, at(2, 9)
	h.fake.set(is)
	h.mustPoll(h.conn(c.ID))
	labels = nil
	_ = json.Unmarshal(h.task("alice", c.ID, is.Key)["labels"], &labels)
	if fmt.Sprint(labels) != fmt.Sprint([]string{"lbl-week", "lbl-backend"}) {
		t.Fatalf("after the issue lost bug: %v", labels)
	}
	// Mapping off: no labels from issues.
	d := h.connect("bob", Input{})
	other := issue("acme/web#5", "B", at(1, 9))
	other.Labels = []string{"bug"}
	h.fake.set(other)
	h.mustPoll(d)
	if v := h.task("bob", d.ID, other.Key)["labels"]; v != nil {
		t.Fatalf("mapping off gave labels %s", v)
	}
}
