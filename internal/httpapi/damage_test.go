package httpapi

import (
	"bytes"
	"compress/gzip"
	"io"
	"testing"
)

// damageGzip flips one byte of a plain gzip archive so that it is really damaged
// (like internal/backup's tamper): some bits do not change what decompresses, so
// a fixed position is not always damage. It moves on from the middle until the
// decompressed bytes differ or the stream breaks.
func damageGzip(t *testing.T, raw []byte) []byte {
	t.Helper()
	gunzip := func(b []byte) ([]byte, error) {
		zr, err := gzip.NewReader(bytes.NewReader(b))
		if err != nil {
			return nil, err
		}
		return io.ReadAll(zr)
	}
	orig, err := gunzip(raw)
	if err != nil {
		t.Fatal(err)
	}
	out := bytes.Clone(raw)
	for pos := len(raw) / 2; pos < len(raw)-8; pos++ {
		out[pos] ^= 0x40
		if got, err := gunzip(out); err != nil || !bytes.Equal(got, orig) {
			return out
		}
		out[pos] ^= 0x40
	}
	t.Fatal("no flip damages this archive")
	return nil
}
