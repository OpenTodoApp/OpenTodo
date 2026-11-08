package websign_test

import (
	"crypto/ecdsa"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/websign"
	"github.com/OpenTodoApp/opentodo/internal/websign/sign"
)

// The shared vectors (docs/contracts.md): envelopes with the trusted keys and
// the expected signer or cause, version orderings and fingerprints. The
// worker's tests read the same file (web/src/lib/appCode.test.ts). ECDSA
// signatures are randomized, so the file is written once and committed:
//
//	UPDATE_WEBSIGN_VECTORS=1 go test ./internal/websign -run TestVectors
const vectorsFile = "testdata/manifest.vectors.json"

type vectorKey struct {
	SPKI        string `json:"spki"`
	Fingerprint string `json:"fingerprint"`
	Short       string `json:"short"`
}

type envelopeCase struct {
	Name     string           `json:"name"`
	Envelope websign.Envelope `json:"envelope"`
	// Trusted names keys of the key table.
	Trusted []string `json:"trusted"`
	// Signer names the key expected to verify, or is empty.
	Signer string `json:"signer"`
	// Error is "", "unsigned", "unknown-key", "bad-signature" or "invalid".
	Error string `json:"error"`
}

type vectors struct {
	Comment   string               `json:"$comment"`
	Domain    string               `json:"domain"`
	Keys      map[string]vectorKey `json:"keys"`
	Envelopes []envelopeCase       `json:"envelopes"`
	Versions  []struct {
		A   string `json:"a"`
		B   string `json:"b"`
		Cmp int    `json:"cmp"`
	} `json:"versions"`
}

func readKeyFile(t *testing.T, name string) *ecdsa.PrivateKey {
	t.Helper()
	data, err := os.ReadFile(name)
	if err != nil {
		t.Fatal(err)
	}
	k, err := sign.ParsePrivateKey(data)
	if err != nil {
		t.Fatal(err)
	}
	return k
}

func TestVectors(t *testing.T) {
	if os.Getenv("UPDATE_WEBSIGN_VECTORS") == "1" {
		writeVectors(t)
	}
	data, err := os.ReadFile(vectorsFile)
	if err != nil {
		t.Fatal(err)
	}
	var v vectors
	if err := json.Unmarshal(data, &v); err != nil {
		t.Fatal(err)
	}
	if v.Domain != websign.Domain {
		t.Fatalf("domain %q, want %q", v.Domain, websign.Domain)
	}
	for name, k := range v.Keys {
		_, der, err := websign.PublicKey(k.SPKI)
		if err != nil {
			t.Fatalf("key %s: %v", name, err)
		}
		if got := websign.Fingerprint(der); got != k.Fingerprint {
			t.Errorf("key %s: fingerprint %s, want %s", name, got, k.Fingerprint)
		}
		if got := websign.ShortFingerprint(k.Fingerprint); got != k.Short {
			t.Errorf("key %s: short %s, want %s", name, got, k.Short)
		}
	}
	if len(v.Envelopes) < 8 {
		t.Fatalf("only %d envelope cases", len(v.Envelopes))
	}
	for _, c := range v.Envelopes {
		var trusted []string
		for _, n := range c.Trusted {
			trusted = append(trusted, v.Keys[n].SPKI)
		}
		raw, _ := json.Marshal(c.Envelope)
		env, payload, err := websign.ParseEnvelope(raw)
		var gotErr, gotSigner string
		if err == nil {
			if _, err = websign.ParseManifest(payload); err == nil {
				gotSigner, err = websign.Verify(env, payload, trusted)
			}
		}
		switch {
		case err == nil:
		case errors.Is(err, websign.ErrUnsigned):
			gotErr = "unsigned"
		case errors.Is(err, websign.ErrUnknownKey):
			gotErr = "unknown-key"
		case errors.Is(err, websign.ErrBadSignature):
			gotErr = "bad-signature"
		default:
			gotErr = "invalid"
		}
		wantSigner := ""
		if c.Signer != "" {
			wantSigner = v.Keys[c.Signer].Fingerprint
		}
		if gotErr != c.Error || gotSigner != wantSigner {
			t.Errorf("%s: got signer %q error %q, want signer %q error %q", c.Name, gotSigner, gotErr, wantSigner, c.Error)
		}
	}
	if len(v.Versions) < 10 {
		t.Fatalf("only %d version cases", len(v.Versions))
	}
	for _, c := range v.Versions {
		if got := websign.CompareVersions(c.A, c.B); got != c.Cmp {
			t.Errorf("CompareVersions(%q, %q) = %d, want %d", c.A, c.B, got, c.Cmp)
		}
		if got := websign.CompareVersions(c.B, c.A); got != -c.Cmp {
			t.Errorf("CompareVersions(%q, %q) = %d, want %d", c.B, c.A, got, -c.Cmp)
		}
	}
}

