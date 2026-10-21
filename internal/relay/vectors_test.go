package relay

import (
	"bytes"
	"crypto/ecdh"
	"encoding/json"
	"flag"
	"os"
	"testing"
)

var updateVectors = flag.Bool("update", false, "rewrite web/src/lib/relay.vectors.json")

// vectorsPath is the stream-crypto vector shared with web/src/lib/relay.test.ts
// (kept under web/ so the web build never reads outside it).
const vectorsPath = "../../web/src/lib/relay.vectors.json"

type relayVectors struct {
	// DeviceJWK is the device's P-256 private key as a JWK (d, x, y).
	DeviceJWK map[string]string `json:"deviceJwk"`
	ServerPub string            `json:"serverPub"`
	Stream    string            `json:"stream"`
	ID        string            `json:"id"`
	Plaintext string            `json:"plaintext"`
	Box       string            `json:"box"`
}

func scalar(fill byte) []byte { return bytes.Repeat([]byte{fill}, 32) }

// TestStreamCryptoVectors pins the key derivation and sealing the browser uses:
// with fixed keys, the server's box must open in the browser (relay.test.ts).
func TestStreamCryptoVectors(t *testing.T) {
	curve := ecdh.P256()
	dev, err := curve.NewPrivateKey(scalar(0x11))
	if err != nil {
		t.Fatal(err)
	}
	srv, err := curve.NewPrivateKey(scalar(0x22))
	if err != nil {
		t.Fatal(err)
	}
	const stream, id, plain = "0123456789abcdef0123456789abcdef", "fedcba9876543210fedcba9876543210", `{"op":"decrypt","items":[]}`
	k, err := deriveFrom(srv, dev.PublicKey().Bytes(), stream)
	if err != nil {
		t.Fatal(err)
	}
	if *updateVectors {
		box, err := k.seal([]byte(plain), id)
		if err != nil {
			t.Fatal(err)
		}
		pub := dev.PublicKey().Bytes()
		v := relayVectors{
			DeviceJWK: map[string]string{"kty": "EC", "crv": "P-256", "d": b64.EncodeToString(scalar(0x11)), "x": b64.EncodeToString(pub[1:33]), "y": b64.EncodeToString(pub[33:])},
			ServerPub: b64.EncodeToString(srv.PublicKey().Bytes()), Stream: stream, ID: id, Plaintext: plain, Box: box,
		}
		raw, _ := json.MarshalIndent(v, "", "  ")
		if err := os.WriteFile(vectorsPath, append(raw, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	raw, err := os.ReadFile(vectorsPath)
	if err != nil {
		t.Fatalf("%v (run go test ./internal/relay -run Vectors -update)", err)
	}
	var v relayVectors
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	out, err := k.open(v.Box, v.ID)
	if err != nil || string(out) != v.Plaintext {
		t.Fatalf("vector does not open with the derived key: %q %v", out, err)
	}
	if _, err := k.open(v.Box, "another-request"); err == nil {
		t.Fatal("box opened with another request id")
	}
}
