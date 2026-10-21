package mcp

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/agenttools"
	"github.com/pixari/opentodo/internal/ids"
	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
)

var update = flag.Bool("update", false, "rewrite golden files")

type fixture struct {
	t    *testing.T
	sync *opsync.Service
	srv  *Server
	now  time.Time
	logs *bytes.Buffer
	ts   int64
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	f := &fixture{t: t, sync: opsync.NewService(db), logs: &bytes.Buffer{}, ts: time.Now().UnixMilli() - 60_000,
		// 2026-03-10 23:30 UTC: already 2026-03-11 in Rome, still 2026-03-10 in New York.
		now: time.Date(2026, 3, 10, 23, 30, 0, 0, time.UTC)}
	log := slog.New(slog.NewTextHandler(f.logs, &slog.HandlerOptions{Level: slog.LevelDebug}))
	f.srv = New(f.sync, Options{Version: "test", Log: log, Now: func() time.Time { return f.now }})
	return f
}

// put writes an entity through the op log, like a device would.
func (f *fixture) put(uid, entity, id string, fields map[string]any) {
	f.t.Helper()
	var ops []opsync.Op
	for k, v := range fields {
		raw, _ := json.Marshal(v)
		f.ts++
		ops = append(ops, opsync.Op{ID: ids.New(), Entity: entity, EntityID: id, Field: k, Value: raw, TS: f.ts, Device: "dev"})
	}
	if _, err := f.sync.ApplyStrict(context.Background(), uid, ops); err != nil {
		f.t.Fatal(err)
	}
}

func (f *fixture) task(uid, id, title string, extra map[string]any) {
	fields := map[string]any{"title": title, "project_id": nil, "priority": 4, "labels": []string{}, "created_at": f.ts}
	for k, v := range extra {
		fields[k] = v
	}
	f.put(uid, "task", id, fields)
}

// rpc sends one raw message and decodes the reply.
func (f *fixture) rpc(uid, body string) map[string]any {
	f.t.Helper()
	out, _ := f.srv.Handle(context.Background(), agenttools.Caller{UserID: uid, Scope: "read"}, []byte(body))
	if out == nil {
		return nil
	}
	var m map[string]any
	if err := json.Unmarshal(out, &m); err != nil {
		f.t.Fatalf("reply %s: %v", out, err)
	}
	return m
}

func (f *fixture) call(uid, method string, params any) map[string]any {
	f.t.Helper()
	b, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
	return f.rpc(uid, string(b))
}

// tool calls a tool and returns its structured result, failing on any error.
func (f *fixture) tool(uid, name string, a map[string]any) map[string]any {
	f.t.Helper()
	r := f.call(uid, "tools/call", map[string]any{"name": name, "arguments": a})
	res, ok := r["result"].(map[string]any)
	if !ok || res["isError"] == true {
		f.t.Fatalf("%s(%v) = %v", name, a, r)
	}
	return res["structuredContent"].(map[string]any)
}

func errCode(r map[string]any) float64 {
	e, _ := r["error"].(map[string]any)
	c, _ := e["code"].(float64)
	return c
}

func titles(list any) []string {
	out := []string{}
	for _, it := range list.([]any) {
		out = append(out, it.(map[string]any)["untrusted_text"].(map[string]any)["title"].(string))
	}
	return out
}

func TestInitializeNegotiatesVersion(t *testing.T) {
	f := newFixture(t)
	for _, tc := range []struct{ asked, want string }{
		{"2025-06-18", "2025-06-18"},
		{"2025-03-26", "2025-03-26"},
		{ProtocolVersions[0], ProtocolVersions[0]},
		{"2024-11-05", ProtocolVersions[0]},
		{"1999-01-01", ProtocolVersions[0]},
	} {
		r := f.call("u1", "initialize", map[string]any{"protocolVersion": tc.asked, "capabilities": map[string]any{}, "clientInfo": map[string]any{"name": "t", "version": "1"}})
		res := r["result"].(map[string]any)
		if res["protocolVersion"] != tc.want {
			t.Fatalf("asked %s: got %v, want %s", tc.asked, res["protocolVersion"], tc.want)
		}
		caps := res["capabilities"].(map[string]any)
		if caps["tools"] == nil || caps["resources"] == nil || caps["prompts"] == nil {
			t.Fatalf("capabilities = %v", caps)
		}
		if res["serverInfo"].(map[string]any)["version"] != "test" {
			t.Fatalf("serverInfo = %v", res["serverInfo"])
		}
	}
	if r := f.call("u1", "initialize", map[string]any{}); errCode(r) != CodeInvalidParams {
		t.Fatalf("initialize without version: %v", r)
	}
	if r := f.call("u1", "ping", nil); r["result"] == nil {
		t.Fatalf("ping: %v", r)
	}
}

