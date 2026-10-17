package httpapi

import (
	"testing"
	"time"

	opsync "github.com/pixari/opentodo/internal/sync"
)

// TestEventsPerAccountCap (SEC-6): an account holds at most ten streams.
func TestEventsPerAccountCap(t *testing.T) {
	if opsync.MaxStreamsPerUser != 10 {
		t.Fatalf("MaxStreamsPerUser = %d, want 10", opsync.MaxStreamsPerUser)
	}
}

// TestEventsCapPerAddress (SEC-6): one client address holds at most
// 20 streams, whatever the accounts; another address is unaffected.
func TestEventsCapPerAddress(t *testing.T) {
	e := newEnv(t, true)
	e.register("o@example.com")
	const ip = "203.0.113.7"
	var clients []*env
	for i, email := range []string{"a@example.com", "b@example.com", "c@example.com"} {
		c := newClientAt(e, "198.51.100."+string(rune('1'+i)))
		resp, out := c.do("POST", "/api/v1/auth/register", map[string]string{"email": email, "password": "correct horse battery"})
		c.mustStatus(resp, 201, out)
		clients = append(clients, c)
	}
	open := func(c *env, from string) *stream {
		return c.openStream(e.srv.URL, "/api/v1/sync/events?device=tab", "X-Forwarded-For", from)
	}
	n := 0
	for _, c := range clients[:2] {
		for i := 0; i < 10 && n < maxStreamsPerIP; i++ {
			st := open(c, ip)
			if st.status != 200 {
				t.Fatalf("stream %d: status %d (%v)", n, st.status, st.body)
			}
			if _, ok := st.next(t, "comment", 2*time.Second); !ok {
				t.Fatal("no opening comment")
			}
			n++
		}
	}
	refused := open(clients[2], ip)
	if refused.status != 503 || refused.body["error"].(map[string]any)["code"] != "busy" {
		t.Fatalf("stream over the address cap: %d %v", refused.status, refused.body)
	}
	if st := open(clients[2], "192.0.2.50"); st.status != 200 {
		t.Fatalf("other address: status %d (%v)", st.status, st.body)
	}
}

// TestEventsGlobalCap (SEC-6): the server holds at most maxLiveStreams
// streams; a slot freed by a closed stream is reused.
func TestEventsGlobalCap(t *testing.T) {
	prev := maxLiveStreams
	maxLiveStreams = 2
	t.Cleanup(func() { maxLiveStreams = prev })
	e := newEnv(t, false)
	e.register("o@example.com")
	first := e.connected("a")
	e.connected("b")
	st := e.openStream(e.srv.URL, "/api/v1/sync/events?device=c")
	if st.status != 503 || st.body["error"].(map[string]any)["code"] != "busy" {
		t.Fatalf("stream over the server cap: %d %v", st.status, st.body)
	}
	first.cancel()
	deadline := time.Now().Add(2 * time.Second)
	for {
		st = e.openStream(e.srv.URL, "/api/v1/sync/events?device=c")
		if st.status == 200 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("slot not freed after a stream closed: %d", st.status)
		}
		time.Sleep(20 * time.Millisecond)
	}
}
