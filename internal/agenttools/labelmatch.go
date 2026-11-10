package agenttools

import (
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
)

// Label matching for the read tools (OpenSpec change assistant-eval-gaps): a
// person asks for "my errands" while the label is "errand". The rule is
// deterministic and adds matches only, never stems: a query that is a label's
// name plus a trailing "s" or "es" finds that label, and nothing else changes,
// so a language without that plural just gets no extra match. The device's
// twin is labelSearchMatches/labelFilterMatches in
// web/src/lib/assistantDevice/read.ts, pinned by
// web/src/lib/assistantDevice/labelMatch.vectors.json.

// labelQuery is a query read as a label name: trimmed, lower-cased, without a
// leading "#" or "@" (how people write labels).
func labelQuery(q string) string {
	return strings.TrimLeft(strings.ToLower(strings.TrimSpace(q)), "#@")
}

// pluralOf reports whether query is name with a simple plural ending.
func pluralOf(query, name string) bool {
	for _, end := range []string{"s", "es"} {
		if base, ok := strings.CutSuffix(query, end); ok && base != "" && base == name {
			return true
		}
	}
	return false
}

// labelFilterMatches is list_tasks' label argument against a stored label
// name: the same name ignoring case, or the name with a simple plural ending.
// Ciphertext never matches.
func labelFilterMatches(stored, query string) bool {
	if e2ee.IsCiphertext(stored) {
		return false
	}
	name, q := strings.ToLower(strings.TrimSpace(stored)), labelQuery(query)
	return name != "" && q != "" && (name == q || pluralOf(q, name))
}

// labelSearchMatches is search_tasks' rule for a task's label: the name holds
// the query, as titles do, or the query is the name with a simple plural ending.
func labelSearchMatches(stored, query string) bool {
	if e2ee.IsCiphertext(stored) {
		return false
	}
	name, q := strings.ToLower(strings.TrimSpace(stored)), labelQuery(query)
	return name != "" && q != "" && (strings.Contains(name, q) || pluralOf(q, name))
}
