package issues

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// Provider clients against in-process servers (tasks 2.1–2.4). Nothing here
// leaves the machine: every host is an httptest server on loopback, which the
// outbound policy refuses unless private targets are allowed.

func allow(context.Context) bool { return true }
func deny(context.Context) bool  { return false }

func testProvider(t *testing.T, provider string, h http.Handler) (Provider, *httptest.Server) {
	t.Helper()
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	p, err := NewProvider(NewHTTPClient(allow), provider, srv.URL, "secret-token", "test")
	if err != nil {
		t.Fatal(err)
	}
	return p, srv
}

func fixture(t *testing.T, name string) []byte {
	t.Helper()
	b, err := os.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestAPIBase(t *testing.T) {
	for _, c := range []struct{ provider, host, want string }{
		{GitHub, "https://github.com", "https://api.github.com"},
		{GitHub, "https://ghe.example.com", "https://ghe.example.com/api/v3"},
		{GitLab, "https://gitlab.com", "https://gitlab.com/api/v4"},
		{GitLab, "https://code.example.com/gitlab/", "https://code.example.com/gitlab/api/v4"},
	} {
		if got := APIBase(c.provider, c.host); got != c.want {
			t.Errorf("APIBase(%s, %s) = %s, want %s", c.provider, c.host, got, c.want)
		}
	}
	for _, bad := range []string{"", "ftp://example.com", "https://" + strings.Repeat("a", MaxHost), "https://user:pw@example.com"} {
		var fe *FieldError
		if _, err := NormalizeHost(bad); !errors.As(err, &fe) || fe.Field != "host" {
			t.Errorf("NormalizeHost(%.30q) = %v", bad, err)
		}
	}
	if h, _ := NormalizeHost(" HTTPS://GitLab.Example.com/ "); h != "https://gitlab.example.com" || DefaultName(h) != "gitlab.example.com" {
		t.Fatalf("normalized = %q", h)
	}
}

func TestRedirectRefusedWithoutSecondRequest(t *testing.T) {
	var other atomic.Int32
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		other.Add(1)
	}))
	defer target.Close()
	var hits atomic.Int32
	p, _ := testProvider(t, GitHub, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		http.Redirect(w, r, target.URL+"/steal", http.StatusFound)
	}))
	_, err := p.List(context.Background(), Request{})
	if ReasonOf(err) != ReasonRedirect || hits.Load() != 1 || other.Load() != 0 {
		t.Fatalf("err = %v, hits %d, redirect target %d", err, hits.Load(), other.Load())
	}
}

func TestBodyTooLarge(t *testing.T) {
	p, _ := testProvider(t, GitLab, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("[" + strings.Repeat(" ", 3<<20) + "]"))
	}))
	if _, err := p.List(context.Background(), Request{}); ReasonOf(err) != ReasonTooLarge {
		t.Fatalf("err = %v", err)
	}
}

func TestPrivateHostRefusedUnlessAllowed(t *testing.T) {
	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.Write([]byte(`[]`))
	}))
	defer srv.Close()
	p, _ := NewProvider(NewHTTPClient(deny), GitHub, srv.URL, "t", "test")
	if _, err := p.List(context.Background(), Request{}); ReasonOf(err) != ReasonPrivateTarget || hits.Load() != 0 {
		t.Fatalf("denied: err = %v, hits %d", err, hits.Load())
	}
	p, _ = NewProvider(NewHTTPClient(allow), GitHub, srv.URL, "t", "test")
	if _, err := p.List(context.Background(), Request{}); err != nil || hits.Load() != 1 {
		t.Fatalf("allowed: err = %v, hits %d", err, hits.Load())
	}
}

