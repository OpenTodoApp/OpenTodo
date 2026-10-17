package push

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"math/big"
	"os"
	"strings"
	"testing"
	"time"
)

func b64(t *testing.T, s string) []byte {
	t.Helper()
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		t.Fatalf("decode %q: %v", s, err)
	}
	return b
}

// RFC 8291 appendix A: the worked example of an encrypted push message.
const (
	rfcPlaintext  = "When I grow up, I want to be a watermelon"
	rfcASPrivate  = "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw"
	rfcASPublic   = "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8"
	rfcUAPrivate  = "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94"
	rfcUAPublic   = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"
	rfcSalt       = "DGv6ra1nlYgDCS1FRnbzlw"
	rfcAuthSecret = "BTBZMqHH6r4Tts7J_aSIgg"
	rfcECDHSecret = "kyrL1jIIOHEzg3sM2ZWRHDRB62YACZhhSlknJ672kSs"
	rfcCEK        = "oIhVW04MRdy2XN9CiKLxTg"
	rfcNonce      = "4h_95klXJ5E_qnoN"
	rfcBody       = "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN"
)

func TestWebPushEncryptionVector(t *testing.T) {
	as, err := ecdhKey(b64(t, rfcASPrivate))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(as.PublicKey().Bytes(), b64(t, rfcASPublic)) {
		t.Fatal("as_public does not match the RFC")
	}
	ua, err := ecdhKey(b64(t, rfcUAPrivate))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(ua.PublicKey().Bytes(), b64(t, rfcUAPublic)) {
		t.Fatal("ua_public does not match the RFC")
	}
	secret, err := as.ECDH(ua.PublicKey())
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(secret, b64(t, rfcECDHSecret)) {
		t.Fatalf("ecdh_secret = %s", base64.RawURLEncoding.EncodeToString(secret))
	}
	cek, nonce, err := deriveKeys(secret, b64(t, rfcUAPublic), b64(t, rfcASPublic), b64(t, rfcAuthSecret), b64(t, rfcSalt))
	if err != nil {
		t.Fatal(err)
	}
	if got := base64.RawURLEncoding.EncodeToString(cek); got != rfcCEK {
		t.Fatalf("CEK = %s, want %s", got, rfcCEK)
	}
	if got := base64.RawURLEncoding.EncodeToString(nonce); got != rfcNonce {
		t.Fatalf("NONCE = %s, want %s", got, rfcNonce)
	}
	body, err := encrypt([]byte(rfcPlaintext), b64(t, rfcUAPublic), b64(t, rfcAuthSecret), as, b64(t, rfcSalt))
	if err != nil {
		t.Fatal(err)
	}
	if got := base64.RawURLEncoding.EncodeToString(body); got != rfcBody {
		t.Fatalf("body =\n%s\nwant\n%s", got, rfcBody)
	}
	// And the receiving side recovers the plaintext.
	plain, err := decryptForTest(body, ua, b64(t, rfcAuthSecret))
	if err != nil || string(plain) != rfcPlaintext {
		t.Fatalf("decrypt = %q, %v", plain, err)
	}
}

func TestEncryptRoundTripAndLimits(t *testing.T) {
	ua, _ := ecdh.P256().GenerateKey(nil)
	auth := bytes.Repeat([]byte{7}, 16)
	msg := []byte(`{"reminderId":"r1"}`)
	a, err := Encrypt(msg, ua.PublicKey().Bytes(), auth)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := Encrypt(msg, ua.PublicKey().Bytes(), auth)
	if bytes.Equal(a, b) {
		t.Fatal("two encryptions are identical: salt or ephemeral key reused")
	}
	if plain, err := decryptForTest(a, ua, auth); err != nil || !bytes.Equal(plain, msg) {
		t.Fatalf("round trip = %q, %v", plain, err)
	}
	if _, err := Encrypt(make([]byte, MaxPlaintext+1), ua.PublicKey().Bytes(), auth); !errors.Is(err, ErrPayloadTooLarge) {
		t.Fatalf("oversized payload err = %v", err)
	}
	if _, err := Encrypt(msg, []byte("not a key"), auth); err == nil {
		t.Fatal("bad p256dh accepted")
	}
	if _, err := Encrypt(msg, ua.PublicKey().Bytes(), auth[:8]); err == nil {
		t.Fatal("short auth secret accepted")
	}
}

