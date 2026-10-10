// Package testauth is a synthetic authenticator for tests. It produces the same
// byte structures a browser hands to the server (clientDataJSON, attestation
// object with format "none", authenticator data and assertion signatures) from
// keys generated with the standard library, so ceremonies can be exercised
// end to end without a browser.
package testauth

import (
	"crypto"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"testing"

	"github.com/fxamacker/cbor/v2"
)

// Authenticator holds one credential's private key and state.
type Authenticator struct {
	Alg          int64
	CredentialID []byte
	Counter      uint32
	// Flags added on top of user presence (0x01): 0x04 UV, 0x08 BE, 0x10 BS.
	ExtraFlags byte
	// RPIDHashOverride, when set, replaces sha256(rpID) in authenticator data.
	RPIDHashOverride []byte

	ecKey  *ecdsa.PrivateKey
	edKey  ed25519.PrivateKey
	rsaKey *rsa.PrivateKey
	cose   []byte
}

// New creates an authenticator for the algorithm (-7 ES256, -8 EdDSA, -257 RS256).
func New(t testing.TB, alg int64) *Authenticator {
	t.Helper()
	a := &Authenticator{Alg: alg, CredentialID: randomBytes(t, 32), ExtraFlags: 0x04}
	var err error
	switch alg {
	case -7:
		a.ecKey, err = ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	case -8:
		_, a.edKey, err = ed25519.GenerateKey(rand.Reader)
	case -257:
		a.rsaKey, err = rsa.GenerateKey(rand.Reader, 2048)
	default:
		t.Fatalf("testauth: unsupported alg %d", alg)
	}
	if err != nil {
		t.Fatal(err)
	}
	return a
}

// COSEKey returns the credential public key as a CBOR COSE_Key.
func (a *Authenticator) COSEKey(t testing.TB) []byte {
	t.Helper()
	if a.cose != nil {
		return a.cose
	}
	var m map[int64]any
	switch a.Alg {
	case -7:
		x := make([]byte, 32)
		y := make([]byte, 32)
		a.ecKey.X.FillBytes(x)
		a.ecKey.Y.FillBytes(y)
		m = map[int64]any{1: 2, 3: -7, -1: 1, -2: x, -3: y}
	case -8:
		m = map[int64]any{1: 1, 3: -8, -1: 6, -2: []byte(a.edKey.Public().(ed25519.PublicKey))}
	case -257:
		e := make([]byte, 4)
		binary.BigEndian.PutUint32(e, uint32(a.rsaKey.E))
		m = map[int64]any{1: 3, 3: -257, -1: a.rsaKey.N.Bytes(), -2: e[1:]}
	}
	b, err := cbor.Marshal(m)
	if err != nil {
		t.Fatal(err)
	}
	a.cose = b
	return b
}

// ClientData builds clientDataJSON for the given ceremony type.
func ClientData(t testing.TB, typ string, challenge []byte, origin string) []byte {
	t.Helper()
	b, err := json.Marshal(map[string]any{
		"type":        typ,
		"challenge":   base64.RawURLEncoding.EncodeToString(challenge),
		"origin":      origin,
		"crossOrigin": false,
	})
	if err != nil {
		t.Fatal(err)
	}
	return b
}

// AuthData builds authenticator data; withCredential appends attested credential data.
func (a *Authenticator) AuthData(t testing.TB, rpID string, withCredential bool) []byte {
	t.Helper()
	hash := sha256.Sum256([]byte(rpID))
	out := append([]byte(nil), hash[:]...)
	if a.RPIDHashOverride != nil {
		out = append([]byte(nil), a.RPIDHashOverride...)
	}
	flags := byte(0x01) | a.ExtraFlags
	if withCredential {
		flags |= 0x40
	}
	out = append(out, flags)
	out = binary.BigEndian.AppendUint32(out, a.Counter)
	if withCredential {
		out = append(out, make([]byte, 16)...) // zero AAGUID, as for "none" attestation
		out = binary.BigEndian.AppendUint16(out, uint16(len(a.CredentialID)))
		out = append(out, a.CredentialID...)
		out = append(out, a.COSEKey(t)...)
	}
	return out
}

// AttestationObject builds a "none" attestation object around the authenticator data.
func AttestationObject(t testing.TB, authData []byte) []byte {
	t.Helper()
	b, err := cbor.Marshal(map[string]any{"fmt": "none", "attStmt": map[string]any{}, "authData": authData})
	if err != nil {
		t.Fatal(err)
	}
	return b
}

// Register performs a registration ceremony and returns clientDataJSON and the attestation object.
func (a *Authenticator) Register(t testing.TB, rpID, origin string, challenge []byte) (clientData, attestation []byte) {
	t.Helper()
	clientData = ClientData(t, "webauthn.create", challenge, origin)
	attestation = AttestationObject(t, a.AuthData(t, rpID, true))
	return clientData, attestation
}

// Assert performs an assertion ceremony: it bumps the counter, then signs
// authData || sha256(clientDataJSON).
func (a *Authenticator) Assert(t testing.TB, rpID, origin string, challenge []byte) (clientData, authData, sig []byte) {
	t.Helper()
	a.Counter++
	clientData = ClientData(t, "webauthn.get", challenge, origin)
	authData = a.AuthData(t, rpID, false)
	sig = a.Sign(t, authData, clientData)
	return clientData, authData, sig
}

// Sign produces the assertion signature for the given authData and clientDataJSON.
func (a *Authenticator) Sign(t testing.TB, authData, clientData []byte) []byte {
	t.Helper()
	cdHash := sha256.Sum256(clientData)
	signed := append(append([]byte(nil), authData...), cdHash[:]...)
	var sig []byte
	var err error
	switch a.Alg {
	case -7:
		h := sha256.Sum256(signed)
		sig, err = ecdsa.SignASN1(rand.Reader, a.ecKey, h[:])
	case -8:
		sig = ed25519.Sign(a.edKey, signed)
	case -257:
		h := sha256.Sum256(signed)
		sig, err = rsa.SignPKCS1v15(rand.Reader, a.rsaKey, crypto.SHA256, h[:])
	}
	if err != nil {
		t.Fatal(err)
	}
	return sig
}

func randomBytes(t testing.TB, n int) []byte {
	t.Helper()
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		t.Fatal(err)
	}
	return b
}
