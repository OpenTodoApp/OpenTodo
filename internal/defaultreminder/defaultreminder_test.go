package defaultreminder

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

type vchange struct {
	ID    string                     `json:"id"`
	Patch map[string]json.RawMessage `json:"patch"`
}

type vcase struct {
	Name      string                       `json:"name"`
	Before    map[string]json.RawMessage   `json:"before"`
	Patch     map[string]json.RawMessage   `json:"patch"`
	Reminders []map[string]json.RawMessage `json:"reminders"`
	Batch     []vchange                    `json:"batch"`
	Prefs     map[string]json.RawMessage   `json:"prefs"`
	Expect    []vchange                    `json:"expect"`
}

type vectors struct {
	UserID    string   `json:"user_id"`
	TaskID    string   `json:"task_id"`
	DefaultID string   `json:"default_id"`
	Now       int64    `json:"now"`
	Parse     [][2]any `json:"parse"`
	Cases     []vcase  `json:"cases"`
}

func load(t *testing.T) vectors {
	t.Helper()
	raw, err := os.ReadFile("../../web/src/lib/defaultReminder.vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var v vectors
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	return v
}

// normal decodes every value so 30 and 30.0 compare equal.
func normal(t *testing.T, m map[string]json.RawMessage) map[string]any {
	out := map[string]any{}
	for k, v := range m {
		var x any
		if err := json.Unmarshal(v, &x); err != nil {
			t.Fatalf("%s: %v", k, err)
		}
		out[k] = x
	}
	return out
}

func TestVectors(t *testing.T) {
	v := load(t)
	if got := ID(v.UserID, v.TaskID); got != v.DefaultID {
		t.Fatalf("ID = %s, want %s", got, v.DefaultID)
	}
	if MaxOffset != opsync.MaxReminderOffset {
		t.Fatalf("MaxOffset %d differs from the schema's %d", MaxOffset, opsync.MaxReminderOffset)
	}
	for _, p := range v.Parse {
		got := ParseOffset(p[0].(string))
		switch want := p[1].(type) {
		case nil:
			if got != nil {
				t.Errorf("ParseOffset(%q) = %d, want none", p[0], *got)
			}
		case float64:
			if got == nil || float64(*got) != want {
				t.Errorf("ParseOffset(%q) = %v, want %v", p[0], got, want)
			}
		}
	}
	id := func(s string) string {
		if s == "$default" {
			return v.DefaultID
		}
		return s
	}
	for _, c := range v.Cases {
		t.Run(c.Name, func(t *testing.T) {
			rems := make([]map[string]json.RawMessage, 0, len(c.Reminders))
			for _, r := range c.Reminders {
				cp := map[string]json.RawMessage{}
				for k, val := range r {
					cp[k] = val
				}
				cp["id"], _ = json.Marshal(id(str(r["id"])))
				rems = append(rems, cp)
			}
			var batch []Change
			for _, b := range c.Batch {
				batch = append(batch, Change{ID: id(b.ID), Patch: b.Patch})
			}
			got := Plan(Input{UserID: v.UserID, TaskID: v.TaskID, Before: c.Before, Patch: c.Patch, Reminders: rems, Batch: batch, Prefs: ReadPrefs(c.Prefs), Loc: time.UTC, Now: v.Now})
			if len(got) != len(c.Expect) {
				t.Fatalf("got %d changes %v, want %d", len(got), got, len(c.Expect))
			}
			for i, want := range c.Expect {
				if got[i].ID != id(want.ID) {
					t.Errorf("id %s, want %s", got[i].ID, id(want.ID))
				}
				if g, w := normal(t, got[i].Patch), normal(t, want.Patch); !reflect.DeepEqual(g, w) {
					t.Errorf("patch\n got %v\nwant %v", g, w)
				}
			}
		})
	}
}

// TestWritersThatNeverApplyIt (design D6): CalDAV, calendar sync, issue import,
// the importer, the Markdown vault, automation rules, calendar feeds and email
// capture write what their source says, so none of them reaches the rule.
func TestWritersThatNeverApplyIt(t *testing.T) {
	for _, dir := range []string{"../httpapi/davroutes", "../calsync", "../issues", "../importer", "../vault", "../rules", "../calfeed", "../email"} {
		files, err := filepath.Glob(filepath.Join(dir, "*.go"))
		if err != nil || len(files) == 0 {
			t.Fatalf("%s: %v", dir, err)
		}
		for _, f := range files {
			if strings.HasSuffix(f, "_test.go") {
				continue
			}
			src, err := os.ReadFile(f)
			if err != nil {
				t.Fatal(err)
			}
			for _, name := range []string{"defaultreminder", "defaultReminderOps", "agentReminderOps"} {
				if strings.Contains(string(src), name) {
					t.Errorf("%s uses %s", f, name)
				}
			}
		}
	}
}
