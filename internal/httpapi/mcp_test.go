package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/ids"
	"github.com/pixari/opentodo/internal/mcp"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// mcpPost sends a raw JSON-RPC body to /mcp with the usual client headers.
func (e *env) mcpPost(secret string, body string, headers ...string) (*http.Response, []byte) {
	e.t.Helper()
	req, _ := http.NewRequest("POST", e.srv.URL+"/mcp", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	if secret != "" {
		req.Header.Set("Authorization", "Bearer "+secret)
	}
	if e.ip != "" {
		req.Header.Set("X-Forwarded-For", e.ip)
	}
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	resp, err := e.client.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	return resp, raw
}

var rpcSeq int

// rpc sends one request and returns the decoded JSON-RPC response (status 200).
func (e *env) rpc(secret, method string, params any) map[string]any {
	e.t.Helper()
	rpcSeq++
	b, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": rpcSeq, "method": method, "params": params})
	resp, raw := e.mcpPost(secret, string(b))
	if resp.StatusCode != 200 || !strings.HasPrefix(resp.Header.Get("Content-Type"), "application/json") {
		e.t.Fatalf("%s: status %d %s: %s", method, resp.StatusCode, resp.Header.Get("Content-Type"), raw)
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		e.t.Fatalf("%s: %s", method, raw)
	}
	if out["id"].(float64) != float64(rpcSeq) || out["jsonrpc"] != "2.0" {
		e.t.Fatalf("%s: envelope %v", method, out)
	}
	return out
}

// mcpTool calls a tool and returns its structured content (failing on errors).
func (e *env) mcpTool(secret, name string, args map[string]any) map[string]any {
	e.t.Helper()
	out := e.rpc(secret, "tools/call", map[string]any{"name": name, "arguments": args})
	res, ok := out["result"].(map[string]any)
	if !ok || res["isError"] == true {
		e.t.Fatalf("%s: %v", name, out)
	}
	// The text content carries the same object as structuredContent.
	var fromText map[string]any
	if err := json.Unmarshal([]byte(res["content"].([]any)[0].(map[string]any)["text"].(string)), &fromText); err != nil {
		e.t.Fatalf("%s text: %v", name, err)
	}
	a, _ := json.Marshal(fromText)
	b, _ := json.Marshal(res["structuredContent"])
	if !bytes.Equal(a, b) {
		e.t.Fatalf("%s: text and structuredContent differ", name)
	}
	return res["structuredContent"].(map[string]any)
}

func (e *env) enableMCP(on bool) {
	e.t.Helper()
	resp, out := e.do("PUT", "/api/v1/settings/mcp", map[string]any{"enabled": on})
	e.mustStatus(resp, 200, out)
	if out["enabled"] != on {
		e.t.Fatalf("enabled = %v", out)
	}
}

func rpcCode(out map[string]any) float64 {
	e, _ := out["error"].(map[string]any)
	c, _ := e["code"].(float64)
	return c
}

func taskTitles(list any) []string {
	out := []string{}
	for _, it := range list.([]any) {
		out = append(out, it.(map[string]any)["untrusted_text"].(map[string]any)["title"].(string))
	}
	return out
}

func TestMcpDisabled404(t *testing.T) {
	e := ownerEnv(t)
	secret := e.token("read")
	for _, method := range []string{"POST", "GET", "DELETE"} {
		req, _ := http.NewRequest(method, e.srv.URL+"/mcp", strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"ping"}`))
		req.Header.Set("Authorization", "Bearer "+secret)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != 404 {
			t.Fatalf("%s while disabled: %d", method, resp.StatusCode)
		}
	}
	// An unknown token is 404 too: credentials are not evaluated while disabled.
	if resp, _ := e.bearerClient().mcpPost("ot_bogus", `{"jsonrpc":"2.0","id":1,"method":"ping"}`); resp.StatusCode != 404 {
		t.Fatalf("bogus token while disabled: %d", resp.StatusCode)
	}
	// Enabling takes effect at once, without a restart; disabling again too.
	e.enableMCP(true)
	if out := e.bearerClient().rpc(secret, "ping", nil); out["result"] == nil {
		t.Fatalf("ping: %v", out)
	}
	e.enableMCP(false)
	if resp, _ := e.bearerClient().mcpPost(secret, `{"jsonrpc":"2.0","id":1,"method":"ping"}`); resp.StatusCode != 404 {
		t.Fatalf("after disabling: %d", resp.StatusCode)
	}
}

func TestMcpSettingForbidsMembers(t *testing.T) {
	e := ownerEnv(t)
	m, _ := e.member("member@example.com", "198.51.100.7")
	resp, out := m.do("PUT", "/api/v1/settings/mcp", map[string]any{"enabled": true})
	if resp.StatusCode != 403 || errCode(out) != "forbidden" {
		t.Fatalf("member PUT: %d %v", resp.StatusCode, out)
	}
	// Members can read the status (the AI assistants section shows it).
	resp, out = m.do("GET", "/api/v1/settings/mcp", nil)
	m.mustStatus(resp, 200, out)
	if out["enabled"] != false || !strings.HasSuffix(out["endpoint"].(string), "/mcp") {
		t.Fatalf("member GET: %v", out)
	}
	// Unauthenticated requests are refused.
	resp, out = newClientFor(e).do("GET", "/api/v1/settings/mcp", nil)
	if resp.StatusCode != 401 {
		t.Fatalf("anonymous GET: %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("PUT", "/api/v1/settings/mcp", map[string]any{"enabled": "yes"})
	if resp.StatusCode != 400 {
		t.Fatalf("bad body: %d %v", resp.StatusCode, out)
	}
	e.enableMCP(true)
	evs := e.events(audit.SettingsChangedName)
	if len(evs) != 1 || evs[0].Details["setting"] != mcp.SettingKey || evs[0].Details["to"] != "true" {
		t.Fatalf("settings.changed = %+v", evs)
	}
	// The member's own view now says enabled.
	_, out = m.do("GET", "/api/v1/settings/mcp", nil)
	if out["enabled"] != true {
		t.Fatalf("member GET after enabling: %v", out)
	}
}

func TestMcpCookieRejected401(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	// e carries the owner's session cookie and no bearer token.
	resp, raw := e.mcpPost("", `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_projects"}}`)
	if resp.StatusCode != 401 || !strings.HasPrefix(resp.Header.Get("WWW-Authenticate"), "Bearer") {
		t.Fatalf("cookie only: %d %q %s", resp.StatusCode, resp.Header.Get("WWW-Authenticate"), raw)
	}
	if strings.Contains(string(raw), "projects") && strings.Contains(string(raw), "result") {
		t.Fatalf("data returned: %s", raw)
	}
	// The icon catalogue holds no user data and is still behind the token (mcp-projects).
	resp, raw = e.mcpPost("", `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_icons","arguments":{"query":"plant"}}}`)
	if resp.StatusCode != 401 || !strings.HasPrefix(resp.Header.Get("WWW-Authenticate"), "Bearer") || strings.Contains(string(raw), "sprout") {
		t.Fatalf("list_icons without a token: %d %s", resp.StatusCode, raw)
	}
}

func TestMcpRevokedTokenRateLimited(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	secret := e.token("read")
	resp, out := e.do("GET", "/api/v1/tokens", nil)
	e.mustStatus(resp, 200, out)
	id := out["tokens"].([]any)[0].(map[string]any)["id"].(string)
	resp, out = e.do("DELETE", "/api/v1/tokens/"+id, nil)
	e.mustStatus(resp, 204, out)
	c := newClientAt(e, "192.0.2.99")
	for i := 0; i < 10; i++ {
		if resp, _ := c.mcpPost(secret, `{"jsonrpc":"2.0","id":1,"method":"ping"}`); resp.StatusCode != 401 {
			t.Fatalf("attempt %d with revoked token: %d", i, resp.StatusCode)
		}
	}
	if resp, _ := c.mcpPost(secret, `{"jsonrpc":"2.0","id":1,"method":"ping"}`); resp.StatusCode != 429 {
		t.Fatalf("after 10 failures: %d", resp.StatusCode)
	}
	// Another address is unaffected, and a valid token works there.
	good := e.token("read")
	if out := newClientAt(e, "192.0.2.100").rpc(good, "ping", nil); out["result"] == nil {
		t.Fatalf("other address: %v", out)
	}
}

func TestMcpDeactivatedAccountRefused(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	m, mid := e.member("member@example.com", "198.51.100.8")
	secret := m.token("read")
	if out := m.bearerClient().rpc(secret, "ping", nil); out["result"] == nil {
		t.Fatalf("active member: %v", out)
	}
	resp, out := e.do("POST", "/api/v1/users/"+mid+"/deactivate", nil)
	e.mustStatus(resp, 200, out)
	if resp, _ := m.bearerClient().mcpPost(secret, `{"jsonrpc":"2.0","id":1,"method":"ping"}`); resp.StatusCode != 401 {
		t.Fatalf("deactivated member: %d", resp.StatusCode)
	}
}

func TestMcpBadOrigin403(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	secret := e.token("read")
	c := e.bearerClient()
	resp, raw := c.mcpPost(secret, `{"jsonrpc":"2.0","id":1,"method":"ping"}`, "Origin", "https://evil.example")
	if resp.StatusCode != 403 || !strings.Contains(string(raw), "bad_origin") {
		t.Fatalf("foreign origin: %d %s", resp.StatusCode, raw)
	}
	resp, _ = c.mcpPost(secret, `{"jsonrpc":"2.0","id":1,"method":"ping"}`, "Origin", strings.Replace(e.srv.URL, "127.0.0.1", "127.0.0.1", 1))
	if resp.StatusCode != 200 {
		t.Fatalf("same origin: %d", resp.StatusCode)
	}
}

func TestMcpBodyTooLarge413(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	secret := e.token("read")
	big := `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_tasks","arguments":{"query":"` + strings.Repeat("a", 1<<20) + `"}}}`
	resp, _ := e.bearerClient().mcpPost(secret, big)
	if resp.StatusCode != 413 {
		t.Fatalf("1 MB body: %d", resp.StatusCode)
	}
}

func TestMcpGet405(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	secret := e.token("read")
	for _, method := range []string{"GET", "DELETE", "PUT"} {
		req, _ := http.NewRequest(method, e.srv.URL+"/mcp", nil)
		req.Header.Set("Authorization", "Bearer "+secret)
		req.Header.Set("Accept", "text/event-stream")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != 405 || resp.Header.Get("Allow") != "POST" {
			t.Fatalf("%s: %d allow=%q", method, resp.StatusCode, resp.Header.Get("Allow"))
		}
	}
}

func TestMcpTransportNegotiation(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	secret := e.token("full") // MCP accepts full tokens too
	c := e.bearerClient()
	if resp, _ := c.mcpPost(secret, `{"jsonrpc":"2.0","id":1,"method":"ping"}`, "Accept", "text/event-stream"); resp.StatusCode != 406 {
		t.Fatalf("SSE-only Accept: %d", resp.StatusCode)
	}
	if resp, _ := c.mcpPost(secret, `{"jsonrpc":"2.0","id":1,"method":"ping"}`, "MCP-Protocol-Version", "1999-01-01"); resp.StatusCode != 400 {
		t.Fatalf("unsupported protocol header: %d", resp.StatusCode)
	}
	if resp, raw := c.mcpPost(secret, `{"jsonrpc":"2.0","id":1,"method":"ping"}`, "MCP-Protocol-Version", "2025-06-18"); resp.StatusCode != 200 {
		t.Fatalf("supported protocol header: %d %s", resp.StatusCode, raw)
	}
	// bound-hostile-input: revisions after 2025-03-26 removed JSON-RPC batches.
	batch := `[{"jsonrpc":"2.0","id":1,"method":"ping"},{"jsonrpc":"2.0","id":2,"method":"ping"}]`
	if resp, raw := c.mcpPost(secret, batch, "MCP-Protocol-Version", "2025-06-18"); resp.StatusCode != 400 || !strings.Contains(string(raw), "-32600") {
		t.Fatalf("batch under 2025-06-18: %d %s", resp.StatusCode, raw)
	}
	if resp, raw := c.mcpPost(secret, batch); resp.StatusCode != 200 || !strings.HasPrefix(string(raw), "[") {
		t.Fatalf("batch without a protocol header: %d %s", resp.StatusCode, raw)
	}
	if resp, raw := c.mcpPost(secret, `{"jsonrpc":"2.0","method":"notifications/initialized"}`); resp.StatusCode != 202 || len(raw) != 0 {
		t.Fatalf("notification: %d %s", resp.StatusCode, raw)
	}
	resp, raw := c.mcpPost(secret, `{"jsonrpc":"2.0","id":1,"method"`)
	if resp.StatusCode != 400 || !strings.Contains(string(raw), "-32700") {
		t.Fatalf("parse error: %d %s", resp.StatusCode, raw)
	}
	if resp.Header.Get("Mcp-Session-Id") != "" {
		t.Fatal("stateless server issued a session id")
	}
}

// seedTask writes a task through the op log as a device of uid would.
func seedOps(t *testing.T, e *env, uid, entity, id string, fields map[string]any) {
	t.Helper()
	ts := time.Now().UnixMilli() - 30_000
	var ops []opsync.Op
	for k, v := range fields {
		raw, _ := json.Marshal(v)
		ts++
		ops = append(ops, opsync.Op{ID: ids.New(), Entity: entity, EntityID: id, Field: k, Value: raw, TS: ts, Device: "seed"})
	}
	if _, err := e.sync.ApplyStrict(context.Background(), uid, ops); err != nil {
		t.Fatal(err)
	}
}

func TestMcpSession(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Garden"})
	e.mustStatus(resp, 201, out)
	pid := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Water the dentist's ferns", "project_id": pid, "priority": 2,
		"due": map[string]any{"date": time.Now().UTC().AddDate(0, 0, -1).Format("2006-01-02")}})
	e.mustStatus(resp, 201, out)
	tid := out["id"].(string)
	secret := e.token("read")
	c := e.bearerClient()

	init := c.rpc(secret, "initialize", map[string]any{"protocolVersion": "2025-06-18", "capabilities": map[string]any{},
		"clientInfo": map[string]any{"name": "test-client", "version": "1.0"}})
	if init["result"].(map[string]any)["protocolVersion"] != "2025-06-18" {
		t.Fatalf("initialize: %v", init)
	}
	if resp, _ := c.mcpPost(secret, `{"jsonrpc":"2.0","method":"notifications/initialized"}`, "MCP-Protocol-Version", "2025-06-18"); resp.StatusCode != 202 {
		t.Fatalf("initialized: %d", resp.StatusCode)
	}
	tools := c.rpc(secret, "tools/list", map[string]any{})["result"].(map[string]any)["tools"].([]any)
	if len(tools) != 7 {
		t.Fatalf("tools = %v", tools)
	}
	projects := c.mcpTool(secret, "list_projects", nil)["projects"].([]any)
	if len(projects) != 1 || projects[0].(map[string]any)["open_count"].(float64) != 1 {
		t.Fatalf("projects = %v", projects)
	}
	today := c.mcpTool(secret, "list_tasks", map[string]any{"view": "today", "timezone": "UTC"})
	if got := taskTitles(today["tasks"]); len(got) != 1 || got[0] != "Water the dentist's ferns" {
		t.Fatalf("today = %v", got)
	}
	task := c.mcpTool(secret, "get_task", map[string]any{"id": tid})["task"].(map[string]any)
	if task["untrusted_text"].(map[string]any)["project"] != "Garden" || task["overdue"] != true || task["priority"].(float64) != 2 {
		t.Fatalf("task = %v", task)
	}
	if got := taskTitles(c.mcpTool(secret, "search_tasks", map[string]any{"query": "DENTIST"})["tasks"]); len(got) != 1 {
		t.Fatalf("search = %v", got)
	}
	sum := c.mcpTool(secret, "today_summary", map[string]any{"timezone": "Europe/Rome"})
	if sum["counts"].(map[string]any)["overdue"].(float64) != 1 || sum["server_time"] == "" {
		t.Fatalf("summary = %v", sum)
	}
	res := c.rpc(secret, "resources/list", nil)["result"].(map[string]any)["resources"].([]any)
	if len(res) != 5 {
		t.Fatalf("resources = %v", res)
	}
	read := c.rpc(secret, "resources/read", map[string]any{"uri": "opentodo://tasks/" + tid})
	text := read["result"].(map[string]any)["contents"].([]any)[0].(map[string]any)["text"].(string)
	if !strings.Contains(text, "Water the dentist") {
		t.Fatalf("resource = %s", text)
	}
	if out := c.rpc(secret, "tasks/complete", map[string]any{"id": tid}); rpcCode(out) != -32601 {
		t.Fatalf("write method: %v", out)
	}
}

