package mail

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// The Inbox's name in the digest and the CalDAV Inbox list is the word the app
// uses in each shipped catalog (issue #1029).
func TestInboxNameMatchesWebCatalogs(t *testing.T) {
	for _, lang := range Languages {
		got, ok := InboxName(lang)
		if !ok {
			t.Fatalf("%s: no Inbox name", lang)
		}
		want := "Inbox" // English is the source text
		if lang != "en" {
			raw, err := os.ReadFile(filepath.Join("..", "..", "web", "src", "locales", lang+".json"))
			if err != nil {
				t.Fatal(err)
			}
			var catalog map[string]any
			if err := json.Unmarshal(raw, &catalog); err != nil {
				t.Fatal(err)
			}
			want, _ = catalog["Inbox"].(string)
		}
		if got != want {
			t.Errorf("%s: %q, the app says %q", lang, got, want)
		}
	}
	if _, ok := InboxName("ja"); ok {
		t.Fatal("a language that is not shipped has a name")
	}
}