func TestGitHubListMapsTwoPagesAndDropsPullRequests(t *testing.T) {
	var seen []string
	p, srv := testProvider(t, GitHub, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = append(seen, r.URL.String())
		if r.Header.Get("Authorization") != "Bearer secret-token" || r.Header.Get("Accept") != "application/vnd.github+json" || r.Header.Get("X-GitHub-Api-Version") == "" {
			t.Errorf("headers = %v", r.Header)
		}
		if r.URL.Path != "/api/v3/issues" {
			t.Errorf("path = %s", r.URL.Path)
		}
		w.Header().Set("ETag", `"p`+r.URL.Query().Get("page")+`"`)
		if r.URL.Query().Get("page") == "1" {
			w.Header().Set("Link", `<`+r.Host+`/issues?page=2>; rel="next"`)
			w.Write(fixture(t, "github/assigned_page1.json"))
			return
		}
		w.Write(fixture(t, "github/assigned_page2.json"))
	}))
	_ = srv
	ctx := context.Background()
	p1, err := p.List(ctx, Request{Page: 1, Since: time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC).UnixMilli(), All: true, Labels: []string{"bug"}})
	if err != nil {
		t.Fatal(err)
	}
	if len(p1.Issues) != 1 || !p1.More || p1.ETag != `"p1"` {
		t.Fatalf("page 1 = %+v", p1)
	}
	is := p1.Issues[0]
	if is.Key != "acme/web#42" || is.Title != "Fix login redirect" || is.State != Open || is.URL != "https://github.com/acme/web/issues/42" ||
		len(is.Labels) != 2 || is.UpdatedAt != time.Date(2026, 10, 1, 9, 0, 0, 0, time.UTC).UnixMilli() {
		t.Fatalf("issue = %+v", is)
	}
	q := seen[0]
	for _, want := range []string{"filter=assigned", "state=all", "since=2026-08-31T23%3A59%3A59Z", "labels=bug", "per_page=100", "sort=updated", "direction=asc"} {
		if !strings.Contains(q, want) {
			t.Errorf("query %s lacks %s", q, want)
		}
	}
	p2, err := p.List(ctx, Request{Page: 2})
	if err != nil || len(p2.Issues) != 1 || p2.More {
		t.Fatalf("page 2 = %+v %v", p2, err)
	}
	if c := p2.Issues[0]; c.Key != "acme/docs#3" || c.State != Closed || c.ClosedAt != time.Date(2026, 10, 2, 8, 30, 0, 0, time.UTC).UnixMilli() {
		t.Fatalf("closed = %+v", c)
	}
	if !strings.Contains(seen[1], "state=open") {
		t.Errorf("first poll lists open issues only: %s", seen[1])
	}
}

func TestGitHubRepositoryScopeAndOutcomes(t *testing.T) {
	status := 0
	var last *http.Request
	p, _ := testProvider(t, GitHub, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		last = r
		switch status {
		case 304:
			if r.Header.Get("If-None-Match") != `"e1"` {
				t.Errorf("If-None-Match = %q", r.Header.Get("If-None-Match"))
			}
			w.WriteHeader(304)
		case 403:
			w.Header().Set("X-RateLimit-Remaining", "0")
			w.Header().Set("X-RateLimit-Reset", "4102444800") // 2100-01-01
			w.WriteHeader(403)
		case 4030:
			w.WriteHeader(403)
		case 401, 429:
			w.WriteHeader(status)
		default:
			w.Write([]byte(`[]`))
		}
	}))
	ctx := context.Background()
	if _, err := p.List(ctx, Request{Repo: "acme/web", Login: "octo"}); err != nil {
		t.Fatal(err)
	}
	if last.URL.Path != "/api/v3/repos/acme/web/issues" || last.URL.Query().Get("assignee") != "octo" {
		t.Fatalf("repository request = %s", last.URL)
	}
	status = 304
	if pg, err := p.List(ctx, Request{Repo: "acme/web", Page: 1, ETag: `"e1"`}); err != nil || !pg.NotModified {
		t.Fatalf("304 = %+v %v", pg, err)
	}
	status = 401
	if _, err := p.List(ctx, Request{}); ReasonOf(err) != ReasonUnauthorized {
		t.Fatalf("401 = %v", err)
	}
	status = 4030
	if _, err := p.List(ctx, Request{}); ReasonOf(err) != ReasonUnauthorized {
		t.Fatalf("403 without a reset = %v", err)
	}
	status = 403
	var rl *RateLimitedError
	if _, err := p.List(ctx, Request{}); !errors.As(err, &rl) || rl.Until.Year() != 2100 {
		t.Fatalf("403 with a reset = %v", err)
	}
	status = 429
	if _, err := p.List(ctx, Request{}); !errors.As(err, &rl) {
		t.Fatalf("429 = %v", err)
	}
}

