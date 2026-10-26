// Package textutil holds small string helpers shared by server packages.
package textutil

import "unicode/utf8"

// Truncate returns s cut to at most maxBytes bytes without splitting a UTF-8
// sequence: a name, user agent or message stored under a byte limit stays
// valid UTF-8 (a byte cut would turn the last character into U+FFFD).
func Truncate(s string, maxBytes int) string {
	if len(s) <= maxBytes {
		return s
	}
	if maxBytes <= 0 {
		return ""
	}
	// s[maxBytes] is the first byte left out: when it continues a character,
	// the cut moves back to that character's first byte.
	for i := maxBytes; i > maxBytes-utf8.UTFMax && i >= 0; i-- {
		if utf8.RuneStart(s[i]) {
			return s[:i]
		}
	}
	return s[:maxBytes] // not UTF-8 to begin with
}
