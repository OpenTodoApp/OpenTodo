package calsync

import (
	"archive/zip"
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/calfeed"
	"github.com/OpenTodoApp/opentodo/internal/config"
	ob "github.com/OpenTodoApp/opentodo/internal/outbound"
	"github.com/OpenTodoApp/opentodo/internal/zoned"
)

// The Microsoft client, its sign-in and the request policy
// (outlook-calendar-sync, tasks 2.1, 3.1, 4.3 and 4.6).

func TestValidTenant(t *testing.T) {
	for tenant, want := range map[string]bool{
		"common": true, "organizations": true, "consumers": true, "contoso.onmicrosoft.com": true, "example.org": true,
		"72f988bf-86f1-41af-91ab-2d7cd011db47": true, "contoso corp": false, "": false, "../common": false, "contoso": false,
		"72f988bf-86f1-41af-91ab": false, "a/b.com": false,
	} {
		if ValidTenant(tenant) != want {
			t.Errorf("ValidTenant(%q) = %v", tenant, !want)
		}
	}
}

func TestMicrosoftAuthorizationURL(t *testing.T) {
	_, challenge := PKCE()
	raw := MicrosoftAuthorizationURL(MicrosoftLogin, MicrosoftClient{ID: "cid", Tenant: "organizations"}, "https://todo.example/cb", "st", challenge)
	u, err := url.Parse(raw)
	if err != nil || u.Host != "login.microsoftonline.com" || u.Path != "/organizations/oauth2/v2.0/authorize" {
		t.Fatalf("url = %s", raw)
	}
	q := u.Query()
	if q.Get("scope") != "offline_access User.Read Calendars.ReadWrite MailboxSettings.Read" || q.Get("code_challenge_method") != "S256" ||
		q.Get("prompt") != "select_account" || q.Get("state") != "st" || q.Get("response_type") != "code" {
		t.Fatalf("query = %v", q)
	}
	if MicrosoftStateHash("st") == StateHash("st") {
		t.Fatal("a Microsoft state must not be a Google state")
	}
}

func TestMicrosoftCallbackReason(t *testing.T) {
	for _, c := range []struct{ code, desc, want string }{
		{"access_denied", "AADSTS65004: User declined to consent", "denied"},
		{"access_denied", "AADSTS65001: The user or administrator has not consented", "admin_consent_required"},
		{"consent_required", "", "admin_consent_required"},
		{"invalid_request", "AADSTS90094: Admin consent is required", "admin_consent_required"},
		{"interaction_required", "", "admin_consent_required"},
		{"server_error", "", "authorization_failed"},
	} {
		if got := MicrosoftCallbackReason(c.code, c.desc); got != c.want {
			t.Errorf("%s %q = %s, want %s", c.code, c.desc, got, c.want)
		}
	}
}

func TestMicrosoftClientConfig(t *testing.T) {
	h := newHarness(t)
	m := h.w.Microsoft
	if c, err := m.Client(h.ctx); err != nil || c.Complete() || c.Tenant != DefaultTenant {
		t.Fatalf("empty = %+v %v", c, err)
	}
	secret := "s3cret"
	if err := m.Save(h.ctx, " cid ", "consumers", &secret); err != nil {
		t.Fatal(err)
	}
	c, _ := m.Client(h.ctx)
	if c.ID != "cid" || c.Secret != "s3cret" || c.Tenant != "consumers" || c.FromEnv {
		t.Fatalf("saved = %+v", c)
	}
	// The secret stays when it is not sent, and is never swept.
	if err := m.Save(h.ctx, "cid2", "", nil); err != nil {
		t.Fatal(err)
	}
	if n, err := h.w.Secrets.Sweep(h.ctx, h.w.Store); err != nil || n != 0 {
		t.Fatalf("sweep = %d %v", n, err)
	}
	if c, _ := m.Client(h.ctx); c.ID != "cid2" || c.Secret != "s3cret" || c.Tenant != DefaultTenant {
		t.Fatalf("kept = %+v", c)
	}
	m.Env = config.MicrosoftConfig{ClientID: "env-id", ClientSecret: "env-secret", Tenant: "organizations"}
	if c, _ := m.Client(h.ctx); !c.FromEnv || c.ID != "env-id" || c.Tenant != "organizations" {
		t.Fatalf("env = %+v", c)
	}
}

