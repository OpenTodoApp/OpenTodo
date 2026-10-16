package importer

import (
	"context"
	"testing"
)

const prefsOwnExport = `{"format":"opentodo-export","version":1,
  "projects":[],"tasks":[],"labels":[],"sections":[],"reminders":[],"views":[],"comments":[],
  "user_prefs":[{"id":"me","date_format":"iso","time_format":"24h","week_start":"sun","theme_mode":"dark","theme_accent":"indigo"}],
  "encryption":null}`

// TestOwnExportRestoresUserPrefs (date-time-preferences D1): an own export brings
// the date and time preferences to a new account, and an account that already
// has preferences keeps them unless the import overwrites existing records.
func TestOwnExportRestoresUserPrefs(t *testing.T) {
	h := newHarness(t)
	job := h.run(prefsOwnExport, Options{})
	if job.Status != StatusDone || job.Totals.Written != 1 {
		t.Fatalf("job = %+v", job)
	}
	row, err := h.sync.Get(context.Background(), h.uid, "user_prefs", "me")
	if err != nil || row == nil {
		t.Fatalf("user_prefs: %v %v", row, err)
	}
	if str(row, "date_format") != "iso" || str(row, "time_format") != "24h" || str(row, "week_start") != "sun" ||
		str(row, "theme_mode") != "dark" || str(row, "theme_accent") != "indigo" {
		t.Fatalf("restored prefs = %v", row)
	}

	h.write("phone", 1, "user_prefs", "me", map[string]any{"date_format": "day-month"})
	plan, err := h.svc.Preview(context.Background(), h.uid, []byte(prefsOwnExport), Options{})
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Rows) != 1 || plan.Rows[0].Outcome != OutcomeSkip || plan.Rows[0].Title != "Preferences" {
		t.Fatalf("second import rows = %+v", plan.Rows)
	}
}

const reviewOwnExport = `{"format":"opentodo-export","version":1,
  "projects":[],"tasks":[],"labels":[],"sections":[],"reminders":[],"views":[],"comments":[],"user_prefs":[],
  "review":[{"id":"me","completed_at":1760600000000}],
  "encryption":null}`

// TestOwnExportRestoresReview (stats-and-review D4): an own export brings the
// time of the last weekly review to a new account; a second import skips it.
func TestOwnExportRestoresReview(t *testing.T) {
	h := newHarness(t)
	job := h.run(reviewOwnExport, Options{})
	if job.Status != StatusDone || job.Totals.Written != 1 {
		t.Fatalf("job = %+v", job)
	}
	row, err := h.sync.Get(context.Background(), h.uid, "review", "me")
	if err != nil || row == nil || string(row["completed_at"]) != "1760600000000" {
		t.Fatalf("review: %v %v", row, err)
	}
	plan, err := h.svc.Preview(context.Background(), h.uid, []byte(reviewOwnExport), Options{})
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Rows) != 1 || plan.Rows[0].Outcome != OutcomeSkip || plan.Rows[0].Title != "Last weekly review" {
		t.Fatalf("second import rows = %+v", plan.Rows)
	}
}
