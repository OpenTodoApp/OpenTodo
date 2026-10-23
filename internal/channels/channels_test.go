package channels

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/notify"
	"github.com/pixari/opentodo/internal/store"
	"github.com/pixari/opentodo/internal/webhook"
)

type fakeClock struct {
	mu sync.Mutex
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

// receiver records requests and answers with the queued codes (200 after).
type receiver struct {
	mu    sync.Mutex
	codes []int
	reqs  []recorded
	srv   *httptest.Server
}

type recorded struct {
	path, query string
	header      http.Header
	body        []byte
}

func newReceiver(t *testing.T, codes ...int) *receiver {
	r := &receiver{codes: codes}
	r.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		b, _ := io.ReadAll(req.Body)
		r.mu.Lock()
		r.reqs = append(r.reqs, recorded{req.URL.Path, req.URL.RawQuery, req.Header.Clone(), b})
		code := 200
		if len(r.codes) > 0 {
			code, r.codes = r.codes[0], r.codes[1:]
		}
		r.mu.Unlock()
		w.WriteHeader(code)
		_, _ = w.Write([]byte(`{"error":"nope"}`))
	}))
	t.Cleanup(r.srv.Close)
	return r
}

func (r *receiver) all() []recorded {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]recorded(nil), r.reqs...)
}

type harness struct {
	t         *testing.T
	dir       string
	db        *sql.DB
	svc       *Service
	clock     *fakeClock
	recv      *receiver
	encrypted map[string]bool
	on        bool
}

