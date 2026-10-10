# Proposal

## Why

Deletion is already a tombstone and every edit is already in an append-only log, yet neither is visible to the user: a deleted task cannot be brought back, a mistaken edit cannot be inspected, and the data a user "owns" includes history they cannot see or dispose of. This change turns existing data into three user-facing promises: nothing deleted is gone until you say so (Trash with restore), every task's past is inspectable (revision history from the op log), and you can really remove data when you want to (permanent purge). It also closes a housekeeping gap: projects whose work is all done pile up in the sidebar unless archived by hand.

## What Changes

- A Trash view listing deleted tasks and projects from local data, newest first, with restore and permanent delete actions, keyboard reachable (`g x`).
- Restore: a task returns to its project, or to the Inbox if that project is still deleted; a project returns with the tasks it held at deletion time. To make the latter possible, deleting a project no longer moves its open tasks to the Inbox; they keep their project reference and are hidden while the project is in the Trash. (MODIFIES "Delete a project".)
- Deleted tasks remain hidden from every view except the Trash. (MODIFIES "Soft delete".)
- Automatic archive of completed projects: completing the last open task of a project offers one-key archiving, and a project with tasks but no open task for 30 days is archived automatically, with a notice and per-device opt-out.
- Per-task and per-project revision history derived from the server's operation log through a new authenticated read endpoint, shown as a timeline of field changes with device and time; any earlier value can be restored by writing a new operation. Offline, the history panel states that it needs a connection.
- Permanent purge of a trashed item or of the whole Trash: the server removes the entity's operations and current values, keeps a small purge marker so that devices drop their local copy on next sync and so that late operations for the purged entity are discarded instead of resurrecting it. Items are purged automatically after a retention period (default 30 days, optional `OPENTODO_TRASH_RETENTION_DAYS`, `0` disables).

Out of scope: history for sections, labels or views (the mechanism is generic; UI lands with those entities when needed), undo of bulk cascades beyond restoring each item from the Trash, text diffs inside long descriptions (the timeline shows before and after values), restoring purged data (purge is final by definition), compaction of the op log for storage reasons (a separate change; purge markers are compatible with it), activity feeds for shared projects (`comments-and-activity`).

This change advances ROADMAP.md section 3, "Trash with restore, auto-archive of completed projects, revision history from the op log".

Not **BREAKING**: `OPENTODO_TRASH_RETENTION_DAYS` is optional with a working default. The op log format is unchanged; the sync response gains an optional `purged` array that older clients ignore. Note: `project-hierarchy` also modifies "Delete a project" (sub-project promotion); whichever change lands second merges both texts.

## Capabilities

### New Capabilities
- `trash-and-history`: the Trash view, restoring tasks and projects, automatic archive of completed projects, revision history and value restore, permanent purge with its convergence rules, and automatic purge after retention.

### Modified Capabilities
- `task-management`: "Soft delete" now excludes the Trash view from "hidden from all views".
- `project-organization`: "Delete a project" no longer moves open tasks to the Inbox; tasks stay with the trashed project and are hidden until restore or purge.

## Impact

- Server: `GET /api/v1/{projects|tasks}/{id}/history`, `DELETE /api/v1/{projects|tasks}/{id}/purge`, `POST /api/v1/trash/purge`; new `purges` table (migration `0002`); sync response `purged` array and discard of operations for purged ids; retention job at startup and daily; optional env var.
- Client: Trash view, restore helpers, hidden-while-trashed filtering for tasks of deleted projects, history panel, purge handling in the sync loop, auto-archive logic and notices, per-device opt-out in `meta`.
- Docs: `docs/sync.md` (purge markers, `purged` field), `docs/api.md`, `docs/self-hosting` (retention variable), README.
- No new dependencies; bundle growth expected around 6 KB gzipped; one extra tiny table on the server.
