package filter

import "strings"

// Wildcard names (OpenSpec change filter-wildcards): in a label, project or
// section term, `*` matches any run of characters, none included; `\*` is a
// literal star and `\\` a literal backslash (any other backslash is itself).
// A name that is exactly a live item's name means that item, so a query saved
// before wildcards keeps its meaning. Matched without regular expressions, so
// a name cannot inject one; web/src/lib/filter/names.ts is the same code in
// TypeScript.

// pieces reads a term's name as the pieces between its wildcards, escapes
// resolved: one piece when it has none.
func pieces(name string) []string {
	s := []rune(name)
	var parts []string
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		switch {
		case s[i] == '*':
			parts = append(parts, b.String())
			b.Reset()
		case s[i] == '\\' && i+1 < len(s) && (s[i+1] == '*' || s[i+1] == '\\'):
			i++
			b.WriteRune(s[i])
		default:
			b.WriteRune(s[i])
		}
	}
	return append(parts, b.String())
}

// wildcardParts returns the pieces between a name's wildcards, in lower case,
// or nil when the name has none.
func wildcardParts(name string) []string {
	parts := pieces(strings.TrimSpace(name))
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
// The name exactly as written wins (`@to*do` is the label "to*do" while it
// exists), then the pattern, then the name with its escapes resolved.
func idsNamed(byName map[string][]string, name string) []string {
	if ids := byName[nameKey(name)]; ids != nil {
		return ids
	}
	parts := wildcardParts(name)
	if parts == nil {
		return byName[nameKey(strings.Join(pieces(name), "*"))]
	}
	var ids []string
	for key, list := range byName {
		if fitsParts(key, parts) {
			ids = append(ids, list...)
		}
	}
	return ids
}
