package vault

import (
	"reflect"
	"strings"
	"testing"
)

func parseOne(t *testing.T, s string) Line {
	t.Helper()
	indent, done, content, ok := isTaskLine(s)
	if !ok {
		t.Fatalf("not a task line: %q", s)
	}
	return ParseLine(indent, done, content)
}

// TestTaskLines covers "Task lines": the full line, any order, unknown text,
// low priority and escapes.
func TestTaskLines(t *testing.T) {
	full := "- [ ] Book the plumber 📅 2026-10-25 [time:: 09:00] [deadline:: 2026-10-30] [estimate:: 45m] ⏫ #errands ⛔ 8c2a 🆔 t1"
	l := parseOne(t, full)
	if l.Title != "Book the plumber" || l.Due != "2026-10-25" || l.Time != "09:00" || l.Deadline != "2026-10-30" || l.Estimate != "45m" ||
		l.Priority != 2 || !reflect.DeepEqual(l.Tags, []string{"errands"}) || !reflect.DeepEqual(l.Blocked, []string{"8c2a"}) || l.ID != "t1" {
		t.Fatalf("full line parsed as %+v", l)
	}
	if got := PrintLine(l); got != full {
		t.Fatalf("print:\n got %q\nwant %q", got, full)
	}

	any := parseOne(t, "- [ ] ⏫ Call mum #family 📅 2026-10-26 🆔 t2")
	if any.Title != "Call mum" || any.Priority != 2 || any.Due != "2026-10-26" || any.Tags[0] != "family" {
		t.Fatalf("any order: %+v", any)
	}
	if got := PrintLine(any); got != "- [ ] Call mum 📅 2026-10-26 ⏫ #family 🆔 t2" {
		t.Fatalf("any order printed as %q", got)
	}

	unk := parseOne(t, "- [ ] Water the plants ⏳ 2026-10-24 [[Garden notes]] 🆔 t3")
	if unk.Title != "Water the plants" || unk.Trailing != "⏳ 2026-10-24 [[Garden notes]]" || unk.Due != "" {
		t.Fatalf("unknown text: %+v", unk)
	}
	if got := PrintLine(unk); got != "- [ ] Water the plants ⏳ 2026-10-24 [[Garden notes]] 🆔 t3" {
		t.Fatalf("unknown printed as %q", got)
	}

	if low := parseOne(t, "- [ ] Later 🔽 🆔 t4"); low.Priority != 4 || PrintLine(low) != "- [ ] Later 🆔 t4" {
		t.Fatalf("low priority: %+v %q", low, PrintLine(low))
	}

	// A title holding a marker word is escaped and parses back to itself.
	odd := Line{Title: "Review PR #42 and #urgent 📅 plans", ID: "t5"}
	back := parseOne(t, PrintLine(odd))
	if back.Title != odd.Title || len(back.Tags) != 0 || back.Due != "" {
		t.Fatalf("escaped title %q parsed as %+v", PrintLine(odd), back)
	}

	someday := parseOne(t, "- [x] Read [someday:: true] [evening:: true] ✅ 2026-10-20 [tracked:: 1h20m] 🆔 t6")
	if !someday.Done || someday.Start != "someday" || !someday.Evening || someday.DoneDate != "2026-10-20" || someday.ReadOnly["tracked"] != "1h20m" {
		t.Fatalf("someday line: %+v", someday)
	}
	rec := parseOne(t, "- [ ] Report 📅 2026-10-26 🔁 every 3 days when done #work 🆔 t7")
	if rec.Recur != "every 3 days when done" || rec.Tags[0] != "work" {
		t.Fatalf("recurrence: %+v", rec)
	}
}

// TestDocRoundTrip: prose, sections, subtasks, notes and foreign front matter
// print back byte for byte.
func TestDocRoundTrip(t *testing.T) {
	src := strings.Join([]string{
		"---",
		"opentodo-id: p1",
		"opentodo-color: \"#22c55e\"",
		"aliases: [home]",
		"---",
		"",
		"Things for the flat.",
		"",
		"- [ ] Pack 🆔 a",
		"  Remember the charger.",
		"",
		"  * [ ] adapter",
		"  - [ ] Passport 🆔 b",
		"- [ ] Call the landlord 🆔 c",
		"",
		"## Ideas",
		"",
		"- a bullet that is not a task",
		"",
		"## Next week",
		"",
		"- [ ] Paint 🆔 d",
		"",
	}, "\n")
	d := ParseDoc(src, func(n string) bool { return n == "Next week" })
	if d.ID != "p1" || d.Color != "#22c55e" || len(d.Front) != 1 {
		t.Fatalf("front matter: %+v", d)
	}
	var notes, titles []string
	d.Walk(func(_ *Block, parent, n *Node) {
		titles = append(titles, n.Line.Title)
		if n.Line.ID == "a" {
			notes = n.Note
		}
		if n.Line.ID == "b" && (parent == nil || parent.Line.ID != "a") {
			t.Fatalf("Passport is not a subtask of Pack")
		}
	})
	if !reflect.DeepEqual(titles, []string{"Pack", "Passport", "Call the landlord", "Paint"}) {
		t.Fatalf("titles %v", titles)
	}
	if strings.Join(notes, "\n") != "Remember the charger.\n\n- [ ] adapter" {
		t.Fatalf("note %q", strings.Join(notes, "\n"))
	}
	if got := d.Print(); got != src {
		t.Fatalf("round trip:\n%s\n---want---\n%s", got, src)
	}
}
