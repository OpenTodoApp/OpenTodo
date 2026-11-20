package origin

import (
	"encoding/json"
	"os"
	"testing"
)

type appLinkVectors struct {
	Links []struct {
		URL    string  `json:"url"`
		Scheme *string `json:"scheme"`
	} `json:"links"`
	Entries []struct {
		Entry string `json:"entry"`
		OK    bool   `json:"ok"`
	} `json:"entries"`
	Allows []struct {
		List []string `json:"list"`
		URL  string   `json:"url"`
		OK   bool     `json:"ok"`
	} `json:"allows"`
}

// TestAppLinkVectors runs the shared app link vectors (app-links D2), which
// web/src/lib/appLinks.test.ts and the shells run too.
func TestAppLinkVectors(t *testing.T) {
	raw, err := os.ReadFile("testdata/app_links.vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var v appLinkVectors
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	for _, c := range v.Links {
		got, ok := AppLinkScheme(c.URL)
		if c.Scheme == nil {
			if ok {
				t.Errorf("%q: scheme %q, want not an app link", c.URL, got)
			}
		} else if !ok || got != *c.Scheme {
			t.Errorf("%q: scheme %q %v, want %q", c.URL, got, ok, *c.Scheme)
		}
	}
	for _, c := range v.Entries {
		if got := ValidSchemeEntry(c.Entry); got != c.OK {
			t.Errorf("entry %q: %v, want %v", c.Entry, got, c.OK)
		}
	}
	for _, c := range v.Allows {
		if got := AllowsAppLink(c.List, c.URL); got != c.OK {
			t.Errorf("%v allows %q: %v, want %v", c.List, c.URL, got, c.OK)
		}
	}
}
