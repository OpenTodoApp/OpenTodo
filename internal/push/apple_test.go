package push

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
	gosync "sync"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/outbound"
	"github.com/OpenTodoApp/opentodo/internal/pushrelay"
	"github.com/OpenTodoApp/opentodo/internal/pushrelay/relaytest"
)

// relayTap records the bodies the server sends to the relay.
type relayTap struct {
	mu     gosync.Mutex
	bodies []string
	paths  []string
	agents []string
	next   http.Handler
}

func (r *relayTap) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	b, _ := io.ReadAll(req.Body)
	r.mu.Lock()
	r.bodies = append(r.bodies, string(b))
	r.paths = append(r.paths, req.URL.Path)
	r.agents = append(r.agents, req.Header.Get("User-Agent"))
	r.mu.Unlock()
	req.Body = io.NopCloser(bytes.NewReader(b))
	r.next.ServeHTTP(w, req)
}

func (r *relayTap) count() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.bodies)
}

type appleEnv struct {
	*testEnv
	relay *relaytest.Env
	tap   *relayTap
	on    bool
	apple *Apple
	dials int
	dmu   gosync.Mutex
}

// newAppleEnv runs the real relay against a fake APNs and an Apple client
// through the outbound policy, with private targets allowed (the test relay
// listens on loopback).
func newAppleEnv(t *testing.T) *appleEnv {
	t.Helper()
	e := &appleEnv{testEnv: newTestEnv(t), on: true}
	if _, err := e.db.Exec(`INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES('sess1','u1',1,9999999999999),('sess2','u2',1,9999999999999)`); err != nil {
		t.Fatal(err)
	}
	e.relay = relaytest.New(t, *e.clock)
	e.tap = &relayTap{next: e.relay.Relay}
	e.relay.Server.Config.Handler = e.tap
	d := &outbound.Dialer{AllowPrivate: func(context.Context) bool { return true }}
	nd := &net.Dialer{Timeout: time.Second}
	d.Dial = func(ctx context.Context, network, addr string) (net.Conn, error) {
		e.dmu.Lock()
		e.dials++
		e.dmu.Unlock()
		return nd.DialContext(ctx, network, addr)
	}
	client := outbound.NewClient(d, 5*time.Second)
	e.apple = NewApple(e.db, e.sync, AppleOptions{On: func(context.Context) bool { return e.on }, URL: func(context.Context) string { return e.relay.Server.URL },
		Client: client, Now: func() time.Time { return *e.clock }})
	return e
}

func appleInput(device string) AppleInput {
	tok := make([]byte, 32)
	_, _ = rand.Read(tok)
	due := make([]byte, 32)
	_, _ = rand.Read(due)
	return AppleInput{DeviceID: device, Token: hex.EncodeToString(tok), Environment: "production", DueToken: base64.RawURLEncoding.EncodeToString(due), IncludeContent: true}
}

func TestRelayThroughOutbound(t *testing.T) {
	e := newAppleEnv(t)
	ctx := context.Background()
	if _, err := e.apple.Register(ctx, "u1", "sess1", appleInput("phone")); err != nil {
		t.Fatal(err)
	}
	if e.dials == 0 {
		t.Fatal("the registration did not go through the outbound dialer")
	}
	for _, ua := range e.tap.agents {
		if ua != "OpenTodo" {
			t.Fatalf("User-Agent %q, want OpenTodo without a version", ua)
		}
	}
	// Redirects are not followed: a relay that redirects is unreachable.
	redir := NewApple(e.db, e.sync, AppleOptions{On: func(context.Context) bool { return true }, URL: func(context.Context) string { return e.relay.Server.URL + "/redirect" },
		Client: e.apple.client})
	e.relay.Server.Config.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "http://169.254.169.254/", http.StatusTemporaryRedirect)
	})
	if _, err := redir.Register(ctx, "u1", "sess1", appleInput("tablet")); !errors.Is(err, ErrRelayUnreachable) {
		t.Fatalf("redirecting relay: %v", err)
	}
}

func TestRelayPrivateTargetRefused(t *testing.T) {
	e := newAppleEnv(t)
	strict := NewApple(e.db, e.sync, AppleOptions{On: func(context.Context) bool { return true }, URL: func(context.Context) string { return e.relay.Server.URL }})
	_, err := strict.Register(context.Background(), "u1", "sess1", appleInput("phone"))
	if !errors.Is(err, ErrRelayUnreachable) || !strings.Contains(err.Error(), "private_target") {
		t.Fatalf("loopback relay without private targets allowed: %v", err)
	}
	if n := e.tap.count(); n != 0 {
		t.Fatalf("the relay received %d requests", n)
	}
	if list, _ := e.apple.Devices(context.Background(), "u1"); len(list) != 0 {
		t.Fatal("a registration was stored")
	}
	if err := CheckRelayURL("http://relay.example"); err == nil {
		t.Fatal("an http relay address was accepted")
	}
	if err := CheckRelayURL("https://relay.example/base"); err != nil {
		t.Fatal(err)
	}
}

