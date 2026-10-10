package webhook

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strconv"
	gosync "sync"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// fakeClock is the injectable clock: tests move time instead of sleeping.
type fakeClock struct {
	mu gosync.Mutex
	t  time.Time
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *fakeClock) Advance(d time.Duration) {
	c.mu.Lock()
	c.t = c.t.Add(d)
	c.mu.Unlock()
}

// receiver is an in-process webhook endpoint answering with scripted codes.
type receiver struct {
	srv   *httptest.Server
	mu    gosync.Mutex
	codes []int // consumed in order; the last one repeats
	reqs  []captured
}

type captured struct {
	header http.Header
	body   []byte
}

func newReceiver(t *testing.T, codes ...int) *receiver {
	r := &receiver{codes: codes}
	r.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		body, _ := io.ReadAll(req.Body)
		r.mu.Lock()
		r.reqs = append(r.reqs, captured{req.Header.Clone(), body})
		code := 200
		if len(r.codes) > 0 {
			code = r.codes[0]
			if len(r.codes) > 1 {
				r.codes = r.codes[1:]
			}
		}
		r.mu.Unlock()
		w.WriteHeader(code)
		fmt.Fprintf(w, "answered %d", code)
	}))
	t.Cleanup(r.srv.Close)
	return r
}

func (r *receiver) count() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.reqs)
}

func (r *receiver) last() captured {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.reqs[len(r.reqs)-1]
}

type harness struct {
	t     *testing.T
	dir   string
	db    *sql.DB
	sync  *opsync.Service
	hooks *Service
	clock *fakeClock
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	h := &harness{t: t, dir: t.TempDir(), clock: &fakeClock{t: time.UnixMilli(1_760_000_000_000)}}
	h.open()
	if _, err := h.db.Exec(`INSERT INTO users(id,email,password_hash,role,created_at) VALUES('u1','u1@example.com','x','owner',1),('u2','u2@example.com','x','member',1)`); err != nil {
		t.Fatal(err)
	}
	// Receivers run on loopback, so these tests run with the owner override on.
	if err := h.hooks.SetAllowPrivate(context.Background(), true); err != nil {
		t.Fatal(err)
	}
	return h
}

// open (re)opens the database and services, as a server start would.
func (h *harness) open() {
	db, err := store.Open(h.dir)
	if err != nil {
		h.t.Fatal(err)
	}
	h.t.Cleanup(func() { db.Close() })
	h.db = db
	h.sync = opsync.NewService(db)
	h.hooks = New(db, h.sync, Options{Version: "test", Log: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Now: h.clock.Now, Rand: func() float64 { return 0.5 }})
	h.sync.SetObserver(h.hooks.Observe)
}

var tsCounter int64 = 1_000

func (h *harness) apply(userID string, ops ...opsync.Op) {
	h.t.Helper()
	if _, err := h.sync.Apply(context.Background(), userID, ops); err != nil {
		h.t.Fatal(err)
	}
}

func setOp(entity, id, field, value string) opsync.Op {
	tsCounter++
	return opsync.Op{ID: "op-" + strconv.FormatInt(tsCounter, 10), Entity: entity, EntityID: id, Field: field, Value: json.RawMessage(value), TS: tsCounter, Device: "phone"}
}

func (h *harness) create(userID, url string, events []string, project *string) *Webhook {
	h.t.Helper()
	w, err := h.hooks.Create(context.Background(), userID, Patch{URL: &url, Events: events, EventsSet: true, ProjectID: project, ProjectIDSet: project != nil})
	if err != nil {
		h.t.Fatal(err)
	}
	return w
}

func (h *harness) deliveries(webhookID string) []Delivery {
	h.t.Helper()
	var userID string
	_ = h.db.QueryRow(`SELECT user_id FROM webhooks WHERE id = ?`, webhookID).Scan(&userID)
	list, err := h.hooks.Deliveries(context.Background(), userID, webhookID)
	if err != nil {
		h.t.Fatal(err)
	}
	return list
}

