package httpapi

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
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

func getPage(t *testing.T, srv *httptest.Server, p string) (*http.Response, string) {
	t.Helper()
	resp, err := http.Get(srv.URL + p)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp, string(b)
}

// ios-app-banner: a task's page carries the Smart App Banner with its address;
// the page's policy is the same as on every other page.
func TestTaskPageCarriesTheAppBanner(t *testing.T) {
	srv := appBannerServer(t, "https://todo.example.com")
	resp, body := getPage(t, srv, "/task/abc")
	want := `<head><meta name="apple-itunes-app" content="app-id=6832200428, app-argument=https://todo.example.com/task/abc">`
	if resp.StatusCode != 200 || !strings.Contains(body, want) {
		t.Fatalf("status %d, body:\n%s", resp.StatusCode, body)
	}
	if resp.ContentLength != int64(len(body)) {
		t.Fatalf("Content-Length %d for a body of %d", resp.ContentLength, len(body))
	}
	other, _ := getPage(t, srv, "/today")
	if csp := resp.Header.Get("Content-Security-Policy"); csp == "" || csp != other.Header.Get("Content-Security-Policy") {
		t.Fatalf("task page policy %q, other page %q", csp, other.Header.Get("Content-Security-Policy"))
	}
}

func TestAppBannerOnlyOnTaskPages(t *testing.T) {
	srv := appBannerServer(t, "https://todo.example.com")
	for _, p := range []string{"/", "/today", "/task", "/task/a/b", "/manifest.webmanifest", "/t/secret"} {
		if _, body := getPage(t, srv, p); strings.Contains(body, "apple-itunes-app") {
			t.Errorf("%s carries the banner", p)
		}
	}
}

// The id from the address cannot leave the attribute or add a parameter.
func TestAppBannerEscapesTheTaskID(t *testing.T) {
	srv := appBannerServer(t, "https://todo.example.com")
	_, body := getPage(t, srv, `/task/x%22%3E%3Cscript%3E,app-id=1`)
	want := `app-argument=https://todo.example.com/task/x%22%3E%3Cscript%3E%2Capp-id=1">`
	if !strings.Contains(body, want) || strings.Contains(body, "<script>") {
		t.Fatalf("body:\n%s", body)
	}
}

// Without a base URL the banner still opens the app, at its start.
func TestAppBannerWithoutBaseURL(t *testing.T) {
	srv := appBannerServer(t, "")
	if _, body := getPage(t, srv, "/task/abc"); !strings.Contains(body, `<meta name="apple-itunes-app" content="app-id=6832200428">`) {
		t.Fatalf("body:\n%s", body)
	}
}