// writeVectors makes the vectors from the two test keys in testdata and one
// key generated on the spot (the unknown key).
func writeVectors(t *testing.T) {
	release := readKeyFile(t, "testdata/test-key.pem")
	recovery := readKeyFile(t, "testdata/test-recovery-key.pem")
	unknown, err := sign.GenerateKey()
	if err != nil {
		t.Fatal(err)
	}
	keys := map[string]*ecdsa.PrivateKey{"release": release, "recovery": recovery, "unknown": unknown}
	v := vectors{
		Comment: "Shared vectors of the signed web app (OpenSpec change signed-web-app): read by internal/websign/vectors_test.go and web/src/lib/appCode.test.ts. Written by UPDATE_WEBSIGN_VECTORS=1 go test ./internal/websign -run TestVectors; never edit by hand.",
		Domain:  websign.Domain,
		Keys:    map[string]vectorKey{},
	}
	for name, k := range keys {
		spki, _ := sign.SPKI(k)
		fp, _ := sign.Fingerprint(k)
		v.Keys[name] = vectorKey{SPKI: spki, Fingerprint: fp, Short: websign.ShortFingerprint(fp)}
	}
	payload := []byte(`{"app":"opentodo-web","version":"1.3.0","refuse":false,"keys":[{"spki":"` + v.Keys["release"].SPKI + `","role":"release"},{"spki":"` + v.Keys["recovery"].SPKI + `","role":"recovery"}],"worker":{"path":"sw.js","sha256":"aa"},"files":{"sw.js":{"sha256":"aa","size":2,"load":"install"}}}`)
	b64 := base64.RawURLEncoding.EncodeToString
	sig := func(k string, p []byte) websign.Signature {
		s, err := sign.SignPayload(keys[k], p)
		if err != nil {
			t.Fatal(err)
		}
		return websign.Signature{Key: v.Keys[k].Fingerprint, Sig: b64(s)}
	}
	env := func(p []byte, sigs ...websign.Signature) websign.Envelope {
		if sigs == nil {
			sigs = []websign.Signature{}
		}
		return websign.Envelope{Format: 1, Payload: b64(p), Signatures: sigs}
	}
	flipped := sig("release", payload)
	raw, _ := base64.RawURLEncoding.DecodeString(flipped.Sig)
	raw[10] ^= 0x01
	flipped.Sig = b64(raw)
	noDomain := func() websign.Signature {
		// A signature over the payload alone, without the domain string.
		d, err := signRaw(keys["release"], payload)
		if err != nil {
			t.Fatal(err)
		}
		return websign.Signature{Key: v.Keys["release"].Fingerprint, Sig: b64(d)}
	}()
	mutated := append([]byte{}, payload...)
	mutated[len(`{"app":"opentodo-web","version":"1.3.`)] = '1'
	otherApp := []byte(`{"app":"something-else","version":"1.3.0","keys":[],"worker":{"path":"sw.js","sha256":"aa"},"files":{}}`)
	v.Envelopes = []envelopeCase{
		{Name: "valid", Envelope: env(payload, sig("release", payload)), Trusted: []string{"release", "recovery"}, Signer: "release"},
		{Name: "unsigned", Envelope: env(payload), Trusted: []string{"release"}, Error: "unsigned"},
		{Name: "bad signature", Envelope: env(payload, flipped), Trusted: []string{"release"}, Error: "bad-signature"},
		{Name: "unknown key", Envelope: env(payload, sig("unknown", payload)), Trusted: []string{"release", "recovery"}, Error: "unknown-key"},
		{Name: "wrong domain", Envelope: env(payload, noDomain), Trusted: []string{"release"}, Error: "bad-signature"},
		{Name: "mutated payload", Envelope: env(mutated, sig("release", payload)), Trusted: []string{"release"}, Error: "bad-signature"},
		{Name: "two signatures, the old key trusted", Envelope: env(payload, sig("unknown", payload), sig("release", payload)), Trusted: []string{"unknown"}, Signer: "unknown"},
		{Name: "two signatures, the new key trusted", Envelope: env(payload, sig("unknown", payload), sig("release", payload)), Trusted: []string{"release"}, Signer: "release"},
		{Name: "recovery key", Envelope: env(payload, sig("recovery", payload)), Trusted: []string{"release", "recovery"}, Signer: "recovery"},
		{Name: "a bad signature then a good one", Envelope: env(payload, flipped, sig("recovery", payload)), Trusted: []string{"release", "recovery"}, Signer: "recovery"},
		{Name: "another app", Envelope: env(otherApp, sig("release", otherApp)), Trusted: []string{"release"}, Error: "invalid"},
		{Name: "format 2", Envelope: websign.Envelope{Format: 2, Payload: b64(payload), Signatures: []websign.Signature{sig("release", payload)}}, Trusted: []string{"release"}, Error: "invalid"},
	}
	for _, c := range [][3]any{
		{"1.0.0", "1.0.0", 0}, {"1.0.0", "1.0.1", -1}, {"1.2.0", "1.10.0", -1}, {"2.0.0", "1.99.99", 1},
		{"1.0.0-rc.2", "1.0.0", -1}, {"1.0.0-rc.2", "1.0.0-rc.10", -1}, {"1.0.0-alpha", "1.0.0-alpha.1", -1},
		{"1.0.0-alpha.1", "1.0.0-alpha.beta", -1}, {"1.0.0-beta", "1.0.0-alpha", 1}, {"1.0.0+a", "1.0.0+b", 0},
		{"0.0.0-dev", "0.0.1", -1}, {"dev", "0.0.0", -1}, {"dev", "nonsense", 0}, {"1.0", "0.0.1", -1},
		{"01.0.0", "0.0.1", -1}, {"1.0.0-01", "0.0.1", -1}, {"1.1.1", "1.1.1-rc.1", 1},
	} {
		v.Versions = append(v.Versions, struct {
			A   string `json:"a"`
			B   string `json:"b"`
			Cmp int    `json:"cmp"`
		}{c[0].(string), c[1].(string), c[2].(int)})
	}
	out, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(vectorsFile, append(out, '\n'), 0o644); err != nil {
		t.Fatal(err)
	}
}

// signRaw signs the bytes without the domain string, raw r||s.
func signRaw(k *ecdsa.PrivateKey, data []byte) ([]byte, error) {
	digest := sha256.Sum256(data)
	r, s, err := ecdsa.Sign(rand.Reader, k, digest[:])
	if err != nil {
		return nil, err
	}
	sig := make([]byte, 64)
	r.FillBytes(sig[:32])
	s.FillBytes(sig[32:])
	return sig, nil
}
