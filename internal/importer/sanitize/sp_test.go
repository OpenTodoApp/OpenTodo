package main

import (
	"strings"
	"testing"
)

// A Super Productivity backup keeps its ids, days and milliseconds; titles and
// notes become placeholders and credentials in its settings are blanked.
func TestSuperProductivityJSON(t *testing.T) {
	in := `{"timestamp":1793661869130,"data":{"task":{"ids":["t1"],"entities":{"t1":{"id":"t1","title":"Call Jane",
		"notes":"About the loan","timeSpentOnDay":{"2026-11-03":1500000},"dueDay":"2026-11-05"}}},
		"project":{"ids":["INBOX_PROJECT"],"entities":{"INBOX_PROJECT":{"id":"INBOX_PROJECT","title":"Inbox"}}},
		"globalConfig":{"sync":{"webDav":{"password":"hunter2","userName":"jane"},"dropboxSync":{"accessToken":"sl.abc"}}}}}`
	out, err := newScrubber().jsonFile([]byte(in))
	if err != nil {
		t.Fatal(err)
	}
	s := string(out)
	for _, gone := range []string{"Jane", "loan", "hunter2", "sl.abc"} {
		if strings.Contains(s, gone) {
			t.Fatalf("%q survived:\n%s", gone, s)
		}
	}
	for _, kept := range []string{`"t1"`, `"2026-11-03": 1500000`, `"2026-11-05"`, `"Inbox"`, `"INBOX_PROJECT"`} {
		if !strings.Contains(s, kept) {
			t.Fatalf("%q lost:\n%s", kept, s)
		}
	}
}
