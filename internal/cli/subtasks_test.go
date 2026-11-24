package cli

import (
	"encoding/json"
	"strings"
	"testing"
)

// seedTrip is the subtask fixture of cli-subtasks: "Plan trip" in Travel with
// two open subtasks, one completed one and a grandchild.
//
//	trip0001 Plan trip
//	  hotl0001 Book hotel
//	    cmpr0001 Compare prices
//	  flig0001 Flights
//	  visa0001 Visa (completed)
func (h *harness) seedTrip() {
	h.put("project", "trav0001", map[string]any{"name": "Travel", "color": "#10b981", "archived": false})
	h.put("project", "work0001", map[string]any{"name": "Work", "color": "#64748b", "archived": false})
	h.put("task", "trip0001", map[string]any{"title": "Plan trip", "project_id": "trav0001", "position": 1})
	h.put("task", "hotl0001", map[string]any{"title": "Book hotel", "project_id": "trav0001", "parent_id": "trip0001", "position": 2})
	h.put("task", "cmpr0001", map[string]any{"title": "Compare prices", "project_id": "trav0001", "parent_id": "hotl0001", "position": 3})
	h.put("task", "flig0001", map[string]any{"title": "Flights", "project_id": "trav0001", "parent_id": "trip0001", "position": 4})
	h.put("task", "visa0001", map[string]any{"title": "Visa", "project_id": "trav0001", "parent_id": "trip0001", "position": 5, "completed_at": 1700000000000})
	h.put("task", "pack0001", map[string]any{"title": "Pack", "project_id": "trav0001", "position": 6})
	h.put("task", "inbx0001", map[string]any{"title": "Inbox parent", "position": 7})
}

func TestSubtaskAdd(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.seedTrip()

	// Without --project the subtask takes the parent's project.
	out := h.mustRun("add", "Insurance", "--parent", "trip", "--json")
	var created task
	if err := json.Unmarshal([]byte(out), &created); err != nil {
		t.Fatal(err)
	}
	if created.ParentID == nil || *created.ParentID != "trip0001" || created.ProjectID == nil || *created.ProjectID != "trav0001" {
		t.Fatalf("created = %+v", created)
	}
	// An Inbox parent: the subtask stays in the Inbox, under it.
	id := strings.TrimSpace(h.mustRun("add", "Inbox child", "--parent", "inbx"))
	if srv := h.task(id); srv["parent_id"] != "inbx0001" || srv["project_id"] != nil {
		t.Fatalf("inbox child = %v", srv)
	}
	// The same --project is accepted.
	h.mustRun("add", "Taxi", "--parent", "trip", "--project", "Travel")

	// Refused locally, nothing sent: another project, a completed parent, none, an unknown ref.
	for _, args := range [][]string{
		{"add", "x", "--parent", "trip", "--project", "Work"},
		{"add", "x", "--parent", "visa"},
		{"add", "x", "--parent", "none"},
		{"add", "x", "--parent", "nope"},
	} {
		h.requestLog()
		code, _, errb := h.run(args...)
		if code != ExitUsage {
			t.Fatalf("ot %v: exit %d %q", args, code, errb)
		}
		if w := writesIn(h.requestLog()); len(w) != 0 {
			t.Fatalf("ot %v sent %v", args, w)
		}
	}
}

func TestSubtaskEdit(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.seedTrip()

	// Under another task, then back to the top level.
	h.mustRun("edit", "pack", "--parent", "trip")
	if srv := h.task("pack0001"); srv["parent_id"] != "trip0001" {
		t.Fatalf("pack = %v", srv)
	}
	h.mustRun("edit", "pack", "--parent", "none")
	if srv := h.task("pack0001"); srv["parent_id"] != nil {
		t.Fatalf("pack after none = %v", srv)
	}
	// A parent in another project moves the task there in the same patch.
	h.put("task", "meet0001", map[string]any{"title": "Meeting", "project_id": "work0001", "position": 8})
	h.mustRun("edit", "pack", "--parent", "meet")
	if srv := h.task("pack0001"); srv["parent_id"] != "meet0001" || srv["project_id"] != "work0001" {
		t.Fatalf("pack under meeting = %v", srv)
	}
	// An Inbox parent moves it to the Inbox.
	h.mustRun("edit", "pack", "--parent", "inbx")
	if srv := h.task("pack0001"); srv["parent_id"] != "inbx0001" || srv["project_id"] != nil {
		t.Fatalf("pack under inbox parent = %v", srv)
	}
	// A cycle is refused by the server and nothing changes.
	code, _, errb := h.run("edit", "trip", "--parent", "cmpr")
	if code == 0 || !strings.Contains(errb, "descendant") {
		t.Fatalf("cycle: exit %d %q", code, errb)
	}
	if srv := h.task("trip0001"); srv["parent_id"] != nil {
		t.Fatalf("trip after cycle = %v", srv)
	}
	// Equal values send nothing.
	h.requestLog()
	if out := h.mustRun("edit", "hotl", "--parent", "trip"); !strings.HasPrefix(out, "unchanged") {
		t.Fatalf("noop = %q", out)
	}
	if w := writesIn(h.requestLog()); len(w) != 0 {
		t.Fatalf("noop sent %v", w)
	}
}

