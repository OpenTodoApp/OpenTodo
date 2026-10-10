package backup

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/binary"
	"errors"
	"io"
	"testing"

	"golang.org/x/crypto/argon2"
)

func encrypt(t *testing.T, plain []byte, pass string, chunk int) []byte {
	t.Helper()
	var buf bytes.Buffer
	w, err := newEncryptWriter(&buf, pass, chunk)
	if err != nil {
		t.Fatal(err)
	}
	// Uneven writes exercise the buffering.
	for i := 0; i < len(plain); i += 777 {
		if _, err := w.Write(plain[i:min(i+777, len(plain))]); err != nil {
			t.Fatal(err)
		}
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func decrypt(data []byte, pass string) ([]byte, error) {
	r, err := newDecryptReader(bytes.NewReader(data), pass)
	if err != nil {
		return nil, err
	}
	return io.ReadAll(r)
}

func TestEncryptDecryptRoundTrip(t *testing.T) {
	const chunk = 4096
	for _, n := range []int{0, 1, chunk - 1, chunk, chunk + 1, 3 * chunk, 3*chunk + 17} {
		plain := make([]byte, n)
		rand.Read(plain)
		enc := encrypt(t, plain, "pass phrase", chunk)
		if string(enc[:5]) != "OTBK1" {
			t.Fatalf("magic = %q", enc[:5])
		}
		got, err := decrypt(enc, "pass phrase")
		if err != nil {
			t.Fatalf("n=%d: %v", n, err)
		}
		if !bytes.Equal(got, plain) {
			t.Fatalf("n=%d: round trip mismatch", n)
		}
		if _, err := decrypt(enc, "wrong"); !errors.Is(err, ErrIntegrity) {
			t.Fatalf("n=%d: wrong passphrase err = %v", n, err)
		}
	}
}

func TestTamperedChunkFails(t *testing.T) {
	plain := bytes.Repeat([]byte("opentodo "), 2000) // several 4 KiB chunks
	enc := encrypt(t, plain, "pw", 4096)
	for _, pos := range []int{10, 20, encHeaderLen + 5, encHeaderLen + 4096 + 16 + 3, len(enc) - 1} {
		bad := bytes.Clone(enc)
		bad[pos] ^= 0x01
		if _, err := decrypt(bad, "pw"); !errors.Is(err, ErrIntegrity) {
			t.Fatalf("flip at %d: err = %v, want integrity error", pos, err)
		}
	}
	// Reordering two full chunks is caught by the index in the nonce.
	c := 4096 + 16
	bad := bytes.Clone(enc)
	copy(bad[encHeaderLen:], enc[encHeaderLen+c:encHeaderLen+2*c])
	copy(bad[encHeaderLen+c:], enc[encHeaderLen:encHeaderLen+c])
	if _, err := decrypt(bad, "pw"); !errors.Is(err, ErrIntegrity) {
		t.Fatalf("swapped chunks: err = %v", err)
	}
}

func TestTruncatedArchiveFails(t *testing.T) {
	plain := bytes.Repeat([]byte{7}, 3*4096) // exactly three chunks
	enc := encrypt(t, plain, "pw", 4096)
	c := 4096 + 16
	for _, cut := range []int{encHeaderLen - 1, encHeaderLen, encHeaderLen + 10, encHeaderLen + c, encHeaderLen + 2*c, len(enc) - 1} {
		if _, err := decrypt(enc[:cut], "pw"); !errors.Is(err, ErrIntegrity) {
			t.Fatalf("cut at %d: err = %v, want integrity error", cut, err)
		}
	}
	// Appending data after the final chunk is rejected too.
	if _, err := decrypt(append(bytes.Clone(enc), 0), "pw"); !errors.Is(err, ErrIntegrity) {
		t.Fatalf("trailing data: err = %v", err)
	}
}

// referenceDecrypt is written from docs/backups.md alone, without the package's
// reader, to prove the code produces exactly the documented layout.
func referenceDecrypt(t *testing.T, data []byte, pass string) []byte {
	t.Helper()
	if len(data) < 35 || string(data[0:5]) != "OTBK1" || data[5] != 1 {
		t.Fatal("bad header")
	}
	header := data[:35]
	memory := binary.BigEndian.Uint32(data[6:10])
	iterations := binary.BigEndian.Uint32(data[10:14])
	threads := data[14]
	salt := data[15:31]
	chunkSize := int(binary.BigEndian.Uint32(data[31:35]))
	if memory != 19456 || iterations != 2 || threads != 1 {
		t.Fatalf("argon2id params %d/%d/%d differ from the documented 19456/2/1", memory, iterations, threads)
	}
	key := argon2.IDKey([]byte(pass), salt, iterations, memory, threads, 32)
	block, _ := aes.NewCipher(key)
	gcm, _ := cipher.NewGCM(block)
	var out []byte
	rest := data[35:]
	for i := uint64(0); ; i++ {
		n := min(len(rest), chunkSize+16)
		final := n == len(rest)
		nonce := make([]byte, 12)
		binary.BigEndian.PutUint64(nonce[0:8], i)
		if final {
			nonce[11] = 1
		}
		plain, err := gcm.Open(nil, nonce, rest[:n], header)
		if err != nil {
			t.Fatalf("chunk %d: %v", i, err)
		}
		out = append(out, plain...)
		rest = rest[n:]
		if final {
			return out
		}
	}
}

func TestFormatMatchesDocumentedLayout(t *testing.T) {
	plain := make([]byte, 2*DefaultChunkSize+123)
	rand.Read(plain)
	enc := encrypt(t, plain, "documented", 0) // default chunk size: 1 MiB
	if got := binary.BigEndian.Uint32(enc[31:35]); got != 1<<20 {
		t.Fatalf("chunk size = %d, want 1 MiB", got)
	}
	if want := 35 + 3*16 + len(plain); len(enc) != want {
		t.Fatalf("length = %d, want %d", len(enc), want)
	}
	if !bytes.Equal(referenceDecrypt(t, enc, "documented"), plain) {
		t.Fatal("reference decryption mismatch")
	}
}