func TestListTasksPaging450(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	uid := e.userID()
	ts := time.Now().UnixMilli() - 60_000
	var ops []opsync.Op
	for i := 0; i < 450; i++ {
		id := fmt.Sprintf("task-%03d", i)
		for k, v := range map[string]string{"title": fmt.Sprintf("%q", fmt.Sprintf("Task %d", i)), "project_id": "null", "priority": "4", "labels": "[]", "created_at": fmt.Sprint(1000 + i)} {
			ts++
			ops = append(ops, opsync.Op{ID: ids.New(), Entity: "task", EntityID: id, Field: k, Value: json.RawMessage(v), TS: ts, Device: "seed"})
		}
	}
	for i := 0; i < len(ops); i += opsync.MaxOpsPerRequest {
		if _, err := e.sync.ApplyStrict(context.Background(), uid, ops[i:min(i+opsync.MaxOpsPerRequest, len(ops))]); err != nil {
			t.Fatal(err)
		}
	}
	secret := e.token("read")
	c := e.bearerClient()
	seen := map[string]bool{}
	var pages []int
	cursor := any(nil)
	for {
		args := map[string]any{"view": "all"}
		if cursor != nil {
			args["cursor"] = cursor
		}
		res := c.mcpTool(secret, "list_tasks", args)
		list := res["tasks"].([]any)
		pages = append(pages, len(list))
		for _, it := range list {
			id := it.(map[string]any)["id"].(string)
			if seen[id] {
				t.Fatalf("task %s returned twice", id)
			}
			seen[id] = true
		}
		cursor = res["next_cursor"]
		if cursor == nil {
			break
		}
		if len(pages) > 5 {
			t.Fatal("paging does not end")
		}
	}
	if fmt.Sprint(pages) != "[200 200 50]" || len(seen) != 450 {
		t.Fatalf("pages = %v, distinct = %d", pages, len(seen))
	}
}

