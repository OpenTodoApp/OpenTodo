package httpapi

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/caldav"
	"github.com/OpenTodoApp/opentodo/internal/push"
)

// decryptPush reverses RFC 8291 aes128gcm for the subscription's private key.
func decryptPush(t *testing.T, body []byte, ua *ecdh.PrivateKey, auth []byte) []byte {
	t.Helper()
	if len(body) < 21+65 || body[20] != 65 {
		t.Fatalf("aes128gcm header: %d bytes", len(body))
	}
	salt, asPub, ct := body[:16], body[21:86], body[86:]
	as, err := ecdh.P256().NewPublicKey(asPub)
	if err != nil {
		t.Fatal(err)
	}
	secret, err := ua.ECDH(as)
	if err != nil {
		t.Fatal(err)
	}
	ikm, _ := hkdf.Key(sha256.New, secret, auth, "WebPush: info\x00"+string(ua.PublicKey().Bytes())+string(asPub), 32)
	cek, _ := hkdf.Key(sha256.New, ikm, salt, "Content-Encoding: aes128gcm\x00", 16)
	nonce, _ := hkdf.Key(sha256.New, ikm, salt, "Content-Encoding: nonce\x00", 12)
	block, _ := aes.NewCipher(cek)
	gcm, _ := cipher.NewGCM(block)
	plain, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		t.Fatalf("decrypt: %v", err)
	}
	return bytes.TrimRight(plain[:bytes.LastIndexByte(plain, 2)], "\x00")
}

// The whole path with the real push service: a calendar app registers, a task
// changes in the web app, and the push service receives one message that only
// the client's key opens, signed with the server's VAPID key, naming no task.
func TestCaldavPushEndToEndThroughAPushService(t *testing.T) {
	e, c, job, _, now := pushSetup(t)
	ua, _ := ecdh.P256().GenerateKey(rand.Reader)
	auth := make([]byte, 16)
	_, _ = rand.Read(auth)
	got := make(chan *http.Request, 4)
	bodies := make(chan []byte, 4)
	ps := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		got <- r
		bodies <- b
		w.WriteHeader(http.StatusCreated)
	}))
	t.Cleanup(ps.Close)
	// The push service runs on this machine: the owner allows private targets.
	if err := e.server.hooks.SetAllowPrivate(context.Background(), true); err != nil {
		t.Fatal(err)
	}
	sender := push.New(e.db, e.sync, t.TempDir(), push.Options{Client: ps.Client()})
	job.Send = sender
	body := strings.NewReplacer("RESOURCE", ps.URL+"/up/garden",
		"KEY", base64.RawURLEncoding.EncodeToString(ua.PublicKey().Bytes()),
		"AUTH", base64.RawURLEncoding.EncodeToString(auth)).Replace(`<?xml version="1.0"?>
<push-register xmlns="https://bitfire.at/webdav-push" xmlns:D="DAV:"><subscription><web-push-subscription>
<push-resource>RESOURCE</push-resource><content-encoding>aes128gcm</content-encoding>
<subscription-public-key type="p256dh">KEY</subscription-public-key><auth-secret>AUTH</auth-secret>
</web-push-subscription></subscription><trigger><content-update><D:depth>1</D:depth></content-update></trigger></push-register>`)
	c.must("POST", c.cal("inbox"), body, 201)
	pushTask(t, e, "Secret garden plans")
	*now = now.Add(time.Second)
	job.RunOnce(context.Background())
	var r *http.Request
	select {
	case r = <-got:
	default:
		t.Fatal("the push service received nothing")
	}
	plain := decryptPush(t, <-bodies, ua, auth)
	if r.Header.Get("Content-Encoding") != "aes128gcm" || r.Header.Get("TTL") != "86400" || r.Header.Get("Urgency") != "normal" ||
		!strings.HasPrefix(r.Header.Get("Authorization"), "vapid t=") || r.Header.Get("Topic") == "" {
		t.Fatalf("headers %v", r.Header)
	}
	root, err := caldav.ParseXML(bytes.NewReader(plain))
	if err != nil || root.Child(caldav.NSPush, "topic").Text != r.Header.Get("Topic") || strings.Contains(string(plain), "Secret") {
		t.Fatalf("plaintext %s %v", plain, err)
	}
	if !strings.HasPrefix(root.Child(caldav.NSPush, "content-update").Child(caldav.NSDAV, "sync-token").Text, "urn:opentodo:sync:") {
		t.Fatalf("plaintext %s", plain)
	}
}
