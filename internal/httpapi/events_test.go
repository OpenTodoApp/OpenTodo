package httpapi

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"

	opsync "github.com/pixari/opentodo/internal/sync"
)

// sseEvent is one frame read from an event stream. Comment lines (": ping") are
// surfaced with name "comment" so tests can observe heartbeats.
type sseEvent struct {
	name string
	data string
}

type stream struct {
	events <-chan sseEvent
	status int
	body   map[string]any
	cancel func()
}

// openStream connects to the event stream and parses frames in the background.
// The channel is closed when the server ends the response.
func (e *env) openStream(base, path string, headers ...string) *stream {
	e.t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	req, _ := http.NewRequestWithContext(ctx, "GET", base+path, nil)
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	resp, err := e.client.Do(req)
	if err != nil {
		cancel()
		e.t.Fatal(err)
	}
	st := &stream{status: resp.StatusCode, cancel: cancel}
	e.t.Cleanup(cancel)
	if resp.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		_ = json.Unmarshal(raw, &st.body)
		cancel()
		return st
	}
	if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "text/event-stream") {
		e.t.Fatalf("content-type = %q", ct)
	}
	if resp.Header.Get("Cache-Control") != "no-cache" || resp.Header.Get("X-Accel-Buffering") != "no" {
		e.t.Fatalf("missing no-buffering headers: %v", resp.Header)
	}
	ch := make(chan sseEvent, 64)
	st.events = ch
	go func() {
		defer close(ch)
		defer resp.Body.Close()
		sc := bufio.NewScanner(resp.Body)
		var name, data string
		for sc.Scan() {
			line := sc.Text()
			switch {
			case line == "":
				if data != "" {
					ch <- sseEvent{name: name, data: data}
				}
				name, data = "", ""
			case strings.HasPrefix(line, ":"):
				ch <- sseEvent{name: "comment", data: strings.TrimSpace(line[1:])}
			case strings.HasPrefix(line, "event:"):
				name = strings.TrimSpace(line[6:])
			case strings.HasPrefix(line, "data:"):
				data = strings.TrimSpace(line[5:])
			}
		}
	}()
	return st
}

// next waits for the next frame with the given name, skipping others.
func (st *stream) next(t *testing.T, name string, within time.Duration) (sseEvent, bool) {
	t.Helper()
	deadline := time.After(within)
	for {
		select {
		case ev, ok := <-st.events:
			if !ok {
				return sseEvent{}, false
			}
			if ev.name == name {
				return ev, true
			}
		case <-deadline:
			return sseEvent{}, false
		}
	}
}

// closed reports whether the server ended the stream within the timeout.
func (st *stream) closed(within time.Duration) bool {
	deadline := time.After(within)
	for {
		select {
		case _, ok := <-st.events:
			if !ok {
				return true
			}
		case <-deadline:
			return false
		}
	}
}

func (e *env) register(email string) {
	e.t.Helper()
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": email, "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
}

// connected opens an authenticated stream for device and waits for the opening
// comment, which guarantees the subscription is registered server-side.
func (e *env) connected(device string) *stream {
	e.t.Helper()
	st := e.openStream(e.srv.URL, "/api/v1/sync/events?device="+device)
	if st.status != 200 {
		e.t.Fatalf("stream status = %d (%v)", st.status, st.body)
	}
	if _, ok := st.next(e.t, "comment", 2*time.Second); !ok {
		e.t.Fatal("no opening comment on the stream")
	}
	return st
}

func (e *env) pushTitle(device, taskID, title string) float64 {
	e.t.Helper()
	resp, out := e.do("POST", "/api/v1/sync", map[string]any{"device": device, "cursor": 0, "ops": []any{
		map[string]any{"id": device + "-" + title, "entity": "task", "entityId": taskID, "field": "title", "value": title, "ts": time.Now().UnixMilli(), "device": device},
	}})
	e.mustStatus(resp, 200, out)
	return out["cursor"].(float64)
}

