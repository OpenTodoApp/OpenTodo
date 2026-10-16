package e2ee

import "testing"

// Custom fields (OpenSpec custom-fields, design D4): definition names and
// options and every task value under `fields.<id>` are content fields; the
// client encrypts their string values only, so numbers and booleans stay plain.
func TestCustomFieldContent(t *testing.T) {
	for _, c := range []struct {
		entity, field string
		want          bool
	}{
		{"field", "name", true},
		{"field", "options", true},
		{"field", "type", false},
		{"field", "project_id", false},
		{"task", "fields.f1", true},
		{"task", "fields.", false},
		{"project", "fields.f1", false},
	} {
		if got := IsContentField(c.entity, c.field); got != c.want {
			t.Errorf("IsContentField(%s, %s) = %v, want %v", c.entity, c.field, got, c.want)
		}
	}
	all := AllContentFields()
	found := false
	for _, f := range all["task"] {
		if f == "fields." {
			found = true
		}
	}
	if !found || len(all["task"]) != len(ContentFields["task"])+1 {
		t.Fatalf("AllContentFields task = %v", all["task"])
	}
}
