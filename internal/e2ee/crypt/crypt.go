// Package crypt is the content cryptography of end-to-end encryption for the
// command-line client (OpenSpec change mcp-projects, design D7): the same format
// as web/src/lib/crypto.ts, on the Go standard library only. It is imported by
// internal/cli and never by the server, which runs no content cryptography; a
// test over the server's dependencies keeps it that way.
//
//	value   "enc:v1:" + base64url(nonce(12) || AES-256-GCM(plaintext, aad))
//	aad     entity + "\x00" + entityId + "\x00" + field
//	DEK     wrapped (RFC 3394 AES-KW) under a PBKDF2-SHA-256 passphrase key and
//	        under an HKDF-SHA-256 recovery key
//
// Known-answer vectors shared with the browser (web/src/lib/e2ee.vectors.json)
// pin every function here.
package crypt

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hkdf"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base32"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/pixari/opentodo/internal/e2ee"
)

const (
	// KeyBytes is the size of the account key (AES-256).
	KeyBytes   = 32
	nonceBytes = 12
	tagBytes   = 16
	// RecoveryInfo is the HKDF context of the recovery key's wrapping key.
	RecoveryInfo = "opentodo/e2ee/recovery-kek/v1"
)

// Iteration bounds accepted from a key record, as devices accept them
// (ITERATION_LIMITS in web/src/lib/crypto.ts). Variables only so tests can use
// the small iteration count of the shared vectors.
var (
	MinIterations = 100_000
	MaxIterations = 10_000_000
)

var (
	// ErrDecrypt: the value is not authentic for this key and location.
	ErrDecrypt = errors.New("cannot decrypt this value")
	// ErrWrongSecret: the passphrase or recovery key did not unwrap the account key.
	ErrWrongSecret = errors.New("the passphrase or recovery key is not correct")
	// ErrRecoveryFormat: a recovery key was mistyped.
	ErrRecoveryFormat = errors.New("this is not a valid recovery key; check for typos")
	// ErrIterations: the key record's derivation cost is outside the accepted range.
	ErrIterations = errors.New("the key record's key derivation iterations are outside the accepted range")
)

var b64 = base64.RawURLEncoding

func aad(entity, id, field string) []byte {
	return []byte(entity + "\x00" + id + "\x00" + field)
}

func gcm(key []byte) (cipher.AEAD, error) {
	if len(key) != KeyBytes {
		return nil, fmt.Errorf("account key must be %d bytes", KeyBytes)
	}
	blk, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(blk)
}

// Seal encrypts one content value for entity/id/field with a fresh random nonce.
func Seal(key []byte, entity, id, field, plaintext string) (string, error) {
	nonce := make([]byte, nonceBytes)
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	return SealWithNonce(key, nonce, entity, id, field, plaintext)
}

// SealWithNonce is Seal with a given nonce, for known-answer tests only.
func SealWithNonce(key, nonce []byte, entity, id, field, plaintext string) (string, error) {
	g, err := gcm(key)
	if err != nil {
		return "", err
	}
	if len(nonce) != nonceBytes {
		return "", errors.New("nonce must be 12 bytes")
	}
	out := g.Seal(append([]byte(nil), nonce...), nonce, []byte(plaintext), aad(entity, id, field))
	return e2ee.PrefixV1 + b64.EncodeToString(out), nil
}

// Open decrypts one content value; ErrDecrypt when it is not authentic for this
// key, entity, id and field.
func Open(key []byte, entity, id, field, value string) (string, error) {
	if !strings.HasPrefix(value, e2ee.PrefixV1) {
		return "", ErrDecrypt
	}
	body, err := b64.DecodeString(value[len(e2ee.PrefixV1):])
	if err != nil || len(body) < nonceBytes+tagBytes {
		return "", ErrDecrypt
	}
	g, err := gcm(key)
	if err != nil {
		return "", err
	}
	pt, err := g.Open(nil, body[:nonceBytes], body[nonceBytes:], aad(entity, id, field))
	if err != nil || !utf8.Valid(pt) {
		return "", ErrDecrypt
	}
	return string(pt), nil
}

var defaultIV = []byte{0xA6, 0xA6, 0xA6, 0xA6, 0xA6, 0xA6, 0xA6, 0xA6}

// Wrap is RFC 3394 AES key wrap with the default initial value.
func Wrap(kek, key []byte) ([]byte, error) {
	if len(key)%8 != 0 || len(key) < 16 {
		return nil, errors.New("key to wrap must be a multiple of 8 bytes, at least 16")
	}
	b, err := aes.NewCipher(kek)
	if err != nil {
		return nil, err
	}
	n := len(key) / 8
	a := append([]byte(nil), defaultIV...)
	r := append([]byte(nil), key...)
	buf := make([]byte, 16)
	for j := 0; j < 6; j++ {
		for i := 0; i < n; i++ {
			copy(buf, a)
			copy(buf[8:], r[i*8:(i+1)*8])
			b.Encrypt(buf, buf)
			binary.BigEndian.PutUint64(a, binary.BigEndian.Uint64(buf[:8])^uint64(n*j+i+1))
			copy(r[i*8:(i+1)*8], buf[8:])
		}
	}
	return append(a, r...), nil
}

