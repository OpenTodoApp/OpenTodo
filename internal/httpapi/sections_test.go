package httpapi

import (
	"testing"
)

// Sections API (OpenSpec change `board-view`).

func TestSectionsCrud(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Work"})
	e.mustStatus(resp, 201, out)
	pid := out["id"].(string)

	resp, out = e.do("POST", "/api/v1/sections", map[string]any{"name": "Doing", "project_id": pid})
	e.mustStatus(resp, 201, out)
	sid := out["id"].(string)
	if out["name"] != "Doing" || out["project_id"] != pid || out["position"] == nil || out["created_at"] == nil {
		t.Fatalf("created section = %v", out)
	}
	resp, out = e.do("POST", "/api/v1/sections", map[string]any{"name": "Backlog", "project_id": pid, "position": 0})
	e.mustStatus(resp, 201, out)
	backlog := out["id"].(string)

	// List is ordered by position.
	resp, out = e.do("GET", "/api/v1/sections", nil)
	e.mustStatus(resp, 200, out)
	list := out["sections"].([]any)
	if len(list) != 2 || list[0].(map[string]any)["id"] != backlog {
		t.Fatalf("list = %v", list)
	}
	resp, out = e.do("GET", "/api/v1/sections/"+sid, nil)
	e.mustStatus(resp, 200, out)

	// Rename; empty names, unknown fields and project changes are refused.
	resp, out = e.do("PATCH", "/api/v1/sections/"+sid, map[string]any{"name": "In progress"})
	e.mustStatus(resp, 200, out)
	if out["name"] != "In progress" {
		t.Fatalf("rename = %v", out)
	}
	resp, out = e.do("PATCH", "/api/v1/sections/"+sid, map[string]any{"name": "  "})
	e.mustStatus(resp, 400, out)
	resp, out = e.do("PATCH", "/api/v1/sections/"+sid, map[string]any{"color": "#fff"})
	e.mustStatus(resp, 400, out)
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Other"})
	e.mustStatus(resp, 201, out)
	other := out["id"].(string)
	resp, out = e.do("PATCH", "/api/v1/sections/"+sid, map[string]any{"project_id": other})
	e.mustStatus(resp, 400, out)
	if errCode(out) != "invalid_input" {
		t.Fatalf("project change = %v", out)
	}

	// A task in the section; deleting the section moves its open task to no section.
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Write", "project_id": pid, "section_id": sid})
	e.mustStatus(resp, 201, out)
	tid := out["id"].(string)
	if out["section_id"] != sid {
		t.Fatalf("task = %v", out)
	}
	resp, out = e.do("DELETE", "/api/v1/sections/"+sid, nil)
	e.mustStatus(resp, 204, out)
	resp, out = e.do("GET", "/api/v1/sections/"+sid, nil)
	e.mustStatus(resp, 404, out)
	resp, out = e.do("GET", "/api/v1/sections", nil)
	e.mustStatus(resp, 200, out)
	if n := len(out["sections"].([]any)); n != 1 {
		t.Fatalf("deleted section still listed (%d)", n)
	}
	resp, out = e.do("GET", "/api/v1/tasks/"+tid, nil)
	e.mustStatus(resp, 200, out)
	if out["section_id"] != nil {
		t.Fatalf("task keeps deleted section: %v", out["section_id"])
	}
	resp, out = e.do("GET", "/api/v1/sections?include_deleted=true", nil)
	e.mustStatus(resp, 200, out)
	if n := len(out["sections"].([]any)); n != 2 {
		t.Fatalf("include_deleted lists %d", n)
	}
}

func TestSectionCreateRejectsMissingProject(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Gone"})
	e.mustStatus(resp, 201, out)
	gone := out["id"].(string)
	resp, out = e.do("DELETE", "/api/v1/projects/"+gone, nil)
	e.mustStatus(resp, 204, out)
	for _, body := range []map[string]any{
		{"name": "Doing"},
		{"name": "Doing", "project_id": "nope"},
		{"name": "Doing", "project_id": gone},
		{"name": "", "project_id": gone},
	} {
		resp, out = e.do("POST", "/api/v1/sections", body)
		e.mustStatus(resp, 400, out)
		if errCode(out) != "invalid_input" {
			t.Fatalf("%v: %v", body, out)
		}
	}
	resp, out = e.do("GET", "/api/v1/sections?include_deleted=true", nil)
	e.mustStatus(resp, 200, out)
	if n := len(out["sections"].([]any)); n != 0 {
		t.Fatalf("a section was created: %v", out)
	}
}