func TestDescendants(t *testing.T) {
	s := func(v string) *string { return &v }
	gone := 1.0
	all := []task{
		{ID: "a", Position: 1},
		{ID: "b", ParentID: s("a"), Position: 2},
		{ID: "c", ParentID: s("b"), Position: 3},
		{ID: "d", ParentID: s("a"), Position: 1},
		{ID: "e", ParentID: s("a"), DeletedAt: &gone},
		{ID: "f", ParentID: s("e")},
		// A cycle left by concurrent moves.
		{ID: "x", ParentID: s("y")},
		{ID: "y", ParentID: s("x")},
	}
	ids := func(ts []task) string {
		var out []string
		for _, t := range ts {
			out = append(out, t.ID)
		}
		return strings.Join(out, ",")
	}
	if got := ids(descendants(all, "a")); got != "d,b,c" {
		t.Errorf("descendants(a) = %s", got)
	}
	if got := ids(descendants(all, "x")); got != "y" {
		t.Errorf("descendants(x) = %s", got)
	}
	if got := ids(liveChildren(all, "a")); got != "d,b" {
		t.Errorf("liveChildren(a) = %s", got)
	}
	rows, depth := nestTasks([]task{all[0], all[1], all[2], all[3], all[6], all[7]})
	if got := ids(rows); got != "a,b,c,d,x,y" || depth["c"] != 2 || depth["x"] != 0 || depth["y"] != 1 {
		t.Errorf("nestTasks = %s %v", got, depth)
	}
}

func TestSubtaskCascades(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.seedTrip()

	// Without --subtasks only the named task changes (the 1.x behaviour).
	h.mustRun("done", "trip")
	if h.task("trip0001")["completed_at"] == nil || h.task("hotl0001")["completed_at"] != nil {
		t.Fatal("done without --subtasks touched a subtask")
	}
	h.mustRun("reopen", "trip")

	// A dry run lists one request per open task, deepest first, the parent last.
	out := h.mustRun("done", "trip", "--subtasks", "--dry-run", "--json")
	var plan struct {
		Requests []plannedRequest
	}
	_ = json.Unmarshal([]byte(out), &plan)
	var paths []string
	for _, r := range plan.Requests {
		paths = append(paths, strings.TrimPrefix(r.Path, "/api/v1/tasks/"))
	}
	if got := strings.Join(paths, ","); got != "flig0001,cmpr0001,hotl0001,trip0001" {
		t.Fatalf("done --subtasks plan = %s", got)
	}
	// The real run completes the open ones; the completed one is untouched.
	visaBefore := h.task("visa0001")["completed_at"]
	h.mustRun("done", "trip", "--subtasks")
	for _, id := range []string{"trip0001", "hotl0001", "cmpr0001", "flig0001"} {
		if h.task(id)["completed_at"] == nil {
			t.Fatalf("%s not completed", id)
		}
	}
	if h.task("visa0001")["completed_at"] != visaBefore {
		t.Fatal("a completed subtask was written again")
	}
	// reopen has no cascade.
	h.mustRun("reopen", "trip")
	if h.task("hotl0001")["completed_at"] == nil {
		t.Fatal("reopen reopened a subtask")
	}
	if code, _, _ := h.run("reopen", "hotl", "--subtasks"); code != ExitUsage {
		t.Fatalf("reopen --subtasks: exit %d", code)
	}

	// edit --project --subtasks moves the subtree after the task.
	out = h.mustRun("edit", "trip", "--project", "Work", "--subtasks")
	if !strings.Contains(out, "moved  cmpr0001") || !strings.Contains(out, "moved  visa0001") {
		t.Fatalf("edit --subtasks = %q", out)
	}
	for _, id := range []string{"trip0001", "hotl0001", "cmpr0001", "flig0001", "visa0001"} {
		if h.task(id)["project_id"] != "work0001" {
			t.Fatalf("%s not moved: %v", id, h.task(id))
		}
	}
	// Without --subtasks a move leaves the subtasks where they are.
	h.mustRun("edit", "trip", "--project", "Travel")
	if h.task("hotl0001")["project_id"] != "work0001" {
		t.Fatal("edit --project without --subtasks moved a subtask")
	}
	// The task already there: --subtasks still brings the rest along.
	h.mustRun("edit", "trip", "--project", "Travel", "--subtasks")
	if h.task("hotl0001")["project_id"] != "trav0001" {
		t.Fatal("edit --subtasks on an unchanged task did not move the subtasks")
	}

	// rm --subtasks deletes the whole subtree, the parent last.
	out = h.mustRun("rm", "trip", "--subtasks", "--yes")
	if !strings.HasSuffix(strings.TrimSpace(out), "trip0001  Plan trip") {
		t.Fatalf("rm order = %q", out)
	}
	for _, id := range []string{"trip0001", "hotl0001", "cmpr0001", "flig0001", "visa0001"} {
		if srv := h.task(id); srv != nil && srv["deleted_at"] == nil {
			t.Fatalf("%s not deleted", id)
		}
	}
	if srv := h.task("pack0001"); srv == nil || srv["deleted_at"] != nil {
		t.Fatal("rm --subtasks deleted a task outside the subtree")
	}
}