func TestRegistrationKeepsNoToken(t *testing.T) {
	e := newAppleEnv(t)
	ctx := context.Background()
	in := appleInput("phone")
	d, err := e.apple.Register(ctx, "u1", "sess1", in)
	if err != nil {
		t.Fatal(err)
	}
	// The relay got the token, the environment and the wake key, and nothing else.
	if e.tap.count() != 1 || e.tap.paths[0] != "/v1/register" {
		t.Fatalf("relay requests %v", e.tap.paths)
	}
	body := e.tap.bodies[0]
	for _, k := range []string{`"token"`, `"environment"`, `"wakeKey"`} {
		if !strings.Contains(body, k) {
			t.Errorf("registration lacks %s: %s", k, body)
		}
	}
	if strings.Contains(body, in.DueToken) || strings.Contains(body, "phone") || strings.Contains(body, "u1") || strings.Count(body, `":`) != 3 {
		t.Fatalf("registration carries more: %s", body)
	}
	// The database holds the handle, the wake key and the due token's hash only.
	dump := dumpTable(t, e, "apple_devices")
	if strings.Contains(dump, in.Token) || strings.Contains(dump, in.DueToken) {
		t.Fatalf("apple_devices holds the APNs or the due token: %s", dump)
	}
	if !strings.Contains(dump, d.Handle) || !strings.Contains(dump, DueTokenHash(in.DueToken)) || !strings.Contains(dump, base64.RawURLEncoding.EncodeToString(d.WakeKey)) {
		t.Fatalf("apple_devices lacks the handle, the hash or the wake key: %s", dump)
	}
	if got, err := e.apple.DeviceForDueToken(ctx, in.DueToken); err != nil || got.ID != d.ID {
		t.Fatalf("due token lookup: %v %v", got, err)
	}
	// Registering the device again replaces its row and its wake key.
	again, err := e.apple.Register(ctx, "u1", "sess1", in)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Equal(again.WakeKey, d.WakeKey) {
		t.Fatal("re-registration kept the wake key")
	}
	if list, _ := e.apple.Devices(ctx, "u1"); len(list) != 1 {
		t.Fatalf("%d rows after re-registration", len(list))
	}
	// At most 10 per user: the oldest goes.
	for i := range MaxAppleDevicesPerUser + 2 {
		*e.clock = e.clock.Add(time.Second)
		if _, err := e.apple.Register(ctx, "u1", "sess1", appleInput("dev"+string(rune('a'+i)))); err != nil {
			t.Fatal(err)
		}
	}
	list, _ := e.apple.Devices(ctx, "u1")
	if len(list) != MaxAppleDevicesPerUser {
		t.Fatalf("%d registrations, want %d", len(list), MaxAppleDevicesPerUser)
	}
	for _, x := range list {
		if x.DeviceID == "phone" || x.DeviceID == "deva" {
			t.Fatalf("the oldest registration %s stayed", x.DeviceID)
		}
	}
	// Off: nothing reaches the relay.
	e.on = false
	before := e.tap.count()
	if _, err := e.apple.Register(ctx, "u1", "sess1", appleInput("x")); !errors.Is(err, ErrRelayOff) {
		t.Fatalf("off: %v", err)
	}
	if e.tap.count() != before {
		t.Fatal("a registration reached the relay while off")
	}
	// Validation before any request.
	e.on = true
	for name, mut := range map[string]func(*AppleInput){
		"no device":     func(in *AppleInput) { in.DeviceID = " " },
		"short token":   func(in *AppleInput) { in.Token = in.Token[:10] },
		"not hex":       func(in *AppleInput) { in.Token = strings.Repeat("zz", 32) },
		"environment":   func(in *AppleInput) { in.Environment = "beta" },
		"due token":     func(in *AppleInput) { in.DueToken = "short" },
		"due token pad": func(in *AppleInput) { in.DueToken += "=" },
	} {
		bad := appleInput("y")
		mut(&bad)
		if _, err := e.apple.Register(ctx, "u1", "sess1", bad); !errors.Is(err, ErrInvalidApple) {
			t.Errorf("%s: %v", name, err)
		}
	}
	if e.tap.count() != before {
		t.Fatal("an invalid registration reached the relay")
	}
}

