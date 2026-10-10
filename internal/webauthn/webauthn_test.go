package webauthn_test

import (
	"bytes"
	"crypto/sha256"
	"errors"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/webauthn"
	"github.com/pixari/opentodo/internal/webauthn/testauth"
)

var rp = webauthn.RelyingParty{ID: "todo.example.com", Origin: "https://todo.example.com"}

// Each entry stands in for a recorded ceremony from a different authenticator
// family: ES256 is what platform passkeys (Apple, Google, Windows Hello) use,
// EdDSA is what some security keys offer, RS256 is the Windows Hello TPM path.
var algorithms = []struct {
	name string
	alg  int64
}{
	{"ES256", webauthn.AlgES256},
	{"EdDSA", webauthn.AlgEdDSA},
	{"RS256", webauthn.AlgRS256},
}

func TestVerifyRegistrationFromRecordedCeremony(t *testing.T) {
	for _, tc := range algorithms {
		t.Run(tc.name, func(t *testing.T) {
			a := testauth.New(t, tc.alg)
			a.ExtraFlags = 0x04 | 0x08 | 0x10 // UV, BE, BS: a synced passkey
			challenge := bytes.Repeat([]byte{7}, 32)
			cd, att := a.Register(t, rp.ID, rp.Origin, challenge)
			cred, err := rp.VerifyRegistration(webauthn.RegistrationResponse{ClientDataJSON: cd, AttestationObject: att, Transports: []string{"internal"}}, challenge)
			if err != nil {
				t.Fatal(err)
			}
			if !bytes.Equal(cred.ID, a.CredentialID) || cred.Alg != tc.alg || !cred.BackedUp || !cred.BackupEligible || !cred.UserVerified {
				t.Fatalf("credential = %+v", cred)
			}
			if !bytes.Equal(cred.PublicKey, a.COSEKey(t)) {
				t.Fatal("stored COSE key differs from the authenticator's")
			}
			if _, alg, err := webauthn.ParseCOSEKey(cred.PublicKey); err != nil || alg != tc.alg {
				t.Fatalf("stored key does not parse: %v", err)
			}
		})
	}
}

func TestVerifyRegistrationRejectsMismatches(t *testing.T) {
	a := testauth.New(t, webauthn.AlgES256)
	challenge := bytes.Repeat([]byte{1}, 32)
	cases := []struct {
		name    string
		resp    func() webauthn.RegistrationResponse
		chal    []byte
		wantErr error
	}{
		{"wrong challenge", func() webauthn.RegistrationResponse {
			cd, att := a.Register(t, rp.ID, rp.Origin, challenge)
			return webauthn.RegistrationResponse{ClientDataJSON: cd, AttestationObject: att}
		}, bytes.Repeat([]byte{2}, 32), webauthn.ErrChallengeMismatch},
		{"wrong origin", func() webauthn.RegistrationResponse {
			cd, att := a.Register(t, rp.ID, "https://evil.example", challenge)
			return webauthn.RegistrationResponse{ClientDataJSON: cd, AttestationObject: att}
		}, challenge, webauthn.ErrOriginMismatch},
		{"wrong rp id", func() webauthn.RegistrationResponse {
			cd, att := a.Register(t, "other.example.com", rp.Origin, challenge)
			return webauthn.RegistrationResponse{ClientDataJSON: cd, AttestationObject: att}
		}, challenge, webauthn.ErrRPIDMismatch},
		{"assertion type used for registration", func() webauthn.RegistrationResponse {
			cd := testauth.ClientData(t, "webauthn.get", challenge, rp.Origin)
			att := testauth.AttestationObject(t, a.AuthData(t, rp.ID, true))
			return webauthn.RegistrationResponse{ClientDataJSON: cd, AttestationObject: att}
		}, challenge, webauthn.ErrMalformed},
		{"no credential data", func() webauthn.RegistrationResponse {
			cd := testauth.ClientData(t, "webauthn.create", challenge, rp.Origin)
			att := testauth.AttestationObject(t, a.AuthData(t, rp.ID, false))
			return webauthn.RegistrationResponse{ClientDataJSON: cd, AttestationObject: att}
		}, challenge, webauthn.ErrMalformed},
		{"garbage attestation", func() webauthn.RegistrationResponse {
			cd := testauth.ClientData(t, "webauthn.create", challenge, rp.Origin)
			return webauthn.RegistrationResponse{ClientDataJSON: cd, AttestationObject: []byte{0xff, 0x00, 0x01}}
		}, challenge, webauthn.ErrMalformed},
		{"garbage client data", func() webauthn.RegistrationResponse {
			att := testauth.AttestationObject(t, a.AuthData(t, rp.ID, true))
			return webauthn.RegistrationResponse{ClientDataJSON: []byte("{"), AttestationObject: att}
		}, challenge, webauthn.ErrMalformed},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := rp.VerifyRegistration(tc.resp(), tc.chal)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("err = %v, want %v", err, tc.wantErr)
			}
		})
	}
}

