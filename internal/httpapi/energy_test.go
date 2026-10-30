package httpapi

import (
	"strings"
	"testing"
)

// TestEnergyREST (OpenSpec change task-energy, task 4.1): energy is in the
// task shape (null when none), POST and PATCH accept a level or null and
// refuse anything else with 400 invalid_energy and no write.
func TestEnergyREST(t *testing.T) {
	e := newEnv(t, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Plain"})
	e.mustStatus(resp, 201, out)
	if v, has := out["energy"]; !has || v != nil {
		t.Fatalf("plain task energy = %v (present %v)", v, has)
	}
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Draft", "energy": "deep"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	if out["energy"] != "deep" {
		t.Fatalf("created = %v", out)
	}
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"energy": "low"})
	e.mustStatus(resp, 200, out)
	if out["energy"] != "low" {
		t.Fatalf("patched = %v", out)
	}
	for _, bad := range []any{"high", "Low", 2, true} {
		resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"energy": bad})
		e.mustStatus(resp, 400, out)
		if errCode(out) != "invalid_energy" {
			t.Fatalf("%v: code %v", bad, out)
		}
	}
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Climb", "energy": "high"})
	e.mustStatus(resp, 400, out)
	if errCode(out) != "invalid_energy" {
		t.Fatalf("create high: %v", out)
	}
	resp, out = e.do("GET", "/api/v1/tasks/"+id, nil)
	e.mustStatus(resp, 200, out)
	if out["energy"] != "low" {
		t.Fatalf("after refusals = %v", out)
	}
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"energy": nil})
	e.mustStatus(resp, 200, out)
	if v, has := out["energy"]; !has || v != nil {
		t.Fatalf("cleared = %v", out)
	}

	// Without a session or token: 401, nothing written.
	anon := newClientFor(e)
	resp, out = anon.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"energy": "deep"})
	e.mustStatus(resp, 401, out)
	resp, out = e.do("GET", "/api/v1/tasks/"+id, nil)
	e.mustStatus(resp, 200, out)
	if out["energy"] != nil {
		t.Fatalf("anonymous write landed: %v", out)
	}
}

// TestEnergyViewerRefused: a viewer of a shared project sees the energy and
// cannot change it (403, like any field).
func TestEnergyViewerRefused(t *testing.T) {
	se := newShareEnv(t)
	resp, out := se.alice.do("PATCH", "/api/v1/tasks/"+se.task, map[string]any{"energy": "deep"})
	se.alice.mustStatus(resp, 200, out)
	se.share(se.alice, "bob@example.com", "viewer")
	resp, out = se.bob.do("GET", "/api/v1/tasks/"+se.task, nil)
	se.bob.mustStatus(resp, 200, out)
	if out["energy"] != "deep" {
		t.Fatalf("viewer reads %v", out)
	}
	resp, out = se.bob.do("PATCH", "/api/v1/tasks/"+se.task, map[string]any{"energy": "low"})
	se.bob.mustStatus(resp, 403, out)
	resp, out = se.alice.do("GET", "/api/v1/tasks/"+se.task, nil)
	se.alice.mustStatus(resp, 200, out)
	if out["energy"] != "deep" {
		t.Fatalf("viewer write landed: %v", out)
	}
}

// TestCaldavEnergy (task 4.5): X-OPENTODO-ENERGY sets the energy, is served
// back, an unknown value is kept in ical_extra and leaves it, and a VTODO
// without the property clears the energy it was served with.
func TestCaldavEnergy(t *testing.T) {
	e, c := davSetup(t)
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:Sort", "X-OPENTODO-ENERGY:low"), 201)
	if task := e.task("t1"); task["energy"] != "low" {
		t.Fatalf("task %v", task)
	}
	_, ics := c.must("GET", c.cal("inbox")+"t1.ics", "", 200)
	if !strings.Contains(ics, "X-OPENTODO-ENERGY:LOW\r\n") {
		t.Fatalf("GET:\n%s", ics)
	}
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:Sort", "X-OPENTODO-ENERGY:HIGH"), 204)
	task := e.task("t1")
	if task["energy"] != "low" || !strings.Contains(task["ical_extra"].(string), "X-OPENTODO-ENERGY:HIGH") {
		t.Fatalf("unknown value: %v", task)
	}
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:Sort"), 204)
	if task := e.task("t1"); task["energy"] != nil {
		t.Fatalf("without the property: %v", task)
	}
}

// TestQuickAddParseEnergy: the parse route reads `~low` only with Energy
// levels on (the account's preference) and names it in the account's language.
func TestQuickAddParseEnergy(t *testing.T) {
	a := parseAccountData{lang: "de", labels: map[string]string{}, names: map[string]string{}}
	a.ctx.Languages = []string{"de"}
	if got := parseLine("Rechnungen ablegen ~L", a, "2026-10-14", "08:00"); got.Title != "Rechnungen ablegen ~L" || got.Fields["energy"] != nil {
		t.Fatalf("off: %+v", got)
	}
	a.ctx.Energy = true
	got := parseLine("Rechnungen ~d ablegen ~L", a, "2026-10-14", "08:00")
	if got.Title != "Rechnungen ablegen" || got.Fields["energy"] != "low" {
		t.Fatalf("on: %+v", got)
	}
	var chips []string
	for _, c := range got.Chips {
		chips = append(chips, c.Kind+":"+c.Text)
	}
	if strings.Join(chips, ",") != "energy:Energie: niedrig" {
		t.Fatalf("chips %v", chips)
	}
}
