package cli

import "testing"

// canonicalLink (quick-add-links): the web app's form for plain links, and a link
// Go cannot parse sent as typed rather than dropped.
func TestCanonicalLink(t *testing.T) {
	for in, want := range map[string][2]string{
		"https://Example.com":         {"https://example.com/", "example.com"},
		"https://example.com:443/a":   {"https://example.com/a", "example.com"},
		"http://example.com:80":       {"http://example.com/", "example.com"},
		"http://example.com:8080/x":   {"http://example.com:8080/x", "example.com"},
		"http://[::1]:8080/":          {"http://[::1]:8080/", "[::1]"},
		"https://example.com/50%off":  {"https://example.com/50%off", "example.com"},
		"https://www.example.com/a#b": {"https://www.example.com/a#b", "www.example.com"},
		// As new URL(x): a port with leading zeros is its number, an empty one is
		// dropped, and a link Go cannot parse keeps "www." in its name.
		"https://example.com:0443/a":     {"https://example.com/a", "example.com"},
		"http://example.com:080":         {"http://example.com/", "example.com"},
		"http://example.com:08080/x":     {"http://example.com:8080/x", "example.com"},
		"https://example.com:/a":         {"https://example.com/a", "example.com"},
		"https://www.example.com/50%off": {"https://www.example.com/50%off", "www.example.com"},
		`https://www.example.com\a`:      {`https://www.example.com\a`, "www.example.com"},
	} {
		if href, host := canonicalLink(in); href != want[0] || host != want[1] {
			t.Errorf("canonicalLink(%q) = %q, %q; want %q, %q", in, href, host, want[0], want[1])
		}
	}
}