func TestVerifyAssertionFromRecordedCeremony(t *testing.T) {
	for _, tc := range algorithms {
		t.Run(tc.name, func(t *testing.T) {
			a := testauth.New(t, tc.alg)
			a.Counter = 41
			challenge := bytes.Repeat([]byte{9}, 32)
			cd, ad, sig := a.Assert(t, rp.ID, rp.Origin, challenge)
			res, err := rp.VerifyAssertion(webauthn.AssertionResponse{ClientDataJSON: cd, AuthenticatorData: ad, Signature: sig}, challenge, a.COSEKey(t), tc.alg)
			if err != nil {
				t.Fatal(err)
			}
			if res.Counter != 42 || !res.UserVerified {
				t.Fatalf("result = %+v", res)
			}

			// A different key, a tampered signature and a tampered authData all fail.
			other := testauth.New(t, tc.alg)
			if _, err := rp.VerifyAssertion(webauthn.AssertionResponse{ClientDataJSON: cd, AuthenticatorData: ad, Signature: sig}, challenge, other.COSEKey(t), tc.alg); !errors.Is(err, webauthn.ErrBadSignature) {
				t.Fatalf("other key: err = %v", err)
			}
			bad := append([]byte(nil), sig...)
			bad[len(bad)-1] ^= 0x01
			if _, err := rp.VerifyAssertion(webauthn.AssertionResponse{ClientDataJSON: cd, AuthenticatorData: ad, Signature: bad}, challenge, a.COSEKey(t), tc.alg); !errors.Is(err, webauthn.ErrBadSignature) {
				t.Fatalf("tampered sig: err = %v", err)
			}
			ad2 := append([]byte(nil), ad...)
			ad2[36]++ // counter
			if _, err := rp.VerifyAssertion(webauthn.AssertionResponse{ClientDataJSON: cd, AuthenticatorData: ad2, Signature: sig}, challenge, a.COSEKey(t), tc.alg); !errors.Is(err, webauthn.ErrBadSignature) {
				t.Fatalf("tampered authData: err = %v", err)
			}
			// Algorithm confusion: the stored alg must match the key.
			if _, err := rp.VerifyAssertion(webauthn.AssertionResponse{ClientDataJSON: cd, AuthenticatorData: ad, Signature: sig}, challenge, a.COSEKey(t), tc.alg+1); !errors.Is(err, webauthn.ErrUnsupportedAlgorithm) {
				t.Fatalf("alg confusion: err = %v", err)
			}
		})
	}
}

func TestVerifyAssertionRejectsMismatches(t *testing.T) {
	a := testauth.New(t, webauthn.AlgES256)
	key := a.COSEKey(t)
	challenge := bytes.Repeat([]byte{3}, 32)

	cd, ad, sig := a.Assert(t, rp.ID, rp.Origin, challenge)
	if _, err := rp.VerifyAssertion(webauthn.AssertionResponse{ClientDataJSON: cd, AuthenticatorData: ad, Signature: sig}, bytes.Repeat([]byte{4}, 32), key, a.Alg); !errors.Is(err, webauthn.ErrChallengeMismatch) {
		t.Fatalf("challenge: %v", err)
	}
	cd, ad, sig = a.Assert(t, rp.ID, "http://todo.example.com", challenge)
	if _, err := rp.VerifyAssertion(webauthn.AssertionResponse{ClientDataJSON: cd, AuthenticatorData: ad, Signature: sig}, challenge, key, a.Alg); !errors.Is(err, webauthn.ErrOriginMismatch) {
		t.Fatalf("origin: %v", err)
	}
	cd, ad, sig = a.Assert(t, "evil.example", rp.Origin, challenge)
	if _, err := rp.VerifyAssertion(webauthn.AssertionResponse{ClientDataJSON: cd, AuthenticatorData: ad, Signature: sig}, challenge, key, a.Alg); !errors.Is(err, webauthn.ErrRPIDMismatch) {
		t.Fatalf("rp id: %v", err)
	}
	// User presence flag cleared (signature recomputed so only the flag is at fault).
	cd = testauth.ClientData(t, "webauthn.get", challenge, rp.Origin)
	ad = a.AuthData(t, rp.ID, false)
	ad[32] &^= 0x01
	sig = a.Sign(t, ad, cd)
	if _, err := rp.VerifyAssertion(webauthn.AssertionResponse{ClientDataJSON: cd, AuthenticatorData: ad, Signature: sig}, challenge, key, a.Alg); !errors.Is(err, webauthn.ErrUserNotPresent) {
		t.Fatalf("user presence: %v", err)
	}
	// Registration-type client data is not an assertion.
	cd = testauth.ClientData(t, "webauthn.create", challenge, rp.Origin)
	ad = a.AuthData(t, rp.ID, false)
	sig = a.Sign(t, ad, cd)
	if _, err := rp.VerifyAssertion(webauthn.AssertionResponse{ClientDataJSON: cd, AuthenticatorData: ad, Signature: sig}, challenge, key, a.Alg); !errors.Is(err, webauthn.ErrMalformed) {
		t.Fatalf("type: %v", err)
	}
	if _, err := rp.VerifyAssertion(webauthn.AssertionResponse{ClientDataJSON: cd, AuthenticatorData: ad[:10], Signature: sig}, challenge, key, a.Alg); !errors.Is(err, webauthn.ErrMalformed) {
		t.Fatalf("short authData: %v", err)
	}
}