func (h *harness) drain() {
	for h.hooks.ProcessDue(context.Background()) > 0 {
	}
}

func TestRetrySchedule(t *testing.T) {
	// The schedule itself: nominal waits with ±20 % jitter, then no more retries.
	for i, want := range RetrySchedule {
		got, ok := Backoff(i+1, 0.5)
		if !ok || got != want {
			t.Fatalf("Backoff(%d) = %v %v, want %v", i+1, got, ok, want)
		}
		lo, _ := Backoff(i+1, 0)
		hi, _ := Backoff(i+1, 0.999999)
		if lo != time.Duration(float64(want)*0.8) || hi < time.Duration(float64(want)*1.19) || hi > time.Duration(float64(want)*1.2) {
			t.Fatalf("jitter bounds for %d: %v..%v", i+1, lo, hi)
		}
	}
	if _, ok := Backoff(MaxAttempts, 0.5); ok {
		t.Fatal("no retry after the last attempt")
	}

	// Through the queue: a receiver that always fails is attempted 7 times on schedule.
	h := newHarness(t)
	rcv := newReceiver(t, 503)
	w := h.create("u1", rcv.srv.URL, []string{"task.created"}, nil)
	h.apply("u1", setOp("task", "t1", "title", `"x"`), setOp("task", "t1", "created_at", `1`))
	for attempt := 1; attempt <= MaxAttempts; attempt++ {
		if n := h.hooks.ProcessDue(context.Background()); n != 1 {
			t.Fatalf("attempt %d: processed %d", attempt, n)
		}
		d := h.deliveries(w.ID)[0]
		if d.Attempts != attempt || *d.StatusCode != 503 || *d.Error != "HTTP 503" {
			t.Fatalf("attempt %d: %+v", attempt, d)
		}
		if attempt == MaxAttempts {
			if d.Status != "failed" || d.NextAttemptAt != nil {
				t.Fatalf("final: %+v", d)
			}
			break
		}
		wait := RetrySchedule[attempt-1]
		if d.Status != "retry" || *d.NextAttemptAt != h.clock.Now().Add(wait).UnixMilli() {
			t.Fatalf("attempt %d: status %s next %v, want +%v", attempt, d.Status, d.NextAttemptAt, wait)
		}
		// Not due a moment before the wait elapses.
		h.clock.Advance(wait - time.Second)
		if n := h.hooks.ProcessDue(context.Background()); n != 0 {
			t.Fatalf("attempt %d retried early", attempt)
		}
		h.clock.Advance(time.Second)
	}
	if rcv.count() != MaxAttempts {
		t.Fatalf("receiver saw %d requests", rcv.count())
	}
	var failures int
	_ = h.db.QueryRow(`SELECT consecutive_failures FROM webhooks WHERE id=?`, w.ID).Scan(&failures)
	if failures != 1 {
		t.Fatalf("consecutive_failures = %d", failures)
	}
}

func TestRetryThenSuccessAndSignature(t *testing.T) {
	h := newHarness(t)
	rcv := newReceiver(t, 503, 200)
	w := h.create("u1", rcv.srv.URL, []string{"task.updated"}, nil)
	h.apply("u1", setOp("task", "t1", "priority", `4`))
	h.apply("u1", setOp("task", "t1", "priority", `1`))
	h.drain()
	h.clock.Advance(RetrySchedule[0])
	h.drain()
	list := h.deliveries(w.ID)
	if len(list) != 2 { // one for each batch (task.updated twice: absent->4, 4->1)
		t.Fatalf("deliveries = %+v", list)
	}
	for _, d := range list {
		if d.Status != "delivered" || d.DeliveredAt == nil {
			t.Fatalf("delivery = %+v", d)
		}
	}
	// One of them needed two attempts.
	if list[0].Attempts+list[1].Attempts != 3 {
		t.Fatalf("attempts = %d + %d", list[0].Attempts, list[1].Attempts)
	}
	got := rcv.last()
	ts, _ := strconv.ParseInt(got.header.Get(HeaderTimestamp), 10, 64)
	if !Verify(w.Secret, ts, got.body, got.header.Get(HeaderSignature)) {
		t.Fatal("signature does not verify")
	}
	if got.header.Get(HeaderWebhook) != w.ID || got.header.Get(HeaderEvent) != "task.updated" || got.header.Get("User-Agent") != "OpenTodo/test" {
		t.Fatalf("headers = %v", got.header)
	}
	var body map[string]any
	_ = json.Unmarshal(got.body, &body)
	if body["id"] != got.header.Get(HeaderDelivery) {
		t.Fatalf("body id %v vs header %s", body["id"], got.header.Get(HeaderDelivery))
	}
}

