package httpapi

import (
	"net/http"
	"strings"
	"testing"
	"time"
)

// Time entry routes (OpenSpec change time-tracking, design D7).

func TestTimeEntryRoutesAuth(t *testing.T) {
	e := ownerEnv(t)
	anon := newClientFor(e)
	for _, rt := range [][2]string{
		{"GET", "/api/v1/time-entries"}, {"GET", "/api/v1/tasks/x/time-entries"}, {"POST", "/api/v1/time-entries"},
		{"POST", "/api/v1/time-entries/stop"}, {"PATCH", "/api/v1/time-entries/x"}, {"DELETE", "/api/v1/time-entries/x"},
	} {
		resp, out := anon.do(rt[0], rt[1], map[string]any{"taskId": "x"})
		if resp.StatusCode != 401 || errCode(out) != "unauthorized" {
			t.Fatalf("anonymous %v: %d %v", rt, resp.StatusCode, out)
		}
	}
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Report"})
	e.mustStatus(resp, 201, out)
	task := out["id"].(string)
	// "Read token on a write" and an agent token: 403 insufficient_scope, nothing written.
	before := countOps(t, e)
	for _, scope := range []string{"read", "agent"} {
		secret := e.token(scope)
		c := e.bearerClient()
		for _, rt := range []struct {
			method, path string
			body         any
		}{
			{"POST", "/api/v1/time-entries", map[string]any{"taskId": task}},
			{"POST", "/api/v1/time-entries/stop", nil},
			{"PATCH", "/api/v1/time-entries/x", map[string]any{"note": "n"}},
			{"DELETE", "/api/v1/time-entries/x", nil},
		} {
			resp, out := c.do(rt.method, rt.path, rt.body, bearer(secret)...)
			if resp.StatusCode != 403 || errCode(out) != "insufficient_scope" {
				t.Fatalf("%s token %s %s: %d %v", scope, rt.method, rt.path, resp.StatusCode, out)
			}
		}
		// Reads are allowed to every scope.
		resp, out := c.do("GET", "/api/v1/time-entries", nil, bearer(secret)...)
		if scope == "read" {
			c.mustStatus(resp, 200, out)
		}
	}
	if after := countOps(t, e); after != before {
		t.Fatalf("ops changed: %d → %d", before, after)
	}
}

