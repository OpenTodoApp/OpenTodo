package web

import (
	"bytes"
	"compress/gzip"
	"io"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"strconv"
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
	for _, p := range []string{"/", "/inbox"} {
		if !strings.Contains(get(Options{NoIndex: true}, p), noIndexMeta) {
			t.Errorf("%s: noindex missing on the demo page", p)
		}
	}
	// /index.html is the built page the signed list names (signed-web-app D7).
	if strings.Contains(get(Options{NoIndex: true}, "/index.html"), "noindex") {
		t.Error("/index.html: noindex added to the built page")
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
	for path, want := range map[string]string{"/sw.js": "no-store, no-transform", "/": "no-cache, no-transform", "/manifest.webmanifest": "no-cache, no-transform"} {
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

// TestServedAsBuilt: every file of the signed list reaches the browser as
// built (OpenSpec change signed-web-app, design D7): /index.html unmodified on
// a demo instance too, the list never cached, and no-transform everywhere.
func TestServedAsBuilt(t *testing.T) {
	page := []byte("<!doctype html><html><head></head><body><div id=root></div></body></html>")
	sub := fstest.MapFS{
		"index.html":          {Data: page},
		"assets/index-abc.js": {Data: []byte("console.log(1)")},
		"app-manifest.json":   {Data: []byte(`{"format":1}`)},
		"favicon.svg":         {Data: []byte("<svg/>")},
	}
	h := handlerFor(sub, Options{NoIndex: true})
	for path, want := range map[string]string{
		"/index.html":          "no-cache, no-transform",
		"/app-manifest.json":   "no-store, no-transform",
		"/assets/index-abc.js": "public, max-age=31536000, immutable, no-transform",
		"/favicon.svg":         "no-cache, no-transform",
		"/":                    "no-cache, no-transform",
	} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest("GET", path, nil))
		if rec.Code != 200 || rec.Header().Get("Cache-Control") != want {
			t.Errorf("%s: %d, Cache-Control %q, want %q", path, rec.Code, rec.Header().Get("Cache-Control"), want)
		}
		if path == "/index.html" && rec.Body.String() != string(page) {
			t.Errorf("/index.html changed: %q", rec.Body.String())
		}
		if path == "/app-manifest.json" && rec.Header().Get("CDN-Cache-Control") != "no-store" {
			t.Error("app-manifest.json: CDN-Cache-Control missing")
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

// TestThemeCreditsAsText: the built-in themes' licence notices (theme-catalogue D4)
// are served from the app's own origin as plain text, so the About dialog's
// Licence link shows them in the browser instead of downloading a file.
func TestThemeCreditsAsText(t *testing.T) {
	sub := fstest.MapFS{"assets/CREDITS-abc.md": {Data: []byte("# Credits\n")}}
	rec := httptest.NewRecorder()
	handlerFor(sub, Options{}).ServeHTTP(rec, httptest.NewRequest("GET", "/assets/CREDITS-abc.md", nil))
	if rec.Code != 200 || rec.Header().Get("Content-Type") != "text/plain; charset=utf-8" || rec.Body.String() != "# Credits\n" {
		t.Fatalf("status %d, type %q, body %q", rec.Code, rec.Header().Get("Content-Type"), rec.Body.String())
	}
}

// The build's gzip copies (OpenSpec change compressed-static-assets): sent when gzip is
// accepted and the whole file asked for, never for a Range or a client without gzip.
func TestCompressedAssets(t *testing.T) {
	js := bytes.Repeat([]byte("const a = 1;\n"), 200)
	var gz bytes.Buffer
	zw := gzip.NewWriter(&gz)
	zw.Write(js)
	zw.Close()
	sub := fstest.MapFS{
		"index.html":           {Data: []byte("<html><head></head></html>")},
		"assets/main-a1.js":    {Data: js},
		"assets/main-a1.js.gz": {Data: gz.Bytes()},
		"assets/font-b2.woff2": {Data: []byte("font")},
		"assets/only-c3.js.gz": {Data: gz.Bytes()},
	}
	h := handlerFor(sub, Options{})
	get := func(method, target string, hdr map[string]string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, target, nil)
		for k, v := range hdr {
			req.Header.Set(k, v)
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}

	rec := get(http.MethodGet, "/assets/main-a1.js", map[string]string{"Accept-Encoding": "br, gzip;q=0.8"})
	if rec.Code != http.StatusOK || rec.Header().Get("Content-Encoding") != "gzip" {
		t.Fatalf("gzip accepted: %d %q", rec.Code, rec.Header().Get("Content-Encoding"))
	}
	zr, err := gzip.NewReader(rec.Body)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(zr)
	if !bytes.Equal(body, js) {
		t.Fatal("the gzip copy does not decode to the file")
	}
	for k, want := range map[string]string{
		"Vary":           "Accept-Encoding",
		"Content-Type":   "text/javascript; charset=utf-8",
		"Content-Length": strconv.Itoa(gz.Len()),
		"Cache-Control":  "public, max-age=31536000, immutable, no-transform",
	} {
		if got := rec.Header().Get(k); got != want {
			t.Errorf("gzip answer %s = %q, want %q", k, got, want)
		}
	}

	head := get(http.MethodHead, "/assets/main-a1.js", map[string]string{"Accept-Encoding": "gzip"})
	if head.Header().Get("Content-Encoding") != "gzip" || head.Body.Len() != 0 {
		t.Errorf("HEAD: encoding %q, body %d bytes", head.Header().Get("Content-Encoding"), head.Body.Len())
	}

	// The file as it is: no gzip, gzip refused, or a byte range (on the raw bytes).
	for name, hdr := range map[string]map[string]string{
		"no Accept-Encoding": {},
		"gzip;q=0":           {"Accept-Encoding": "gzip;q=0, *"},
		"identity only":      {"Accept-Encoding": "identity"},
		"a byte range":       {"Accept-Encoding": "gzip", "Range": "bytes=0-9"},
	} {
		rec := get(http.MethodGet, "/assets/main-a1.js", hdr)
		if rec.Header().Get("Content-Encoding") != "" {
			t.Errorf("%s: Content-Encoding %q", name, rec.Header().Get("Content-Encoding"))
		}
		if rec.Header().Get("Vary") != "Accept-Encoding" {
			t.Errorf("%s: Vary %q", name, rec.Header().Get("Vary"))
		}
		want := js
		if hdr["Range"] != "" {
			want = js[:10]
			if rec.Code != http.StatusPartialContent {
				t.Errorf("%s: status %d", name, rec.Code)
			}
		}
		if !bytes.Equal(rec.Body.Bytes(), want) {
			t.Errorf("%s: body is not the file", name)
		}
	}

	// "*" covers gzip; a file without a copy is sent as it is, with no Vary.
	if rec := get(http.MethodGet, "/assets/main-a1.js", map[string]string{"Accept-Encoding": "*"}); rec.Header().Get("Content-Encoding") != "gzip" {
		t.Errorf("*: Content-Encoding %q", rec.Header().Get("Content-Encoding"))
	}
	if rec := get(http.MethodGet, "/assets/font-b2.woff2", map[string]string{"Accept-Encoding": "gzip"}); rec.Header().Get("Content-Encoding") != "" || rec.Header().Get("Vary") != "" {
		t.Errorf("no copy: encoding %q, vary %q", rec.Header().Get("Content-Encoding"), rec.Header().Get("Vary"))
	}

	// A file the build keeps only compressed: the copy for gzip, else the decoded bytes.
	if rec := get(http.MethodGet, "/assets/only-c3.js", map[string]string{"Accept-Encoding": "gzip"}); rec.Header().Get("Content-Encoding") != "gzip" || !bytes.Equal(rec.Body.Bytes(), gz.Bytes()) {
		t.Errorf("gzip-only, gzip: encoding %q", rec.Header().Get("Content-Encoding"))
	}
	plain := get(http.MethodGet, "/assets/only-c3.js", nil)
	if plain.Code != http.StatusOK || plain.Header().Get("Content-Encoding") != "" || !bytes.Equal(plain.Body.Bytes(), js) {
		t.Errorf("gzip-only, no gzip: %d %q, body is the file: %v", plain.Code, plain.Header().Get("Content-Encoding"), bytes.Equal(plain.Body.Bytes(), js))
	}
	for k, want := range map[string]string{
		"Content-Type":  "text/javascript; charset=utf-8",
		"Vary":          "Accept-Encoding",
		"Cache-Control": "public, max-age=31536000, immutable, no-transform",
	} {
		if got := plain.Header().Get(k); got != want {
			t.Errorf("gzip-only, no gzip: %s = %q, want %q", k, got, want)
		}
	}
	part := get(http.MethodGet, "/assets/only-c3.js", map[string]string{"Accept-Encoding": "gzip", "Range": "bytes=0-9"})
	if part.Code != http.StatusPartialContent || !bytes.Equal(part.Body.Bytes(), js[:10]) || part.Header().Get("Content-Encoding") != "" {
		t.Errorf("gzip-only, a byte range: %d %q", part.Code, part.Body.String())
	}
	if head := get(http.MethodHead, "/assets/only-c3.js", nil); head.Code != http.StatusOK || head.Body.Len() != 0 || head.Header().Get("Content-Length") != strconv.Itoa(len(js)) {
		t.Errorf("gzip-only, HEAD: %d, %d bytes, length %q", head.Code, head.Body.Len(), head.Header().Get("Content-Length"))
	}
	// The compressed form is not a file of its own.
	for _, target := range []string{"/assets/only-c3.js.gz", "/assets/main-a1.js.gz"} {
		if rec := get(http.MethodGet, target, map[string]string{"Accept-Encoding": "gzip"}); rec.Code != http.StatusNotFound {
			t.Errorf("%s: %d, want 404", target, rec.Code)
		}
	}
}