func TestEventsRequiresAuth(t *testing.T) {
	e := newEnv(t, false)
	e.register("o@example.com")
	bare := &env{t: t, srv: e.srv, client: &http.Client{}}
	st := bare.openStream(e.srv.URL, "/api/v1/sync/events?device=a")
	if st.status != 401 {
		t.Fatalf("status = %d, want 401", st.status)
	}
	if st.body["error"].(map[string]any)["code"] != "unauthorized" {
		t.Fatalf("error envelope = %v", st.body)
	}
	if e.sync.Notifier().Count("") != 0 {
		t.Fatal("no stream must be registered for an unauthenticated request")
	}
}

func TestEventsRequiresDevice(t *testing.T) {
	e := newEnv(t, false)
	e.register("o@example.com")
	st := e.openStream(e.srv.URL, "/api/v1/sync/events")
	if st.status != 400 {
		t.Fatalf("status = %d, want 400", st.status)
	}
	if st.body["error"].(map[string]any)["code"] != "bad_request" {
		t.Fatalf("error envelope = %v", st.body)
	}
}

func TestEventsDeliversCursorOnlyPayload(t *testing.T) {
	e := newEnv(t, false)
	e.register("o@example.com")
	laptop := e.connected("laptop")

	cursor := e.pushTitle("phone", "task-secret-id", "Top secret title")
	ev, ok := laptop.next(t, "ops", 2*time.Second)
	if !ok {
		t.Fatal("laptop did not receive a wake-up")
	}
	var payload map[string]int64
	if err := json.Unmarshal([]byte(ev.data), &payload); err != nil {
		t.Fatalf("payload %q is not JSON: %v", ev.data, err)
	}
	if len(payload) != 1 || payload["cursor"] != int64(cursor) {
		t.Fatalf("payload = %s, want only cursor %v", ev.data, cursor)
	}
	for _, leak := range []string{"secret", "title", "task-", "entity"} {
		if strings.Contains(strings.ToLower(ev.data), leak) {
			t.Fatalf("payload leaks op content: %s", ev.data)
		}
	}
}

func TestEventsSkipOriginDevice(t *testing.T) {
	e := newEnv(t, false)
	e.register("o@example.com")
	phone := e.connected("phone")

	e.pushTitle("phone", "t1", "own edit")
	if ev, ok := phone.next(t, "ops", 300*time.Millisecond); ok {
		t.Fatalf("device woken by its own push: %v", ev)
	}
	e.pushTitle("laptop", "t1", "edit elsewhere")
	if _, ok := phone.next(t, "ops", 2*time.Second); !ok {
		t.Fatal("device not woken by another device's push")
	}
	// Re-sending duplicates records nothing and wakes nobody.
	e.pushTitle("laptop", "t1", "edit elsewhere")
	if ev, ok := phone.next(t, "ops", 300*time.Millisecond); ok {
		t.Fatalf("duplicate push produced a wake-up: %v", ev)
	}
}

func TestRestWriteWakesDevices(t *testing.T) {
	e := newEnv(t, false)
	e.register("o@example.com")
	phone := e.connected("phone")
	laptop := e.connected("laptop")

	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "from curl"})
	e.mustStatus(resp, 201, out)
	for name, st := range map[string]*stream{"phone": phone, "laptop": laptop} {
		if _, ok := st.next(t, "ops", 2*time.Second); !ok {
			t.Fatalf("%s not woken by REST write", name)
		}
	}
	resp, out = e.do("PATCH", "/api/v1/tasks/"+out["id"].(string), map[string]any{"priority": 1})
	e.mustStatus(resp, 200, out)
	if _, ok := phone.next(t, "ops", 2*time.Second); !ok {
		t.Fatal("phone not woken by REST patch")
	}
}

func TestEventsAreIsolatedPerUser(t *testing.T) {
	e := newEnv(t, true)
	e.register("a@example.com")
	b := newClientFor(e)
	b.register("b@example.com")

	aStream := e.connected("a-laptop")
	bStream := b.connected("b-laptop")

	resp, out := b.do("POST", "/api/v1/tasks", map[string]any{"title": "b's task"})
	b.mustStatus(resp, 201, out)
	if _, ok := bStream.next(t, "ops", 2*time.Second); !ok {
		t.Fatal("B's other device was not woken")
	}
	if ev, ok := aStream.next(t, "ops", 300*time.Millisecond); ok {
		t.Fatalf("user A woken by user B's write: %v", ev)
	}
	b.pushTitle("b-phone", "t1", "x")
	if ev, ok := aStream.next(t, "ops", 300*time.Millisecond); ok {
		t.Fatalf("user A woken by user B's sync push: %v", ev)
	}
}

