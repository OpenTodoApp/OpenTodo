package push

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// The message the Android shell must decrypt (OpenSpec change shell-push, design
// D3): fixed keys and salt, a reminder's payload as BuildPayload writes it, and the
// bytes this package's own encrypt produces. The shell's unit test decrypts them, so
// a change to how the server writes a message fails here first and there second.
// Regenerate with UPDATE_PUSH_FIXTURE=1 go test ./internal/push -run TestPushMessageFixture.
const pushFixturePath = "../../mobile/android/app/src/test/resources/bridge/push-message.json"

type pushFixtureReceiver struct {
	PrivateKey string `json:"privateKey"`
	P256dh     string `json:"p256dh"`
	Auth       string `json:"auth"`
}

type pushFixtureSender struct {
	PrivateKey string `json:"privateKey"`
	Salt       string `json:"salt"`
}

type pushFixtureRFC struct {
	ReceiverPrivateKey string `json:"receiverPrivateKey"`
	P256dh             string `json:"p256dh"`
	Auth               string `json:"auth"`
	Body               string `json:"body"`
	Plaintext          string `json:"plaintext"`
}

type pushFixture struct {
	Description string              `json:"description"`
	Receiver    pushFixtureReceiver `json:"receiver"`
	Sender      pushFixtureSender   `json:"sender"`
	Plaintext   string              `json:"plaintext"`
	Body        string              `json:"body"`
	RFC8291     pushFixtureRFC      `json:"rfc8291"`
}

// fixtureBytes is n fixed bytes for a label: the fixture's keys are not secrets.
func fixtureBytes(label string, n int) []byte {
	sum := sha256.Sum256([]byte("opentodo shell-push fixture: " + label))
	return sum[:n]
}

func buildPushFixture(t *testing.T) []byte {
	t.Helper()
	enc := base64.RawURLEncoding
	ua, err := ecdhKey(fixtureBytes("receiver key", 32))
	if err != nil {
		t.Fatal(err)
	}
	as, err := ecdhKey(fixtureBytes("sender key", 32))
	if err != nil {
		t.Fatal(err)
	}
	auth, salt := fixtureBytes("auth secret", 16), fixtureBytes("salt", 16)
	plaintext := BuildPayload("r-1", "t-1", 1_791_000_000_000, "Call the plumber ☎", true)
	body, err := encrypt(plaintext, ua.PublicKey().Bytes(), auth, as, salt)
	if err != nil {
		t.Fatal(err)
	}
	// The receiving side reads both messages back: ours, and the RFC's own example
	// (appendix A, the constants of crypto_test.go) as printed there.
	if got, err := decryptForTest(body, ua, auth); err != nil || !bytes.Equal(got, plaintext) {
		t.Fatalf("the fixture's message does not decrypt: %q, %v", got, err)
	}
	rfcUA, err := ecdhKey(b64(t, rfcUAPrivate))
	if err != nil {
		t.Fatal(err)
	}
	if enc.EncodeToString(rfcUA.PublicKey().Bytes()) != rfcUAPublic {
		t.Fatal("the RFC 8291 receiver key pair does not match")
	}
	if got, err := decryptForTest(b64(t, rfcBody), rfcUA, b64(t, rfcAuthSecret)); err != nil || string(got) != rfcPlaintext {
		t.Fatalf("the RFC 8291 example does not decrypt: %q, %v", got, err)
	}
	var out bytes.Buffer
	e := json.NewEncoder(&out)
	e.SetEscapeHTML(false)
	e.SetIndent("", "  ")
	if err := e.Encode(pushFixture{
		Description: "A Web Push message as the server encrypts it (internal/push, aes128gcm, RFC 8291) for a shell's subscription, and RFC 8291's own example. Written by internal/push/fixture_test.go (UPDATE_PUSH_FIXTURE=1); the Android shell's unit test decrypts both. All values base64url without padding.",
		Receiver:    pushFixtureReceiver{PrivateKey: enc.EncodeToString(ua.Bytes()), P256dh: enc.EncodeToString(ua.PublicKey().Bytes()), Auth: enc.EncodeToString(auth)},
		Sender:      pushFixtureSender{PrivateKey: enc.EncodeToString(as.Bytes()), Salt: enc.EncodeToString(salt)},
		Plaintext:   string(plaintext),
		Body:        enc.EncodeToString(body),
		RFC8291:     pushFixtureRFC{ReceiverPrivateKey: rfcUAPrivate, P256dh: rfcUAPublic, Auth: rfcAuthSecret, Body: rfcBody, Plaintext: rfcPlaintext},
	}); err != nil {
		t.Fatal(err)
	}
	return out.Bytes()
}

func TestPushMessageFixture(t *testing.T) {
	want := buildPushFixture(t)
	if os.Getenv("UPDATE_PUSH_FIXTURE") == "1" {
		if err := os.MkdirAll(filepath.Dir(pushFixturePath), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(pushFixturePath, want, 0o644); err != nil {
			t.Fatal(err)
		}
		return
	}
	got, err := os.ReadFile(pushFixturePath)
	if err != nil {
		t.Fatalf("%v (run UPDATE_PUSH_FIXTURE=1 go test ./internal/push -run TestPushMessageFixture)", err)
	}
	if !bytes.Equal(got, want) {
		t.Fatalf("%s is stale: run UPDATE_PUSH_FIXTURE=1 go test ./internal/push -run TestPushMessageFixture", pushFixturePath)
	}
}
