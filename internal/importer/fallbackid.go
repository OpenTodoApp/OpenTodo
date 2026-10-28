package importer

import (
	"crypto/sha256"
	"encoding/hex"
	"strconv"
	"strings"
)

// fallbackIDs gives the rows of one file that carry no id of their own a
// source id made from their content (OpenSpec change import-content-ids,
// issue #520). The id was the row's position ("task:#3"), so every later file
// without ids matched the source ids an earlier import recorded and its rows
// were skipped as already imported, or its lists landed in another file's
// projects. A content id still recognises the same file imported again; equal
// rows in one file are told apart by their order of appearance.
type fallbackIDs map[string]int

// id returns prefix + a short digest of parts, with ".2", ".3"… for repeats.
func (f fallbackIDs) id(prefix string, parts ...string) string {
	sum := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	key := prefix + "~" + hex.EncodeToString(sum[:8])
	f[key]++
	if n := f[key]; n > 1 {
		key += "." + strconv.Itoa(n)
	}
	return key
}