func TestEventsClosedOnShutdown(t *testing.T) {
	e := newEnv(t, false)
	e.register("o@example.com")
	st := e.connected("laptop")
	e.srv.Config.RegisterOnShutdown(e.sync.Notifier().CloseAll)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- e.srv.Config.Shutdown(ctx) }()
	if !st.closed(2 * time.Second) {
		t.Fatal("stream not closed on shutdown")
	}
	if err := <-done; err != nil {
		t.Fatalf("shutdown held up by open streams: %v", err)
	}
}

func TestEventsCloseOnSessionRevoked(t *testing.T) {
	prev := heartbeatInterval
	heartbeatInterval = 30 * time.Millisecond
	t.Cleanup(func() { heartbeatInterval = prev })

	e := newEnv(t, false)
	e.register("o@example.com")
	st := e.connected("laptop")
	if _, ok := st.next(t, "comment", time.Second); !ok {
		t.Fatal("no heartbeat")
	}
	resp, out := e.do("POST", "/api/v1/auth/logout", nil)
	e.mustStatus(resp, 204, out)
	if !st.closed(2 * time.Second) {
		t.Fatal("stream stayed open after the session was revoked")
	}
	again := e.openStream(e.srv.URL, "/api/v1/sync/events?device=laptop")
	if again.status != 401 {
		t.Fatalf("reconnect after revocation: status %d, want 401", again.status)
	}
}

func TestEventsEvictOldestOverCap(t *testing.T) {
	e := newEnv(t, false)
	e.register("o@example.com")
	streams := make([]*stream, 0, opsync.MaxStreamsPerUser+1)
	for i := 0; i < opsync.MaxStreamsPerUser; i++ {
		streams = append(streams, e.connected("tab"))
	}
	extra := e.connected("tab")
	if !streams[0].closed(2 * time.Second) {
		t.Fatal("oldest stream was not closed when the cap was exceeded")
	}
	e.pushTitle("phone", "t1", "x")
	if _, ok := extra.next(t, "ops", 2*time.Second); !ok {
		t.Fatal("newest stream was refused instead of accepted")
	}
	if _, ok := streams[1].next(t, "ops", 2*time.Second); !ok {
		t.Fatal("second-oldest stream should still be live")
	}
}

// TestEventsSurviveServerTimeouts runs the handler under the production server
// deadlines (scaled down) and checks the stream outlives both of them.
func TestEventsSurviveServerTimeouts(t *testing.T) {
	prev := heartbeatInterval
	heartbeatInterval = 40 * time.Millisecond
	t.Cleanup(func() { heartbeatInterval = prev })

	e := newEnv(t, false)
	e.register("o@example.com")
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	strict := &http.Server{Handler: e.handler, ReadTimeout: 150 * time.Millisecond, WriteTimeout: 150 * time.Millisecond, IdleTimeout: 150 * time.Millisecond}
	go func() { _ = strict.Serve(ln) }()
	t.Cleanup(func() { _ = strict.Close() })

	// The cookie jar keys by host, so the session issued by e.srv is sent here too.
	st := e.openStream("http://"+ln.Addr().String(), "/api/v1/sync/events?device=laptop")
	if st.status != 200 {
		t.Fatalf("stream status = %d (%v)", st.status, st.body)
	}
	deadline := time.After(700 * time.Millisecond)
	pings := 0
loop:
	for {
		select {
		case ev, ok := <-st.events:
			if !ok {
				t.Fatalf("stream cut by server deadlines after %d pings", pings)
			}
			if ev.name == "comment" && ev.data == "ping" {
				pings++
			}
		case <-deadline:
			break loop
		}
	}
	if pings < 5 {
		t.Fatalf("only %d heartbeats in 700ms", pings)
	}
	// Still live: a write is delivered.
	e.pushTitle("phone", "t1", "late")
	if _, ok := st.next(t, "ops", 2*time.Second); !ok {
		t.Fatal("stream no longer delivers after the server deadlines elapsed")
	}
}
