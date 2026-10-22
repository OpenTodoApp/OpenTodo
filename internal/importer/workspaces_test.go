package importer

import (
	"context"
	"testing"

	opsync "github.com/pixari/opentodo/internal/sync"
)

// Workspaces restored from an own export (OpenSpec change workspaces, task 3.5).
func TestImportRestoresWorkspaces(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	name := "Family"
	fam, err := h.sync.CreateWorkspace(ctx, "u1", opsync.WorkspaceInput{Name: &name})
	if err != nil {
		t.Fatal(err)
	}
	doc := `{"format":"opentodo-export","version":1,
	  "workspaces":[{"id":"x-default","name":"Personal","default":true,"role":"owner"},
	    {"id":"x-family","name":"family","role":"owner","members":[{"userId":"bob","role":"member"}],"groups":[{"id":"g","name":"Adults","members":["bob"]}]},
	    {"id":"x-work","name":"Work","role":"owner"}],
	  "projects":[{"id":"p1","name":"Garden","workspace_id":"x-family"},{"id":"p2","name":"Site","workspace_id":"x-work"},{"id":"p3","name":"Home","workspace_id":null}],
	  "labels":[{"id":"l1","name":"deploy","workspace_id":"x-work"}],
	  "tasks":[{"id":"t1","title":"Inbox at work","workspace_id":"x-work"},{"id":"t2","title":"Gone","workspace_id":"x-unknown"}]}`

	if _, err := h.svc.Preview(ctx, "u1", []byte(doc), Options{}); err != nil {
		t.Fatal(err)
	}
	if n := h.count(`SELECT COUNT(*) FROM workspaces WHERE owner_id = 'u1'`); n != 2 {
		t.Fatalf("a preview created workspaces: %d", n)
	}
	h.run(doc, Options{})
	list, err := h.sync.Workspaces(ctx, "u1")
	if err != nil {
		t.Fatal(err)
	}
	work := ""
	for _, w := range list {
		if w.Name == "Work" {
			work = w.ID
		}
	}
	if len(list) != 3 || work == "" {
		t.Fatalf("workspaces = %+v", list)
	}
	ws := func(entity, id string) string {
		for _, e := range h.list(entity, true) {
			if string(e["id"]) == `"`+id+`"` {
				return string(e["workspace_id"])
			}
		}
		return "<missing>"
	}
	for _, c := range [][3]string{
		{"project", "p1", `"` + fam.ID + `"`}, {"project", "p2", `"` + work + `"`}, {"project", "p3", "null"},
		{"label", "l1", `"` + work + `"`}, {"task", "t1", `"` + work + `"`}, {"task", "t2", "null"},
	} {
		if got := ws(c[0], c[1]); got != c[2] {
			t.Errorf("%s %s workspace_id = %s, want %s", c[0], c[1], got, c[2])
		}
	}
	if n := h.count(`SELECT COUNT(*) FROM groups`) + h.count(`SELECT COUNT(*) FROM workspace_members WHERE user_id != 'u1'`); n != 0 {
		t.Fatalf("members or groups imported: %d", n)
	}
}

func TestImportWorkspaceOverTheLimit(t *testing.T) {
	h := newHarness(t)
	h.sync.SetWorkspaceLimits(opsync.WorkspaceLimits{Workspaces: 1})
	doc := `{"format":"opentodo-export","version":1,"workspaces":[{"id":"x-work","name":"Work","role":"owner"}],
	  "projects":[{"id":"p1","name":"Site","workspace_id":"x-work"}]}`
	job := h.run(doc, Options{})
	if job.Status != StatusDone {
		t.Fatalf("job status %s", job.Status)
	}
	for _, e := range h.list("project", true) {
		if string(e["workspace_id"]) != "null" {
			t.Fatalf("project landed in %s", e["workspace_id"])
		}
	}
}
