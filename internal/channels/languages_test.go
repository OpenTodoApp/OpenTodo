package channels

import (
	"os"
	"regexp"
	"slices"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/mail"
)

// shippedEntry is one `{ code: 'de', name: 'Deutsch' }` line of SHIPPED.
var shippedEntry = regexp.MustCompile(`\{ code: '([a-z]{2,3})'[^}]*\}`)

// webLanguages reads the web app's SHIPPED list (web/src/locales/index.ts):
// every code, and the maintained ones (entries without `community: true`).
func webLanguages(t *testing.T) (shipped, maintained []string) {
	t.Helper()
	src, err := os.ReadFile("../../web/src/locales/index.ts")
	if err != nil {
		t.Fatal(err)
	}
	for _, m := range shippedEntry.FindAllStringSubmatch(string(src), -1) {
		shipped = append(shipped, m[1])
		if !strings.Contains(m[0], "community: true") {
			maintained = append(maintained, m[1])
		}
	}
	if len(maintained) < 7 {
		t.Fatalf("read %v from index.ts", maintained)
	}
	return shipped, maintained
}

// TestMaintainedLanguagesOnEveryServerSurface: a language the web app lists as
// maintained has its emails (mail.Languages) and channel messages (the texts
// table), so it cannot ship in the app while the server silently writes English
// (OpenSpec change more-languages, design D6). A community language may be
// missing from both and then gets English; a server language the web app does
// not list could never be chosen.
func TestMaintainedLanguagesOnEveryServerSurface(t *testing.T) {
	shipped, maintained := webLanguages(t)
	for _, code := range maintained {
		if !slices.Contains(mail.Languages, code) {
			t.Errorf("%s is maintained in web/src/locales/index.ts but missing from mail.Languages", code)
		}
		if _, ok := texts[code]; !ok {
			t.Errorf("%s is maintained in web/src/locales/index.ts but has no row in internal/channels/messages.go", code)
		}
	}
	for _, code := range mail.Languages {
		if !slices.Contains(shipped, code) {
			t.Errorf("mail.Languages has %s, which web/src/locales/index.ts does not list", code)
		}
	}
	for code := range texts {
		if !slices.Contains(shipped, code) {
			t.Errorf("internal/channels/messages.go has %s, which web/src/locales/index.ts does not list", code)
		}
	}
}
