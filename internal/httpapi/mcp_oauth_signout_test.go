package httpapi

import (
	"net/url"
	"testing"
)

// Sign out everywhere also ends the account's connected AI apps: the refresh
// token of an MCP OAuth grant no longer mints an access token.
func TestOAuthGrantEndsWithSignOutEverywhere(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	id, secret := e.createOAuthClient("Gemini", "agent")
	verifier, challenge := pkcePair(t)
	authorize := mcpAuthorizePath + "?" + url.Values{
		"response_type": {"code"}, "client_id": {id}, "redirect_uri": {googleRedirect},
		"code_challenge": {challenge}, "code_challenge_method": {"S256"}, "scope": {"agent"}, "state": {"s1"},
	}.Encode()
	code := mustCode(t, e.authorizeAndAllow(authorize))
	status, out := e.oauthForm(mcpTokenPath, url.Values{
		"grant_type": {"authorization_code"}, "code": {code}, "redirect_uri": {googleRedirect},
		"client_id": {id}, "client_secret": {secret}, "code_verifier": {verifier},
	})
	if status != 200 {
		t.Fatalf("exchange: %d %v", status, out)
	}
	refresh, _ := out["refresh_token"].(string)
	resp, body := e.do("POST", "/api/v1/me/sign-out-everywhere", nil)
	e.mustStatus(resp, 204, body)
	status, out = e.oauthForm(mcpTokenPath, url.Values{
		"grant_type": {"refresh_token"}, "refresh_token": {refresh}, "client_id": {id}, "client_secret": {secret},
	})
	if status != 400 || out["error"] != "invalid_grant" {
		t.Fatalf("refresh after sign-out everywhere: %d %v", status, out)
	}
}
