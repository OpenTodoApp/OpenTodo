package httpapi

import (
	"context"
	"testing"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Away through the API (OpenSpec change away-periods, "Away through the API and CLI").

func (e *env) awayValue() string {
	e.t.Helper()
	p, err := e.sync.Get(context.Background(), e.userID(), "user_prefs", "me")
	if err != nil {
		e.t.Fatal(err)
	}
	if p == nil {
		return ""
	}
	return opsync.StringOf(p["away"])
}

func TestAwayStoresThePeriodAndSkips(t *testing.T) {
	e := ownerEnv(t)
	stretch := e.newTask(map[string]any{"title": "Stretch", "due": map[string]any{"date": "2030-01-10"}, "recurrence": "every day", "habit": true})
	work := e.newProject(map[string]any{"name": "Work"})
	report := e.newTask(map[string]any{"title": "Report", "project_id": work, "due": map[string]any{"date": "2030-01-13"}, "recurrence": "every day"})
	once := e.newTask(map[string]any{"title": "Dentist", "due": map[string]any{"date": "2030-01-13"}})

	resp, out := e.do("POST", "/api/v1/away", map[string]any{"from": "2030-01-12", "to": "2030-01-14"})
	e.mustStatus(resp, 200, out)
	if out["away"] != "2030-01-12..2030-01-14 quiet" || out["skipped"] != float64(5) {
		t.Fatalf("answer = %v", out)
	}
	for _, d := range []string{"2030-01-12", "2030-01-13", "2030-01-14"} {
		if rec := e.task(occurrenceID(stretch, d)); rec["skipped"] != true {
			t.Fatalf("%s not skipped: %v", d, rec)
		}
	}
	if due := e.task(stretch)["due"].(map[string]any)["date"]; due != "2030-01-10" {
		t.Fatalf("Stretch moved to %v", due)
	}
	if due := e.task(report)["due"].(map[string]any)["date"]; due != "2030-01-15" {
		t.Fatalf("Report due %v", due)
	}
	if due := e.task(once)["due"].(map[string]any)["date"]; due != "2030-01-13" {
		t.Fatalf("a plain task moved: %v", due)
	}
	if v := e.awayValue(); v != "2030-01-12..2030-01-14 quiet" {
		t.Fatalf("stored %q", v)
	}
	// The same period again writes no second record.
	resp, out = e.do("POST", "/api/v1/away", map[string]any{"from": "2030-01-12", "to": "2030-01-14", "pauseReminders": false})
	e.mustStatus(resp, 200, out)
	if out["skipped"] != float64(0) || out["away"] != "2030-01-12..2030-01-14" {
		t.Fatalf("again = %v", out)
	}
	resp, out = e.do("DELETE", "/api/v1/away", nil)
	e.mustStatus(resp, 204, out)
	if v := e.awayValue(); v != "" {
		t.Fatalf("after DELETE %q", v)
	}
	if rec := e.task(occurrenceID(stretch, "2030-01-12")); rec["skipped"] != true {
		t.Fatal("ending the period undid a skip")
	}
}

func TestAwayOnlyChosenProjects(t *testing.T) {
	e := ownerEnv(t)
	work := e.newProject(map[string]any{"name": "Work"})
	home := e.newProject(map[string]any{"name": "Home"})
	report := e.newTask(map[string]any{"title": "Report", "project_id": work, "due": map[string]any{"date": "2030-01-12"}, "recurrence": "every day"})
	plants := e.newTask(map[string]any{"title": "Water the plants", "project_id": home, "due": map[string]any{"date": "2030-01-12"}, "recurrence": "every day"})
	resp, out := e.do("POST", "/api/v1/away", map[string]any{"from": "2030-01-12", "to": "2030-01-14", "projects": []string{work}})
	e.mustStatus(resp, 200, out)
	if due := e.task(report)["due"].(map[string]any)["date"]; due != "2030-01-15" {
		t.Fatalf("Report due %v", due)
	}
	if due := e.task(plants)["due"].(map[string]any)["date"]; due != "2030-01-12" {
		t.Fatalf("Water the plants moved to %v", due)
	}
}

func TestAwayRefusals(t *testing.T) {
	e := ownerEnv(t)
	anon := e.bearerClient()
	before := countOps(t, e)
	resp, out := anon.do("POST", "/api/v1/away", map[string]any{"from": "2030-01-12", "to": "2030-01-14"})
	if resp.StatusCode != 401 || errCode(out) != "unauthorized" {
		t.Fatalf("anonymous: %d %v", resp.StatusCode, out)
	}
	read := e.token("read")
	for _, m := range []string{"POST", "DELETE"} {
		resp, out = anon.do(m, "/api/v1/away", map[string]any{"from": "2030-01-12", "to": "2030-01-14"}, bearer(read)...)
		if resp.StatusCode != 403 || errCode(out) != "insufficient_scope" {
			t.Fatalf("read token %s: %d %v", m, resp.StatusCode, out)
		}
	}
	for _, c := range []struct {
		body  map[string]any
		field string
	}{
		{map[string]any{"from": "2030-11-30", "to": "2030-11-24"}, "from"},
		{map[string]any{"from": "2030-02-30", "to": "2030-03-02"}, "from"},
		{map[string]any{"from": "2030-01-01", "to": "nope"}, "to"},
		{map[string]any{"from": "2030-01-01", "to": "2030-04-01"}, "to"},
	} {
		resp, out = e.do("POST", "/api/v1/away", c.body)
		msg, _ := out["error"].(map[string]any)["message"].(string)
		if resp.StatusCode != 400 || errCode(out) != "invalid_input" || len(msg) < len(c.field) || msg[:len(c.field)] != c.field {
			t.Fatalf("%v: %d %v", c.body, resp.StatusCode, out)
		}
	}
	for _, body := range []map[string]any{
		{"from": "2030-01-12", "to": "2030-01-14", "projects": []string{"nope"}},
		{"from": "2030-01-12", "to": "2030-01-14", "labels": []string{"nope"}},
	} {
		resp, out = e.do("POST", "/api/v1/away", body)
		if resp.StatusCode != 404 {
			t.Fatalf("%v: %d %v", body, resp.StatusCode, out)
		}
	}
	if after := countOps(t, e); after != before {
		t.Fatalf("a refused request wrote: %d → %d ops", before, after)
	}
}
