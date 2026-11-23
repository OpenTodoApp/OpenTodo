package quickadd

import "testing"

// The same cases as links.test.ts (quick-add-links): the chip's host and the URL's end.
func TestLinkHostAndEnd(t *testing.T) {
	for in, want := range map[string]string{"https://www.Example.com/a": "example.com", "http://me@host.example:8080/x?y#z": "host.example", "https://[::1]:80/": "[::1]", "x://İ.example": "", "https://İstanbul.EXAMPLE/": "İstanbul.example", "https://example.com.": "example.com", "ftp://x": ""} {
		if got := LinkHost(in); got != want {
			t.Errorf("LinkHost(%q) = %q, want %q", in, got, want)
		}
	}
	for in, want := range map[string]string{"https://example.com/a(b).": "https://example.com/a(b)", "https://example.com/x]),": "https://example.com/x", "https://?q": "", "ftp://example.com": "", "http://@": "", "http://user@": "", "http://:8080": ""} {
		if got := matchLink(in); got != want {
			t.Errorf("matchLink(%q) = %q, want %q", in, got, want)
		}
	}
}