func newHarness(t *testing.T, codes ...int) *harness {
	t.Helper()
	h := &harness{t: t, dir: t.TempDir(), clock: &fakeClock{t: time.UnixMilli(1_760_000_000_000)}, encrypted: map[string]bool{}, on: true}
	db, err := store.Open(h.dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	h.db = db
	if _, err := db.Exec(`INSERT INTO users(id,email,password_hash,role,created_at) VALUES('u1','u1@example.com','x','owner',1),('u2','u2@example.com','x','member',1)`); err != nil {
		t.Fatal(err)
	}
	h.recv = newReceiver(t, codes...)
	h.open(true)
	return h
}

// open (re)builds the service, as a server start would. allowPrivate lets the
// loopback receiver through.
func (h *harness) open(allowPrivate bool) {
	h.svc = New(h.db, h.dir, Options{Version: "test", Log: slog.New(slog.NewTextHandler(io.Discard, nil)), Now: h.clock.Now,
		Rand: func() float64 { return 0.5 }, AllowPrivate: func(context.Context) bool { return allowPrivate },
		Enabled:     func(context.Context) bool { return h.on },
		Encrypted:   func(_ context.Context, uid string) (bool, error) { return h.encrypted[uid], nil },
		PushoverURL: h.recv.srv.URL + "/1/messages.json", BaseOrigin: "https://todo.example.com"})
}

func ptr[T any](v T) *T { return &v }

func (h *harness) create(userID string, in Input) *Channel {
	h.t.Helper()
	c, _, err := h.svc.Create(context.Background(), userID, in)
	if err != nil {
		h.t.Fatal(err)
	}
	return c
}

func (h *harness) drain() {
	for h.svc.ProcessDue(context.Background()) > 0 {
	}
}

func ntfyInput(server string, events ...string) Input {
	if len(events) == 0 {
		events = Events
	}
	return Input{Kind: ptr(KindNtfy), URL: ptr(server), Topic: ptr("ana-tasks"), Events: &events}
}

func TestValidation(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	cases := []struct {
		in    Input
		field string
	}{
		{Input{Kind: ptr("telegram")}, "kind:"},
		{Input{Kind: ptr(KindNtfy), URL: ptr("https://ntfy.example.com"), Topic: ptr("my topic!")}, "topic:"},
		{Input{Kind: ptr(KindNtfy), URL: ptr("ftp://x"), Topic: ptr("t")}, "url:"},
		{Input{Kind: ptr(KindPushover), Token: ptr("azGDORePK8gMaC0QOYAMyEEuzJnyUi")}, "userKey:"},
		{Input{Kind: ptr(KindPushover), UserKey: ptr("uQiRzpo4DXghDmr9QzzfQu27cmVRsG")}, "token:"},
		{Input{Kind: ptr(KindGotify), URL: ptr("https://gotify.example.com")}, "token:"},
		{Input{Kind: ptr(KindWebhook)}, "url:"},
		{Input{Kind: ptr(KindWebhook), URL: ptr("https://h.example.com"), Events: &[]string{}}, "events:"},
		{Input{Kind: ptr(KindWebhook), URL: ptr("https://h.example.com"), Name: ptr(strings.Repeat("x", 61))}, "name:"},
	}
	for _, c := range cases {
		_, _, err := h.svc.Create(ctx, "u1", c.in)
		if !errors.Is(err, ErrInvalid) || !strings.Contains(err.Error(), c.field) {
			t.Errorf("%+v: got %v, want invalid %s", c.in, err, c.field)
		}
	}
	// A kind cannot change; a channel is the account's alone.
	c := h.create("u1", ntfyInput("https://ntfy.example.com"))
	if _, _, _, err := h.svc.Update(ctx, "u1", c.ID, Input{Kind: ptr(KindGotify)}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("kind change: %v", err)
	}
	if _, err := h.svc.Get(ctx, "u2", c.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("other account: %v", err)
	}
	if c.Name != "ntfy" || c.Enabled != true || c.IncludeTitles || c.TokenSet {
		t.Fatalf("defaults: %+v", c)
	}
	for range MaxPerUser - 1 {
		h.create("u1", ntfyInput("https://ntfy.example.com"))
	}
	if _, _, err := h.svc.Create(ctx, "u1", ntfyInput("https://ntfy.example.com")); !errors.Is(err, ErrLimit) {
		t.Fatalf("sixth: %v", err)
	}
}

type fakeResolver map[string][]netip.Addr

func (f fakeResolver) LookupNetIP(_ context.Context, _, host string) ([]netip.Addr, error) {
	return f[host], nil
}

func TestPrivateTargetRefusedAtCreation(t *testing.T) {
	h := newHarness(t)
	svc := New(h.db, h.dir, Options{Resolver: fakeResolver{"lan.example": {netip.MustParseAddr("192.168.1.20")}},
		AllowPrivate: func(context.Context) bool { return false }})
	_, _, err := svc.Create(context.Background(), "u1", ntfyInput("http://192.168.1.20"))
	if !errors.Is(err, ErrPrivateTarget) {
		t.Fatalf("ip literal: %v", err)
	}
	_, _, err = svc.Create(context.Background(), "u1", ntfyInput("http://lan.example"))
	if !errors.Is(err, ErrPrivateTarget) {
		t.Fatalf("lan host: %v", err)
	}
	allowed := New(h.db, h.dir, Options{AllowPrivate: func(context.Context) bool { return true }})
	if _, _, err := allowed.Create(context.Background(), "u1", ntfyInput("http://192.168.1.20")); err != nil {
		t.Fatalf("allowed: %v", err)
	}
}

func TestSecretsNeverInTheDatabaseOrReads(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	g := h.create("u1", Input{Kind: ptr(KindGotify), URL: ptr(h.recv.srv.URL), Token: ptr("gotify-secret-token")})
	w, secret, err := h.svc.Create(ctx, "u1", Input{Kind: ptr(KindWebhook), URL: ptr(h.recv.srv.URL + "/hook")})
	if err != nil || !strings.HasPrefix(secret, webhook.SecretPrefix) || !w.SecretSet {
		t.Fatalf("webhook secret: %v %q %+v", err, secret, w)
	}
	if !g.TokenSet {
		t.Fatalf("tokenSet: %+v", g)
	}
	var dump strings.Builder
	rows, _ := h.db.Query(`SELECT * FROM notification_channels`)
	cols, _ := rows.Columns()
	for rows.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		_ = rows.Scan(ptrs...)
		for _, v := range vals {
			dump.WriteString(strings.TrimSpace(strings.ReplaceAll(toString(v), "\n", " ")) + "|")
		}
	}
	rows.Close()
	if strings.Contains(dump.String(), "gotify-secret-token") || strings.Contains(dump.String(), secret) {
		t.Fatal("a secret reached the database")
	}
	list, _ := h.svc.List(ctx, "u1")
	raw, _ := json.Marshal(list)
	if strings.Contains(string(raw), "gotify-secret-token") || strings.Contains(string(raw), secret) {
		t.Fatal("a secret reached a read")
	}
	b, err := os.ReadFile(h.svc.SecretsPath())
	if err != nil || !strings.Contains(string(b), "gotify-secret-token") {
		t.Fatalf("secrets file: %v", err)
	}
	// Rotation returns a new secret once; deletion removes the secrets.
	_, rotated, changed, err := h.svc.Update(ctx, "u1", w.ID, Input{RotateSecret: true})
	if err != nil || rotated == "" || rotated == secret || len(changed) != 1 || changed[0] != "secret" {
		t.Fatalf("rotate: %v %q %v", err, rotated, changed)
	}
	if _, err := h.svc.Delete(ctx, "u1", g.ID); err != nil {
		t.Fatal(err)
	}
	b, _ = os.ReadFile(h.svc.SecretsPath())
	if strings.Contains(string(b), "gotify-secret-token") {
		t.Fatal("deleted channel's token kept")
	}
}

