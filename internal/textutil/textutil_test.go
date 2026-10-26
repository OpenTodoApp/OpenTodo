package textutil

import (
	"strings"
	"testing"
	"unicode/utf8"
)

func TestTruncate(t *testing.T) {
	cases := []struct {
		s    string
		max  int
		want string
	}{
		{"abc", 5, "abc"},
		{"abc", 3, "abc"},
		{"abcdef", 3, "abc"},
		{"abc", 0, ""},
		{"abc", -1, ""},
		{"Zoë", 3, "Zo"},  // ë is two bytes: never half of it
		{"Zoë", 4, "Zoë"}, // exactly fits
		{"日本語", 4, "日"},   // three-byte characters
		{"日本語", 6, "日本"},  // a cut on the boundary
		{"a😀b", 4, "a"},   // a four-byte character
		{"a😀b", 5, "a😀"},
		{"\x80\x80\x80\x80\x80\x80", 3, "\x80\x80\x80"}, // not UTF-8: cut as is
	}
	for _, c := range cases {
		if got := Truncate(c.s, c.max); got != c.want {
			t.Errorf("Truncate(%q, %d) = %q, want %q", c.s, c.max, got, c.want)
		}
	}
}

// Every cut of valid text stays valid UTF-8, within the limit, and loses
// at most the one character the limit falls in.
func TestTruncateAlwaysValid(t *testing.T) {
	s := strings.Repeat("Zoë's Pixel 日本 😀 ", 20)
	for n := 0; n <= len(s)+1; n++ {
		got := Truncate(s, n)
		if !utf8.ValidString(got) || len(got) > n || !strings.HasPrefix(s, got) {
			t.Fatalf("Truncate(_, %d) = %q", n, got)
		}
		if n < len(s) && len(got) <= n-utf8.UTFMax {
			t.Fatalf("Truncate(_, %d) cut too much: %d bytes", n, len(got))
		}
	}
}
