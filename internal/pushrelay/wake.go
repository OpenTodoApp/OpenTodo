package pushrelay

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"strconv"
	"time"
)

// signatureLabel starts every signed string (design D4).
const signatureLabel = "opentodo-push-relay/1\n"

// SignatureBase is the string a wake's signature covers:
// "opentodo-push-relay/1\n" + kind + "\n" + ts + "\n" + handle.
func SignatureBase(kind string, ts int64, handle string) []byte {
	return []byte(signatureLabel + kind + "\n" + strconv.FormatInt(ts, 10) + "\n" + handle)
}

// Sign is a wake's sig: base64url(HMAC-SHA256(wakeKey, SignatureBase)).
func Sign(wakeKey []byte, kind string, ts int64, handle string) string {
	m := hmac.New(sha256.New, wakeKey)
	m.Write(SignatureBase(kind, ts, handle))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}

// verifyWake checks a wake's signature with the handle's own key and its time
// against now. Both failures are the same answer to the caller.
func verifyWake(d Device, kind string, ts int64, handle, sig string, now time.Time) bool {
	got, err := base64.RawURLEncoding.DecodeString(sig)
	if err != nil {
		return false
	}
	m := hmac.New(sha256.New, d.WakeKey)
	m.Write(SignatureBase(kind, ts, handle))
	if !hmac.Equal(got, m.Sum(nil)) {
		return false
	}
	skew := now.Sub(time.Unix(ts, 0))
	return skew <= SignatureWindow && skew >= -SignatureWindow
}
