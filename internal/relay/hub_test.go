package relay

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

// fakeDevice plays the web worker's side of the key exchange.
type fakeDevice struct {
	priv *ecdh.PrivateKey
	aead cipher.AEAD
}

func newFakeDevice(t *testing.T) *fakeDevice {
	t.Helper()
	priv, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return &fakeDevice{priv: priv}
}

func (d *fakeDevice) pub() []byte { return d.priv.PublicKey().Bytes() }

func (d *fakeDevice) connect(t *testing.T, s *Stream) {
	t.Helper()
	serverPub, err := b64.DecodeString(s.ServerKey())
	if err != nil {
		t.Fatal(err)
	}
	peer, err := ecdh.P256().NewPublicKey(serverPub)
	if err != nil {
		t.Fatal(err)
	}
	shared, _ := d.priv.ECDH(peer)
	key, _ := hkdf.Key(sha256.New, shared, []byte(s.ID), HKDFInfo, 32)
	blk, _ := aes.NewCipher(key)
	d.aead, _ = cipher.NewGCM(blk)
}

func (d *fakeDevice) open(t *testing.T, ev Event) (string, request) {
	t.Helper()
	var env struct{ ID, Box string }
	if err := json.Unmarshal([]byte(ev.Data), &env); err != nil {
		t.Fatal(err)
	}
	raw, _ := b64.DecodeString(env.Box)
	n := d.aead.NonceSize()
	plain, err := d.aead.Open(nil, raw[:n], raw[n:], []byte(env.ID))
	if err != nil {
		t.Fatalf("request does not open: %v", err)
	}
	var r request
	_ = json.Unmarshal(plain, &r)
	return env.ID, r
}

func (d *fakeDevice) seal(id string, body answerBody) string {
	raw, _ := json.Marshal(body)
	nonce := make([]byte, d.aead.NonceSize())
	_, _ = rand.Read(nonce)
	return b64.EncodeToString(d.aead.Seal(nonce, nonce, raw, []byte(id)))
}

func TestRelayRoundTrip(t *testing.T) {
	h := NewHub()
	dev := newFakeDevice(t)
	s, err := h.Open("u1", "laptop", "sess", dev.pub())
	if err != nil {
		t.Fatal(err)
	}
	dev.connect(t, s)
	go func() {
		ev := <-s.Events()
		id, req := dev.open(t, ev)
		res := make([]Result, len(req.Items))
		for i, it := range req.Items {
			res[i] = Result{Value: strings.ToUpper(it.Value)}
		}
		// The event data never carries the value in the clear.
		if strings.Contains(ev.Data, "secret title") {
			t.Error("plaintext on the stream")
		}
		if err := h.Answer("u1", "other-session", id, dev.seal(id, answerBody{Results: res})); !errors.Is(err, ErrNotFound) {
			t.Errorf("answer from another session = %v", err)
		}
		if err := h.Answer("u1", "sess", id, dev.seal(id, answerBody{Results: res})); err != nil {
			t.Errorf("answer = %v", err)
		}
		if err := h.Answer("u1", "sess", id, dev.seal(id, answerBody{Results: res})); !errors.Is(err, ErrNotFound) {
			t.Errorf("second answer = %v", err)
		}
	}()
	out, err := h.Do(context.Background(), "u1", Encrypt, []Item{{Entity: "task", ID: "t1", Field: "title", Value: "secret title"}}, Call{Tool: "create_tasks", Write: true})
	if err != nil || len(out) != 1 || out[0].Value != "SECRET TITLE" {
		t.Fatalf("Do = %+v %v", out, err)
	}
}

func TestRelayErrors(t *testing.T) {
	ctx := context.Background()
	item := []Item{{Entity: "task", ID: "t1", Field: "title", Value: "enc:v1:x"}}
	h := NewHub()
	var re *Error
	if _, err := h.Do(ctx, "u1", Decrypt, item, Call{}); !errors.As(err, &re) || re.Code != CodeUnavailable {
		t.Fatalf("no device: %v", err)
	}
	dev := newFakeDevice(t)
	s, _ := h.Open("u1", "laptop", "sess", dev.pub())
	dev.connect(t, s)

	old := ReadDeadline
	ReadDeadline = 50 * time.Millisecond
	defer func() { ReadDeadline = old }()
	if _, err := h.Do(ctx, "u1", Decrypt, item, Call{}); !errors.As(err, &re) || re.Code != CodeTimeout {
		t.Fatalf("slow device: %v", err)
	}
	<-s.Events()

	go func() {
		id, _ := dev.open(t, <-s.Events())
		_ = h.Answer("u1", "sess", id, dev.seal(id, answerBody{Error: CodeLimit}))
	}()
	if _, err := h.Do(ctx, "u1", Decrypt, item, Call{}); !errors.As(err, &re) || re.Code != CodeLimit {
		t.Fatalf("device limit: %v", err)
	}

	big := make([]Item, MaxValues+1)
	if _, err := h.Do(ctx, "u1", Decrypt, big, Call{}); !errors.As(err, &re) || re.Code != CodeTooLarge {
		t.Fatalf("too many values: %v", err)
	}

	h.Close(s)
	if h.Online("u1") {
		t.Fatal("still online after close")
	}
}

func TestRelayMinuteLimitAndQueue(t *testing.T) {
	h := NewHub()
	h.mu.Lock()
	for i := 0; i < MaxPerMinute; i++ {
		if err := h.admit("u1"); err != nil {
			t.Fatalf("call %d: %v", i, err)
		}
		h.queued["u1"] = 0
	}
	err := h.admit("u1")
	h.mu.Unlock()
	var re *Error
	if !errors.As(err, &re) || re.Code != CodeRateLimited || re.RetryAfter < 1 {
		t.Fatalf("61st call = %v", err)
	}
	h2 := NewHub()
	h2.mu.Lock()
	defer h2.mu.Unlock()
	for i := 0; i < MaxQueued; i++ {
		_ = h2.admit("u2")
	}
	if err := h2.admit("u2"); !errors.As(err, &re) || re.Code != CodeBusy {
		t.Fatalf("fifth queued = %v", err)
	}
}

func TestRelayStreamsReplaceAndCap(t *testing.T) {
	h := NewHub()
	first, _ := h.Open("u1", "laptop", "s", newFakeDevice(t).pub())
	second, _ := h.Open("u1", "laptop", "s", newFakeDevice(t).pub())
	select {
	case <-first.Done():
	default:
		t.Fatal("same device's old stream stays open")
	}
	var streams []*Stream
	for i := 0; i < MaxStreamsPerAccount+1; i++ {
		s, _ := h.Open("u1", "d"+string(rune('a'+i)), "s", newFakeDevice(t).pub())
		streams = append(streams, s)
	}
	select {
	case <-second.Done():
	default:
		t.Fatal("the oldest stream was not closed beyond the cap")
	}
	h.CloseDevice("u1", "da")
	select {
	case <-streams[0].Done():
	default:
		t.Fatal("CloseDevice left the stream open")
	}
	if _, err := h.Open("u1", "x", "s", []byte("not a key")); err == nil {
		t.Fatal("a bad device key was accepted")
	}
}
