package main

import (
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"

	"github.com/pixari/opentodo/internal/importer"
)

// shape replaces every string with a marker, so two documents compare equal when
// only their text differs.
func shape(v any) any {
	switch t := v.(type) {
	case map[string]any:
		m := map[string]any{}
		for k, x := range t {
			m[k] = shape(x)
		}
		return m
	case []any:
		out := make([]any, len(t))
		for i, x := range t {
			out[i] = shape(x)
		}
		return out
	case string:
		return "s"
	}
	return v
}

func decode(t *testing.T, b []byte) any {
	t.Helper()
	var v any
	if err := json.Unmarshal(b, &v); err != nil {
		t.Fatalf("invalid JSON: %v\n%s", err, b)
	}
	return v
}

// TestJSONShapes runs every JSON fixture of the more-importers formats through
// the sanitiser: the structure is unchanged, the importer still detects the same
// format, and none of the personal text survives.
func TestJSONShapes(t *testing.T) {
	cases := []struct {
		path, format string
		gone, kept   []string
	}{
		{"../testdata/google-tasks-json/Tasks.json", "google-tasks-json",
			[]string{"Task one", "Note one", "List two"},
			[]string{"tasks#taskLists", "My Tasks", "completed", "2026-"}},
		{"../testdata/trello-json/board.json", "trello-json",
			[]string{"Card one", "Description one", "Comment one", "Person one", "/c/AbCd1234", "Label one"},
			[]string{"commentCard", "https://trello.com/", "\"green\"", "6527f0a1c3b4d5e6f7a8b9f1"}},
		{"../testdata/microsoft-todo-json/todo.json", "microsoft-todo-json",
			[]string{"Task one", "Body one", "List two", "Link one"},
			[]string{"defaultList", "high", "W. Europe Standard Time", "https://outlook.example.com/"}},
		{"../testdata/apple-reminders-json/reminders.json", "apple-reminders-json",
			[]string{"Reminder one", "Note one", "List two", "tag-one", "page-one"},
			[]string{"\"Reminders\"", "x-apple-reminder://", "2026-11-03T17:30:00+01:00"}},
		{"../testdata/anydo-json/data.json", "anydo-json",
			[]string{"Task one", "Note one", "Category two", "tag-one", "person.one@example.test", "Person one"},
			[]string{"TASK_REPEAT_WEEK", "UNCHECKED", "\"Personal\"", "1793664000000"}},
	}
	for _, c := range cases {
		in, err := os.ReadFile(c.path)
		if err != nil {
			t.Fatal(err)
		}
		out, err := newScrubber().jsonFile(in)
		if err != nil {
			t.Fatalf("%s: %v", c.path, err)
		}
		if !reflect.DeepEqual(shape(decode(t, in)), shape(decode(t, out))) {
			t.Errorf("%s: structure changed:\n%s", c.path, out)
		}
		p, err := importer.Detect(out, "")
		if err != nil || p.Name() != c.format {
			t.Errorf("%s: sanitised file detected as %v (%v), want %s", c.path, p, err, c.format)
		}
		s := string(out)
		for _, g := range c.gone {
			if strings.Contains(s, g) {
				t.Errorf("%s: %q survived", c.path, g)
			}
		}
		for _, k := range c.kept {
			if !strings.Contains(s, k) {
				t.Errorf("%s: %q lost", c.path, k)
			}
		}
	}
}

func TestJSONKeyOrderAndReferences(t *testing.T) {
	in := `{"z":1,"labels":[{"name":"Urgent","color":"red"}],"cards":[{"name":"Fix the boiler","labels":[{"name":"Urgent"}],"tags":["Home","home"],"email":"Jane@Example.com"}]}`
	out, err := newScrubber().jsonFile([]byte(in))
	if err != nil {
		t.Fatal(err)
	}
	s := string(out)
	if strings.Index(s, `"z"`) > strings.Index(s, `"labels"`) {
		t.Fatalf("key order changed:\n%s", s)
	}
	if strings.Count(s, `"Name 1"`) != 2 {
		t.Fatalf("a repeated label name must map to one placeholder:\n%s", s)
	}
	if !strings.Contains(s, `"label1",`) || !strings.Contains(s, `"label1"`) || !strings.Contains(s, "owner@example.test") {
		t.Fatalf("tags or email not scrubbed as expected:\n%s", s)
	}
}

func TestAsanaCSV(t *testing.T) {
	in := "Task ID,Created At,Completed At,Last Modified,Name,Section/Column,Assignee,Assignee Email,Start Date,Due Date,Tags,Notes,Projects,Parent task,Blocked By (Dependencies),Blocking (Dependencies),Collaborators,Effort\n" +
		"111,2026-09-28,,2026-10-10,Order tiles,Kitchen,Jane Doe,jane@corp.example,,2026-10-24,\"Urgent,Home\",Call the shop,Renovation,,,222,\"Jane Doe, Bob Roe\",3\n" +
		"222,2026-09-28,,2026-10-11,Lay tiles,Kitchen,,,,,,,Renovation,Order tiles,\"111, Order tiles\",,,5\n"
	out, err := newScrubber().csvFile([]byte(in))
	if err != nil {
		t.Fatal(err)
	}
	s := string(out)
	for _, gone := range []string{"tiles", "Kitchen", "Jane", "Bob", "corp.example", "Urgent", "shop", "Renovation"} {
		if strings.Contains(s, gone) {
			t.Fatalf("%q survived:\n%s", gone, s)
		}
	}
	for _, kept := range []string{"111,2026-09-28", ",222,", "\"111, Task 1\"", ",3\n", ",5\n"} {
		if !strings.Contains(s, kept) {
			t.Fatalf("%q lost:\n%s", kept, s)
		}
	}
	if !strings.Contains(s, ",Task 1,") { // the parent name matches the task's own placeholder
		t.Fatalf("parent reference lost:\n%s", s)
	}
	if p, err := importer.Detect(out, ""); err != nil || p.Name() != "asana-csv" {
		t.Fatalf("sanitised Asana file detected as %v (%v)", p, err)
	}
}
