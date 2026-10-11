package web

import (
	"io"
	"io/fs"
	"net/http/httptest"
	"strings"
	"testing"
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
