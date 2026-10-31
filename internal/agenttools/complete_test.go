package agenttools

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
	"github.com/OpenTodoApp/opentodo/internal/webhook"
)

// The completed agent tool set (OpenSpec change agent-tools-complete):
// reminders, project notes, archiving, labels and time entries.

func rome(t *testing.T) *time.Location {
	t.Helper()
	loc, err := time.LoadLocation("Europe/Rome")
	if err != nil {
		t.Skip("no tz data")
	}
	return loc
}

func ms(t time.Time) int64 { return t.UnixMilli() }

func firstResult(out map[string]any) map[string]any { return out["results"].([]map[string]any)[0] }

func (f *fixture) opsOn(entity string) int {
	f.t.Helper()
	var n int
	if err := f.sync.DB().QueryRow(`SELECT COUNT(*) FROM ops WHERE entity = ?`, entity).Scan(&n); err != nil {
		f.t.Fatal(err)
	}
	return n
}

func shareWith(f *fixture, pid, role string) {
	f.t.Helper()
	if _, err := f.sync.AddMember(context.Background(), "u1", pid, "u2", role); err != nil {
		f.t.Fatal(err)
	}
}

func TestReminderTools(t *testing.T) {
	f := newFixture(t)
	loc := rome(t)
	f.reg.userZone = func(context.Context, string) *time.Location { return loc }
	c := agent("u1")
	f.task("u1", "block", "Deep work", map[string]any{"due": map[string]any{"date": "2026-10-20", "time": "10:00"}, "deadline": "2026-10-23"})
	f.task("u1", "undated", "Someday", nil)
	ten := ms(time.Date(2026, 10, 20, 10, 0, 0, 0, loc))
	out := f.mustCall(c, "add_reminders", map[string]any{"items": []any{
		map[string]any{"task_id": "block", "kind": "relative", "offset_minutes": 0},
		map[string]any{"task_id": "block", "kind": "relative", "offset_minutes": -30},
		map[string]any{"task_id": "block", "kind": "deadline", "offset_minutes": -1440},
		map[string]any{"task_id": "undated", "kind": "absolute", "at": map[string]any{"date": "2026-11-02", "time": "08:15"}},
		map[string]any{"task_id": "undated", "kind": "absolute", "at": map[string]any{"date": "2026-11-02", "time": "08:15", "tz": "America/New_York"}},
		map[string]any{"task_id": "undated", "kind": "relative"},
	}})
	res := out["results"].([]map[string]any)
	ny, _ := time.LoadLocation("America/New_York")
	want := []int64{ten, ten - 30*60_000, ms(time.Date(2026, 10, 22, 9, 0, 0, 0, loc)), ms(time.Date(2026, 11, 2, 8, 15, 0, 0, loc)), ms(time.Date(2026, 11, 2, 8, 15, 0, 0, ny)), 0}
	for i, w := range want {
		rem := f.entity("u1", "reminder", res[i]["id"].(string))
		var got int64
		_ = json.Unmarshal(rem["fire_at"], &got)
		if got != w {
			t.Fatalf("reminder %d fire_at = %d, want %d (%s)", i, got, w, rem["fire_at"])
		}
	}
	var agentOps int
	_ = f.sync.DB().QueryRow(`SELECT COUNT(*) FROM ops WHERE entity = 'reminder' AND device = 'agent:tok-u1'`).Scan(&agentOps)
	if agentOps == 0 || strings.Contains(firstResult(out)["id"].(string), " ") {
		t.Fatal("reminders not written with the agent device")
	}
	if res[5]["fire_at"] != (*string)(nil) {
		t.Fatalf("undated relative fire_at = %v", res[5]["fire_at"])
	}
	// get_task lists the caller's reminders of the task.
	detail := f.mustCall(c, "get_task", map[string]any{"id": "block"})
	if rs := detail["reminders"].([]reminderOut); len(rs) != 3 {
		t.Fatalf("get_task reminders = %+v", rs)
	}
	// Update the 10:00 one to 09:45; the kind stays.
	id0 := res[0]["id"].(string)
	f.mustCall(c, "update_reminders", map[string]any{"updates": []any{map[string]any{"id": id0, "offset_minutes": -15}}})
	var fire int64
	_ = json.Unmarshal(f.entity("u1", "reminder", id0)["fire_at"], &fire)
	if fire != ten-15*60_000 {
		t.Fatalf("updated fire_at = %d", fire)
	}
	if _, err := f.call(c, "update_reminders", map[string]any{"updates": []any{map[string]any{"id": id0, "at": map[string]any{"date": "2026-11-02", "time": "08:00"}}}}); !isArgErr(err) {
		t.Fatalf("kind change: %v", err)
	}
	// Remove writes a tombstone.
	f.mustCall(c, "remove_reminders", map[string]any{"ids": []string{id0}})
	if !f.entity("u1", "reminder", id0).Deleted() {
		t.Fatal("reminder not removed")
	}
	// The 11th live reminder of a task is refused and nothing is written.
	var items []any
	for i := 0; i < 8; i++ {
		items = append(items, map[string]any{"task_id": "block", "kind": "relative", "offset_minutes": -i})
	}
	f.mustCall(c, "add_reminders", map[string]any{"items": items})
	before := f.opsOn("reminder")
	if _, err := f.call(c, "add_reminders", map[string]any{"items": []any{map[string]any{"task_id": "block", "kind": "relative"}}}); toolCode(err) != "invalid" {
		t.Fatalf("11th reminder: %v", err)
	}
	if f.opsOn("reminder") != before {
		t.Fatal("a refused call wrote ops")
	}
	// Bad arguments.
	for _, bad := range []map[string]any{
		{"task_id": "block", "kind": "relative", "offset_minutes": 5},
		{"task_id": "block", "kind": "absolute"},
		{"task_id": "block", "kind": "relative", "at": map[string]any{"date": "2026-11-02", "time": "08:00"}},
		{"task_id": "block", "kind": "absolute", "at": map[string]any{"date": "2026-11-02", "time": "8"}},
		{"task_id": "block", "kind": "soon"},
	} {
		if _, err := f.call(c, "add_reminders", map[string]any{"items": []any{bad}}); !isArgErr(err) {
			t.Fatalf("%v: %v", bad, err)
		}
	}
}

