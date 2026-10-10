// Package ids generates identifiers and random secrets without external dependencies.
package ids

import (
	"crypto/rand"
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
