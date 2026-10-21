package relay

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
)

// Stream sealing (security review R1): the device opens its relay stream with
// an ephemeral ECDH P-256 public key, the server answers with its own, and both
// derive one AES-256-GCM key per stream with HKDF-SHA-256. Every request and
// answer is sealed with it, the request id as associated data. A reverse proxy
// that terminates TLS and logs bodies sees only ciphertext on the relay leg,
// and only the holder of the stream's private key can answer.

// HKDFInfo is the HKDF info string; the web worker uses the same.
const HKDFInfo = "opentodo relay v1"

var b64 = base64.RawURLEncoding

// streamKey is the server half of one stream's key exchange.
type streamKey struct {
	pub  []byte // the server's public key, uncompressed point
	aead cipher.AEAD
}

// newStreamKey derives the stream's AEAD from the device's public key
// (uncompressed P-256 point, as WebCrypto exports it) and the stream id (salt).
func newStreamKey(devicePub []byte, streamID string) (*streamKey, error) {
	priv, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("relay: server key: %w", err)
	}
	return deriveFrom(priv, devicePub, streamID)
}

// deriveFrom is the key agreement and derivation with a given server key
// (fixed in the shared test vector).
func deriveFrom(priv *ecdh.PrivateKey, devicePub []byte, streamID string) (*streamKey, error) {
	peer, err := ecdh.P256().NewPublicKey(devicePub)
	if err != nil {
		return nil, fmt.Errorf("relay: device key: %w", err)
	}
	shared, err := priv.ECDH(peer)
	if err != nil {
		return nil, fmt.Errorf("relay: key agreement: %w", err)
	}
	key, err := hkdf.Key(sha256.New, shared, []byte(streamID), HKDFInfo, 32)
	if err != nil {
		return nil, fmt.Errorf("relay: derive key: %w", err)
	}
	blk, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(blk)
	if err != nil {
		return nil, err
	}
	return &streamKey{pub: priv.PublicKey().Bytes(), aead: aead}, nil
}

// seal returns base64url(nonce || ciphertext) of plaintext bound to aad.
func (k *streamKey) seal(plaintext []byte, aad string) (string, error) {
	nonce := make([]byte, k.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	return b64.EncodeToString(k.aead.Seal(nonce, nonce, plaintext, []byte(aad))), nil
}

// errBadSeal is any box that does not open with the stream key.
var errBadSeal = errors.New("relay: sealed box does not open")

// open reverses seal; a box from another stream or for another request fails.
func (k *streamKey) open(box, aad string) ([]byte, error) {
	raw, err := b64.DecodeString(box)
	if err != nil || len(raw) < k.aead.NonceSize()+k.aead.Overhead() {
		return nil, errBadSeal
	}
	n := k.aead.NonceSize()
	out, err := k.aead.Open(nil, raw[:n], raw[n:], []byte(aad))
	if err != nil {
		return nil, errBadSeal
	}
	return out, nil
}
