package httpapi

import (
	"strings"
	"testing"
)

// TestCaldavURLAppLinkOrigin (app-links D5, "CalDAV URL as origin"): a VTODO URL
// that is a link into another app becomes the origin of a task without one, a
// later URL updates an origin CalDAV set, and an http(s) URL or a task with an
// origin of its own keeps today's handling. The URL line stays client data.
func TestCaldavURLAppLinkOrigin(t *testing.T) {
	e, c := davSetup(t)
	link := "obsidian://open?vault=V&file=Note"
	c.must("PUT", c.cal("inbox")+"note-task.ics", vtodoBody("note-task", "SUMMARY:From the note", "URL:"+link), 201, "If-None-Match", "*")
	o, _ := e.task("note-task")["origin"].(map[string]any)
	if o["kind"] != "url" || o["url"] != link || o["provider"] != "caldav" {
		t.Fatalf("origin = %v", e.task("note-task")["origin"])
	}
	_, ics := c.must("GET", c.cal("inbox")+"note-task.ics", "", 200)
	if !strings.Contains(ics, "URL:"+link) {
		t.Fatalf("the URL line is not served back:\n%s", ics)
	}

	moved := "obsidian://open?vault=V&file=Other"
	c.must("PUT", c.cal("inbox")+"note-task.ics", vtodoBody("note-task", "SUMMARY:From the note", "URL:"+moved), 204)
	if o, _ := e.task("note-task")["origin"].(map[string]any); o["url"] != moved {
		t.Fatalf("a later URL did not update the origin: %v", o)
	}

	// An http(s) URL keeps today's handling: client data only.
	c.must("PUT", c.cal("inbox")+"web.ics", vtodoBody("web", "SUMMARY:Page", "URL:https://example.com/x"), 201, "If-None-Match", "*")
	if o := e.task("web")["origin"]; o != nil {
		t.Fatalf("http URL became an origin: %v", o)
	}

	// An origin the task already has from elsewhere is never replaced.
	resp, out := e.do("PATCH", "/api/v1/tasks/web", map[string]any{"origin": map[string]any{"kind": "url", "url": "https://example.com/x"}})
	e.mustStatus(resp, 200, out)
	c.must("PUT", c.cal("inbox")+"web.ics", vtodoBody("web", "SUMMARY:Page", "URL:zotero://select/items/ABC"), 204)
	if o, _ := e.task("web")["origin"].(map[string]any); o["url"] != "https://example.com/x" {
		t.Fatalf("an origin of its own was replaced: %v", o)
	}

	// A denied scheme is never an origin.
	c.must("PUT", c.cal("inbox")+"js.ics", vtodoBody("js", "SUMMARY:x", "URL:javascript:alert(1)"), 201, "If-None-Match", "*")
	if o := e.task("js")["origin"]; o != nil {
		t.Fatalf("javascript URL became an origin: %v", o)
	}
}