func toString(v any) string {
	switch x := v.(type) {
	case nil:
		return ""
	case []byte:
		return string(x)
	case string:
		return x
	case int64:
		return strconv.FormatInt(x, 10)
	}
	return ""
}

func TestContentPolicyAndLanguages(t *testing.T) {
	e := event{kind: EventReminder, key: txtReminder, withKey: txtReminderWith, taskID: "t1", taskTitle: "Call the plumber", at: 5}
	m := e.render("en", "https://todo.example.com", false)
	if m.Title != "OpenTodo" || m.Body != "A reminder is due" || m.URL != "https://todo.example.com/?task=t1" || m.TaskTitle != "" {
		t.Fatalf("titles off: %+v", m)
	}
	if raw, _ := json.Marshal(m); strings.Contains(string(raw), "plumber") {
		t.Fatal("title left with titles off")
	}
	m = e.render("en", "", true)
	if m.Title != "Call the plumber" || m.Body != "Reminder" || m.URL != "" {
		t.Fatalf("titles on: %+v", m)
	}
	if got := e.render("de", "", false).Body; got != "Eine Erinnerung ist fällig" {
		t.Fatalf("German: %q", got)
	}
	if got := e.render("xx", "", false).Body; got != "A reminder is due" {
		t.Fatalf("fallback: %q", got)
	}
	// Ciphertext never leaves, even with titles on.
	enc := event{kind: EventAssigned, key: txtAssigned, withKey: txtAssignedBy, taskID: "t1", taskTitle: "enc:v1:abc", actorName: "Ben", at: 5}
	if m := enc.render("en", "", true); m.Body != "A task was assigned to you" || m.ActorName != "" {
		t.Fatalf("ciphertext: %+v", m)
	}
	mention := event{kind: EventMentioned, key: txtMentioned, withKey: txtMentionedBy, taskID: "t1", taskTitle: "Plan trip", actorName: "Ben", excerpt: "can you book it?"}
	if m := mention.render("en", "", true); m.Body != "Ben mentioned you: can you book it?" {
		t.Fatalf("mention: %q", m.Body)
	}
	for _, lang := range Languages {
		for k := range texts["en"] {
			if texts[lang][k] == "" {
				t.Errorf("%s misses %s", lang, k)
			}
		}
	}
}

