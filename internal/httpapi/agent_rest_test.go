package httpapi

import (
	"encoding/json"
	"go/ast"
	"go/parser"
	gotoken "go/token"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"

	"github.com/pixari/opentodo/internal/audit"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Agent tokens on the REST content routes (OpenSpec change `agent-ready-cli`,
// design D8) and credential introspection on /api/v1/me (design D7).

// registeredPatterns parses this package's sources for every pattern handed to
// mux.handle or mux.handler (policy.go), so a route added later is covered without
// editing the test.
func registeredPatterns(t *testing.T) []string {
	t.Helper()
	files, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	fset := gotoken.NewFileSet()
	for _, f := range files {
		if strings.HasSuffix(f, "_test.go") {
			continue
		}
		src, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		file, err := parser.ParseFile(fset, f, src, 0)
		if err != nil {
			t.Fatal(err)
		}
		ast.Inspect(file, func(n ast.Node) bool {
			call, ok := n.(*ast.CallExpr)
			if !ok || len(call.Args) == 0 {
				return true
			}
			sel, ok := call.Fun.(*ast.SelectorExpr)
			// routes.handle and routes.handler (policy.go) register every route.
			if !ok || (sel.Sel.Name != "handle" && sel.Sel.Name != "handler") {
				return true
			}
			if lit, ok := call.Args[0].(*ast.BasicLit); ok && lit.Kind == gotoken.STRING {
				p, _ := strconv.Unquote(lit.Value)
				seen[p] = true
			}
			return true
		})
	}
	out := make([]string, 0, len(seen))
	for p := range seen {
		out = append(out, p)
	}
	sort.Strings(out)
	if len(out) < 100 {
		t.Fatalf("only %d patterns found; the parser missed the registrations", len(out))
	}
	return out
}

// agentAllowed is the fixed list of design D8, written out independently of
// agentRoute so that a widened allow list fails this test.
var agentAllowed = map[string]bool{
	"POST /api/v1/tasks": true, "POST /api/v1/projects": true, "POST /api/v1/labels": true,
	"PATCH /api/v1/tasks/{id}": true, "PATCH /api/v1/projects/{id}": true,
	"DELETE /api/v1/tasks/{id}": true, "POST /api/v1/tasks/{id}/comments": true,
}

// anonymousByDesign are sign-in routes that never look at a bearer token.
var anonymousByDesign = map[string]bool{
	"POST /api/v1/auth/login": true, "POST /api/v1/auth/logout": true, "POST /api/v1/auth/register": true,
	"POST /api/v1/auth/mfa": true, "POST /api/v1/auth/passkey": true, "POST /api/v1/auth/passkey/options": true,
	"POST /api/v1/password-resets/{token}": true, "POST /api/v1/demo/sandbox": true,
	"POST /api/v1/auth/password-reset": true, "POST /api/v1/auth/verify/{token}": true,
	"POST /api/v1/public/{token}/tick":    true,
	"POST /api/v1/pages/{secret}/replies": true, "POST /api/v1/pages/{secret}/tick": true,
}

// conditional routes are registered only when their feature is on (web push,
// demo instance); unregistered, they answer 404 from the catch-all.
func conditional(p string) bool {
	return strings.Contains(p, "/push/") || strings.Contains(p, "/demo/")
}

func TestAgentRestAllowList(t *testing.T) {
	e, _, secret, c := agentReady(t)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "User's task"})
	e.mustStatus(resp, 201, out)
	userTask := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "User's project"})
	e.mustStatus(resp, 201, out)
	userProject := out["id"].(string)
	var tokensBefore int
	_ = e.db.QueryRow(`SELECT COUNT(*) FROM api_tokens`).Scan(&tokensBefore)

	type probe struct{ method, path, label string }
	var refused []probe
	var allowedSeen []string
	for _, p := range registeredPatterns(t) {
		method, path, ok := strings.Cut(p, " ")
		if !ok || !strings.HasPrefix(path, "/api/v1/") {
			// "/", "/api/", "/mcp", "/dav*": no method pattern, own auth (MCP
			// and CalDAV have their own tests); none is a requireAuth write.
			continue
		}
		if method == "GET" || method == "HEAD" {
			if path != "/api/v1/sync" {
				continue
			}
		}
		paths := []string{path}
		if strings.Contains(path, "{collection}") {
			paths = nil
			for plural := range opsync.Plural {
				paths = append(paths, strings.Replace(path, "{collection}", plural, 1))
			}
			paths = append(paths, strings.Replace(path, "{collection}", "comments", 1), strings.Replace(path, "{collection}", "tokens", 1))
		}
		for _, pth := range paths {
			label := method + " " + pth
			if agentAllowed[label] {
				allowedSeen = append(allowedSeen, label)
				continue
			}
			concrete := pth
			if strings.HasPrefix(concrete, "/api/v1/tasks/") {
				concrete = strings.Replace(concrete, "{id}", userTask, 1)
			}
			if strings.HasPrefix(concrete, "/api/v1/projects/") {
				concrete = strings.Replace(concrete, "{id}", userProject, 1)
			}
			for _, ph := range []string{"{id}", "{userId}", "{did}", "{token}"} {
				concrete = strings.ReplaceAll(concrete, ph, "x")
			}
			refused = append(refused, probe{method, concrete, label})
		}
	}
	sort.Strings(allowedSeen)
	if len(allowedSeen) != len(agentAllowed) {
		t.Fatalf("allow list coverage: %v", allowedSeen)
	}
	before := countOps(t, e)
	for _, pr := range refused {
		resp, out := c.do(pr.method, pr.path, map[string]any{}, bearer(secret)...)
		switch {
		case anonymousByDesign[pr.label]:
			if resp.StatusCode >= 200 && resp.StatusCode < 300 && pr.label != "POST /api/v1/auth/logout" {
				t.Fatalf("%s accepted an agent token: %d %v", pr.label, resp.StatusCode, out)
			}
		case conditional(pr.label) && resp.StatusCode == 404:
		case resp.StatusCode != 403 || errCode(out) != "insufficient_scope":
			t.Fatalf("%s %s with agent token: %d %v", pr.method, pr.path, resp.StatusCode, out)
		}
	}
	if len(refused) < 80 {
		t.Fatalf("only %d refused probes", len(refused))
	}
	var tokensAfter int
	_ = e.db.QueryRow(`SELECT COUNT(*) FROM api_tokens`).Scan(&tokensAfter)
	if after := countOps(t, e); after != before || tokensAfter != tokensBefore {
		t.Fatalf("refused routes changed state: ops %d → %d, tokens %d → %d", before, after, tokensBefore, tokensAfter)
	}
	resp, out = e.do("GET", "/api/v1/me/agent-access", nil)
	e.mustStatus(resp, 200, out)
	if out["allow_writes"] != true {
		t.Fatal("the user's switch moved")
	}
	// Fields without a matching tool stay refused on allowed routes.
	for _, rt := range []struct {
		method, path string
		body         map[string]any
	}{
		{"PATCH", "/api/v1/projects/" + userProject, map[string]any{"archived": true}},
		{"PATCH", "/api/v1/projects/" + userProject, map[string]any{"deleted_at": 1}},
		{"PATCH", "/api/v1/projects/" + userProject, map[string]any{"parent_id": nil}},
		{"PATCH", "/api/v1/tasks/" + userTask, map[string]any{"assignee_id": nil}},
		{"PATCH", "/api/v1/tasks/" + userTask, map[string]any{"position": 3}},
		{"PATCH", "/api/v1/tasks/" + userTask, map[string]any{"deleted_at": nil}},
		{"POST", "/api/v1/tasks", map[string]any{"title": "x", "created_at": 1}},
		{"POST", "/api/v1/tasks", map[string]any{"title": "x", "assignee_id": "someone"}},
		{"POST", "/api/v1/projects", map[string]any{"name": "x", "archived": true}},
		{"POST", "/api/v1/labels", map[string]any{"name": "x", "position": 1}},
	} {
		resp, out := c.do(rt.method, rt.path, rt.body, bearer(secret)...)
		if resp.StatusCode != 403 || errCode(out) != "insufficient_scope" {
			t.Fatalf("%s %s %v: %d %v", rt.method, rt.path, rt.body, resp.StatusCode, out)
		}
	}
	if after := countOps(t, e); after != before {
		t.Fatalf("refused fields changed state: %d → %d", before, after)
	}
	// And every allowed route works, attributed to the token.
	resp, out = c.do("POST", "/api/v1/tasks", map[string]any{"title": "Water plants", "priority": 2}, bearer(secret)...)
	c.mustStatus(resp, 201, out)
	own := out["id"].(string)
	resp, out = c.do("PATCH", "/api/v1/tasks/"+own, map[string]any{"title": "Water the plants", "due": map[string]any{"date": "2026-10-20"}}, bearer(secret)...)
	c.mustStatus(resp, 200, out)
	if out["title"] != "Water the plants" || out["due"].(map[string]any)["date"] != "2026-10-20" {
		t.Fatalf("patched task = %v", out)
	}
	resp, out = c.do("POST", "/api/v1/tasks/"+own+"/comments", map[string]any{"body": "done soon"}, bearer(secret)...)
	c.mustStatus(resp, 201, out)
	resp, out = c.do("POST", "/api/v1/projects", map[string]any{"name": "Garden", "color": "#22c55e", "archived": false}, bearer(secret)...)
	c.mustStatus(resp, 201, out)
	garden := out["id"].(string)
	resp, out = c.do("PATCH", "/api/v1/projects/"+garden, map[string]any{"name": "Garden 2"}, bearer(secret)...)
	c.mustStatus(resp, 200, out)
	if out["name"] != "Garden 2" {
		t.Fatalf("renamed project = %v", out)
	}
	resp, out = c.do("POST", "/api/v1/labels", map[string]any{"name": "outside"}, bearer(secret)...)
	c.mustStatus(resp, 201, out)
	resp, out = c.do("DELETE", "/api/v1/tasks/"+own, nil, bearer(secret)...)
	c.mustStatus(resp, 204, out)
}

