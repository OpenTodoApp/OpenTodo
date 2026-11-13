package quickadd

import (
	"os"
	"regexp"
	"slices"
	"testing"
)

// TestBundledLanguagesAreShipped: every bundled vocabulary belongs to a language
// the web app lists (web/src/locales/index.ts), so the server never parses words
// of a language no one can choose (OpenSpec change more-languages, design D6). A
// shipped language may have no vocabulary (Chinese, a community language) and
// then parses with English, as the web parser does.
func TestBundledLanguagesAreShipped(t *testing.T) {
	src, err := os.ReadFile("../../web/src/locales/index.ts")
	if err != nil {
		t.Fatal(err)
	}
	var shipped []string
	for _, m := range regexp.MustCompile(`\{ code: '([a-z]{2,3})'`).FindAllStringSubmatch(string(src), -1) {
		shipped = append(shipped, m[1])
	}
	if len(shipped) < 7 {
		t.Fatalf("read %v from index.ts", shipped)
	}
	for _, code := range Bundled {
		if !slices.Contains(shipped, code) {
			t.Errorf("quickadd.Bundled has %s, which web/src/locales/index.ts does not list", code)
		}
		if Vocabularies[code] == nil {
			t.Errorf("quickadd.Bundled has %s without an entry in vocab.json", code)
		}
	}
	for code := range Vocabularies {
		if !slices.Contains(Bundled, code) {
			t.Errorf("vocab.json has %s, which quickadd.Bundled does not list", code)
		}
	}
}
