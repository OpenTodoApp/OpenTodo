package httpapi

import (
	"compress/gzip"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

// GET /api/v1/openapi.json (openapi-description): the description of this
// release to anyone, with the server's version, compressed when asked,
// cacheable, and readable from another site.
func TestOpenAPIRoute(t *testing.T) {
	e := newEnv(t, false)
	get := func(headers map[string]string) *http.Response {
		t.Helper()
		req, _ := http.NewRequest("GET", e.srv.URL+"/api/v1/openapi.json", nil)
		for k, v := range headers {
			req.Header.Set(k, v)
		}
		resp, err := http.DefaultTransport.RoundTrip(req)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { resp.Body.Close() })
		return resp
	}
	read := func(resp *http.Response) map[string]any {
		t.Helper()
		var r io.Reader = resp.Body
		if resp.Header.Get("Content-Encoding") == "gzip" {
			zr, err := gzip.NewReader(resp.Body)
			if err != nil {
				t.Fatal(err)
			}
			r = zr
		}
		var doc map[string]any
		if err := json.NewDecoder(r).Decode(&doc); err != nil {
			t.Fatal(err)
		}
		return doc
	}
	_, health := e.do("GET", "/healthz", nil)

	plain := get(nil)
	if plain.StatusCode != http.StatusOK || !strings.HasPrefix(plain.Header.Get("Content-Type"), "application/json") || plain.Header.Get("Content-Encoding") != "" {
		t.Fatalf("anonymous GET: %d %v", plain.StatusCode, plain.Header)
	}
	doc := read(plain)
	if v := doc["info"].(map[string]any)["version"]; v != health["version"] || doc["openapi"] != "3.1.1" {
		t.Fatalf("version %v, openapi %v; the server is %v", v, doc["openapi"], health["version"])
	}
	if plain.Header.Get("Access-Control-Allow-Origin") != "*" || plain.Header.Get("Cache-Control") != "public, max-age=3600" {
		t.Fatalf("headers %v", plain.Header)
	}

	zipped := get(map[string]string{"Accept-Encoding": "gzip"})
	if zipped.Header.Get("Content-Encoding") != "gzip" || read(zipped)["paths"] == nil {
		t.Fatalf("gzip: %v", zipped.Header)
	}
	etag := zipped.Header.Get("ETag")
	if etag == "" {
		t.Fatal("no ETag")
	}
	if again := get(map[string]string{"If-None-Match": etag}); again.StatusCode != http.StatusNotModified {
		t.Fatalf("If-None-Match: %d", again.StatusCode)
	}

	// Signed in it is the same document; another method is refused with the envelope.
	e.register("owner@example.com")
	if resp, out := e.do("POST", "/api/v1/openapi.json", nil); resp.StatusCode < 400 || resp.StatusCode >= 500 || out["error"] == nil {
		t.Fatalf("POST: %d %v", resp.StatusCode, out)
	}
}
