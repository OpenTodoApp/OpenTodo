package ids

import (
	"regexp"
	"testing"
)

var uuidShape = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

func TestNewIsRandomV4(t *testing.T) {
	a, b := New(), New()
	if a == b || !uuidShape.MatchString(a) || a[14] != '4' {
		t.Fatalf("New() = %q, %q", a, b)
	}
}

// NameIDVectors are also asserted by web/src/lib/ids.test.ts, so both sides
// derive the same occurrence ids.
var nameIDVectors = []struct{ ns, name, want string }{
	{"occurrence", "series-1:2026-10-12", "7106e6f1-b1b0-89c3-a9dc-81493398a2bd"},
	{"occurrence", "series-1:detach:2026-10-12", "8f193c71-c00d-879f-a1fa-51a7b4ff2974"},
	{"occurrence", "ünïcödé ✓:2026-10-12", "17d11a8d-aec2-8ffd-b6fd-9c4027f03e68"},
	{"", "", "e7ac0786-668e-8ff0-b02b-62bd04f45ff6"},
}

func TestNameIDDeterministic(t *testing.T) {
	for _, c := range nameIDVectors {
		got := NameID(c.ns, c.name)
		if got != NameID(c.ns, c.name) {
			t.Fatalf("NameID(%q, %q) is not deterministic", c.ns, c.name)
		}
		if !uuidShape.MatchString(got) || got[14] != '8' || !regexp.MustCompile(`^[89ab]$`).MatchString(got[19:20]) {
			t.Fatalf("NameID(%q, %q) = %q is not a version 8 UUID", c.ns, c.name, got)
		}
		if got != c.want {
			t.Errorf("NameID(%q, %q) = %q, want %q", c.ns, c.name, got, c.want)
		}
	}
	if NameID("occurrence", "a:2026-10-12") == NameID("occurrence", "a:detach:2026-10-12") {
		t.Fatal("completion and detach ids must differ")
	}
}

func TestRandomShapes(t *testing.T) {
	if b := Bytes(32); len(b) != 32 || string(b) == string(Bytes(32)) {
		t.Fatal("Bytes")
	}
	if h := Hex(12); !regexp.MustCompile(`^[0-9a-f]{24}$`).MatchString(h) || h == Hex(12) {
		t.Fatalf("Hex(12) = %q", h)
	}
	if s := Secret(24); !regexp.MustCompile(`^[A-Za-z0-9_-]{32}$`).MatchString(s) || s == Secret(24) {
		t.Fatalf("Secret(24) = %q", s)
	}
}