func TestTimeEntryStartStopLogEdit(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Write the report"})
	e.mustStatus(resp, 201, out)
	a := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Review"})
	e.mustStatus(resp, 201, out)
	b := out["id"].(string)

	// "Start from the API": the new entry runs, the previous one closes in the same batch.
	resp, first := e.do("POST", "/api/v1/time-entries", map[string]any{"taskId": a})
	e.mustStatus(resp, 201, first)
	if first["endedAt"] != nil || first["taskTitle"] != "Write the report" || !strings.HasPrefix(first["deviceId"].(string), "server") {
		t.Fatalf("started = %v", first)
	}
	time.Sleep(5 * time.Millisecond)
	resp, second := e.do("POST", "/api/v1/time-entries", map[string]any{"taskId": b})
	e.mustStatus(resp, 201, second)
	resp, out = e.do("GET", "/api/v1/time-entries?running=true", nil)
	e.mustStatus(resp, 200, out)
	if list := out["entries"].([]any); len(list) != 1 || list[0].(map[string]any)["id"] != second["id"] {
		t.Fatalf("running = %v", out)
	}
	resp, out = e.do("GET", "/api/v1/tasks/"+a+"/time-entries", nil)
	e.mustStatus(resp, 200, out)
	closed := out["entries"].([]any)[0].(map[string]any)
	if closed["endedAt"] == nil || closed["endedAt"].(float64) < second["startedAt"].(float64)-1000 {
		t.Fatalf("first entry not closed at the second start: %v", closed)
	}
	// A device's next pull sees both entries.
	ops, _, _ := syncAll(e, "laptop", 0)
	seen := map[string]bool{}
	for _, o := range ops {
		if m := o.(map[string]any); m["entity"] == "time_entry" {
			seen[m["entityId"].(string)] = true
		}
	}
	if !seen[first["id"].(string)] || !seen[second["id"].(string)] {
		t.Fatalf("pull misses entries: %v", seen)
	}
	// Stop; then "Nothing to stop".
	resp, out = e.do("POST", "/api/v1/time-entries/stop", nil)
	e.mustStatus(resp, 200, out)
	if out["id"] != second["id"] || out["endedAt"] == nil {
		t.Fatalf("stopped = %v", out)
	}
	resp, out = e.do("POST", "/api/v1/time-entries/stop", nil)
	if resp.StatusCode != 404 || errCode(out) != "not_found" || !strings.Contains(out["error"].(map[string]any)["message"].(string), "no time entry is running") {
		t.Fatalf("nothing to stop: %d %v", resp.StatusCode, out)
	}
	// "Log a closed entry".
	resp, logged := e.do("POST", "/api/v1/time-entries", map[string]any{"taskId": a, "startedAt": 1760950800000, "endedAt": 1760954400000, "note": "review"})
	e.mustStatus(resp, 201, logged)
	if logged["minutes"] != float64(60) || logged["note"] != "review" {
		t.Fatalf("logged = %v", logged)
	}
	// "End before start", on create and on patch.
	resp, out = e.do("POST", "/api/v1/time-entries", map[string]any{"taskId": a, "startedAt": 2000, "endedAt": 1000})
	if resp.StatusCode != 400 || errCode(out) != "invalid_input" || !strings.Contains(out["error"].(map[string]any)["message"].(string), "endedAt") {
		t.Fatalf("end before start: %d %v", resp.StatusCode, out)
	}
	id := logged["id"].(string)
	resp, out = e.do("PATCH", "/api/v1/time-entries/"+id, map[string]any{"endedAt": 1760950700000})
	if resp.StatusCode != 400 || errCode(out) != "invalid_input" {
		t.Fatalf("patch end before start: %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("PATCH", "/api/v1/time-entries/"+id, map[string]any{"endedAt": 1760955300000, "note": "longer"})
	e.mustStatus(resp, 200, out)
	if out["minutes"] != float64(75) || out["note"] != "longer" {
		t.Fatalf("patched = %v", out)
	}
	for _, body := range []map[string]any{{}, {"taskId": a, "startedAt": 5}, {"taskId": a, "userId": "x"}} {
		resp, out = e.do("POST", "/api/v1/time-entries", body)
		e.mustStatus(resp, 400, out)
	}
	// "Unknown or foreign task".
	resp, out = e.do("POST", "/api/v1/time-entries", map[string]any{"taskId": "nope"})
	if resp.StatusCode != 404 || errCode(out) != "not_found" {
		t.Fatalf("unknown task: %d %v", resp.StatusCode, out)
	}
	// "List a task's entries": deleted excluded, newest first.
	resp, _ = e.do("DELETE", "/api/v1/time-entries/"+first["id"].(string), nil)
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("delete = %d", resp.StatusCode)
	}
	resp, out = e.do("GET", "/api/v1/tasks/"+a+"/time-entries", nil)
	e.mustStatus(resp, 200, out)
	list := out["entries"].([]any)
	if len(list) != 1 || list[0].(map[string]any)["id"] != id {
		t.Fatalf("task entries = %v", list)
	}
	for _, k := range []string{"id", "taskId", "userId", "startedAt", "endedAt", "minutes", "note", "deviceId"} {
		if _, ok := list[0].(map[string]any)[k]; !ok {
			t.Fatalf("entry lacks %s: %v", k, list[0])
		}
	}
	// "Bad range" and paging.
	resp, out = e.do("GET", "/api/v1/time-entries?from=2026-13-01", nil)
	if resp.StatusCode != 400 || !strings.Contains(out["error"].(map[string]any)["message"].(string), "from") {
		t.Fatalf("bad range: %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("GET", "/api/v1/time-entries?limit=1", nil)
	e.mustStatus(resp, 200, out)
	cursor, _ := out["nextCursor"].(string)
	if len(out["entries"].([]any)) != 1 || cursor == "" {
		t.Fatalf("page 1 = %v", out)
	}
	page1 := out["entries"].([]any)[0].(map[string]any)["id"]
	resp, out = e.do("GET", "/api/v1/time-entries?limit=1&cursor="+cursor, nil)
	e.mustStatus(resp, 200, out)
	if len(out["entries"].([]any)) != 1 || out["entries"].([]any)[0].(map[string]any)["id"] == page1 || out["nextCursor"] != nil {
		t.Fatalf("page 2 = %v", out)
	}
	// The export carries the entries, deleted ones included.
	resp, out = e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, 200, out)
	if n := len(out["time_entries"].([]any)); n != 3 {
		t.Fatalf("exported %d entries", n)
	}
}

func TestTimeEntrySharedAuthorship(t *testing.T) {
	se := newShareEnv(t)
	se.share(se.alice, "bob@example.com", "editor")
	se.share(se.alice, "carol@example.com", "viewer")
	resp, bobs := se.bob.do("POST", "/api/v1/time-entries", map[string]any{"taskId": se.task, "startedAt": 1760950800000, "endedAt": 1760952000000})
	se.bob.mustStatus(resp, 201, bobs)
	// "Another member's entry": 403 on PATCH and (for an editor) on DELETE.
	resp, out := se.alice.do("PATCH", "/api/v1/time-entries/"+bobs["id"].(string), map[string]any{"note": "mine now"})
	if resp.StatusCode != 403 || errCode(out) != "forbidden" {
		t.Fatalf("patch other: %d %v", resp.StatusCode, out)
	}
	// A viewer cannot track.
	resp, out = se.carol.do("POST", "/api/v1/time-entries", map[string]any{"taskId": se.task})
	if resp.StatusCode != 403 || errCode(out) != "forbidden" {
		t.Fatalf("viewer start: %d %v", resp.StatusCode, out)
	}
	// Everyone in the project reads both; the owner may delete bob's.
	resp, _ = se.alice.do("POST", "/api/v1/time-entries", map[string]any{"taskId": se.task, "startedAt": 1760952000000, "endedAt": 1760953800000})
	se.alice.mustStatus(resp, 201, nil)
	resp, out = se.carol.do("GET", "/api/v1/tasks/"+se.task+"/time-entries", nil)
	se.carol.mustStatus(resp, 200, out)
	if len(out["entries"].([]any)) != 2 {
		t.Fatalf("carol sees %v", out)
	}
	resp, _ = se.alice.do("DELETE", "/api/v1/time-entries/"+bobs["id"].(string), nil)
	if resp.StatusCode != 204 {
		t.Fatalf("owner delete = %d", resp.StatusCode)
	}
	// A task the caller cannot read answers 404.
	resp, out = se.alice.do("POST", "/api/v1/tasks", map[string]any{"title": "Private"})
	se.alice.mustStatus(resp, 201, out)
	private := out["id"].(string)
	resp, out = se.bob.do("GET", "/api/v1/tasks/"+private+"/time-entries", nil)
	if resp.StatusCode != 404 || errCode(out) != "not_found" {
		t.Fatalf("foreign task list: %d %v", resp.StatusCode, out)
	}
	resp, out = se.bob.do("POST", "/api/v1/time-entries", map[string]any{"taskId": private})
	if resp.StatusCode != 404 {
		t.Fatalf("foreign task start: %d %v", resp.StatusCode, out)
	}
}

func TestTimeEntryCSVExport(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Client A"})
	e.mustStatus(resp, 201, out)
	pid := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/fields", map[string]any{"name": "Rate", "type": "number", "project_id": pid})
	e.mustStatus(resp, 201, out)
	rate := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/labels", map[string]any{"name": "billable"})
	e.mustStatus(resp, 201, out)
	l1 := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/labels", map[string]any{"name": "calls"})
	e.mustStatus(resp, 201, out)
	l2 := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Offer", "project_id": pid, "labels": []string{l1, l2}, "fields": map[string]any{rate: 90}})
	e.mustStatus(resp, 201, out)
	task := out["id"].(string)
	// 2026-10-12 07:00Z and 2026-10-13 12:00Z (Berlin: 09:00, 14:00), plus one outside the week.
	for _, se := range [][2]int64{{1791788400000, 1791789900000}, {1791892800000, 1791898200000}, {1792396800000, 1792397700000}} {
		resp, out = e.do("POST", "/api/v1/time-entries", map[string]any{"taskId": task, "startedAt": se[0], "endedAt": se[1]})
		e.mustStatus(resp, 201, out)
	}
	resp, body := e.raw("GET", "/api/v1/time-entries?format=csv&from=2026-10-12&to=2026-10-18&tz=Europe/Berlin", nil)
	if resp.StatusCode != 200 || !strings.HasPrefix(resp.Header.Get("Content-Type"), "text/csv") {
		t.Fatalf("csv: %d %s", resp.StatusCode, resp.Header.Get("Content-Type"))
	}
	if resp.Header.Get("X-Row-Count") != "2" || !strings.Contains(resp.Header.Get("Content-Disposition"), "time-entries-2026-10-12-2026-10-18.csv") {
		t.Fatalf("headers = %v", resp.Header)
	}
	want := "\ufeffdate,start,end,minutes,task,project,labels,note,Rate\r\n" +
		"2026-10-12,09:00,09:25,25,Offer,Client A,billable;calls,,90\r\n" +
		"2026-10-13,14:00,15:30,90,Offer,Client A,billable;calls,,90\r\n"
	if string(body) != want {
		t.Fatalf("csv =\n%q\nwant\n%q", body, want)
	}
	resp, out = e.do("GET", "/api/v1/time-entries?format=xml", nil)
	e.mustStatus(resp, 400, out)
	resp, out = e.do("GET", "/api/v1/time-entries?tz=Mars/Base", nil)
	e.mustStatus(resp, 400, out)
}
