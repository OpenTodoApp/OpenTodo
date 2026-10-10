// Package ids generates identifiers and random secrets without external dependencies.
package ids

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
)

// New returns a random UUID v4 string.
func New() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(fmt.Sprintf("ids: crypto/rand failed: %v", err))
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return formatUUID(b[:])
}

// NameID returns a deterministic, UUID-formatted id for name within namespace ns:
// the first 16 bytes of SHA-256(ns + ":" + name) with the RFC 9562 version 8
// (custom) and variant bits set. Replicas that derive an id from the same inputs
// create the same entity, which is how concurrent completions of one recurring
// occurrence converge (OpenSpec change recurring-tasks, design D2). This is the
// only non-random id; web/src/lib/ids.ts implements the same function.
func NameID(ns, name string) string {
	sum := sha256.Sum256([]byte(ns + ":" + name))
	b := sum[:16]
	b[6] = (b[6] & 0x0f) | 0x80
	b[8] = (b[8] & 0x3f) | 0x80
	return formatUUID(b)
}

func formatUUID(b []byte) string {
	dst := make([]byte, 36)
	hex.Encode(dst[0:8], b[0:4])
	dst[8] = '-'
	hex.Encode(dst[9:13], b[4:6])
	dst[13] = '-'
	hex.Encode(dst[14:18], b[6:8])
	dst[18] = '-'
	hex.Encode(dst[19:23], b[8:10])
	dst[23] = '-'
	hex.Encode(dst[24:], b[10:16])
	return string(dst)
}

// Secret returns a URL-safe random string with n bytes of entropy.
func Secret(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(fmt.Sprintf("ids: crypto/rand failed: %v", err))
	}
	return base64.RawURLEncoding.EncodeToString(b)
}
