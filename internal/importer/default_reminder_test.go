package importer

import "testing"

// TestImportAddsNoDefaultReminder (default-reminders D6): an import writes the
// reminders its source has and never the person's default reminder.
func TestImportAddsNoDefaultReminder(t *testing.T) {
	h := newHarness(t)
	h.write("phone", 1, "user_prefs", "me", map[string]any{"reminder_default_timed": "-30", "reminder_default_dated": "-1440"})
	job := h.run(string(fixture(t, "generic.json")), Options{TimeZone: "Europe/Berlin"})
	if job.Status != StatusDone {
		t.Fatalf("job = %+v", job)
	}
	if reminders := h.list("reminder", true); len(reminders) != 2 || job.Totals.Reminders != 2 {
		t.Fatalf("reminders = %v, totals = %+v", reminders, job.Totals)
	}
}