func dumpTable(t *testing.T, e *appleEnv, table string) string {
	t.Helper()
	rows, err := e.db.Query(`SELECT * FROM ` + table)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	cols, _ := rows.Columns()
	var b strings.Builder
	for rows.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		_ = rows.Scan(ptrs...)
		for _, v := range vals {
			switch x := v.(type) {
			case []byte:
				b.Write(x)
			case string:
				b.WriteString(x)
			}
			b.WriteByte('|')
		}
		b.WriteByte('\n')
	}
	return b.String()
}

func TestWakeCarriesNoContent(t *testing.T) {
	e := newAppleEnv(t)
	ctx := context.Background()
	e.apply(t, "u1", map[string]map[string]any{"task:task-call-bank": {"title": "Call the bank", "completed_at": nil, "deleted_at": nil}})
	e.reminder(t, "u1", "rem-call-bank", "task-call-bank", e.clock.UnixMilli())
	in := appleInput("phone")
	d, err := e.apple.Register(ctx, "u1", "sess1", in)
	if err != nil {
		t.Fatal(err)
	}
	for _, kind := range []string{pushrelay.KindRefresh, pushrelay.KindDue} {
		res, _, err := e.apple.Wake(ctx, d, kind)
		if err != nil || res != WakeSent {
			t.Fatalf("%s: %v %v", kind, res, err)
		}
	}
	for _, body := range e.tap.bodies[1:] {
		for _, leak := range []string{"Call the bank", "task-call-bank", "rem-call-bank", "phone", in.Token, in.DueToken, "version"} {
			if strings.Contains(body, leak) {
				t.Fatalf("wake carries %q: %s", leak, body)
			}
		}
		if strings.Count(body, `":`) != 4 {
			t.Fatalf("wake carries more than handle, kind, ts and sig: %s", body)
		}
	}
	for _, p := range e.relay.APNs.Pushes() {
		if strings.Contains(p.Body, "Call the bank") || strings.Contains(p.Body, "rem-call-bank") || strings.Contains(p.Path, "task-call-bank") {
			t.Fatalf("Apple received content: %+v", p)
		}
	}
	if n := len(e.relay.APNs.Pushes()); n != 2 {
		t.Fatalf("%d pushes", n)
	}
	// Apple's 410 deletes the registration.
	e.relay.APNs.Answer(func(relaytest.Push) (int, string) { return 410, "Unregistered" })
	if res, _, _ := e.apple.Wake(ctx, d, pushrelay.KindDue); res != WakeGone {
		t.Fatalf("gone: %v", res)
	}
	if _, err := e.apple.Device(ctx, "u1", d.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("a gone registration stayed: %v", err)
	}
	// Over the relay's limit: its Retry-After comes back.
	d2, _ := e.apple.Register(ctx, "u1", "sess1", appleInput("ipad"))
	e.relay.APNs.Answer(nil)
	var res WakeResult
	var after time.Duration
	for range 4 {
		res, after, _ = e.apple.Wake(ctx, d2, pushrelay.KindRefresh)
	}
	if res != WakeLimited || after < time.Second {
		t.Fatalf("over the limit: %v after %v", res, after)
	}
	// The relay down: a failure, counted on the row.
	e.relay.Server.Close()
	if res, _, err := e.apple.Wake(ctx, d2, pushrelay.KindDue); res != WakeFailed || !errors.Is(err, ErrRelayUnreachable) {
		t.Fatalf("relay down: %v %v", res, err)
	}
	if got, _ := e.apple.Device(ctx, "u1", d2.ID); got.Failures != 1 {
		t.Fatalf("failures %d", got.Failures)
	}
}

