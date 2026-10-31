package httpapi

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/calsync"
	"github.com/OpenTodoApp/opentodo/internal/calsync/graphtest"
)

// Microsoft calendars over HTTP (OpenSpec change outlook-calendar-sync, tasks
// 2.2 and 3.1). Microsoft's sign-in and Graph are the in-process fake on
// loopback; nothing leaves the machine.

// microsoftEnv is the owner with calendar sync on, private targets allowed and
// the worker pointed at the fake.
func microsoftEnv(t *testing.T) (*env, *Server, *graphtest.Server) {
	e, srv := calsyncEnv(t)
	calsyncOn(t, e)
	allowPrivateTargets(t, e)
	ms := graphtest.New()
	t.Cleanup(ms.Close)
	srv.calsync.MicrosoftToken.Login = ms.URL
	srv.calsync.GraphBase = ms.GraphBase()
	return e, srv, ms
}

func TestMicrosoftClientSetting(t *testing.T) {
	e, srv, ms := microsoftEnv(t)
	resp, out := e.do("GET", "/api/v1/settings/calendar-sync/microsoft", nil)
	e.mustStatus(resp, 200, out)
	if out["secret_set"] != false || out["tenant"] != "common" || !strings.HasSuffix(out["redirect_uri"].(string), "/api/v1/calendar-sync/microsoft/callback") {
		t.Fatalf("empty client = %v", out)
	}
	_, out = e.do("GET", "/api/v1/settings/calendar-sync", nil)
	if out["microsoft"] != false {
		t.Fatalf("setting = %v", out)
	}
	// Bad tenant: refused, nothing stored.
	resp, out = e.do("PUT", "/api/v1/settings/calendar-sync/microsoft", map[string]any{"client_id": "cid", "client_secret": "x", "tenant": "contoso corp"})
	if resp.StatusCode != 400 || errCode(out) != "invalid_input" || !strings.Contains(fmt.Sprint(out), "tenant") {
		t.Fatalf("bad tenant = %d %v", resp.StatusCode, out)
	}
	if c, _ := srv.calsync.Microsoft.Client(context.Background()); c.ID != "" || c.Secret != "" {
		t.Fatalf("stored after a bad tenant: %+v", c)
	}
	resp, out = e.do("PUT", "/api/v1/settings/calendar-sync/microsoft", map[string]any{"client_id": ms.ClientID, "client_secret": ms.ClientSecret})
	e.mustStatus(resp, 200, out)
	if out["tenant"] != "common" || out["secret_set"] != true || strings.Contains(fmt.Sprint(out), ms.ClientSecret) {
		t.Fatalf("saved = %v", out)
	}
	raw, _ := os.ReadFile(srv.calsync.Secrets.Path())
	if !strings.Contains(string(raw), "microsoft.client_secret") {
		t.Fatal("the secret is not in the secrets file")
	}
	m, _ := e.member("m@example.com", "198.51.100.41")
	resp, out = m.do("GET", "/api/v1/settings/calendar-sync", nil)
	m.mustStatus(resp, 200, out)
	if out["microsoft"] != true {
		t.Fatalf("member setting = %v", out)
	}
	if resp, out := m.do("GET", "/api/v1/settings/calendar-sync/microsoft", nil); resp.StatusCode != 403 || errCode(out) != "forbidden" {
		t.Fatalf("member = %d %v", resp.StatusCode, out)
	}
	anon := newClientAt(e, "10.9.9.12")
	for _, c := range []struct{ method, path string }{{"GET", "/api/v1/settings/calendar-sync/microsoft"}, {"POST", "/api/v1/calendar-sync/microsoft/start"}} {
		if resp, out := anon.do(c.method, c.path, nil); resp.StatusCode != 401 || errCode(out) != "unauthorized" {
			t.Fatalf("anonymous %s = %d %v", c.path, resp.StatusCode, out)
		}
	}
	full := e.token("full")
	bare := e.bearerClient()
	if resp, out := bare.do("PUT", "/api/v1/settings/calendar-sync/microsoft", map[string]any{"client_id": "other"}, bearer(full)...); resp.StatusCode != 403 || errCode(out) != "insufficient_scope" {
		t.Fatalf("full token = %d %v", resp.StatusCode, out)
	}
	if c, _ := srv.calsync.Microsoft.Client(context.Background()); c.ID != ms.ClientID {
		t.Fatalf("a full token changed the client: %+v", c)
	}
	var n int
	e.db.QueryRow(`SELECT COUNT(*) FROM audit_events WHERE name = 'settings.changed' AND details LIKE '%calendar_sync.microsoft_client%' AND details NOT LIKE '%` + ms.ClientSecret + `%'`).Scan(&n)
	if n != 1 {
		t.Fatalf("%d settings.changed events", n)
	}
	// The environment wins.
	srv.calsync.Microsoft.Env.ClientID, srv.calsync.Microsoft.Env.ClientSecret = "env-id", "env-secret"
	_, out = e.do("GET", "/api/v1/settings/calendar-sync/microsoft", nil)
	if out["from_env"] != true || out["client_id"] != "env-id" {
		t.Fatalf("env = %v", out)
	}
	if resp, out := e.do("PUT", "/api/v1/settings/calendar-sync/microsoft", map[string]any{"client_id": "x"}); resp.StatusCode != 409 || errCode(out) != "managed_by_environment" {
		t.Fatalf("env put = %d %v", resp.StatusCode, out)
	}
}