func TestRateLimitResetHeaders(t *testing.T) {
	now := time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC)
	h := http.Header{}
	h.Set("RateLimit-Reset", "1792500000")
	if got := resetTime(h, now); got.Unix() != 1792500000 {
		t.Fatalf("RateLimit-Reset = %v", got)
	}
	h = http.Header{}
	h.Set("Retry-After", "1200")
	if got := resetTime(h, now); !got.Equal(now.Add(20 * time.Minute)) {
		t.Fatalf("Retry-After = %v", got)
	}
	if got := resetTime(http.Header{}, now); !got.Equal(now.Add(time.Minute)) {
		t.Fatalf("default = %v", got)
	}
}

func TestGitLabListAndAccount(t *testing.T) {
	var seen []*http.Request
	p, _ := testProvider(t, GitLab, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = append(seen, r)
		if r.Header.Get("PRIVATE-TOKEN") != "secret-token" || r.Header.Get("Authorization") != "" {
			t.Errorf("headers = %v", r.Header)
		}
		switch {
		case r.URL.Path == "/api/v4/user":
			w.Write([]byte(`{"id": 1, "username": "dana"}`))
		case r.URL.Query().Get("per_page") == "1":
			w.Write([]byte(`[]`))
		case r.URL.Query().Get("page") == "1":
			w.Header().Set("X-Next-Page", "2")
			w.Write(fixture(t, "gitlab/assigned_page1.json"))
		default:
			w.Header().Set("X-Next-Page", "")
			w.Write(fixture(t, "gitlab/assigned_page2.json"))
		}
	}))
	ctx := context.Background()
	acc, err := p.Account(ctx)
	if err != nil || acc.Login != "dana" || !acc.CanReadIssues {
		t.Fatalf("account = %+v %v", acc, err)
	}
	p1, err := p.List(ctx, Request{Page: 1})
	if err != nil || len(p1.Issues) != 1 || !p1.More {
		t.Fatalf("page 1 = %+v %v", p1, err)
	}
	if is := p1.Issues[0]; is.Key != "group/sub/project#45" || is.State != Open || is.Body != "See the job log." || len(is.Labels) != 2 {
		t.Fatalf("issue = %+v", is)
	}
	q := seen[2].URL.Query()
	if q.Get("scope") != "assigned_to_me" || q.Get("state") != "opened" || q.Get("order_by") != "updated_at" || q.Get("sort") != "asc" {
		t.Fatalf("query = %v", q)
	}
	p2, err := p.List(ctx, Request{Page: 2, All: true, Since: 1})
	if err != nil || p2.More || p2.Issues[0].State != Closed || p2.Issues[0].Key != "group/tools#9" {
		t.Fatalf("page 2 = %+v %v", p2, err)
	}
	if q := seen[3].URL.Query(); q.Get("state") != "" || q.Get("updated_after") == "" {
		t.Fatalf("later poll query = %v", q)
	}
	if _, err := p.List(ctx, Request{Repo: "group/sub/project", Login: "dana"}); err != nil {
		t.Fatal(err)
	}
	last := seen[len(seen)-1]
	if last.URL.EscapedPath() != "/api/v4/projects/group%2Fsub%2Fproject/issues" || last.URL.Query().Get("assignee_username") != "dana" {
		t.Fatalf("project request = %s", last.URL.String())
	}
}

func TestGitHubAccountWithoutIssueAccess(t *testing.T) {
	var n atomic.Int32
	p, _ := testProvider(t, GitHub, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n.Add(1)
		if r.URL.Path == "/api/v3/user" {
			w.Write([]byte(`{"login": "octo"}`))
			return
		}
		w.WriteHeader(403)
	}))
	acc, err := p.Account(context.Background())
	if err != nil || acc.Login != "octo" || acc.CanReadIssues || n.Load() != 2 {
		t.Fatalf("account = %+v %v (%d requests)", acc, err, n.Load())
	}
}
