package httpapi

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"testing"
)

// workspaceActivityEnv: alice's workspace Work holds the shared project
// Website (bob is an editor; carol, a member of Work, is not in it), alice's
// personal project Planning and an Inbox task; alice's default workspace holds
// Elsewhere. Carol has a personal project of her own in Work.
type workspaceActivityEnv struct {
	*shareEnv
	work, def, website, planning, carolProject, fix string
}

func newWorkspaceActivityEnv(t *testing.T) *workspaceActivityEnv {
	t.Helper()
	se := newShareEnv(t)
	w := &workspaceActivityEnv{shareEnv: se, work: createWorkspace(se.alice, "Work")}
	addByEmail(se.alice, se.bob, "/api/v1/workspaces/"+w.work+"/members", "bob@example.com", "member")
	addByEmail(se.alice, se.carol, "/api/v1/workspaces/"+w.work+"/members", "carol@example.com", "member")
	post := func(c *env, path string, body map[string]any) string {
		t.Helper()
		resp, out := c.do("POST", path, body)
		c.mustStatus(resp, 201, out)
		return out["id"].(string)
	}
	w.website = post(se.alice, "/api/v1/projects", map[string]any{"name": "Website", "workspace_id": w.work})
	addByEmail(se.alice, se.bob, "/api/v1/projects/"+w.website+"/members", "bob@example.com", "editor")
	w.planning = post(se.alice, "/api/v1/projects", map[string]any{"name": "Planning", "workspace_id": w.work})
	w.fix = post(se.alice, "/api/v1/tasks", map[string]any{"title": "Fix the login page", "project_id": w.website})
	post(se.alice, "/api/v1/tasks", map[string]any{"title": "Draft the plan", "project_id": w.planning})
	post(se.alice, "/api/v1/tasks", map[string]any{"title": "Inbox thought", "workspace_id": w.work})
	post(se.alice, "/api/v1/tasks", map[string]any{"title": "Elsewhere"}) // the default workspace
	w.carolProject = post(se.carol, "/api/v1/projects", map[string]any{"name": "Carol's notes", "workspace_id": w.work})
	post(se.carol, "/api/v1/tasks", map[string]any{"title": "Carol's own", "project_id": w.carolProject})

	resp, out := se.bob.do("PATCH", "/api/v1/tasks/"+w.fix, map[string]any{"completed_at": 1_760_000_000_000})
	se.bob.mustStatus(resp, 200, out)
	post(se.bob, "/api/v1/tasks/"+w.fix+"/comments", map[string]any{"body": "done"})
	start := int64(1_760_000_000_000)
	post(se.bob, "/api/v1/time-entries", map[string]any{"taskId": w.fix, "startedAt": start, "endedAt": start + 42*60_000, "note": "secret words"})

	resp, out = se.alice.do("GET", "/api/v1/workspaces", nil)
	se.alice.mustStatus(resp, 200, out)
	for _, x := range out["workspaces"].([]any) {
		if m := x.(map[string]any); m["default"] == true {
			w.def = m["id"].(string)
		}
	}
	return w
}

// workspaceEvents reads every page of a workspace's activity.
func workspaceEvents(t *testing.T, c *env, ws, q string) ([]map[string]any, string) {
	t.Helper()
	var evs []map[string]any
	var raw strings.Builder
	cursor := ""
	for {
		path := "/api/v1/workspaces/" + ws + "/activity?limit=3" + q
		if cursor != "" {
			path += "&cursor=" + url.QueryEscape(cursor)
		}
		resp, out := c.do("GET", path, nil)
		c.mustStatus(resp, 200, out)
		b, _ := json.Marshal(out)
		raw.Write(b)
		for _, e := range out["events"].([]any) {
			evs = append(evs, e.(map[string]any))
		}
		if out["more"] != true {
			return evs, raw.String()
		}
		cursor = out["cursor"].(string)
	}
}

func titles(evs []map[string]any) map[string]bool {
	out := map[string]bool{}
	for _, e := range evs {
		if s, _ := e["taskTitle"].(string); s != "" {
			out[s] = true
		}
		if s, _ := e["projectName"].(string); s != "" && e["entity"] == "project" {
			out[s] = true
		}
	}
	return out
}

func TestWorkspaceActivityAnonymous(t *testing.T) {
	w := newWorkspaceActivityEnv(t)
	anon := newClientFor(w.alice)
	resp, out := anon.do("GET", "/api/v1/workspaces/"+w.work+"/activity", nil)
	anon.mustStatus(resp, 401, out)
	if errCode(out) != "unauthorized" {
		t.Fatalf("anonymous = %v", out)
	}
}

