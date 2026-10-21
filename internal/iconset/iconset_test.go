package iconset

import (
	"encoding/json"
	"os"
	"testing"
)

// The server's list must equal the catalogue the web app ships (design-system "Icon
// catalogue": "Server list drifts from the catalogue"). Regenerate with
// scripts/icons-sync.mjs.
func TestMatchesWebCatalogue(t *testing.T) {
	b, err := os.ReadFile("../../web/src/ui/icons/catalogue.json")
	if err != nil {
		t.Fatal(err)
	}
	var web []Entry
	if err := json.Unmarshal(b, &web); err != nil {
		t.Fatal(err)
	}
	server := map[string]Entry{}
	for _, e := range Entries() {
		server[e.Name] = e
	}
	for _, e := range web {
		if _, ok := server[e.Name]; !ok {
			t.Errorf("icon %q is in catalogue.json but missing on the server: run scripts/icons-sync.mjs", e.Name)
		}
		delete(server, e.Name)
	}
	for name := range server {
		t.Errorf("icon %q is on the server but not in catalogue.json: run scripts/icons-sync.mjs", name)
	}
	if len(web) < 300 {
		t.Errorf("catalogue has %d icons, want at least 300", len(web))
	}
}

func TestValid(t *testing.T) {
	for _, name := range []string{"briefcase", "hourglass", "paw-print", "rocket"} {
		if !Valid(name) {
			t.Errorf("Valid(%q) = false", name)
		}
	}
	for _, name := range []string{"", "not-an-icon", "Briefcase", "chevron-right"} {
		if Valid(name) {
			t.Errorf("Valid(%q) = true", name)
		}
	}
}

func TestSearchOrder(t *testing.T) {
	got := Search("dog")
	if len(got) < 2 || got[0].Name != "dog" {
		t.Fatalf("Search(dog) starts with %v, want dog first", names(got))
	}
	if !contains(got, "paw-print") {
		t.Errorf("Search(dog) = %v, want paw-print by keyword", names(got))
	}
	// Name prefix before keyword match.
	got = Search("plan")
	if len(got) == 0 || got[0].Name[:4] != "plan" {
		t.Errorf("Search(plan) = %v, want a name starting with plan first", names(got))
	}
	// Category match.
	if !contains(Search("food"), "pizza") {
		t.Error("Search(food) does not list pizza through its category")
	}
	if n := len(Search("")); n != len(Entries()) {
		t.Errorf("Search(\"\") = %d icons, want all %d", n, len(Entries()))
	}
}

func names(es []Entry) []string {
	out := make([]string, len(es))
	for i, e := range es {
		out[i] = e.Name
	}
	return out
}

func contains(es []Entry, name string) bool {
	for _, e := range es {
		if e.Name == name {
			return true
		}
	}
	return false
}
