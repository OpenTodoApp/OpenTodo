package skills

import (
	"strings"
	"testing"
)

// Each skill opens with frontmatter naming it and saying when to use it.
func TestSkillFrontmatter(t *testing.T) {
	for name, body := range map[string]string{OpenTodoCLIName: OpenTodoCLI, OpenTodoMCPName: OpenTodoMCP} {
		if !strings.HasPrefix(body, "---\nname: "+name+"\ndescription: ") {
			t.Errorf("%s: frontmatter must start with its name and a description", name)
		}
		if !strings.Contains(body[4:], "\n---\n") {
			t.Errorf("%s: frontmatter is not closed", name)
		}
	}
}
