package auth

import (
	"crypto/sha1"
	"crypto/sha256"
	"crypto/sha512"
	"hash"
	"net/url"
	"strings"
	"testing"
	"time"
)

// RFC 6238 Appendix B test vectors (8 digits, 30-second steps).
func TestTOTPVectors(t *testing.T) {
	seed20 := []byte("12345678901234567890")
	seed32 := []byte("12345678901234567890123456789012")
	seed64 := []byte("1234567890123456789012345678901234567890123456789012345678901234")
	algs := []struct {
		name string
		h    func() hash.Hash
		key  []byte
	}{{"SHA1", sha1.New, seed20}, {"SHA256", sha256.New, seed32}, {"SHA512", sha512.New, seed64}}
	vectors := []struct {
		unix  int64
		codes [3]string
	}{
		{59, [3]string{"94287082", "46119246", "90693936"}},
		{1111111109, [3]string{"07081804", "68084774", "25091201"}},
		{1111111111, [3]string{"14050471", "67062674", "99943326"}},
		{1234567890, [3]string{"89005924", "91819424", "93441116"}},
		{2000000000, [3]string{"69279037", "90698825", "38618901"}},
		{20000000000, [3]string{"65353130", "77737706", "47863826"}},
	}
	for _, v := range vectors {
		step := totpStep(time.Unix(v.unix, 0))
		for i, a := range algs {
			if got := hotp(a.h, a.key, step, 8); got != v.codes[i] {
				t.Errorf("%s at %d: got %s, want %s", a.name, v.unix, got, v.codes[i])
			}
		}
		// The six-digit SHA1 code apps show is the last six digits of the vector.
		if got := totpCode(seed20, step); got != v.codes[0][2:] {
			t.Errorf("6-digit SHA1 at %d: got %s, want %s", v.unix, got, v.codes[0][2:])
		}
	}
	// RFC 4226 Appendix D: HOTP values for counters 0..9.
	hotpWant := []string{"755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"}
	for c, want := range hotpWant {
		if got := hotp(sha1.New, seed20, int64(c), 6); got != want {
			t.Errorf("HOTP(%d) = %s, want %s", c, got, want)
		}
	}
}

func TestTOTPToleranceAndReplay(t *testing.T) {
	secret := newTOTPSecret()
	now := time.Unix(1_760_000_000, 0)
	cur := totpStep(now)
	for _, d := range []int64{-1, 0, 1} {
		if step, ok := matchTOTP(secret, totpCode(secret, cur+d), now, 0); !ok || step != cur+d {
			t.Fatalf("offset %d: ok=%v step=%d", d, ok, step)
		}
	}
	for _, d := range []int64{-2, 2} {
		if _, ok := matchTOTP(secret, totpCode(secret, cur+d), now, 0); ok {
			t.Fatalf("offset %d accepted", d)
		}
	}
	// A step at or below the last used one is refused even though the code matches.
	if _, ok := matchTOTP(secret, totpCode(secret, cur), now, cur); ok {
		t.Fatal("replayed step accepted")
	}
	if _, ok := matchTOTP(secret, totpCode(secret, cur+1), now, cur); !ok {
		t.Fatal("next step refused")
	}
	// Spaces are tolerated, wrong lengths are not.
	code := totpCode(secret, cur)
	if _, ok := matchTOTP(secret, code[:3]+" "+code[3:], now, 0); !ok {
		t.Fatal("spaced code refused")
	}
	if _, ok := matchTOTP(secret, code+"0", now, 0); ok {
		t.Fatal("7-digit code accepted")
	}
}

func TestTOTPSecretAndURI(t *testing.T) {
	secret := newTOTPSecret()
	enc := encodeTOTPSecret(secret)
	if len(enc) != 32 || strings.ContainsAny(enc, "=") {
		t.Fatalf("encoded secret %q", enc)
	}
	back, err := decodeTOTPSecret(strings.ToLower(enc[:4]) + " " + enc[4:])
	if err != nil || string(back) != string(secret) {
		t.Fatalf("decode: %v", err)
	}
	u, err := url.Parse(totpURI(secret, "a@example.com"))
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	if u.Scheme != "otpauth" || u.Host != "totp" || u.Path != "/OpenTodo:a@example.com" ||
		q.Get("secret") != enc || q.Get("issuer") != "OpenTodo" || q.Get("algorithm") != "SHA1" || q.Get("digits") != "6" || q.Get("period") != "30" {
		t.Fatalf("uri = %s", u)
	}
	code, err := TOTPCodeAt(enc, time.Unix(59, 0))
	if err != nil || len(code) != 6 {
		t.Fatalf("TOTPCodeAt = %q, %v", code, err)
	}
}
