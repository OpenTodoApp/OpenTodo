// Package websign reads and checks the web app's signed file list (OpenSpec
// change signed-web-app): app-manifest.json, an envelope around the exact
// bytes of a manifest that names every file of the built web app with its
// SHA-256, the keys trusted for later updates and the switch from report-only
// to refusal. It holds the verify half only: the server links it for its
// startup line, and `cmd/websign` adds signing from internal/websign/sign,
// which the server never links (TestServerDoesNotLinkSign).
//
// The scheme is ECDSA P-256 with SHA-256 over Domain followed by the payload,
// signatures stored raw (r||s, 64 bytes) as WebCrypto reads them. The web
// app's service worker (web/src/lib/appCode.ts) implements the same checks; the
// shared vectors in testdata/manifest.vectors.json keep the two in step.
package websign

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"strings"
)

const (
	// FileName is the list's path in the built web app and on the server.
	FileName = "app-manifest.json"
	// Domain is signed in front of the payload, so a signature can never be
	// reused as anything else.
	Domain = "opentodo-web-manifest/v1\n"
	// App is the manifest's app name.
	App = "opentodo-web"
	// Format is the envelope's format number.
	Format = 1
	// LoadInstall marks a file the app downloads before it switches versions;
	// LoadLazy one it checks when first used (the map, the task page).
	LoadInstall = "install"
	LoadLazy    = "lazy"
	// BuildPreview marks an unsigned build of main (design D4).
	BuildPreview = "preview"
)

// Envelope is app-manifest.json: the payload's exact bytes and their signatures.
type Envelope struct {
	Format     int         `json:"format"`
	Payload    string      `json:"payload"`
	Signatures []Signature `json:"signatures"`
}

// Signature is one key's signature over Domain+payload.
type Signature struct {
	// Key is the full fingerprint of the signing key.
	Key string `json:"key"`
	// Sig is the raw r||s signature, base64url without padding.
	Sig string `json:"sig"`
}

// Manifest is the signed payload.
type Manifest struct {
	App     string `json:"app"`
	Version string `json:"version"`
	// Build is "preview" for an unsigned build of main, else empty.
	Build string `json:"build,omitempty"`
	// Refuse switches a device from report-only to refusal (design D17).
	Refuse bool            `json:"refuse"`
	Keys   []Key           `json:"keys"`
	Worker Worker          `json:"worker"`
	Files  map[string]File `json:"files"`
}

// Key is one trusted public key.
type Key struct {
	// SPKI is the DER SubjectPublicKeyInfo, standard base64.
	SPKI string `json:"spki"`
	// Role is "release" or "recovery".
	Role string `json:"role"`
}

// Worker names the service worker file and its hash.
type Worker struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
}

// File is one file of the web app.
type File struct {
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
	Load   string `json:"load"`
}

// Errors returned by Verify, one per cause the app reports.
var (
	ErrUnsigned     = errors.New("the list is not signed")
	ErrUnknownKey   = errors.New("no signature is by a trusted key")
	ErrBadSignature = errors.New("a trusted key's signature does not verify")
)

// ParseEnvelope reads app-manifest.json and decodes its payload.
func ParseEnvelope(data []byte) (*Envelope, []byte, error) {
	var env Envelope
	if err := json.Unmarshal(data, &env); err != nil {
		return nil, nil, fmt.Errorf("websign: read the envelope: %w", err)
	}
	if env.Format != Format {
		return nil, nil, fmt.Errorf("websign: envelope format %d, want %d", env.Format, Format)
	}
	payload, err := base64.RawURLEncoding.DecodeString(env.Payload)
	if err != nil {
		return nil, nil, fmt.Errorf("websign: decode the payload: %w", err)
	}
	return &env, payload, nil
}

// ParseManifest reads a payload.
func ParseManifest(payload []byte) (*Manifest, error) {
	var m Manifest
	if err := json.Unmarshal(payload, &m); err != nil {
		return nil, fmt.Errorf("websign: read the manifest: %w", err)
	}
	if m.App != App {
		return nil, fmt.Errorf("websign: app %q, want %q", m.App, App)
	}
	return &m, nil
}

// Message is what a signature covers: Domain followed by the payload.
func Message(payload []byte) []byte {
	return append([]byte(Domain), payload...)
}

// PublicKey decodes a standard-base64 SPKI into a P-256 key and its DER bytes.
func PublicKey(spki string) (*ecdsa.PublicKey, []byte, error) {
	der, err := base64.StdEncoding.DecodeString(spki)
	if err != nil {
		return nil, nil, fmt.Errorf("websign: decode the key: %w", err)
	}
	pub, err := x509.ParsePKIXPublicKey(der)
	if err != nil {
		return nil, nil, fmt.Errorf("websign: parse the key: %w", err)
	}
	ec, ok := pub.(*ecdsa.PublicKey)
	if !ok || ec.Curve != elliptic.P256() {
		return nil, nil, errors.New("websign: the key is not ECDSA P-256")
	}
	return ec, der, nil
}

// Fingerprint is the SHA-256 of a key's DER SubjectPublicKeyInfo, 64 lowercase hex characters.
func Fingerprint(spkiDER []byte) string {
	sum := sha256.Sum256(spkiDER)
	return hex.EncodeToString(sum[:])
}

// ShortFingerprint is the first 16 characters of a fingerprint in upper case,
// in four groups: "3F2A 9C41 7B0D E615". About shows it.
func ShortFingerprint(full string) string {
	if len(full) < 16 {
		return strings.ToUpper(full)
	}
	s := strings.ToUpper(full[:16])
	return s[0:4] + " " + s[4:8] + " " + s[8:12] + " " + s[12:16]
}

// VerifySignature checks one raw r||s signature over Message(payload).
func VerifySignature(pub *ecdsa.PublicKey, payload []byte, sig []byte) bool {
	if len(sig) != 64 {
		return false
	}
	digest := sha256.Sum256(Message(payload))
	r := new(big.Int).SetBytes(sig[:32])
	s := new(big.Int).SetBytes(sig[32:])
	return ecdsa.Verify(pub, digest[:], r, s)
}

// Verify checks the envelope against trusted keys (standard-base64 SPKIs) and
// returns the fingerprint of the first trusted key whose signature verifies.
// The causes match what the app records: ErrUnsigned, ErrUnknownKey (no
// signature names a trusted key) and ErrBadSignature (one names a trusted key
// but does not verify).
func Verify(env *Envelope, payload []byte, trusted []string) (string, error) {
	if len(env.Signatures) == 0 {
		return "", ErrUnsigned
	}
	keys := map[string]*ecdsa.PublicKey{}
	for _, spki := range trusted {
		pub, der, err := PublicKey(spki)
		if err != nil {
			continue
		}
		keys[Fingerprint(der)] = pub
	}
	named := false
	for _, s := range env.Signatures {
		pub, ok := keys[strings.ToLower(s.Key)]
		if !ok {
			continue
		}
		named = true
		sig, err := base64.RawURLEncoding.DecodeString(s.Sig)
		if err != nil {
			continue
		}
		if VerifySignature(pub, payload, sig) {
			return strings.ToLower(s.Key), nil
		}
	}
	if named {
		return "", ErrBadSignature
	}
	return "", ErrUnknownKey
}

// KeySPKIs lists a manifest's keys as standard-base64 SPKIs.
func (m *Manifest) KeySPKIs() []string {
	out := make([]string, 0, len(m.Keys))
	for _, k := range m.Keys {
		out = append(out, k.SPKI)
	}
	return out
}