func TestAgentRestSwitchOff(t *testing.T) {
	e, _, secret, c := agentReady(t)
	e.allowMyAssistants(false)
	resp, out := c.do("POST", "/api/v1/tasks", map[string]any{"title": "Water plants"}, bearer(secret)...)
	if resp.StatusCode != 403 || errCode(out) != "writes_disabled_by_user" {
		t.Fatalf("user switch off: %d %v", resp.StatusCode, out)
	}
	// A keyed create is refused the same way (no replay lookup first).
	resp, out = c.do("POST", "/api/v1/tasks", map[string]any{"title": "Water plants"}, keyHeader("k1", bearer(secret)...)...)
	if resp.StatusCode != 403 || errCode(out) != "writes_disabled_by_user" {
		t.Fatalf("keyed, user switch off: %d %v", resp.StatusCode, out)
	}
	e.allowMyAssistants(true)
	e.allowWrites(false)
	resp, out = c.do("POST", "/api/v1/tasks", map[string]any{"title": "Water plants"}, bearer(secret)...)
	if resp.StatusCode != 403 || errCode(out) != "writes_disabled_by_owner" {
		t.Fatalf("owner switch off: %d %v", resp.StatusCode, out)
	}
	if n := countOps(t, e); n != 0 {
		t.Fatalf("ops = %d", n)
	}
	evs := e.events(audit.AgentWriteName)
	if len(evs) != 3 || evs[0].Outcome != "failure" || evs[0].Details["reason"] != "writes_disabled_by_owner" {
		t.Fatalf("refusals not audited like MCP: %+v", evs)
	}
}