// dump returns the op log and the materialised field tables, byte for byte.
func dump(t *testing.T, e *env) string {
	t.Helper()
	var b strings.Builder
	for _, q := range []string{
		`SELECT seq,user_id,op_id,entity,entity_id,field,value,ts,device,received_at FROM ops ORDER BY seq`,
		`SELECT * FROM scope_fields ORDER BY 1,2,3,4`,
		`SELECT * FROM project_members ORDER BY 1,2`,
		`SELECT key,value FROM settings ORDER BY key`,
	} {
		rows, err := e.db.QueryContext(context.Background(), q)
		if err != nil {
			t.Fatal(err)
		}
		cols, _ := rows.Columns()
		for rows.Next() {
			vals := make([]any, len(cols))
			ptrs := make([]any, len(cols))
			for i := range vals {
				ptrs[i] = &vals[i]
			}
			if err := rows.Scan(ptrs...); err != nil {
				t.Fatal(err)
			}
			fmt.Fprintln(&b, vals...)
		}
		rows.Close()
	}
	return b.String()
}

func TestMcpIsReadOnlyAndIsolated(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	_ = e.userID()
	m, member := e.member("member@example.com", "198.51.100.9")
	// Owner: a private project and task, a shared project with a task.
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Private"})
	e.mustStatus(resp, 201, out)
	private := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Owner secret plan", "project_id": private})
	e.mustStatus(resp, 201, out)
	ownerTask := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Household"})
	e.mustStatus(resp, 201, out)
	shared := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Shared chores", "project_id": shared})
	e.mustStatus(resp, 201, out)
	sharedTask := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/projects/"+shared+"/members", map[string]any{"email": "member@example.com", "role": "editor"})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+sharedTask, map[string]any{"assignee_id": member})
	e.mustStatus(resp, 200, out)
	// Member: a personal task; a deleted one.
	resp, out = m.do("POST", "/api/v1/tasks", map[string]any{"title": "Member own errand"})
	m.mustStatus(resp, 201, out)
	memberTask := out["id"].(string)
	seedOps(t, e, member, "task", "member-deleted", map[string]any{"title": "Member deleted", "project_id": nil, "priority": 4, "labels": []string{}, "deleted_at": 1})

	ownerSecret, memberSecret := e.token("read"), m.token("full")
	oc, mc := newClientAt(e, "203.0.113.61"), newClientAt(e, "203.0.113.62")
	before := dump(t, e)

	everything := func(c *env, secret string) []string {
		var seen []string
		for _, call := range []struct {
			name string
			args map[string]any
		}{
			{"list_projects", map[string]any{"include_archived": true}},
			{"list_tasks", map[string]any{"include_completed": true}},
			{"list_tasks", map[string]any{"view": "inbox"}},
			{"list_tasks", map[string]any{"view": "today"}},
			{"list_tasks", map[string]any{"view": "upcoming"}},
			{"search_tasks", map[string]any{"query": "a", "include_completed": true}},
			{"today_summary", map[string]any{"timezone": "Europe/Rome"}},
			{"get_task", map[string]any{"id": sharedTask}},
		} {
			b, _ := json.Marshal(c.mcpTool(secret, call.name, call.args))
			seen = append(seen, string(b))
		}
		for _, uri := range []string{"opentodo://projects", "opentodo://views/inbox", "opentodo://views/today", "opentodo://views/upcoming",
			"opentodo://projects/" + shared, "opentodo://tasks/" + sharedTask} {
			out := c.rpc(secret, "resources/read", map[string]any{"uri": uri})
			if out["result"] == nil {
				t.Fatalf("%s: %v", uri, out)
			}
			b, _ := json.Marshal(out)
			seen = append(seen, string(b))
		}
		return seen
	}
	ownerView := strings.Join(everything(oc, ownerSecret), "\n")
	memberView := strings.Join(everything(mc, memberSecret), "\n")

	for _, want := range []string{"Owner secret plan", "Shared chores", "Private", "Household"} {
		if !strings.Contains(ownerView, want) {
			t.Fatalf("owner view lacks %q", want)
		}
	}
	if strings.Contains(ownerView, "Member own errand") {
		t.Fatal("owner sees the member's personal task")
	}
	for _, want := range []string{"Shared chores", "Household", "Member own errand", "member@example.com"} {
		if !strings.Contains(memberView, want) {
			t.Fatalf("member view lacks %q", want)
		}
	}
	for _, leak := range []string{"Owner secret plan", "Private", ownerTask, "Member deleted"} {
		if strings.Contains(memberView, leak) {
			t.Fatalf("member view leaks %q", leak)
		}
	}
	// Foreign and deleted entities answer alike.
	foreign := mc.rpc(memberSecret, "resources/read", map[string]any{"uri": "opentodo://tasks/" + ownerTask})
	deleted := mc.rpc(memberSecret, "resources/read", map[string]any{"uri": "opentodo://tasks/member-deleted"})
	if rpcCode(foreign) != -32002 || rpcCode(deleted) != -32002 ||
		foreign["error"].(map[string]any)["message"] != deleted["error"].(map[string]any)["message"] {
		t.Fatalf("foreign %v / deleted %v", foreign, deleted)
	}
	if out := mc.rpc(memberSecret, "resources/read", map[string]any{"uri": "opentodo://projects/" + private}); rpcCode(out) != -32002 {
		t.Fatalf("foreign project: %v", out)
	}
	for _, id := range []string{ownerTask, "member-deleted"} {
		out := mc.rpc(memberSecret, "tools/call", map[string]any{"name": "get_task", "arguments": map[string]any{"id": id}})
		if out["result"].(map[string]any)["isError"] != true {
			t.Fatalf("get_task(%s) as member: %v", id, out)
		}
	}
	if out := mc.rpc(memberSecret, "tools/call", map[string]any{"name": "list_tasks", "arguments": map[string]any{"project_id": private}}); rpcCode(out) != -32602 {
		t.Fatalf("foreign project filter: %v", out)
	}
	_ = memberTask
	if after := dump(t, e); after != before {
		t.Fatalf("MCP calls changed stored data:\nbefore:\n%s\nafter:\n%s", before, after)
	}
}

