package httpapi

import (
	"crypto/ecdh"
	"encoding/base64"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/config"
	"github.com/OpenTodoApp/opentodo/internal/push"
	"github.com/OpenTodoApp/opentodo/internal/store"
	"github.com/OpenTodoApp/opentodo/internal/tenant/services"
)

// countingPush is a push service endpoint that answers status and counts requests.
type countingPush struct {
	srv    *httptest.Server
	status atomic.Int32
	hits   atomic.Int32
}

func newCountingPush(t *testing.T) *countingPush {
	c := &countingPush{}
	c.status.Store(http.StatusCreated)
	c.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body)
		c.hits.Add(1)
		w.WriteHeader(int(c.status.Load()))
	}))
	t.Cleanup(c.srv.Close)
	return c
}

func (c *countingPush) body(device string) map[string]any {
	ua, _ := ecdh.P256().GenerateKey(nil)
	return map[string]any{
		"deviceId": device,
		"endpoint": c.srv.URL + "/send/" + device,
		"keys": map[string]string{
			"p256dh": base64.RawURLEncoding.EncodeToString(ua.PublicKey().Bytes()),
			"auth":   base64.RawURLEncoding.EncodeToString([]byte("0123456789abcdef")),
		},
	}
}

// OpenSpec push-test-delivery, requirement "Push test route".
func TestPushTestOutcomes(t *testing.T) {
	e, _ := pushEnv(t, false)
	ps := newCountingPush(t)
	resp, out := e.do("POST", "/api/v1/push/subscriptions", ps.body("laptop"))
	e.mustStatus(resp, 201, out)

	resp, out = e.do("POST", "/api/v1/push/test", map[string]any{"deviceId": "laptop"})
	e.mustStatus(resp, 200, out)
	sub, _ := out["subscription"].(map[string]any)
	if out["outcome"] != "sent" || out["testId"] == "" || sub == nil || sub["lastOkAt"] == nil {
		t.Fatalf("sent: %v", out)
	}

	resp, out = e.do("POST", "/api/v1/push/test", map[string]any{"deviceId": "phone"})
	e.mustStatus(resp, 200, out)
	if out["outcome"] != "no_subscription" || out["subscription"] != nil {
		t.Fatalf("no_subscription: %v", out)
	}

	ps.status.Store(http.StatusInternalServerError)
	resp, out = e.do("POST", "/api/v1/push/test", map[string]any{"deviceId": "laptop"})
	e.mustStatus(resp, 200, out)
	sub, _ = out["subscription"].(map[string]any)
	if out["outcome"] != "failed" || out["status"] != float64(500) || sub == nil || sub["failures"] != float64(1) {
		t.Fatalf("failed: %v", out)
	}

	ps.status.Store(http.StatusGone)
	resp, out = e.do("POST", "/api/v1/push/test", map[string]any{"deviceId": "laptop"})
	e.mustStatus(resp, 200, out)
	if out["outcome"] != "gone" || out["subscription"] != nil {
		t.Fatalf("gone: %v", out)
	}
	resp, out = e.do("POST", "/api/v1/push/test", map[string]any{"deviceId": "laptop"})
	e.mustStatus(resp, 200, out)
	if out["outcome"] != "no_subscription" {
		t.Fatalf("after gone: %v", out)
	}
}

func TestPushTestRefusals(t *testing.T) {
	e, _ := pushEnv(t, false)
	ps := newCountingPush(t)
	resp, out := e.do("POST", "/api/v1/push/subscriptions", ps.body("laptop"))
	e.mustStatus(resp, 201, out)

	resp, out = e.do("POST", "/api/v1/push/test", map[string]any{})
	e.mustStatus(resp, 400, out)
	if errCode(out) != "bad_request" {
		t.Fatalf("missing device: %v", out)
	}
	resp, out = newClientFor(e).do("POST", "/api/v1/push/test", map[string]any{"deviceId": "laptop"})
	e.mustStatus(resp, 401, out)
	if errCode(out) != "unauthorized" {
		t.Fatalf("anonymous: %v", out)
	}
	_, agent := e.namedToken("assistant", "agent")
	for _, secret := range []string{e.token("read"), agent} {
		resp, out = e.bearerClient().do("POST", "/api/v1/push/test", map[string]any{"deviceId": "laptop"}, bearer(secret)...)
		e.mustStatus(resp, 403, out)
		if errCode(out) != "insufficient_scope" {
			t.Fatalf("scoped token: %v", out)
		}
	}
	if n := ps.hits.Load(); n != 0 {
		t.Fatalf("refused requests reached the push service %d times", n)
	}

	// 5 tests per account per window; the 6th is refused before any outbound request.
	for i := 0; i < pushTestLimit; i++ {
		resp, out = e.do("POST", "/api/v1/push/test", map[string]any{"deviceId": "laptop"})
		e.mustStatus(resp, 200, out)
	}
	resp, out = e.do("POST", "/api/v1/push/test", map[string]any{"deviceId": "laptop"})
	e.mustStatus(resp, 429, out)
	if errCode(out) != "rate_limited" || ps.hits.Load() != pushTestLimit {
		t.Fatalf("6th test: %v, push service hits %d", out, ps.hits.Load())
	}
}

func TestPushTestNotFoundWhenPushOff(t *testing.T) {
	e, _ := pushEnv(t, true)
	resp, out := e.do("POST", "/api/v1/push/test", map[string]any{"deviceId": "laptop"})
	e.mustStatus(resp, 404, out)
}

func TestPushTestRefusedInDemoMode(t *testing.T) {
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	set := testSet(t, config.Config{SessionTTL: time.Hour, Demo: true}, db, services.Options{})
	syncSvc := set.Sync
	// A demo instance builds no push service; this one is forced on to prove the
	// demo guard refuses the route anyway.
	set.Push = push.New(db, syncSvc, t.TempDir(), push.Options{AllowHTTP: true, Client: http.DefaultClient})
	set.Cfg.PushDisabled = false
	srv := httptest.NewServer(New(set, http.NotFoundHandler()))
	t.Cleanup(srv.Close)
	ps := newCountingPush(t)
	jar, _ := cookiejar.New(nil)
	e := &env{t: t, srv: srv, client: &http.Client{Jar: jar}, db: db, sync: syncSvc}
	resp, out := e.do("POST", "/api/v1/push/test", map[string]any{"deviceId": "laptop"})
	e.mustStatus(resp, 403, out)
	if errCode(out) != "demo_restricted" || ps.hits.Load() != 0 {
		t.Fatalf("demo: %v, push hits %d", out, ps.hits.Load())
	}
}
