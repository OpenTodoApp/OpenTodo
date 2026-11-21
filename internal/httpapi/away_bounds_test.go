package httpapi

import (
	"net/http"
	"testing"
)

// Away through the API at its bounds (the security read of #1635): a long
// period over several daily series is written in several strict batches; a
// period that would change too much is refused before anything is written;
// "Everything" leaves a teammate's work in a shared project alone; and the
// route is refused on a demo.

func TestAwayLongPeriodOverSeveralSeries(t *testing.T) {
	e := ownerEnv(t)
	var ids []string
	for _, title := range []string{"Stretch", "Read", "Walk"} {
		ids = append(ids, e.newTask(map[string]any{"title": title, "due": map[string]any{"date": "2030-01-01"}, "recurrence": "every day", "habit": true}))
	}
	resp, out := e.do("POST", "/api/v1/away", map[string]any{"from": "2030-01-01", "to": "2030-03-31"})
	e.mustStatus(resp, 200, out)
	if out["skipped"] != float64(3*90) {
		t.Fatalf("answer = %v", out)
	}
	for _, id := range ids {
		if rec := e.task(occurrenceID(id, "2030-03-31")); rec["skipped"] != true {
			t.Fatalf("last day of %s not skipped: %v", id, rec)
		}
	}
	if v := e.awayValue(); v != "2030-01-01..2030-03-31 quiet" {
		t.Fatalf("stored %q", v)
	}
}

func TestAwayRefusesTooManyChanges(t *testing.T) {
	e := ownerEnv(t)
	for i := 0; i < 25; i++ {
		e.newTask(map[string]any{"title": "Daily", "due": map[string]any{"date": "2030-01-01"}, "recurrence": "every day", "habit": true})
	}
	resp, out := e.do("POST", "/api/v1/away", map[string]any{"from": "2030-01-01", "to": "2030-03-31"})
	if resp.StatusCode != http.StatusBadRequest || errCode(out) != "too_large" {
		t.Fatalf("POST = %d %v", resp.StatusCode, out)
	}
	if v := e.awayValue(); v != "" {
		t.Fatalf("a refused period was stored: %q", v)
	}
}

func TestAwayEverythingLeavesTeammatesWork(t *testing.T) {
	e := ownerEnv(t)
	team := e.newProject(map[string]any{"name": "Team"})
	m, alice := e.member("alice@example.com", "198.51.100.21")
	addByEmail(e, m, "/api/v1/projects/"+team+"/members", "alice@example.com", "editor")
	standup := e.newTask(map[string]any{"title": "Standup", "project_id": team, "assignee_id": alice, "due": map[string]any{"date": "2030-01-12"}, "recurrence": "every day"})
	review := e.newTask(map[string]any{"title": "Review", "project_id": team, "due": map[string]any{"date": "2030-01-12"}, "recurrence": "every day"})
	mine := e.newTask(map[string]any{"title": "Stretch", "due": map[string]any{"date": "2030-01-12"}, "recurrence": "every day"})
	resp, out := e.do("POST", "/api/v1/away", map[string]any{"from": "2030-01-12", "to": "2030-01-14"})
	e.mustStatus(resp, 200, out)
	for id, want := range map[string]string{standup: "2030-01-12", review: "2030-01-12", mine: "2030-01-15"} {
		if due := e.task(id)["due"].(map[string]any)["date"]; due != want {
			t.Fatalf("%s due %v, want %s", e.task(id)["title"], due, want)
		}
	}
	// Choosing the shared project covers its series, never one assigned to someone else.
	resp, out = e.do("POST", "/api/v1/away", map[string]any{"from": "2030-01-12", "to": "2030-01-14", "projects": []string{team}})
	e.mustStatus(resp, 200, out)
	if due := e.task(review)["due"].(map[string]any)["date"]; due != "2030-01-15" {
		t.Fatalf("Review due %v", due)
	}
	if due := e.task(standup)["due"].(map[string]any)["date"]; due != "2030-01-12" {
		t.Fatalf("Alice's Standup moved to %v", due)
	}
}

func TestAwayRefusedOnDemo(t *testing.T) {
	d := newDemoServer(t)
	e, _ := d.visitor()
	for _, method := range []string{"POST", "DELETE"} {
		resp, out := e.do(method, "/api/v1/away", map[string]any{"from": "2030-01-01", "to": "2030-01-02"})
		if resp.StatusCode != http.StatusForbidden || errCode(out) != "demo_restricted" {
			t.Fatalf("%s on demo = %d %v", method, resp.StatusCode, out)
		}
	}
}