func TestAgentRestEncrypted409(t *testing.T) {
	e, _, secret, c := agentReady(t)
	resp, out := e.do("PUT", "/api/v1/encryption/keys", keyRecord(1, 1))
	e.mustStatus(resp, 201, out)
	cipher := "enc:v1:" + strings.Repeat("A", 40)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": cipher})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	before := countOps(t, e)
	for _, rt := range []struct {
		method, path string
		body         map[string]any
	}{
		{"POST", "/api/v1/tasks", map[string]any{"title": "Plain"}},
		{"PATCH", "/api/v1/tasks/" + id, map[string]any{"title": "Plain"}},
		{"POST", "/api/v1/tasks/" + id + "/comments", map[string]any{"body": "Plain"}},
		{"POST", "/api/v1/projects", map[string]any{"name": "Plain"}},
	} {
		resp, out := c.do(rt.method, rt.path, rt.body, bearer(secret)...)
		if resp.StatusCode != 409 || errCode(out) != "encryption_enabled" {
			t.Fatalf("%s %s: %d %v", rt.method, rt.path, resp.StatusCode, out)
		}
	}
	if countOps(t, e) != before {
		t.Fatal("a refused write stored ops")
	}
	// Structural changes still work.
	resp, out = c.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"priority": 1, "completed_at": 1}, bearer(secret)...)
	c.mustStatus(resp, 200, out)
	if out["priority"] != float64(1) || out["completed_at"] == nil || out["title"] != cipher {
		t.Fatalf("structural patch = %v", out)
	}
}

