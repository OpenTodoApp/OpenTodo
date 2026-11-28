package pushrelay

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"testing"
	"time"
)

func testKey(id byte) SealKey {
	k := make([]byte, 32)
	_, _ = rand.Read(k)
	return SealKey{ID: id, Key: k}
}

func testDevice(t *testing.T, issued time.Time) Device {
	t.Helper()
	tok := make([]byte, 32)
	_, _ = rand.Read(tok)
	key, err := NewWakeKey()
	if err != nil {
		t.Fatal(err)
	}
	return Device{Token: tok, Env: Production, WakeKey: key, IssuedAt: time.Unix(issued.Unix(), 0)}
}

func ring(t *testing.T, keys ...SealKey) *Keyring {
	t.Helper()
	k, err := NewKeyring(keys)
	if err != nil {
		t.Fatal(err)
	}
	return k
}

func TestHandleRoundTrip(t *testing.T) {
	k := ring(t, testKey(7))
	d := testDevice(t, time.Now())
	d.Env = Development
	h, err := k.Seal(d)
	if err != nil {
		t.Fatal(err)
	}
	if len(h) > 240 || h[:3] != "h1." {
		t.Fatalf("handle %q (%d characters)", h, len(h))
	}
	got, err := k.Open(h)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got.Token, d.Token) || !bytes.Equal(got.WakeKey, d.WakeKey) || got.Env != Development || !got.IssuedAt.Equal(d.IssuedAt) {
		t.Fatalf("opened %+v, sealed %+v", got, d)
	}
	// Two seals of the same device differ (a fresh nonce), and the token is
	// not readable in the handle.
	h2, _ := k.Seal(d)
	if h2 == h {
		t.Fatal("two seals gave the same handle")
	}
	raw, _ := base64.RawURLEncoding.DecodeString(h[3:])
	if bytes.Contains(raw, d.Token) || bytes.Contains(raw, d.WakeKey) {
		t.Fatal("the handle carries the token or the key in the clear")
	}
	// A changed byte anywhere does not open.
	for i := range raw {
		c := append([]byte(nil), raw...)
		c[i] ^= 1
		if _, err := k.Open("h1." + base64.RawURLEncoding.EncodeToString(c)); err == nil {
			t.Fatalf("byte %d changed and the handle still opens", i)
		}
	}
	for _, bad := range []string{"", "h1.", "h2." + h[3:], h[3:], "h1.!!!", h + "A"} {
		if _, err := k.Open(bad); err == nil {
			t.Errorf("Open(%q) opened", bad)
		}
	}
}

func TestExpiredHandle(t *testing.T) {
	issued := time.Unix(1_800_000_000, 0)
	d := testDevice(t, issued)
	if want := issued.Add(30 * 24 * time.Hour); !d.ExpiresAt().Equal(want) {
		t.Fatalf("expires %v, want %v", d.ExpiresAt(), want)
	}
	// The handler's check: open (Open does not look at the time), then expiry.
	k := ring(t, testKey(1))
	h, _ := k.Seal(d)
	got, err := k.Open(h)
	if err != nil {
		t.Fatal(err)
	}
	if !issued.Add(HandleTTL - time.Second).Before(got.ExpiresAt()) {
		t.Fatal("a handle a second before expiry reads as expired")
	}
	if issued.Add(HandleTTL).Before(got.ExpiresAt()) {
		t.Fatal("a handle at 30 days still reads as live")
	}
}

func TestKeyRotation(t *testing.T) {
	old, next := testKey(1), testKey(2)
	before := ring(t, old)
	d := testDevice(t, time.Now())
	hOld, _ := before.Seal(d)
	after := ring(t, old, next)
	hNew, _ := after.Seal(d)
	if hNew[3:5] == hOld[3:5] {
		// The first byte (the key id) differs; its base64 prefix does too.
		raw, _ := base64.RawURLEncoding.DecodeString(hNew[3:])
		if raw[0] != 2 {
			t.Fatalf("new handle sealed with key %d, want 2", raw[0])
		}
	}
	for name, h := range map[string]string{"old": hOld, "new": hNew} {
		if _, err := after.Open(h); err != nil {
			t.Errorf("%s handle does not open after rotation: %v", name, err)
		}
	}
	// Removing the old key stops its handles.
	if _, err := ring(t, next).Open(hOld); err == nil {
		t.Fatal("a handle of a removed key still opens")
	}
	// Limits of the keyring.
	if _, err := NewKeyring(nil); err == nil {
		t.Error("no keys accepted")
	}
	if _, err := NewKeyring([]SealKey{testKey(1), testKey(2), testKey(3), testKey(4), testKey(5)}); err == nil {
		t.Error("five keys accepted")
	}
	if _, err := NewKeyring([]SealKey{testKey(1), testKey(1)}); err == nil {
		t.Error("a duplicate id accepted")
	}
	// The file format: oldest first, the last seals.
	file := `[{"id":1,"key":"` + base64.RawURLEncoding.EncodeToString(old.Key) + `"},{"id":2,"key":"` + base64.RawURLEncoding.EncodeToString(next.Key) + `"}]`
	fk, err := ParseKeyring([]byte(file))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := fk.Open(hOld); err != nil {
		t.Fatal("file keyring does not open the old handle")
	}
	h, _ := fk.Seal(d)
	if raw, _ := base64.RawURLEncoding.DecodeString(h[3:]); raw[0] != 2 {
		t.Fatalf("file keyring seals with %d, want the last key 2", raw[0])
	}
	for _, bad := range []string{`{}`, `[{"id":1,"key":"short"}]`, `[{"id":300,"key":"` + base64.RawURLEncoding.EncodeToString(old.Key) + `"}]`, `[{"id":1,"key":"x","extra":1}]`} {
		if _, err := ParseKeyring([]byte(bad)); err == nil {
			t.Errorf("ParseKeyring(%s) accepted", bad)
		}
	}
}

