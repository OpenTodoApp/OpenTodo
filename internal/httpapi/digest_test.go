package httpapi

import (
	"net/http"
	"strings"
	"testing"
)

// The weekly digest settings route (OpenSpec change stats-and-review, task 4.4):
// every scenario of email-digest "Digest settings route", the demo refusal and
// encryption turning the digest off (task 4.1).

func digestEnv(t *testing.T) *env {
	t.Helper()
	e, srv := mailEnv(t, false)
	e.configureMail(srv)
	return e
}

var zurichFriday = map[string]any{"enabled": true, "weekday": 5, "hour": 7, "timeZone": "Europe/Zurich", "language": "de"}

func TestDigestEnable(t *testing.T) {
	e := digestEnv(t)
	resp, out := e.do("GET", "/api/v1/me/email-digest", nil)
	e.mustStatus(resp, 200, out)
	if out["available"] != true || out["enabled"] != false || out["nextSendAt"] != nil {
		t.Fatalf("initial = %v", out)
	}
	resp, out = e.do("PUT", "/api/v1/me/email-digest", zurichFriday)
	e.mustStatus(resp, 200, out)
	if out["enabled"] != true || out["weekday"] != float64(5) || out["hour"] != float64(7) || out["timeZone"] != "Europe/Zurich" || out["language"] != "de" {
		t.Fatalf("stored = %v", out)
	}
	if _, ok := out["nextSendAt"].(float64); !ok {
		t.Fatalf("no nextSendAt: %v", out)
	}
	put := out
	resp, out = e.do("GET", "/api/v1/me/email-digest", nil)
	e.mustStatus(resp, 200, out)
	for _, k := range []string{"enabled", "weekday", "hour", "timeZone", "language", "nextSendAt"} {
		if out[k] != put[k] {
			t.Fatalf("GET %s = %v, PUT said %v", k, out[k], put[k])
		}
	}
	// A partial update keeps the other fields.
	resp, out = e.do("PUT", "/api/v1/me/email-digest", map[string]any{"enabled": false})
	e.mustStatus(resp, 200, out)
	if out["enabled"] != false || out["timeZone"] != "Europe/Zurich" || out["nextSendAt"] != nil {
		t.Fatalf("after turning off = %v", out)
	}
}

func TestDigestUnavailableWithoutOutgoingEmail(t *testing.T) {
	e := ownerEnv(t) // no mailer wired
	resp, out := e.do("GET", "/api/v1/me/email-digest", nil)
	e.mustStatus(resp, 200, out)
	if out["available"] != false {
		t.Fatalf("GET = %v", out)
	}
	resp, out = e.do("PUT", "/api/v1/me/email-digest", zurichFriday)
	if resp.StatusCode != 404 || errCode(out) != "smtp_disabled" {
		t.Fatalf("PUT = %d %v", resp.StatusCode, out)
	}
	// Wired but not configured is the same.
	m, _ := mailEnv(t, false)
	resp, out = m.do("PUT", "/api/v1/me/email-digest", zurichFriday)
	if resp.StatusCode != 404 || errCode(out) != "smtp_disabled" {
		t.Fatalf("unconfigured PUT = %d %v", resp.StatusCode, out)
	}
}

func TestDigestRefusedOnDemo(t *testing.T) {
	d := newDemoServer(t)
	e, _ := d.visitor()
	resp, out := e.do("PUT", "/api/v1/me/email-digest", zurichFriday)
	if resp.StatusCode != http.StatusForbidden || errCode(out) != "demo_restricted" {
		t.Fatalf("PUT on demo = %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("GET", "/api/v1/me/email-digest", nil)
	e.mustStatus(resp, 200, out)
	if out["available"] != false {
		t.Fatalf("GET on demo = %v", out)
	}
}

func TestDigestEncryptedAccountRefused(t *testing.T) {
	e := digestEnv(t)
	resp, out := e.do("PUT", "/api/v1/encryption/keys", keyRecord(1, 1))
	e.mustStatus(resp, 201, out)
	resp, out = e.do("PUT", "/api/v1/me/email-digest", zurichFriday)
	if resp.StatusCode != http.StatusConflict || errCode(out) != "encryption_enabled" || !strings.Contains(errMessage(out), "task titles") {
		t.Fatalf("PUT = %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("GET", "/api/v1/me/email-digest", nil)
	e.mustStatus(resp, 200, out)
	if out["enabled"] != false || out["encryption"] != true || out["timeZone"] != "UTC" {
		t.Fatalf("stored after refusal = %v", out)
	}
}

func TestDigestInvalidInput(t *testing.T) {
	e := digestEnv(t)
	for field, body := range map[string]map[string]any{
		"timeZone": {"enabled": true, "weekday": 5, "hour": 7, "timeZone": "Mars/Olympus", "language": "en"},
		"hour":     {"enabled": true, "weekday": 5, "hour": 24, "timeZone": "UTC", "language": "en"},
		"weekday":  {"enabled": true, "weekday": -1, "hour": 7, "timeZone": "UTC", "language": "en"},
		"language": {"enabled": true, "weekday": 5, "hour": 7, "timeZone": "UTC", "language": "ja"},
	} {
		resp, out := e.do("PUT", "/api/v1/me/email-digest", body)
		if resp.StatusCode != 400 || errCode(out) != "invalid_input" || !strings.HasPrefix(errMessage(out), field) {
			t.Fatalf("%s: %d %v", field, resp.StatusCode, out)
		}
	}
	resp, out := e.do("GET", "/api/v1/me/email-digest", nil)
	e.mustStatus(resp, 200, out)
	if out["enabled"] != false {
		t.Fatalf("an invalid PUT stored something: %v", out)
	}
}

func TestDigestAnonymousAndLimitedTokens(t *testing.T) {
	e := digestEnv(t)
	anon := e.bearerClient()
	for _, method := range []string{"GET", "PUT"} {
		resp, out := anon.do(method, "/api/v1/me/email-digest", zurichFriday)
		if resp.StatusCode != 401 || errCode(out) != "unauthorized" {
			t.Fatalf("anonymous %s = %d %v", method, resp.StatusCode, out)
		}
	}
	for _, scope := range []string{"read", "agent"} {
		secret := e.token(scope)
		for _, method := range []string{"GET", "PUT"} {
			resp, out := anon.do(method, "/api/v1/me/email-digest", zurichFriday, bearer(secret)...)
			if resp.StatusCode != 403 || errCode(out) != "insufficient_scope" {
				t.Fatalf("%s token %s = %d %v", scope, method, resp.StatusCode, out)
			}
		}
	}
	full := e.token("full")
	resp, out := anon.do("PUT", "/api/v1/me/email-digest", zurichFriday, bearer(full)...)
	anon.mustStatus(resp, 200, out)
}

// TestEncryptionTurnsDigestOff (email-digest "Enable encryption with a digest on").
func TestEncryptionTurnsDigestOff(t *testing.T) {
	e := digestEnv(t)
	resp, out := e.do("PUT", "/api/v1/me/email-digest", zurichFriday)
	e.mustStatus(resp, 200, out)
	resp, out = e.do("PUT", "/api/v1/encryption/keys", keyRecord(1, 1))
	e.mustStatus(resp, 201, out)
	if out["digestDisabled"] != true {
		t.Fatalf("encryption response = %v", out)
	}
	resp, out = e.do("GET", "/api/v1/me/email-digest", nil)
	e.mustStatus(resp, 200, out)
	if out["enabled"] != false || out["nextSendAt"] != nil {
		t.Fatalf("digest after encryption = %v", out)
	}
}
