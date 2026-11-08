package httpapi

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/calsync/calsynctest"
)

// A Google sign-in that fails names its cause (OpenSpec change
// google-sync-guide): the callback's error, a refused client, an unticked
// calendar permission, a disabled CalDAV API and a redirect address that is
// not the page's own.
func TestGoogleConnectNamesTheCause(t *testing.T) {
	e, srv := calsyncEnv(t)
	calsyncOn(t, e)
	allowPrivateTargets(t, e)
	cal := calsynctest.New()
	t.Cleanup(cal.Close)
	cal.Bearer = "access-1"
	forbidden := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		fmt.Fprint(w, `{"error":{"code":403,"status":"PERMISSION_DENIED","message":"CalDAV API has not been used in project 1 before or it is disabled."}}`)
	}))
	t.Cleanup(forbidden.Close)
	answer := ""
	tokens := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if strings.Contains(answer, `"error"`) {
			w.WriteHeader(400)
		}
		fmt.Fprint(w, answer)
	}))
	t.Cleanup(tokens.Close)
	srv.calsync.Token.URL = tokens.URL
	resp, out := e.do("PUT", "/api/v1/settings/calendar-sync/google", map[string]any{"client_id": "cid", "client_secret": "csecret"})
	e.mustStatus(resp, 200, out)
	redirect := out["redirect_uri"].(string)
	page, _ := url.Parse(redirect)
	origin := page.Scheme + "://" + page.Host

	// A page open under another address than the one Google would return to.
	resp, out = e.do("POST", "/api/v1/calendar-sync/google/start", nil, "Origin", "https://"+page.Host)
	if resp.StatusCode != 409 || errCode(out) != "base_url_mismatch" || strings.Contains(fmt.Sprint(out), "csecret") {
		t.Fatalf("start from another origin = %d %v", resp.StatusCode, out)
	}

	noFollow := &http.Client{Jar: e.client.Jar, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	signIn := func(query string) string {
		t.Helper()
		resp, out := e.do("POST", "/api/v1/calendar-sync/google/start", nil, "Origin", origin)
		e.mustStatus(resp, 200, out)
		auth, _ := url.Parse(out["url"].(string))
		req, _ := http.NewRequest("GET", e.srv.URL+"/api/v1/calendar-sync/google/callback?"+query+"&state="+url.QueryEscape(auth.Query().Get("state")), nil)
		cb, err := noFollow.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = io.Copy(io.Discard, cb.Body)
		cb.Body.Close()
		loc, _ := url.Parse(cb.Header.Get("Location"))
		return loc.Query().Get("calendar-sync")
	}
	ok := `{"access_token":"access-1","refresh_token":"refresh-1","expires_in":3600,"scope":"https://www.googleapis.com/auth/calendar"}`
	cases := []struct {
		name, query, token, base, want string
	}{
		{"declined or not a test user", "error=access_denied", ok, cal.URL + "/dav/", "denied"},
		{"Google's own refusal", "error=redirect_uri_mismatch", ok, cal.URL + "/dav/", "redirect_uri_mismatch"},
		{"an unknown error stays generic", "error=%3Cscript%3E", ok, cal.URL + "/dav/", "authorization_failed"},
		{"no code", "x=1", ok, cal.URL + "/dav/", "authorization_failed"},
		{"wrong client secret", "code=c", `{"error":"invalid_client"}`, cal.URL + "/dav/", "google_client_refused"},
		{"calendar permission unticked", "code=c", `{"access_token":"a","refresh_token":"r","scope":"openid"}`, cal.URL + "/dav/", "scope_not_granted"},
		{"CalDAV API disabled", "code=c", ok, forbidden.URL + "/", "caldav_api_disabled"},
		{"connected", "code=c", ok, cal.URL + "/dav/", "connected"},
	}
	for _, c := range cases {
		answer, srv.calsync.GoogleBase = c.token, c.base
		if got := signIn(c.query); got != c.want {
			t.Errorf("%s: result %q, want %q", c.name, got, c.want)
		}
	}
}
