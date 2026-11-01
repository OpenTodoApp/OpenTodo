package store

import (
	"context"
	"testing"
)

// routines-engine 2.9: rule runs written before the routine columns read
// with their defaults (run id from the row, source from the key, one step).
func TestMigrateRoutineRunsOldRows(t *testing.T) {
	ctx := context.Background()
	db, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, q := range []string{
		`DROP TABLE rule_runs`,
		`CREATE TABLE rule_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, rule_id TEXT NOT NULL, user_id TEXT NOT NULL, occurrence_key TEXT NOT NULL,
			task_id TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL, outcome TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', changes_json TEXT NOT NULL DEFAULT '[]', depth INTEGER NOT NULL DEFAULT 1)`,
		`INSERT INTO rule_runs (rule_id, user_id, occurrence_key, at, outcome) VALUES ('r', 'u', 'sched:2026-10-01T08:00', 1, 'applied'), ('r', 'u', 'evt:3:t', 2, 'applied'), ('r', 'u', 'overdue:t:2026-10-01', 3, 'failed')`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	for range 2 { // idempotent
		if err := migrateRoutineRuns(ctx, db); err != nil {
			t.Fatal(err)
		}
	}
	rows, err := db.Query(`SELECT run_id, source, run_as, steps_count, writes, failed_step, batches_json, undone_at IS NULL FROM rule_runs ORDER BY id`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	want := []string{"r1 schedule", "r2 event", "r3 due"}
	i := 0
	for rows.Next() {
		var runID, source, runAs, batches string
		var steps, writes, failed int
		var notUndone bool
		if err := rows.Scan(&runID, &source, &runAs, &steps, &writes, &failed, &batches, &notUndone); err != nil {
			t.Fatal(err)
		}
		if got := runID + " " + source; got != want[i] || runAs != "u" || steps != 1 || writes != 0 || failed != -1 || batches != "[]" || !notUndone {
			t.Fatalf("row %d: %s %s %d %d %d %s %v", i, got, runAs, steps, writes, failed, batches, notUndone)
		}
		i++
	}
	if i != 3 {
		t.Fatalf("%d rows", i)
	}
}
