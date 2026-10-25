# Design: import-workspace

## Context

Workspaces (change `workspaces`) partition projects, labels, saved views and project-less tasks by the additive `workspace_id` field; null means the default workspace, and `sync.Partition` decides where an entity belongs (a task follows its project, a sub-project its root). The importer plans field writes and writes them as ops with device `import`; undo tombstones what a job created.

## Decisions

**D1. One option, the workspace id.** `Options.Workspace` holds an id. The server checks it against `sync.Service.Workspaces(user)`: an id that is not one of the account's workspaces is refused with 400 `invalid_input` ("workspace: no such workspace in your account"), so a workspace the account is not in looks exactly like one that does not exist (workspaces "Non-member"). Every role (owner, admin, member) may create projects in a workspace (the workspaces spec puts no role limit on creating projects), so there is no 403 case. The CLI resolves names to ids locally.

**D2. What carries the workspace.** In a foreign import, every created project, label and view gets `workspace_id` = the target, and every created task without a project gets it too; tasks in a project follow the project and get no field. The default workspace writes no field (absent means default), so the op footprint of a default import is unchanged and older clients agree. Sections, reminders, attachments, time entries and custom field values follow their task or project.

**D3. Matching stays inside the target.** Existing projects and labels are reused by name only when they are in the target workspace (by `sync.Partition`), and the "possible duplicate" fingerprint of a project-less task includes the workspace, so importing "Call Bob" into Work is not skipped because Personal's Inbox has one. This also applies without the option (the target is then the default workspace), which stops an import from reusing another workspace's project by name.

**D4. Own export: "As in the export" by default.** Without the option, the own export keeps its mapping (by id, then name, else created, else default with a note). With the option, the mapping is skipped: every project, label, view and project-less task row is rewritten to the target (null for the default), no workspace is created, and the preview notes "Everything goes into Work; the export's workspaces are not created." Rows whose id already exists and are skipped stay where they are; overwritten rows move, because `workspace_id` is one of their fields.

**D5. Target project and workspace.** When both are given, the target project must be in the target workspace (400 otherwise); the web picker lists only that workspace's projects and clears a choice that is not in it.

**D6. Undo.** Unchanged: undo tombstones created entities by id, wherever they are.

**D7. Web.** A `<select>` like the screen's other options (the screen is a form of selects; a workspace list is short and needs no search), labelled "Workspace", shown when the device has more than one cached workspace. Foreign files default to the current workspace; own exports offer "As in the export" first and default to it. The preview adds one line: "3 new projects into Work" or "Everything goes into Work". With one workspace the select is hidden and no option is sent.

**D8. CLI.** `ot import <file>` reads the file and sends multipart like the web app. `--dry-run` sends the preview, which writes nothing, and prints totals and notes; otherwise it starts the job and polls `GET /import/jobs/{id}` until it is no longer running. The workspace comes from the global `--workspace` / `OPENTODO_WORKSPACE` / profile workspace; only an explicit choice is sent, so an own export keeps "As in the export" when none is set. Flags: `--format`, `--existing`, `--duplicates`, `--time-zone`. Read-only mode, read and agent tokens are refused by the existing write gate before the import starts.

## Data model

No new field: `workspace_id` on project, label, view and task exists. Job options gain `workspace` (stored in the job's options JSON). No migration.

## Interface budget

Import screen only: one more select in the existing options grid and one line in the preview (no new row of chrome above any list, no new scroll region, no shortcut). Task properties and sidebar unchanged.

## Size

No dependency. A few hundred lines of Go and TypeScript; bundle change well under 1 kB gzip.
