package webauthn_test

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/rsa"
	"errors"
	"testing"
	"unicode/utf8"

	"github.com/pixari/opentodo/internal/webauthn"
	"github.com/pixari/opentodo/internal/webauthn/testauth"
)

// Fuzz targets for the passkey parsers (wave 2 of the 2026-10 audit, Z1): every
// byte here comes from a browser before anyone is signed in. Each target asserts
// no panic plus the invariants the verifier relies on. Run one with
//
//	go test ./internal/webauthn -run '^$' -fuzz FuzzParseAuthData -fuzztime 1m

// seedCeremonies adds one real registration and assertion per algorithm.
func seedCeremonies(f *testing.F, add func(cd, authData, att, cose []byte)) {
	challenge := bytes.Repeat([]byte{9}, 32)
	for _, tc := range algorithms {
		a := testauth.New(f, tc.alg)
		cd, att := a.Register(f, rp.ID, rp.Origin, challenge)
		add(cd, a.AuthData(f, rp.ID, true), att, a.COSEKey(f))
		acd, aad, _ := a.Assert(f, rp.ID, rp.Origin, challenge)
		add(acd, aad, nil, nil)
	}
}

func FuzzParseClientData(f *testing.F) {
	seedCeremonies(f, func(cd, _, _, _ []byte) { f.Add(cd) })
	f.Add([]byte(`{"type":"webauthn.get","challenge":"AA","origin":"https://x","type":"webauthn.create"}`))
	f.Add([]byte(`{"type":"","challenge":null}`))
	f.Fuzz(func(t *testing.T, raw []byte) {
		cd, err := webauthn.ParseClientData(raw)
		if err != nil {
			if !errors.Is(err, webauthn.ErrMalformed) {
				t.Fatalf("error %v is not ErrMalformed", err)
			}
			return
		}
		if cd.Type == "" || cd.Challenge == "" || cd.Origin == "" {
			t.Fatalf("accepted client data without type, challenge or origin: %+v", cd)
		}
		if _, err := cd.ChallengeBytes(); err != nil && !errors.Is(err, webauthn.ErrMalformed) {
			t.Fatalf("challenge error %v is not ErrMalformed", err)
		}
	})
}

func FuzzParseAuthData(f *testing.F) {
	seedCeremonies(f, func(_, ad, _, _ []byte) { f.Add(ad) })
	f.Add(make([]byte, 37))
	f.Add(append(make([]byte, 32), 0x41, 0, 0, 0, 1))
	f.Fuzz(func(t *testing.T, b []byte) {
		a, err := webauthn.ParseAuthData(b)
		if err != nil {
			if !errors.Is(err, webauthn.ErrMalformed) {
				t.Fatalf("error %v is not ErrMalformed", err)
			}
			return
		}
		if len(b) < 37 {
			t.Fatalf("accepted %d bytes, shorter than the fixed header", len(b))
		}
		if !bytes.Equal(a.RPIDHash[:], b[:32]) || a.Flags != b[32] {
			t.Fatal("header fields do not come from the header bytes")
		}
		if a.HasCredential() {
			if n := len(a.CredentialID); n == 0 || n > 1023 {
				t.Fatalf("credential id length %d accepted", n)
			}
			if len(a.PublicKey) == 0 {
				t.Fatal("attested credential without a public key")
			}
			// The id and the key are copies of consecutive input bytes.
			at := 37 + 18
			if !bytes.Equal(b[at:at+len(a.CredentialID)], a.CredentialID) ||
				!bytes.Equal(b[at+len(a.CredentialID):at+len(a.CredentialID)+len(a.PublicKey)], a.PublicKey) {
				t.Fatal("credential id or key is not the input's bytes")
			}
		} else if a.CredentialID != nil || a.PublicKey != nil {
			t.Fatal("credential fields set without the attested-credential flag")
		}
	})
}

func FuzzParseAttestationObject(f *testing.F) {
	seedCeremonies(f, func(_, _, att, _ []byte) {
		if att != nil {
			f.Add(att)
		}
	})
	f.Add([]byte{0xa0})
	f.Fuzz(func(t *testing.T, b []byte) {
		att, err := webauthn.ParseAttestationObject(b)
		if err != nil {
			if !errors.Is(err, webauthn.ErrMalformed) {
				t.Fatalf("error %v is not ErrMalformed", err)
			}
			return
		}
		if att.Format == "" || len(att.AuthData) == 0 {
			t.Fatalf("accepted an attestation object without fmt or authData: %+v", att)
		}
		if !utf8.ValidString(att.Format) {
			t.Fatalf("fmt %q is not UTF-8", att.Format)
		}
	})
}

func FuzzParseCOSEKey(f *testing.F) {
	seedCeremonies(f, func(_, _, _, cose []byte) {
		if cose != nil {
			f.Add(cose)
		}
	})
	f.Add([]byte{0xa1, 0x01, 0x02})
	f.Fuzz(func(t *testing.T, raw []byte) {
		pub, alg, err := webauthn.ParseCOSEKey(raw)
		if err != nil {
			if !errors.Is(err, webauthn.ErrMalformed) && !errors.Is(err, webauthn.ErrUnsupportedAlgorithm) {
				t.Fatalf("error %v is neither ErrMalformed nor ErrUnsupportedAlgorithm", err)
			}
			return
		}
		// The key type matches the algorithm the verifier will dispatch on.
		switch k := pub.(type) {
		case *ecdsa.PublicKey:
			if alg != webauthn.AlgES256 || !k.Curve.IsOnCurve(k.X, k.Y) { //nolint:staticcheck // the check under test
				t.Fatalf("ECDSA key with alg %d or off the curve", alg)
			}
		case ed25519.PublicKey:
			if alg != webauthn.AlgEdDSA || len(k) != ed25519.PublicKeySize {
				t.Fatalf("Ed25519 key with alg %d, %d bytes", alg, len(k))
			}
		case *rsa.PublicKey:
			if alg != webauthn.AlgRS256 || k.N.BitLen() < 2041 || k.E < 3 {
				t.Fatalf("RSA key with alg %d, %d bits, e=%d", alg, k.N.BitLen(), k.E)
			}
		default:
			t.Fatalf("unexpected key type %T", pub)
		}
	})
}

// FuzzVerifyAssertion: with one fixed credential, no mutation of a genuine
// assertion verifies except the genuine bytes themselves.
func FuzzVerifyAssertion(f *testing.F) {
	a := testauth.New(f, webauthn.AlgES256)
	challenge := bytes.Repeat([]byte{5}, 32)
	cd, ad, sig := a.Assert(f, rp.ID, rp.Origin, challenge)
	key := a.COSEKey(f)
	f.Add(cd, ad, sig)
	f.Add(cd, ad, []byte{})
	f.Fuzz(func(t *testing.T, gotCD, gotAD, gotSig []byte) {
		_, err := rp.VerifyAssertion(webauthn.AssertionResponse{ClientDataJSON: gotCD, AuthenticatorData: gotAD, Signature: gotSig}, challenge, key, webauthn.AlgES256)
		if err == nil && (!bytes.Equal(gotCD, cd) || !bytes.Equal(gotAD, ad)) {
			t.Fatalf("a changed assertion verified:\ncd %q\nad %x", gotCD, gotAD)
		}
	})
}
