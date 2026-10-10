package push

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/ecdsa"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"time"
)

// RecordSize is the aes128gcm record size used for every message (RFC 8188 rs).
const RecordSize = 4096

// MaxPlaintext is the largest payload that fits one record: rs minus the
// padding delimiter and the 16-byte GCM tag.
const MaxPlaintext = RecordSize - 17

// ErrPayloadTooLarge is returned for plaintexts above MaxPlaintext.
var ErrPayloadTooLarge = errors.New("push payload too large")

// Encrypt encrypts plaintext for one subscription with a fresh ephemeral key
// and salt (RFC 8291 "aes128gcm" content coding). p256dh is the subscription's
// uncompressed public key, auth its 16-byte authentication secret.
func Encrypt(plaintext, p256dh, auth []byte) ([]byte, error) {
	eph, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return nil, err
	}
	return encrypt(plaintext, p256dh, auth, eph, salt)
}

// encrypt is Encrypt with the ephemeral key and salt supplied (test vectors).
func encrypt(plaintext, p256dh, auth []byte, as *ecdh.PrivateKey, salt []byte) ([]byte, error) {
	if len(plaintext) > MaxPlaintext {
		return nil, ErrPayloadTooLarge
	}
	if len(auth) != 16 {
		return nil, errors.New("push: auth secret must be 16 bytes")
	}
	if len(salt) != 16 {
		return nil, errors.New("push: salt must be 16 bytes")
	}
	ua, err := ecdh.P256().NewPublicKey(p256dh)
	if err != nil {
		return nil, fmt.Errorf("push: bad p256dh key: %w", err)
	}
	secret, err := as.ECDH(ua)
	if err != nil {
		return nil, err
	}
	cek, nonce, err := deriveKeys(secret, p256dh, as.PublicKey().Bytes(), auth, salt)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(cek)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	// One record, the last: plaintext followed by the 0x02 delimiter, no padding.
	record := append(append(make([]byte, 0, len(plaintext)+1), plaintext...), 0x02)
	asPub := as.PublicKey().Bytes()
	header := make([]byte, 0, 16+4+1+len(asPub))
	header = append(header, salt...)
	header = binary.BigEndian.AppendUint32(header, RecordSize)
	header = append(header, byte(len(asPub)))
	header = append(header, asPub...)
	return gcm.Seal(header, nonce, record, nil), nil
}

// deriveKeys implements the RFC 8291 section 3.4 key schedule from the ECDH
// shared secret and both public keys; decryption (tests) uses it unchanged.
func deriveKeys(secret, uaPub, asPub, auth, salt []byte) (cek, nonce []byte, err error) {
	// key_info = "WebPush: info" || 0x00 || ua_public || as_public
	info := "WebPush: info\x00" + string(uaPub) + string(asPub)
	ikm, err := hkdf.Key(sha256.New, secret, auth, info, 32)
	if err != nil {
		return nil, nil, err
	}
	if cek, err = hkdf.Key(sha256.New, ikm, salt, "Content-Encoding: aes128gcm\x00", 16); err != nil {
		return nil, nil, err
	}
	if nonce, err = hkdf.Key(sha256.New, ikm, salt, "Content-Encoding: nonce\x00", 12); err != nil {
		return nil, nil, err
	}
	return cek, nonce, nil
}

// ---- VAPID (RFC 8292) ----

// VAPIDTokenTTL is the lifetime of each signed token (the RFC allows up to 24 h).
const VAPIDTokenTTL = 12 * time.Hour

// VAPIDAuthorization returns the Authorization header value for a push to
// endpoint: "vapid t=<ES256 JWT>, k=<public key>". The JWT's audience is the
// endpoint's origin, sub the contact URI.
func VAPIDAuthorization(endpoint, subject string, k *Keys, now time.Time) (string, error) {
	u, err := url.Parse(endpoint)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return "", fmt.Errorf("push: bad endpoint %q", endpoint)
	}
	enc := base64.RawURLEncoding
	header := enc.EncodeToString([]byte(`{"typ":"JWT","alg":"ES256"}`))
	claims, err := json.Marshal(map[string]any{
		"aud": u.Scheme + "://" + u.Host,
		"exp": now.Add(VAPIDTokenTTL).Unix(),
		"sub": subject,
	})
	if err != nil {
		return "", err
	}
	signingInput := header + "." + enc.EncodeToString(claims)
	digest := sha256.Sum256([]byte(signingInput))
	r, s, err := ecdsa.Sign(rand.Reader, k.priv, digest[:])
	if err != nil {
		return "", err
	}
	// JWS ES256 signature: R || S, each left-padded to 32 bytes.
	sig := make([]byte, 64)
	r.FillBytes(sig[:32])
	s.FillBytes(sig[32:])
	return "vapid t=" + signingInput + "." + enc.EncodeToString(sig) + ", k=" + k.PublicKey(), nil
}