func TestRemindersArePersonal(t *testing.T) {
	f := newFixture(t)
	f.put("u1", "project", "p", map[string]any{"name": "Shared", "position": 1, "created_at": 1})
	shareWith(f, "p", opsync.RoleViewer)
	f.task("u1", "t", "Shared task", map[string]any{"project_id": "p", "due": map[string]any{"date": "2026-10-20"}})
	f.put("u1", "reminder", "r-owner", map[string]any{"task_id": "t", "kind": "relative", "offset_minutes": 0, "fire_at": 1, "created_at": 1})
	viewer := agent("u2")
	out := f.mustCall(viewer, "add_reminders", map[string]any{"items": []any{
		map[string]any{"task_id": "t", "kind": "relative", "offset_minutes": 0},
		map[string]any{"task_id": "t", "kind": "relative", "offset_minutes": -10},
	}})
	if out["changed"] != 2 {
		t.Fatalf("viewer add = %v", out)
	}
	if rs := f.mustCall(viewer, "get_task", map[string]any{"id": "t"})["reminders"].([]reminderOut); len(rs) != 2 {
		t.Fatalf("viewer sees %+v", rs)
	}
	if rs := f.mustCall(agent("u1"), "get_task", map[string]any{"id": "t"})["reminders"].([]reminderOut); len(rs) != 1 || rs[0].ID != "r-owner" {
		t.Fatalf("owner sees %+v", rs)
	}
	for name, a := range map[string]map[string]any{
		"update_reminders": {"updates": []any{map[string]any{"id": "r-owner", "offset_minutes": -5}}},
		"remove_reminders": {"ids": []string{"r-owner"}},
	} {
		if _, err := f.call(viewer, name, a); toolCode(err) != "not_found" {
			t.Fatalf("%s on another user's reminder: %v", name, err)
		}
	}
}

func TestRemindersOnExcludedProject(t *testing.T) {
	f := newFixture(t)
	f.reg.exclusions = NewExclusions(f.sync.DB())
	f.put("u1", "project", "private", map[string]any{"name": "Private", "position": 1, "created_at": 1})
	f.task("u1", "t", "Hidden", map[string]any{"project_id": "private"})
	f.put("u1", "reminder", "r1", map[string]any{"task_id": "t", "kind": "absolute", "fire_at": 1, "created_at": 1})
	if err := f.reg.exclusions.Set(context.Background(), "u1", "private", true, nil); err != nil {
		t.Fatal(err)
	}
	c := agent("u1")
	if _, err := f.call(c, "add_reminders", map[string]any{"items": []any{map[string]any{"task_id": "t", "kind": "relative"}}}); toolCode(err) != "not_found" {
		t.Fatalf("add: %v", err)
	}
	if _, err := f.call(c, "remove_reminders", map[string]any{"ids": []string{"r1"}}); toolCode(err) != "not_found" {
		t.Fatalf("remove: %v", err)
	}
	if _, err := f.call(c, "log_time", map[string]any{"items": []any{map[string]any{"task_id": "t", "started_at": "2026-10-12T08:00:00Z", "ended_at": "2026-10-12T08:25:00Z"}}}); toolCode(err) != "not_found" {
		t.Fatalf("log_time: %v", err)
	}
}

