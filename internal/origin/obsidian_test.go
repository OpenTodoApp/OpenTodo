package origin

import (
	"encoding/json"
	"os"
	"testing"
)

type obsidianVector struct {
	Name    string          `json:"name"`
	Origin  json.RawMessage `json:"origin"`
	Valid   bool            `json:"valid"`
	Link    *bool           `json:"link"`
	Label   *string         `json:"label"`
	Tooltip *string         `json:"tooltip"`
}

// TestObsidianVectors runs the "obsidian" list of the shared vectors
// (obsidian-origin D2): Decode accepts exactly the valid origins, the accepted
// ones read as their label and tooltip, and ParseObsidianURL (the shells'
// check: the link alone, without the id) agrees with link.
// web/src/lib/taskOrigin.test.ts runs the same list.
func TestObsidianVectors(t *testing.T) {
	t.Parallel()
	raw, err := os.ReadFile("testdata/origin_vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Obsidian []obsidianVector `json:"obsidian"`
	}
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	if len(f.Obsidian) < 30 {
		t.Fatalf("only %d obsidian vectors", len(f.Obsidian))
	}
	for _, c := range f.Obsidian {
		o, err := Decode(c.Origin)
		if (err == nil) != c.Valid {
			t.Errorf("%s: Decode() = %v, want valid %v", c.Name, err, c.Valid)
		}
		if (CheckValue(c.Origin) == nil) != c.Valid {
			t.Errorf("%s: CheckValue disagrees with Decode", c.Name)
		}
		var plain Origin
		_ = json.Unmarshal(c.Origin, &plain)
		if c.Link != nil {
			if _, ok := ParseObsidianURL(plain.URL); ok != *c.Link {
				t.Errorf("%s: ParseObsidianURL(%q) = %v, want %v", c.Name, plain.URL, ok, *c.Link)
			}
		}
		if !c.Valid {
			continue
		}
		if c.Label != nil && o.Label() != *c.Label {
			t.Errorf("%s: Label() = %q, want %q", c.Name, o.Label(), *c.Label)
		}
		if c.Tooltip != nil && o.ObsidianTip() != *c.Tooltip {
			t.Errorf("%s: ObsidianTip() = %q, want %q", c.Name, o.ObsidianTip(), *c.Tooltip)
		}
	}
}

func TestNoteName(t *testing.T) {
	t.Parallel()
	for in, want := range map[string]string{"Inbox.md": "Inbox", "Daily/2026-10-29.md": "2026-10-29", "a/b/c.canvas": "c.canvas", "x": "x"} {
		if got := NoteName(in); got != want {
			t.Errorf("NoteName(%q) = %q, want %q", in, got, want)
		}
	}
}