func TestSubtaskListNesting(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.seedTrip()

	out := h.mustRun("list", "--project", "Travel")
	lines := strings.Split(strings.TrimSpace(out), "\n")
	col := strings.Index(lines[0], "TITLE")
	var titles []string
	for _, line := range lines[1:] {
		titles = append(titles, strings.TrimRight(line[col:], " "))
	}
	got := strings.Join(titles, "|")
	want := "Plan trip 1/3|  Book hotel 0/1|    Compare prices|  Flights|Pack"
	if got != want {
		t.Fatalf("nested list\n got %q\nwant %q\n%s", got, want, out)
	}
	// A subtask whose parent isn't listed is printed at the top level.
	h.mustRun("done", "hotl")
	out = h.mustRun("list", "--project", "Travel")
	if !strings.Contains(out, "Travel   Compare prices") {
		t.Fatalf("orphan not at top level:\n%s", out)
	}
	// Other views stay flat; --json keeps its order (position).
	if out := h.mustRun("list"); strings.Contains(out, "  Flights") && strings.Contains(out, "1/") {
		t.Fatalf("default list nested:\n%s", out)
	}
	out = h.mustRun("list", "--project", "Travel", "--json")
	if got := strings.Join(idsOf(t, out), ","); got != "trip0001,cmpr0001,flig0001,pack0001" {
		t.Fatalf("--json order = %s", got)
	}
}

func TestSubtaskListParent(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.seedTrip()

	if got := strings.Join(idsOf(t, h.mustRun("list", "--parent", "trip", "--json")), ","); got != "hotl0001,flig0001" {
		t.Fatalf("--parent = %s", got)
	}
	if got := strings.Join(idsOf(t, h.mustRun("list", "--parent", "trip", "--all", "--json")), ","); got != "hotl0001,flig0001,visa0001" {
		t.Fatalf("--parent --all = %s", got)
	}
	if code, _, _ := h.run("list", "--parent", "nope"); code != ExitUsage {
		t.Fatalf("unknown parent: exit %d", code)
	}
}

func TestSubtaskShow(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.seedTrip()

	out := h.mustRun("task", "show", "trip")
	for _, want := range []string{"Subtasks:  1/3", "[ ] hotl0001  Book hotel", "[x] visa0001  Visa"} {
		if !strings.Contains(out, want) {
			t.Fatalf("show trip missing %q:\n%s", want, out)
		}
	}
	if out := h.mustRun("task", "show", "cmpr"); !strings.Contains(out, "Parent:    Plan trip › Book hotel") {
		t.Fatalf("show cmpr:\n%s", out)
	}
	var detail struct {
		Task     task   `json:"task"`
		Subtasks []task `json:"subtasks"`
	}
	if err := json.Unmarshal([]byte(h.mustRun("task", "show", "trip", "--json")), &detail); err != nil {
		t.Fatal(err)
	}
	if detail.Task.ID != "trip0001" || len(detail.Subtasks) != 3 || detail.Subtasks[0].ID != "hotl0001" {
		t.Fatalf("show --json = %+v", detail)
	}
	var leaf map[string]json.RawMessage
	_ = json.Unmarshal([]byte(h.mustRun("task", "show", "cmpr", "--json")), &leaf)
	if string(leaf["subtasks"]) != "[]" {
		t.Fatalf("leaf subtasks = %s", leaf["subtasks"])
	}
}

func TestSubtaskParentCompletion(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.seedTrip()
	if _, got, _ := h.completeLine("add", "x", "--parent", "hot"); strings.Join(got, "|") != "hotl0001" {
		t.Fatalf("--parent completion = %q", got)
	}
}
