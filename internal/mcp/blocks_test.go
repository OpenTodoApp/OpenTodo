package mcp

import (
	"context"
	"encoding/json"
	"os"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/agenttools"
	"github.com/OpenTodoApp/opentodo/internal/assistant"
)

// Blocks for MCP Apps (OpenSpec change mcp-blocks). The shared fixtures in
// testdata/blocks/ are also what the `ot mcp --decrypt` tests decrypt.

var (
	reader = agenttools.Caller{UserID: "u1", TokenID: "tr", TokenName: "Read", Scope: "read"}
	agent  = agenttools.Caller{UserID: "u1", TokenID: "ta", TokenName: "Desk", Scope: "agent", OwnerAllowsWrites: true, UserAllowsWrites: true}
	apps   = Client{Apps: true}
)

// send runs one JSON-RPC request for the caller and client.
func (f *fixture) send(c agenttools.Caller, cl Client, method string, params any) map[string]any {
	f.t.Helper()
	b, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
	out, _, _ := f.srv.HandleClient(context.Background(), c, cl, b)
	var m map[string]any
	if err := json.Unmarshal(out, &m); err != nil {
		f.t.Fatalf("reply %s: %v", out, err)
	}
	return m
}

func toolNames(r map[string]any) map[string]map[string]any {
	out := map[string]map[string]any{}
	for _, tl := range r["result"].(map[string]any)["tools"].([]any) {
		m := tl.(map[string]any)
		out[m["name"].(string)] = m
	}
	return out
}

func TestAnnouncesApps(t *testing.T) {
	for _, tc := range []struct {
		params string
		want   bool
	}{
		{`{"capabilities":{"extensions":{"io.modelcontextprotocol/ui":{"mimeTypes":["text/html;profile=mcp-app"]}}}}`, true},
		{`{"capabilities":{"extensions":{"io.modelcontextprotocol/ui":{"mimeTypes":["text/plain"]}}}}`, false},
		{`{"capabilities":{"extensions":{"io.modelcontextprotocol/ui":{}}}}`, false},
		{`{"capabilities":{}}`, false},
		{`{"capabilities":{"experimental":{"io.modelcontextprotocol/ui":{"mimeTypes":["text/html;profile=mcp-app"]}}}}`, false},
		{`not json`, false},
	} {
		if got := AnnouncesApps(json.RawMessage(tc.params)); got != tc.want {
			t.Errorf("AnnouncesApps(%s) = %v", tc.params, got)
		}
	}
	f := newFixture(t)
	init := func(caps string) bool {
		_, _, announced := f.srv.HandleClient(context.Background(), reader, Client{},
			[]byte(`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":`+caps+`}}`))
		return announced
	}
	if !init(`{"extensions":{"io.modelcontextprotocol/ui":{"mimeTypes":["text/html;profile=mcp-app"]}}}`) || init(`{}`) {
		t.Fatal("initialize announcement not reported")
	}
	if id := NewAppsSession(); !AppsSession(id) || AppsSession("apps.x") || AppsSession("") || AppsSession(strings.Repeat("a", 37)) {
		t.Fatalf("session id %q", id)
	}
}

// The display tools are listed only to an Apps client, with the in-app schemas
// and a view each; a client without the announcement cannot call them either.
func TestDisplayToolsOnlyForApps(t *testing.T) {
	f := newFixture(t)
	f.task("u1", "t1", "Call the bank", nil)
	for _, c := range []agenttools.Caller{reader, agent} {
		plain := toolNames(f.send(c, Client{}, "tools/list", nil))
		withApps := toolNames(f.send(c, apps, "tools/list", nil))
		for _, d := range assistant.DisplayTools {
			if plain[d.Name] != nil {
				t.Fatalf("%s listed without the announcement", d.Name)
			}
			mcpTool := false
			for _, n := range assistant.MCPDisplayTools {
				mcpTool = mcpTool || n == d.Name
			}
			got := withApps[d.Name]
			if !mcpTool {
				if got != nil {
					t.Fatalf("%s listed to an Apps client", d.Name)
				}
				continue
			}
			if got == nil {
				t.Fatalf("%s not listed to an Apps client", d.Name)
			}
			want, _ := json.Marshal(d.Schema)
			have, _ := json.Marshal(got["inputSchema"])
			if string(want) != string(have) {
				t.Fatalf("%s schema %s, want %s", d.Name, have, want)
			}
			uri := got["_meta"].(map[string]any)["ui"].(map[string]any)["resourceUri"]
			if uri != "ui://opentodo/blocks/"+strings.TrimPrefix(d.Name, "show_") {
				t.Fatalf("%s view %v", d.Name, uri)
			}
		}
		if len(withApps) != len(plain)+3 {
			t.Fatalf("Apps list %d, plain %d", len(withApps), len(plain))
		}
		r := f.send(c, Client{}, "tools/call", map[string]any{"name": "show_tasks", "arguments": map[string]any{"ids": []string{"t1"}}})
		if r["error"] == nil && r["result"].(map[string]any)["isError"] != true {
			t.Fatalf("show_tasks without the announcement: %v", r)
		}
	}
}