func TestProjectNoteTool(t *testing.T) {
	f := newFixture(t)
	c := agent("u1")
	f.put("u1", "project", "client", map[string]any{"name": "Client X", "position": 1, "created_at": 1, "description": "", "notes_doc": ""})
	f.mustCall(c, "update_project", map[string]any{"id": "client", "append_description": "## 2026-10-28\nKick-off."})
	if got := rawStr(f.entity("u1", "project", "client"), "description"); got != "## 2026-10-28\nKick-off." {
		t.Fatalf("append to empty = %q", got)
	}
	f.mustCall(c, "update_project", map[string]any{"id": "client", "append_description": "## 2026-10-29\nCall notes: budget approved."})
	p := f.entity("u1", "project", "client")
	if got := rawStr(p, "description"); got != "## 2026-10-28\nKick-off.\n\n## 2026-10-29\nCall notes: budget approved." {
		t.Fatalf("append = %q", got)
	}
	f.mustCall(c, "update_project", map[string]any{"id": "client", "description": "Budget approved."})
	if got := rawStr(f.entity("u1", "project", "client"), "description"); got != "Budget approved." {
		t.Fatalf("replace = %q", got)
	}
	var docOps int
	_ = f.sync.DB().QueryRow(`SELECT COUNT(*) FROM ops WHERE field = 'notes_doc' AND device LIKE 'agent:%'`).Scan(&docOps)
	if docOps != 0 {
		t.Fatal("an assistant wrote notes_doc")
	}
	if _, err := f.call(c, "update_project", map[string]any{"id": "client", "description": "a", "append_description": "b"}); !isArgErr(err) {
		t.Fatalf("both: %v", err)
	}
	// Roles: an editor may write the note, a viewer may not.
	f.put("u1", "project", "shared", map[string]any{"name": "Shared", "position": 2, "created_at": 1})
	shareWith(f, "shared", opsync.RoleEditor)
	f.mustCall(agent("u2"), "update_project", map[string]any{"id": "shared", "append_description": "From the editor."})
	if _, err := f.call(agent("u2"), "update_project", map[string]any{"id": "shared", "name": "Renamed"}); toolCode(err) != "forbidden" {
		t.Fatalf("editor rename: %v", err)
	}
	if _, err := f.call(agent("u2"), "archive_projects", map[string]any{"id": "shared", "archived": true}); toolCode(err) != "forbidden" {
		t.Fatalf("editor archive: %v", err)
	}
	if _, err := f.sync.SetMemberRole(context.Background(), "u1", "shared", "u2", opsync.RoleViewer); err != nil {
		t.Fatal(err)
	}
	if _, err := f.call(agent("u2"), "update_project", map[string]any{"id": "shared", "description": "x"}); toolCode(err) != "forbidden" {
		t.Fatalf("viewer note: %v", err)
	}
}

