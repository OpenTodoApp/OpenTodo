package push

import (
	"context"
	"crypto/ecdh"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	gosync "sync"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/backup"
	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// fakePushService is a push endpoint that decrypts what it receives with the
// device's private key, the way a browser would.
type fakePushService struct {
	t      *testing.T
	srv    *httptest.Server
	mu     gosync.Mutex
	got    []Payload
	raws   []string
	auths  []string
	status int
	ua     *ecdh.PrivateKey
	secret []byte
}

func newFakePush(t *testing.T) *fakePushService {
	f := &fakePushService{t: t, status: http.StatusCreated, secret: []byte("0123456789abcdef")}
	f.ua, _ = ecdh.P256().GenerateKey(nil)
	f.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		f.mu.Lock()
		defer f.mu.Unlock()
		if f.status >= 300 {
			w.WriteHeader(f.status)
			return
		}
		if r.Header.Get("Content-Encoding") != "aes128gcm" || r.Header.Get("TTL") == "" {
			t.Errorf("headers = %v", r.Header)
		}
		plain, err := decryptForTest(body, f.ua, f.secret)
		if err != nil {
			t.Errorf("decrypt: %v", err)
		}
		var p Payload
		if err := json.Unmarshal(plain, &p); err != nil {
			t.Errorf("payload %q: %v", plain, err)
		}
		f.got = append(f.got, p)
		f.raws = append(f.raws, string(plain))
		f.auths = append(f.auths, r.Header.Get("Authorization"))
		w.WriteHeader(f.status)
	}))
	t.Cleanup(f.srv.Close)
	return f
}

func (f *fakePushService) input(device string, include bool) SubscriptionInput {
	var in SubscriptionInput
	in.DeviceID = device
	in.Endpoint = f.srv.URL + "/push/" + device
	in.Keys.P256DH = base64.RawURLEncoding.EncodeToString(f.ua.PublicKey().Bytes())
	in.Keys.Auth = base64.RawURLEncoding.EncodeToString(f.secret)
	in.IncludeContent = include
	return in
}

func (f *fakePushService) received() []Payload {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]Payload(nil), f.got...)
}

type testEnv struct {
	db    *sql.DB
	dir   string
	sync  *opsync.Service
	clock *time.Time
	seq   int64
}

func newTestEnv(t *testing.T) *testEnv {
	t.Helper()
	dir := t.TempDir()
	db, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if _, err := db.Exec(`INSERT INTO users(id,email,password_hash,role,created_at) VALUES('u1','a@example.com','x','owner',1),('u2','b@example.com','x','member',1)`); err != nil {
		t.Fatal(err)
	}
	now := time.UnixMilli(1_791_000_000_000)
	return &testEnv{db: db, dir: dir, sync: opsync.NewService(db), clock: &now}
}

func (e *testEnv) service() *Service {
	return New(e.db, e.sync, e.dir, Options{AllowHTTP: true, Client: http.DefaultClient, Now: func() time.Time { return *e.clock }})
}

func (e *testEnv) apply(t *testing.T, user string, fields map[string]map[string]any) {
	t.Helper()
	var ops []opsync.Op
	i := 0
	e.seq++ // later applies win over earlier ones at the same clock reading
	for key, f := range fields {
		entity, id, _ := strings.Cut(key, ":")
		for field, v := range f {
			raw, _ := json.Marshal(v)
			i++
			ops = append(ops, opsync.Op{ID: fmt.Sprintf("%s-%s-%s-%d-%d", key, field, user, e.seq, e.clock.UnixNano()+int64(i)), Entity: entity, EntityID: id, Field: field, Value: raw, TS: e.clock.UnixMilli() + e.seq, Device: "devA"})
		}
	}
	if _, err := e.sync.Apply(context.Background(), user, ops); err != nil {
		t.Fatal(err)
	}
}

func (e *testEnv) reminder(t *testing.T, user, id, task string, fireAt int64) {
	e.apply(t, user, map[string]map[string]any{
		"reminder:" + id: {"task_id": task, "kind": "absolute", "fire_at": fireAt, "delivered_at": nil, "dismissed_at": nil, "deleted_at": nil},
	})
}