func TestDeliveriesSurviveRestart(t *testing.T) {
	h := newHarness(t)
	rcv := newReceiver(t, 200)
	w := h.create("u1", rcv.srv.URL, []string{"task.created"}, nil)
	h.apply("u1", setOp("task", "t1", "created_at", `1`))
	if rcv.count() != 0 || h.deliveries(w.ID)[0].Status != "pending" {
		t.Fatal("expected one pending delivery before the restart")
	}
	// "Restart": close the database and open fresh services on the same data dir.
	h.db.Close()
	h.open()
	if n := h.hooks.ProcessDue(context.Background()); n != 1 {
		t.Fatalf("processed %d after restart", n)
	}
	if rcv.count() != 1 || h.deliveries(w.ID)[0].Status != "delivered" {
		t.Fatalf("after restart: %d requests, %+v", rcv.count(), h.deliveries(w.ID))
	}
}

func TestAutoDisableAfter20Failures(t *testing.T) {
	h := newHarness(t)
	rcv := newReceiver(t, 500)
	w := h.create("u1", rcv.srv.URL, []string{"task.created", "task.updated"}, nil)
	for i := 0; i < AutoDisableAfter; i++ {
		h.apply("u1", setOp("task", fmt.Sprintf("t%d", i), "created_at", `1`))
	}
	for step := 0; step < 2*MaxAttempts; step++ {
		h.drain()
		h.clock.Advance(17 * time.Hour)
	}
	got, err := h.hooks.Get(context.Background(), "u1", w.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Enabled || got.DisabledReason == nil || *got.DisabledReason != DisabledTooManyFailures || got.ConsecutiveFailures != AutoDisableAfter {
		t.Fatalf("webhook = %+v", got)
	}
	if rcv.count() != AutoDisableAfter*MaxAttempts {
		t.Fatalf("receiver saw %d requests", rcv.count())
	}
	// No further deliveries are queued while disabled.
	h.apply("u1", setOp("task", "t-late", "title", `"late"`))
	if n := len(h.deliveries(w.ID)); n != AutoDisableAfter {
		t.Fatalf("deliveries after disable = %d", n)
	}
	// Re-enabling clears the reason and the counter.
	on := true
	got, err = h.hooks.Update(context.Background(), "u1", w.ID, Patch{Enabled: &on})
	if err != nil || !got.Enabled || got.DisabledReason != nil || got.ConsecutiveFailures != 0 {
		t.Fatalf("re-enabled = %+v %v", got, err)
	}
}

func TestPruneKeepsNewest100(t *testing.T) {
	h := newHarness(t)
	rcv := newReceiver(t, 200)
	w := h.create("u1", rcv.srv.URL, []string{"task.created"}, nil)
	other := h.create("u1", rcv.srv.URL, []string{"task.created"}, nil)
	now := h.clock.Now().UnixMilli()
	insert := func(webhookID, id, status string, created int64) {
		if _, err := h.db.Exec(`INSERT INTO webhook_deliveries(id,webhook_id,event,payload,status,next_attempt_at,created_at) VALUES(?,?,?,?,?,?,?)`,
			id, webhookID, "task.created", "{}", status, created+1e12, created); err != nil {
			t.Fatal(err)
		}
	}
	for i := 0; i < 150; i++ {
		insert(w.ID, fmt.Sprintf("d%03d", i), "delivered", now-int64(150-i)*1000)
	}
	insert(w.ID, "queued-old-ish", "retry", now-200_000) // beyond 100 but still queued: kept
	insert(other.ID, "ancient", "failed", now-31*24*3600*1000)
	insert(other.ID, "recent", "failed", now-1000)

	if err := h.hooks.Prune(context.Background()); err != nil {
		t.Fatal(err)
	}
	var n int
	_ = h.db.QueryRow(`SELECT COUNT(*) FROM webhook_deliveries WHERE webhook_id=? AND status='delivered'`, w.ID).Scan(&n)
	if n != LogLimit {
		t.Fatalf("kept %d finished deliveries", n)
	}
	var oldest string
	_ = h.db.QueryRow(`SELECT id FROM webhook_deliveries WHERE webhook_id=? AND status='delivered' ORDER BY created_at LIMIT 1`, w.ID).Scan(&oldest)
	if oldest != "d050" {
		t.Fatalf("oldest kept = %s, want d050", oldest)
	}
	var exists int
	_ = h.db.QueryRow(`SELECT COUNT(*) FROM webhook_deliveries WHERE id IN ('queued-old-ish','recent')`).Scan(&exists)
	if exists != 2 {
		t.Fatal("queued or recent deliveries were pruned")
	}
	_ = h.db.QueryRow(`SELECT COUNT(*) FROM webhook_deliveries WHERE id='ancient'`).Scan(&exists)
	if exists != 0 {
		t.Fatal("deliveries older than 30 days must be pruned")
	}
	if got := len(h.deliveries(w.ID)); got != LogLimit {
		t.Fatalf("log shows %d entries", got)
	}
}

func TestProjectFilterSkipsOtherProjects(t *testing.T) {
	h := newHarness(t)
	rcv := newReceiver(t, 200)
	p := "P"
	w := h.create("u1", rcv.srv.URL, []string{"task.created", "task.updated", "project.updated"}, &p)
	h.apply("u1", setOp("task", "inQ", "created_at", `1`), setOp("task", "inQ", "project_id", `"Q"`))
	h.apply("u1", setOp("task", "inbox", "created_at", `1`))
	h.apply("u1", setOp("project", "Q", "name", `"Q"`))
	if n := len(h.deliveries(w.ID)); n != 0 {
		t.Fatalf("deliveries for other projects: %d", n)
	}
	h.apply("u1", setOp("task", "inP", "created_at", `1`), setOp("task", "inP", "project_id", `"P"`))
	h.apply("u1", setOp("task", "inP", "title", `"renamed"`)) // project only in the stored entity
	h.apply("u1", setOp("task", "inQ", "project_id", `"P"`))  // moved into P
	h.apply("u1", setOp("project", "P", "name", `"P"`))
	list := h.deliveries(w.ID)
	if len(list) != 4 {
		t.Fatalf("deliveries = %d, want 4", len(list))
	}
}

func TestDisabledWebhookGetsNoDeliveries(t *testing.T) {
	h := newHarness(t)
	rcv := newReceiver(t, 200)
	off := false
	url := rcv.srv.URL
	w, err := h.hooks.Create(context.Background(), "u1", Patch{URL: &url, Events: []string{"task.created"}, EventsSet: true, Enabled: &off})
	if err != nil {
		t.Fatal(err)
	}
	unsubscribed := h.create("u1", rcv.srv.URL, []string{"task.completed"}, nil)
	otherUser := h.create("u2", rcv.srv.URL, []string{"task.created"}, nil)
	h.apply("u1", setOp("task", "t1", "created_at", `1`))
	if len(h.deliveries(w.ID)) != 0 || len(h.deliveries(unsubscribed.ID)) != 0 || len(h.deliveries(otherUser.ID)) != 0 {
		t.Fatal("disabled, unsubscribed or other users' webhooks received a delivery")
	}
	h.drain()
	if rcv.count() != 0 {
		t.Fatalf("receiver saw %d requests", rcv.count())
	}
}

func TestStaleOpEmitsNoEvent(t *testing.T) {
	h := newHarness(t)
	rcv := newReceiver(t, 200)
	w := h.create("u1", rcv.srv.URL, Events, nil)
	h.apply("u1", opsync.Op{ID: "new", Entity: "task", EntityID: "t1", Field: "title", Value: json.RawMessage(`"new"`), TS: 5000, Device: "laptop"})
	before := len(h.deliveries(w.ID))
	h.apply("u1", opsync.Op{ID: "old", Entity: "task", EntityID: "t1", Field: "title", Value: json.RawMessage(`"old"`), TS: 4000, Device: "phone"})
	if after := len(h.deliveries(w.ID)); after != before {
		t.Fatalf("stale op queued %d deliveries", after-before)
	}
}

func TestPingAndRedeliver(t *testing.T) {
	h := newHarness(t)
	rcv := newReceiver(t, 500, 200)
	w := h.create("u1", rcv.srv.URL, []string{"task.created"}, nil)

	// The ping goes out immediately, once, and is logged.
	d, err := h.hooks.Test(context.Background(), "u1", w.ID)
	if err != nil {
		t.Fatal(err)
	}
	if d.Event != EventPing || d.Status != "failed" || *d.StatusCode != 500 || d.Attempts != 1 || d.DurationMs == nil || *d.ResponseExcerpt != "answered 500" {
		t.Fatalf("ping = %+v", d)
	}
	var body map[string]any
	_ = json.Unmarshal(rcv.last().body, &body)
	if body["event"] != "ping" || len(body["data"].(map[string]any)) != 0 {
		t.Fatalf("ping body = %v", body)
	}
	firstBody := rcv.last().body

	// Redelivery: same body except the id, new delivery row, sent by the worker.
	re, err := h.hooks.Redeliver(context.Background(), "u1", w.ID, d.ID)
	if err != nil {
		t.Fatal(err)
	}
	if re.ID == d.ID || re.Status != "pending" {
		t.Fatalf("redelivery = %+v", re)
	}
	h.drain()
	var first, second map[string]any
	_ = json.Unmarshal(firstBody, &first)
	_ = json.Unmarshal(rcv.last().body, &second)
	if second["id"] != re.ID || first["id"] == second["id"] || first["time"] != second["time"] || first["event"] != second["event"] {
		t.Fatalf("first %v second %v", first, second)
	}
	if got := h.deliveries(w.ID); len(got) != 2 || got[0].ID != re.ID || got[0].Status != "delivered" {
		t.Fatalf("log = %+v", got)
	}
	// Pings never count toward auto-disable.
	got, _ := h.hooks.Get(context.Background(), "u1", w.ID)
	if got.ConsecutiveFailures != 0 {
		t.Fatalf("consecutive_failures = %d", got.ConsecutiveFailures)
	}

	// Unknown delivery ids and other users' webhooks are not found.
	if _, err := h.hooks.Redeliver(context.Background(), "u1", w.ID, "nope"); err != ErrNotFound {
		t.Fatalf("unknown delivery: %v", err)
	}
	if _, err := h.hooks.Redeliver(context.Background(), "u2", w.ID, d.ID); err != ErrNotFound {
		t.Fatalf("foreign webhook: %v", err)
	}
}

func TestHostTurnsPrivateMarksFailed(t *testing.T) {
	h := newHarness(t)
	rcv := newReceiver(t, 200)
	w := h.create("u1", rcv.srv.URL, []string{"task.created"}, nil)
	if err := h.hooks.SetAllowPrivate(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	h.apply("u1", setOp("task", "t1", "created_at", `1`))
	h.drain()
	d := h.deliveries(w.ID)[0]
	if d.Status != "failed" || d.Error == nil || *d.Error != "private_target" || d.StatusCode != nil || rcv.count() != 0 {
		t.Fatalf("delivery = %+v, receiver hits %d", d, rcv.count())
	}
}

func TestWorkerWakesOnEnqueue(t *testing.T) {
	h := newHarness(t)
	rcv := newReceiver(t, 200)
	h.create("u1", rcv.srv.URL, []string{"task.created"}, nil)
	never := make(chan time.Time) // the poll timer never fires: only the wake-up can start a pass
	h.hooks.after = func(time.Duration) <-chan time.Time { return never }
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { h.hooks.Run(ctx); close(done) }()
	h.apply("u1", setOp("task", "t1", "created_at", `1`))
	deadline := time.Now().Add(5 * time.Second)
	for rcv.count() == 0 && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	cancel()
	<-done
	if rcv.count() != 1 {
		t.Fatalf("receiver saw %d requests", rcv.count())
	}
}

func TestCreateValidation(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	bad := []Patch{
		{},
		{URL: ptr("ftp://example.com"), Events: []string{"task.created"}},
		{URL: ptr("https://example.com"), Events: nil},
		{URL: ptr("https://example.com"), Events: []string{"task.exploded"}},
	}
	for i, p := range bad {
		if _, err := h.hooks.Create(ctx, "u1", p); err == nil || !isInvalid(err) {
			t.Errorf("case %d: err = %v", i, err)
		}
	}
	if err := h.hooks.SetAllowPrivate(ctx, false); err != nil {
		t.Fatal(err)
	}
	if _, err := h.hooks.Create(ctx, "u1", Patch{URL: ptr("http://192.168.1.10:8123/api/webhook/x"), Events: []string{"task.completed"}}); err != ErrPrivateTarget {
		t.Fatalf("private target: %v", err)
	}
	for i := 0; i < MaxWebhooksPerUser; i++ {
		if _, err := h.hooks.Create(ctx, "u1", Patch{URL: ptr("https://93.184.216.34/hook"), Events: []string{"task.completed"}}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := h.hooks.Create(ctx, "u1", Patch{URL: ptr("https://93.184.216.34/hook"), Events: []string{"task.completed"}}); err != ErrLimit {
		t.Fatalf("limit: %v", err)
	}
	list, _ := h.hooks.List(ctx, "u1")
	for _, w := range list {
		if w.Secret != "" {
			t.Fatal("list leaks the secret")
		}
	}
}

func TestPolicySeedsOnce(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	if _, err := h.db.Exec(`DELETE FROM settings`); err != nil {
		t.Fatal(err)
	}
	yes, no := true, false
	_ = h.hooks.SeedAllowPrivate(ctx, nil)
	if h.hooks.AllowPrivate(ctx) {
		t.Fatal("default must be false")
	}
	_ = h.hooks.SeedAllowPrivate(ctx, &yes)
	if !h.hooks.AllowPrivate(ctx) {
		t.Fatal("preset not applied")
	}
	_ = h.hooks.SetAllowPrivate(ctx, false)
	_ = h.hooks.SeedAllowPrivate(ctx, &yes)
	if h.hooks.AllowPrivate(ctx) {
		t.Fatal("preset overrode the owner's choice")
	}
	_ = h.hooks.SeedAllowPrivate(ctx, &no)
	if h.hooks.AllowPrivate(ctx) {
		t.Fatal("unexpected")
	}
}

func ptr[T any](v T) *T { return &v }

func isInvalid(err error) bool {
	for e := err; e != nil; {
		if e == ErrInvalid {
			return true
		}
		u, ok := e.(interface{ Unwrap() error })
		if !ok {
			return false
		}
		e = u.Unwrap()
	}
	return false
}
