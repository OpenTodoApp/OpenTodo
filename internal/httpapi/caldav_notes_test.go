package httpapi

import (
	"fmt"
	"strings"
	"testing"
)

// TestCaldavLeavesNotesOut (notes-overview): a calendar app syncing over CalDAV
// receives the tasks as before and no entry for a standalone note, in the Inbox
// calendar (a note without a project) or in a project's calendar.
func TestCaldavLeavesNotesOut(t *testing.T) {
	e, c := davSetup(t)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Garden"})
	e.mustStatus(resp, 201, out)
	pid := out["id"].(string)
	e.syncOps("devA",
		rop("t1", "task", "task-inbox", "title", "Inbox task", 1), rop("t2", "task", "task-inbox", "created_at", 1, 1),
		rop("t3", "task", "task-proj", "title", "Project task", 1), rop("t4", "task", "task-proj", "created_at", 1, 1),
		rop("t5", "task", "task-proj", "project_id", pid, 1),
		rop("n1", "note", "note-inbox", "title", "Inbox note", 1), rop("n2", "note", "note-inbox", "created_at", 1, 1),
		rop("n3", "note", "note-inbox", "description", "text", 1), rop("n4", "note", "note-inbox", "appends.a1", "more", 1),
		rop("n5", "note", "note-proj", "title", "Project note", 1), rop("n6", "note", "note-proj", "created_at", 1, 1),
		rop("n7", "note", "note-proj", "project_id", pid, 1),
		rop("a1", "task", "task-proj", "appends.a2", "pending text", 2),
	)
	for cal, task := range map[string]string{"inbox": "task-inbox", pid: "task-proj"} {
		_, body := c.must("PROPFIND", c.cal(cal), propfindCalendars, 207, "Depth", "1")
		if !strings.Contains(body, task+".ics") {
			t.Fatalf("%s listing lacks the task:\n%s", cal, body)
		}
		_, sync := c.must("REPORT", c.cal(cal), fmt.Sprintf(syncReport, ""), 207, "Depth", "1")
		if !strings.Contains(sync, task+".ics") {
			t.Fatalf("%s sync lacks the task:\n%s", cal, sync)
		}
		for _, note := range []string{"note-inbox", "note-proj"} {
			if strings.Contains(body, note) || strings.Contains(sync, note) {
				t.Fatalf("%s lists note %s:\nlisting %s\nsync %s", cal, note, body, sync)
			}
			c.must("GET", c.cal(cal)+note+".ics", "", 404)
		}
	}
	// A pending append is not calendar data.
	_, ics := c.must("GET", c.cal(pid)+"task-proj.ics", "", 200)
	if strings.Contains(ics, "pending text") {
		t.Fatalf("append leaked into the VTODO:\n%s", ics)
	}
}
