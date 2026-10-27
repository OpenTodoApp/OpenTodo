package httpapi

import (
	"fmt"
	"strings"
	"testing"
)

// Inherited fields (OpenSpec change inherited-custom-fields): values for an
// ancestor's field are accepted on a sub-project's task, names stay unique
// across the tree in both directions, and the limit counts inherited fields.
func TestInheritedFieldsAPI(t *testing.T) {
	e := ownerEnv(t)
	project := func(name, parent string) string {
		body := map[string]any{"name": name}
		if parent != "" {
			body["parent_id"] = parent
		}
		resp, out := e.do("POST", "/api/v1/projects", body)
		e.mustStatus(resp, 201, out)
		return out["id"].(string)
	}
	field := func(name, project string) (int, map[string]any) {
		resp, out := e.do("POST", "/api/v1/fields", map[string]any{"name": name, "type": "number", "project_id": project})
		return resp.StatusCode, out
	}
	message := func(out map[string]any) string {
		m, _ := out["error"].(map[string]any)
		s, _ := m["message"].(string)
		return s
	}
	scoring := project("Scoring", "")
	topicA := project("Topic A", scoring)
	topicB := project("Topic B", scoring)
	detail := project("Detail", topicA)
	garden := project("Garden", "")

	code, out := field("WSJF", scoring)
	if code != 201 {
		t.Fatalf("create WSJF = %d %v", code, out)
	}
	wsjf := out["id"].(string)
	if code, out = field("Size", topicB); code != 201 {
		t.Fatalf("create Size = %d %v", code, out)
	}
	_, out = field("Area", garden)
	area := out["id"].(string)

	// Scenario "Value for an inherited field via the API".
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Pick", "project_id": detail})
	e.mustStatus(resp, 201, out)
	task := out["id"].(string)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+task, map[string]any{"fields": map[string]any{wsjf: 8}})
	e.mustStatus(resp, 200, out)
	if got := out["fields"].(map[string]any)[wsjf]; got != float64(8) {
		t.Fatalf("inherited value = %v", out["fields"])
	}
	// Scenario "Value for a field of an unrelated project".
	resp, out = e.do("PATCH", "/api/v1/tasks/"+task, map[string]any{"fields": map[string]any{area: 3}})
	e.mustStatus(resp, 400, out)
	if errCode(out) != "invalid_input" || !strings.Contains(message(out), area) {
		t.Fatalf("unrelated field = %v", out)
	}

	// Names across the tree, both directions, create and rename.
	code, out = field("wsjf", detail)
	if code != 400 || !strings.Contains(message(out), `inherits a field named "WSJF" from "Scoring"`) {
		t.Fatalf("inherited name clash = %d %v", code, out)
	}
	// Scenario "Clash refused via the API".
	code, out = field("size", scoring)
	if code != 400 || errCode(out) != "invalid_input" || !strings.Contains(message(out), `sub-project "Topic B"`) {
		t.Fatalf("sub-project name clash = %d %v", code, out)
	}
	code, out = field("Notes", topicA)
	if code != 201 {
		t.Fatalf("create Notes = %d %v", code, out)
	}
	resp, out = e.do("PATCH", "/api/v1/fields/"+out["id"].(string), map[string]any{"name": "WSJF"})
	e.mustStatus(resp, 400, out)
	resp, out = e.do("PATCH", "/api/v1/fields/"+wsjf, map[string]any{"name": "notes"})
	e.mustStatus(resp, 400, out)
	if !strings.Contains(message(out), `sub-project "Topic A"`) {
		t.Fatalf("rename onto a sub-project's name = %v", out)
	}

	// The limit counts inherited fields, for every sub-project below.
	for i := 0; i < 27; i++ {
		if code, out = field(fmt.Sprintf("D%d", i), detail); code != 201 {
			t.Fatalf("detail field %d = %d %v", i, code, out)
		}
	}
	// Detail applies WSJF + Notes + 27 own = 29; one more on Scoring makes 30 there, still allowed.
	if code, out = field("Last", scoring); code != 201 {
		t.Fatalf("30th applicable field = %d %v", code, out)
	}
	code, out = field("Over", scoring)
	if code != 400 || !strings.Contains(message(out), `sub-project "Detail" would have more than 30`) {
		t.Fatalf("tree limit = %d %v", code, out)
	}
	code, out = field("Over", detail)
	if code != 400 || !strings.Contains(message(out), "inherited ones included") {
		t.Fatalf("own limit with inherited = %d %v", code, out)
	}

	// Scenario "Unauthenticated request".
	anon := newClientFor(e)
	resp, out = anon.do("PATCH", "/api/v1/tasks/"+task, map[string]any{"fields": map[string]any{wsjf: 1}})
	anon.mustStatus(resp, 401, out)
}