func TestReadForeignTask32002SameAsDeleted(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Owner only"})
	e.mustStatus(resp, 201, out)
	foreignID := out["id"].(string)
	m, _ := e.member("member@example.com", "198.51.100.10")
	resp, out = m.do("POST", "/api/v1/tasks", map[string]any{"title": "Mine, then deleted"})
	m.mustStatus(resp, 201, out)
	deletedID := out["id"].(string)
	resp, out = m.do("DELETE", "/api/v1/tasks/"+deletedID, nil)
	if resp.StatusCode/100 != 2 {
		t.Fatalf("delete: %d %v", resp.StatusCode, out)
	}
	secret := m.token("read")
	c := m.bearerClient()
	a := c.rpc(secret, "resources/read", map[string]any{"uri": "opentodo://tasks/" + foreignID})
	b := c.rpc(secret, "resources/read", map[string]any{"uri": "opentodo://tasks/" + deletedID})
	ea, eb := a["error"].(map[string]any), b["error"].(map[string]any)
	if ea["code"].(float64) != -32002 || eb["code"].(float64) != -32002 || ea["message"] != eb["message"] {
		t.Fatalf("foreign %v deleted %v", ea, eb)
	}
}

// TestClientFixtures replays the message sequences of two kinds of MCP client
// (a desktop assistant and a CLI inspector) from testdata/mcp. Each exchange is
// {"request": <raw JSON-RPC body>, "headers": {...}, "status": N, "expect": <subset>}.
// The fixtures are written from the clients' documented message shapes; see
// tasks.md 3.6 for why they are not live recordings.
func TestClientFixtures(t *testing.T) {
	files, _ := filepath.Glob(filepath.Join("testdata", "mcp", "*.json"))
	if len(files) < 2 {
		t.Fatalf("fixtures = %v", files)
	}
	for _, file := range files {
		t.Run(filepath.Base(file), func(t *testing.T) {
			e := ownerEnv(t)
			e.enableMCP(true)
			resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Fixture task", "due": map[string]any{"date": "2020-01-01"}})
			e.mustStatus(resp, 201, out)
			secret := e.token("read")
			c := e.bearerClient()
			raw, err := os.ReadFile(file)
			if err != nil {
				t.Fatal(err)
			}
			var exchanges []struct {
				Request json.RawMessage   `json:"request"`
				Headers map[string]string `json:"headers"`
				Status  int               `json:"status"`
				Expect  any               `json:"expect"`
			}
			if err := json.Unmarshal(raw, &exchanges); err != nil {
				t.Fatal(err)
			}
			for i, ex := range exchanges {
				var hs []string
				for k, v := range ex.Headers {
					hs = append(hs, k, v)
				}
				resp, body := c.mcpPost(secret, string(ex.Request), hs...)
				if resp.StatusCode != ex.Status {
					t.Fatalf("exchange %d: status %d, want %d: %s", i, resp.StatusCode, ex.Status, body)
				}
				if ex.Expect == nil {
					continue
				}
				var got any
				if err := json.Unmarshal(body, &got); err != nil {
					t.Fatalf("exchange %d: %s", i, body)
				}
				if path, ok := subset(ex.Expect, got, "$"); !ok {
					t.Fatalf("exchange %d: mismatch at %s\nwant %v\ngot  %s", i, path, ex.Expect, body)
				}
			}
		})
	}
}

