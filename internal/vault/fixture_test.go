package vault

import (
	"encoding/json"
	"os"
	"reflect"
	"regexp"
	"strings"
	"testing"
	"time"
)

// loadFixture reads testdata/vault/expected.json: the entities the fixture
// vault's files hold, as entity → id → field → value.
func loadFixture(t *testing.T) Store {
	t.Helper()
	raw, err := os.ReadFile("testdata/vault/expected.json")
	if err != nil {
		t.Fatal(err)
	}
	var in map[string]map[string]map[string]json.RawMessage
	if err := json.Unmarshal(raw, &in); err != nil {
		t.Fatal(err)
	}
	s := Store{}
	for entity, byID := range in {
		for id, fields := range byID {
			for f, v := range fields {
				s.Apply(Op{Entity: entity, EntityID: id, Field: f, Value: v, TS: 1, Device: "fixture"})
			}
		}
	}
	return s
}

func fixtureSections(v *view, pid string) func(string) bool {
	names := map[string]bool{}
	for _, s := range v.sectionsOf(pid) {
		names[strings.ToLower(v.text("section", s, "name"))] = true
	}
	return func(n string) bool { return names[strings.ToLower(n)] }
}

// TestFixtureVault pins the parser and the printer (spec "Vault guide and
// shared vectors"): every fixture file parses to the recorded entities and the
// entities print back the file byte for byte.
func TestFixtureVault(t *testing.T) {
	s := loadFixture(t)
	v := newView(s, nil, time.UTC, nil)
	layout := v.Layout()
	byPath := map[string]string{}
	for pid, p := range layout {
		byPath[p] = pid
	}
	disk, err := scanFiles("testdata/vault")
	if err != nil {
		t.Fatal(err)
	}
	if len(disk) != len(layout) {
		t.Fatalf("fixture files %d, layout %v", len(disk), layout)
	}
	labels := v.labelSlugs()
	seen := 0
	for p, b := range disk {
		pid, ok := byPath[p]
		if !ok {
			t.Errorf("%s is not where the layout puts a project (%v)", p, layout)
			continue
		}
		doc := ParseDoc(string(b), fixtureSections(v, pid))
		if doc.ID != pid {
			t.Errorf("%s: opentodo-id %q, want %q", p, doc.ID, pid)
		}
		extra := map[string]string{}
		doc.Walk(func(blk *Block, parent *Node, n *Node) {
			seen++
			id := n.Line.ID
			extra[id] = n.Line.Trailing
			want := v.line(id, labels, n.Line.Trailing)
			got := n.Line
			got.Indent, got.Has, want.Has, got.Created = "", nil, nil, ""
			if len(got.ReadOnly) == 0 && len(want.ReadOnly) == 0 {
				got.ReadOnly, want.ReadOnly = nil, nil
			}
			if !reflect.DeepEqual(got, want) {
				t.Errorf("%s %s:\n file %+v\n want %+v", p, id, got, want)
			}
			r := s.Get("task", id)
			wantParent := ""
			if parent != nil {
				wantParent = parent.Line.ID
			}
			if r.Str("parent_id") != wantParent {
				t.Errorf("%s %s: parent %q, file nests it under %q", p, id, r.Str("parent_id"), wantParent)
			}
			if parent == nil && blk.Heading != r.Set("section_id") || blk.Heading && v.text("section", r.Str("section_id"), "name") != blk.Section {
				t.Errorf("%s %s: section %q, file heading %q", p, id, r.Str("section_id"), blk.Section)
			}
			if n.NoteText() != r.Str("description") {
				t.Errorf("%s %s: note %q, want %q", p, id, n.NoteText(), r.Str("description"))
			}
		})
		out := v.render(renderInput{project: pid, tmpl: doc, printed: func(string) bool { return true }, extra: extra, labels: labels}).Print()
		if out != string(b) {
			t.Errorf("%s does not print back:\n%s\n--- want ---\n%s", p, out, b)
		}
		// Two prints of the same entities are byte-equal.
		if again := v.render(renderInput{project: pid, tmpl: ParseDoc(out, fixtureSections(v, pid)), printed: func(string) bool { return true }, extra: extra, labels: labels}).Print(); again != out {
			t.Errorf("%s: second print differs", p)
		}
	}
	if seen != len(s["task"]) {
		t.Errorf("the files hold %d tasks, the fixture %d", seen, len(s["task"]))
	}
}

// TestGuideExampleIsAFixture: the example file in docs/vault.md is
// testdata/vault/Home.md.
func TestGuideExampleIsAFixture(t *testing.T) {
	guide, err := os.ReadFile("../../docs/vault.md")
	if err != nil {
		t.Fatal(err)
	}
	m := regexp.MustCompile("(?s)<!-- fixture: (\\S+) -->\n```markdown\n(.*?)```\n").FindAllStringSubmatch(string(guide), -1)
	if len(m) == 0 {
		t.Fatal("docs/vault.md has no fixture example")
	}
	for _, x := range m {
		want, err := os.ReadFile("testdata/vault/" + x[1])
		if err != nil {
			t.Fatal(err)
		}
		if x[2] != string(want) {
			t.Errorf("the guide's %s differs from the fixture:\n%s", x[1], x[2])
		}
	}
}

// TestRecurrencePhrasing covers "Completion and recurrence in files".
func TestRecurrencePhrasing(t *testing.T) {
	if got := ruleToFile("every 3 days after completion"); got != "every 3 days when done" {
		t.Errorf("to file: %q", got)
	}
	for _, in := range []string{"every 3 days when done", "every 3 days after completion"} {
		if got, err := ruleFromFile(in); err != nil || got != "every 3 days after completion" {
			t.Errorf("%q read as %q, %v", in, got, err)
		}
	}
	if _, err := ruleFromFile("every blursday"); err == nil {
		t.Error("a rule that does not parse was accepted")
	}
	for in, want := range map[string]int{"45m": 45, "1h30m": 90, "2h": 120, "1h 30m": 90} {
		if got, ok := parseMinutes(in); !ok || got != want {
			t.Errorf("duration %q = %d %v", in, got, ok)
		}
	}
	for _, bad := range []string{"0m", "8d", "soon"} {
		if _, ok := parseMinutes(bad); ok {
			t.Errorf("duration %q accepted", bad)
		}
	}
}