// Section colour and icon (OpenSpec change icons-and-section-style, "Sections API").
func TestSectionStyle(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Work"})
	e.mustStatus(resp, 201, out)
	pid := out["id"].(string)

	// A new section carries both fields, null.
	resp, out = e.do("POST", "/api/v1/sections", map[string]any{"name": "Doing", "project_id": pid})
	e.mustStatus(resp, 201, out)
	sid := out["id"].(string)
	if v, has := out["color"]; !has || v != nil {
		t.Fatalf("new section color = %v (present %v)", v, has)
	}
	if v, has := out["icon"]; !has || v != nil {
		t.Fatalf("new section icon = %v (present %v)", v, has)
	}

	// Style it; list and get return the values.
	resp, out = e.do("PATCH", "/api/v1/sections/"+sid, map[string]any{"color": "#3b82f6", "icon": "hourglass"})
	e.mustStatus(resp, 200, out)
	if out["color"] != "#3b82f6" || out["icon"] != "hourglass" {
		t.Fatalf("styled section = %v", out)
	}
	resp, out = e.do("GET", "/api/v1/sections", nil)
	e.mustStatus(resp, 200, out)
	if s := out["sections"].([]any)[0].(map[string]any); s["color"] != "#3b82f6" || s["icon"] != "hourglass" {
		t.Fatalf("listed section = %v", s)
	}

	// Unknown icon and malformed colour are refused, naming the field, and nothing is written.
	for _, body := range []map[string]any{{"icon": "not-an-icon"}, {"color": "blue"}, {"color": "#3b82f"}, {"icon": 7}} {
		resp, out = e.do("PATCH", "/api/v1/sections/"+sid, body)
		e.mustStatus(resp, 400, out)
		if errCode(out) != "invalid_input" {
			t.Fatalf("%v: %v", body, out)
		}
	}
	resp, out = e.do("POST", "/api/v1/sections", map[string]any{"name": "Later", "project_id": pid, "icon": "nope"})
	e.mustStatus(resp, 400, out)
	resp, out = e.do("GET", "/api/v1/sections/"+sid, nil)
	e.mustStatus(resp, 200, out)
	if out["color"] != "#3b82f6" || out["icon"] != "hourglass" {
		t.Fatalf("a refused patch changed the section: %v", out)
	}

	// Null clears either.
	resp, out = e.do("PATCH", "/api/v1/sections/"+sid, map[string]any{"color": nil, "icon": nil})
	e.mustStatus(resp, 200, out)
	if out["color"] != nil || out["icon"] != nil {
		t.Fatalf("cleared section = %v", out)
	}
}

func TestSectionsRequireAuth(t *testing.T) {
	e := ownerEnv(t)
	anon := newClientFor(e)
	for _, rt := range [][2]string{{"GET", "/api/v1/sections"}, {"POST", "/api/v1/sections"}, {"GET", "/api/v1/sections/x"},
		{"PATCH", "/api/v1/sections/x"}, {"DELETE", "/api/v1/sections/x"}} {
		resp, out := anon.do(rt[0], rt[1], map[string]any{"name": "Doing", "project_id": "p"})
		anon.mustStatus(resp, 401, out)
		if errCode(out) != "unauthorized" {
			t.Fatalf("%v: %v", rt, out)
		}
	}
}

