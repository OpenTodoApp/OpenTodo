package web

import (
	"strings"
	"testing"
)

func TestInjectAppBanner(t *testing.T) {
	page := []byte(`<!doctype html><html><head><title>OpenTodo</title></head><body></body></html>`)
	got := string(InjectAppBanner(page, "https://todo.example.com/task/abc"))
	want := `<head><meta name="apple-itunes-app" content="app-id=6832200428, app-argument=https://todo.example.com/task/abc"><title>`
	if !strings.Contains(got, want) {
		t.Fatalf("banner missing or misplaced:\n%s", got)
	}
	if got := string(InjectAppBanner(page, "")); !strings.Contains(got, `<head><meta name="apple-itunes-app" content="app-id=6832200428"><title>`) {
		t.Fatalf("banner without an argument:\n%s", got)
	}
	// Whatever reaches it, the argument stays inside the attribute.
	if got := string(InjectAppBanner(page, `x"><script>&`)); !strings.Contains(got, `app-argument=x&#34;&gt;&lt;script&gt;&amp;">`) || strings.Contains(got, "<script>") {
		t.Fatalf("argument not escaped:\n%s", got)
	}
	if got := InjectAppBanner([]byte("no head"), "x"); string(got) != "no head" {
		t.Fatalf("a page without <head> changed: %s", got)
	}
}
