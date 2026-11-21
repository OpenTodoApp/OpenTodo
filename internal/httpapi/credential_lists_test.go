package httpapi

import "testing"

// The account's own credentials (its API tokens and the AI apps connected over
// OAuth) are listed for the signed-in person and full tokens only: a read or an
// agent token gets 403 insufficient_scope, as on /api/v1/me/agent-access.
func TestCredentialListsNeedAFullToken(t *testing.T) {
	e := ownerEnv(t)
	e.allowWrites(true)
	e.allowMyAssistants(true)
	_, agent := e.namedToken("Desk assistant", "agent")
	_, read := e.namedToken("Read script", "read")
	_, full := e.namedToken("Full script", "full")
	c := e.bearerClient()
	for _, path := range []string{"/api/v1/tokens", connectedAppsPath} {
		for name, secret := range map[string]string{"agent": agent, "read": read} {
			resp, out := c.do("GET", path, nil, bearer(secret)...)
			if resp.StatusCode != 403 || errCode(out) != "insufficient_scope" {
				t.Errorf("%s token on GET %s = %d %v, want 403 insufficient_scope", name, path, resp.StatusCode, out)
			}
		}
		resp, out := c.do("GET", path, nil, bearer(full)...)
		e.mustStatus(resp, 200, out)
		resp, out = e.do("GET", path, nil)
		e.mustStatus(resp, 200, out)
	}
}
