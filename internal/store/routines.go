package store

import (
	"context"
	"database/sql"
	"fmt"
)

// routineRunColumns are what a routine run records on rule_runs
// (routines-engine D10), with their definitions.
var routineRunColumns = []struct{ name, def string }{
	{"run_id", "TEXT NOT NULL DEFAULT ''"},
	{"source", "TEXT NOT NULL DEFAULT 'event'"},
	{"run_as", "TEXT NOT NULL DEFAULT ''"},
	{"test", "INTEGER NOT NULL DEFAULT 0"},
	{"steps_count", "INTEGER NOT NULL DEFAULT 1"},
	{"writes", "INTEGER NOT NULL DEFAULT 0"},
	{"duration_ms", "INTEGER NOT NULL DEFAULT 0"},
	{"undone_at", "INTEGER"},
	// The server timestamp of the undo's ops: the history labels that batch
	// "Routine (<name>) undone".
	{"undo_ts", "INTEGER"},
	// What the run wrote, for Undo: [{"e": entity, "id": id, "f": [fields], "c": created}].
	{"batches_json", "TEXT NOT NULL DEFAULT '[]'"},
	{"failed_step", "INTEGER NOT NULL DEFAULT -1"},
}

// migrateRoutineRuns adds the routine columns to rule_runs when missing.
// Rows written before read: run_id from their row id, run_as as the rule's
// user, source from their occurrence key, one step and no writes counted. A Go
// step because ALTER TABLE ADD COLUMN cannot be repeated (see 0037).
func migrateRoutineRuns(ctx context.Context, db *sql.DB) error {
	var has int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_table_info('rule_runs') WHERE name = 'failed_step'`).Scan(&has); err != nil {
		return err
	}
	if has > 0 {
		return migrateRoutineSeen(ctx, db)
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	for _, c := range routineRunColumns {
		var exists int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_table_info('rule_runs') WHERE name = ?`, c.name).Scan(&exists); err != nil {
			return err
		}
		if exists > 0 {
			continue
		}
		if _, err := tx.ExecContext(ctx, `ALTER TABLE rule_runs ADD COLUMN `+c.name+` `+c.def); err != nil {
			return fmt.Errorf("add rule_runs.%s: %w", c.name, err)
		}
	}
	for _, q := range []string{
		`UPDATE rule_runs SET run_id = 'r' || id WHERE run_id = ''`,
		`UPDATE rule_runs SET run_as = user_id WHERE run_as = ''`,
		`UPDATE rule_runs SET source = CASE
			WHEN occurrence_key LIKE 'sched:%' THEN 'schedule'
			WHEN occurrence_key LIKE 'due:%' OR occurrence_key LIKE 'overdue:%' THEN 'due'
			ELSE 'event' END`,
		`CREATE UNIQUE INDEX IF NOT EXISTS rule_runs_run_id ON rule_runs (run_id)`,
		`CREATE INDEX IF NOT EXISTS rule_runs_user_at ON rule_runs (user_id, at)`,
	} {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			return fmt.Errorf("routine runs: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	return migrateRoutineSeen(ctx, db)
}

// routineSeenColumns are what the Inbox card adds to rule_runs (OpenSpec
// change routines-editor, design D10 and D12): dismissed_at, a success line
// dismissed on any device; seen_at, when the server first found the user's
// seen marker past a failed run (retention keeps it 30 days after that).
var routineSeenColumns = []struct{ name, def string }{
	{"dismissed_at", "INTEGER"},
	{"seen_at", "INTEGER"},
}

// migrateRoutineSeen adds the routines-editor columns to rule_runs when missing.
func migrateRoutineSeen(ctx context.Context, db *sql.DB) error {
	for _, c := range routineSeenColumns {
		var exists int
		if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_table_info('rule_runs') WHERE name = ?`, c.name).Scan(&exists); err != nil {
			return err
		}
		if exists > 0 {
			continue
		}
		if _, err := db.ExecContext(ctx, `ALTER TABLE rule_runs ADD COLUMN `+c.name+` `+c.def); err != nil {
			return fmt.Errorf("add rule_runs.%s: %w", c.name, err)
		}
	}
	return nil
}
