package caldav

import (
	"errors"
	"strings"
	"testing"
	"time"
)

// The draft's example registration (draft-bitfire-webdav-push-00, "Subscription Registration").
const pushRegisterExample = `<?xml version="1.0" encoding="utf-8" ?>
<push-register xmlns="https://bitfire.at/webdav-push" xmlns:D="DAV:">
  <subscription>
    <web-push-subscription>
      <push-resource>https://up.example.net/yohd4yai5Phiz1wi</push-resource>
      <content-encoding>aes128gcm</content-encoding>
      <subscription-public-key type="p256dh">BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4</subscription-public-key>
      <auth-secret>BTBZMqHH6r4Tts7J_aSIgg</auth-secret>
    </web-push-subscription>
  </subscription>
  <trigger>
    <content-update><D:depth>1</D:depth></content-update>
    <property-update><D:depth>0</D:depth><D:prop><D:displayname/></D:prop></property-update>
  </trigger>
  <expires>Wed, 20 Dec 2023 10:03:31 GMT</expires>
</push-register>`

func parseRegister(t *testing.T, body string) (PushRegistration, error) {
	t.Helper()
	root, err := ParseXMLLimit(strings.NewReader(body), MaxPushRegisterBytes)
	if err != nil {
		t.Fatalf("parse %v", err)
	}
	return ParsePushRegister(root)
}

func TestParsePushRegisterExample(t *testing.T) {
	reg, err := parseRegister(t, pushRegisterExample)
	if err != nil {
		t.Fatal(err)
	}
	if reg.PushResource != "https://up.example.net/yohd4yai5Phiz1wi" || reg.Auth != "BTBZMqHH6r4Tts7J_aSIgg" ||
		!strings.HasPrefix(reg.P256DH, "BCVxsr7N") {
		t.Fatalf("reg = %+v", reg)
	}
	if want := time.Date(2023, 12, 20, 10, 3, 31, 0, time.UTC); !reg.Expires.Equal(want) {
		t.Fatalf("expires = %v", reg.Expires)
	}
}

func TestParsePushRegisterRefusals(t *testing.T) {
	cases := map[string]struct{ from, to, element string }{
		"http resource":     {"https://up.example.net/", "http://up.example.net/", PushInvalidSubscription},
		"relative resource": {"https://up.example.net/yohd4yai5Phiz1wi", "/yohd4yai5Phiz1wi", PushInvalidSubscription},
		"credentials":       {"https://up.example.net/", "https://a:b@up.example.net/", PushInvalidSubscription},
		"other encoding":    {">aes128gcm<", ">aesgcm<", PushInvalidSubscription},
		"short key":         {"BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", "BCVxsr7N", PushInvalidSubscription},
		"other key type":    {`type="p256dh"`, `type="x25519"`, PushInvalidSubscription},
		"short auth":        {"BTBZMqHH6r4Tts7J_aSIgg", "BTBZ", PushInvalidSubscription},
		"no content update": {"<content-update><D:depth>1</D:depth></content-update>", "", PushNoSupportedTrigger},
		"no subscription":   {"<web-push-subscription>", "<other-subscription>", PushInvalidSubscription},
	}
	for name, c := range cases {
		body := strings.Replace(pushRegisterExample, c.from, c.to, 1)
		if c.from == "<web-push-subscription>" {
			body = strings.Replace(body, "</web-push-subscription>", "</other-subscription>", 1)
		}
		_, err := parseRegister(t, body)
		var refusal *PushRefusal
		if !errors.As(err, &refusal) || refusal.Element != c.element {
			t.Errorf("%s: err = %v, want %s", name, err, c.element)
		}
	}
}

func TestParsePushRegisterOtherBody(t *testing.T) {
	_, err := parseRegister(t, `<D:propfind xmlns:D="DAV:"/>`)
	if !errors.Is(err, ErrBadXML) {
		t.Fatalf("err = %v", err)
	}
	// Without an expiry the server chooses one; a missing encoding means aes128gcm.
	body := strings.Replace(strings.Replace(pushRegisterExample, "<expires>Wed, 20 Dec 2023 10:03:31 GMT</expires>", "", 1),
		"<content-encoding>aes128gcm</content-encoding>", "", 1)
	reg, err := parseRegister(t, body)
	if err != nil || !reg.Expires.IsZero() {
		t.Fatalf("reg = %+v %v", reg, err)
	}
}

func TestParsePushRegisterTooLarge(t *testing.T) {
	big := strings.Replace(pushRegisterExample, "<expires>", "<expires>"+strings.Repeat(" ", MaxPushRegisterBytes), 1)
	if _, err := ParseXMLLimit(strings.NewReader(big), MaxPushRegisterBytes); !errors.Is(err, ErrBadXML) {
		t.Fatalf("err = %v", err)
	}
}

func TestPushMessageAndProperties(t *testing.T) {
	msg, err := ParseXML(strings.NewReader(string(PushMessage("O7M1nQ7cKkKTKsoS_j6Z3w", "urn:opentodo:sync:42"))))
	if err != nil || !msg.Is(NSPush, "push-message") {
		t.Fatalf("message = %v %v", msg, err)
	}
	if msg.Child(NSPush, "topic").textOrEmpty() != "O7M1nQ7cKkKTKsoS_j6Z3w" ||
		msg.Child(NSPush, "content-update").Child(NSDAV, "sync-token").textOrEmpty() != "urn:opentodo:sync:42" {
		t.Fatalf("message = %s", PushMessage("O7M1nQ7cKkKTKsoS_j6Z3w", "urn:opentodo:sync:42"))
	}
	// The properties are well-formed inside a multistatus answer.
	m := NewMultistatus()
	m.Response("/dav/calendars/u/inbox/", []PropValue{
		{Name: PropPushTransports, Inner: PushTransports("BKEY")},
		{Name: PropPushTopic, Inner: Esc("topic1")},
		{Name: PropPushSupportedTrigger, Inner: PushSupportedTriggers},
	}, nil)
	root, err := ParseXML(strings.NewReader(string(m.Bytes())))
	if err != nil {
		t.Fatal(err)
	}
	prop := root.Child(NSDAV, "response").Child(NSDAV, "propstat").Child(NSDAV, "prop")
	key := prop.Child(NSPush, "transports").Child(NSPush, "web-push").Child(NSPush, "vapid-public-key")
	if key == nil || key.Text != "BKEY" || key.Attr("type") != "p256ecdsa" {
		t.Fatalf("transports = %s", m.Bytes())
	}
	if prop.Child(NSPush, "supported-triggers").Child(NSPush, "content-update").Child(NSDAV, "depth").textOrEmpty() != "1" {
		t.Fatalf("supported-triggers = %s", m.Bytes())
	}
	if !strings.Contains(string(PushErrorBody(PushNotAvailable)), "<p:push-not-available/>") {
		t.Fatalf("error body = %s", PushErrorBody(PushNotAvailable))
	}
}
