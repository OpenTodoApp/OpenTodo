package caldav

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// WebDAV-Push (draft-bitfire-webdav-push-00; OpenSpec change caldav-push):
// every name the experimental draft defines is kept in this file, so a later
// revision of the draft is a small diff.

// NSPush is the draft's XML namespace.
const NSPush = "https://bitfire.at/webdav-push"

// DAVPush is the compliance class added to the DAV header while push is on.
const DAVPush = "webdav-push"

// MaxPushRegisterBytes bounds a push-register body: one subscription is a few
// hundred bytes.
const MaxPushRegisterBytes = 16 << 10

// The draft's precondition elements of a refused registration (403).
const (
	PushInvalidSubscription = "invalid-subscription"
	PushNotAvailable        = "push-not-available"
	PushNoSupportedTrigger  = "no-supported-trigger"
)

// PushRegistration is a parsed push-register request.
type PushRegistration struct {
	// PushResource is the absolute https URL the push service gave the client.
	PushResource string
	// P256DH (65 bytes, uncompressed) and Auth (16 bytes), as unpadded base64url.
	P256DH, Auth string
	// Expires is the expiry the client asked for; zero when it asked none.
	Expires time.Time
}

// PushRefusal is a registration refused with one of the draft's preconditions.
type PushRefusal struct {
	Element string // PushInvalidSubscription or PushNoSupportedTrigger
	Reason  string
}

func (e *PushRefusal) Error() string { return "push-register: " + e.Element + ": " + e.Reason }

func refuse(element, format string, a ...any) error {
	return &PushRefusal{Element: element, Reason: fmt.Sprintf(format, a...)}
}

// ParsePushRegister reads a push-register document. Anything it cannot use is a
// *PushRefusal; a body that is not a push-register at all is ErrBadXML.
func ParsePushRegister(root *Node) (PushRegistration, error) {
	var reg PushRegistration
	if !root.Is(NSPush, "push-register") {
		return reg, fmt.Errorf("%w: expected a push-register body", ErrBadXML)
	}
	sub := root.Child(NSPush, "subscription").Child(NSPush, "web-push-subscription")
	if sub == nil {
		return reg, refuse(PushInvalidSubscription, "no web-push-subscription")
	}
	resource := strings.TrimSpace(sub.Child(NSPush, "push-resource").textOrEmpty())
	u, err := url.Parse(resource)
	if resource == "" || err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || len(resource) > 2048 {
		return reg, refuse(PushInvalidSubscription, "the push resource must be an absolute https URL")
	}
	if enc := strings.TrimSpace(sub.Child(NSPush, "content-encoding").textOrEmpty()); enc != "" && !strings.EqualFold(enc, "aes128gcm") {
		return reg, refuse(PushInvalidSubscription, "only aes128gcm is supported")
	}
	key := sub.Child(NSPush, "subscription-public-key")
	if t := key.attrOrEmpty("type"); t != "" && t != "p256dh" {
		return reg, refuse(PushInvalidSubscription, "the public key must be p256dh")
	}
	p, err := decodeB64(key.textOrEmpty())
	if err != nil || len(p) != 65 || p[0] != 0x04 {
		return reg, refuse(PushInvalidSubscription, "the public key must be an uncompressed P-256 point")
	}
	a, err := decodeB64(sub.Child(NSPush, "auth-secret").textOrEmpty())
	if err != nil || len(a) != 16 {
		return reg, refuse(PushInvalidSubscription, "the auth secret must be 16 bytes")
	}
	if root.Child(NSPush, "trigger").Child(NSPush, "content-update") == nil {
		return reg, refuse(PushNoSupportedTrigger, "only content-update is supported")
	}
	if e := root.Child(NSPush, "expires"); e != nil {
		if t, err := http.ParseTime(strings.TrimSpace(e.Text)); err == nil {
			reg.Expires = t
		}
	}
	reg.PushResource = resource
	reg.P256DH = base64.RawURLEncoding.EncodeToString(p)
	reg.Auth = base64.RawURLEncoding.EncodeToString(a)
	return reg, nil
}

func (n *Node) textOrEmpty() string {
	if n == nil {
		return ""
	}
	return n.Text
}

func (n *Node) attrOrEmpty(local string) string {
	if n == nil {
		return ""
	}
	return n.Attr(local)
}

// decodeB64 reads base64url or standard base64, padded or not.
func decodeB64(s string) ([]byte, error) {
	s = strings.TrimRight(strings.TrimSpace(s), "=")
	if b, err := base64.RawURLEncoding.DecodeString(s); err == nil {
		return b, nil
	}
	return base64.RawStdEncoding.DecodeString(s)
}

// PushErrorBody is the DAV:error body of a refused registration.
func PushErrorBody(element string) []byte {
	return []byte(`<?xml version="1.0" encoding="utf-8"?>` + "\n" +
		`<d:error xmlns:d="DAV:" xmlns:p="` + NSPush + `"><p:` + element + "/></d:error>")
}

// Property names of the draft, served on the calendar home and each calendar.
var (
	PropPushTransports       = PropName{Space: NSPush, Local: "transports"}
	PropPushTopic            = PropName{Space: NSPush, Local: "topic"}
	PropPushSupportedTrigger = PropName{Space: NSPush, Local: "supported-triggers"}
)

// The inner XML of the properties declares the draft's namespace itself, so
// no other answer changes; a property of an unknown namespace is written with
// its own declaration (openTag).

// PushTransports is the inner XML of transports: Web Push with the server's
// VAPID public key (base64url).
func PushTransports(vapidKey string) string {
	return `<web-push xmlns="` + NSPush + `"><vapid-public-key type="p256ecdsa">` + Esc(vapidKey) + `</vapid-public-key></web-push>`
}

// PushSupportedTriggers is the inner XML of supported-triggers: content
// updates of the collection's members (depth 1).
const PushSupportedTriggers = `<content-update xmlns="` + NSPush + `"><d:depth>1</d:depth></content-update>`

// PushMessage is the plaintext of a push: the collection's topic and its new
// sync token, nothing about what changed.
func PushMessage(topic, syncToken string) []byte {
	return []byte(`<?xml version="1.0" encoding="utf-8"?>` + "\n" +
		`<p:push-message xmlns:p="` + NSPush + `" xmlns:d="DAV:"><p:topic>` + Esc(topic) + `</p:topic>` +
		`<p:content-update><d:sync-token>` + Esc(syncToken) + `</d:sync-token></p:content-update></p:push-message>`)
}