func TestHandleKeyIdInAAD(t *testing.T) {
	// Two ids sharing the same key bytes: only the AAD tells them apart.
	a := testKey(1)
	b := SealKey{ID: 2, Key: a.Key}
	k := ring(t, b, a)
	h, _ := k.Seal(testDevice(t, time.Now()))
	raw, _ := base64.RawURLEncoding.DecodeString(h[3:])
	if raw[0] != 1 {
		t.Fatalf("sealed with %d", raw[0])
	}
	raw[0] = 2
	if _, err := k.Open("h1." + base64.RawURLEncoding.EncodeToString(raw)); err == nil {
		t.Fatal("a handle relabelled with another key id opens")
	}
}

func TestWakeNeedsSignature(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	d := testDevice(t, now)
	k := ring(t, testKey(1))
	h, _ := k.Seal(d)
	ts := now.Unix()
	sig := Sign(d.WakeKey, KindRefresh, ts, h)
	if !verifyWake(d, KindRefresh, ts, h, sig, now) {
		t.Fatal("a correct signature fails")
	}
	other, _ := NewWakeKey()
	cases := map[string]bool{
		"another key":          verifyWake(d, KindRefresh, ts, h, Sign(other, KindRefresh, ts, h), now),
		"kind changed":         verifyWake(d, KindDue, ts, h, sig, now),
		"time changed":         verifyWake(d, KindRefresh, ts+1, h, sig, now),
		"no signature":         verifyWake(d, KindRefresh, ts, h, "", now),
		"not base64":           verifyWake(d, KindRefresh, ts, h, "!!", now),
		"301 s late":           verifyWake(d, KindRefresh, ts, h, sig, now.Add(301*time.Second)),
		"301 s early":          verifyWake(d, KindRefresh, ts, h, sig, now.Add(-301*time.Second)),
		"another handle":       verifyWake(d, KindRefresh, ts, h+"x", sig, now),
		"300 s late is inside": !verifyWake(d, KindRefresh, ts, h, sig, now.Add(300*time.Second)),
	}
	for name, ok := range cases {
		if ok {
			t.Errorf("%s: verified", name)
		}
	}
	if string(SignatureBase("due", 12, "h1.x")) != "opentodo-push-relay/1\ndue\n12\nh1.x" {
		t.Fatalf("signature base %q", SignatureBase("due", 12, "h1.x"))
	}
}

func TestLRUBound(t *testing.T) {
	l := newLimiter(100)
	now := time.Unix(1_800_000_000, 0)
	for i := range 1000 {
		l.take(now, "x", []byte{byte(i), byte(i >> 8)}, refreshWindows)
	}
	if n := l.len(); n != 100 {
		t.Fatalf("%d keys held, want the bound 100", n)
	}
	// The most recent keys stay; their counts are kept.
	recent := []byte{byte(999 % 256), byte(999 >> 8)}
	for range RefreshPerDeviceHour - 1 {
		if name, _ := l.take(now, "x", recent, refreshWindows); name != "" {
			t.Fatal("a recent key lost its count")
		}
	}
	if name, after := l.take(now, "x", recent, refreshWindows); name != "device.refresh" || after < 1 || after > 3600 {
		t.Fatalf("over the limit: %q after %d", name, after)
	}
	// A new UTC day forgets everything (the salt changed).
	if name, _ := l.take(now.Add(24*time.Hour), "x", recent, refreshWindows); name != "" {
		t.Fatal("yesterday's count carried over")
	}
	if n := l.len(); n != 1 {
		t.Fatalf("%d keys after the day changed", n)
	}
	// The production bound.
	if LRUKeys != 200_000 {
		t.Fatal("LRUKeys changed")
	}
}

func TestAddressKey(t *testing.T) {
	same := [][2]string{{"2001:db8:aa:bb00::1", "2001:db8:aa:bbff::2"}, {"::ffff:198.51.100.1", "198.51.100.1"}}
	for _, p := range same {
		if !bytes.Equal(addressKey(p[0]), addressKey(p[1])) {
			t.Errorf("%s and %s grouped apart", p[0], p[1])
		}
	}
	if bytes.Equal(addressKey("2001:db8:aa:bb00::1"), addressKey("2001:db8:aa:cc00::1")) {
		t.Error("two /56 grouped together")
	}
	if bytes.Equal(addressKey("198.51.100.1"), addressKey("198.51.100.2")) {
		t.Error("two IPv4 addresses grouped together")
	}
}
