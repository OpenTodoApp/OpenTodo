package httpapi

import (
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/calsync/calsynctest"
)

// PATCH project_calendars matches projects to the connection's writable
// calendars (calsync-project-calendars); another calendar is refused, {}
// clears the matches, and the connection view shows them.
func TestCalendarConnectionProjectCalendars(t *testing.T) {
	e, _ := calsyncEnv(t)
	calsyncOn(t, e)
	cal := calsynctest.New()
	t.Cleanup(cal.Close)
	cal.AddCalendar("home", &calsynctest.Calendar{Name: "Home"})
	allowPrivateTargets(t, e)
	resp, out := e.do("POST", "/api/v1/calendar-sync/connections", map[string]any{"server_url": cal.URL, "username": "me", "password": "app-pass"})
	e.mustStatus(resp, 201, out)
	c := connOf(out)
	id := c["id"].(string)
	var work, home string
	for _, x := range c["calendars"].([]any) {
		m := x.(map[string]any)
		switch m["name"] {
		case "Work":
			work = m["url"].(string)
		case "Home":
			home = m["url"].(string)
		}
	}
	resp, out = e.do("PATCH", "/api/v1/calendar-sync/connections/"+id, map[string]any{"target": work, "project_calendars": map[string]string{"p-home": home}})
	e.mustStatus(resp, 200, out)
	if got := connOf(out)["project_calendars"].(map[string]any); got["p-home"] != home {
		t.Fatalf("matches = %v", got)
	}
	resp, out = e.do("PATCH", "/api/v1/calendar-sync/connections/"+id, map[string]any{"project_calendars": map[string]string{"p-x": "https://elsewhere.example/cal/"}})
	if resp.StatusCode != 400 {
		t.Fatalf("foreign calendar = %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("PATCH", "/api/v1/calendar-sync/connections/"+id, map[string]any{"project_calendars": map[string]string{}})
	e.mustStatus(resp, 200, out)
	if got := connOf(out)["project_calendars"].(map[string]any); len(got) != 0 {
		t.Fatalf("cleared = %v", got)
	}
}
