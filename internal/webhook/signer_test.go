package webhook

import (
	"net/http"
	"strings"
	"testing"
)

// The reference vector documented in docs/webhooks.md ("Test vector"). Every
// snippet in the docs must produce RefSignature for these inputs.
const (
	RefSecret    = "whsec_opentodo-test-vector-secret-do-not-use"
	RefTimestamp = 1760060001
	RefBody      = `{"version":1,"id":"7d3c1f0e-0000-4000-8000-000000000001","event":"ping","time":1760060001000,"webhook_id":"0b9a2e4c-0000-4000-8000-000000000002","source":"server","data":{},"changes":{}}`
	RefSignature = "v1=a049099332920d6f2b44a294b46fc5260f87dfc36294f77069b5ab0058589b98"
)

func TestSignatureMatchesReferenceVector(t *testing.T) {
	if got := Sign(RefSecret, RefTimestamp, []byte(RefBody)); got != RefSignature {
		t.Fatalf("Sign = %s, want %s", got, RefSignature)
	}
	if !Verify(RefSecret, RefTimestamp, []byte(RefBody), RefSignature) {
		t.Fatal("Verify rejected the reference vector")
	}
	// Any change to secret, timestamp or body breaks the signature.
	if Verify(RefSecret+"x", RefTimestamp, []byte(RefBody), RefSignature) ||
		Verify(RefSecret, RefTimestamp+1, []byte(RefBody), RefSignature) ||
		Verify(RefSecret, RefTimestamp, []byte(RefBody+" "), RefSignature) {
		t.Fatal("signature did not bind secret, timestamp and body")
	}
}

func TestNewSecretFormat(t *testing.T) {
	a, b := NewSecret(), NewSecret()
	if !strings.HasPrefix(a, SecretPrefix) || len(a) != len(SecretPrefix)+43 || a == b {
		t.Fatalf("secrets %q %q", a, b)
	}
}

func TestSetHeaders(t *testing.T) {
	h := http.Header{}
	SetHeaders(h, "1.2.3", "ping", "d1", "w1", RefSecret, RefTimestamp, []byte(RefBody))
	want := map[string]string{
		"Content-Type":  "application/json",
		"User-Agent":    "OpenTodo/1.2.3",
		HeaderEvent:     "ping",
		HeaderDelivery:  "d1",
		HeaderWebhook:   "w1",
		HeaderTimestamp: "1760060001",
		HeaderSignature: RefSignature,
	}
	for k, v := range want {
		if h.Get(k) != v {
			t.Errorf("%s = %q, want %q", k, h.Get(k), v)
		}
	}
}
