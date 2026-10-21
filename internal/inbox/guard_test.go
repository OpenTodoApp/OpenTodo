package inbox

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// TestReadersUseTheRule: every `case "inbox":` branch of the Go readers asks the
// shared rule (design D2) instead of testing for a missing project on its own.
// web/src/lib/inboxGuard.test.ts checks the web side.
func TestReadersUseTheRule(t *testing.T) {
	branch := regexp.MustCompile(`(?s)case "inbox":(.*?)(\n\t*case |\n\t*default:|\n\t*}\n)`)
	for _, file := range []string{"../agenttools/read.go", "../cli/cmd_tasks.go"} {
		src, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		found := false
		for _, m := range branch.FindAllStringSubmatch(string(src), -1) {
			body := m[1]
			// A branch that only names the view (sort order, aliases) does not filter.
			if !strings.Contains(body, "continue") {
				continue
			}
			found = true
			if !strings.Contains(body, "inInbox(") {
				t.Errorf("%s: an inbox branch filters without inInbox:%s", file, body)
			}
		}
		if !found {
			t.Errorf("%s: no inbox filter found", file)
		}
	}
}