func TestPushSubscriptionUpsertReplacesDevice(t *testing.T) {
	e := newTestEnv(t)
	s := e.service()
	f := newFakePush(t)
	ctx := context.Background()
	sub, created, err := s.Upsert(ctx, "u1", "", f.input("phone", false))
	if err != nil || !created {
		t.Fatalf("first upsert: %v created=%v", err, created)
	}
	in := f.input("phone", true)
	in.Endpoint = f.srv.URL + "/push/rotated"
	again, created, err := s.Upsert(ctx, "u1", "", in)
	if err != nil || created {
		t.Fatalf("second upsert: %v created=%v", err, created)
	}
	if again.ID != sub.ID || again.Endpoint != in.Endpoint || !again.IncludeContent {
		t.Fatalf("replacement = %+v", again)
	}
	list, _ := s.ListByUser(ctx, "u1")
	if len(list) != 1 {
		t.Fatalf("subscriptions = %d, want one per device", len(list))
	}
	// Another device and another user are separate rows.
	if _, _, err := s.Upsert(ctx, "u1", "", f.input("laptop", false)); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.Upsert(ctx, "u2", "", f.input("phone", false)); err != nil {
		t.Fatal(err)
	}
	if list, _ = s.ListByUser(ctx, "u1"); len(list) != 2 {
		t.Fatalf("u1 subscriptions = %d", len(list))
	}
	// Delete is scoped to the owner.
	if err := s.Delete(ctx, "u2", sub.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("foreign delete err = %v", err)
	}
	if err := s.Delete(ctx, "u1", sub.ID); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.SubscriptionForDevice(ctx, "u1", "phone"); got != nil {
		t.Fatal("subscription still present after delete")
	}
	// Validation.
	bad := f.input("x", false)
	bad.Keys.Auth = ""
	if _, _, err := s.Upsert(ctx, "u1", "", bad); !errors.Is(err, ErrInvalidSubscription) {
		t.Fatalf("missing auth err = %v", err)
	}
	bad = f.input("x", false)
	bad.Endpoint = ""
	if _, _, err := s.Upsert(ctx, "u1", "", bad); !errors.Is(err, ErrInvalidSubscription) {
		t.Fatalf("missing endpoint err = %v", err)
	}
	strict := New(e.db, e.sync, e.dir, Options{})
	if _, _, err := strict.Upsert(ctx, "u1", "", f.input("y", false)); !errors.Is(err, ErrInvalidSubscription) {
		t.Fatalf("plain http endpoint accepted without AllowHTTP: %v", err)
	}
}

func TestSchedulerDeliversOnceAcrossRestart(t *testing.T) {
	e := newTestEnv(t)
	f := newFakePush(t)
	ctx := context.Background()
	s := e.service()
	if _, _, err := s.Upsert(ctx, "u1", "", f.input("phone", false)); err != nil {
		t.Fatal(err)
	}
	now := e.clock.UnixMilli()
	e.apply(t, "u1", map[string]map[string]any{
		"task:t1":   {"title": "Call the dentist", "description": "secret notes", "completed_at": nil, "deleted_at": nil},
		"task:done": {"title": "Done already", "completed_at": now - 5000},
	})
	e.reminder(t, "u1", "r-due", "t1", now-60_000)        // fell due while the server was down
	e.reminder(t, "u1", "r-future", "t1", now+10*60_000)  // not yet
	e.reminder(t, "u1", "r-done", "done", now-60_000)     // completed task
	e.reminder(t, "u1", "r-dismissed", "t1", now-120_000) // dismissed below
	e.apply(t, "u1", map[string]map[string]any{"reminder:r-dismissed": {"dismissed_at": now - 1000}})

	n, err := s.Tick(ctx)
	if err != nil || n != 1 {
		t.Fatalf("first tick recorded %d, %v", n, err)
	}
	if got := f.received(); len(got) != 1 || got[0].ReminderID != "r-due" || got[0].TaskID != "t1" || got[0].FireAt != now-60_000 {
		t.Fatalf("pushed = %+v", got)
	}
	r, _ := e.sync.Get(ctx, "u1", "reminder", "r-due")
	if string(r["delivered_at"]) != fmt.Sprint(now) {
		t.Fatalf("delivered_at = %s", r["delivered_at"])
	}
	// The delivery is an op authored by the server, so devices learn it fired.
	ops, _, _, _ := e.sync.Pull(ctx, "u1", 0, "", 1000)
	var server int
	for _, o := range ops {
		if o.Device == "server" && o.Field == "delivered_at" && o.EntityID == "r-due" {
			server++
		}
	}
	if server != 1 {
		t.Fatalf("server delivered_at ops = %d", server)
	}

	// A restart: a new Service over the same data directory does not push again.
	s2 := e.service()
	if n, err := s2.Tick(ctx); err != nil || n != 0 {
		t.Fatalf("tick after restart recorded %d, %v", n, err)
	}
	if got := f.received(); len(got) != 1 {
		t.Fatalf("pushed again after restart: %+v", got)
	}

	// Time passes: the future one fires; a snooze of the delivered one fires again.
	*e.clock = e.clock.Add(11 * time.Minute)
	later := e.clock.UnixMilli()
	e.apply(t, "u1", map[string]map[string]any{"reminder:r-due": {"fire_at": later - 1000, "delivered_at": nil}})
	if n, err := s2.Tick(ctx); err != nil || n != 2 {
		t.Fatalf("later tick recorded %d, %v", n, err)
	}
	if got := f.received(); len(got) != 3 {
		t.Fatalf("pushed = %+v", got)
	}

	// A snooze whose delivered_at clear loses to the server's op still fires:
	// a delivery older than fire_at belongs to the earlier firing.
	*e.clock = e.clock.Add(time.Minute)
	e.apply(t, "u1", map[string]map[string]any{"reminder:r-future": {"fire_at": e.clock.UnixMilli() - 10}})
	if n, _ := s2.Tick(ctx); n != 1 {
		t.Fatalf("re-fired %d, want 1", n)
	}
	if got := f.received(); len(got) != 4 || got[3].ReminderID != "r-future" {
		t.Fatalf("pushed = %+v", got)
	}
}

