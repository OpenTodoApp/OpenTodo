package backup

import (
	"bufio"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/binary"
	"errors"
	"fmt"
	"io"

	"golang.org/x/crypto/argon2"
)

// Encrypted archive layout, version 1 (documented byte for byte in docs/backups.md):
//
//	offset  size  field
//	0       5     magic "OTBK1"
//	5       1     KDF id, 1 = argon2id
//	6       4     argon2id memory in KiB, uint32 big-endian
//	10      4     argon2id iterations, uint32 big-endian
//	14      1     argon2id parallelism
//	15      16    salt
//	31      4     plaintext chunk size in bytes, uint32 big-endian
//	35      ...   chunks
//
// key   = argon2id(passphrase, salt, iterations, memory, parallelism, 32 bytes)
// chunk = AES-256-GCM(key, nonce, plaintext, aad = the 35 header bytes)
// nonce = uint64 big-endian chunk index (from 0) || 0x00 0x00 0x00 || final flag
//
// Every chunk but the last carries exactly chunk-size plaintext bytes; the last
// carries 0..chunk-size bytes and is sealed with final flag 0x01. A stream that
// ends without a final chunk, or continues after one, is rejected.
const (
	encMagic         = "OTBK1"
	encHeaderLen     = 35
	kdfArgon2id      = 1
	DefaultChunkSize = 1 << 20
	argonMemoryKiB   = 19 * 1024 // matches the password hasher (internal/auth)
	argonIterations  = 2
	argonParallelism = 1
	gcmTagLen        = 16
)

func deriveKey(passphrase string, salt []byte, memory, iterations uint32, parallelism uint8) []byte {
	return argon2.IDKey([]byte(passphrase), salt, iterations, memory, parallelism, 32)
}

func chunkNonce(index uint64, final bool) []byte {
	n := make([]byte, 12)
	binary.BigEndian.PutUint64(n, index)
	if final {
		n[11] = 1
	}
	return n
}

// encryptWriter seals everything written to it in chunks. Close must be called
// to emit the final chunk.
type encryptWriter struct {
	w      io.Writer
	aead   cipher.AEAD
	header []byte
	buf    []byte
	size   int
	index  uint64
	closed bool
}

func newEncryptWriter(w io.Writer, passphrase string, chunkSize int) (*encryptWriter, error) {
	if chunkSize <= 0 {
		chunkSize = DefaultChunkSize
	}
	header := make([]byte, encHeaderLen)
	copy(header, encMagic)
	header[5] = kdfArgon2id
	binary.BigEndian.PutUint32(header[6:], argonMemoryKiB)
	binary.BigEndian.PutUint32(header[10:], argonIterations)
	header[14] = argonParallelism
	if _, err := rand.Read(header[15:31]); err != nil {
		return nil, err
	}
	binary.BigEndian.PutUint32(header[31:], uint32(chunkSize))
	key := deriveKey(passphrase, header[15:31], argonMemoryKiB, argonIterations, argonParallelism)
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	if _, err := w.Write(header); err != nil {
		return nil, err
	}
	return &encryptWriter{w: w, aead: aead, header: header, buf: make([]byte, 0, chunkSize), size: chunkSize}, nil
}

func (e *encryptWriter) Write(p []byte) (int, error) {
	if e.closed {
		return 0, errors.New("write after close")
	}
	n := 0
	for len(p) > 0 {
		// A full buffer is only flushed once more data arrives, so the last chunk
		// of the stream is always the one sealed as final in Close.
		if len(e.buf) == e.size {
			if err := e.flush(false); err != nil {
				return n, err
			}
		}
		k := min(e.size-len(e.buf), len(p))
		e.buf = append(e.buf, p[:k]...)
		p = p[k:]
		n += k
	}
	return n, nil
}

func (e *encryptWriter) flush(final bool) error {
	sealed := e.aead.Seal(nil, chunkNonce(e.index, final), e.buf, e.header)
	e.index++
	e.buf = e.buf[:0]
	_, err := e.w.Write(sealed)
	return err
}

// Close seals the final chunk. It does not close the underlying writer.
func (e *encryptWriter) Close() error {
	if e.closed {
		return nil
	}
	e.closed = true
	return e.flush(true)
}

// decryptReader authenticates and decrypts an encrypted archive stream.
type decryptReader struct {
	r     *bufio.Reader
	aead  cipher.AEAD
	hdr   []byte
	size  int
	index uint64
	plain []byte
	done  bool
	err   error
}

func integrity(format string, args ...any) error {
	return fmt.Errorf("%w: "+format, append([]any{ErrIntegrity}, args...)...)
}

func newDecryptReader(r io.Reader, passphrase string) (*decryptReader, error) {
	br, ok := r.(*bufio.Reader)
	if !ok {
		br = bufio.NewReader(r)
	}
	hdr := make([]byte, encHeaderLen)
	if _, err := io.ReadFull(br, hdr); err != nil {
		return nil, integrity("truncated header")
	}
	if string(hdr[:5]) != encMagic {
		return nil, fmt.Errorf("not an encrypted OpenTodo archive")
	}
	if hdr[5] != kdfArgon2id {
		return nil, fmt.Errorf("unsupported key derivation id %d", hdr[5])
	}
	memory := binary.BigEndian.Uint32(hdr[6:])
	iterations := binary.BigEndian.Uint32(hdr[10:])
	parallelism := hdr[14]
	size := binary.BigEndian.Uint32(hdr[31:])
	// Refuse parameters that would exhaust memory before authenticating anything.
	if memory == 0 || memory > 1<<20 || iterations == 0 || iterations > 64 || parallelism == 0 || size == 0 || size > 64<<20 {
		return nil, integrity("implausible header parameters")
	}
	key := deriveKey(passphrase, hdr[15:31], memory, iterations, parallelism)
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &decryptReader{r: br, aead: aead, hdr: hdr, size: int(size)}, nil
}

func (d *decryptReader) Read(p []byte) (int, error) {
	for len(d.plain) == 0 {
		if d.err != nil {
			return 0, d.err
		}
		if d.done {
			// Anything after the final chunk is an error.
			if _, err := d.r.ReadByte(); err == nil {
				d.err = integrity("data after the final chunk")
				return 0, d.err
			}
			return 0, io.EOF
		}
		d.err = d.next()
	}
	n := copy(p, d.plain)
	d.plain = d.plain[n:]
	return n, nil
}

func (d *decryptReader) next() error {
	sealed := make([]byte, d.size+gcmTagLen)
	n, err := io.ReadFull(d.r, sealed)
	final := false
	switch {
	case err == io.EOF:
		return integrity("truncated: the final chunk is missing")
	case errors.Is(err, io.ErrUnexpectedEOF):
		final = true
	case err != nil:
		return err
	default:
		if _, perr := d.r.Peek(1); perr == io.EOF {
			final = true
		}
	}
	if n < gcmTagLen {
		return integrity("truncated chunk %d", d.index)
	}
	plain, oerr := d.aead.Open(nil, chunkNonce(d.index, final), sealed[:n], d.hdr)
	if oerr != nil {
		if d.index == 0 {
			return ErrPassphraseInvalid
		}
		return integrity("chunk %d failed authentication (tampered or truncated)", d.index)
	}
	d.index++
	d.plain = plain
	d.done = final
	return nil
}
