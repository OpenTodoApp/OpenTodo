package httpapi

import (
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/defaultreminder"
)

// TestDefaultReminderREST (default-reminders 4.1): the task routes apply the
// person's default only with ?default_reminder=true, in the same batch.
func TestDefaultReminderREST(t *testing.T) {
	e := ownerEnv(t)
	e.syncOps("devA",
		rop("p1", "user_prefs", "me", "reminder_default_timed", "-10", 1),
		rop("p2", "user_prefs", "me", "reminder_default_dated", "-1440", 1),
	)
	due := map[string]any{"date": "2026-11-06", "time": "09:00"}

	// Without the flag: scripts and integrations behave as before.
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Script", "due": due})
	e.mustStatus(resp, 201, out)
	if l := e.reminders(out["id"].(string)); len(l) != 0 {
		t.Fatalf("no flag: reminders %v", l)
	}

	// With it: one reminder 10 minutes before, with the default id (UTC: no zone known).
	resp, out = e.do("POST", "/api/v1/tasks?default_reminder=true", map[string]any{"title": "Dentist", "due": due})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	l := e.reminders(id)
	if len(l) != 1 || l[0]["offset_minutes"] != float64(-10) || l[0]["fire_at"] != float64(1793955000000) || l[0]["kind"] != "relative" {
		t.Fatalf("created reminders %v", l)
	}
	uid := e.userID()
	if l[0]["id"] != defaultreminder.ID(uid, id) {
		t.Fatalf("id %v, want the default id", l[0]["id"])
	}

	// PATCH: a time removed switches the untouched default to the date-only one;
	// moving it to another day adds nothing.
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id+"?default_reminder=true", map[string]any{"due": map[string]any{"date": "2026-11-06"}})
	e.mustStatus(resp, 200, out)
	l = e.reminders(id)
	if len(l) != 1 || l[0]["offset_minutes"] != float64(-1440) || l[0]["fire_at"] != float64(1793955600000-86_400_000) {
		t.Fatalf("after removing the time %v", l)
	}
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id+"?default_reminder=true", map[string]any{"due": map[string]any{"date": "2026-11-07"}})
	e.mustStatus(resp, 200, out)
	if l = e.reminders(id); len(l) != 1 || l[0]["fire_at"] != float64(1793955600000) {
		t.Fatalf("after moving %v", l)
	}

	// An undated task scheduled with the flag gets one; =false gets none.
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Later"})
	e.mustStatus(resp, 201, out)
	later := out["id"].(string)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+later+"?default_reminder=false", map[string]any{"due": due})
	e.mustStatus(resp, 200, out)
	if l := e.reminders(later); len(l) != 0 {
		t.Fatalf("=false: %v", l)
	}
	resp, out = e.do("PATCH", "/api/v1/tasks/"+later, map[string]any{"due": nil})
	e.mustStatus(resp, 200, out)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+later+"?default_reminder=true", map[string]any{"due": due})
	e.mustStatus(resp, 200, out)
	if l := e.reminders(later); len(l) != 1 {
		t.Fatalf("schedule with the flag: %v", l)
	}
}