func TestUnknownMethod32601(t *testing.T) {
	f := newFixture(t)
	r := f.call("u1", "tasks/complete", map[string]any{"id": "x"})
	if errCode(r) != CodeMethodNotFound || r["id"].(float64) != 1 {
		t.Fatalf("unknown method: %v", r)
	}
	if r := f.call("u1", "tools/call", map[string]any{"name": "create_task", "arguments": map[string]any{}}); errCode(r) != CodeInvalidParams {
		t.Fatalf("unknown tool: %v", r)
	}
}

func TestMalformedJSON32700(t *testing.T) {
	f := newFixture(t)
	out, malformed := f.srv.Handle(context.Background(), u1, []byte(`{"jsonrpc":"2.0","id":1,"method":`))
	var r map[string]any
	_ = json.Unmarshal(out, &r)
	if !malformed || errCode(r) != CodeParseError || r["id"] != nil {
		t.Fatalf("parse error: %s malformed=%v", out, malformed)
	}
	for _, body := range []string{`{"id":1,"method":"ping"}`, `{"jsonrpc":"2.0","id":{"a":1},"method":"ping"}`, `{"jsonrpc":"2.0","id":1}`, `42`, `[]`} {
		out, malformed := f.srv.Handle(context.Background(), u1, []byte(body))
		_ = json.Unmarshal(out, &r)
		if !malformed || errCode(r) != CodeInvalidRequest {
			t.Fatalf("%s: %s malformed=%v", body, out, malformed)
		}
	}
	// Bad params are -32602, not a malformed message.
	if r := f.rpc("u1", `{"jsonrpc":"2.0","id":2,"method":"tools/call","params":"list_tasks"}`); errCode(r) != CodeInvalidParams {
		t.Fatalf("string params: %v", r)
	}
}

func TestNotificationsAndBatches(t *testing.T) {
	f := newFixture(t)
	if out, malformed := f.srv.Handle(context.Background(), u1, []byte(`{"jsonrpc":"2.0","method":"notifications/initialized"}`)); out != nil || malformed {
		t.Fatalf("notification answered: %s", out)
	}
	// A notification for an unknown method is still silent.
	if out, _ := f.srv.Handle(context.Background(), u1, []byte(`{"jsonrpc":"2.0","method":"tasks/delete"}`)); out != nil {
		t.Fatalf("unknown notification answered: %s", out)
	}
	// A client response (to a request this server never sends) is accepted silently.
	if out, _ := f.srv.Handle(context.Background(), u1, []byte(`{"jsonrpc":"2.0","id":"s1","result":{}}`)); out != nil {
		t.Fatalf("response answered: %s", out)
	}
	out, _ := f.srv.Handle(context.Background(), u1, []byte(`[{"jsonrpc":"2.0","id":"a","method":"ping"},{"jsonrpc":"2.0","method":"notifications/initialized"},{"jsonrpc":"2.0","id":"b","method":"nope"}]`))
	var replies []map[string]any
	if err := json.Unmarshal(out, &replies); err != nil || len(replies) != 2 {
		t.Fatalf("batch: %s", out)
	}
	if replies[0]["id"] != "a" || replies[0]["result"] == nil || replies[1]["id"] != "b" || errCode(replies[1]) != CodeMethodNotFound {
		t.Fatalf("batch replies: %v", replies)
	}
}

