package pushrelay

import (
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"golang.org/x/crypto/chacha20poly1305"
)

// Sealed handles (design D3): "h1." + base64url(keyId ‖ nonce ‖ sealed), where
// sealed is XChaCha20-Poly1305 under the sealing key keyId with the AAD
// handleAAD ‖ keyId, over env (1) ‖ issuedAt (8, Unix seconds) ‖ wakeKey (32)
// ‖ tokenLength (1) ‖ token. Only the relay holds the sealing keys.

const (
	handlePrefix = "h1."
	handleAAD    = "opentodo-push-relay/handle/1"
	// maxHandleLen bounds a handle before it is decoded.
	maxHandleLen = 512
)

// ErrHandle is every reason a handle does not open: not ours, an unknown key,
// changed bytes. Callers answer it like a wrong signature.
var ErrHandle = errors.New("handle does not open")

// Environment is the APNs environment a device token belongs to.
type Environment byte

// The two APNs environments.
const (
	Production  Environment = 1
	Development Environment = 2
)

func (e Environment) String() string {
	switch e {
	case Production:
		return "production"
	case Development:
		return "development"
	}
	return ""
}

// ParseEnvironment reads "production" or "development".
func ParseEnvironment(s string) (Environment, bool) {
	switch s {
	case "production":
		return Production, true
	case "development":
		return Development, true
	}
	return 0, false
}

// Device is what a handle holds.
type Device struct {
	Token    []byte // the APNs device token, raw bytes
	Env      Environment
	WakeKey  []byte // WakeKeySize bytes
	IssuedAt time.Time
}

// ExpiresAt is when the handle stops opening.
func (d Device) ExpiresAt() time.Time { return d.IssuedAt.Add(HandleTTL) }

// SealKey is one sealing key and its id.
type SealKey struct {
	ID  byte
	Key []byte // 32 bytes
}

// Keyring holds up to MaxSealKeys sealing keys by id; the last one given seals.
type Keyring struct {
	aeads  map[byte]cipher.AEAD
	newest byte
}

// NewKeyring builds a keyring; keys[len(keys)-1] seals new handles, all of them open.
func NewKeyring(keys []SealKey) (*Keyring, error) {
	if len(keys) == 0 || len(keys) > MaxSealKeys {
		return nil, fmt.Errorf("pushrelay: between 1 and %d sealing keys, got %d", MaxSealKeys, len(keys))
	}
	k := &Keyring{aeads: map[byte]cipher.AEAD{}}
	for _, sk := range keys {
		if _, dup := k.aeads[sk.ID]; dup {
			return nil, fmt.Errorf("pushrelay: sealing key id %d given twice", sk.ID)
		}
		a, err := chacha20poly1305.NewX(sk.Key)
		if err != nil {
			return nil, fmt.Errorf("pushrelay: sealing key %d: %w", sk.ID, err)
		}
		k.aeads[sk.ID] = a
		k.newest = sk.ID
	}
	return k, nil
}

// ParseKeyring reads a sealing-keys file: a JSON array of {"id": 0–255,
// "key": base64url of 32 bytes}, oldest first; the last entry seals.
func ParseKeyring(data []byte) (*Keyring, error) {
	var rows []struct {
		ID  *int   `json:"id"`
		Key string `json:"key"`
	}
	dec := json.NewDecoder(strings.NewReader(string(data)))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&rows); err != nil {
		return nil, fmt.Errorf("pushrelay: sealing keys file: %w", err)
	}
	keys := make([]SealKey, 0, len(rows))
	for i, r := range rows {
		if r.ID == nil || *r.ID < 0 || *r.ID > 255 {
			return nil, fmt.Errorf("pushrelay: sealing key %d: id must be 0 to 255", i)
		}
		b, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(r.Key, "="))
		if err != nil || len(b) != chacha20poly1305.KeySize {
			return nil, fmt.Errorf("pushrelay: sealing key %d: key must be base64url of 32 bytes", *r.ID)
		}
		keys = append(keys, SealKey{ID: byte(*r.ID), Key: b})
	}
	return NewKeyring(keys)
}

func aad(id byte) []byte { return append([]byte(handleAAD), id) }

// Seal turns a device into a handle under the newest key.
func (k *Keyring) Seal(d Device) (string, error) {
	if len(d.Token) == 0 || len(d.Token) > 255 || len(d.WakeKey) != WakeKeySize || d.Env.String() == "" {
		return "", errors.New("pushrelay: device cannot be sealed")
	}
	plain := make([]byte, 0, 1+8+WakeKeySize+1+len(d.Token))
	plain = append(plain, byte(d.Env))
	plain = binary.BigEndian.AppendUint64(plain, uint64(d.IssuedAt.Unix())) // #nosec G115 -- a time after 1970
	plain = append(plain, d.WakeKey...)
	plain = append(plain, byte(len(d.Token)))
	plain = append(plain, d.Token...)
	a := k.aeads[k.newest]
	out := make([]byte, 1+a.NonceSize(), 1+a.NonceSize()+len(plain)+a.Overhead())
	out[0] = k.newest
	if _, err := rand.Read(out[1:]); err != nil {
		return "", err
	}
	out = a.Seal(out, out[1:1+a.NonceSize()], plain, aad(k.newest))
	return handlePrefix + base64.RawURLEncoding.EncodeToString(out), nil
}

// Open reads a handle. It does not check expiry: the caller does, after the
// signature, so an expired handle is told apart only by its own key's holder.
func (k *Keyring) Open(h string) (Device, error) {
	rest, ok := strings.CutPrefix(h, handlePrefix)
	if !ok || len(h) > maxHandleLen {
		return Device{}, ErrHandle
	}
	raw, err := base64.RawURLEncoding.DecodeString(rest)
	if err != nil || len(raw) < 1+chacha20poly1305.NonceSizeX {
		return Device{}, ErrHandle
	}
	a, ok := k.aeads[raw[0]]
	if !ok {
		return Device{}, ErrHandle
	}
	n := a.NonceSize()
	plain, err := a.Open(nil, raw[1:1+n], raw[1+n:], aad(raw[0]))
	if err != nil || len(plain) < 1+8+WakeKeySize+1 {
		return Device{}, ErrHandle
	}
	env := Environment(plain[0])
	issued := int64(binary.BigEndian.Uint64(plain[1:9])) // #nosec G115 -- written by Seal
	key := plain[9 : 9+WakeKeySize]
	tl := int(plain[9+WakeKeySize])
	tok := plain[10+WakeKeySize:]
	if env.String() == "" || tl == 0 || len(tok) != tl {
		return Device{}, ErrHandle
	}
	return Device{Token: tok, Env: env, WakeKey: key, IssuedAt: time.Unix(issued, 0)}, nil
}
