package notelinks

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

type vectorFile struct {
	Cases []struct {
		Name     string `json:"name"`
		Markdown string `json:"markdown"`
		Links    []Link `json:"links"`
	} `json:"cases"`
}

// TestVectors pins the grammar shared with web/src/lib/noteLinkGrammar.ts
// (testdata/links.vectors.json, read there by web/src/lib/noteLinks.test.ts).
func TestVectors(t *testing.T) {
	raw, err := os.ReadFile("testdata/links.vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var f vectorFile
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	if len(f.Cases) == 0 {
		t.Fatal("no cases")
	}
	for _, c := range f.Cases {
		got := LinksIn(c.Markdown)
		if got == nil {
			got = []Link{}
		}
		if !reflect.DeepEqual(got, c.Links) {
			t.Errorf("%s: LinksIn(%q) = %+v, want %+v", c.Name, c.Markdown, got, c.Links)
		}
	}
}

func TestTargets(t *testing.T) {
	got := Targets("[a](?task=t) [b](?note=n) [c](?task=t)")
	want := []Link{{Kind: "task", ID: "t", Label: "a"}, {Kind: "note", ID: "n", Label: "b"}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Targets = %+v", got)
	}
}
