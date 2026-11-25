package sync

import (
	"encoding/json"
	"strings"
)

// Entity ids and JSON strings, the two helpers every op path shares.

// ValidEntityID reports whether id is a usable entity id: 1 to MaxIDLen
// characters from ASCII letters, digits and . _ : @ + = ~ -. That covers every
// id the clients make (UUIDs, name-derived UUIDs, "me", CalDAV UIDs) and keeps
// out quotes, backslashes, control characters and spaces, which would break the
// JSON and the URLs ids are written into (OpenSpec change
// harden-links-and-sharing).
func ValidEntityID(id string) bool {
	if id == "" || len(id) > MaxIDLen {
		return false
	}
	for i := 0; i < len(id); i++ {
		c := id[i]
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9':
		case strings.IndexByte("._:@+=~-", c) >= 0:
		default:
			return false
		}
	}
	return true
}

// QuoteJSON is s as a JSON string, for building values and for matching stored
// ones. It is the only quoting helper: fmt's %q and strconv.Quote produce
// escapes (\a, \x00, \U...) that are not JSON.
func QuoteJSON(s string) string {
	b, err := json.Marshal(s)
	if err != nil { // a Go string always marshals
		panic(err)
	}
	return string(b)
}
