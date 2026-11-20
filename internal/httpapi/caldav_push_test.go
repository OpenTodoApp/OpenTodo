package httpapi

import (
	"context"
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"strings"
	gosync "sync"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/caldav"
	"github.com/OpenTodoApp/opentodo/internal/davpush"
	"github.com/OpenTodoApp/opentodo/internal/push"
)

// OpenSpec change caldav-push (GitHub issue 1585): WebDAV-Push on /dav/.

func pushRegisterBody(resource string) string {
	k, _ := ecdh.P256().GenerateKey(rand.Reader)
	auth := make([]byte, 16)
	_, _ = rand.Read(auth)
	return `<?xml version="1.0" encoding="utf-8"?>
<push-register xmlns="https://bitfire.at/webdav-push" xmlns:D="DAV:">
  <subscription><web-push-subscription>
    <push-resource>` + resource + `</push-resource>
    <subscription-public-key type="p256dh">` + base64.RawURLEncoding.EncodeToString(k.PublicKey().Bytes()) + `</subscription-public-key>
    <auth-secret>` + base64.RawURLEncoding.EncodeToString(auth) + `</auth-secret>
  </web-push-subscription></subscription>
  <trigger><content-update><D:depth>1</D:depth></content-update></trigger>
</push-register>`
}

const pushPropfind = `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:p="https://bitfire.at/webdav-push"><d:prop><p:transports/><p:topic/><p:supported-triggers/></d:prop></d:propfind>`

// fakePushService records the messages the job sends and answers with status.
type fakePushService struct {
	mu     gosync.Mutex
	sent   map[string][]push.Message
	status int
}

func (f *fakePushService) SendMessage(_ context.Context, endpoint string, m push.Message) (int, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.sent == nil {
		f.sent = map[string][]push.Message{}
	}
	f.sent[endpoint] = append(f.sent[endpoint], m)
	if f.status == 0 {
		return http.StatusCreated, nil
	}
	return f.status, nil
}

func (f *fakePushService) count(endpoint string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.sent[endpoint])
}

// pushSetup is davSetup with push to calendar apps on, the job's sender a fake
// and its clock in the test's hands.
func pushSetup(t *testing.T) (*env, *davClient, *davpush.Job, *fakePushService, *time.Time) {
	t.Helper()
	e, c := davSetup(t)
	resp, out := e.do("PUT", "/api/v1/settings/caldav/push", map[string]any{"enabled": true})
	e.mustStatus(resp, 200, out)
	job := e.server.set.DavPush
	fake := &fakePushService{}
	job.Send = fake
	now := time.Now()
	job.Store.SetClock(func() time.Time { return now })
	return e, c, job, fake, &now
}

func TestCaldavPushOffByDefault(t *testing.T) {
	e, c := davSetup(t)
	resp, _ := c.must("OPTIONS", c.cal("inbox"), "", 200)
	if strings.Contains(resp.Header.Get("DAV"), "webdav-push") {
		t.Fatalf("DAV = %q", resp.Header.Get("DAV"))
	}
	_, body := c.must("PROPFIND", c.cal("inbox"), pushPropfind, 207, "Depth", "0")
	if strings.Contains(body, "vapid-public-key") || !strings.Contains(body, "404 Not Found") {
		t.Fatalf("propfind:\n%s", body)
	}
	_, body = c.must("POST", c.cal("inbox"), pushRegisterBody("https://up.example.net/a"), 403)
	if !strings.Contains(body, "push-not-available") {
		t.Fatalf("register:\n%s", body)
	}
	_, out := e.do("GET", "/api/v1/settings/caldav/push", nil)
	if out["enabled"] != false || out["available"] != true {
		t.Fatalf("setting = %v", out)
	}
}

func TestCaldavPushMemberCannotTurnItOn(t *testing.T) {
	se := newShareEnv(t)
	resp, out := se.bob.do("PUT", "/api/v1/settings/caldav/push", map[string]any{"enabled": true})
	se.bob.mustStatus(resp, 403, out)
	if out["error"].(map[string]any)["code"] != "forbidden" {
		t.Fatalf("%v", out)
	}
	_, out = se.alice.do("GET", "/api/v1/settings/caldav/push", nil)
	if out["enabled"] != false {
		t.Fatalf("setting = %v", out)
	}
}

