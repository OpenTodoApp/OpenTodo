package store

import (
	"context"
	"database/sql"
	"fmt"
)

// routinesAIColumns are the columns OpenSpec change routines-ai-step adds to
// existing tables (migration 0053_routines_ai.sql has its new tables).
var routinesAIColumns = []struct{ table, name, def string }{
	// The automatic fallback to proposals (design D5): why and when (server
	// time, compared with the winning op of rule.ai_apply), and the failed
	// runs in a row.
	{"rule_state", "ai_fallback_reason", "TEXT NOT NULL DEFAULT ''"},
	{"rule_state", "ai_fallback_at", "INTEGER NOT NULL DEFAULT 0"},
	{"rule_state", "ai_failures", "INTEGER NOT NULL DEFAULT 0"},
	// A run's AI tokens (counts only) and whether it applied an AI result
	// without asking (the Inbox card always lists those, design D4).
	{"rule_runs", "tokens", "INTEGER NOT NULL DEFAULT 0"},
	{"rule_runs", "ai_auto", "INTEGER NOT NULL DEFAULT 0"},
	// A device run (design D7, D9): the device it was sent to, and when.
	{"rule_runs", "device_id", "TEXT NOT NULL DEFAULT ''"},
	{"rule_runs", "dispatched_at", "INTEGER NOT NULL DEFAULT 0"},
	{"rule_step_runs", "tokens", "INTEGER NOT NULL DEFAULT 0"},
	// "Run my routines on this device" and what the device announced (D7).
	{"relay_devices", "routines", "INTEGER NOT NULL DEFAULT 0"},
	{"relay_devices", "capabilities", "TEXT NOT NULL DEFAULT ''"},
	// The disclosure version the person accepted for routines (D10); 0 = none.
	{"assistant_consent", "routines_version", "INTEGER NOT NULL DEFAULT 0"},
}

// migrateRoutinesAI adds the routines-ai-step columns when missing.
func migrateRoutinesAI(ctx context.Context, db *sql.DB) error {
	for _, c := range routinesAIColumns {
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
	return nil
}