func TestProjectNoteEncrypted(t *testing.T) {
	f := newFixture(t)
	f.put("u1", "project", "p", map[string]any{"name": fakeSeal("project", "p", "name", "Client"), "position": 1, "created_at": 1,
		"description": fakeSeal("project", "p", "description", "First line.")})
	c := agent("u1")
	c.Encrypted = true
	if _, err := f.call(c, "update_project", map[string]any{"id": "p", "append_description": "More."}); toolCode(err) != "encryption_enabled" {
		t.Fatalf("append without a device: %v", err)
	}
	if _, err := f.call(c, "update_project", map[string]any{"id": "p", "append_description": envelope("A")}); toolCode(err) != "encryption_enabled" {
		t.Fatalf("append ciphertext without a device: %v", err)
	}
	if _, err := f.call(c, "update_project", map[string]any{"id": "p", "description": "plain"}); toolCode(err) != "encryption_enabled" {
		t.Fatalf("plain description: %v", err)
	}
	f.mustCall(c, "update_project", map[string]any{"id": "p", "description": envelope("B")})
	// Reminders and archiving carry no content.
	f.task("u1", "t", fakeSeal("task", "t", "title", "Secret"), nil)
	f.mustCall(c, "add_reminders", map[string]any{"items": []any{map[string]any{"task_id": "t", "kind": "absolute", "at": map[string]any{"date": "2026-11-02", "time": "08:00"}}}})
	f.mustCall(c, "start_timer", map[string]any{"task_id": "t"})
	f.mustCall(c, "archive_projects", map[string]any{"id": "p", "archived": true})
	// Through an opted-in device the append is made on the plaintext and sealed there.
	f.put("u1", "project", "q", map[string]any{"name": fakeSeal("project", "q", "name", "Q"), "position": 2, "created_at": 1,
		"description": fakeSeal("project", "q", "description", "First line.")})
	fr := &fakeRelay{}
	c.Relay = fr
	f.mustCall(c, "update_project", map[string]any{"id": "q", "append_description": "Second line."})
	if got := rawStr(f.entity("u1", "project", "q"), "description"); got != fakeSeal("project", "q", "description", "First line.\n\nSecond line.") {
		t.Fatalf("relayed append stored %q", got)
	}
	var n int
	_ = f.sync.DB().QueryRow(`SELECT COUNT(*) FROM ops WHERE value LIKE '%Second line%'`).Scan(&n)
	if n != 0 {
		t.Fatal("the plaintext reached the op log")
	}
}

func TestArchiveProjects(t *testing.T) {
	f := newFixture(t)
	c := agent("u1")
	f.put("u1", "project", "a", map[string]any{"name": "Client X", "position": 1, "created_at": 1, "archived": false})
	f.put("u1", "project", "b", map[string]any{"name": "Phase 1", "position": 2, "created_at": 1, "archived": false, "parent_id": "a"})
	f.put("u1", "project", "c", map[string]any{"name": "Drafts", "position": 3, "created_at": 1, "archived": false, "parent_id": "b"})
	f.put("u1", "project", "z", map[string]any{"name": "Other", "position": 4, "created_at": 1, "archived": false})
	used := f.reg.limits.dayCount("tok-u1")
	var events []string
	f.sync.SetObserver(func(_ context.Context, changes []opsync.Change) {
		for _, ch := range changes {
			events = append(events, webhook.EventFor(ch))
		}
	})
	out := f.mustCall(c, "archive_projects", map[string]any{"id": "a", "archived": true})
	f.sync.SetObserver(nil)
	if out["changed"] != 3 || f.reg.limits.dayCount("tok-u1")-used != 3 {
		t.Fatalf("archive = %v", out)
	}
	if strings.Join(events, ",") != "project.archived,project.archived,project.archived" {
		t.Fatalf("webhook events = %v, want one project.archived per project", events)
	}
	for _, id := range []string{"a", "b", "c"} {
		if !boolean(f.entity("u1", "project", id), "archived") {
			t.Fatalf("%s not archived", id)
		}
	}
	if boolean(f.entity("u1", "project", "z"), "archived") {
		t.Fatal("an unrelated project was archived")
	}
	var n int
	_ = f.sync.DB().QueryRow(`SELECT COUNT(*) FROM ops WHERE entity = 'project' AND field = 'archived' AND device LIKE 'agent:%'`).Scan(&n)
	if n != 3 {
		t.Fatalf("%d archive ops, want one per project", n)
	}
	f.mustCall(c, "archive_projects", map[string]any{"id": "a", "archived": false})
	if boolean(f.entity("u1", "project", "a"), "archived") || !boolean(f.entity("u1", "project", "b"), "archived") {
		t.Fatal("unarchive must bring back the project alone")
	}
	if _, err := f.call(c, "archive_projects", map[string]any{"id": "a"}); !isArgErr(err) {
		t.Fatalf("no archived: %v", err)
	}
	if _, err := f.call(c, "archive_projects", map[string]any{"id": "nope", "archived": true}); toolCode(err) != "not_found" {
		t.Fatalf("unknown: %v", err)
	}
}

