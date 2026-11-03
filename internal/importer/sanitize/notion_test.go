package main

import (
	"os"
	"strings"
	"testing"
)

// A Notion export keeps its layout, ids, dates, statuses and priorities; titles,
// text, people and file names become placeholders, the same text the same one,
// so pages, relations and select options still match.
func TestNotionZip(t *testing.T) {
	for _, f := range []string{"../testdata/notion-csv/tasks.zip", "../testdata/notion-csv/subitems.zip"} {
		in, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		out, err := newScrubber().zip(in)
		if err != nil {
			t.Fatalf("%s: %v", f, err)
		}
		all := ""
		for name, body := range zipEntries(t, out) {
			if strings.HasSuffix(name, ".zip") {
				for n, b := range zipEntries(t, []byte(body)) {
					all += n + "\n" + b + "\n"
				}
				continue
			}
			all += name + "\n" + body + "\n"
		}
		for _, gone := range []string{"garden", "venue", "Sam Example", "Outdoor", "kitchen", "Keep the receipts", "Buy bulbs"} {
			if strings.Contains(all, gone) {
				t.Fatalf("%s: %q survived:\n%s", f, gone, all)
			}
		}
		for _, kept := range []string{"29d4c1a8e2f3801f9a0b1c2d3e4f5a6b", "October 29, 2026", "Not started", "High 🔥", "- [ ]  ", "16/12/2026",
			"a3759449b76c4d29bcd16e2f99eb56c9", "Name,Assignee,Due,Priority,Status,Tags", "Task,Deadline,Done,Parent item"} {
			if strings.Contains(f, "subitems") != (strings.Contains(kept, "16/12") || strings.Contains(kept, "a3759") || strings.HasPrefix(kept, "Task,")) {
				continue
			}
			if !strings.Contains(all, kept) {
				t.Fatalf("%s: %q lost:\n%s", f, kept, all)
			}
		}
	}
}