func TestShowTasksBlock(t *testing.T) {
	f := newFixture(t)
	x := agenttools.NewExclusions(f.sync.DB())
	f.srv = New(f.sync, Options{Tools: agenttools.New(f.sync, agenttools.Options{Now: func() time.Time { return f.now }, Exclusions: x})})
	f.put("u1", "project", "p1", map[string]any{"name": "Home", "color": "#2563eb", "position": 1, "created_at": 1})
	f.put("u1", "project", "hidden", map[string]any{"name": "Private", "color": "#2563eb", "position": 2, "created_at": 1})
	if err := x.Set(context.Background(), "u1", "hidden", true, nil); err != nil {
		t.Fatal(err)
	}
	evil := `<img src=x onerror=alert(1)></script><script>alert(2)</script>`
	f.task("u1", "t1", evil, map[string]any{"project_id": "p1", "due": map[string]any{"date": "2026-03-12", "time": "09:30"}, "deadline": "2026-03-13"})
	f.task("u1", "t2", "Pay rent", map[string]any{"due": map[string]any{"date": "2026-03-09"}})
	f.task("u1", "t3", "Secret", map[string]any{"project_id": "hidden"})

	r := f.send(reader, apps, "tools/call", map[string]any{"name": "show_tasks", "arguments": map[string]any{"ids": []string{"t2", "t1", "t3", "nope", "t1"}, "title": "This week"}})
	res := r["result"].(map[string]any)
	if res["isError"] == true {
		t.Fatalf("show_tasks: %v", r)
	}
	sc := res["structuredContent"].(map[string]any)
	if got := titles(sc["tasks"]); len(got) != 2 || got[0] != "Pay rent" || got[1] != evil {
		t.Fatalf("rows %v", got)
	}
	if sc["kind"] != "tasks" || sc["title"] != "This week" || sc["can_complete"] != false || sc["not_found"] != float64(3) {
		t.Fatalf("block %v", sc)
	}
	first := sc["tasks"].([]any)[1].(map[string]any)
	if first["date"] != "2026-03-12" || first["time"] != "09:30" || first["deadline"] != "2026-03-13" || first["days_left"] != float64(3) ||
		first["untrusted_text"].(map[string]any)["project"] != "Home" {
		t.Fatalf("row %v", first)
	}
	if sc["tasks"].([]any)[0].(map[string]any)["overdue"] != true {
		t.Fatalf("overdue row %v", sc["tasks"])
	}
	// The model reads the kind and count only, never content.
	text := res["content"].([]any)[0].(map[string]any)["text"].(string)
	if strings.Contains(text, "rent") || strings.Contains(text, "img") || !strings.Contains(text, `"count":2`) || !strings.Contains(text, `"not_found":3`) {
		t.Fatalf("text content %s", text)
	}
	raw, _ := json.Marshal(res)
	if strings.Contains(string(raw), "Secret") || strings.Contains(string(raw), "Private") {
		t.Fatalf("kept-away project reached the block: %s", raw)
	}

	// Every id unknown or kept away: the in-app not-found error.
	r = f.send(reader, apps, "tools/call", map[string]any{"name": "show_tasks", "arguments": map[string]any{"ids": []string{"t3", "nope"}}})
	if res := r["result"].(map[string]any); res["isError"] != true || res["structuredContent"].(map[string]any)["error"] != "not_found" {
		t.Fatalf("all unknown: %v", r)
	}
	// The in-app argument checks.
	for _, a := range []map[string]any{{}, {"ids": []string{}}, {"ids": []string{"t1"}, "title": strings.Repeat("x", 81)}} {
		if r := f.send(reader, apps, "tools/call", map[string]any{"name": "show_tasks", "arguments": a}); errCode(r) != CodeInvalidParams {
			t.Fatalf("show_tasks(%v) = %v", a, r)
		}
	}
}