// subset reports whether want is contained in got: objects match key by key,
// arrays element by element (got may be longer), the string "*" matches any
// present value, and other values match exactly.
func subset(want, got any, path string) (string, bool) {
	if s, ok := want.(string); ok && s == "*" {
		return path, got != nil
	}
	switch w := want.(type) {
	case map[string]any:
		g, ok := got.(map[string]any)
		if !ok {
			return path, false
		}
		for k, v := range w {
			if p, ok := subset(v, g[k], path+"."+k); !ok {
				return p, false
			}
		}
		return "", true
	case []any:
		g, ok := got.([]any)
		if !ok || len(g) < len(w) {
			return path, false
		}
		for i := range w {
			if p, ok := subset(w[i], g[i], fmt.Sprintf("%s[%d]", path, i)); !ok {
				return p, false
			}
		}
		return "", true
	}
	a, _ := json.Marshal(want)
	b, _ := json.Marshal(got)
	return path, bytes.Equal(a, b)
}

// assistant-skills 4.1: prompts need a valid token like every MCP request, and
// a read token can get them (running them is still bound by tools/call).
func TestMcpPromptsAuth(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	resp, raw := e.mcpPost("", `{"jsonrpc":"2.0","id":1,"method":"prompts/list"}`)
	if resp.StatusCode != 401 || strings.Contains(string(raw), "weekly-review") {
		t.Fatalf("no token: %d %s", resp.StatusCode, raw)
	}
	read := e.token("read")
	out := e.bearerClient().rpc(read, "prompts/get", map[string]any{"name": "triage-inbox"})
	msgs := out["result"].(map[string]any)["messages"].([]any)
	if len(msgs) != 1 {
		t.Fatalf("prompts/get with a read token: %v", out)
	}
}
