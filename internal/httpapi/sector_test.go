package httpapi

import (
	"strings"
	"testing"
)

// TestSectorREST (OpenSpec change time-sectors, task 2.2): sector is in the
// task shape (null when none), POST and PATCH accept a period or null and
// refuse anything else with 400 invalid_input and no write; the export carries it.
func TestSectorREST(t *testing.T) {
	e := newEnv(t, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Plain"})
	e.mustStatus(resp, 201, out)
	if v, has := out["sector"]; !has || v != nil {
		t.Fatalf("plain task sector = %v (present %v)", v, has)
	}
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Book the venue", "sector": "2026-W53"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	if out["sector"] != "2026-W53" {
		t.Fatalf("created = %v", out)
	}
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"due": map[string]any{"date": "2026-11-04"}, "sector": "2026-11"})
	e.mustStatus(resp, 200, out)
	if out["sector"] != "2026-11" || out["due"] == nil {
		t.Fatalf("both written as sent = %v", out)
	}
	for _, bad := range []any{"2026-W54", "2027-W53", "2026-13", "2026-Q5", "this week", "1999-Q1", 44, true} {
		resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"sector": bad})
		e.mustStatus(resp, 400, out)
		if errCode(out) != "invalid_input" {
			t.Fatalf("%v: code %v", bad, out)
		}
	}
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Soon", "sector": "soon"})
	e.mustStatus(resp, 400, out)
	resp, out = e.do("GET", "/api/v1/tasks/"+id, nil)
	e.mustStatus(resp, 200, out)
	if out["sector"] != "2026-11" {
		t.Fatalf("after refusals = %v", out)
	}
	resp, out = e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, 200, out)
	found := false
	for _, x := range out["tasks"].([]any) {
		if task := x.(map[string]any); task["id"] == id {
			found = task["sector"] == "2026-11"
		}
	}
	if !found {
		t.Fatalf("export lacks the sector: %v", out["tasks"])
	}
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"sector": nil})
	e.mustStatus(resp, 200, out)
	if v, has := out["sector"]; !has || v != nil {
		t.Fatalf("cleared = %v", out)
	}
}

// TestCaldavSector (task 5.1): X-OPENTODO-SECTOR sets the sector and is served
// back without a DUE; an invalid value is kept in ical_extra and leaves it; a
// VTODO without the property keeps it.
func TestCaldavSector(t *testing.T) {
	e, c := davSetup(t)
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:Plan", "X-OPENTODO-SECTOR:2026-Q1"), 201)
	if task := e.task("t1"); task["sector"] != "2026-Q1" {
		t.Fatalf("task %v", task)
	}
	_, ics := c.must("GET", c.cal("inbox")+"t1.ics", "", 200)
	if !strings.Contains(ics, "X-OPENTODO-SECTOR:2026-Q1\r\n") || strings.Contains(ics, "\r\nDUE") {
		t.Fatalf("GET:\n%s", ics)
	}
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:Plan", "X-OPENTODO-SECTOR:SOON"), 204)
	task := e.task("t1")
	if task["sector"] != "2026-Q1" || !strings.Contains(task["ical_extra"].(string), "X-OPENTODO-SECTOR:SOON") {
		t.Fatalf("invalid value: %v", task)
	}
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:Plan the offsite"), 204)
	if task := e.task("t1"); task["sector"] != "2026-Q1" || task["title"] != "Plan the offsite" {
		t.Fatalf("without the property: %v", task)
	}
}

// TestViewSectorQuery (task 4.3): a saved view's sector terms are validated;
// an invalid period is refused with 400 invalid_input naming it.
func TestViewSectorQuery(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/views", map[string]any{"name": "This week", "query": "#Work & sector: this week | carried"})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("POST", "/api/v1/views", map[string]any{"name": "Bad", "query": "sector: 2026-W60"})
	e.mustStatus(resp, 400, out)
	if errCode(out) != "invalid_input" || !strings.Contains(out["error"].(map[string]any)["message"].(string), "2026-W60") {
		t.Fatalf("invalid period: %v", out)
	}
}

// TestQuickAddParseSector (task 4.2): the parse route reads sector phrases only
// with the account's Time sectors switch on, returns the sector in its fields and
// names it in a chip in the account's language.
func TestQuickAddParseSector(t *testing.T) {
	e := ownerEnv(t)
	c := e.bearerClient()
	h := bearer(e.token("full"))
	resp, out := c.do("POST", parsePath, parseBody("Draft the budget this week"), h...)
	c.mustStatus(resp, 200, out)
	if out["title"] != "Draft the budget this week" || out["fields"].(map[string]any)["sector"] != nil {
		t.Fatalf("switch off: %v", out)
	}
	e.syncOps("devA", rop("p1", "user_prefs", "me", "time_sectors", "on", 1))
	resp, out = c.do("POST", parsePath, parseBody("Draft the budget this week"), h...)
	c.mustStatus(resp, 200, out)
	if out["title"] != "Draft the budget" || out["fields"].(map[string]any)["sector"] != "2026-W43" {
		t.Fatalf("switch on: %v", out)
	}
	var chips []string
	for _, x := range out["chips"].([]any) {
		ch := x.(map[string]any)
		chips = append(chips, ch["kind"].(string)+":"+ch["text"].(string))
	}
	if strings.Join(chips, ",") != "sector:This week" {
		t.Fatalf("chips %v", chips)
	}
	// Next week alone keeps its date meaning.
	resp, out = c.do("POST", parsePath, parseBody("Call Ana next week"), h...)
	c.mustStatus(resp, 200, out)
	if f := out["fields"].(map[string]any); f["sector"] != nil || f["due"] == nil {
		t.Fatalf("next week: %v", out)
	}
}
