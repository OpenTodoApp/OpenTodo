package httpapi

import (
	"net/http"
	"testing"
)

// OpenSpec change owner-bootstrap: OPENTODO_SETUP_TOKEN guards the first account.

const testSetupToken = "0123456789abcdef-setup"

func newSetupTokenEnv(t *testing.T, allowSignup bool) *env {
	t.Helper()
	return newEnvWith(t, allowSignup, func(s *Server) { s.auth.SetSetupToken(testSetupToken) })
}

func TestRegisterSetupTokenStatus(t *testing.T) {
	e := newSetupTokenEnv(t, false)
	_, out := e.do("GET", "/api/v1/auth/status", nil)
	if out["setupRequired"] != true || out["setupTokenRequired"] != true {
		t.Fatalf("status before setup: %v", out)
	}

	plain := newEnv(t, false)
	_, out = plain.do("GET", "/api/v1/auth/status", nil)
	if out["setupTokenRequired"] != false {
		t.Fatalf("without a configured token setupTokenRequired = %v, want false", out["setupTokenRequired"])
	}
}

func TestRegisterSetupTokenMissingOrWrong(t *testing.T) {
	e := newSetupTokenEnv(t, false)
	for name, body := range map[string]map[string]string{
		"missing": {"email": "owner@example.com", "password": "correct horse battery"},
		"wrong":   {"email": "owner@example.com", "password": "correct horse battery", "setupToken": "not-the-token-at-all"},
	} {
		resp, out := e.do("POST", "/api/v1/auth/register", body)
		if resp.StatusCode != http.StatusForbidden || errCode(out) != "setup_token_invalid" {
			t.Fatalf("%s token: %d %v", name, resp.StatusCode, out)
		}
	}
	_, out := e.do("GET", "/api/v1/auth/status", nil)
	if out["setupRequired"] != true {
		t.Fatalf("an account was created without the token: %v", out)
	}
}

func TestRegisterSetupTokenCountsAgainstLimiter(t *testing.T) {
	e := newSetupTokenEnv(t, false)
	body := map[string]string{"email": "owner@example.com", "password": "correct horse battery", "setupToken": "guess-guess-guess"}
	var last int
	for i := 0; i < 15; i++ {
		resp, _ := e.do("POST", "/api/v1/auth/register", body)
		last = resp.StatusCode
	}
	if last != http.StatusTooManyRequests {
		t.Fatalf("after 15 wrong tokens the status is %d, want 429", last)
	}
}

func TestRegisterSetupTokenCorrect(t *testing.T) {
	e := newSetupTokenEnv(t, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{
		"email": "owner@example.com", "name": "Owner", "password": "correct horse battery", "setupToken": "  " + testSetupToken + " ",
	})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("register with the token: %d %v", resp.StatusCode, out)
	}
	if u, _ := out["user"].(map[string]any); u["role"] != "owner" {
		t.Fatalf("first account role: %v", out)
	}
	_, out = e.do("GET", "/api/v1/auth/status", nil)
	if out["setupRequired"] != false || out["setupTokenRequired"] != false {
		t.Fatalf("status after setup: %v", out)
	}
}

func TestRegisterSetupTokenIgnoredAfterSetup(t *testing.T) {
	e := newSetupTokenEnv(t, true)
	if resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{
		"email": "owner@example.com", "password": "correct horse battery", "setupToken": testSetupToken,
	}); resp.StatusCode != http.StatusCreated {
		t.Fatalf("owner: %d %v", resp.StatusCode, out)
	}
	// Open sign-up decides now: a member registers without any token.
	other := newClientFor(e)
	if resp, out := other.do("POST", "/api/v1/auth/register", map[string]string{
		"email": "member@example.com", "password": "another long password",
	}); resp.StatusCode != http.StatusCreated {
		t.Fatalf("member after setup: %d %v", resp.StatusCode, out)
	}
}
