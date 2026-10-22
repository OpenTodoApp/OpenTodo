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

func TestBrand(t *testing.T) {
	page := []byte(`<!doctype html><html><head><meta name="description" content="OpenTodo: your tasks." /><link rel="icon" href="/favicon.svg" type="image/svg+xml" /><link rel="apple-touch-icon" href="/apple-touch-icon.png" /><title>OpenTodo</title></head><body></body></html>`)
	if string(Brand(page, Branding{})) != string(page) {
		t.Fatal("unbranded page changed")
	}
	got := string(Brand(page, Branding{Name: "Acme <Tasks>", LogoVersion: 3}))
	for _, want := range []string{`<title>Acme &lt;Tasks&gt;</title>`, `content="Acme &lt;Tasks&gt;"`, `<link rel="icon" href="/branding/logo-32.png?v=3" type="image/png">`, `<link rel="apple-touch-icon" href="/branding/logo-180.png?v=3">`} {
		if !strings.Contains(got, want) {
			t.Fatalf("lacks %q:\n%s", want, got)
		}
	}
	if strings.Contains(got, "favicon.svg") || strings.Contains(got, "OpenTodo") {
		t.Fatalf("old mark kept:\n%s", got)
	}
	// A name alone keeps the app's icons; a logo alone keeps the name.
	if got = string(Brand(page, Branding{Name: "Acme"})); !strings.Contains(got, "favicon.svg") || !strings.Contains(got, "<title>Acme</title>") {
		t.Fatalf("name only:\n%s", got)
	}
	if got = string(Brand(page, Branding{LogoVersion: 1})); !strings.Contains(got, "<title>OpenTodo</title>") || !strings.Contains(got, "logo-32.png?v=1") {
		t.Fatalf("logo only:\n%s", got)
	}
	manifest := []byte(`{"name":"OpenTodo","short_name":"OpenTodo","icons":[{"src":"/pwa-192.png"}],"start_url":"/"}`)
	got = string(BrandManifest(manifest, Branding{Name: "Acme Family Planner", LogoVersion: 2}))
	for _, want := range []string{`"name":"Acme Family Planner"`, `"short_name":"Acme Family"`, `"/branding/logo-512.png?v=2"`, `"purpose":"maskable"`, `"start_url":"/"`} {
		if !strings.Contains(got, want) {
			t.Fatalf("manifest lacks %q:\n%s", want, got)
		}
	}
	if strings.Contains(got, "pwa-192") {
		t.Fatalf("old icons kept:\n%s", got)
	}
	if string(BrandManifest([]byte("not json"), Branding{Name: "x"})) != "not json" {
		t.Fatal("unparseable manifest changed")
	}
}