func TestPayloadOmitsContentByDefault(t *testing.T) {
	e := newTestEnv(t)
	plain, withTitle := newFakePush(t), newFakePush(t)
	ctx := context.Background()
	s := e.service()
	if _, _, err := s.Upsert(ctx, "u1", "", plain.input("phone", false)); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.Upsert(ctx, "u1", "", withTitle.input("laptop", true)); err != nil {
		t.Fatal(err)
	}
	now := e.clock.UnixMilli()
	e.apply(t, "u1", map[string]map[string]any{"task:t1": {"title": "Call the dentist", "description": "Ask about the crown"}})
	e.reminder(t, "u1", "r1", "t1", now-1)
	if n, err := s.Tick(ctx); err != nil || n != 1 {
		t.Fatalf("tick = %d, %v", n, err)
	}
	a, b := plain.received(), withTitle.received()
	if len(a) != 1 || len(b) != 1 {
		t.Fatalf("received %d and %d", len(a), len(b))
	}
	if a[0].Title != "" || a[0].ReminderID != "r1" || a[0].TaskID != "t1" || a[0].FireAt != now-1 {
		t.Fatalf("default payload = %+v", a[0])
	}
	if b[0].Title != "Call the dentist" {
		t.Fatalf("opt-in payload = %+v", b[0])
	}
	raw := string(BuildPayload("r1", "t1", 5, "Call the dentist", false))
	if strings.Contains(raw, "dentist") || strings.Contains(raw, "crown") {
		t.Fatalf("payload leaks content: %s", raw)
	}
	if raw := string(BuildPayload("r1", "t1", 5, "Call", true)); strings.Contains(raw, "description") {
		t.Fatalf("payload carries a description field: %s", raw)
	}
	// Each request carries a VAPID authorization for the endpoint's origin.
	if !strings.HasPrefix(plain.auths[0], "vapid t=") {
		t.Fatalf("authorization = %q", plain.auths[0])
	}
}