// Every zone the date picker offers (the IANA database) writes an event
// whose start is the task's instant.
func TestGraphTimesEveryZone(t *testing.T) {
	goroot, err := exec.Command("go", "env", "GOROOT").Output()
	if err != nil {
		t.Skip("no go command: ", err)
	}
	r, err := zip.OpenReader(filepath.Join(strings.TrimSpace(string(goroot)), "lib", "time", "zoneinfo.zip"))
	if err != nil {
		t.Skip("no zoneinfo.zip: ", err)
	}
	defer r.Close()
	n := 0
	for _, f := range r.File {
		name := f.Name
		loc, err := zoned.Load(name)
		if err != nil || strings.HasSuffix(name, "/") {
			continue
		}
		n++
		clock, tz := "09:00", name
		task := calfeed.FeedTask{ID: "t", Date: "2026-11-03", Time: &clock, TZ: &tz, Estimate: 45}
		start, end, allDay := graphTimes(task, "")
		want, _ := zoned.Instant("2026-11-03", "09:00", loc)
		got, ok := parseGraphTime(start.DateTime, zoneLocation(start.TimeZone))
		gotEnd, _ := parseGraphTime(end.DateTime, zoneLocation(end.TimeZone))
		if allDay || !ok || !got.Equal(want) || gotEnd.Sub(got) != 45*time.Minute {
			t.Errorf("%s: wrote %+v–%+v, want %s", name, start, end, want.UTC())
		}
		// A floating task in a mailbox of this zone keeps its wall time.
		task.TZ = nil
		start, _, _ = graphTimes(task, loc.String())
		got, _ = parseGraphTime(start.DateTime, zoneLocation(start.TimeZone))
		if d, c := zoned.Local(got, loc); d != "2026-11-03" || c != "09:00" {
			t.Errorf("%s floating: wrote %+v (%s %s)", name, start, d, c)
		}
	}
	if n < 300 {
		t.Fatalf("only %d zones checked", n)
	}
}

// recordingDialer counts the connections the outbound client opens.
func recordingDialer(n *atomic.Int32) *ob.Dialer {
	nd := &net.Dialer{Timeout: time.Second}
	return &ob.Dialer{AllowPrivate: func(context.Context) bool { return true },
		Dial: func(ctx context.Context, network, addr string) (net.Conn, error) {
			n.Add(1)
			return nd.DialContext(ctx, network, addr)
		}}
}

func TestMicrosoftRequestsGoThroughOutbound(t *testing.T) {
	h := newHarness(t)
	ms, c := h.microsoft("W. Europe Standard Time")
	var dials atomic.Int32
	client := ob.NewClient(recordingDialer(&dials), RequestTimeout)
	h.w.HTTP, h.w.MicrosoftToken.HTTP = client, client
	h.w.Forget(c.ID)
	h.task("alice", "t1", map[string]any{"title": "Plan", "due": map[string]string{"date": "2026-10-22", "time": "09:00"}})
	h.cycle(h.conn(c.ID))
	if dials.Load() == 0 || len(ms.ByTask("t1")) != 1 {
		t.Fatalf("dials = %d", dials.Load())
	}
	// With the owner switch off, nothing is asked.
	before := dials.Load()
	h.w.Enabled = func(context.Context) bool { return false }
	_ = h.w.Store.DueSoon(h.ctx, []string{"alice"}, h.clock)
	h.w.RunOnce(h.ctx)
	h.w.Enabled = nil
	// Without a complete client, nothing is asked either.
	h.w.Microsoft.Env = config.MicrosoftConfig{}
	h.w.Forget(c.ID)
	if _, err := h.w.Cycle(h.ctx, h.conn(c.ID)); err == nil || err.(*CycleError).Reason != ReasonMicrosoftMissing {
		t.Fatalf("cycle without a client = %v", err)
	}
	if dials.Load() != before {
		t.Fatalf("dials = %d, want %d", dials.Load(), before)
	}
	if got := h.conn(c.ID); got.StoppedReason != ReasonMicrosoftMissing {
		t.Fatalf("stopped = %q", got.StoppedReason)
	}
}

func TestGraphRefusesRedirectsAndOtherHosts(t *testing.T) {
	redirect := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "https://evil.example/steal", http.StatusFound)
	}))
	defer redirect.Close()
	var dials atomic.Int32
	g := NewGraph(ob.NewClient(recordingDialer(&dials), RequestTimeout), redirect.URL+"/v1.0", "tok", "test", nil)
	var out map[string]any
	if err := g.get(context.Background(), "/me", &out); reasonOf(err) != ReasonRedirect {
		t.Fatalf("redirect = %v", err)
	}
	// A link Graph returned that points elsewhere never receives the token.
	before := dials.Load()
	if err := g.get(context.Background(), "https://evil.example/v1.0/me", &out); reasonOf(err) != ReasonRedirect || dials.Load() != before {
		t.Fatalf("other host = %v", err)
	}
	if MaxBody != 4<<20 || RequestTimeout != 20*time.Second {
		t.Fatal("the response cap and timeout changed")
	}
}