func TestShowCalendarAndDeadlines(t *testing.T) {
	f := newFixture(t)
	f.task("u1", "a", "Standup", map[string]any{"due": map[string]any{"date": "2026-03-11", "time": "09:00"}, "estimate_minutes": 15})
	f.task("u1", "b", "Groceries", map[string]any{"due": map[string]any{"date": "2026-03-11"}, "estimate_minutes": 45})
	f.task("u1", "c", "Dentist", map[string]any{"due": map[string]any{"date": "2026-03-14", "time": "16:00"}, "completed_at": 5})
	f.task("u1", "d", "Later", map[string]any{"due": map[string]any{"date": "2026-03-30"}})
	f.task("u1", "e", "Tax return", map[string]any{"deadline": "2026-03-20"})
	f.task("u1", "g", "Missed", map[string]any{"deadline": "2026-03-08"})
	f.task("u1", "h", "Filed", map[string]any{"deadline": "2026-03-12", "completed_at": 5})

	r := f.send(agent, apps, "tools/call", map[string]any{"name": "show_calendar", "arguments": map[string]any{"date": "2026-03-10", "span": "week"}})
	sc := r["result"].(map[string]any)["structuredContent"].(map[string]any)
	if got := titles(sc["tasks"]); strings.Join(got, ",") != "Groceries,Standup,Dentist" {
		t.Fatalf("calendar rows %v", got)
	}
	if days := sc["days"].([]any); len(days) != 7 || days[0] != "2026-03-10" || days[6] != "2026-03-16" || sc["can_complete"] != true {
		t.Fatalf("calendar %v", sc)
	}
	if r := f.send(agent, apps, "tools/call", map[string]any{"name": "show_calendar", "arguments": map[string]any{"date": "tomorrow", "span": "day"}}); errCode(r) != CodeInvalidParams {
		t.Fatalf("calendar bad date: %v", r)
	}

	r = f.send(agent, apps, "tools/call", map[string]any{"name": "show_deadlines", "arguments": map[string]any{"from": "2026-03-01", "to": "2026-03-31"}})
	sc = r["result"].(map[string]any)["structuredContent"].(map[string]any)
	if got := titles(sc["tasks"]); strings.Join(got, ",") != "Missed,Tax return" {
		t.Fatalf("deadline rows %v", got)
	}
	if left := sc["tasks"].([]any)[0].(map[string]any)["days_left"]; left != float64(-2) {
		t.Fatalf("days left %v", left)
	}
	if r := f.send(agent, apps, "tools/call", map[string]any{"name": "show_deadlines", "arguments": map[string]any{"from": "2026-03-01", "to": "2026-05-01"}}); errCode(r) != CodeInvalidParams {
		t.Fatalf("deadlines over 31 days: %v", r)
	}
}

// Ticking in a block is complete_tasks through the host: offered (can_complete)
// and accepted only under the write gate (mcp-blocks D5).
func TestBlockActionsFollowWriteGate(t *testing.T) {
	f := newFixture(t)
	f.task("u1", "t1", "Call the bank", nil)
	for _, c := range []agenttools.Caller{
		reader,
		{UserID: "u1", TokenID: "ta", Scope: "agent", OwnerAllowsWrites: false, UserAllowsWrites: true},
		{UserID: "u1", TokenID: "ta", Scope: "agent", OwnerAllowsWrites: true, UserAllowsWrites: false},
		{UserID: "u1", TokenID: "tf", Scope: "full", OwnerAllowsWrites: true, UserAllowsWrites: true},
	} {
		r := f.send(c, apps, "tools/call", map[string]any{"name": "show_tasks", "arguments": map[string]any{"ids": []string{"t1"}}})
		if r["result"].(map[string]any)["structuredContent"].(map[string]any)["can_complete"] != false {
			t.Fatalf("%+v offered ticking", c)
		}
		r = f.send(c, apps, "tools/call", map[string]any{"name": "complete_tasks", "arguments": map[string]any{"ids": []string{"t1"}}})
		if r["error"] == nil && r["result"].(map[string]any)["isError"] != true {
			t.Fatalf("%+v completed a task: %v", c, r)
		}
	}
	r := f.send(agent, apps, "tools/call", map[string]any{"name": "show_tasks", "arguments": map[string]any{"ids": []string{"t1"}}})
	if r["result"].(map[string]any)["structuredContent"].(map[string]any)["can_complete"] != true {
		t.Fatalf("agent not offered ticking: %v", r)
	}
	if r := f.send(agent, apps, "tools/call", map[string]any{"name": "complete_tasks", "arguments": map[string]any{"ids": []string{"t1"}}}); r["result"].(map[string]any)["isError"] == true {
		t.Fatalf("agent tick: %v", r)
	}
	r = f.send(agent, apps, "tools/call", map[string]any{"name": "show_tasks", "arguments": map[string]any{"ids": []string{"t1"}}})
	if row := r["result"].(map[string]any)["structuredContent"].(map[string]any)["tasks"].([]any)[0].(map[string]any); row["completed"] != true {
		t.Fatalf("not completed: %v", row)
	}
}

