package host

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/tenant"
)

const testToken = "operator-token-0123456789abcdef0123456789"

type fakeClock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *fakeClock) Set(t time.Time) {
	c.mu.Lock()
	c.t = t
	c.mu.Unlock()
}

func (c *fakeClock) Advance(d time.Duration) {
	c.mu.Lock()
	c.t = c.t.Add(d)
	c.mu.Unlock()
}

type fixture struct {
	t     *testing.T
	h     *Host
	srv   *httptest.Server
	op    *httptest.Server
	clock *fakeClock
}

// newFixture opens a host on a temporary directory with a fake clock; the
// public listener and the operator interface are httptest servers, and
// tenants are reached by setting the Host header (no DNS needed).
func newFixture(t *testing.T, mod func(*config.Config, *Options)) *fixture {
	t.Helper()
	u, _ := url.Parse("http://example.test")
	cfg := config.Config{Addr: ":0", DataDir: t.TempDir(), SessionTTL: time.Hour, ImportMaxMB: 5, TrashRetentionDays: 30,
		Host: &config.HostConfig{URL: u, Token: testToken, OperatorAddr: "127.0.0.1:0", IdleTimeout: 10 * time.Minute, MaxOpen: 50}}
	clock := &fakeClock{t: time.Now()}
	o := Options{Version: "test", Now: clock.Now, Tenant: func(_ string, o *tenant.Options) { o.Web = http.NotFoundHandler() }}
	if mod != nil {
		mod(&cfg, &o)
	}
	h, err := Open(cfg, o)
	if err != nil {
		t.Fatal(err)
	}
	f := &fixture{t: t, h: h, srv: httptest.NewServer(h), op: httptest.NewServer(h.OperatorHandler()), clock: clock}
	t.Cleanup(func() {
		f.srv.Close()
		f.op.Close()
		h.Close()
	})
	return f
}

// operator calls the operator interface with the host token.
func (f *fixture) operator(method, path string, body io.Reader, hdr map[string]string) (int, []byte) {
	f.t.Helper()
	req, _ := http.NewRequest(method, f.op.URL+path, body)
	req.Header.Set("Authorization", "Bearer "+testToken)
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		f.t.Fatal(err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, b
}

// create creates an empty tenant and returns its setup token.
func (f *fixture) create(name string, limits config.Limits) string {
	f.t.Helper()
	body, _ := json.Marshal(map[string]any{"name": name, "limits": limits})
	code, out := f.operator("POST", "/operator/v1/tenants", bytes.NewReader(body), nil)
	if code != http.StatusCreated {
		f.t.Fatalf("create %s: %d %s", name, code, out)
	}
	var res struct {
		SetupToken string `json:"setupToken"`
	}
	_ = json.Unmarshal(out, &res)
	return res.SetupToken
}

// tclient talks to one tenant through the public listener.
type tclient struct {
	f    *fixture
	host string
	jar  http.CookieJar
}

func (f *fixture) client(name string) *tclient {
	jar, _ := cookiejar.New(nil)
	return &tclient{f: f, host: name + ".example.test", jar: jar}
}

func (c *tclient) request(method, path string, body io.Reader) *http.Request {
	req, _ := http.NewRequest(method, c.f.srv.URL+path, body)
	req.Host = c.host
	req.Header.Set("Content-Type", "application/json")
	if method != http.MethodGet {
		req.Header.Set("Origin", "http://"+c.host)
	}
	// The jar keys cookies by the URL's host; use the tenant's.
	for _, ck := range c.jar.Cookies(&url.URL{Scheme: "http", Host: c.host}) {
		req.AddCookie(ck)
	}
	return req
}

func (c *tclient) send(req *http.Request) (*http.Response, error) {
	resp, err := http.DefaultClient.Do(req)
	if err == nil {
		c.jar.SetCookies(&url.URL{Scheme: "http", Host: c.host}, resp.Cookies())
	}
	return resp, err
}

func (c *tclient) do(method, path string, body any) (int, map[string]any) {
	c.f.t.Helper()
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	resp, err := c.send(c.request(method, path, rd))
	if err != nil {
		c.f.t.Fatal(err)
	}
	defer resp.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out
}

// register creates the tenant's owner with its setup token and signs in.
func (c *tclient) register(email, setupToken string) string {
	c.f.t.Helper()
	code, out := c.do("POST", "/api/v1/auth/register", map[string]any{"email": email, "name": "Owner", "password": "correct horse battery", "setupToken": setupToken})
	if code != http.StatusCreated && code != http.StatusOK {
		c.f.t.Fatalf("register on %s: %d %v", c.host, code, out)
	}
	return out["user"].(map[string]any)["id"].(string)
}

func (c *tclient) login(email string) int {
	code, _ := c.do("POST", "/api/v1/auth/login", map[string]any{"email": email, "password": "correct horse battery"})
	return code
}

func errCode(out map[string]any) string {
	e, _ := out["error"].(map[string]any)
	s, _ := e["code"].(string)
	return s
}

var opSeq int64

// taskOps are the ops creating a task (title and created_at).
func taskOps(id, title string) []any {
	now := time.Now().UnixMilli()
	opSeq++
	pre := id + "-" + strings.ReplaceAll(title, " ", "") + "-"
	return []any{
		map[string]any{"id": pre + "t", "entity": "task", "entityId": id, "field": "title", "value": title, "ts": now, "device": "dev"},
		map[string]any{"id": pre + "c", "entity": "task", "entityId": id, "field": "created_at", "value": now, "ts": now, "device": "dev"},
	}
}

func (c *tclient) sync(device string, ops []any) map[string]any {
	c.f.t.Helper()
	if ops == nil {
		ops = []any{}
	}
	code, out := c.do("POST", "/api/v1/sync", map[string]any{"device": device, "cursor": 0, "ops": ops})
	if code != http.StatusOK {
		c.f.t.Fatalf("sync on %s: %d %v", c.host, code, out)
	}
	return out
}

func toJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}