// Every project of the workspace the caller can read, personal and shared, and
// its Inbox, every actor's; nothing of another workspace or another member's
// personal data. Time tracked shows its minutes, never the note.
func TestWorkspaceActivityCoversTheWorkspace(t *testing.T) {
	w := newWorkspaceActivityEnv(t)
	evs, raw := workspaceEvents(t, w.alice, w.work, "")
	seen := titles(evs)
	for _, want := range []string{"Website", "Planning", "Fix the login page", "Draft the plan", "Inbox thought"} {
		if !seen[want] {
			t.Errorf("missing %q in %v", want, seen)
		}
	}
	for _, leak := range []string{"Elsewhere", "Milk", "Home", "Carol's notes", "Carol's own"} {
		if seen[leak] || strings.Contains(raw, leak) {
			t.Errorf("leaked %q", leak)
		}
	}
	if strings.Contains(raw, "secret words") {
		t.Fatal("a time entry's note reached an event")
	}
	var tracked map[string]any
	for _, e := range evs {
		if e["kind"] == "time_tracked" {
			tracked = e
		}
	}
	if tracked == nil || tracked["minutes"] != float64(42) || tracked["actorName"] != "bob" || tracked["taskTitle"] != "Fix the login page" ||
		tracked["projectId"] != w.website {
		t.Fatalf("time tracked = %v", tracked)
	}
	for i := 1; i < len(evs); i++ {
		if evs[i]["ts"].(float64) > evs[i-1]["ts"].(float64) {
			t.Fatalf("not newest first at %d", i)
		}
	}
	// The task's and the project's activity list it too.
	for _, path := range []string{"/api/v1/tasks/" + w.fix + "/activity", "/api/v1/projects/" + w.website + "/activity"} {
		resp, out := w.bob.do("GET", path, nil)
		w.bob.mustStatus(resp, 200, out)
		if b, _ := json.Marshal(out); !strings.Contains(string(b), `"kind":"time_tracked"`) || strings.Contains(string(b), "secret words") {
			t.Fatalf("%s = %s", path, b)
		}
	}
}

// Carol belongs to Work but not to Website: none of Website's events reach
// her, whatever the filters, and her own project does.
func TestWorkspaceActivityMemberOutsideSharedProject(t *testing.T) {
	w := newWorkspaceActivityEnv(t)
	for _, q := range []string{"", "&project=" + w.website, "&actor=" + w.ids["bob"], "&kind=completed,commented,time"} {
		evs, raw := workspaceEvents(t, w.carol, w.work, q)
		for _, e := range evs {
			if e["projectId"] == w.website || e["projectId"] == w.planning {
				t.Fatalf("%q: carol sees %v", q, e)
			}
		}
		for _, leak := range []string{"Website", "Fix the login page", "Planning", "Inbox thought"} {
			if strings.Contains(raw, leak) {
				t.Fatalf("%q: carol sees %q", q, leak)
			}
		}
	}
	evs, _ := workspaceEvents(t, w.carol, w.work, "")
	if seen := titles(evs); !seen["Carol's own"] || !seen["Carol's notes"] {
		t.Fatalf("carol's own = %v", seen)
	}
	// Bob, a member of Website, sees it but not alice's personal projects.
	evs, raw := workspaceEvents(t, w.bob, w.work, "")
	if seen := titles(evs); !seen["Fix the login page"] || strings.Contains(raw, "Planning") || strings.Contains(raw, "Inbox thought") {
		t.Fatalf("bob = %v", seen)
	}
}

func TestWorkspaceActivityAnotherPersonsWorkspace(t *testing.T) {
	w := newWorkspaceActivityEnv(t)
	for _, ws := range []string{w.def, "no-such-workspace"} {
		resp, out := w.carol.do("GET", "/api/v1/workspaces/"+ws+"/activity", nil)
		w.carol.mustStatus(resp, 404, out)
		if errCode(out) != "not_found" || strings.Contains(fmt.Sprint(out), "Elsewhere") {
			t.Fatalf("%s = %v", ws, out)
		}
	}
}

func TestWorkspaceActivityInvalidFilter(t *testing.T) {
	w := newWorkspaceActivityEnv(t)
	for q, field := range map[string]string{"kind=finished": "kind", "kind=completed,finished": "kind", "from=20&to=10": "from", "from=yesterday": "from", "to=-1": "to"} {
		resp, out := w.alice.do("GET", "/api/v1/workspaces/"+w.work+"/activity?"+q, nil)
		w.alice.mustStatus(resp, 400, out)
		if errCode(out) != "invalid_input" || !strings.Contains(out["error"].(map[string]any)["message"].(string), field) {
			t.Fatalf("%s = %v", q, out)
		}
	}
}

