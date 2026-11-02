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

func TestHumanBytes(t *testing.T) {
	cases := []struct {
		n    int64
		want string
	}{
		{0, "0 B"},
		{1023, "1023 B"},
		{1024, "1.0 KiB"},
		{1536, "1.5 KiB"},
		{1024 * 1024, "1.0 MiB"},
		{300 * 1024, "300.0 KiB"},
		{1 << 60, "1.0 EiB"},
		{-5, "-5 B"}, // negative sizes are not expected; pinned so a change is deliberate
	}
	for _, c := range cases {
		if got := HumanBytes(c.n); got != c.want {
			t.Errorf("HumanBytes(%d) = %q, want %q", c.n, got, c.want)
		}
	}
}

func TestTruncateRunes(t *testing.T) {
	cases := []struct {
		s      string
		max    int
		suffix string
		want   string
	}{
		{"abc", 5, "…", "abc"},         // fits: no suffix
		{"abc", 3, "…", "abc"},         // exactly fits: no suffix
		{"abcdef", 3, "", "abc"},       // no suffix
		{"abcdef", 3, "...", "abc..."}, // suffix is not counted in the limit
		{"äöü😀", 3, "", "äöü"},         // multi-byte runes count once
		{"äöü😀", 4, "", "äöü😀"},
		{"äöü😀", 2, "…", "äö…"},
		{"abc", 0, "", ""},
		{"abc", 0, "…", "…"},
	}
	for _, c := range cases {
		if got := TruncateRunes(c.s, c.max, c.suffix); got != c.want {
			t.Errorf("TruncateRunes(%q, %d, %q) = %q, want %q", c.s, c.max, c.suffix, got, c.want)
		}
	}
}

func TestTruncateEllipsis(t *testing.T) {
	cases := []struct {
		s    string
		max  int
		want string
	}{
		{"abc", 5, "abc"},
		{"abc", 3, "abc"}, // exactly maxBytes: no ellipsis
		{"abcdef", 3, "abc…"},
		{"Zoë", 3, "Zo…"}, // the cut falls inside ë: it is dropped whole
		{"Zoë", 4, "Zoë"},
		{"a😀b", 3, "a…"},
	}
	for _, c := range cases {
		if got := TruncateEllipsis(c.s, c.max); got != c.want {
			t.Errorf("TruncateEllipsis(%q, %d) = %q, want %q", c.s, c.max, got, c.want)
		}
	}
}
