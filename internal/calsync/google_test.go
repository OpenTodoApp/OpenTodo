package calsync

import "testing"

func TestGoogleResults(t *testing.T) {
	for code, want := range map[string]string{"access_denied": ResultDenied, "redirect_uri_mismatch": ResultRedirectMismatch,
		"admin_policy_enforced": ResultAuthorizationFailed, "": ResultAuthorizationFailed} {
		if got := GoogleCallbackResult(code); got != want {
			t.Errorf("callback %q = %q, want %q", code, got, want)
		}
	}
	for scope, want := range map[string]bool{"": true, "openid " + GoogleScope: true, "openid": false, GoogleScope + ".readonly": false} {
		if got := (&Token{Scope: scope}).GrantsCalendar(); got != want {
			t.Errorf("scope %q grants = %v", scope, got)
		}
	}
	if got := GoogleDiscoveryResult(statusError(403)); got != ResultCalDAVDisabled {
		t.Errorf("403 = %q", got)
	}
	if got := GoogleDiscoveryResult(statusError(401)); got != ReasonUnauthorized {
		t.Errorf("401 = %q", got)
	}
}
