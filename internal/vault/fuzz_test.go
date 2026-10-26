package vault

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// Fuzz targets for the vault's Markdown grammar (wave 2 of the 2026-10 audit,
// Z1). A vault file is edited by hand and by other apps; whatever it holds,
// parsing must not panic, and what the printer writes must read back as the
// same thing, or every sync would rewrite the file.

func vaultSeeds(f *testing.F) []string {
	var out []string
	_ = filepath.WalkDir("testdata/vault", func(p string, d os.DirEntry, err error) error {
		if err == nil && !d.IsDir() && strings.HasSuffix(p, ".md") {
			if b, err := os.ReadFile(p); err == nil {
				out = append(out, string(b))
			}
		}
		return nil
	})
	if len(out) == 0 {
		f.Fatal("no fixture vault files")
	}
	return out
}

// FuzzParseLine: print(parse(x)) keeps every synced field and is stable.
func FuzzParseLine(f *testing.F) {
	for _, doc := range vaultSeeds(f) {
		for _, l := range strings.Split(doc, "\n") {
			if _, done, content, ok := isTaskLine(l); ok {
				f.Add(content, done)
			}
		}
	}
	for _, s := range []string{
		"Book the plumber 📅 2026-10-25 [time:: 09:00] [deadline:: 2026-10-30] [estimate:: 45m] ⏫ #errands ⛔ 8c2a 🆔 t1",
		"Review PR \\#42 and \\#urgent \\📅 plans 🆔 t5",
		"Read [someday:: true] [evening:: true] ✅ 2026-10-20 [tracked:: 1h20m] 🆔 t6",
		"Report 📅 2026-10-26 🔁 every 3 days when done #work 🆔 t7",
		"⏳ 2026-10-24 [[Garden notes]] 🔽 🔼️ #a/b-c",
	} {
		f.Add(s, strings.Contains(s, "✅"))
	}
	f.Fuzz(func(t *testing.T, content string, done bool) {
		if strings.ContainsAny(content, "\r\n") {
			return // one line of a file
		}
		l := ParseLine("", done, content)
		printed := PrintLine(l)
		indent, done, again, ok := isTaskLine(printed)
		if !ok {
			t.Fatalf("printed %q is not a task line (content %q)", printed, content)
		}
		l2 := ParseLine(indent, done, again)
		p2 := PrintLine(l2)
		if l.Trailing == "" && p2 != printed {
			t.Fatalf("print is not stable:\n in  %q\n 1st %q\n 2nd %q", content, printed, p2)
		}
		// Unknown text (Trailing) stays in the file and never syncs; pieces of
		// it around a field are joined with a space, so a line holding it may
		// settle one round later. It must settle then.
		if indent, done, again, _ := isTaskLine(p2); PrintLine(ParseLine(indent, done, again)) != p2 {
			t.Fatalf("print does not settle:\n in  %q\n 1st %q\n 2nd %q", content, printed, p2)
		}
		// What syncs never changes through printing.
		norm := func(l Line) Line {
			if l.Priority == 4 {
				l.Priority = 0 // low is the default and is not written
			}
			l.Has, l.Trailing = nil, ""
			if !l.Done {
				l.DoneDate = "" // a done date is only written for a done task
			}
			return l
		}
		if a, b := norm(l), norm(l2); !reflect.DeepEqual(a, b) {
			t.Fatalf("fields change through print:\n in  %q\n out %q\n %+v\n %+v", content, printed, a, b)
		}
	})
}

// FuzzParseDoc: printing a parsed document keeps its tasks, and the printed
// text is stable.
func FuzzParseDoc(f *testing.F) {
	for _, doc := range vaultSeeds(f) {
		f.Add(doc)
	}
	f.Add("---\nopentodo-id: p1\naliases: [x]\n---\n\nprose\n\n- [ ] a 🆔 1\n  note\n\n  * [ ] sub\n  - [x] b 🆔 2\n## Next week\n- [ ] c\n### deep\n")
	isSection := func(name string) bool { return name == "Next week" || name == "Ideas" }
	type task struct {
		Line
		Note string
	}
	tasks := func(d *Doc) []task {
		var out []task
		d.Walk(func(_ *Block, _, n *Node) {
			l := n.Line
			l.Has, l.Trailing, l.Indent = nil, "", ""
			if l.Priority == 4 {
				l.Priority = 0
			}
			if !l.Done {
				l.DoneDate = ""
			}
			out = append(out, task{l, n.NoteText()})
		})
		return out
	}
	f.Fuzz(func(t *testing.T, text string) {
		d1 := ParseDoc(text, isSection)
		p1 := d1.Print()
		d2 := ParseDoc(p1, isSection)
		p2 := d2.Print()
		// Every task reads back the same; the text settles after at most
		// one more round (hand-written indentation is normalised once).
		if !reflect.DeepEqual(tasks(d1), tasks(d2)) {
			t.Fatalf("tasks change through print:\n in  %q\n out %q", text, p1)
		}
		if p3 := ParseDoc(p2, isSection).Print(); p3 != p2 {
			t.Fatalf("print does not settle:\n in  %q\n 1st %q\n 2nd %q\n 3rd %q", text, p1, p2, p3)
		}
	})
}
