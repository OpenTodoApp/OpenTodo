package httpapi

import (
	"net/url"
	"testing"

	"github.com/pixari/opentodo/internal/mail"
	"github.com/pixari/opentodo/internal/mail/smtptest"
	"github.com/pixari/opentodo/internal/settings"
)

// digestEnv is mailEnv with a public base URL, which the digest's link needs.
func digestEnv(t *testing.T) (*env, *smtptest.Server) {
	t.Helper()
	srv := smtptest.New(t, smtptest.Options{User: "todo", Pass: "hunter2"})
	e := newEnvWith(t, false, func(s *Server) {
		s.cfg.BaseURL, _ = url.Parse("https://todo.example.com")
		s.mail = mail.New(settings.New(s.sync.DB()), s.cfg.DataDir, mail.Options{Audit: s.audit, Log: s.log, Transport: &mail.Transport{RootCAs: srv.RootCAs()}})
	})
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	return e, srv
}

func TestDigestSettingsRoute(t *testing.T) {
	e, srv := digestEnv(t)
	on := map[string]any{"enabled": true, "weekday": 5, "hour": 7, "timeZone": "Europe/Zurich", "language": "de"}
	// Without outgoing email: GET says unavailable, PUT is 404.
	resp, out := e.do("GET", "/api/v1/me/email-digest", nil)
	e.mustStatus(resp, 200, out)
	if out["available"] != false || out["unavailableReason"] != "smtp_disabled" || out["enabled"] != false {
		t.Fatalf("unconfigured = %v", out)
	}
	resp, out = e.do("PUT", "/api/v1/me/email-digest", on)
	if resp.StatusCode != 404 || errCode(out) != "smtp_disabled" {
		t.Fatalf("PUT unconfigured = %d %v", resp.StatusCode, out)
	}
	e.configureMail(srv)
	resp, out = e.do("PUT", "/api/v1/me/email-digest", on)
	e.mustStatus(resp, 200, out)
	if out["enabled"] != true || out["timeZone"] != "Europe/Zurich" || out["language"] != "de" || out["nextSendAt"] == nil {
		t.Fatalf("enabled = %v", out)
	}
	resp, out = e.do("GET", "/api/v1/me/email-digest", nil)
	if out["enabled"] != true || out["weekday"] != float64(5) || out["available"] != true {
		t.Fatalf("GET = %v", out)
	}
	for field, bad := range map[string]any{"timeZone": "Mars/Olympus", "hour": 24, "language": "ja", "weekday": 9} {
		body := map[string]any{"enabled": true, "weekday": 5, "hour": 7, "timeZone": "UTC", "language": "en"}
		body[field] = bad
		resp, out = e.do("PUT", "/api/v1/me/email-digest", body)
		if resp.StatusCode != 400 || errCode(out) != "invalid_input" {
			t.Fatalf("%s=%v → %d %v", field, bad, resp.StatusCode, out)
		}
	}
	// Tokens: read and agent refused on both routes; anonymous 401.
	resp, out = e.do("POST", "/api/v1/tokens", map[string]any{"name": "ro", "scope": "read"})
	e.mustStatus(resp, 201, out)
	ro := out["secret"].(string)
	anon := newClientFor(e)
	for _, m := range []string{"GET", "PUT"} {
		resp, out = anon.do(m, "/api/v1/me/email-digest", on, "Authorization", "Bearer "+ro)
		if resp.StatusCode != 403 || errCode(out) != "insufficient_scope" {
			t.Fatalf("read token %s = %d %v", m, resp.StatusCode, out)
		}
		resp, _ = anon.do(m, "/api/v1/me/email-digest", on)
		if resp.StatusCode != 401 {
			t.Fatalf("anonymous %s = %d", m, resp.StatusCode)
		}
	}
}

func TestDigestOffWithEncryption(t *testing.T) {
	e, srv := digestEnv(t)
	e.configureMail(srv)
	resp, out := e.do("PUT", "/api/v1/me/email-digest", map[string]any{"enabled": true, "weekday": 5, "hour": 7, "timeZone": "UTC", "language": "en"})
	e.mustStatus(resp, 200, out)
	resp, out = e.do("PUT", "/api/v1/encryption/keys", keyRecord(1, 7))
	e.mustStatus(resp, 201, out)
	if out["digestDisabled"] != true {
		t.Fatalf("encryption response = %v", out)
	}
	resp, out = e.do("GET", "/api/v1/me/email-digest", nil)
	if out["enabled"] != false || out["encrypted"] != true {
		t.Fatalf("after encryption = %v", out)
	}
	resp, out = e.do("PUT", "/api/v1/me/email-digest", map[string]any{"enabled": true, "weekday": 5, "hour": 7, "timeZone": "UTC", "language": "en"})
	if resp.StatusCode != 409 || errCode(out) != "encryption_enabled" {
		t.Fatalf("enable while encrypted = %d %v", resp.StatusCode, out)
	}
}