func TestParseAuthDataAndCOSEKey(t *testing.T) {
	a := testauth.New(t, webauthn.AlgES256)
	a.Counter = 5
	ad, err := webauthn.ParseAuthData(a.AuthData(t, rp.ID, true))
	if err != nil {
		t.Fatal(err)
	}
	want := sha256.Sum256([]byte(rp.ID))
	if ad.RPIDHash != want || ad.Counter != 5 || !ad.HasCredential() || !bytes.Equal(ad.CredentialID, a.CredentialID) {
		t.Fatalf("authData = %+v", ad)
	}
	// Trailing bytes without the extension flag are refused.
	raw := append(a.AuthData(t, rp.ID, true), 0xa0)
	if _, err := webauthn.ParseAuthData(raw); !errors.Is(err, webauthn.ErrMalformed) {
		t.Fatalf("trailing: %v", err)
	}
	// Unsupported algorithms and curves are refused with a clear error.
	for _, bad := range [][]byte{
		{0xa2, 0x01, 0x02, 0x03, 0x27}, // kty 2 (EC) with alg -8 (EdDSA): wrong family
		{0xa1, 0x01, 0x02},             // no alg
		{0x01},                         // not a map
	} {
		if _, _, err := webauthn.ParseCOSEKey(bad); err == nil {
			t.Fatalf("accepted bad COSE key %x", bad)
		}
	}
}

func TestChallengeExpiresAndIsSingleUse(t *testing.T) {
	now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	c := webauthn.NewChallenges(webauthn.ChallengeTTL)
	webauthn.SetNow(c, func() time.Time { return now })

	ch := c.Issue("user-1")
	if len(ch) != 32 {
		t.Fatalf("challenge length %d", len(ch))
	}
	// Wrong user burns the challenge.
	if c.Consume(ch, "user-2") {
		t.Fatal("challenge accepted for another user")
	}
	if c.Consume(ch, "user-1") {
		t.Fatal("challenge usable after a failed attempt")
	}

	ch = c.Issue("user-1")
	if !c.Consume(ch, "user-1") {
		t.Fatal("fresh challenge refused")
	}
	if c.Consume(ch, "user-1") {
		t.Fatal("challenge accepted twice")
	}

	login := c.Issue("")
	if c.Consume(login, "user-1") {
		t.Fatal("sign-in challenge accepted for a registration")
	}

	ch = c.Issue("user-1")
	now = now.Add(webauthn.ChallengeTTL + time.Second)
	if c.Consume(ch, "user-1") {
		t.Fatal("expired challenge accepted")
	}
	// Issuing sweeps expired entries.
	stale := c.Issue("user-1")
	now = now.Add(webauthn.ChallengeTTL + time.Second)
	c.Issue("user-1")
	if c.Len() != 1 {
		t.Fatalf("outstanding = %d, want 1 (stale swept)", c.Len())
	}
	if c.Consume(stale, "user-1") {
		t.Fatal("swept challenge accepted")
	}
	if ch := c.Issue("x"); !c.Consume(ch, "x") || c.Consume(ch, "x") {
		t.Fatal("single use violated")
	}
}

func TestBase64URL(t *testing.T) {
	in := []byte{0xfb, 0xff, 0x00, 0x7e}
	enc := webauthn.EncodeBase64URL(in)
	if enc != "-_8Afg" {
		t.Fatalf("enc = %q", enc)
	}
	for _, s := range []string{"-_8Afg", "-_8Afg=="} {
		out, err := webauthn.DecodeBase64URL(s)
		if err != nil || !bytes.Equal(out, in) {
			t.Fatalf("decode %q = %x, %v", s, out, err)
		}
	}
	if _, err := webauthn.DecodeBase64URL("not base64!"); err == nil {
		t.Fatal("accepted invalid base64url")
	}
}
