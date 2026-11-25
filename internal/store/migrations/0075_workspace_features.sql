-- Feature switches per workspace (OpenSpec change `workspace-feature-switches`,
-- design D2): workspaces gain a nullable `features` column holding a JSON object
-- {feature id: false}. NULL and a missing key read as on, so no workspace changes
-- at upgrade. Directory data like the name and icon: never an op, written only by
-- PATCH /api/v1/workspaces/{id}. The column is the Go step
-- store.migrateWorkspaceFeatures, because ALTER TABLE ADD COLUMN cannot be
-- repeated (see 0037).
SELECT 1;
