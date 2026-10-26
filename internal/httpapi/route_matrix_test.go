package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"sort"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/rules"
	"github.com/pixari/opentodo/internal/settings"
	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Route matrix (wave 2 of the 2026-10 audit, G4): every route of the router's
// own table is called anonymously, with read, agent, full and admin tokens, as
// a member, as a viewer of a shared project, cross-site, and with a stale
// session, and the answer is checked against the route's declared policy. The
// table drives the test, so a new route is covered without editing it.
//
// Writes are only sent where the policy must refuse them before the handler
// runs; admission is checked on reads, where reaching the handler is harmless.
// A body of "{}" is sent with every write; sample paths use "x" for every
// wildcard, so handlers that do run answer 400 or 404.

// matrixEnv is the owner (session and one token of each scope) and a member
// who views one of the owner's projects.
type matrixEnv struct {
	*env
	srv                       *Server
	full, read, agent, admin  string
	member                    *env
	sharedProject, sharedTask string
	clockOffset               atomic.Int64
	anon                      *env
}

func newMatrixEnv(t *testing.T) *matrixEnv {
	t.Helper()
	m := &matrixEnv{}
	// Like newEnv, plus what production always wires (the automations switch)
	// and a clock that can make the owner's session stale.
	dir := t.TempDir()
	db, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	cfg := config.Config{SessionTTL: time.Hour, DataDir: dir}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	syncSvc := opsync.NewService(db)
	authSvc := auth.NewService(db, cfg.SessionTTL, false)
	authSvc.SetClock(func() time.Time { return time.Now().Add(time.Duration(m.clockOffset.Load())) })
	h := New(cfg, authSvc, syncSvc, nil, log, "test",
		WithRules(nil, rules.NewSwitch(settings.New(db), nil)), func(s *Server) { m.srv = s })
	ts := httptest.NewServer(h)
	t.Cleanup(ts.Close)
	t.Cleanup(syncSvc.Notifier().CloseAll)
	jar, _ := cookiejar.New(nil)
	e := &env{t: t, srv: ts, client: &http.Client{Jar: jar}, db: db, handler: h, sync: syncSvc}
	m.env = e
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	for scope, dst := range map[string]*string{"full": &m.full, "read": &m.read, "agent": &m.agent, "admin": &m.admin} {
		resp, out := e.do("POST", "/api/v1/tokens", map[string]string{"name": scope + " script", "scope": scope})
		e.mustStatus(resp, 201, out)
		*dst = out["secret"].(string)
	}
	m.member, _ = e.member("member@example.com", "203.0.113.41")
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Shared"})
	e.mustStatus(resp, 201, out)
	m.sharedProject = out["id"].(string)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Shared task", "project_id": m.sharedProject})
	e.mustStatus(resp, 201, out)
	m.sharedTask = out["id"].(string)
	resp, out = e.do("POST", "/api/v1/projects/"+m.sharedProject+"/members", map[string]any{"email": "member@example.com", "role": "viewer"})
	if resp.StatusCode != 200 && resp.StatusCode != 201 {
		t.Fatalf("share as viewer: %d %v", resp.StatusCode, out)
	}
	m.anon = newClientAt(e, "203.0.113.42")
	return m
}