func TestCaldavPushAdvertisedWhileOn(t *testing.T) {
	_, c, _, _, _ := pushSetup(t)
	resp, _ := c.must("OPTIONS", c.cal("inbox"), "", 200)
	if !strings.Contains(resp.Header.Get("DAV"), "webdav-push") {
		t.Fatalf("DAV = %q", resp.Header.Get("DAV"))
	}
	for _, path := range []string{c.cal("inbox"), "/dav/calendars/" + c.uid + "/"} {
		_, body := c.must("PROPFIND", path, pushPropfind, 207, "Depth", "0")
		root, err := caldav.ParseXML(strings.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		prop := root.Child(caldav.NSDAV, "response").Child(caldav.NSDAV, "propstat").Child(caldav.NSDAV, "prop")
		key := prop.Child(caldav.NSPush, "transports").Child(caldav.NSPush, "web-push").Child(caldav.NSPush, "vapid-public-key")
		topic := prop.Child(caldav.NSPush, "topic")
		if key == nil || len(key.Text) < 80 || topic == nil || len(topic.Text) != 22 ||
			prop.Child(caldav.NSPush, "supported-triggers").Child(caldav.NSPush, "content-update") == nil {
			t.Fatalf("%s:\n%s", path, body)
		}
	}
}

func TestCaldavPushSubscribeRenewAndDelete(t *testing.T) {
	_, c, _, _, now := pushSetup(t)
	resp, _ := c.must("POST", c.cal("inbox"), pushRegisterBody("https://up.example.net/garden"), 201)
	loc := resp.Header.Get("Location")
	exp, err := http.ParseTime(resp.Header.Get("Expires"))
	if !strings.Contains(loc, "/dav/push/") || err != nil || exp.Sub(*now) < 7*24*time.Hour-time.Minute {
		t.Fatalf("Location %q Expires %q", loc, resp.Header.Get("Expires"))
	}
	*now = now.Add(24 * time.Hour)
	resp, _ = c.must("POST", c.cal("inbox"), pushRegisterBody("https://up.example.net/garden"), 204)
	exp2, _ := http.ParseTime(resp.Header.Get("Expires"))
	if resp.Header.Get("Location") != loc || !exp2.After(exp) {
		t.Fatalf("renewal Location %q Expires %q", resp.Header.Get("Location"), resp.Header.Get("Expires"))
	}
	path := loc[strings.Index(loc, "/dav/push/"):]
	c.must("DELETE", path, "", 204)
	c.must("DELETE", path, "", 404)
}

func TestCaldavPushAuthenticationRequired(t *testing.T) {
	e, c, _, _, _ := pushSetup(t)
	resp, _ := c.must("POST", c.cal("inbox"), pushRegisterBody("https://up.example.net/a"), 201)
	path := resp.Header.Get("Location")[strings.Index(resp.Header.Get("Location"), "/dav/push/"):]
	anon := &davClient{e: e, email: "owner@example.com", secret: "wrong", uid: c.uid, ip: "10.9.9.9"}
	anon.must("POST", c.cal("inbox"), pushRegisterBody("https://up.example.net/b"), 401)
	anon.must("DELETE", path, "", 401)
	var n int
	if err := e.db.QueryRow(`SELECT COUNT(*) FROM dav_push_subscriptions`).Scan(&n); err != nil || n != 1 {
		t.Fatalf("subscriptions = %d %v", n, err)
	}
}

func TestCaldavPushInvalidSubscription(t *testing.T) {
	e, c, _, _, _ := pushSetup(t)
	for _, b := range []struct{ body, element string }{
		{pushRegisterBody("http://up.example.net/a"), "invalid-subscription"},
		{pushRegisterBody("https://127.0.0.1/a"), "invalid-subscription"},
		{strings.Replace(pushRegisterBody("https://up.example.net/a"), "<content-update><D:depth>1</D:depth></content-update>", "", 1), "no-supported-trigger"},
		{strings.Replace(pushRegisterBody("https://up.example.net/a"), `type="p256dh">`, `type="p256dh">AAAA`, 1), "invalid-subscription"},
	} {
		_, out := c.must("POST", c.cal("inbox"), b.body, 403)
		if !strings.Contains(out, b.element) {
			t.Fatalf("want %s:\n%s", b.element, out)
		}
	}
	var n int
	if err := e.db.QueryRow(`SELECT COUNT(*) FROM dav_push_subscriptions`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("subscriptions = %d %v", n, err)
	}
	// A calendar the password does not see answers 404, as every request there.
	c.must("POST", c.cal("no-such-project"), pushRegisterBody("https://up.example.net/a"), 404)
}

func TestCaldavPushAnotherUsersRegistration(t *testing.T) {
	se := newShareEnv(t)
	resp, out := se.alice.do("PUT", "/api/v1/settings/caldav", map[string]any{"enabled": true})
	se.alice.mustStatus(resp, 200, out)
	resp, out = se.alice.do("PUT", "/api/v1/settings/caldav/push", map[string]any{"enabled": true})
	se.alice.mustStatus(resp, 200, out)
	alice := newDavClient(se.alice, "alice@example.com", se.ids["alice"])
	bob := newDavClient(se.bob, "bob@example.com", se.ids["bob"])
	r, _ := alice.must("POST", alice.cal("inbox"), pushRegisterBody("https://up.example.net/a"), 201)
	path := r.Header.Get("Location")[strings.Index(r.Header.Get("Location"), "/dav/push/"):]
	bob.must("DELETE", path, "", 404)
	alice.must("DELETE", path, "", 204)
}

func pushTask(t *testing.T, e *env, title string) string {
	t.Helper()
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": title})
	e.mustStatus(resp, 201, out)
	return out["id"].(string)
}

func TestCaldavPushAChangeWakesThePhone(t *testing.T) {
	e, c, job, fake, now := pushSetup(t)
	_, before := c.must("PROPFIND", c.cal("inbox"), `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:sync-token/></d:prop></d:propfind>`, 207, "Depth", "0")
	token := before[strings.Index(before, "urn:opentodo:sync:"):]
	token = token[:strings.Index(token, "<")]
	c.must("POST", c.cal("inbox"), pushRegisterBody("https://up.example.net/garden"), 201)
	ctx := context.Background()
	if _, due, _ := job.NextDue(ctx); !due {
		t.Fatal("expiry should be a due time")
	}
	job.RunOnce(ctx)
	if fake.count("https://up.example.net/garden") != 0 {
		t.Fatal("pushed before any change")
	}
	id := pushTask(t, e, "Water the plants")
	*now = now.Add(time.Second)
	job.RunOnce(ctx)
	msgs := fake.sent["https://up.example.net/garden"]
	if len(msgs) != 1 {
		t.Fatalf("messages = %d", len(msgs))
	}
	m := msgs[0]
	root, err := caldav.ParseXML(strings.NewReader(string(m.Payload)))
	if err != nil || m.Urgency != "normal" || m.TTL != davpush.MessageTTL || len(m.P256DH) != 65 || len(m.Auth) != 16 {
		t.Fatalf("message %+v %v", m, err)
	}
	topic := root.Child(caldav.NSPush, "topic").Text
	newToken := root.Child(caldav.NSPush, "content-update").Child(caldav.NSDAV, "sync-token").Text
	if topic != m.Topic || strings.Contains(string(m.Payload), "Water") || strings.Contains(string(m.Payload), id) {
		t.Fatalf("payload %s", m.Payload)
	}
	report := func(tok string) string {
		_, body := c.must("REPORT", c.cal("inbox"), `<?xml version="1.0"?><d:sync-collection xmlns:d="DAV:"><d:sync-token>`+tok+`</d:sync-token><d:prop><d:getetag/></d:prop></d:sync-collection>`, 207)
		return body
	}
	if !strings.Contains(report(token), id) {
		t.Fatal("the report since the old token lists the new task")
	}
	if strings.Contains(report(newToken), id) {
		t.Fatal("the pushed token is the current one")
	}
	// Nothing new: nothing more is sent.
	*now = now.Add(time.Minute)
	job.RunOnce(ctx)
	if fake.count("https://up.example.net/garden") != 1 {
		t.Fatalf("messages = %d", fake.count("https://up.example.net/garden"))
	}
}

func TestCaldavPushManyChangesAtOnceAndMinGap(t *testing.T) {
	e, c, job, fake, now := pushSetup(t)
	c.must("POST", c.cal("inbox"), pushRegisterBody("https://up.example.net/a"), 201)
	for i := range 20 {
		pushTask(t, e, "Imported "+string(rune('a'+i)))
	}
	ctx := context.Background()
	job.RunOnce(ctx)
	if fake.count("https://up.example.net/a") != 1 {
		t.Fatalf("messages = %d", fake.count("https://up.example.net/a"))
	}
	pushTask(t, e, "One more")
	*now = now.Add(10 * time.Second)
	job.RunOnce(ctx)
	if fake.count("https://up.example.net/a") != 1 {
		t.Fatal("a second push inside 30 seconds")
	}
	if at, due, _ := job.NextDue(ctx); !due || at.Sub(*now) > 21*time.Second {
		t.Fatalf("next = %v %v", at, due)
	}
	*now = now.Add(25 * time.Second)
	job.RunOnce(ctx)
	if fake.count("https://up.example.net/a") != 2 {
		t.Fatalf("messages = %d", fake.count("https://up.example.net/a"))
	}
}

func TestCaldavPushDontNotifyTheWriter(t *testing.T) {
	e, c, job, fake, now := pushSetup(t)
	resp, _ := c.must("POST", c.cal("inbox"), pushRegisterBody("https://up.example.net/phone"), 201)
	mine := resp.Header.Get("Location")
	c.must("POST", c.cal("inbox"), pushRegisterBody("https://up.example.net/tablet"), 201)
	c.must("PUT", c.cal("inbox")+"dav-1.ics", vtodoBody("dav-1", "SUMMARY:From the phone"), 201, "Push-Dont-Notify", `"`+mine+`"`)
	*now = now.Add(time.Second)
	job.RunOnce(context.Background())
	if fake.count("https://up.example.net/phone") != 0 || fake.count("https://up.example.net/tablet") != 1 {
		t.Fatalf("phone %d tablet %d", fake.count("https://up.example.net/phone"), fake.count("https://up.example.net/tablet"))
	}
	// A change from elsewhere still wakes it.
	pushTask(t, e, "From the web")
	*now = now.Add(time.Minute)
	job.RunOnce(context.Background())
	if fake.count("https://up.example.net/phone") != 1 {
		t.Fatalf("phone %d", fake.count("https://up.example.net/phone"))
	}
}

func TestCaldavPushGoneAndRevoked(t *testing.T) {
	e, c, job, fake, now := pushSetup(t)
	c.must("POST", c.cal("inbox"), pushRegisterBody("https://up.example.net/gone"), 201)
	fake.status = http.StatusGone
	pushTask(t, e, "A change")
	job.RunOnce(context.Background())
	var n int
	if err := e.db.QueryRow(`SELECT COUNT(*) FROM dav_push_subscriptions`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("after 410: %d %v", n, err)
	}
	fake.status = 0
	pushTask(t, e, "Another")
	*now = now.Add(time.Minute)
	job.RunOnce(context.Background())
	if fake.count("https://up.example.net/gone") != 1 {
		t.Fatalf("sent after removal: %d", fake.count("https://up.example.net/gone"))
	}
	// Revoking the app password removes its subscriptions.
	c.must("POST", c.cal("inbox"), pushRegisterBody("https://up.example.net/kept"), 201)
	_, out := e.do("GET", "/api/v1/app-passwords", nil)
	id := out["appPasswords"].([]any)[0].(map[string]any)["id"].(string)
	resp, out := e.do("DELETE", "/api/v1/app-passwords/"+id, nil)
	if resp.StatusCode >= 300 {
		t.Fatalf("revoke %d %v", resp.StatusCode, out)
	}
	if err := e.db.QueryRow(`SELECT COUNT(*) FROM dav_push_subscriptions`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("after revoke: %d %v", n, err)
	}
}

// An app password scoped to the workspace Work cannot subscribe to a calendar
// outside it, and changes outside its scope do not wake it.
func TestCaldavPushOutsideTheScope(t *testing.T) {
	e, all, job, fake, now := pushSetup(t)
	resp, out := e.do("POST", "/api/v1/workspaces", map[string]any{"name": "Work"})
	e.mustStatus(resp, 201, out)
	work := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Personal"})
	e.mustStatus(resp, 201, out)
	personal := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Website", "workspace_id": work})
	e.mustStatus(resp, 201, out)
	website := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/app-passwords", map[string]any{"name": "Work phone", "scope": map[string]any{"mode": "only", "workspaces": []string{work}}})
	e.mustStatus(resp, 201, out)
	c := &davClient{e: e, email: "owner@example.com", secret: out["secret"].(string), uid: all.uid}
	c.must("POST", c.cal(personal), pushRegisterBody("https://up.example.net/personal"), 404)
	c.must("POST", "/dav/calendars/"+all.uid+"/", pushRegisterBody("https://up.example.net/work-home"), 201)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Private", "project_id": personal})
	e.mustStatus(resp, 201, out)
	*now = now.Add(time.Second)
	job.RunOnce(context.Background())
	if fake.count("https://up.example.net/work-home") != 0 {
		t.Fatal("a change outside the scope woke the work phone")
	}
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Deploy", "project_id": website})
	e.mustStatus(resp, 201, out)
	*now = now.Add(time.Minute)
	job.RunOnce(context.Background())
	if fake.count("https://up.example.net/work-home") != 1 {
		t.Fatalf("messages = %d", fake.count("https://up.example.net/work-home"))
	}
}

// A task moved out of a calendar wakes that calendar's subscription: its
// sync-collection report lists the task as gone.
func TestCaldavPushMovedOut(t *testing.T) {
	e, c, job, fake, now := pushSetup(t)
	id := pushTask(t, e, "Move me")
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Garden"})
	e.mustStatus(resp, 201, out)
	garden := out["id"].(string)
	c.must("POST", c.cal("inbox"), pushRegisterBody("https://up.example.net/inbox"), 201)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"project_id": garden})
	e.mustStatus(resp, 200, out)
	*now = now.Add(time.Second)
	job.RunOnce(context.Background())
	if fake.count("https://up.example.net/inbox") != 1 {
		t.Fatalf("messages = %d", fake.count("https://up.example.net/inbox"))
	}
}
