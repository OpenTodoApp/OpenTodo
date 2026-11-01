package httpapi

import (
	"bufio"
	"context"
	"net/http"
	"strings"
	"testing"
	"time"
)

// Push-only exchange (OpenSpec change obsidian-plugin D4, offline-first-sync
// "Push-only exchange").

func pushOnly(c *env, device string, ops []map[string]any, headers ...string) (*http.Response, map[string]any) {
	c.t.Helper()
	return c.do("POST", "/api/v1/sync", map[string]any{
		"device": device, "cursor": 0, "ops": ops, "features": []string{"push_only", "clock_skew"},
	}, headers...)
}

func TestPushOnlyAppliesWithoutPulling(t *testing.T) {
	se := newShareEnv(t)
	alice := se.alice
	// History the push-only device must not receive.
	for i := 0; i < 5; i++ {
		resp, out := alice.do("POST", "/api/v1/tasks", map[string]any{"title": "Old"})
		alice.mustStatus(resp, 201, out)
	}
	_, head, _ := syncAll(alice, "W", 0)

	// Another device listens on the event stream.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", alice.srv.URL+"/api/v1/sync/events?device=W", nil)
	stream, err := alice.client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer stream.Body.Close()
	rd := bufio.NewReader(stream.Body)
	if line, _ := rd.ReadString('\n'); !strings.HasPrefix(line, ": connected") {
		t.Fatalf("first line %q", line)
	}
	woken := make(chan string, 4)
	go func() {
		for {
			line, err := rd.ReadString('\n')
			if err != nil {
				return
			}
			if strings.HasPrefix(line, "data:") {
				woken <- line
			}
		}
	}()
	time.Sleep(20 * time.Millisecond)

	ops := []map[string]any{syncOp("po-1", "task", "po-task", "title", "From Obsidian")}
	ops[0]["device"] = "obsidian:install"
	resp, out := pushOnly(alice, "obsidian:install", ops)
	alice.mustStatus(resp, 200, out)
	if out["applied"] != float64(1) || len(out["ops"].([]any)) != 0 || out["hasMore"] != false {
		t.Fatalf("push-only answer = %v", out)
	}
	if len(out["memberships"].([]any)) != 0 || len(out["workspaces"].([]any)) != 0 || len(out["rejected"].([]any)) != 0 {
		t.Fatalf("push-only lists = %v", out)
	}
	if c := out["cursor"].(float64); c <= head {
		t.Fatalf("cursor %v, want the head after %v", c, head)
	}
	if _, ok := out["serverTime"].(float64); !ok {
		t.Fatalf("serverTime missing: %v", out)
	}
	select {
	case <-woken:
	case <-time.After(2 * time.Second):
		t.Fatal("the other device was not woken")
	}
	resp, task := alice.do("GET", "/api/v1/tasks/po-task", nil)
	alice.mustStatus(resp, 200, task)

	// The same batch again counts duplicates and changes nothing.
	resp, out = pushOnly(alice, "obsidian:install", ops)
	alice.mustStatus(resp, 200, out)
	if out["applied"] != float64(0) || out["duplicates"] != float64(1) {
		t.Fatalf("repeat = %v", out)
	}

	// A viewer's op is refused in a 200 answer; the rest is applied, and no
	// server value is pulled back.
	se.share(alice, "bob@example.com", "viewer")
	resp, out = pushOnly(se.bob, "obsidian:bob", []map[string]any{
		syncOp("po-r", "task", se.task, "title", "Hacked"),
		syncOp("po-ok", "task", "bob-task", "title", "Mine"),
	})
	se.bob.mustStatus(resp, 200, out)
	rej := out["rejected"].([]any)
	if len(rej) != 1 || rej[0].(map[string]any)["id"] != "po-r" || out["applied"] != float64(1) || len(out["ops"].([]any)) != 0 {
		t.Fatalf("viewer push = %v", out)
	}
}

func TestPushOnlyKeepsThePolicy(t *testing.T) {
	e := ownerEnv(t)
	ops := []map[string]any{syncOp("po-anon", "task", "t-anon", "title", "Nope")}
	if resp, _ := newEnv(t, false).raw("POST", "/api/v1/sync", []byte(`{"device":"d","ops":[],"features":["push_only"]}`)); resp.StatusCode != 401 {
		t.Fatalf("anonymous = %d", resp.StatusCode)
	}
	before := countOps(t, e)
	secret := e.token("read")
	resp, out := pushOnly(e.bearerClient(), "d", ops, bearer(secret)...)
	if resp.StatusCode != 403 || errCode(out) != "insufficient_scope" {
		t.Fatalf("read token = %d %v", resp.StatusCode, out)
	}
	if after := countOps(t, e); after != before {
		t.Fatalf("ops changed: %d → %d", before, after)
	}
	// A full token is accepted, like a session.
	full := e.token("full")
	resp, out = pushOnly(e.bearerClient(), "obsidian:x", ops, bearer(full)...)
	if resp.StatusCode != 200 || out["applied"] != float64(1) {
		t.Fatalf("full token = %d %v", resp.StatusCode, out)
	}
}