func TestAppleDueAndSchedule(t *testing.T) {
	e := newAppleEnv(t)
	ctx := context.Background()
	now := e.clock.UnixMilli()
	e.apply(t, "u1", map[string]map[string]any{
		"task:t1": {"title": "**Call** the [bank](https://bank.example) " + strings.Repeat("x", 200), "completed_at": nil, "deleted_at": nil},
		"task:t2": {"title": "Done already", "completed_at": now - 1000, "deleted_at": nil},
		"task:t3": {"title": "Later", "completed_at": nil, "deleted_at": nil},
	})
	e.reminder(t, "u1", "r1", "t1", now-60_000)
	e.reminder(t, "u1", "r2", "t2", now)
	e.reminder(t, "u1", "r3", "t3", now+10*60_000)
	e.reminder(t, "u1", "r4", "t1", now-10*60_000)
	in := appleInput("phone")
	d, err := e.apple.Register(ctx, "u1", "sess1", in)
	if err != nil {
		t.Fatal(err)
	}
	items, err := e.apple.Due(ctx, d)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].ID != "r1" || items[0].TaskID != "t1" {
		t.Fatalf("due %+v", items)
	}
	if title := items[0].Title; !strings.HasPrefix(title, "Call the bank xxx") || len([]rune(title)) != DueTitleRunes || strings.ContainsAny(title, "*[]()") {
		t.Fatalf("title %q", title)
	}
	// Without titles on the device, none.
	d.IncludeContent = false
	if items, _ := e.apple.Due(ctx, d); len(items) != 1 || items[0].Title != "" {
		t.Fatalf("without titles %+v", items)
	}
	// Schedule reports: renew once the handle expires within 7 days.
	if renew, err := e.apple.ReportSchedule(ctx, "u1", d.ID, 42, now+7*24*3600_000); err != nil || renew {
		t.Fatalf("fresh handle: renew=%v %v", renew, err)
	}
	*e.clock = e.clock.Add(25 * 24 * time.Hour)
	if renew, _ := e.apple.ReportSchedule(ctx, "u1", d.ID, 43, now); !renew {
		t.Fatal("a handle 5 days from expiry did not ask for renewal")
	}
	if _, err := e.apple.ReportSchedule(ctx, "u2", d.ID, 1, 1); !errors.Is(err, ErrNotFound) {
		t.Fatalf("another user's report: %v", err)
	}
	if err := e.apple.Delete(ctx, "u2", d.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("another user's delete: %v", err)
	}
	if err := e.apple.Delete(ctx, "u1", d.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := e.apple.DeviceForDueToken(ctx, in.DueToken); !errors.Is(err, ErrUnknownDueToken) {
		t.Fatalf("a deleted device's due token: %v", err)
	}
}

// TestExpiredSessionStopsTheDueToken: once its session expired, a
// registration's due token no longer works and no wake selects it.
func TestExpiredSessionStopsTheDueToken(t *testing.T) {
	e := newAppleEnv(t)
	ctx := context.Background()
	if _, err := e.db.Exec(`INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES('short','u1',1,?)`, e.clock.UnixMilli()+60_000); err != nil {
		t.Fatal(err)
	}
	in := appleInput("phone")
	if _, err := e.apple.Register(ctx, "u1", "short", in); err != nil {
		t.Fatal(err)
	}
	if _, err := e.apple.DeviceForDueToken(ctx, in.DueToken); err != nil {
		t.Fatalf("live session: %v", err)
	}
	*e.clock = e.clock.Add(2 * time.Minute)
	if _, err := e.apple.DeviceForDueToken(ctx, in.DueToken); !errors.Is(err, ErrUnknownDueToken) {
		t.Fatalf("expired session: %v", err)
	}
	if list, _ := e.apple.Devices(ctx, "u1"); len(list) != 0 {
		t.Fatalf("%d devices of an expired session listed for wakes", len(list))
	}
	// A deactivated user's live session does not count either.
	other := appleInput("ipad")
	if _, err := e.apple.Register(ctx, "u2", "sess2", other); err != nil {
		t.Fatal(err)
	}
	if _, err := e.db.Exec(`INSERT INTO user_status(user_id, deactivated_at) VALUES('u2', 1)`); err != nil {
		t.Fatal(err)
	}
	if _, err := e.apple.DeviceForDueToken(ctx, other.DueToken); !errors.Is(err, ErrUnknownDueToken) {
		t.Fatalf("deactivated user: %v", err)
	}
}

func TestPlainTitle(t *testing.T) {
	for in, want := range map[string]string{
		"#1 priority":               "#1 priority",
		"# Heading":                 "Heading",
		"## **Bold** [link](x://y)": "Bold link",
		"a  \n b":                   "a b",
	} {
		if got := PlainTitle(in); got != want {
			t.Errorf("PlainTitle(%q) = %q, want %q", in, got, want)
		}
	}
}

// TestDueSkipsClosedTasksBeforeTheCap: many completed tasks due now do not
// crowd out the open one.
func TestDueSkipsClosedTasksBeforeTheCap(t *testing.T) {
	e := newAppleEnv(t)
	ctx := context.Background()
	now := e.clock.UnixMilli()
	for i := range maxDueItems + 5 {
		id := "done" + string(rune('a'+i))
		e.apply(t, "u1", map[string]map[string]any{"task:" + id: {"title": "x", "completed_at": now - 1, "deleted_at": nil}})
		e.reminder(t, "u1", "r"+id, id, now-120_000)
	}
	e.apply(t, "u1", map[string]map[string]any{"task:open": {"title": "Open", "completed_at": nil, "deleted_at": nil}})
	e.reminder(t, "u1", "ropen", "open", now-60_000)
	d, err := e.apple.Register(ctx, "u1", "sess1", appleInput("phone"))
	if err != nil {
		t.Fatal(err)
	}
	items, err := e.apple.Due(ctx, d)
	if err != nil || len(items) != 1 || items[0].ID != "ropen" {
		t.Fatalf("due %+v %v", items, err)
	}
}
