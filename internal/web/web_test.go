package web

import (
	"io"
	"io/fs"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestInjectNoIndex(t *testing.T) {
	got := string(InjectNoIndex([]byte("<!doctype html><html><head><meta charset=\"UTF-8\"></head><body></body></html>")))
	if !strings.Contains(got, `<head><meta name="robots" content="noindex"><meta charset`) {
		t.Fatalf("got %s", got)
	}
	if string(InjectNoIndex([]byte("no head"))) != "no head" {
		t.Fatal("page without <head> changed")
	}
}

// TestNoIndexOnlyWhenAsked: the demo page declares noindex, a normal page does
// not (skipped when the web app is not built).
func TestNoIndexOnlyWhenAsked(t *testing.T) {
	if _, err := fs.Stat(dist, "dist/index.html"); err != nil {
		t.Skip("web app not built")
	}
	get := func(o Options, path string) string {
		rec := httptest.NewRecorder()
		HandlerWith(o).ServeHTTP(rec, httptest.NewRequest("GET", path, nil))
		b, _ := io.ReadAll(rec.Result().Body)
		return string(b)
	}
	for _, p := range []string{"/", "/inbox", "/index.html"} {
		if !strings.Contains(get(Options{NoIndex: true}, p), noIndexMeta) {
			t.Errorf("%s: noindex missing on the demo page", p)
		}
	}
	if strings.Contains(get(Options{}, "/"), "noindex") {
		t.Error("noindex on a normal instance")
	}
}

// TestIndexNotRedirected: the service worker precaches index.html and serves it
// for navigations; WebKit refuses a redirected response there.
func TestIndexNotRedirected(t *testing.T) {
	if _, err := fs.Stat(dist, "dist/index.html"); err != nil {
		t.Skip("web app not built")
	}
	rec := httptest.NewRecorder()
	Handler().ServeHTTP(rec, httptest.NewRequest("GET", "/index.html", nil))
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "<html") {
		t.Fatalf("/index.html = %d %q", rec.Code, rec.Header().Get("Location"))
	}
}

// TestServiceWorkerNeverCached: sw.js must reach phones on every release, even
// behind a CDN that would otherwise cache .js files (skipped when not built).
func TestServiceWorkerNeverCached(t *testing.T) {
	if _, err := fs.Stat(dist, "dist/sw.js"); err != nil {
		t.Skip("web app not built")
	}
	for path, want := range map[string]string{"/sw.js": "no-store", "/": "no-cache", "/manifest.webmanifest": "no-cache"} {
		rec := httptest.NewRecorder()
		Handler().ServeHTTP(rec, httptest.NewRequest("GET", path, nil))
		if got := rec.Header().Get("Cache-Control"); got != want {
			t.Errorf("%s: Cache-Control %q, want %q", path, got, want)
		}
	}
	rec := httptest.NewRecorder()
	Handler().ServeHTTP(rec, httptest.NewRequest("GET", "/sw.js", nil))
	if rec.Header().Get("CDN-Cache-Control") != "no-store" {
		t.Error("sw.js: CDN-Cache-Control missing")
	}
}

// TestMissingFilesAreNotFound: a missing asset or any path with a file
// extension is a 404, so a tab of the previous release sees its old chunk fail
// instead of receiving the page; extension-less paths stay client routes.
func TestMissingFilesAreNotFound(t *testing.T) {
	sub := fstest.MapFS{
		"index.html":           {Data: []byte("<!doctype html><html><head></head><body></body></html>")},
		"assets/index-abc.js":  {Data: []byte("console.log(1)")},
		"manifest.webmanifest": {Data: []byte("{}")},
	}
	h := handlerFor(sub, Options{})
	for path, want := range map[string]int{
		"/":                         200,
		"/inbox":                    200,
		"/project/3f2a":             200,
		"/day/2026-10-17":           200,
		"/assets/index-abc.js":      200,
		"/manifest.webmanifest":     200,
		"/assets/index-old.js":      404,
		"/assets/TaskDetail-old.js": 404,
		"/assets/":                  404,
		"/favicon.ico":              404,
		"/some/deep/chunk.css":      404,
	} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest("GET", path, nil))
		if rec.Code != want {
			t.Errorf("%s: status %d, want %d", path, rec.Code, want)
		}
		if want == 404 && strings.Contains(rec.Body.String(), "<html") {
			t.Errorf("%s: answered with the page", path)
		}
	}
}
