package importer

import (
	"context"
	"errors"
	"strings"
	"testing"

	opsync "github.com/pixari/opentodo/internal/sync"
)

// Import into a chosen workspace (OpenSpec change import-workspace).

func (h *harness) workspace(uid, name string) string {
	h.t.Helper()
	w, err := h.sync.CreateWorkspace(context.Background(), uid, opsync.WorkspaceInput{Name: &name})
	if err != nil {
		h.t.Fatal(err)
	}
	return w.ID
}

func wsOf(e opsync.Entity) string { return string(e["workspace_id"]) }

func TestImportIntoWorkspace(t *testing.T) {
	h := newHarness(t)
	work := h.workspace(h.uid, "Work")
	// Personal (default) already has "Errands" and an Inbox task "Call Bob".
	h.write("web", 1_000, "project", "home-errands", map[string]any{"name": "Errands", "position": 1})
	h.write("web", 1_000, "label", "home-x", map[string]any{"name": "x"})
	h.write("web", 1_000, "task", "home-bob", map[string]any{"title": "Call Bob", "priority": 4})

	csv := "title,project,labels\nBuy milk,Errands,x\nCall Bob,,\nSub,Site,\n"
	plan, err := h.svc.Preview(context.Background(), h.uid, []byte(csv), Options{Workspace: work})
	if err != nil {
		t.Fatal(err)
	}
	if plan.Totals.NewProjects != 2 || plan.Totals.NewLabels != 1 || plan.Totals.PossibleDuplicates != 0 {
		t.Fatalf("totals = %+v", plan.Totals)
	}
	job := h.run(csv, Options{Workspace: work})
	if job.Status != StatusDone || job.Options.Workspace != work {
		t.Fatalf("job = %+v", job)
	}
	want := `"` + work + `"`
	for _, p := range h.list("project", false) {
		if str(p, "id") == "home-errands" {
			if wsOf(p) != "" {
				t.Fatalf("Personal's project was touched: %s", wsOf(p))
			}
			continue
		}
		if wsOf(p) != want {
			t.Errorf("project %s workspace_id = %s", str(p, "name"), wsOf(p))
		}
	}
	for _, l := range h.list("label", false) {
		if str(l, "id") != "home-x" && wsOf(l) != want {
			t.Errorf("label %s workspace_id = %s", str(l, "name"), wsOf(l))
		}
	}
	tasks := byTitle(h.list("task", false))
	if str(tasks["Buy milk"], "project_id") == "home-errands" {
		t.Fatal("reused Personal's project by name")
	}
	if wsOf(tasks["Buy milk"]) != "" {
		t.Errorf("a task in a project got workspace_id %s", wsOf(tasks["Buy milk"]))
	}
	var bobs int
	for _, task := range h.list("task", false) {
		if str(task, "title") == "Call Bob" {
			bobs++
			if str(task, "id") != "home-bob" && wsOf(task) != want {
				t.Errorf("Inbox task workspace_id = %s", wsOf(task))
			}
		}
	}
	if bobs != 2 {
		t.Fatalf("Call Bob in Work was taken for a duplicate of Personal's: %d", bobs)
	}

	// Undo removes what went into Work and leaves Personal alone.
	undone, err := h.svc.Undo(context.Background(), h.uid, job.ID)
	if err != nil || undone.Status != StatusUndone {
		t.Fatalf("undo: %v %+v", err, undone)
	}
	for _, p := range h.list("project", false) {
		if str(p, "id") != "home-errands" {
			t.Fatalf("project left after undo: %s", str(p, "name"))
		}
	}
	if left := h.list("task", false); len(left) != 1 || str(left[0], "id") != "home-bob" {
		t.Fatalf("tasks after undo = %v", left)
	}
}

func TestImportIntoDefaultWorkspaceWritesNoField(t *testing.T) {
	h := newHarness(t)
	h.workspace(h.uid, "Work")
	list, _ := h.sync.Workspaces(context.Background(), h.uid)
	def := ""
	for _, w := range list {
		if w.Default {
			def = w.ID
		}
	}
	h.run("title,project\nA,P\nB,\n", Options{Workspace: def})
	for _, kind := range []string{"project", "task"} {
		for _, e := range h.list(kind, false) {
			if _, has := e["workspace_id"]; has && wsOf(e) != "null" {
				t.Fatalf("%s carries workspace_id %s", kind, wsOf(e))
			}
		}
	}
}

func TestImportWorkspaceRefused(t *testing.T) {
	h := newHarness(t)
	h.addUser("u2")
	theirs := h.workspace("u2", "Theirs")
	work := h.workspace(h.uid, "Work")
	h.write("web", 1_000, "project", "home", map[string]any{"name": "Home", "position": 1})
	var msgs []string
	for _, opts := range []Options{{Workspace: "no-such-id"}, {Workspace: theirs}} {
		_, err := h.svc.Preview(context.Background(), h.uid, []byte("title\nA\n"), opts)
		var oe *OptionError
		if !errors.As(err, &oe) || !strings.HasPrefix(oe.Error(), "workspace:") {
			t.Fatalf("%v: err = %v", opts, err)
		}
		msgs = append(msgs, oe.Error())
	}
	if msgs[0] != msgs[1] {
		t.Fatalf("messages reveal the workspace: %q vs %q", msgs[0], msgs[1])
	}
	_, err := h.svc.Start(context.Background(), h.uid, []byte("title\nA\n"), Options{Workspace: work, TargetProject: "home"})
	var oe *OptionError
	if !errors.As(err, &oe) || !strings.HasPrefix(oe.Error(), "targetProject:") {
		t.Fatalf("target project in another workspace: %v", err)
	}
	if n := h.count(`SELECT COUNT(*) FROM import_jobs`); n != 0 {
		t.Fatalf("a refused import created %d jobs", n)
	}
}

func TestOwnExportIntoOneWorkspace(t *testing.T) {
	h := newHarness(t)
	work := h.workspace(h.uid, "Work")
	doc := `{"format":"opentodo-export","version":1,
	  "workspaces":[{"id":"x-default","name":"Personal","default":true,"role":"owner"},{"id":"x-family","name":"Family","role":"owner"}],
	  "projects":[{"id":"p1","name":"Garden","workspace_id":"x-family"},{"id":"p2","name":"Home","workspace_id":null}],
	  "labels":[{"id":"l1","name":"errand","workspace_id":"x-family"}],
	  "tasks":[{"id":"t1","title":"Inbox task"},{"id":"t2","title":"In Garden","project_id":"p1"}]}`
	plan, err := h.svc.Preview(context.Background(), h.uid, []byte(doc), Options{Workspace: work})
	if err != nil {
		t.Fatal(err)
	}
	if !hasPrefix(plan.Notes, "Everything goes into Work") {
		t.Fatalf("notes = %v", plan.Notes)
	}
	h.run(doc, Options{Workspace: work})
	if n := h.count(`SELECT COUNT(*) FROM workspaces WHERE owner_id = ?`, h.uid); n != 2 {
		t.Fatalf("the export's workspaces were created: %d", n)
	}
	want := `"` + work + `"`
	for _, c := range [][2]string{{"project", "p1"}, {"project", "p2"}, {"label", "l1"}, {"task", "t1"}} {
		for _, e := range h.list(c[0], false) {
			if str(e, "id") == c[1] && wsOf(e) != want {
				t.Errorf("%s %s workspace_id = %s", c[0], c[1], wsOf(e))
			}
		}
	}
}
