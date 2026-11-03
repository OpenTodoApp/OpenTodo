package main

import (
	"strings"
	"testing"
)

// An OmniFocus CSV keeps its Task IDs, types, dates and flags; a project's
// name and its actions' Project column become the same placeholder.
func TestOmniFocusCSV(t *testing.T) {
	in := "Task ID,Type,Name,Status,Project,Context,Start Date,Due Date,Completion Date,Duration,Flagged,Notes,Tags\r\n" +
		"1,Project,Divorce lawyer,active,,,,,,,0,,\r\n" +
		"1.1,Action,Call Jane,,Divorce lawyer,Phone,,2026-11-03 17:00:00 +0000,,30m,1,About the house,\"Phone, Private\"\r\n"
	out, err := newScrubber().csvFile([]byte(in))
	if err != nil {
		t.Fatal(err)
	}
	s := string(out)
	for _, gone := range []string{"Divorce", "Jane", "house", "Private"} {
		if strings.Contains(s, gone) {
			t.Fatalf("%q survived:\n%s", gone, s)
		}
	}
	for _, kept := range []string{"1,Project,Item 1,active", "1.1,Action,Item 2,,Item 1,", "2026-11-03 17:00:00 +0000,,30m,1,", "\r\n"} {
		if !strings.Contains(s, kept) {
			t.Fatalf("%q lost:\n%s", kept, s)
		}
	}
}
