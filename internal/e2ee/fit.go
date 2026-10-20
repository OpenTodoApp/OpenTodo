package e2ee

import (
	"encoding/json"
	"sort"
)

// MaxEncryptableBytes is the longest plaintext an end-to-end encrypted account's
// devices can still re-encrypt (encrypt-on-sight) into one synced value of at
// most maxValue bytes: its ciphertext, "enc:v1:" + base64url(nonce(12) ||
// ciphertext || tag(16)) between JSON quotes, must fit. For the sync limit of
// 64 KB that is about 48 KB of text. The caller passes the limit
// (sync.MaxValueBytes) because this package imports nothing from sync.
func MaxEncryptableBytes(maxValue int) int {
	return (maxValue-2-len(PrefixV1))*3/4 - 12 - 16
}

// FitsValue reports whether d, encoded as an operation encodes it, is within
// maxValue bytes, also once encrypted.
func FitsValue(d string, maxValue int) bool {
	if len(d) > MaxEncryptableBytes(maxValue) {
		return false
	}
	b, err := json.Marshal(d)
	return err == nil && len(b) <= maxValue
}

// FitText keeps as much of body as one synced value holds (OpenSpec changes
// email-body-limit and issue-import, design D7). compose(body, false) is the
// whole text; when it does not fit, the result is compose(prefix, true) for the
// longest prefix of body, cut at a rune boundary, that fits: compose adds the
// caller's note that the rest did not fit (and anything that follows the body,
// such as email's list of attachments).
func FitText(body string, maxValue int, compose func(body string, cut bool) string) string {
	if d := compose(body, false); FitsValue(d, maxValue) {
		return d
	}
	// Every byte encodes to at least one, so no longer prefix can fit.
	if limit := MaxEncryptableBytes(maxValue); len(body) > limit {
		body = body[:limit]
	}
	cuts := make([]int, 0, len(body))
	for i := range body {
		cuts = append(cuts, i)
	}
	// The first cut that no longer fits; longer prefixes encode longer.
	n := sort.Search(len(cuts), func(i int) bool { return !FitsValue(compose(body[:cuts[i]], true), maxValue) })
	for n > 0 && !FitsValue(compose(body[:cuts[n-1]], true), maxValue) {
		n--
	}
	if n == 0 {
		return compose("", true)
	}
	return compose(body[:cuts[n-1]], true)
}
