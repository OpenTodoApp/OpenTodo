package httpapi

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/config"
	"github.com/OpenTodoApp/opentodo/internal/store/storetest"
	"github.com/OpenTodoApp/opentodo/internal/tenant/services"
)

// appBannerServer serves fakeWeb behind the whole handler, with base as the
// configured base URL ("" for none).
func appBannerServer(t *testing.T, base string) *httptest.Server {
	t.Helper()
	db, dir := storetest.Open(t)
	cfg := config.Config{SessionTTL: time.Hour, DataDir: dir}
	if base != "" {
		cfg.BaseURL, _ = url.Parse(base)
	}
	srv := httptest.NewServer(New(testSet(t, cfg, db, services.Options{}), fakeWeb))
	t.Cleanup(srv.Close)
	return srv
}

func bannerRequest(t *testing.T, srv *httptest.Server, method, p string) (*http.Response, string) {
	t.Helper()
	req, err := http.NewRequest(method, srv.URL+p, nil)
	if err != nil {
		t.Fatal(err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp, string(b)
}

// ios-app-banner: the vectors the service worker's test reads too, so both
// copies of a task's page carry the same tag for the same address.
func TestAppBannerVectors(t *testing.T) {
	raw, err := os.ReadFile("../../web/src/lib/appBanner.vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var v struct {
		Origin string `json:"origin"`
		Pages  []struct {
			Path string  `json:"path"`
			Tag  *string `json:"tag"`
		} `json:"pages"`
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	// A base URL with a path still names its origin, as the worker's own origin does.
	srv := appBannerServer(t, v.Origin+"/ignored/")
	for _, c := range v.Pages {
		resp, body := bannerRequest(t, srv, http.MethodGet, c.Path)
		if resp.StatusCode != 200 {
			t.Errorf("%s: status %d", c.Path, resp.StatusCode)
			continue
		}
		if c.Tag == nil {
			if strings.Contains(body, "apple-itunes-app") {
				t.Errorf("%s carries the banner", c.Path)
			}
		} else if !strings.Contains(body, "<head>"+*c.Tag) {
			t.Errorf("%s: want %s right after <head>, body:\n%s", c.Path, *c.Tag, body)
		}
	}
}

// The page's policy is the same as on every other page, and the length is the new body's.
func TestTaskPageCarriesTheAppBanner(t *testing.T) {
	srv := appBannerServer(t, "https://todo.example.com")
	resp, body := bannerRequest(t, srv, http.MethodGet, "/task/abc")
	if resp.ContentLength != int64(len(body)) || !strings.Contains(body, "apple-itunes-app") {
		t.Fatalf("Content-Length %d for a body of %d:\n%s", resp.ContentLength, len(body), body)
	}
	other, _ := bannerRequest(t, srv, http.MethodGet, "/today")
	if csp := resp.Header.Get("Content-Security-Policy"); csp == "" || csp != other.Header.Get("Content-Security-Policy") {
		t.Fatalf("task page policy %q, other page %q", csp, other.Header.Get("Content-Security-Policy"))
	}
	head, headBody := bannerRequest(t, srv, http.MethodHead, "/task/abc")
	if head.StatusCode != 200 || headBody != "" || head.ContentLength != int64(len(body)) {
		t.Fatalf("HEAD: status %d, Content-Length %d (GET %d), body %q", head.StatusCode, head.ContentLength, len(body), headBody)
	}
}

// Without a base URL the banner still opens the app, at its start.
func TestAppBannerWithoutBaseURL(t *testing.T) {
	srv := appBannerServer(t, "")
	if _, body := bannerRequest(t, srv, http.MethodGet, "/task/abc"); !strings.Contains(body, `<meta name="apple-itunes-app" content="app-id=6832200428">`) {
		t.Fatalf("body:\n%s", body)
	}
}
