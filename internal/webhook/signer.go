package webhook

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strconv"

	"github.com/pixari/opentodo/internal/ids"
)

// SecretPrefix marks webhook signing secrets so they are recognisable in logs and
// secret scanners.
const SecretPrefix = "whsec_"

// Header names sent with every delivery.
const (
	HeaderEvent     = "X-OpenTodo-Event"
	HeaderDelivery  = "X-OpenTodo-Delivery"
	HeaderWebhook   = "X-OpenTodo-Webhook"
	HeaderTimestamp = "X-OpenTodo-Timestamp"
	HeaderSignature = "X-OpenTodo-Signature"
)

// NewSecret returns a fresh signing secret: 32 random bytes, base64url, prefixed.
func NewSecret() string { return SecretPrefix + ids.Secret(32) }

// Sign computes the v1 signature: hex(HMAC-SHA256(secret, "<timestamp>.<body>")).
// The key is the whole secret string as shown to the user, prefix included, so a
// receiver can paste it as-is.
func Sign(secret string, timestamp int64, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(strconv.FormatInt(timestamp, 10)))
	mac.Write([]byte{'.'})
	mac.Write(body)
	return "v1=" + hex.EncodeToString(mac.Sum(nil))
}

// Verify is the receiver-side check, used by tests and kept here as the
// reference implementation for docs/webhooks.md.
func Verify(secret string, timestamp int64, body []byte, signature string) bool {
	return hmac.Equal([]byte(Sign(secret, timestamp, body)), []byte(signature))
}

// SetHeaders writes the full header set for one delivery attempt.
func SetHeaders(h http.Header, version, event, deliveryID, webhookID, secret string, timestamp int64, body []byte) {
	h.Set("Content-Type", "application/json")
	h.Set("User-Agent", "OpenTodo/"+version)
	h.Set(HeaderEvent, event)
	h.Set(HeaderDelivery, deliveryID)
	h.Set(HeaderWebhook, webhookID)
	h.Set(HeaderTimestamp, strconv.FormatInt(timestamp, 10))
	h.Set(HeaderSignature, Sign(secret, timestamp, body))
}