func TestAgentRestSharesLimitsWithMcp(t *testing.T) {
	e, _, secret, c := agentReady(t)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Target"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	for i := 0; i < 29; i++ {
		c.mustTool(secret, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": id, "priority": 1 + i%4}}})
	}
	resp, out = c.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"priority": 2}, bearer(secret)...)
	c.mustStatus(resp, 200, out) // the 30th write call in the minute
	before := e.taskField(id, "priority")
	resp, out = c.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"priority": 3}, bearer(secret)...)
	if resp.StatusCode != 429 || errCode(out) != "rate_limited" || resp.Header.Get("Retry-After") == "" {
		t.Fatalf("31st call over REST: %d %v %q", resp.StatusCode, out, resp.Header.Get("Retry-After"))
	}
	if sc, isErr := c.toolCall(secret, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": id, "priority": 4}}}); !isErr || sc["error"] != "rate_limited" {
		t.Fatalf("MCP after REST used the budget: %v", sc)
	}
	if e.taskField(id, "priority") != before {
		t.Fatal("a rate-limited call changed the task")
	}
}

func TestAgentRestAttributionAuditAndSync(t *testing.T) {
	e, tokenID, secret, c := agentReady(t)
	resp, out := c.do("POST", "/api/v1/tasks", map[string]any{"title": "Water plants"}, bearer(secret)...)
	c.mustStatus(resp, 201, out)
	id := out["id"].(string)
	devs := devicesOf(t, e, id)
	if len(devs) != 1 || devs[opsync.AgentDevice(tokenID)] == 0 {
		t.Fatalf("devices = %v", devs)
	}
	evs := e.events(audit.AgentWriteName)
	if len(evs) != 1 || evs[0].Details["tool"] != "create_tasks" || evs[0].Details["token_id"] != tokenID || evs[0].Outcome != "success" {
		t.Fatalf("audit = %+v", evs)
	}
	phone := syncOnce(e, "phone", 0, nil)
	found := false
	for _, op := range phone["ops"].([]any) {
		if op.(map[string]any)["entityId"] == id {
			found = true
		}
	}
	if !found {
		t.Fatal("the phone did not receive the agent's task")
	}
	// Only its own creations go to the Trash; restoring is refused.
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "User's"})
	e.mustStatus(resp, 201, out)
	resp, out = c.do("DELETE", "/api/v1/tasks/"+out["id"].(string), nil, bearer(secret)...)
	if resp.StatusCode != 403 || errCode(out) != "not_permitted" {
		t.Fatalf("trash a user's task: %d %v", resp.StatusCode, out)
	}
	resp, out = c.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"deleted_at": 1}, bearer(secret)...)
	c.mustStatus(resp, 200, out)
	if out["deleted_at"] == nil {
		t.Fatalf("own task not trashed: %v", out)
	}
	// Unknown ids are not found.
	resp, out = c.do("PATCH", "/api/v1/tasks/nope", map[string]any{"priority": 1}, bearer(secret)...)
	if resp.StatusCode != 404 || errCode(out) != "not_found" {
		t.Fatalf("unknown id: %d %v", resp.StatusCode, out)
	}
}

func TestAgentRestCommentNoMention(t *testing.T) {
	se := newShareEnv(t)
	se.share(se.alice, "bob@example.com", "editor")
	se.alice.allowWrites(true)
	se.alice.allowMyAssistants(true)
	_, secret := se.alice.namedToken("Alice's assistant", "agent")
	c := se.alice.bearerClient()
	resp, out := c.do("POST", "/api/v1/tasks/"+se.task+"/comments", map[string]any{"body": "@bob look", "mentions": []string{se.ids["bob"]}}, bearer(secret)...)
	c.mustStatus(resp, 201, out)
	if m, _ := out["mentions"].([]any); len(m) != 0 {
		t.Fatalf("assistant comment carries mentions: %v", out)
	}
	resp, out = se.bob.do("GET", "/api/v1/notifications", nil)
	se.bob.mustStatus(resp, 200, out)
	raw, _ := json.Marshal(out)
	if strings.Contains(string(raw), "mention") {
		t.Fatalf("bob was notified: %s", raw)
	}
	anon := newClientAt(se.alice, "203.0.113.77")
	resp, out = anon.do("POST", "/api/v1/tasks/"+se.task+"/comments", map[string]any{"body": "x"}, "Cookie", "")
	if resp.StatusCode != 401 || errCode(out) != "unauthorized" {
		t.Fatalf("anonymous comment: %d %v", resp.StatusCode, out)
	}
}