// TestPayloadNeverCarriesCiphertext: an end-to-end encrypted title (OpenSpec
// e2ee) is not pushed even to a device that opted in to content.
func TestPayloadNeverCarriesCiphertext(t *testing.T) {
	e := newTestEnv(t)
	withTitle := newFakePush(t)
	ctx := context.Background()
	s := e.service()
	if _, _, err := s.Upsert(ctx, "u1", "", withTitle.input("laptop", true)); err != nil {
		t.Fatal(err)
	}
	now := e.clock.UnixMilli()
	e.apply(t, "u1", map[string]map[string]any{"task:t1": {"title": "enc:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}})
	e.reminder(t, "u1", "r1", "t1", now-1)
	if n, err := s.Tick(ctx); err != nil || n != 1 {
		t.Fatalf("tick = %d, %v", n, err)
	}
	if got := withTitle.received(); len(got) != 1 || got[0].Title != "" || got[0].TaskID != "t1" {
		t.Fatalf("payload = %+v", got)
	}
}

func TestGoneSubscriptionIsRemoved(t *testing.T) {
	e := newTestEnv(t)
	gone, flaky, ok := newFakePush(t), newFakePush(t), newFakePush(t)
	gone.status = http.StatusGone
	flaky.status = http.StatusInternalServerError
	ctx := context.Background()
	s := e.service()
	g, _, _ := s.Upsert(ctx, "u1", "", gone.input("old-phone", false))
	fl, _, _ := s.Upsert(ctx, "u1", "", flaky.input("flaky", false))
	good, _, _ := s.Upsert(ctx, "u1", "", ok.input("laptop", false))
	now := e.clock.UnixMilli()
	e.apply(t, "u1", map[string]map[string]any{"task:t1": {"title": "x"}})
	e.reminder(t, "u1", "r1", "t1", now-1)
	if _, err := s.Tick(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := s.subscription(ctx, "u1", g.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("gone subscription still stored: %v", err)
	}
	f, _ := s.subscription(ctx, "u1", fl.ID)
	if f.Failures != 1 || f.LastError == "" || f.LastOKAt != nil {
		t.Fatalf("flaky subscription = %+v", f)
	}
	gd, _ := s.subscription(ctx, "u1", good.ID)
	if gd.LastOKAt == nil || *gd.LastOKAt != now || gd.Failures != 0 {
		t.Fatalf("good subscription = %+v", gd)
	}
	// After RenewAfterFailures consecutive failures the device is asked to renew.
	for i := 1; i < RenewAfterFailures; i++ {
		_ = s.RecordFailure(ctx, fl.ID, "x")
	}
	f, _ = s.subscription(ctx, "u1", fl.ID)
	if !f.Public().NeedsRenewal {
		t.Fatalf("needsRenewal false after %d failures", f.Failures)
	}
	// Endpoints and keys never appear in the public form.
	raw, _ := json.Marshal(f.Public())
	if strings.Contains(string(raw), "push/") || strings.Contains(string(raw), f.P256DH) {
		t.Fatalf("public subscription leaks endpoint or keys: %s", raw)
	}
}

func TestAllFailedSendsAreRetried(t *testing.T) {
	e := newTestEnv(t)
	down := newFakePush(t)
	down.status = http.StatusServiceUnavailable
	ctx := context.Background()
	s := e.service()
	_, _, _ = s.Upsert(ctx, "u1", "", down.input("phone", false))
	now := e.clock.UnixMilli()
	e.apply(t, "u1", map[string]map[string]any{"task:t1": {"title": "x"}})
	e.reminder(t, "u1", "r1", "t1", now-1)
	if n, _ := s.Tick(ctx); n != 0 {
		t.Fatalf("recorded %d while the push service is down", n)
	}
	*e.clock = e.clock.Add(RetryWindow + time.Minute)
	if n, _ := s.Tick(ctx); n != 1 {
		t.Fatalf("recorded %d after the retry window", n)
	}
}

// The key file must travel with backup archives (spec: restore keeps subscriptions working).
func TestKeyFileIsBackedUp(t *testing.T) {
	for _, f := range backup.ExtraFiles {
		if f == KeyFile {
			return
		}
	}
	t.Fatalf("backup.ExtraFiles %v does not include %s", backup.ExtraFiles, KeyFile)
}

// A reminder on a task whose project, or an ancestor project, is in the Trash is
// not delivered and not recorded; after a restore it is delivered once, even
// though its firing time passed while the project was trashed.
func TestSchedulerSkipsTrashedProjects(t *testing.T) {
	e := newTestEnv(t)
	f := newFakePush(t)
	ctx := context.Background()
	s := e.service()
	if _, _, err := s.Upsert(ctx, "u1", "", f.input("phone", false)); err != nil {
		t.Fatal(err)
	}
	now := e.clock.UnixMilli()
	e.apply(t, "u1", map[string]map[string]any{
		"project:home":   {"name": "Home", "parent_id": nil, "deleted_at": now - 10_000},
		"project:garden": {"name": "Garden", "parent_id": "home", "deleted_at": nil},
		"project:work":   {"name": "Work", "parent_id": nil, "deleted_at": now - 10_000},
		"task:direct":    {"title": "In trashed project", "project_id": "work", "completed_at": nil, "deleted_at": nil},
		"task:nested":    {"title": "Under trashed ancestor", "project_id": "garden", "completed_at": nil, "deleted_at": nil},
		"task:gone":      {"title": "Deleted task", "project_id": nil, "completed_at": nil, "deleted_at": now - 10_000},
		"task:inbox":     {"title": "Inbox task", "project_id": nil, "completed_at": nil, "deleted_at": nil},
	})
	e.reminder(t, "u1", "r-direct", "direct", now-60_000)
	e.reminder(t, "u1", "r-nested", "nested", now-60_000)
	e.reminder(t, "u1", "r-gone", "gone", now-60_000)
	e.reminder(t, "u1", "r-inbox", "inbox", now-60_000)

	if n, err := s.Tick(ctx); err != nil || n != 1 {
		t.Fatalf("tick recorded %d, %v", n, err)
	}
	if got := f.received(); len(got) != 1 || got[0].ReminderID != "r-inbox" {
		t.Fatalf("pushed = %+v", got)
	}
	for _, id := range []string{"r-direct", "r-nested", "r-gone"} {
		r, _ := e.sync.Get(ctx, "u1", "reminder", id)
		if string(r["delivered_at"]) != "null" {
			t.Fatalf("%s delivered_at = %s, want null", id, r["delivered_at"])
		}
	}
	// Still trashed a minute later: nothing.
	*e.clock = e.clock.Add(time.Minute)
	if n, _ := s.Tick(ctx); n != 0 {
		t.Fatalf("trashed reminders recorded %d", n)
	}
	// Restoring the ancestor and the direct project delivers both once, late.
	e.apply(t, "u1", map[string]map[string]any{"project:home": {"deleted_at": nil}, "project:work": {"deleted_at": nil}})
	if n, err := s.Tick(ctx); err != nil || n != 2 {
		t.Fatalf("tick after restore recorded %d, %v", n, err)
	}
	if got := f.received(); len(got) != 3 {
		t.Fatalf("pushed = %+v", got)
	}
	if n, _ := s.Tick(ctx); n != 0 {
		t.Fatalf("delivered again: %d", n)
	}
}

// A cycle in the project tree (concurrent moves) does not hang the walk.
func TestSchedulerProjectCycle(t *testing.T) {
	e := newTestEnv(t)
	f := newFakePush(t)
	ctx := context.Background()
	s := e.service()
	if _, _, err := s.Upsert(ctx, "u1", "", f.input("phone", false)); err != nil {
		t.Fatal(err)
	}
	now := e.clock.UnixMilli()
	e.apply(t, "u1", map[string]map[string]any{
		"project:a": {"name": "A", "parent_id": "b", "deleted_at": nil},
		"project:b": {"name": "B", "parent_id": "a", "deleted_at": nil},
		"task:t":    {"title": "T", "project_id": "a", "completed_at": nil, "deleted_at": nil},
	})
	e.reminder(t, "u1", "r", "t", now-1000)
	if n, err := s.Tick(ctx); err != nil || n != 1 {
		t.Fatalf("tick recorded %d, %v", n, err)
	}
}

// push-test-delivery D1: a test push goes through Send with no task data and
// updates the same delivery bookkeeping as a reminder.
func TestSendTest(t *testing.T) {
	e := newTestEnv(t)
	ctx := context.Background()
	s := e.service()
	ok := newFakePush(t)
	sub, _, _ := s.Upsert(ctx, "u1", "", ok.input("laptop", true))
	id, res, err := s.SendTest(ctx, sub)
	if err != nil || res != Sent || id == "" {
		t.Fatalf("SendTest = %q, %v, %v", id, res, err)
	}
	raws := ok.raws
	if len(raws) != 1 {
		t.Fatalf("pushes = %d", len(raws))
	}
	var p map[string]any
	_ = json.Unmarshal([]byte(raws[0]), &p)
	if p["type"] != "test" || p["testId"] != id || p["sentAt"] == nil || len(p) != 3 {
		t.Fatalf("payload = %s", raws[0])
	}
	got, _ := s.subscription(ctx, "u1", sub.ID)
	if got.LastOKAt == nil || *got.LastOKAt != e.clock.UnixMilli() {
		t.Fatalf("last delivery not recorded: %+v", got)
	}
	if id2, _, _ := s.SendTest(ctx, sub); id2 == id {
		t.Fatal("test ids repeat")
	}

	gone := newFakePush(t)
	gone.status = http.StatusGone
	g, _, _ := s.Upsert(ctx, "u1", "", gone.input("old-phone", false))
	if _, res, _ := s.SendTest(ctx, g); res != Gone {
		t.Fatalf("gone result = %v", res)
	}
	if _, err := s.subscription(ctx, "u1", g.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("gone subscription kept: %v", err)
	}

	down := newFakePush(t)
	down.status = http.StatusInternalServerError
	d, _, _ := s.Upsert(ctx, "u1", "", down.input("flaky", false))
	if _, res, err := s.SendTest(ctx, d); res != Failed || err == nil {
		t.Fatalf("failed result = %v, %v", res, err)
	}
	if f, _ := s.subscription(ctx, "u1", d.ID); f.Failures != 1 || f.LastError == "" {
		t.Fatalf("failure not counted: %+v", f)
	}
}
