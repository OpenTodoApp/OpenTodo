// Package textutil holds small string helpers shared by server packages.
package textutil

import (
	"fmt"
	"unicode/utf8"
)

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

// HumanBytes formats n as a size a person reads: whole bytes below 1 KiB,
// then one decimal in KiB, MiB, GiB, TiB, PiB or EiB (binary units, so a
// division by 1024 always matches the label).
func HumanBytes(n int64) string {
	const unit = 1024
	if n < unit {
		return fmt.Sprintf("%d B", n)
	}
	div, exp := int64(unit), 0
	for m := n / unit; m >= unit; m /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %ciB", float64(n)/float64(div), "KMGTPE"[exp])
}

// TruncateRunes returns s cut to at most maxRunes runes without splitting a
// character. suffix ("" for none) is appended when s was longer than the
// limit; it does not count against it.
func TruncateRunes(s string, maxRunes int, suffix string) string {
	if utf8.RuneCountInString(s) <= maxRunes {
		return s
	}
	return string([]rune(s)[:maxRunes]) + suffix
}

// TruncateEllipsis truncates s to maxBytes bytes on a character boundary and
// marks a cut with an ellipsis (a short user-facing string a size limit cut).
func TruncateEllipsis(s string, maxBytes int) string {
	if len(s) <= maxBytes {
		return s
	}
	return Truncate(s, maxBytes) + "…"
}
