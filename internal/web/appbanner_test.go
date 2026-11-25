package web

import (
	"strings"
	"testing"
)

func TestTaskPageID(t *testing.T) {
	for p, want := range map[string]string{
		"task/abc": "abc", "task/t-1": "t-1",
		"task": "", "task/": "", "task/a/b": "", "tasks/abc": "", "today": "", "": "", "t/abc": "",
	} {
		if got := TaskPageID(p); got != want {
			t.Errorf("TaskPageID(%q) = %q, want %q", p, got, want)
		}
	}
}

func TestAppBannerArgument(t *testing.T) {
	for _, c := range []struct{ base, id, want string }{
		{"https://todo.example.com", "abc", "https://todo.example.com/task/abc"},
		{"https://todo.example.com/", "abc", "https://todo.example.com/task/abc"},
		{"https://example.com/todo", "abc", "https://example.com/todo/task/abc"},
		// One path segment, and no comma that would end the banner's argument.
		{"https://todo.example.com", "a b?c,d", "https://todo.example.com/task/a%20b%3Fc%2Cd"},
		{"https://todo.example.com", `x"><script>`, "https://todo.example.com/task/x%22%3E%3Cscript%3E"},
	} {
		if got := AppBannerArgument(c.base, c.id); got != c.want {
			t.Errorf("AppBannerArgument(%q, %q) = %q, want %q", c.base, c.id, got, c.want)
		}
	}
}

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
