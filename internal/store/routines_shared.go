package store

import (
	"context"
	"database/sql"
	"fmt"
)

// routinesSharedColumns are the columns OpenSpec change routines-shared adds
// to the rules engine's tables. Server state, never synced or exported.
var routinesSharedColumns = []struct{ table, name, def string }{
	// The run-as person of a shared routine (design D4): the author of the
	// winning enabled: true, and when the server saw it; paused_by names the
	// member whose edit paused it (D5).
	{"rule_state", "run_as", "TEXT NOT NULL DEFAULT ''"},
	{"rule_state", "run_as_since", "INTEGER NOT NULL DEFAULT 0"},
	{"rule_state", "paused_by", "TEXT NOT NULL DEFAULT ''"},
	// A shared routine's runs carry its project, so every member sees them (D7).
	{"rule_runs", "project_id", "TEXT NOT NULL DEFAULT ''"},
	// An event for a project's routines only (D3): any member's batch fires
	// them, never the run-as person's personal rules.
	{"rule_events", "for_project", "TEXT NOT NULL DEFAULT ''"},
}

// migrateRoutinesShared adds the routines-shared columns when missing (ALTER
// TABLE ADD COLUMN cannot be repeated, see 0037).
func migrateRoutinesShared(ctx context.Context, db *sql.DB) error {
	for _, c := range routinesSharedColumns {
		var exists int
		if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_table_info(?) WHERE name = ?`, c.table, c.name).Scan(&exists); err != nil {
			return err
		}
		if exists > 0 {
			continue
		}
		if _, err := db.ExecContext(ctx, `ALTER TABLE `+c.table+` ADD COLUMN `+c.name+` `+c.def); err != nil {
			return fmt.Errorf("add %s.%s: %w", c.table, c.name, err)
		}
	}
	_, err := db.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS rule_runs_project ON rule_runs (project_id, id) WHERE project_id != ''`)
	return err
}