func TestSinkQueuesOncePerChannelAndEvent(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	a := h.create("u1", ntfyInput(h.recv.srv.URL, EventAssigned))
	h.create("u1", ntfyInput(h.recv.srv.URL, EventReminder))
	off := h.create("u1", ntfyInput(h.recv.srv.URL, EventAssigned))
	if _, _, _, err := h.svc.Update(ctx, "u1", off.ID, Input{Enabled: ptr(false)}); err != nil {
		t.Fatal(err)
	}
	e := notify.Assigned{AssigneeID: "u1", ActorID: "u2", ActorName: "Ben", TaskID: "t1", TaskTitle: "Fix the lamp", At: 10}
	h.svc.Assigned(ctx, e)
	h.svc.Assigned(ctx, e) // the same event again
	h.drain()
	reqs := h.recv.all()
	if len(reqs) != 1 {
		t.Fatalf("requests: %d", len(reqs))
	}
	var body map[string]any
	_ = json.Unmarshal(reqs[0].body, &body)
	if body["topic"] != "ana-tasks" || body["message"] != "A task was assigned to you" || body["click"] != "https://todo.example.com/?task=t1" {
		t.Fatalf("ntfy body: %v", body)
	}
	if list, _ := h.svc.Deliveries(ctx, "u1", a.ID); len(list) != 1 || list[0].Status != statusDelivered {
		t.Fatalf("log: %+v", list)
	}
}

func TestEncryptedAccountSendsNoContent(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	h.create("u1", Input{Kind: ptr(KindNtfy), URL: ptr(h.recv.srv.URL), Topic: ptr("t"), IncludeTitles: ptr(true), Events: &[]string{EventAssigned}})
	h.encrypted["u1"] = true
	h.svc.Assigned(ctx, notify.Assigned{AssigneeID: "u1", ActorName: "Ben", TaskID: "t1", TaskTitle: "Secret plan", At: 1})
	h.drain()
	reqs := h.recv.all()
	if len(reqs) != 1 || strings.Contains(string(reqs[0].body), "Secret plan") || strings.Contains(string(reqs[0].body), "Ben") {
		t.Fatalf("content left an encrypted account: %v", reqs)
	}
}

func TestKindsRequestShapes(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	evs := &[]string{EventReminder}
	h.create("u1", Input{Kind: ptr(KindNtfy), URL: ptr(h.recv.srv.URL), Topic: ptr("t"), Token: ptr("tk_ntfy"), Events: evs, IncludeTitles: ptr(true)})
	h.create("u1", Input{Kind: ptr(KindPushover), UserKey: ptr("uQiRzpo4DXghDmr9QzzfQu27cmVRsG"), Token: ptr("azGDORePK8gMaC0QOYAMyEEuzJnyUi"), Events: evs})
	h.create("u1", Input{Kind: ptr(KindGotify), URL: ptr(h.recv.srv.URL + "/gotify"), Token: ptr("gotifytoken"), Events: evs})
	_, secret, err := h.svc.Create(ctx, "u1", Input{Kind: ptr(KindWebhook), URL: ptr(h.recv.srv.URL + "/hook"), Events: evs})
	if err != nil {
		t.Fatal(err)
	}
	h.svc.Reminder(ctx, Reminder{UserID: "u1", ID: "r1", TaskID: "t1", FireAt: 100, Title: "Water the plants"})
	h.drain()
	byPath := map[string]recorded{}
	for _, r := range h.recv.all() {
		byPath[r.path] = r
	}
	if r := byPath["/"]; r.header.Get("Authorization") != "Bearer tk_ntfy" || !strings.Contains(string(r.body), `"title":"Water the plants"`) {
		t.Fatalf("ntfy: %v %s", r.header, r.body)
	}
	p := byPath["/1/messages.json"]
	form, _ := url.ParseQuery(string(p.body))
	if form.Get("token") != "azGDORePK8gMaC0QOYAMyEEuzJnyUi" || form.Get("user") != "uQiRzpo4DXghDmr9QzzfQu27cmVRsG" || form.Get("message") != "A reminder is due" || form.Get("priority") != "1" {
		t.Fatalf("pushover: %v", form)
	}
	if g := byPath["/gotify/message"]; g.header.Get("X-Gotify-Key") != "gotifytoken" || !strings.Contains(string(g.body), `"priority":7`) {
		t.Fatalf("gotify: %v %s", g.header, g.body)
	}
	w := byPath["/hook"]
	ts, _ := strconv.ParseInt(w.header.Get(webhook.HeaderTimestamp), 10, 64)
	if !webhook.Verify(secret, ts, w.body, w.header.Get(webhook.HeaderSignature)) || w.header.Get(webhook.HeaderEvent) != "notification.reminder" {
		t.Fatalf("webhook signature: %v", w.header)
	}
	var payload map[string]any
	_ = json.Unmarshal(w.body, &payload)
	if payload["version"] != float64(1) || payload["event"] != "reminder" || payload["body"] != payload["message"] || payload["actor"] != nil {
		t.Fatalf("webhook payload: %v", payload)
	}
	if task, _ := payload["task"].(map[string]any); task["id"] != "t1" || task["title"] != nil {
		t.Fatalf("webhook task: %v", payload["task"])
	}
	// The reminder hook is idempotent per firing.
	h.svc.Reminder(ctx, Reminder{UserID: "u1", ID: "r1", TaskID: "t1", FireAt: 100})
	h.drain()
	if n := len(h.recv.all()); n != 4 {
		t.Fatalf("reminder sent again: %d requests", n)
	}
}