func TestWorkspaceActivityFilters(t *testing.T) {
	w := newWorkspaceActivityEnv(t)
	all, _ := workspaceEvents(t, w.alice, w.work, "")
	evs, _ := workspaceEvents(t, w.alice, w.work, "&kind=completed,commented,time")
	kinds := map[string]bool{}
	for _, e := range evs {
		kinds[e["kind"].(string)] = true
	}
	if len(kinds) != 3 || !kinds["completed"] || !kinds["commented"] || !kinds["time_tracked"] {
		t.Fatalf("several kinds = %v", kinds)
	}
	evs, _ = workspaceEvents(t, w.alice, w.work, "&project="+w.planning+","+w.website)
	for _, e := range evs {
		if e["projectId"] != w.planning && e["projectId"] != w.website {
			t.Fatalf("project filter = %v", e)
		}
	}
	if len(evs) == 0 || len(evs) >= len(all) {
		t.Fatalf("project filter: %d of %d", len(evs), len(all))
	}
	evs, _ = workspaceEvents(t, w.alice, w.work, "&actor="+w.ids["bob"])
	if len(evs) != 3 {
		t.Fatalf("bob's = %v", evs)
	}
	// The range bounds the events' time, inclusive.
	newest, oldest := int64(all[0]["ts"].(float64)), int64(all[len(all)-1]["ts"].(float64))
	if evs, _ = workspaceEvents(t, w.alice, w.work, fmt.Sprintf("&from=%d&to=%d", oldest, newest)); len(evs) != len(all) {
		t.Fatalf("whole range = %d of %d", len(evs), len(all))
	}
	if evs, _ = workspaceEvents(t, w.alice, w.work, fmt.Sprintf("&from=%d", newest+1)); len(evs) != 0 {
		t.Fatalf("after the newest = %v", evs)
	}
	if evs, _ = workspaceEvents(t, w.alice, w.work, fmt.Sprintf("&to=%d", oldest-1)); len(evs) != 0 {
		t.Fatalf("before the oldest = %v", evs)
	}
	if evs, _ = workspaceEvents(t, w.alice, w.work, fmt.Sprintf("&from=%d&to=%d", newest, newest)); len(evs) == 0 {
		t.Fatal("one instant: none")
	}
}

// A single kind on the feed answers as before; several are any of them.
func TestFeedSeveralKinds(t *testing.T) {
	w := newWorkspaceActivityEnv(t)
	get := func(q string) map[string]bool {
		resp, out := w.alice.do("GET", "/api/v1/activity"+q, nil)
		w.alice.mustStatus(resp, 200, out)
		kinds := map[string]bool{}
		for _, e := range out["events"].([]any) {
			kinds[e.(map[string]any)["kind"].(string)] = true
		}
		return kinds
	}
	if k := get("?kind=commented"); len(k) != 1 || !k["commented"] {
		t.Fatalf("one kind = %v", k)
	}
	if k := get("?kind=completed,commented"); len(k) != 2 || !k["completed"] || !k["commented"] {
		t.Fatalf("two kinds = %v", k)
	}
	if k := get("?kind=time"); len(k) != 1 || !k["time_tracked"] {
		t.Fatalf("time = %v", k)
	}
}

// A large history pages in order, every event exactly once, whatever the page
// size, and the pages agree with one large page.
func TestWorkspaceActivityLargeHistoryPages(t *testing.T) {
	w := newWorkspaceActivityEnv(t)
	for i := 0; i < 60; i++ {
		resp, out := w.alice.do("POST", "/api/v1/tasks", map[string]any{"title": fmt.Sprintf("Step %d", i), "project_id": w.planning})
		w.alice.mustStatus(resp, 201, out)
		if i%3 == 0 {
			resp, out = w.alice.do("PATCH", "/api/v1/tasks/"+out["id"].(string), map[string]any{"priority": 1})
			w.alice.mustStatus(resp, 200, out)
		}
	}
	resp, out := w.alice.do("GET", "/api/v1/workspaces/"+w.work+"/activity?limit=200", nil)
	w.alice.mustStatus(resp, 200, out)
	var want []string
	for _, e := range out["events"].([]any) {
		want = append(want, e.(map[string]any)["id"].(string))
	}
	if len(want) < 60 || out["more"] == true {
		t.Fatalf("one page = %d events, more %v", len(want), out["more"])
	}
	for _, limit := range []int{1, 7, 50} {
		var got []string
		cursor := ""
		for {
			path := fmt.Sprintf("/api/v1/workspaces/%s/activity?limit=%d", w.work, limit)
			if cursor != "" {
				path += "&cursor=" + url.QueryEscape(cursor)
			}
			resp, out := w.alice.do("GET", path, nil)
			w.alice.mustStatus(resp, 200, out)
			for _, e := range out["events"].([]any) {
				got = append(got, e.(map[string]any)["id"].(string))
			}
			if out["more"] != true {
				break
			}
			cursor = out["cursor"].(string)
		}
		if strings.Join(got, ",") != strings.Join(want, ",") {
			t.Fatalf("limit %d: %d events, want %d", limit, len(got), len(want))
		}
	}
}
