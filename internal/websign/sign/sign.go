// Package sign creates and uses the web app's signing keys (OpenSpec change
// signed-web-app). Only `cmd/websign` links it: the server never holds or
// uses a private key, and TestServerDoesNotLinkSign keeps it that way.
package sign

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io/fs"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/websign"
)

// GenerateKey makes a new P-256 key pair.
func GenerateKey() (*ecdsa.PrivateKey, error) {
	return ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
}

// MarshalPrivateKey encodes a key as a PKCS #8 PEM block.
func MarshalPrivateKey(k *ecdsa.PrivateKey) ([]byte, error) {
	der, err := x509.MarshalPKCS8PrivateKey(k)
	if err != nil {
		return nil, err
	}
	return pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}), nil
}

// ParsePrivateKey reads a PKCS #8 (or SEC 1) PEM P-256 private key.
func ParsePrivateKey(data []byte) (*ecdsa.PrivateKey, error) {
	block, _ := pem.Decode(data)
	if block == nil {
		return nil, errors.New("sign: no PEM block in the key file")
	}
	var key any
	var err error
	switch block.Type {
	case "PRIVATE KEY":
		key, err = x509.ParsePKCS8PrivateKey(block.Bytes)
	case "EC PRIVATE KEY":
		key, err = x509.ParseECPrivateKey(block.Bytes)
	default:
		return nil, fmt.Errorf("sign: unexpected PEM block %q", block.Type)
	}
	if err != nil {
		return nil, fmt.Errorf("sign: parse the key: %w", err)
	}
	ec, ok := key.(*ecdsa.PrivateKey)
	if !ok || ec.Curve != elliptic.P256() {
		return nil, errors.New("sign: the key is not ECDSA P-256")
	}
	return ec, nil
}

// SPKI returns a key's public half as standard-base64 DER SubjectPublicKeyInfo.
func SPKI(k *ecdsa.PrivateKey) (string, error) {
	der, err := x509.MarshalPKIXPublicKey(&k.PublicKey)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(der), nil
}

// Fingerprint is the full fingerprint of a key's public half.
func Fingerprint(k *ecdsa.PrivateKey) (string, error) {
	der, err := x509.MarshalPKIXPublicKey(&k.PublicKey)
	if err != nil {
		return "", err
	}
	return websign.Fingerprint(der), nil
}

// SignPayload signs Domain+payload and returns the raw r||s signature. Go's
// ECDSA signing hedges its nonces, so a weak random source does not leak the key.
func SignPayload(k *ecdsa.PrivateKey, payload []byte) ([]byte, error) {
	digest := sha256.Sum256(websign.Message(payload))
	r, s, err := ecdsa.Sign(rand.Reader, k, digest[:])
	if err != nil {
		return nil, err
	}
	sig := make([]byte, 64)
	r.FillBytes(sig[:32])
	s.FillBytes(sig[32:])
	return sig, nil
}

// Options for Dist.
type Options struct {
	// Version, when set, must equal the manifest's version (a release tag
	// without its "v").
	Version string
}

// Dist signs a built web app's app-manifest.json in place with every key.
// It refuses when a file differs from the list, the version is not a
// semantic version or not the one asked for, or a key is not one of the
// keys the list names (devices would not trust it). Signatures already in
// the envelope by other keys stay, so a rotation can sign with two keys in
// two runs.
func Dist(fsys fs.FS, envelope []byte, keys []*ecdsa.PrivateKey, o Options) ([]byte, error) {
	env, payload, err := websign.ParseEnvelope(envelope)
	if err != nil {
		return nil, err
	}
	m, err := websign.ParseManifest(payload)
	if err != nil {
		return nil, err
	}
	if !websign.ValidVersion(m.Version) {
		return nil, fmt.Errorf("sign: version %q is not a semantic version", m.Version)
	}
	if o.Version != "" && strings.TrimPrefix(o.Version, "v") != m.Version {
		return nil, fmt.Errorf("sign: the list is version %s, the release is %s", m.Version, o.Version)
	}
	if m.Build != "" {
		return nil, fmt.Errorf("sign: a %s build is never signed", m.Build)
	}
	problems, err := websign.CheckFS(fsys, m)
	if err != nil {
		return nil, err
	}
	if len(problems) > 0 {
		var b strings.Builder
		for _, p := range problems {
			b.WriteString("\n  " + p.String())
		}
		return nil, fmt.Errorf("sign: the files do not match the list:%s", b.String())
	}
	listed := map[string]bool{}
	for _, spki := range m.KeySPKIs() {
		listed[spki] = true
	}
	for _, k := range keys {
		spki, err := SPKI(k)
		if err != nil {
			return nil, err
		}
		fp, _ := Fingerprint(k)
		if !listed[spki] {
			return nil, fmt.Errorf("sign: key %s is not in the list's keys; add its public key to web/release-keys.json (or build with WEB_SIGNING_KEY)", websign.ShortFingerprint(fp))
		}
		sig, err := SignPayload(k, payload)
		if err != nil {
			return nil, err
		}
		kept := env.Signatures[:0]
		for _, s := range env.Signatures {
			if !strings.EqualFold(s.Key, fp) {
				kept = append(kept, s)
			}
		}
		env.Signatures = append(kept, websign.Signature{Key: fp, Sig: base64.RawURLEncoding.EncodeToString(sig)})
	}
	return Marshal(env)
}

// Marshal writes an envelope as the build does: two-space indented JSON with a final newline.
func Marshal(env *websign.Envelope) ([]byte, error) {
	if env.Signatures == nil {
		env.Signatures = []websign.Signature{}
	}
	out, err := json.MarshalIndent(env, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(out, '\n'), nil
}