func TestMicrosoftRoutesRefusedOnDemo(t *testing.T) {
	d := newDemoServer(t)
	anon := d.anonymous()
	for _, c := range []struct{ method, path string }{
		{"GET", "/api/v1/settings/calendar-sync/microsoft"}, {"PUT", "/api/v1/settings/calendar-sync/microsoft"},
		{"POST", "/api/v1/calendar-sync/microsoft/start"}, {"GET", "/api/v1/calendar-sync/microsoft/callback"},
	} {
		if resp, out := anon.do(c.method, c.path, map[string]any{}); resp.StatusCode != 403 || errCode(out) != "demo_restricted" {
			t.Fatalf("%s %s = %d %v", c.method, c.path, resp.StatusCode, out)
		}
	}
}

// msCallback sends the browser back from Microsoft and returns where it lands.
func msCallback(t *testing.T, e *env, query url.Values) string {
	t.Helper()
	noFollow := &http.Client{Jar: e.client.Jar, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	req, _ := http.NewRequest("GET", e.srv.URL+"/api/v1/calendar-sync/microsoft/callback?"+query.Encode(), nil)
	resp, err := noFollow.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
	if resp.StatusCode != http.StatusSeeOther {
		t.Fatalf("callback = %d", resp.StatusCode)
	}
	return resp.Header.Get("Location")
}

// msStart starts a sign-in and returns its state.
func msStart(t *testing.T, e *env, body map[string]any) string {
	t.Helper()
	resp, out := e.do("POST", "/api/v1/calendar-sync/microsoft/start", body)
	e.mustStatus(resp, 200, out)
	u, _ := url.Parse(out["url"].(string))
	return u.Query().Get("state")
}

func TestMicrosoftConnectFlow(t *testing.T) {
	e, srv, ms := microsoftEnv(t)
	if resp, out := e.do("POST", "/api/v1/calendar-sync/microsoft/start", nil); resp.StatusCode != 409 || errCode(out) != "microsoft_not_configured" {
		t.Fatalf("start without client = %d %v", resp.StatusCode, out)
	}
	resp, out := e.do("PUT", "/api/v1/settings/calendar-sync/microsoft", map[string]any{"client_id": ms.ClientID, "client_secret": ms.ClientSecret, "tenant": "consumers"})
	e.mustStatus(resp, 200, out)
	resp, out = e.do("POST", "/api/v1/calendar-sync/microsoft/start", nil)
	e.mustStatus(resp, 200, out)
	auth, _ := url.Parse(out["url"].(string))
	q := auth.Query()
	if auth.Path != "/consumers/oauth2/v2.0/authorize" || q.Get("client_id") != ms.ClientID || q.Get("code_challenge") == "" ||
		!strings.Contains(q.Get("scope"), "Calendars.ReadWrite") || !strings.HasSuffix(q.Get("redirect_uri"), "/api/v1/calendar-sync/microsoft/callback") {
		t.Fatalf("authorization url = %s", auth)
	}
	state := q.Get("state")
	if loc := msCallback(t, e, url.Values{"code": {ms.Code}, "state": {state}}); !strings.Contains(loc, "calendar-sync=connected") {
		t.Fatalf("location = %s", loc)
	}
	if loc := msCallback(t, e, url.Values{"code": {ms.Code}, "state": {state}}); !strings.Contains(loc, "invalid_state") {
		t.Fatalf("replayed state = %s", loc)
	}
	resp, out = e.do("GET", "/api/v1/calendar-sync/connections", nil)
	e.mustStatus(resp, 200, out)
	list := out["connections"].([]any)
	c := list[0].(map[string]any)
	if len(list) != 1 || c["provider"] != "microsoft" || c["state"] != "choose_calendar" || c["username"] != "me@outlook.com" || c["password_set"] != true {
		t.Fatalf("connections = %v", list)
	}
	id := c["id"].(string)
	if cals := c["calendars"].([]any); len(cals) != 1 || cals[0].(map[string]any)["time_zone"] != "Europe/Berlin" {
		t.Fatalf("calendars = %v", cals)
	}
	if strings.Contains(fmt.Sprint(out), "refresh-") {
		t.Fatal("the refresh token was served")
	}
	// Choose the calendar and sync: the task reaches Outlook.
	resp, out = e.do("PATCH", "/api/v1/calendar-sync/connections/"+id, map[string]any{"target": "cal-work"})
	e.mustStatus(resp, 200, out)
	resp, out = e.do("POST", "/api/v1/calendar-sync/connections/"+id+"/sync", nil)
	e.mustStatus(resp, 200, out)
	if out["ok"] != true {
		t.Fatalf("sync = %v", out)
	}
	// Reconnect the same connection.
	state = msStart(t, e, map[string]any{"connection_id": id})
	if loc := msCallback(t, e, url.Values{"code": {ms.Code}, "state": {state}}); !strings.Contains(loc, "connected") || !strings.Contains(loc, id) {
		t.Fatalf("reconnect = %s", loc)
	}
	if list, _ := srv.calsync.Store.List(context.Background(), userIDOf(t, e)); len(list) != 1 {
		t.Fatalf("reconnect made %d connections", len(list))
	}
	// A Google state is not a Microsoft state.
	gstate := "google-state"
	_ = srv.calsync.Store.PutState(context.Background(), calsync.StateHash(gstate), calsync.OAuthState{UserID: userIDOf(t, e), Verifier: "v", RedirectURI: "r"}, calsync.StateTTL)
	if loc := msCallback(t, e, url.Values{"code": {ms.Code}, "state": {gstate}}); !strings.Contains(loc, "invalid_state") {
		t.Fatalf("google state = %s", loc)
	}
	// Another user's state.
	m, _ := e.member("m3@example.com", "198.51.100.43")
	mstate := msStart(t, m, nil)
	if loc := msCallback(t, e, url.Values{"code": {ms.Code}, "state": {mstate}}); !strings.Contains(loc, "invalid_state") {
		t.Fatalf("other user's state = %s", loc)
	}
}

func TestMicrosoftCallbackRefusals(t *testing.T) {
	e, srv, ms := microsoftEnv(t)
	resp, out := e.do("PUT", "/api/v1/settings/calendar-sync/microsoft", map[string]any{"client_id": ms.ClientID, "client_secret": ms.ClientSecret})
	e.mustStatus(resp, 200, out)
	for _, c := range []struct {
		query url.Values
		want  string
	}{
		{url.Values{"error": {"access_denied"}, "error_description": {"AADSTS65004: User declined to consent"}}, "calendar-sync=denied"},
		{url.Values{"error": {"access_denied"}, "error_description": {"AADSTS65001: The user or administrator has not consented"}}, "calendar-sync=admin_consent_required"},
		{url.Values{"error": {"invalid_request"}, "error_description": {"AADSTS90094: Admin consent is required"}}, "calendar-sync=admin_consent_required"},
		{url.Values{"error": {"server_error"}}, "calendar-sync=authorization_failed"},
		{url.Values{"code": {"wrong-code"}}, "calendar-sync=unauthorized"},
	} {
		c.query.Set("state", msStart(t, e, nil))
		if loc := msCallback(t, e, c.query); !strings.Contains(loc, c.want) {
			t.Fatalf("%v = %s, want %s", c.query, loc, c.want)
		}
	}
	if loc := msCallback(t, e, url.Values{"code": {ms.Code}, "state": {"unknown"}}); !strings.Contains(loc, "invalid_state") {
		t.Fatalf("unknown state = %s", loc)
	}
	if list, _ := srv.calsync.Store.List(context.Background(), userIDOf(t, e)); len(list) != 0 {
		t.Fatalf("connections = %d", len(list))
	}
	// A stale session cannot start; three connections are the limit.
	uid := userIDOf(t, e)
	state := msStart(t, e, nil)
	for i := 0; i < calsync.MaxConnections; i++ {
		if _, err := srv.calsync.Store.Create(context.Background(), &calsync.Connection{UserID: uid, Provider: calsync.ProviderCalDAV, ServerURL: "https://x.example"}); err != nil {
			t.Fatal(err)
		}
	}
	if loc := msCallback(t, e, url.Values{"code": {ms.Code}, "state": {state}}); !strings.Contains(loc, "limit_reached") {
		t.Fatalf("fourth = %s", loc)
	}
	if resp, out := e.do("POST", "/api/v1/calendar-sync/microsoft/start", nil); resp.StatusCode != 409 || errCode(out) != "limit_reached" {
		t.Fatalf("start at the limit = %d %v", resp.StatusCode, out)
	}
	e.staleSessions()
	if resp, out := e.do("POST", "/api/v1/calendar-sync/microsoft/start", nil); resp.StatusCode != 403 || errCode(out) != "reauth_required" {
		t.Fatalf("stale start = %d %v", resp.StatusCode, out)
	}
}

func TestMicrosoftNewSecretResumesConnections(t *testing.T) {
	e, srv, ms := microsoftEnv(t)
	resp, out := e.do("PUT", "/api/v1/settings/calendar-sync/microsoft", map[string]any{"client_id": ms.ClientID, "client_secret": ms.ClientSecret})
	e.mustStatus(resp, 200, out)
	c, err := srv.calsync.Store.Create(context.Background(), &calsync.Connection{UserID: userIDOf(t, e), Provider: calsync.ProviderMicrosoft, ServerURL: ms.GraphBase()})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := srv.calsync.Store.StopProvider(context.Background(), calsync.ProviderMicrosoft, calsync.ReasonMicrosoftClient); err != nil {
		t.Fatal(err)
	}
	_ = srv.calsync.Microsoft.Store.Set(context.Background(), calsync.MicrosoftRefusedKey, int64(1700000000000))
	_, out = e.do("GET", "/api/v1/settings/calendar-sync/microsoft", nil)
	if out["refused_at"] != float64(1700000000000) {
		t.Fatalf("refusal not shown: %v", out)
	}
	resp, out = e.do("PUT", "/api/v1/settings/calendar-sync/microsoft", map[string]any{"client_id": ms.ClientID, "client_secret": "new-secret"})
	e.mustStatus(resp, 200, out)
	if out["refused_at"] != nil {
		t.Fatalf("after a new secret = %v", out)
	}
	if got, _ := srv.calsync.Store.ByID(context.Background(), c.ID); got.StoppedReason != "" {
		t.Fatalf("still stopped: %q", got.StoppedReason)
	}
}