// Unwrap reverses Wrap; ErrWrongSecret when the integrity check fails (a wrong
// wrapping key).
func Unwrap(kek, wrapped []byte) ([]byte, error) {
	if len(wrapped)%8 != 0 || len(wrapped) < 24 {
		return nil, ErrWrongSecret
	}
	b, err := aes.NewCipher(kek)
	if err != nil {
		return nil, err
	}
	n := len(wrapped)/8 - 1
	a := append([]byte(nil), wrapped[:8]...)
	r := append([]byte(nil), wrapped[8:]...)
	buf := make([]byte, 16)
	for j := 5; j >= 0; j-- {
		for i := n - 1; i >= 0; i-- {
			binary.BigEndian.PutUint64(buf[:8], binary.BigEndian.Uint64(a)^uint64(n*j+i+1))
			copy(buf[8:], r[i*8:(i+1)*8])
			b.Decrypt(buf, buf)
			copy(a, buf[:8])
			copy(r[i*8:(i+1)*8], buf[8:])
		}
	}
	if subtle.ConstantTimeCompare(a, defaultIV) != 1 {
		return nil, ErrWrongSecret
	}
	return r, nil
}

// PassphraseKEK derives the passphrase's wrapping key (PBKDF2-HMAC-SHA-256).
// Devices normalise the passphrase to Unicode NFC first; the standard library
// has no normaliser, so a passphrase that is not plain ASCII may need the
// recovery key here (see NeedsNormalisation).
func PassphraseKEK(passphrase string, salt []byte, iterations int) ([]byte, error) {
	return pbkdf2.Key(sha256.New, passphrase, salt, iterations, KeyBytes)
}

// NeedsNormalisation reports whether a passphrase has non-ASCII characters,
// which devices NFC-normalise before derivation and this package does not.
func NeedsNormalisation(passphrase string) bool {
	for i := 0; i < len(passphrase); i++ {
		if passphrase[i] >= 0x80 {
			return true
		}
	}
	return false
}

// RecoveryKEK derives the recovery key's wrapping key (HKDF-SHA-256, zero salt).
func RecoveryKEK(raw []byte) ([]byte, error) {
	return hkdf.Key(sha256.New, raw, make([]byte, 32), RecoveryInfo, KeyBytes)
}

var b32 = base32.StdEncoding.WithPadding(base32.NoPadding)

// ParseRecoveryKey reads a typed recovery key like parseRecoveryKey in
// web/src/lib/crypto.ts: case, spaces and dashes are ignored and 0, 1, 8 read as
// O, I, B; 52 base32 characters for 32 bytes, then a 4-character checksum.
func ParseRecoveryKey(text string) ([]byte, error) {
	s := strings.Map(func(r rune) rune {
		switch {
		case r == ' ' || r == '\t' || r == '\n' || r == '\r' || r == '-':
			return -1
		case r == '0':
			return 'O'
		case r == '1':
			return 'I'
		case r == '8':
			return 'B'
		}
		return r
	}, strings.ToUpper(text))
	if len(s) != 56 {
		return nil, ErrRecoveryFormat
	}
	raw, err := b32.DecodeString(s[:52])
	if err != nil || len(raw) < 32 {
		return nil, ErrRecoveryFormat
	}
	raw = raw[:32]
	if b32.EncodeToString(raw) != s[:52] {
		return nil, ErrRecoveryFormat
	}
	sum := sha256.Sum256(raw)
	if b32.EncodeToString(sum[:3])[:4] != s[52:] {
		return nil, ErrRecoveryFormat
	}
	return raw, nil
}

// CheckRecord refuses a key record devices would refuse: an unknown derivation
// or an iteration count outside the accepted range.
func CheckRecord(rec e2ee.KeyRecord) error {
	if rec.KDF != e2ee.KDFPBKDF2SHA256 {
		return fmt.Errorf("unsupported key derivation %d; update ot", rec.KDF)
	}
	if rec.Iterations < MinIterations || rec.Iterations > MaxIterations {
		return fmt.Errorf("%w (%d)", ErrIterations, rec.Iterations)
	}
	return nil
}

// UnlockWithPassphrase unwraps the account key from a key record.
func UnlockWithPassphrase(rec e2ee.KeyRecord, passphrase string) ([]byte, error) {
	if err := CheckRecord(rec); err != nil {
		return nil, err
	}
	salt, err := b64.DecodeString(rec.Salt)
	if err != nil {
		return nil, errors.New("the key record's salt is malformed")
	}
	wrapped, err := b64.DecodeString(rec.WrappedByPassphrase)
	if err != nil {
		return nil, ErrWrongSecret
	}
	kek, err := PassphraseKEK(passphrase, salt, rec.Iterations)
	if err != nil {
		return nil, err
	}
	return Unwrap(kek, wrapped)
}

// UnlockWithRecoveryKey unwraps the account key with the recovery key text.
func UnlockWithRecoveryKey(rec e2ee.KeyRecord, text string) ([]byte, error) {
	if rec.KDF != e2ee.KDFPBKDF2SHA256 {
		return nil, fmt.Errorf("unsupported key derivation %d; update ot", rec.KDF)
	}
	raw, err := ParseRecoveryKey(text)
	if err != nil {
		return nil, err
	}
	kek, err := RecoveryKEK(raw)
	if err != nil {
		return nil, err
	}
	wrapped, err := b64.DecodeString(rec.WrappedByRecovery)
	if err != nil {
		return nil, ErrWrongSecret
	}
	return Unwrap(kek, wrapped)
}