func TestUpdateLabels(t *testing.T) {
	f := newFixture(t)
	c := agent("u1")
	f.put("u1", "label", "errand", map[string]any{"name": "errand", "color": "#64748b", "position": 1, "created_at": 1})
	f.put("u1", "label", "home", map[string]any{"name": "home", "color": "#64748b", "position": 2, "created_at": 1})
	f.put("u1", "label", "errands-work", map[string]any{"name": "Errands", "color": "#64748b", "position": 3, "created_at": 1, "workspace_id": "ws-work"})
	for i := 0; i < 40; i++ {
		f.task("u1", "t"+string(rune('A'+i/26))+string(rune('a'+i%26)), "Task", map[string]any{"labels": []string{"errand"}})
	}
	before := f.opsOn("task")
	beforeLabel := f.opsOn("label")
	f.mustCall(c, "update_labels", map[string]any{"updates": []any{map[string]any{"id": "errand", "name": "errands"}}})
	if f.opsOn("task") != before || f.opsOn("label") != beforeLabel+1 {
		t.Fatalf("rename wrote %d task ops and %d label ops", f.opsOn("task")-before, f.opsOn("label")-beforeLabel)
	}
	if rawStr(f.entity("u1", "label", "errand"), "name") != "errands" {
		t.Fatal("not renamed")
	}
	// The name is taken in the default workspace (another workspace's label does not count).
	if _, err := f.call(c, "update_labels", map[string]any{"updates": []any{map[string]any{"id": "home", "name": "Errands"}}}); toolCode(err) != "invalid" {
		t.Fatalf("taken name: %v", err)
	}
	f.mustCall(c, "update_labels", map[string]any{"updates": []any{map[string]any{"id": "home", "color": "#16A34A", "position": 0.5}}})
	if l := f.entity("u1", "label", "home"); rawStr(l, "color") != "#16a34a" || num(l, "position") != 0.5 {
		t.Fatalf("recolour = %v", l)
	}
	if _, err := f.call(c, "update_labels", map[string]any{"updates": []any{map[string]any{"id": "nope", "name": "x"}}}); toolCode(err) != "not_found" {
		t.Fatalf("unknown: %v", err)
	}
}