// decryptForTest is the user agent's side of RFC 8291 (single record).
func decryptForTest(body []byte, ua *ecdh.PrivateKey, auth []byte) ([]byte, error) {
	if len(body) < 21 {
		return nil, errors.New("short body")
	}
	salt := body[:16]
	rs := binary.BigEndian.Uint32(body[16:20])
	idlen := int(body[20])
	if len(body) < 21+idlen || int(rs) < len(body)-21-idlen {
		return nil, errors.New("bad header")
	}
	asPubRaw := body[21 : 21+idlen]
	asPub, err := ecdh.P256().NewPublicKey(asPubRaw)
	if err != nil {
		return nil, err
	}
	secret, err := ua.ECDH(asPub)
	if err != nil {
		return nil, err
	}
	cek, nonce, err := deriveKeys(secret, ua.PublicKey().Bytes(), asPubRaw, auth, salt)
	if err != nil {
		return nil, err
	}
	block, _ := aes.NewCipher(cek)
	gcm, _ := cipher.NewGCM(block)
	rec, err := gcm.Open(nil, nonce, body[21+idlen:], nil)
	if err != nil {
		return nil, err
	}
	i := bytes.LastIndexByte(rec, 0x02)
	if i < 0 || len(bytes.Trim(rec[i+1:], "\x00")) != 0 {
		return nil, errors.New("bad padding")
	}
	return rec[:i], nil
}

func TestVapidHeader(t *testing.T) {
	k, err := LoadOrCreateKeys(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	now := time.Unix(1_791_000_000, 0)
	h, err := VAPIDAuthorization("https://push.example.net:8443/send/abc?x=1", "mailto:ops@example.org", k, now)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(h, "vapid t=") || !strings.HasSuffix(h, ", k="+k.PublicKey()) {
		t.Fatalf("header = %q", h)
	}
	jwt := strings.TrimSuffix(strings.TrimPrefix(h, "vapid t="), ", k="+k.PublicKey())
	parts := strings.Split(jwt, ".")
	if len(parts) != 3 {
		t.Fatalf("jwt = %q", jwt)
	}
	var header, claims map[string]any
	_ = json.Unmarshal(b64(t, parts[0]), &header)
	_ = json.Unmarshal(b64(t, parts[1]), &claims)
	if header["alg"] != "ES256" || header["typ"] != "JWT" {
		t.Fatalf("jwt header = %v", header)
	}
	if claims["aud"] != "https://push.example.net:8443" || claims["sub"] != "mailto:ops@example.org" {
		t.Fatalf("claims = %v", claims)
	}
	if exp := int64(claims["exp"].(float64)); exp <= now.Unix() || exp > now.Add(24*time.Hour).Unix() {
		t.Fatalf("exp = %d", exp)
	}
	sig := b64(t, parts[2])
	if len(sig) != 64 {
		t.Fatalf("signature length = %d", len(sig))
	}
	digest := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	pubBytes := b64(t, k.PublicKey())
	pub, err := ecdsa.ParseUncompressedPublicKey(elliptic.P256(), pubBytes)
	if err != nil {
		t.Fatalf("advertised public key: %v", err)
	}
	if !ecdsa.Verify(pub, digest[:], new(big.Int).SetBytes(sig[:32]), new(big.Int).SetBytes(sig[32:])) {
		t.Fatal("JWT signature does not verify with the advertised public key")
	}
	if _, err := VAPIDAuthorization("not a url", "mailto:x@y", k, now); err == nil {
		t.Fatal("bad endpoint accepted")
	}
}

func TestVapidKeyPersistsAcrossRestart(t *testing.T) {
	dir := t.TempDir()
	k1, err := LoadOrCreateKeys(dir)
	if err != nil {
		t.Fatal(err)
	}
	st, err := os.Stat(KeyPath(dir))
	if err != nil {
		t.Fatal(err)
	}
	if st.Mode().Perm() != 0o600 {
		t.Fatalf("key file mode = %v, want 0600", st.Mode().Perm())
	}
	before, _ := os.ReadFile(KeyPath(dir))
	k2, err := LoadOrCreateKeys(dir)
	if err != nil {
		t.Fatal(err)
	}
	after, _ := os.ReadFile(KeyPath(dir))
	if k1.PublicKey() != k2.PublicKey() || !bytes.Equal(before, after) {
		t.Fatal("key regenerated on second start")
	}
	if len(b64(t, k1.PublicKey())) != 65 {
		t.Fatal("public key is not an uncompressed P-256 point")
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 {
		t.Fatalf("data dir has %d entries, want only the key file", len(entries))
	}
	if err := os.WriteFile(KeyPath(dir), []byte("garbage"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadOrCreateKeys(dir); err == nil {
		t.Fatal("corrupt key file accepted (it must never be silently replaced)")
	}
}
