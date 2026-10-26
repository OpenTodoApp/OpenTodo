package vault

import "testing"

// TestReadOnlyValuesStayInTheirField (found by FuzzParseLine and FuzzParseDoc):
// a read-only value holding a bracket or a line break, or a title that starts
// like a field, used to print a line that reads back differently, so the next
// sync saw a changed title and sent it to the server.
func TestReadOnlyValuesStayInTheirField(t *testing.T) {
	cases := []Line{
		{Title: "Water plants", ReadOnly: map[string]string{"location": "Room ]2[", "origin": "a\nb"}, ID: "t1"},
		{Title: "[A:", ReadOnly: map[string]string{"origin": ""}, ID: "t2"},
		{Title: "[tracked::", ReadOnly: map[string]string{"origin": "x"}, ID: "t3"},
		{Title: "[[draft", Trailing: "[[Garden notes]]", ID: "t4"},
	}
	for _, l := range cases {
		printed := PrintLine(l)
		indent, done, content, ok := isTaskLine(printed)
		if !ok {
			t.Fatalf("%q is not one task line", printed)
		}
		back := ParseLine(indent, done, content)
		if back.Title != l.Title || back.ID != l.ID || back.Trailing != l.Trailing {
			t.Errorf("%q reads back as title %q, trailing %q, id %q", printed, back.Title, back.Trailing, back.ID)
		}
		if PrintLine(back) != printed {
			t.Errorf("%q prints again as %q", printed, PrintLine(back))
		}
	}
}

// TestIndentedTaskKeepsProseOutOfItsNote (found by FuzzParseDoc): a top-level
// task indented by a space was printed at column 0, so prose indented like it
// after a blank line became the task's note on the next read and was synced
// into its description.
func TestIndentedTaskKeepsProseOutOfItsNote(t *testing.T) {
	src := " - [ ] Pack 🆔 a\n\n Some prose.\n"
	p1 := ParseDoc(src, nil).Print()
	d := ParseDoc(p1, nil)
	d.Walk(func(_ *Block, _, n *Node) {
		if len(n.Note) != 0 {
			t.Fatalf("prose became the note %q of %q (printed %q)", n.Note, n.Line.Title, p1)
		}
	})
	if p1 != src {
		t.Fatalf("printed %q, want %q", p1, src)
	}
}

// TestEscapedMarkerKeepsTheNextWord (found by FuzzParseLine): an escaped
// marker without a value swallowed the space after it, so a tag printed after
// a title ending in "📅" read back as part of the title.
func TestEscapedMarkerKeepsTheNextWord(t *testing.T) {
	printed := PrintLine(Line{Title: "📅", Tags: []string{"home"}, ID: "t1"})
	indent, done, content, _ := isTaskLine(printed)
	if back := ParseLine(indent, done, content); back.Title != "📅" || len(back.Tags) != 1 || back.Tags[0] != "home" {
		t.Fatalf("%q reads back as title %q, tags %v", printed, back.Title, back.Tags)
	}
}

// TestBlankNoteLinesReadBackTheSame (found by FuzzParseDoc): a note line of
// spaces was kept as spaces, printed empty and then read back empty, so the
// note (the task's description) changed on the second sync.
func TestBlankNoteLinesReadBackTheSame(t *testing.T) {
	src := "- [ ] Pack 🆔 a\n   \n  charger\n"
	var first, second []string
	ParseDoc(src, nil).Walk(func(_ *Block, _, n *Node) { first = n.Note })
	ParseDoc(ParseDoc(src, nil).Print(), nil).Walk(func(_ *Block, _, n *Node) { second = n.Note })
	if len(first) != 2 || first[0] != "" || first[1] != "charger" || len(second) != 2 || second[0] != first[0] || second[1] != first[1] {
		t.Fatalf("note %q, then %q", first, second)
	}
}
