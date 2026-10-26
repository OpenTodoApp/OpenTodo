package vault

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// FuzzTaskNoteFront: random frontmatter with one mapped key edited keeps every
// other line byte for byte, and a key in a form the reader does not support
// is only that key read-only (design D4). Seeds: the issue's sample shapes
// and the corpus in testdata/fuzz/FuzzTaskNoteFront.
func FuzzTaskNoteFront(f *testing.F) {
	for _, name := range []string{"Service the boiler.md", "Row a million metres.md", "Redraw the book cover.md"} {
		b, err := os.ReadFile(filepath.Join("testdata", "tasknotes", "notes", name))
		if err != nil {
			f.Fatal(err)
		}
		f.Add(string(b), "status", "done")
		f.Add(string(b), "priority", "high")
	}
	f.Add("---\ntitle: x\nblock: |\n  a\n  b\nstatus: open\n---\nbody\n", "block", "y")
	f.Add("---\ntags: [task, 'a, b']\n# c\ncontexts:\n- home\n---\n", "contexts", "work")
	f.Add("---\r\ntitle: A\r\n---\r\n", "title", "B")
	f.Add("no frontmatter at all\n", "status", "open")
	f.Fuzz(func(t *testing.T, text, key, value string) {
		if strings.ContainsAny(key, "\n\r:#\"'[]{}") || strings.TrimSpace(key) != key || key == "" || strings.HasPrefix(key, "-") || strings.ContainsAny(value, "\r") {
			return
		}
		fr := ParseFront(text)
		// A no-op write is byte-identical.
		if fr.Has {
			if got := fr.apply(nil, nil); got != text {
				t.Fatalf("no-op write changed the note:\n%q\n%q", text, got)
			}
		}
		k := fr.get(key)
		if k != nil && k.Kind == kindUnsupported {
			// Read-only: the vault never edits it, and the other keys still read.
			for _, other := range fr.Keys {
				if other.Name != key && other.end <= k.start && other.start >= k.end {
					t.Fatalf("keys overlap: %+v %+v", other, k)
				}
			}
			return
		}
		dup := 0
		for _, kk := range fr.Keys {
			if kk.Name == key {
				dup++
			}
		}
		if dup > 1 {
			return // a repeated key: YAML itself is ambiguous there
		}
		out := fr.apply([]fmEdit{{name: key, lines: fmScalarLine(key, value)}}, nil)
		back := ParseFront(out)
		if got := back.str(key); got != value {
			t.Fatalf("edited %s=%q reads back %q:\n%s", key, value, got, out)
		}
		// Every other line is unchanged, in order.
		norm := strings.ReplaceAll(text, "\r\n", "\n")
		outN := strings.ReplaceAll(out, "\r\n", "\n")
		if !fr.Has {
			return
		}
		var kept []string
		for i, l := range fr.Lines {
			if k != nil && i >= k.start && i < k.end {
				continue
			}
			kept = append(kept, l)
		}
		var got []string
		bk := back.get(key)
		for i, l := range back.Lines {
			if bk != nil && i >= bk.start && i < bk.end {
				continue
			}
			got = append(got, l)
		}
		if strings.Join(kept, "\n") != strings.Join(got, "\n") {
			t.Fatalf("other lines changed:\n%q\n%q", norm, outN)
		}
		if back.Body != fr.Body {
			t.Fatalf("body changed: %q → %q", fr.Body, back.Body)
		}
	})
}