func TestTimeEntryTools(t *testing.T) {
	f := newFixture(t)
	c := agent("u1")
	f.task("u1", "report", "Write the report", nil)
	f.task("u1", "a", "Task A", nil)
	nine := time.Date(2026, 10, 12, 9, 0, 0, 0, time.UTC)
	out := f.mustCall(c, "log_time", map[string]any{"items": []any{map[string]any{"task_id": "report", "started_at": nine.Format(time.RFC3339), "ended_at": nine.Add(25 * time.Minute).Format(time.RFC3339), "note": "Pomodoro"}}})
	logged := firstResult(out)["id"].(string)
	e := f.entity("u1", "time_entry", logged)
	if rawStr(e, "device_id") != "agent:tok-u1" || rawStr(e, "user_id") != "u1" || num(e, "ended_at")-num(e, "started_at") != 25*60_000 {
		t.Fatalf("logged entry = %v", e)
	}
	// Invalid ranges are argument errors and write nothing.
	before := f.opsOn("time_entry")
	for _, it := range []map[string]any{
		{"task_id": "report", "started_at": "2026-10-12T09:00:00Z", "ended_at": "2026-10-12T08:00:00Z"},
		{"task_id": "report", "started_at": "2026-10-10T09:00:00Z", "ended_at": "2026-10-11T15:00:00Z"},
		{"task_id": "report", "started_at": "2026-10-12T09:00:00Z", "ended_at": "2026-10-12T11:00:00Z"},
		{"task_id": "report", "started_at": "yesterday", "ended_at": "2026-10-12T09:30:00Z"},
	} {
		if _, err := f.call(c, "log_time", map[string]any{"items": []any{it}}); !isArgErr(err) {
			t.Fatalf("%v: %v", it, err)
		}
	}
	if f.opsOn("time_entry") != before {
		t.Fatal("a refused call wrote ops")
	}
	// The person's timer runs on A: starting B is refused, naming A.
	f.put("u1", "time_entry", "person", map[string]any{"task_id": "a", "user_id": "u1", "started_at": ms(nine.Add(30 * time.Minute)), "ended_at": nil, "device_id": "phone", "note": "", "created_at": 1})
	_, err := f.call(c, "start_timer", map[string]any{"task_id": "report"})
	var te *ToolError
	if toolCode(err) != "timer_running" || !asToolErr(err, &te) || te.Data["task_id"] != "a" {
		t.Fatalf("start while running: %v", err)
	}
	if f.entity("u1", "time_entry", "person")["ended_at"] != nil && string(f.entity("u1", "time_entry", "person")["ended_at"]) != "null" {
		t.Fatal("the person's timer was stopped")
	}
	// Explicit takeover ends A at B's start.
	out = f.mustCall(c, "start_timer", map[string]any{"task_id": "report", "stop_running": true})
	started := firstResult(out)["id"].(string)
	if num(f.entity("u1", "time_entry", "person"), "ended_at") != num(f.entity("u1", "time_entry", started), "started_at") {
		t.Fatal("A did not end at B's start")
	}
	// Editing the person's entry is not permitted; the token's own is.
	if _, err := f.call(c, "update_time_entries", map[string]any{"updates": []any{map[string]any{"id": "person", "note": "x"}}}); toolCode(err) != "not_permitted" {
		t.Fatalf("edit person's entry: %v", err)
	}
	f.mustCall(c, "update_time_entries", map[string]any{"updates": []any{map[string]any{"id": logged, "note": "Pomodoro 1", "ended_at": nine.Add(20 * time.Minute).Format(time.RFC3339)}}})
	if e := f.entity("u1", "time_entry", logged); rawStr(e, "note") != "Pomodoro 1" || num(e, "ended_at")-num(e, "started_at") != 20*60_000 {
		t.Fatalf("updated = %v", e)
	}
	if _, err := f.call(c, "update_time_entries", map[string]any{"updates": []any{map[string]any{"id": logged, "ended_at": "2026-10-12T08:00:00Z"}}}); !isArgErr(err) {
		t.Fatalf("end before start: %v", err)
	}
	f.mustCall(c, "stop_timer", nil)
	if _, err := f.call(c, "stop_timer", nil); toolCode(err) != "not_found" {
		t.Fatalf("nothing to stop: %v", err)
	}
	// A retried keyed start returns the same entry.
	first := f.mustCall(c, "start_timer", map[string]any{"task_id": "a", "client_request_id": "k1"})
	again := f.mustCall(c, "start_timer", map[string]any{"task_id": "a", "client_request_id": "k1"})
	if firstResult(first)["id"] != firstResult(again)["id"] || firstResult(again)["status"] != "exists" {
		t.Fatalf("replay = %v / %v", first, again)
	}
	// Viewers cannot track.
	f.put("u1", "project", "p", map[string]any{"name": "Shared", "position": 1, "created_at": 1})
	shareWith(f, "p", opsync.RoleViewer)
	f.task("u1", "shared", "Shared", map[string]any{"project_id": "p"})
	if _, err := f.call(agent("u2"), "start_timer", map[string]any{"task_id": "shared"}); toolCode(err) != "forbidden" {
		t.Fatalf("viewer start: %v", err)
	}
	if _, err := f.call(agent("u2"), "log_time", map[string]any{"items": []any{map[string]any{"task_id": "shared", "started_at": "2026-10-12T08:00:00Z", "ended_at": "2026-10-12T08:25:00Z"}}}); toolCode(err) != "forbidden" {
		t.Fatalf("viewer log: %v", err)
	}
}

func asToolErr(err error, te **ToolError) bool {
	e, ok := err.(*ToolError)
	if ok {
		*te = e
	}
	return ok
}

// The new write tools are hidden and refused without write permission.
func TestCompletedToolsNeedWritePermission(t *testing.T) {
	f := newFixture(t)
	f.task("u1", "t", "Task", nil)
	off := agent("u1")
	off.UserAllowsWrites = false
	newTools := []string{"archive_projects", "update_labels", "add_reminders", "update_reminders", "remove_reminders", "start_timer", "stop_timer", "log_time", "update_time_entries"}
	for _, c := range []Caller{off, {UserID: "u1", Scope: "read", OwnerAllowsWrites: true, UserAllowsWrites: true}} {
		listed := map[string]bool{}
		for _, d := range f.reg.Definitions(c) {
			listed[d.Name] = true
		}
		for _, n := range newTools {
			if listed[n] {
				t.Fatalf("%s listed for %+v", n, c)
			}
		}
	}
	if _, err := f.call(off, "start_timer", map[string]any{"task_id": "t"}); toolCode(err) != DeniedByUser {
		t.Fatalf("switched off: %v", err)
	}
	listed := map[string]bool{}
	for _, d := range f.reg.Definitions(agent("u1")) {
		listed[d.Name] = true
	}
	for _, n := range newTools {
		if !listed[n] {
			t.Fatalf("%s not listed for a permitted agent", n)
		}
	}
}

// dayCount is the entities a token changed today (test helper).
func (l *Limiter) dayCount(token string) int {
	l.mu.Lock()
	defer l.mu.Unlock()
	if u, ok := l.tokens[token]; ok {
		return u.entities
	}
	return 0
}