func TestTaskSectionMustMatchProject(t *testing.T) {
	e := ownerEnv(t)
	mk := func(path string, body map[string]any) string {
		t.Helper()
		resp, out := e.do("POST", path, body)
		e.mustStatus(resp, 201, out)
		return out["id"].(string)
	}
	a := mk("/api/v1/projects", map[string]any{"name": "A"})
	b := mk("/api/v1/projects", map[string]any{"name": "B"})
	sa := mk("/api/v1/sections", map[string]any{"name": "Doing", "project_id": a})
	sb := mk("/api/v1/sections", map[string]any{"name": "Doing", "project_id": b})

	// Create: a section of another project, an Inbox task with a section, an unknown section.
	for _, body := range []map[string]any{
		{"title": "x", "project_id": a, "section_id": sb},
		{"title": "x", "section_id": sa},
		{"title": "x", "project_id": a, "section_id": "missing"},
	} {
		resp, out := e.do("POST", "/api/v1/tasks", body)
		e.mustStatus(resp, 400, out)
		if errCode(out) != "invalid_input" {
			t.Fatalf("%v: %v", body, out)
		}
	}
	tid := mk("/api/v1/tasks", map[string]any{"title": "Ship", "project_id": a, "section_id": sa})
	resp, out := e.do("PATCH", "/api/v1/tasks/"+tid, map[string]any{"section_id": sb})
	e.mustStatus(resp, 400, out)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+tid, map[string]any{"section_id": nil})
	e.mustStatus(resp, 200, out)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+tid, map[string]any{"section_id": sa})
	e.mustStatus(resp, 200, out)
	// Moving to another project clears the section, or takes one of the new project.
	resp, out = e.do("PATCH", "/api/v1/tasks/"+tid, map[string]any{"project_id": b})
	e.mustStatus(resp, 200, out)
	if out["section_id"] != nil {
		t.Fatalf("project change kept section %v", out["section_id"])
	}
	resp, out = e.do("PATCH", "/api/v1/tasks/"+tid, map[string]any{"project_id": a, "section_id": sa})
	e.mustStatus(resp, 200, out)
	if out["section_id"] != sa || out["project_id"] != a {
		t.Fatalf("move with section = %v", out)
	}
	// A deleted section is refused.
	resp, out = e.do("DELETE", "/api/v1/sections/"+sb, nil)
	e.mustStatus(resp, 204, out)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+tid, map[string]any{"project_id": b, "section_id": sb})
	e.mustStatus(resp, 400, out)
}

func TestExportIncludesSections(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Work"})
	e.mustStatus(resp, 201, out)
	pid := out["id"].(string)
	var sids []string
	for _, n := range []string{"Backlog", "Doing"} {
		resp, out = e.do("POST", "/api/v1/sections", map[string]any{"name": n, "project_id": pid})
		e.mustStatus(resp, 201, out)
		sids = append(sids, out["id"].(string))
	}
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "x", "project_id": pid, "section_id": sids[0]})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("DELETE", "/api/v1/sections/"+sids[1], nil)
	e.mustStatus(resp, 204, out)

	resp, out = e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, 200, out)
	if out["format"] != "opentodo-export" || out["version"] != float64(1) {
		t.Fatalf("export header = %v %v", out["format"], out["version"])
	}
	sections, _ := out["sections"].([]any)
	if len(sections) != 2 {
		t.Fatalf("export sections = %v", out["sections"])
	}
	deleted := 0
	for _, s := range sections {
		if s.(map[string]any)["deleted_at"] != nil {
			deleted++
		}
	}
	if deleted != 1 {
		t.Fatalf("deleted sections in export = %d", deleted)
	}
	task := out["tasks"].([]any)[0].(map[string]any)
	if task["section_id"] != sids[0] {
		t.Fatalf("export task section = %v", task["section_id"])
	}
}

func TestSharedProjectSectionsFollowRoles(t *testing.T) {
	se := newShareEnv(t)
	resp, out := se.alice.do("POST", "/api/v1/sections", map[string]any{"name": "Backlog", "project_id": se.project})
	se.alice.mustStatus(resp, 201, out)
	sid := out["id"].(string)
	se.share(se.alice, "bob@example.com", "editor")
	se.share(se.alice, "carol@example.com", "viewer")

	// The editor sees the section created before sharing and may add one.
	resp, out = se.bob.do("GET", "/api/v1/sections/"+sid, nil)
	se.bob.mustStatus(resp, 200, out)
	resp, out = se.bob.do("POST", "/api/v1/sections", map[string]any{"name": "Doing", "project_id": se.project})
	se.bob.mustStatus(resp, 201, out)
	resp, out = se.bob.do("PATCH", "/api/v1/tasks/"+se.task, map[string]any{"section_id": out["id"]})
	se.bob.mustStatus(resp, 200, out)
	// The viewer reads but cannot write.
	resp, out = se.carol.do("GET", "/api/v1/sections", nil)
	se.carol.mustStatus(resp, 200, out)
	if n := len(out["sections"].([]any)); n != 2 {
		t.Fatalf("viewer lists %d sections", n)
	}
	resp, out = se.carol.do("PATCH", "/api/v1/sections/"+sid, map[string]any{"name": "Mine"})
	se.carol.mustStatus(resp, 403, out)
	resp, out = se.carol.do("POST", "/api/v1/sections", map[string]any{"name": "Nope", "project_id": se.project})
	se.carol.mustStatus(resp, 403, out)
}
