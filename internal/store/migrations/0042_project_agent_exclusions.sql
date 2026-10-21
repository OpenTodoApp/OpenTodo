-- agent-planning-fields (design D9): projects kept away from AI assistants. A row
-- means the project's own switch is on; sub-projects inherit it from the nearest
-- ancestor with a row. Server state like membership: never an op, never synced,
-- never in the export.
CREATE TABLE IF NOT EXISTS project_agent_exclusions (
  project_id TEXT PRIMARY KEY,
  set_by     TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
