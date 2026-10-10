// Package push implements Web Push for reminders (OpenSpec change `reminders`)
// with the Go standard library only: VAPID application-server keys and JWTs
// (RFC 8292), aes128gcm message encryption (RFC 8188, RFC 8291), per-device
// subscriptions and the scheduler that pushes due reminders.
package push

import (
	"crypto/ecdh"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

// KeyFile is the VAPID key pair's file name inside the data directory. It sits
// next to the database (not under secrets/) so a copy of the data directory, and
// a backup archive, carries it: subscriptions are bound to the public key.
const KeyFile = "push_vapid.pem"

// Keys is the server's VAPID key pair.
type Keys struct {
	priv *ecdsa.PrivateKey
	// pub is the uncompressed P-256 point (65 bytes), the applicationServerKey.
	pub []byte
}

// PublicKey returns the base64url (unpadded) uncompressed public key that
// browsers pass to pushManager.subscribe as applicationServerKey.
func (k *Keys) PublicKey() string { return base64.RawURLEncoding.EncodeToString(k.pub) }

// KeyPath is <dataDir>/push_vapid.pem.
func KeyPath(dataDir string) string { return filepath.Join(dataDir, KeyFile) }

// LoadOrCreateKeys reads the key pair from <dataDir>/push_vapid.pem, generating
// and storing it (mode 0600, written atomically) when the file does not exist.
func LoadOrCreateKeys(dataDir string) (*Keys, error) {
	path := KeyPath(dataDir)
	raw, err := os.ReadFile(path)
	if err == nil {
		return parseKeys(raw)
	}
	if !errors.Is(err, fs.ErrNotExist) {
		return nil, fmt.Errorf("read push key: %w", err)
	}
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("generate push key: %w", err)
	}
	der, err := x509.MarshalECPrivateKey(priv)
	if err != nil {
		return nil, fmt.Errorf("encode push key: %w", err)
	}
	data := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: der})
	if err := os.MkdirAll(dataDir, 0o750); err != nil {
		return nil, err
	}
	tmp, err := os.CreateTemp(dataDir, ".push_vapid-*.pem")
	if err != nil {
		return nil, fmt.Errorf("store push key: %w", err)
	}
	defer os.Remove(tmp.Name())
	if err := tmp.Chmod(0o600); err != nil {
		tmp.Close()
		return nil, err
	}
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return nil, err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return nil, err
	}
	if err := tmp.Close(); err != nil {
		return nil, err
	}
	// Link rather than rename: if another process created the file meanwhile, keep theirs.
	if err := os.Link(tmp.Name(), path); err != nil {
		if errors.Is(err, fs.ErrExist) {
			return LoadOrCreateKeys(dataDir)
		}
		if err := os.Rename(tmp.Name(), path); err != nil {
			return nil, fmt.Errorf("store push key: %w", err)
		}
	}
	return newKeys(priv)
}

func parseKeys(raw []byte) (*Keys, error) {
	block, _ := pem.Decode(raw)
	if block == nil {
		return nil, errors.New("push key: no PEM block")
	}
	var priv *ecdsa.PrivateKey
	switch block.Type {
	case "EC PRIVATE KEY":
		k, err := x509.ParseECPrivateKey(block.Bytes)
		if err != nil {
			return nil, fmt.Errorf("push key: %w", err)
		}
		priv = k
	case "PRIVATE KEY":
		k, err := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err != nil {
			return nil, fmt.Errorf("push key: %w", err)
		}
		ek, ok := k.(*ecdsa.PrivateKey)
		if !ok {
			return nil, errors.New("push key: not an EC key")
		}
		priv = ek
	default:
		return nil, fmt.Errorf("push key: unexpected PEM type %q", block.Type)
	}
	if priv.Curve != elliptic.P256() {
		return nil, errors.New("push key: not a P-256 key")
	}
	return newKeys(priv)
}

func newKeys(priv *ecdsa.PrivateKey) (*Keys, error) {
	pub, err := priv.PublicKey.ECDH()
	if err != nil {
		return nil, fmt.Errorf("push key: %w", err)
	}
	return &Keys{priv: priv, pub: pub.Bytes()}, nil
}

// ecdhKey converts a raw private scalar into an ECDH key (used for the
// per-message ephemeral key and in tests for the RFC vectors).
func ecdhKey(scalar []byte) (*ecdh.PrivateKey, error) { return ecdh.P256().NewPrivateKey(scalar) }
