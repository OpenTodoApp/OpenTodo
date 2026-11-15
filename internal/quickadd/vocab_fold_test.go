package quickadd

import "testing"

// normalize folds like the web app's normalize (NFD, combining marks dropped), so a
// vocabulary written with Polish, Czech or Romanian letters matches on the server too.
// The fold table was generated from the web rule:
//
//	for c in 0xC0..0x24F: lower(c).normalize("NFD") without U+0300–U+036F, kept when it is plain a–z
func TestNormalizeFoldsLikeTheWebApp(t *testing.T) {
	for in, want := range map[string]string{
		"dziś": "dzis", "środę": "srode", "piątek": "piatek", "Żółć": "zołc", "jutro,": "jutro",
		"příští": "pristi", "úterý": "utery", "mâine": "maine", "marți": "marti",
		"Straße": "strasse", "Ålesund": "alesund", "it’s": "it's",
	} {
		if got := normalize(in); got != want {
			t.Errorf("normalize(%q) = %q, want %q", in, got, want)
		}
	}
}