func TestToolsListShape(t *testing.T) {
	f := newFixture(t)
	r := f.call("u1", "tools/list", nil)
	got, _ := json.MarshalIndent(r["result"], "", "  ")
	got = append(got, '\n')
	path := filepath.Join("testdata", "tools_list.golden.json")
	if *update {
		if err := os.WriteFile(path, got, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("%v (run go test ./internal/mcp -run TestToolsListShape -update)", err)
	}
	if !bytes.Equal(got, want) {
		t.Fatalf("tools/list changed; review and run with -update:\n%s", got)
	}
	var tools []map[string]any
	_ = json.Unmarshal(must(json.Marshal(r["result"].(map[string]any)["tools"])), &tools)
	names := []string{}
	for _, tl := range tools {
		names = append(names, tl["name"].(string))
		ann := tl["annotations"].(map[string]any)
		if ann["readOnlyHint"] != true || ann["destructiveHint"] != false || ann["openWorldHint"] != false {
			t.Fatalf("%s annotations = %v", tl["name"], ann)
		}
		if tl["inputSchema"].(map[string]any)["type"] != "object" {
			t.Fatalf("%s schema = %v", tl["name"], tl["inputSchema"])
		}
	}
	if strings.Join(names, ",") != "list_projects,list_tasks,get_task,search_tasks,today_summary,list_icons,list_time_entries" {
		t.Fatalf("tools = %v", names)
	}
}

func must(b []byte, err error) []byte {
	if err != nil {
		panic(err)
	}
	return b
}

func TestResourcesListShape(t *testing.T) {
	f := newFixture(t)
	res := f.call("u1", "resources/list", nil)["result"].(map[string]any)
	var uris []string
	for _, r := range res["resources"].([]any) {
		m := r.(map[string]any)
		if m["mimeType"] != "application/json" || m["name"] == "" {
			t.Fatalf("resource = %v", m)
		}
		uris = append(uris, m["uri"].(string))
	}
	if strings.Join(uris, " ") != "opentodo://projects opentodo://views/inbox opentodo://views/today opentodo://views/upcoming opentodo://integrations/issues" {
		t.Fatalf("resources = %v", uris)
	}
	tpl := f.call("u1", "resources/templates/list", nil)["result"].(map[string]any)
	var templates []string
	for _, r := range tpl["resourceTemplates"].([]any) {
		templates = append(templates, r.(map[string]any)["uriTemplate"].(string))
	}
	if strings.Join(templates, " ") != "opentodo://projects/{id} opentodo://tasks/{id}" {
		t.Fatalf("templates = %v", templates)
	}
}

func TestListTasksTodayInTimezone(t *testing.T) {
	f := newFixture(t)
	f.put("u1", "project", "p1", map[string]any{"name": "Garden", "color": "#16a34a", "position": 1, "archived": false, "created_at": 1})
	f.put("u1", "label", "l1", map[string]any{"name": "outside", "color": "#000", "position": 1, "created_at": 1})
	f.task("u1", "t-old", "Pay rent", map[string]any{"due": map[string]any{"date": "2026-03-01"}, "priority": 1})
	f.task("u1", "t-10", "Water plants", map[string]any{"due": map[string]any{"date": "2026-03-10"}, "project_id": "p1", "labels": []string{"l1"}})
	f.task("u1", "t-11", "Call dentist", map[string]any{"due": map[string]any{"date": "2026-03-11", "time": "09:00"}})
	// 2026-03-11 01:00 in Tokyo is 2026-03-10 16:00 UTC, 12:00 in New York.
	f.task("u1", "t-z", "Standup", map[string]any{"due": map[string]any{"date": "2026-03-11", "time": "01:00", "tz": "Asia/Tokyo"}})
	f.task("u1", "t-done", "Done already", map[string]any{"due": map[string]any{"date": "2026-03-01"}, "completed_at": 5})
	f.task("u1", "t-none", "Someday", nil)

	ny := f.tool("u1", "list_tasks", map[string]any{"view": "today", "timezone": "America/New_York"})
	if got := strings.Join(titles(ny["tasks"]), ","); got != "Pay rent,Standup,Water plants" {
		t.Fatalf("today in New York = %s", got)
	}
	if ny["today"] != "2026-03-10" || ny["timezone"] != "America/New_York" || ny["server_time"] != "2026-03-10T23:30:00Z" {
		t.Fatalf("meta = %v %v %v", ny["today"], ny["timezone"], ny["server_time"])
	}
	first := ny["tasks"].([]any)[0].(map[string]any)
	if first["overdue"] != true || ut(first)["project"] != "Inbox" || first["priority"].(float64) != 1 {
		t.Fatalf("overdue task = %v", first)
	}
	water := ny["tasks"].([]any)[2].(map[string]any)
	if ut(water)["project"] != "Garden" || ut(water)["labels"].([]any)[0] != "outside" {
		t.Fatalf("task with project and label = %v", water)
	}
	standup := ny["tasks"].([]any)[1].(map[string]any)["due"].(map[string]any)
	if standup["local_date"] != "2026-03-10" || standup["local_time"] != "12:00" || standup["tz"] != "Asia/Tokyo" {
		t.Fatalf("zoned due = %v", standup)
	}

	rome := f.tool("u1", "list_tasks", map[string]any{"view": "today", "timezone": "Europe/Rome"})
	if got := strings.Join(titles(rome["tasks"]), ","); got != "Pay rent,Standup,Water plants,Call dentist" {
		t.Fatalf("today in Rome = %s", got)
	}
	up := f.tool("u1", "list_tasks", map[string]any{"view": "upcoming", "timezone": "America/New_York"})
	if got := strings.Join(titles(up["tasks"]), ","); got != "Call dentist" {
		t.Fatalf("upcoming in New York = %s", got)
	}
	// Default zone is UTC: 2026-03-10.
	utc := f.tool("u1", "list_tasks", map[string]any{"view": "today"})
	if utc["timezone"] != "UTC" || len(utc["tasks"].([]any)) != 3 {
		t.Fatalf("today in UTC = %v", titles(utc["tasks"]))
	}
	all := f.tool("u1", "list_tasks", map[string]any{"include_completed": true})
	if len(all["tasks"].([]any)) != 6 {
		t.Fatalf("all with completed = %v", titles(all["tasks"]))
	}
	byLabel := f.tool("u1", "list_tasks", map[string]any{"label": "OUTSIDE"})
	if got := strings.Join(titles(byLabel["tasks"]), ","); got != "Water plants" {
		t.Fatalf("by label = %s", got)
	}
	ranged := f.tool("u1", "list_tasks", map[string]any{"due_from": "2026-03-10", "due_to": "2026-03-11", "timezone": "America/New_York"})
	if got := strings.Join(titles(ranged["tasks"]), ","); got != "Standup,Water plants,Call dentist" {
		t.Fatalf("due range = %s", got)
	}
	// Inbox view leaves out planned tasks (inbox-means-unplaced): only the undated one is in it.
	inbox := f.tool("u1", "list_tasks", map[string]any{"view": "inbox"})
	if got := strings.Join(titles(inbox["tasks"]), ","); got != "Someday" {
		t.Fatalf("inbox = %v", titles(inbox["tasks"]))
	}
	if r := f.call("u1", "tools/call", map[string]any{"name": "list_tasks", "arguments": map[string]any{"timezone": "Mars/Olympus"}}); errCode(r) != CodeInvalidParams {
		t.Fatalf("bad zone: %v", r)
	}
}

func TestListTasksInvalidPriority32602(t *testing.T) {
	f := newFixture(t)
	for _, a := range []map[string]any{
		{"priority": 7}, {"priority": 0}, {"priority": 1.5}, {"priority": "high"},
		{"view": "someday"}, {"due_from": "10/03/2026"}, {"limit": 0}, {"cursor": "!!"}, {"project_id": "nope"},
		{"completed_after": "yesterday"}, {"completed_before": "2026-02-30"},
	} {
		r := f.call("u1", "tools/call", map[string]any{"name": "list_tasks", "arguments": a})
		if errCode(r) != CodeInvalidParams {
			t.Fatalf("%v: %v", a, r)
		}
		msg := r["error"].(map[string]any)["message"].(string)
		for k := range a {
			if !strings.Contains(msg, k) {
				t.Fatalf("%v: message %q does not name the argument", a, msg)
			}
		}
	}
	if r := f.call("u1", "tools/call", map[string]any{"name": "get_task", "arguments": map[string]any{}}); errCode(r) != CodeInvalidParams ||
		!strings.Contains(r["error"].(map[string]any)["message"].(string), "id") {
		t.Fatalf("get_task without id: %v", r)
	}
	// A limit above the cap is clamped, not refused.
	if res := f.tool("u1", "list_tasks", map[string]any{"limit": 5000}); res["tasks"] == nil {
		t.Fatalf("clamped limit: %v", res)
	}
}

func TestGetTaskExcludesDeleted(t *testing.T) {
	f := newFixture(t)
	f.put("u1", "project", "p1", map[string]any{"name": "Garden", "position": 1, "archived": false, "created_at": 1})
	f.put("u1", "section", "s1", map[string]any{"name": "Beds", "project_id": "p1", "position": 1, "created_at": 1})
	f.task("u1", "t1", "Plant tomatoes", map[string]any{"project_id": "p1", "section_id": "s1", "description": "San Marzano"})
	f.task("u1", "t1a", "Buy seeds", map[string]any{"parent_id": "t1", "project_id": "p1"})
	f.task("u1", "t1b", "Old subtask", map[string]any{"parent_id": "t1", "project_id": "p1", "deleted_at": 9})
	f.put("u1", "comment", "c1", map[string]any{"task_id": "t1", "body": "after the frost", "author_id": "u1", "created_at": 10})
	f.put("u1", "comment", "c2", map[string]any{"task_id": "t1", "body": "removed", "author_id": "u1", "created_at": 11, "deleted_at": 12})
	f.task("u1", "t2", "Gone", map[string]any{"deleted_at": 5})

	res := f.tool("u1", "get_task", map[string]any{"id": "t1"})
	task := res["task"].(map[string]any)
	if ut(task)["description"] != "San Marzano" || ut(task)["project"] != "Garden" || ut(task)["section"] != "Beds" {
		t.Fatalf("task = %v", task)
	}
	if got := strings.Join(titles(res["subtasks"]), ","); got != "Buy seeds" {
		t.Fatalf("subtasks = %s", got)
	}
	comments := res["comments"].([]any)
	if len(comments) != 1 || ut(comments[0].(map[string]any))["body"] != "after the frost" || comments[0].(map[string]any)["author_is_you"] != true {
		t.Fatalf("comments = %v", comments)
	}
	for _, id := range []string{"t2", "t1b", "does-not-exist"} {
		r := f.call("u1", "tools/call", map[string]any{"name": "get_task", "arguments": map[string]any{"id": id}})
		result := r["result"].(map[string]any)
		if result["isError"] != true || result["structuredContent"] != nil ||
			result["content"].([]any)[0].(map[string]any)["text"] != "task not found" {
			t.Fatalf("get_task(%s) = %v", id, r)
		}
	}
	// Deleted tasks are left out of every list.
	all := f.tool("u1", "list_tasks", map[string]any{"include_completed": true})
	if got := strings.Join(titles(all["tasks"]), ","); strings.Contains(got, "Gone") || strings.Contains(got, "Old subtask") {
		t.Fatalf("list includes deleted: %s", got)
	}
}

func TestSearchTasks(t *testing.T) {
	f := newFixture(t)
	f.task("u1", "t1", "Call the Dentist", nil)
	f.task("u1", "t2", "Groceries", map[string]any{"description": "ask the dentist's shop for floss"})
	f.task("u1", "t3", "Dentist invoice", map[string]any{"completed_at": 3})
	f.task("u1", "t4", "dentist (deleted)", map[string]any{"deleted_at": 3})
	f.task("u1", "t5", "Unrelated", nil)
	res := f.tool("u1", "search_tasks", map[string]any{"query": "dentist"})
	if got := strings.Join(titles(res["tasks"]), ","); got != "Call the Dentist,Groceries" {
		t.Fatalf("search = %s", got)
	}
	if res["next_cursor"] != nil {
		t.Fatalf("unexpected cursor: %v", res["next_cursor"])
	}
	res = f.tool("u1", "search_tasks", map[string]any{"query": "DENTIST", "include_completed": true, "limit": 2})
	if len(res["tasks"].([]any)) != 2 || res["next_cursor"] == nil {
		t.Fatalf("paged search = %v", res)
	}
	more := f.tool("u1", "search_tasks", map[string]any{"query": "DENTIST", "include_completed": true, "limit": 2, "cursor": res["next_cursor"]})
	if got := strings.Join(titles(more["tasks"]), ","); got != "Dentist invoice" || more["next_cursor"] != nil {
		t.Fatalf("second page = %s %v", got, more["next_cursor"])
	}
	if r := f.call("u1", "tools/call", map[string]any{"name": "search_tasks", "arguments": map[string]any{"query": "  "}}); errCode(r) != CodeInvalidParams {
		t.Fatalf("empty query: %v", r)
	}
}

// TestEncryptedContentIsOpaque (OpenSpec e2ee): ciphertext titles, project and
// label names reach the assistant as the placeholder with encrypted: true, and
// never match a search, not even for the placeholder's own words.
func TestEncryptedContentIsOpaque(t *testing.T) {
	f := newFixture(t)
	const env = "enc:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
	f.put("u1", "project", "p1", map[string]any{"name": env})
	f.put("u1", "label", "l1", map[string]any{"name": env})
	f.task("u1", "t1", env, map[string]any{"project_id": "p1", "labels": []string{"l1"}, "description": env})
	f.task("u1", "t2", "Plain dentist", nil)
	res := f.tool("u1", "list_tasks", map[string]any{})
	raw, _ := json.Marshal(res)
	if strings.Contains(string(raw), "enc:v1:") {
		t.Fatalf("ciphertext reached the assistant: %s", raw)
	}
	var found bool
	for _, it := range res["tasks"].([]any) {
		m := it.(map[string]any)
		if m["id"] == "t1" {
			found = true
			if ut(m)["title"] != "Encrypted item" || m["encrypted"] != true || ut(m)["project"] != "Encrypted item" {
				t.Fatalf("encrypted task = %v", m)
			}
		}
	}
	if !found {
		t.Fatal("encrypted task missing from list_tasks")
	}
	for _, q := range []string{"encrypted", "enc:", "AAAA"} {
		res = f.tool("u1", "search_tasks", map[string]any{"query": q})
		if n := len(res["tasks"].([]any)); n != 0 {
			t.Fatalf("search %q matched %d encrypted tasks", q, n)
		}
	}
}

func TestTodaySummaryCounts(t *testing.T) {
	f := newFixture(t)
	f.put("u1", "project", "p1", map[string]any{"name": "Garden", "position": 1, "archived": false, "created_at": 1})
	f.put("u1", "project", "p2", map[string]any{"name": "Work", "position": 2, "archived": false, "created_at": 2})
	f.put("u1", "project", "p3", map[string]any{"name": "Old", "position": 3, "archived": true, "created_at": 3})
	f.task("u1", "a", "Overdue inbox", map[string]any{"due": map[string]any{"date": "2026-03-09"}})
	f.task("u1", "b", "Today garden", map[string]any{"due": map[string]any{"date": "2026-03-10"}, "project_id": "p1"})
	f.task("u1", "c", "Garden later", map[string]any{"project_id": "p1"})
	f.task("u1", "d", "Work later", map[string]any{"project_id": "p2", "due": map[string]any{"date": "2026-04-01"}})
	f.task("u1", "e", "Archived overdue", map[string]any{"project_id": "p3", "due": map[string]any{"date": "2026-03-01"}})
	f.task("u1", "g", "Inbox undated", nil)
	f.task("u1", "h", "Done overdue", map[string]any{"due": map[string]any{"date": "2026-03-01"}, "completed_at": 1})

	res := f.tool("u1", "today_summary", map[string]any{"timezone": "America/New_York"})
	if got := strings.Join(titles(res["overdue"]), ","); got != "Overdue inbox" {
		t.Fatalf("overdue = %s", got)
	}
	if got := strings.Join(titles(res["due_today"]), ","); got != "Today garden" {
		t.Fatalf("due today = %s", got)
	}
	counts := res["counts"].(map[string]any)
	// The overdue task without a project is scheduled, so only "Inbox undated" counts (inbox-means-unplaced).
	if counts["overdue"].(float64) != 1 || counts["due_today"].(float64) != 1 || counts["inbox"].(float64) != 1 {
		t.Fatalf("counts = %v", counts)
	}
	per := counts["per_project"].([]any)
	if len(per) != 2 || ut(per[0].(map[string]any))["name"] != "Garden" || per[0].(map[string]any)["open"].(float64) != 2 ||
		per[1].(map[string]any)["open"].(float64) != 1 {
		t.Fatalf("per project = %v", per)
	}
	projects := f.tool("u1", "list_projects", nil)["projects"].([]any)
	if len(projects) != 2 {
		t.Fatalf("projects without archived = %v", projects)
	}
	projects = f.tool("u1", "list_projects", map[string]any{"include_archived": true})["projects"].([]any)
	if len(projects) != 3 || projects[2].(map[string]any)["archived"] != true || projects[0].(map[string]any)["open_count"].(float64) != 2 {
		t.Fatalf("projects with archived = %v", projects)
	}
}

func TestReadResources(t *testing.T) {
	f := newFixture(t)
	f.put("u1", "project", "p1", map[string]any{"name": "Garden", "position": 1, "archived": false, "created_at": 1})
	f.put("u1", "section", "s1", map[string]any{"name": "Beds", "project_id": "p1", "position": 1, "created_at": 1})
	f.task("u1", "t1", "Water", map[string]any{"project_id": "p1", "due": map[string]any{"date": "2026-03-11"}})
	f.task("u1", "t2", "Gone", map[string]any{"deleted_at": 1})
	read := func(uri string) (map[string]any, map[string]any) {
		r := f.call("u1", "resources/read", map[string]any{"uri": uri})
		res, ok := r["result"].(map[string]any)
		if !ok {
			return nil, r
		}
		c := res["contents"].([]any)[0].(map[string]any)
		if c["uri"] != uri || c["mimeType"] != "application/json" {
			t.Fatalf("content = %v", c)
		}
		var payload map[string]any
		_ = json.Unmarshal([]byte(c["text"].(string)), &payload)
		return payload, r
	}
	p, _ := read("opentodo://projects/p1")
	if ut(p["project"].(map[string]any))["name"] != "Garden" || len(p["tasks"].([]any)) != 1 || len(p["sections"].([]any)) != 1 {
		t.Fatalf("project resource = %v", p)
	}
	today, _ := read("opentodo://views/today")
	if len(today["tasks"].([]any)) != 0 {
		t.Fatalf("today in UTC = %v", today)
	}
	today, _ = read("opentodo://views/today?tz=Europe/Rome")
	if len(today["tasks"].([]any)) != 1 || today["timezone"] != "Europe/Rome" {
		t.Fatalf("today in Rome = %v", today)
	}
	if lst, _ := read("opentodo://projects"); len(lst["projects"].([]any)) != 1 {
		t.Fatalf("projects = %v", lst)
	}
	if task, _ := read("opentodo://tasks/t1"); ut(task["task"].(map[string]any))["title"] != "Water" {
		t.Fatalf("task = %v", task)
	}
	for _, uri := range []string{"opentodo://tasks/t2", "opentodo://tasks/nope", "opentodo://projects/nope", "opentodo://views/someday", "https://example.com/x"} {
		if _, r := read(uri); errCode(r) != CodeResourceNotFound {
			t.Fatalf("%s: %v", uri, r)
		}
	}
	if _, r := read("opentodo://views/today?tz=Nowhere/Land"); errCode(r) != CodeInvalidParams {
		t.Fatalf("bad tz: %v", r)
	}
}

func TestMcpLogsNoArguments(t *testing.T) {
	f := newFixture(t)
	f.task("u1", "t1", "Secret surgery appointment", map[string]any{"description": "confidential details"})
	f.tool("u1", "search_tasks", map[string]any{"query": "surgery-needle"})
	f.tool("u1", "get_task", map[string]any{"id": "t1"})
	f.call("u1", "resources/read", map[string]any{"uri": "opentodo://tasks/t1"})
	logs := f.logs.String()
	if !strings.Contains(logs, "method=tools/call") || !strings.Contains(logs, "method=resources/read") || !strings.Contains(logs, "ms=") {
		t.Fatalf("expected method and duration in log:\n%s", logs)
	}
	for _, leak := range []string{"surgery", "Secret", "confidential", "t1", "search_tasks", "opentodo://"} {
		if strings.Contains(logs, leak) {
			t.Fatalf("log contains %q:\n%s", leak, logs)
		}
	}
	for _, line := range strings.Split(strings.TrimSpace(logs), "\n") {
		if fields := strings.Fields(line); len(fields) != 5 { // time level msg method ms
			t.Fatalf("unexpected log line %q", line)
		}
	}
}

func TestMcpPresetSeedsOnce(t *testing.T) {
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	s := NewSettings(db)
	if s.Enabled(ctx) {
		t.Fatal("enabled by default")
	}
	if seeded, err := s.Seed(ctx, nil); err != nil || seeded || s.Enabled(ctx) {
		t.Fatalf("nil preset: %v %v", seeded, err)
	}
	on, off := true, false
	if seeded, err := s.Seed(ctx, &on); err != nil || !seeded || !s.Enabled(ctx) {
		t.Fatalf("first seed: %v %v", seeded, err)
	}
	if err := s.Set(ctx, "owner", false, nil); err != nil || s.Enabled(ctx) {
		t.Fatalf("owner turns it off: %v", err)
	}
	// A restart with the variable still set does not override the owner.
	again := NewSettings(db)
	if seeded, err := again.Seed(ctx, &on); err != nil || seeded || again.Enabled(ctx) {
		t.Fatalf("second seed: %v %v enabled=%v", seeded, err, again.Enabled(ctx))
	}
	if seeded, _ := again.Seed(ctx, &off); seeded {
		t.Fatal("seeded twice")
	}
}

// u1 is a read-token caller for transport-level tests.
var u1 = agenttools.Caller{UserID: "u1", Scope: "read"}

// ut is an item's untrusted_text object (mcp-write-tools D9.5).
func ut(m map[string]any) map[string]any {
	u, _ := m["untrusted_text"].(map[string]any)
	return u
}

// TestToolsListReadOnlyUnchanged: every caller without write permission sees
// exactly the seven read tools (time-tracking added list_time_entries,
// mcp-projects list_icons),
// byte-identical to the golden, however the switches are set.
func TestToolsListReadOnlyUnchanged(t *testing.T) {
	f := newFixture(t)
	want, err := os.ReadFile(filepath.Join("testdata", "tools_list.golden.json"))
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range []agenttools.Caller{
		{UserID: "u1", Scope: "read", OwnerAllowsWrites: true, UserAllowsWrites: true},
		{UserID: "u1", Scope: "full", OwnerAllowsWrites: true, UserAllowsWrites: true},
		{UserID: "u1", Scope: "agent", OwnerAllowsWrites: false, UserAllowsWrites: true},
		{UserID: "u1", Scope: "agent", OwnerAllowsWrites: true, UserAllowsWrites: false},
	} {
		out, _ := f.srv.Handle(context.Background(), c, []byte(`{"jsonrpc":"2.0","id":1,"method":"tools/list"}`))
		var r map[string]any
		_ = json.Unmarshal(out, &r)
		got, _ := json.MarshalIndent(r["result"], "", "  ")
		if !bytes.Equal(append(got, '\n'), want) {
			t.Fatalf("%+v: tools/list differs from the read-only golden:\n%s", c, got)
		}
	}
}

func TestWriteToolsThroughHandle(t *testing.T) {
	f := newFixture(t)
	f.task("u1", "t1", "Water", nil)
	agent := agenttools.Caller{UserID: "u1", TokenID: "tk", TokenName: "Desk", Scope: "agent", OwnerAllowsWrites: true, UserAllowsWrites: true}
	send := func(c agenttools.Caller, body string) map[string]any {
		out, _ := f.srv.Handle(context.Background(), c, []byte(body))
		var r map[string]any
		_ = json.Unmarshal(out, &r)
		return r
	}
	// Listed with readOnlyHint false; instructions mention undo.
	r := send(agent, `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`)
	tools := r["result"].(map[string]any)["tools"].([]any)
	if len(tools) != 22 {
		t.Fatalf("tools = %d", len(tools))
	}
	for _, tl := range tools[7:] {
		if tl.(map[string]any)["annotations"].(map[string]any)["readOnlyHint"] != false {
			t.Fatalf("write tool annotations: %v", tl)
		}
	}
	init := send(agent, `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}`)
	if init["result"].(map[string]any)["instructions"] != WriteInstructions {
		t.Fatal("write instructions missing")
	}
	// A gate refusal is a tool error naming the condition, never -32601.
	full := agent
	full.Scope = "full"
	r = send(full, `{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"complete_tasks","arguments":{"ids":["t1"]}}}`)
	res := r["result"].(map[string]any)
	if res["isError"] != true || res["structuredContent"].(map[string]any)["error"] != "token_scope" {
		t.Fatalf("full token: %v", r)
	}
	// 51 ids: -32602.
	ids := make([]string, 51)
	for i := range ids {
		ids[i] = fmt.Sprintf("id-%d", i)
	}
	b, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": map[string]any{"name": "complete_tasks", "arguments": map[string]any{"ids": ids}}})
	if r = send(agent, string(b)); errCode(r) != CodeInvalidParams {
		t.Fatalf("51 ids: %v", r)
	}
	r = send(agent, `{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"complete_tasks","arguments":{"ids":["t1"]}}}`)
	if res := r["result"].(map[string]any); res["isError"] == true || res["structuredContent"].(map[string]any)["changed"].(float64) != 1 {
		t.Fatalf("complete: %v", r)
	}
	// The ops carry the agent device.
	var dev string
	_ = f.sync.DB().QueryRow(`SELECT device FROM ops WHERE entity_id = 't1' AND field = 'completed_at'`).Scan(&dev)
	if dev != "agent:tk" {
		t.Fatalf("device = %q", dev)
	}
	// Arguments and results never reach the log.
	if strings.Contains(f.logs.String(), "Water") || strings.Contains(f.logs.String(), "t1") {
		t.Fatalf("log leaks: %s", f.logs.String())
	}
}

func TestMcpWritesPresetSeedsOnce(t *testing.T) {
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	s := NewSettings(db)
	if s.WritesEnabled(ctx) {
		t.Fatal("writes on by default")
	}
	on := true
	if seeded, err := s.SeedWrites(ctx, &on); err != nil || !seeded || !s.WritesEnabled(ctx) {
		t.Fatalf("first seed: %v %v", seeded, err)
	}
	if s.Enabled(ctx) {
		t.Fatal("the writes preset turned the endpoint on")
	}
	if err := s.SetWrites(ctx, "owner", false, nil); err != nil || s.WritesEnabled(ctx) {
		t.Fatalf("owner turns it off: %v", err)
	}
	again := NewSettings(db)
	if seeded, err := again.SeedWrites(ctx, &on); err != nil || seeded || again.WritesEnabled(ctx) {
		t.Fatalf("second seed: %v %v", seeded, err)
	}
}

// OpenSpec change completed-date-filters (task 4.2): a completion range on list_tasks.
func TestListTasksCompletionRange(t *testing.T) {
	f := newFixture(t)
	ny, _ := time.LoadLocation("America/New_York")
	at := func(day string, hour int) int64 {
		d, _ := time.ParseInLocation("2006-01-02", day, ny)
		return d.Add(time.Duration(hour) * time.Hour).UnixMilli()
	}
	f.task("u1", "open", "Still open", nil)
	f.task("u1", "before", "Sunday night", map[string]any{"completed_at": at("2026-03-01", 23)})
	f.task("u1", "mon", "Monday", map[string]any{"completed_at": at("2026-03-02", 0)})
	f.task("u1", "sun", "Sunday", map[string]any{"completed_at": at("2026-03-08", 22)})
	f.task("u1", "next", "Next Monday", map[string]any{"completed_at": at("2026-03-09", 1)})

	week := f.tool("u1", "list_tasks", map[string]any{"completed_after": "2026-03-02", "completed_before": "2026-03-09", "timezone": "America/New_York"})
	if got := strings.Join(titles(week["tasks"]), ","); got != "Monday,Sunday" {
		t.Fatalf("week in New York = %s", got)
	}
	first := week["tasks"].([]any)[0].(map[string]any)
	if first["completed_by"] != "u1" || first["completed_at"] == nil || first["completed"] != true {
		t.Fatalf("completed task = %v", first)
	}
	since := f.tool("u1", "list_tasks", map[string]any{"completed_after": "2026-03-09T00:00:00-05:00"})
	if got := strings.Join(titles(since["tasks"]), ","); got != "Next Monday" {
		t.Fatalf("since an RFC 3339 time = %s", got)
	}
	upTo := f.tool("u1", "list_tasks", map[string]any{"completed_before": fmt.Sprint(at("2026-03-02", 0))})
	if got := strings.Join(titles(upTo["tasks"]), ","); got != "Sunday night" {
		t.Fatalf("before Unix ms = %s", got)
	}
	open := f.tool("u1", "list_tasks", map[string]any{})
	if got := strings.Join(titles(open["tasks"]), ","); got != "Still open" {
		t.Fatalf("default = %s", got)
	}
}

// Without the issue connections reader (feature off) the resource is listed
// and reads as an empty list (issue-import, mcp-server delta).
func TestIssuesResourceOff(t *testing.T) {
	f := newFixture(t)
	r := f.call("u1", "resources/read", map[string]any{"uri": IssuesURI})
	contents := r["result"].(map[string]any)["contents"].([]any)
	if text := contents[0].(map[string]any)["text"]; text != `{"connections":[],"enabled":false}` {
		t.Fatalf("text = %v", text)
	}
}