// call sends one request with a short timeout (event streams answer and then
// stay open; a timeout after the headers counts as admitted).
func (m *matrixEnv) call(c *env, method, path string, headers ...string) (int, string) {
	m.t.Helper()
	var body io.Reader
	if method != "GET" && method != "HEAD" {
		body = bytes.NewReader([]byte("{}"))
	}
	req, _ := http.NewRequest(method, m.srv0()+path, body)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.ip != "" {
		req.Header.Set("X-Forwarded-For", c.ip)
	}
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	client := &http.Client{Jar: c.client.Jar, Timeout: 3 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := client.Do(req)
	if err != nil {
		var ne net.Error
		if errors.As(err, &ne) && ne.Timeout() {
			return 200, "" // a stream that started: the handler ran
		}
		m.t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()
	var out map[string]any
	if strings.HasPrefix(resp.Header.Get("Content-Type"), "application/json") {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		_ = json.Unmarshal(raw, &out)
	}
	return resp.StatusCode, errCode(out)
}

func (m *matrixEnv) srv0() string { return m.env.srv.URL }

// policyRefusals are the codes requireAuth and admits answer with.
var policyRefusals = map[string]bool{"unauthorized": true, "insufficient_scope": true, "session_required": true, "forbidden": true, "reauth_required": true, "bad_origin": true}

func admitted(status int, code string) bool {
	return status != http.StatusUnauthorized && !(status == http.StatusForbidden && policyRefusals[code])
}

// agentContent reports whether an agent token's write to this path runs
// through the agent tool registry (agentRoute) instead of being refused.
func (r matrixRoute) agentContent() bool {
	req, err := http.NewRequest(r.method, r.path, nil)
	if err != nil {
		return false
	}
	req.Pattern = r.pattern
	_, path, _ := strings.Cut(r.pattern, " ")
	pat, real := strings.Split(path, "/"), strings.Split(r.path, "/")
	for i, seg := range pat {
		if strings.HasPrefix(seg, "{") && i < len(real) {
			req.SetPathValue(strings.Trim(seg, "{}."), real[i])
		}
	}
	return agentRoute(req) != ""
}

type matrixRoute struct {
	pattern, method, path string
	p                     routePolicy
}

// write is what requireAuth treats as a write (quick-add parsing is a POST
// that only reads, isReadOnlyPost).
func (r matrixRoute) write() bool {
	return r.method != "GET" && r.method != "HEAD" && !(r.method == "POST" && r.path == parsePath)
}

func matrixRoutes(table []routeEntry) []matrixRoute {
	var out []matrixRoute
	for _, e := range table {
		method, path, ok := strings.Cut(e.pattern, " ")
		methods := []string{method}
		if !ok {
			path, methods = e.pattern, []string{"GET", "POST"}
		}
		for _, mth := range methods {
			out = append(out, matrixRoute{pattern: e.pattern, method: mth, path: samplePath(path), p: e.policy})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].pattern+out[i].method < out[j].pattern+out[j].method })
	return out
}

func TestRouteMatrix(t *testing.T) {
	m := newMatrixEnv(t)
	routes := matrixRoutes(m.srv.routeTable)
	if len(routes) < 150 {
		t.Fatalf("only %d routes in the table", len(routes))
	}
	bearer := func(tok string) []string { return []string{"Authorization", "Bearer " + tok} }
	expect := func(r matrixRoute, who string, status int, code, want string) {
		t.Helper()
		if code != want {
			t.Errorf("%s %s (%s) as %s = %d %q, want 403 %q", r.method, r.path, r.pattern, who, status, code, want)
		}
	}
	expectAdmitted := func(r matrixRoute, who string, status int, code string) {
		t.Helper()
		if !admitted(status, code) {
			t.Errorf("%s %s (%s) as %s = %d %q, want it admitted", r.method, r.path, r.pattern, who, status, code)
		}
	}
	// tokenRefusal is what a token of scope gets on r, "" when admitted.
	tokenRefusal := func(r matrixRoute, scope string) string {
		limited := scope == "read" || scope == "agent"
		switch {
		case limited && r.write():
			return "insufficient_scope" // requireAuth, before the route's policy
		case r.p.tokens == tokensNone:
			return "session_required"
		case r.p.tokens == tokensAdmin && scope != "admin":
			return "insufficient_scope"
		case r.p.tokens == tokensFull && limited:
			return "insufficient_scope"
		}
		return ""
	}
	checked := map[string]int{}
	tokens := []struct{ scope, secret string }{{"read", m.read}, {"agent", m.agent}, {"full", m.full}, {"admin", m.admin}}

	// 1. Refusals: none of these reach a handler.
	for _, r := range routes {
		if r.p.kind == kindPublic {
			continue
		}
		status, code := m.call(m.anon, r.method, r.path)
		if status != http.StatusUnauthorized {
			t.Errorf("%s %s (%s) anonymously = %d %q, want 401", r.method, r.path, r.pattern, status, code)
		}
		checked["anonymous"]++
		for _, tok := range tokens {
			if want := tokenRefusal(r, tok.scope); want != "" {
				status, code := m.call(m.anon, r.method, r.path, bearer(tok.secret)...)
				if tok.scope == "agent" && r.agentContent() {
					// The agent tool registry answers instead (its own
					// switches; off here), never the regular handler.
					if status != http.StatusForbidden {
						t.Errorf("%s %s as agent token = %d %q, want the agent gate's 403", r.method, r.path, status, code)
					}
					continue
				}
				expect(r, tok.scope+" token", status, code, want)
				checked["token refusals"]++
			}
		}
		if r.p.role != anyRole {
			status, code := m.call(m.member, r.method, r.path)
			expect(r, "member", status, code, "forbidden")
			checked["member refusals"]++
		}
		if r.write() {
			status, code := m.call(m.env, r.method, r.path, "Origin", "https://evil.example")
			expect(r, "owner cross-site", status, code, "bad_origin")
			checked["cross-site"]++
		}
	}

	// 2. Admission on reads: every credential the policy allows gets past it.
	for _, r := range routes {
		if r.p.kind == kindPublic || r.write() {
			continue
		}
		status, code := m.call(m.env, r.method, r.path)
		expectAdmitted(r, "owner session", status, code)
		checked["admitted reads"]++
		for _, tok := range tokens {
			if tokenRefusal(r, tok.scope) == "" {
				status, code := m.call(m.anon, r.method, r.path, bearer(tok.secret)...)
				expectAdmitted(r, tok.scope+" token", status, code)
			}
		}
		if r.p.role == anyRole {
			status, code := m.call(m.member, r.method, r.path)
			expectAdmitted(r, "member", status, code)
		}
	}

	// 3. A viewer of a shared project changes nothing in it.
	for _, r := range routes {
		if r.p.kind == kindPublic || !r.write() {
			continue
		}
		var path string
		switch {
		case strings.HasPrefix(r.pattern, r.method+" /api/v1/projects/{"):
			path = strings.Replace(r.path, "/api/v1/projects/x", "/api/v1/projects/"+m.sharedProject, 1)
		case strings.HasPrefix(r.pattern, r.method+" /api/v1/tasks/{"):
			path = strings.Replace(r.path, "/api/v1/tasks/x", "/api/v1/tasks/"+m.sharedTask, 1)
		case r.pattern == r.method+" /api/v1/{collection}/{id}":
			path = "/api/v1/tasks/" + m.sharedTask
		default:
			continue
		}
		if viewerMayWrite[r.method+" "+strings.ReplaceAll(strings.ReplaceAll(path, m.sharedProject, "{project}"), m.sharedTask, "{task}")] {
			continue
		}
		status, code := m.call(m.member, r.method, path)
		if status >= 200 && status < 300 {
			t.Errorf("%s %s (%s) as a viewer = %d %q, want a refusal", r.method, path, r.pattern, status, code)
		}
		checked["viewer writes"]++
	}

	// 4. Recent sign-in: a stale owner session is asked to confirm.
	m.clockOffset.Store(int64(FreshWindow + time.Minute))
	for _, r := range routes {
		if r.p.kind == kindPublic || !r.p.fresh {
			continue
		}
		status, code := m.call(m.env, r.method, r.path)
		expect(r, "stale owner session", status, code, "reauth_required")
		checked["stale session"]++
	}
	// Each pass must have had something to check.
	for _, pass := range []string{"anonymous", "token refusals", "member refusals", "cross-site", "admitted reads", "viewer writes", "stale session"} {
		if checked[pass] < 5 {
			t.Errorf("pass %q checked only %d routes", pass, checked[pass])
		}
	}
	t.Logf("checked: %v", checked)
}

// viewerMayWrite are the writes a viewer of a shared project is allowed (with
// the project or task id written as {project} or {task}).
var viewerMayWrite = map[string]bool{}