func TestAgentRestIdempotency(t *testing.T) {
	e, _, secret, c := agentReady(t)
	h := keyHeader("run42-milk", bearer(secret)...)
	resp, first := c.do("POST", "/api/v1/tasks", map[string]any{"title": "Buy milk"}, h...)
	c.mustStatus(resp, 201, first)
	resp, again := c.do("POST", "/api/v1/tasks", map[string]any{"title": "Buy milk"}, h...)
	c.mustStatus(resp, 200, again)
	if again["id"] != first["id"] || resp.Header.Get(ReplayedHeader) != "true" || countTitled(t, e, "Buy milk") != 1 {
		t.Fatalf("agent replay: %v %v", first, again)
	}
	resp, out := c.do("POST", "/api/v1/tasks", map[string]any{"title": "Buy bread"}, h...)
	if resp.StatusCode != 409 || errCode(out) != "idempotency_conflict" {
		t.Fatalf("agent conflict: %d %v", resp.StatusCode, out)
	}
	// Labels: the replay of a keyed label, then the key reused for another name.
	lh := keyHeader("lbl-1", bearer(secret)...)
	resp, l1 := c.do("POST", "/api/v1/labels", map[string]any{"name": "errand"}, lh...)
	c.mustStatus(resp, 201, l1)
	resp, l2 := c.do("POST", "/api/v1/labels", map[string]any{"name": "errand"}, lh...)
	c.mustStatus(resp, 200, l2)
	if l2["id"] != l1["id"] || resp.Header.Get(ReplayedHeader) != "true" {
		t.Fatalf("label replay: %v %v", l1, l2)
	}
	resp, out = c.do("POST", "/api/v1/labels", map[string]any{"name": "chore"}, lh...)
	if resp.StatusCode != 409 || errCode(out) != "idempotency_conflict" {
		t.Fatalf("label conflict: %d %v", resp.StatusCode, out)
	}
	// The same key from a full token names another entity (per token).
	resp, full := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Buy milk"}, keyHeader("run42-milk")...)
	e.mustStatus(resp, 201, full)
	if full["id"] == first["id"] {
		t.Fatal("an agent key and a session key named one entity")
	}
	resp, out = c.do("POST", "/api/v1/tasks", map[string]any{"title": "x"}, keyHeader("bad key", bearer(secret)...)...)
	if resp.StatusCode != 400 || errCode(out) != "invalid_input" {
		t.Fatalf("invalid key: %d %v", resp.StatusCode, out)
	}
}

func TestMeAuthIntrospection(t *testing.T) {
	e, tokenID, secret, c := agentReady(t)
	resp, out := e.do("GET", "/api/v1/me", nil)
	e.mustStatus(resp, 200, out)
	a := out["auth"].(map[string]any)
	if a["method"] != "session" || a["scope"] != "full" || a["token_id"] != nil {
		t.Fatalf("session auth = %v", a)
	}
	check := func(secret, scope, wantID string) map[string]any {
		t.Helper()
		resp, out := c.do("GET", "/api/v1/me", nil, bearer(secret)...)
		c.mustStatus(resp, 200, out)
		raw, _ := json.Marshal(out)
		if strings.Contains(string(raw), secret) || strings.Contains(string(raw), "token_hash") {
			t.Fatalf("/me leaks the secret: %s", raw)
		}
		a := out["auth"].(map[string]any)
		if a["method"] != "token" || a["scope"] != scope || a["token_name"] == nil || (wantID != "" && a["token_id"] != wantID) {
			t.Fatalf("%s auth = %v", scope, a)
		}
		return a
	}
	ag := check(secret, "agent", tokenID)
	if ag["writes_allowed"] != true || ag["writes_denied"] != nil {
		t.Fatalf("agent switches = %v", ag)
	}
	e.allowMyAssistants(false)
	if ag = check(secret, "agent", tokenID); ag["writes_allowed"] != false || ag["writes_denied"] != "writes_disabled_by_user" {
		t.Fatalf("agent switches off = %v", ag)
	}
	full := check(e.token("full"), "full", "")
	if _, ok := full["writes_allowed"]; ok {
		t.Fatalf("full token carries agent fields: %v", full)
	}
	check(e.token("read"), "read", "")
	resp, out = e.do("DELETE", "/api/v1/tokens/"+tokenID, nil)
	e.mustStatus(resp, 204, out)
	resp, out = c.do("GET", "/api/v1/me", nil, bearer(secret)...)
	if resp.StatusCode != 401 || errCode(out) != "unauthorized" || out["auth"] != nil {
		t.Fatalf("revoked token: %d %v", resp.StatusCode, out)
	}
	anon := newClientAt(e, "203.0.113.78")
	if resp, out = anon.do("GET", "/api/v1/me", nil, "Cookie", ""); resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous: %d %v", resp.StatusCode, out)
	}
}
