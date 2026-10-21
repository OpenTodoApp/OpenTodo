package backup

import (
	"bytes"
	"compress/gzip"
	"io"
	"testing"
)

// tamper flips one byte of an archive so that it is really damaged. In a plain
// gzip archive some bits do not change what decompresses (a run of zeros in the
// database can be coded either way), so a fixed position is not always damage:
// starting in the middle, it moves on until the decompressed bytes differ or the
// stream breaks. An encrypted archive is damaged by any flip.
func tamper(t *testing.T, raw []byte) []byte {
	t.Helper()
	out := bytes.Clone(raw)
	if len(raw) < 2 || raw[0] != 0x1f || raw[1] != 0x8b {
		out[len(out)/2] ^= 0x40
		return out
	}
	orig, err := gunzip(raw)
	if err != nil {
		t.Fatal(err)
	}
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

func gunzip(raw []byte) ([]byte, error) {
	zr, err := gzip.NewReader(bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	return io.ReadAll(zr)
}