func TestDefaultReminderRESTRefusals(t *testing.T) {
	e := ownerEnv(t)
	e.syncOps("devA", rop("p1", "user_prefs", "me", "reminder_default_timed", "-10", 1))
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Existing"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	due := map[string]any{"date": "2026-11-06", "time": "09:00"}
	before := countOps(t, e)

	resp, out = e.do("PATCH", "/api/v1/tasks/"+id+"?default_reminder=maybe", map[string]any{"due": due})
	if resp.StatusCode != 400 || errCode(out) != "invalid_input" {
		t.Fatalf("invalid flag: %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("POST", "/api/v1/tasks?default_reminder=1", map[string]any{"title": "x", "due": due})
	if resp.StatusCode != 400 {
		t.Fatalf("invalid flag on create: %d %v", resp.StatusCode, out)
	}
	anon := newClientAt(e, "203.0.113.51")
	resp, out = anon.do("POST", "/api/v1/tasks?default_reminder=true", map[string]any{"title": "x", "due": due})
	if resp.StatusCode != 401 {
		t.Fatalf("no auth: %d %v", resp.StatusCode, out)
	}
	read := e.token("read")
	resp, out = e.bearerClient().do("POST", "/api/v1/tasks?default_reminder=true", map[string]any{"title": "x", "due": due}, bearer(read)...)
	if resp.StatusCode != 403 || errCode(out) != "insufficient_scope" {
		t.Fatalf("read token: %d %v", resp.StatusCode, out)
	}
	if after := countOps(t, e); after != before {
		t.Fatalf("ops written: %d → %d", before, after)
	}
}

// TestDefaultReminderAgentTools (default-reminders 4.2): create_tasks and
// schedule_tasks add the person's default reminder in the same change, written
// with the agent's device.
func TestDefaultReminderAgentTools(t *testing.T) {
	e, tokenID, secret, c := agentReady(t)
	e.syncOps("devA", rop("p1", "user_prefs", "me", "reminder_default_timed", "-30", 1))
	uid := e.userID()

	created := firstID(c.mustTool(secret, "create_tasks", map[string]any{"items": []any{
		map[string]any{"title": "Call", "due": map[string]any{"date": "2026-11-06", "time": "15:00"}},
	}}))
	l := e.reminders(created)
	if len(l) != 1 || l[0]["id"] != defaultreminder.ID(uid, created) || l[0]["offset_minutes"] != float64(-30) {
		t.Fatalf("create_tasks reminders %v", l)
	}
	if devs := devicesOf(t, e, l[0]["id"].(string)); len(devs) != 1 || devs["agent:"+tokenID] == 0 {
		t.Fatalf("reminder devices %v", devs)
	}

	undated := firstID(c.mustTool(secret, "create_tasks", map[string]any{"items": []any{map[string]any{"title": "Later"}}}))
	if l := e.reminders(undated); len(l) != 0 {
		t.Fatalf("undated: %v", l)
	}
	c.mustTool(secret, "schedule_tasks", map[string]any{"ids": []string{undated}, "due": map[string]any{"date": "2026-11-06", "time": "15:00"}})
	l = e.reminders(undated)
	if len(l) != 1 || l[0]["fire_at"] != float64(1793977200000-30*60_000) {
		t.Fatalf("schedule_tasks reminders %v", l)
	}
	if devs := devicesOf(t, e, l[0]["id"].(string)); len(devs) != 1 || devs["agent:"+tokenID] == 0 {
		t.Fatalf("reminder devices %v", devs)
	}
	// Rescheduling adds nothing and moves the one reminder.
	c.mustTool(secret, "schedule_tasks", map[string]any{"ids": []string{undated}, "due": map[string]any{"date": "2026-11-07", "time": "15:00"}})
	if l = e.reminders(undated); len(l) != 1 || l[0]["fire_at"] != float64(1793977200000+86_400_000-30*60_000) {
		t.Fatalf("after rescheduling %v", l)
	}
}

// TestCaldavPutAddsNoDefaultReminder (default-reminders D6): a calendar client
// keeps its own alarm defaults; a CalDAV write never adds the person's default.
func TestCaldavPutAddsNoDefaultReminder(t *testing.T) {
	e, c := davSetup(t)
	e.syncOps("devA", rop("p1", "user_prefs", "me", "reminder_default_timed", "-30", 1))
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Garden"})
	e.mustStatus(resp, 201, out)
	pid := out["id"].(string)
	uid := "6A1D3A2C-8E4B-4B7A-9C11-0A2B3C4D5E6F"
	c.must("PUT", c.cal(pid)+uid+".ics", vtodoBody(uid, "SUMMARY:Water the tomatoes", "DUE:20261011T093000"), 201, "If-None-Match", "*")
	if e.task(uid)["due"] == nil {
		t.Fatal("no due")
	}
	if rems := e.reminders(uid); len(rems) != 0 {
		t.Fatalf("reminders %v", rems)
	}
}
