package filter

import "strings"

// Wildcard names (OpenSpec change filter-wildcards): in a label, project or
// section term, `*` matches any run of characters, none included, and `\*` is
// a literal star. Matched without regular expressions, so a name cannot inject
// one; web/src/lib/filter/names.ts is the same code in TypeScript.

// wildcardParts returns the pieces between a name's wildcards, in lower case,
// or nil when the name has none.
func wildcardParts(name string) []string {
	s := []rune(strings.TrimSpace(name))
	parts := []string{""}
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		switch {
		case s[i] == '*':
			parts[len(parts)-1] = b.String()
			b.Reset()
			parts = append(parts, "")
		case s[i] == '\\' && i+1 < len(s) && s[i+1] == '*':
			i++
			b.WriteRune('*')
		default:
			b.WriteRune(s[i])
		}
	}
	parts[len(parts)-1] = b.String()
	if len(parts) < 2 {
		return nil
	}
	for i, p := range parts {
		parts[i] = strings.ToLower(p)
	}
	return parts
}

// fitsParts reports whether a name key (nameKey) fits the pieces: the first a
// prefix, the last a suffix, the others in order between.
func fitsParts(key string, parts []string) bool {
	first, last := parts[0], parts[len(parts)-1]
	end := len(key) - len(last)
	if end < len(first) || !strings.HasPrefix(key, first) || !strings.HasSuffix(key, last) {
		return false
	}
	at := len(first)
	for _, p := range parts[1 : len(parts)-1] {
		j := strings.Index(key[at:end], p)
		if j < 0 {
			return false
		}
		at += j + len(p)
	}
	return true
}

// idsNamed returns the ids a term's name picks from ids by name key, or nil.
func idsNamed(byName map[string][]string, name string) []string {
	parts := wildcardParts(name)
	if parts == nil {
		return byName[nameKey(strings.ReplaceAll(name, `\*`, "*"))]
	}
	var ids []string
	for key, list := range byName {
		if fitsParts(key, parts) {
			ids = append(ids, list...)
		}
	}
	return ids
}