func TestRetryThenSuccessAndAutoDisable(t *testing.T) {
	h := newHarness(t, 503)
	ctx := context.Background()
	c := h.create("u1", ntfyInput(h.recv.srv.URL, EventReminder))
	h.svc.Reminder(ctx, Reminder{UserID: "u1", ID: "r1", TaskID: "t1", FireAt: 1})
	h.drain()
	list, _ := h.svc.Deliveries(ctx, "u1", c.ID)
	if list[0].Status != statusRetry || list[0].LastError == "" {
		t.Fatalf("after 503: %+v", list[0])
	}
	h.clock.Advance(time.Hour)
	h.drain()
	list, _ = h.svc.Deliveries(ctx, "u1", c.ID)
	if list[0].Status != statusDelivered || list[0].Attempts != 2 {
		t.Fatalf("after retry: %+v", list[0])
	}
	// A revoked token: every message fails until the channel turns itself off.
	h.recv.mu.Lock()
	for range 400 {
		h.recv.codes = append(h.recv.codes, 401)
	}
	h.recv.mu.Unlock()
	for i := range AutoDisableAfter + 2 {
		h.svc.Reminder(ctx, Reminder{UserID: "u1", ID: "r" + strconv.Itoa(i+10), TaskID: "t1", FireAt: int64(i + 10)})
		h.clock.Advance(time.Minute)
	}
	for range 8 {
		h.drain()
		h.clock.Advance(20 * time.Hour)
	}
	got, _ := h.svc.Get(ctx, "u1", c.ID)
	if got.Enabled || got.DisabledReason != DisabledFailing {
		t.Fatalf("not disabled: %+v", got)
	}
	// Switching it on again resets the count.
	got, _, _, _ = h.svc.Update(ctx, "u1", c.ID, Input{Enabled: ptr(true)})
	if !got.Enabled || got.Failures != 0 || got.DisabledReason != "" {
		t.Fatalf("re-enabled: %+v", got)
	}
}

func TestHourlyLimitSkips(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	c := h.create("u1", ntfyInput(h.recv.srv.URL, EventAssigned))
	for i := range HourlyLimit + 20 {
		h.svc.Assigned(ctx, notify.Assigned{AssigneeID: "u1", TaskID: "t" + strconv.Itoa(i), At: int64(i)})
	}
	var sent, skipped int
	_ = h.db.QueryRow(`SELECT COUNT(*) FROM notification_deliveries WHERE channel_id=? AND status='pending'`, c.ID).Scan(&sent)
	_ = h.db.QueryRow(`SELECT COUNT(*) FROM notification_deliveries WHERE channel_id=? AND status='skipped' AND last_error='rate_limited'`, c.ID).Scan(&skipped)
	if sent != HourlyLimit || skipped != 20 {
		t.Fatalf("sent %d skipped %d", sent, skipped)
	}
}

func TestPrivateTargetAtSendIsTerminal(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	c := h.create("u1", ntfyInput(h.recv.srv.URL, EventReminder)) // created while private targets were allowed
	h.open(false)
	h.svc.Reminder(ctx, Reminder{UserID: "u1", ID: "r1", TaskID: "t1", FireAt: 1})
	h.drain()
	list, _ := h.svc.Deliveries(ctx, "u1", c.ID)
	if list[0].Status != statusFailed || list[0].LastError != "private_target" || len(h.recv.all()) != 0 {
		t.Fatalf("private target: %+v", list[0])
	}
}

