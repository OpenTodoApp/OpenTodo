package httpapi

import (
	"net/http"
	"testing"
)

// location-reminders 1.3: the kinds arrive and leave with radius_m on the
// reminder routes, under the existing authentication and role rules.
func TestLocationRemindersREST(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Buy stamps", "location": map[string]any{"name": "Post office", "lat": 45.46, "lon": 9.19}})
	e.mustStatus(resp, 201, out)
	task := out["id"].(string)

	// Create: 201 with fire_at null.
	resp, out = e.do("POST", "/api/v1/reminders", map[string]any{"task_id": task, "kind": "arrive", "radius_m": 200})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	if out["kind"] != "arrive" || out["radius_m"] != float64(200) || out["fire_at"] != nil || out["offset_minutes"] != nil {
		t.Fatalf("created %v", out)
	}
	// Update the radius and the direction.
	resp, out = e.do("PATCH", "/api/v1/reminders/"+id, map[string]any{"radius_m": 1000, "kind": "leave"})
	e.mustStatus(resp, 200, out)
	if out["kind"] != "leave" || out["radius_m"] != float64(1000) {
		t.Fatalf("patched %v", out)
	}
	// Refused values: 400 invalid_input and nothing changes.
	before := countOps(t, e)
	for _, bad := range []struct {
		method, path string
		body         map[string]any
	}{
		{"POST", "/api/v1/reminders", map[string]any{"task_id": task, "kind": "arrive", "radius_m": 20000}},
		{"POST", "/api/v1/reminders", map[string]any{"task_id": task, "kind": "arrive", "radius_m": 50}},
		{"POST", "/api/v1/reminders", map[string]any{"task_id": task, "kind": "arrive"}},
		{"POST", "/api/v1/reminders", map[string]any{"task_id": task, "kind": "leave", "radius_m": 150, "fire_at": 1_791_000_000_000}},
		{"POST", "/api/v1/reminders", map[string]any{"task_id": task, "kind": "arrive", "radius_m": 150, "offset_minutes": -30}},
		{"POST", "/api/v1/reminders", map[string]any{"task_id": task, "kind": "relative", "offset_minutes": 0, "radius_m": 150}},
		{"POST", "/api/v1/reminders", map[string]any{"task_id": task, "radius_m": 150, "fire_at": 1_791_000_000_000}},
		{"PATCH", "/api/v1/reminders/" + id, map[string]any{"radius_m": 99}},
		{"PATCH", "/api/v1/reminders/" + id, map[string]any{"radius_m": nil}},
		{"PATCH", "/api/v1/reminders/" + id, map[string]any{"fire_at": 1_791_000_000_000}},
	} {
		resp, out := e.do(bad.method, bad.path, bad.body)
		e.mustStatus(resp, http.StatusBadRequest, out)
		if code := out["error"].(map[string]any)["code"]; code != "invalid_input" {
			t.Fatalf("%s %v: code %v", bad.method, bad.body, code)
		}
	}
	if after := countOps(t, e); after != before {
		t.Fatalf("refused writes stored %d ops", after-before)
	}
	// Turning it into an absolute reminder clears the radius.
	resp, out = e.do("PATCH", "/api/v1/reminders/"+id, map[string]any{"kind": "absolute", "fire_at": 1_791_000_000_000})
	e.mustStatus(resp, 200, out)
	if out["radius_m"] != nil || out["fire_at"] != float64(1_791_000_000_000) {
		t.Fatalf("absolute %v", out)
	}
	// And back: the firing time is cleared.
	resp, out = e.do("PATCH", "/api/v1/reminders/"+id, map[string]any{"kind": "arrive", "radius_m": 150})
	e.mustStatus(resp, 200, out)
	if out["fire_at"] != nil || out["radius_m"] != float64(150) {
		t.Fatalf("arrive again %v", out)
	}
	// Reads and the export include it like any reminder.
	resp, out = e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, 200, out)
	if l := out["reminders"].([]any); len(l) != 1 || l[0].(map[string]any)["kind"] != "arrive" {
		t.Fatalf("export %v", out["reminders"])
	}

	// Unauthenticated: 401 unauthorized and nothing changes.
	anon := newClientAt(e, "10.0.0.9")
	resp, out = anon.do("POST", "/api/v1/reminders", map[string]any{"task_id": task, "kind": "arrive", "radius_m": 200})
	anon.mustStatus(resp, http.StatusUnauthorized, out)
	// A read token is refused on the write.
	secret := e.token("read")
	c := e.bearerClient()
	resp, out = c.do("POST", "/api/v1/reminders", map[string]any{"task_id": task, "kind": "arrive", "radius_m": 200}, bearer(secret)...)
	c.mustStatus(resp, http.StatusForbidden, out)
	resp, out = e.do("GET", "/api/v1/reminders", nil)
	e.mustStatus(resp, 200, out)
	if n := len(out["reminders"].([]any)); n != 1 {
		t.Fatalf("reminders after refused writes: %d", n)
	}
}

// Reminders are personal (OpenSpec `reminders`): a viewer of a shared project
// keeps location reminders on its tasks for themselves, and the owner never
// sees them.
func TestLocationReminderOnSharedTaskIsPersonal(t *testing.T) {
	e := ownerEnv(t)
	bob, _ := e.member("bob@example.com", "10.0.0.2")
	home := e.create("/api/v1/projects", map[string]any{"name": "Household"})
	addByEmail(e, bob, "/api/v1/projects/"+home+"/members", "bob@example.com", "viewer")
	task := e.create("/api/v1/tasks", map[string]any{"title": "Take the parcel", "project_id": home, "location": map[string]any{"name": "Home", "lat": 45.46, "lon": 9.19}})
	resp, out := bob.do("POST", "/api/v1/reminders", map[string]any{"task_id": task, "kind": "leave", "radius_m": 300})
	bob.mustStatus(resp, 201, out)
	// The viewer still cannot change the task itself.
	resp, out = bob.do("PATCH", "/api/v1/tasks/"+task, map[string]any{"title": "Mine now"})
	bob.mustStatus(resp, http.StatusForbidden, out)
	resp, out = e.do("GET", "/api/v1/reminders", nil)
	e.mustStatus(resp, 200, out)
	if n := len(out["reminders"].([]any)); n != 0 {
		t.Fatalf("owner sees the viewer's reminders: %v", out)
	}
}