// An encrypted account gets no block on the server path; through the
// decrypting bridge its rows carry the placeholder the bridge replaces.
func TestBlocksEncryptedAccount(t *testing.T) {
	f := newFixture(t)
	fx := loadBlockFixture(t)
	for id, title := range fx.Plaintext {
		if fx.sealed(id) {
			title = "enc:v1:" + strings.Repeat("A", 44) // the server cannot open it either way
		}
		f.task("u1", id, title, map[string]any{"due": map[string]any{"date": fx.Date}})
	}
	enc := agent
	enc.Encrypted = true
	if got := toolNames(f.send(enc, apps, "tools/list", nil)); got["show_tasks"] != nil {
		t.Fatal("display tools listed to an encrypted account on the server path")
	}
	r := f.send(enc, apps, "tools/call", map[string]any{"name": "show_tasks", "arguments": map[string]any{"ids": fx.IDs}})
	res := r["result"].(map[string]any)
	if res["isError"] != true || res["structuredContent"].(map[string]any)["error"] != "encryption_enabled" || !strings.Contains(BlocksEncryptedMessage, "ot mcp --decrypt") {
		t.Fatalf("encrypted server path: %v", r)
	}
	bridge := Client{Apps: true, Decrypting: true}
	if got := toolNames(f.send(enc, bridge, "tools/list", nil)); got["show_tasks"] == nil {
		t.Fatal("display tools not listed through the bridge")
	}
	r = f.send(enc, bridge, "tools/call", map[string]any{"name": "show_tasks", "arguments": map[string]any{"ids": fx.IDs}})
	raw, _ := json.Marshal(r["result"].(map[string]any)["structuredContent"])
	if strings.Contains(string(raw), "enc:v1:") || !strings.Contains(string(raw), `"encrypted":true`) {
		t.Fatalf("bridge rows %s", raw)
	}
	if *update {
		if err := os.WriteFile("testdata/blocks/encrypted_result.json", append(indent(raw), '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	golden, err := os.ReadFile("testdata/blocks/encrypted_result.json")
	if err != nil {
		t.Fatal(err)
	}
	if strings.TrimSpace(string(golden)) != strings.TrimSpace(string(indent(raw))) {
		t.Fatalf("encrypted_result.json is stale (go test ./internal/mcp -run TestBlocksEncryptedAccount -update):\n%s", indent(raw))
	}
}

func indent(raw []byte) []byte {
	var v any
	_ = json.Unmarshal(raw, &v)
	out, _ := json.MarshalIndent(v, "", "  ")
	return out
}

// blockFixture is testdata/blocks/encrypted.json, shared with internal/cli.
type blockFixture struct {
	Date      string            `json:"date"`
	IDs       []string          `json:"ids"`
	Plaintext map[string]string `json:"plaintext"`
	Encrypted []string          `json:"encrypted"`
}

func (fx blockFixture) sealed(id string) bool {
	for _, e := range fx.Encrypted {
		if e == id {
			return true
		}
	}
	return false
}

func loadBlockFixture(t *testing.T) blockFixture {
	t.Helper()
	raw, err := os.ReadFile("testdata/blocks/encrypted.json")
	if err != nil {
		t.Fatal(err)
	}
	var fx blockFixture
	if err := json.Unmarshal(raw, &fx); err != nil {
		t.Fatal(err)
	}
	return fx
}

func TestBlockViews(t *testing.T) {
	f := newFixture(t)
	for _, kind := range []string{"tasks", "calendar", "deadlines"} {
		r := f.send(reader, Client{}, "resources/read", map[string]any{"uri": "ui://opentodo/blocks/" + kind})
		c := r["result"].(map[string]any)["contents"].([]any)[0].(map[string]any)
		doc := c["text"].(string)
		if c["mimeType"] != AppsMIME || !strings.HasPrefix(doc, "<!DOCTYPE html>") || !strings.Contains(doc, `data-kind="`+kind+`"`) {
			t.Fatalf("%s view: %v", kind, c["mimeType"])
		}
		// No external reference: no URL scheme, protocol-relative URL or url() in the document.
		if m := regexp.MustCompile(`(?i)(https?:|//[a-z0-9]|url\(|@import|src=|href=)`).FindString(doc); m != "" {
			t.Fatalf("%s view references %q", kind, m)
		}
		// The CSP is the view's own: hashes of its one script and style, nothing else allowed.
		if !strings.Contains(doc, `content="`+viewCSP+`"`) || strings.Contains(viewCSP, "unsafe") ||
			!strings.Contains(viewCSP, "default-src 'none'") || !strings.Contains(viewCSP, "connect-src 'none'") ||
			!strings.Contains(viewCSP, hash(between(doc, "<script>", "</script>"))) || !strings.Contains(viewCSP, hash(between(doc, "<style>", "</style>"))) {
			t.Fatalf("CSP %s", viewCSP)
		}
		if strings.Count(doc, "<script") != 1 || strings.Count(doc, "<style") != 1 || strings.Contains(doc, "{{") {
			t.Fatalf("%s view has more than its one script and style", kind)
		}
	}
	// The view sets user text as text only (D2): no markup sink, no code from strings.
	script := between(viewSource, "<script>", "</script>")
	for _, sink := range []string{"innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "Function(", "setTimeout(", "setInterval(", ".src", ".href", "srcdoc", "style."} {
		if strings.Contains(script, sink) {
			t.Fatalf("view script uses %s", sink)
		}
	}
	for _, uri := range []string{"ui://opentodo/blocks/map", "ui://opentodo/blocks/", "ui://opentodo/blocks/tasks/x", "ui://other/blocks/tasks"} {
		if r := f.send(reader, Client{}, "resources/read", map[string]any{"uri": uri}); errCode(r) != CodeResourceNotFound {
			t.Fatalf("%s: %v", uri, r)
		}
	}
	// Listed to an Apps client only.
	list := func(cl Client) string {
		raw, _ := json.Marshal(f.send(reader, cl, "resources/list", nil))
		return string(raw)
	}
	if strings.Contains(list(Client{}), "ui://") || !strings.Contains(list(apps), "ui://opentodo/blocks/deadlines") {
		t.Fatal("resources/list")
	}
}

// The view's colours are the app's tokens (web/src/index.css): its light
// value, then its dark one.
func TestBlockViewTokens(t *testing.T) {
	css, err := os.ReadFile("../../web/src/index.css")
	if err != nil {
		t.Fatal(err)
	}
	app := map[string][]string{}
	for _, m := range regexp.MustCompile(`(--ot-[a-z-]+):\s*(oklch\([^)]*\));`).FindAllStringSubmatch(string(css), -1) {
		app[m[1]] = append(app[m[1]], m[2])
	}
	style := between(viewSource, "<style>", "</style>")
	ours := map[string][]string{}
	for _, m := range regexp.MustCompile(`(--ot-[a-z-]+):\s*(oklch\([^)]*\));`).FindAllStringSubmatch(style, -1) {
		ours[m[1]] = append(ours[m[1]], m[2])
	}
	if len(ours) < 6 {
		t.Fatalf("tokens %v", ours)
	}
	for name, vals := range ours {
		if name == "--ot-accent" {
			continue // the app's accent is themeable (var() with fallbacks); checked below
		}
		if len(vals) != 3 || len(app[name]) < 2 || vals[0] != app[name][0] || vals[1] != app[name][1] || vals[2] != vals[1] {
			t.Fatalf("%s = %v, app %v", name, vals, app[name])
		}
	}
	if !strings.Contains(string(css), ours["--ot-accent"][0]) || !strings.Contains(string(css), ours["--ot-accent"][1]) {
		t.Fatalf("accent %v not the app's", ours["--ot-accent"])
	}
}