func TestOwnerSwitchOffQueuesNothing(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	c := h.create("u1", ntfyInput(h.recv.srv.URL, EventReminder))
	h.on = false
	h.svc.Reminder(ctx, Reminder{UserID: "u1", ID: "r1", TaskID: "t1", FireAt: 1})
	if list, _ := h.svc.Deliveries(ctx, "u1", c.ID); len(list) != 0 {
		t.Fatalf("queued while off: %+v", list)
	}
}

func TestQueueSurvivesRestartWithoutDuplicates(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	h.create("u1", ntfyInput(h.recv.srv.URL, EventReminder))
	h.svc.Reminder(ctx, Reminder{UserID: "u1", ID: "r1", TaskID: "t1", FireAt: 1})
	h.open(true) // restart before the worker ran
	h.svc.Reminder(ctx, Reminder{UserID: "u1", ID: "r1", TaskID: "t1", FireAt: 1})
	h.drain()
	h.drain()
	if n := len(h.recv.all()); n != 1 {
		t.Fatalf("requests after restart: %d", n)
	}
}

func TestSendTest(t *testing.T) {
	h := newHarness(t, 400)
	ctx := context.Background()
	c := h.create("u1", Input{Kind: ptr(KindPushover), UserKey: ptr("uQiRzpo4DXghDmr9QzzfQu27cmVRsG"), Token: ptr("azGDORePK8gMaC0QOYAMyEEuzJnyUi")})
	res, err := h.svc.Test(ctx, "u1", c.ID)
	if err != nil || res.Delivered || res.StatusCode != 400 || strings.Contains(res.Error, "azGDORe") {
		t.Fatalf("failed test: %+v %v", res, err)
	}
	res, err = h.svc.Test(ctx, "u1", c.ID)
	if err != nil || !res.Delivered {
		t.Fatalf("test: %+v %v", res, err)
	}
	form, _ := url.ParseQuery(string(h.recv.all()[1].body))
	if form.Get("title") != "Test from OpenTodo" {
		t.Fatalf("test message: %v", form)
	}
	if _, err := h.svc.Test(ctx, "u2", c.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("other account: %v", err)
	}
}

func TestMissingSecretAfterRestoreDoesNotSend(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	c := h.create("u1", Input{Kind: ptr(KindGotify), URL: ptr(h.recv.srv.URL), Token: ptr("tok"), Events: &[]string{EventReminder}})
	if err := os.Remove(h.svc.SecretsPath()); err != nil {
		t.Fatal(err)
	}
	got, _ := h.svc.Get(ctx, "u1", c.ID)
	if got.TokenSet {
		t.Fatal("token reported after the secrets file was lost")
	}
	h.svc.Reminder(ctx, Reminder{UserID: "u1", ID: "r1", TaskID: "t1", FireAt: 1})
	h.drain()
	list, _ := h.svc.Deliveries(ctx, "u1", c.ID)
	if len(h.recv.all()) != 0 || list[0].LastError != "token_missing" {
		t.Fatalf("sent without a token: %+v", list)
	}
}

func TestPruneKeepsTheNewest(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	c := h.create("u1", ntfyInput(h.recv.srv.URL, EventReminder))
	for i := range LogLimit + 10 {
		h.svc.Reminder(ctx, Reminder{UserID: "u1", ID: "r" + strconv.Itoa(i), TaskID: "t1", FireAt: int64(i)})
		h.clock.Advance(time.Second)
	}
	h.drain()
	if err := h.svc.Prune(ctx); err != nil {
		t.Fatal(err)
	}
	if list, _ := h.svc.Deliveries(ctx, "u1", c.ID); len(list) != LogLimit {
		t.Fatalf("log length %d", len(list))
	}
	h.clock.Advance(LogRetention + time.Hour)
	_ = h.svc.Prune(ctx)
	if list, _ := h.svc.Deliveries(ctx, "u1", c.ID); len(list) != 0 {
		t.Fatalf("old entries kept: %d", len(list))
	}
}
