package importer

import (
	"context"
	"testing"
)

const prefsOwnExport = `{"format":"opentodo-export","version":1,
  "projects":[],"tasks":[],"labels":[],"sections":[],"reminders":[],"views":[],"comments":[],
  "user_prefs":[{"id":"me","date_format":"iso","time_format":"24h","week_start":"sun","theme_mode":"dark","theme_accent":"indigo","language":"de"}],
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
		str(row, "theme_mode") != "dark" || str(row, "theme_accent") != "indigo" || str(row, "language") != "de" {
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

const openLoopsOwnExport = `{"format":"opentodo-export","version":1,
  "projects":[],"tasks":[],"labels":[],"sections":[],"reminders":[],"views":[],"comments":[],
  "user_prefs":[{"id":"me","method":"companion"}],
  "review":[{"id":"me","completed_at":1760600000000,"daily_at":1760700000000,"monthly_at":1760000000000,"focus_date":"2026-10-17","focus":"a,b"}],
  "project_prefs":[{"id":"p1","feed_seen_at":5,"reviewed_at":1760500000000}],
  "encryption":null}`

// TestOwnExportRestoresOpenLoopsFields (open-loops-method D2, D4, D5): an own
// export brings the method preference, the rhythm fields and the per-project
// review stamps to a new account; a second import skips them.
func TestOwnExportRestoresOpenLoopsFields(t *testing.T) {
	h := newHarness(t)
	job := h.run(openLoopsOwnExport, Options{})
	if job.Status != StatusDone || job.Totals.Written != 3 {
		t.Fatalf("job = %+v", job)
	}
	ctx := context.Background()
	if row, _ := h.sync.Get(ctx, h.uid, "user_prefs", "me"); str(row, "method") != "companion" {
		t.Fatalf("prefs = %v", row)
	}
	row, _ := h.sync.Get(ctx, h.uid, "review", "me")
	if string(row["daily_at"]) != "1760700000000" || string(row["monthly_at"]) != "1760000000000" || str(row, "focus_date") != "2026-10-17" || str(row, "focus") != "a,b" {
		t.Fatalf("review = %v", row)
	}
	if row, _ := h.sync.Get(ctx, h.uid, "project_prefs", "p1"); string(row["reviewed_at"]) != "1760500000000" {
		t.Fatalf("project prefs = %v", row)
	}
	plan, err := h.svc.Preview(ctx, h.uid, []byte(openLoopsOwnExport), Options{})
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range plan.Rows {
		if r.Outcome != OutcomeSkip {
			t.Fatalf("second import row = %+v", r)
		}
	}
}
