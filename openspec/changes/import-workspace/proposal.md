# Import into a chosen workspace

## Why

People keep personal and work tasks in different apps and want to bring each into its own workspace (issue #349). Today every import from another app, a CSV file or the generic JSON formats lands in the account's default workspace, and only OpenTodo's own export places items in workspaces (by the export's own mapping). Moving dozens of imported projects one by one afterwards is the only way to put a work export into "Work".

## What Changes

- The import options gain `workspace`: the id of one of the importing account's workspaces. Every project, label, saved view and project-less task the import creates goes into that workspace; name matching (an existing project or label reused by name) and duplicate detection only look at that workspace. Unknown workspaces and workspaces the account is not a member of are refused with 400 `invalid_input`, like an unknown target project; a target project in another workspace is refused the same way. Without the option, imports go to the default workspace as today.
- OpenTodo's own export keeps its per-workspace mapping by default ("As in the export"); with `workspace`, everything goes into that one workspace and the export's workspaces are neither matched nor created.
- The Import screen shows a Workspace choice when the account has more than one workspace, defaulting to the workspace open in the app (own exports default to "As in the export"); the target-project picker lists that workspace's projects, and the preview names the target ("12 new projects into Work").
- `ot import <file>` in the CLI: previews with `--dry-run`, otherwise runs the job and waits for it; the global `--workspace` (or `OPENTODO_WORKSPACE`, or the profile's workspace) names the target. Listed in `ot schema`, `ot help` and completion.
- Docs: import guide, workspaces guide, CLI reference, CHANGELOG.

Out of scope: choosing a workspace per project inside one import, mapping several source accounts to several workspaces in one run, and moving the items of an earlier import (Undo and import again).

Advances ROADMAP items `data-import` and `workspaces`.

## Capabilities

- `data-import`: Import into a chosen workspace; Workspace choice on the Import screen (added).
- `cli-client`: Import command (added).

## Impact

- API: one additive import option (`workspace`), no new route. Op log format unchanged: imported entities carry the existing `workspace_id` field. Not **BREAKING**.
- No new dependency, environment variable or setting. Binary and bundle size change by a few kilobytes.
