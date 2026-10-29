# Design: entity-id-ownership

## D1. One lookup over every scope

The resolver's lookups for tasks, sections, custom fields (`existingChildScope`), comments, attachments and time entries (`pairHome`) read `scope_fields` by `(entity, entity_id)` without a scope filter (the `scope_fields_entity` index serves it). The holders found go through `homeScope`:

- one holder: that scope when the author sees it, otherwise "" (refused, `forbidden`);
- no holder: the id is new and is placed as before (by the batch's `project_id`, or the task's scope for comments, attachments and time entries).

Projects and automation rules live in the author's personal scope (a project until it is shared). For them `claimable` refuses an id held only elsewhere. A shared project keeps its existing check (no role, no write). `uniqueIDs` names these two; labels, views, reminders, places, reviews and preferences stay per account because nothing on the server reads them across accounts and `project_prefs` is keyed by a shared project's id for every member.

The refusal is the ordinary `forbidden` refusal, with no restored value (`restoreOps` skips entities without a visible home), so a refused create and a refused write to an invisible entity look the same. Existence of an id is therefore observable only as "this write is forbidden", which was already the case for ids in project scopes.

## D2. Derived ids

Some ids are derived from other ids: a recurring occurrence's record is `NameID("occurrence", series + date)`. Someone who knows a series id can create the record first in a project shared with its owner, and the owner's completion would then land there. A batch that carries a `project_id` for a stored project child whose target scope differs from where the entity lives now has every op of that entity refused with `scope_change` (`resolver.misplaced`), so none of the device's fields reach the other scope. Before, only the `project_id` op was refused. For this to hold, every writer of a derived task id names the project: the server's occurrence record (`RecurringCompletion`) now always carries `project_id` (null when the series has none; the web client already sends it), and email to task (`NameID("email-task", user + Message-ID)`, where a sender can choose the Message-ID) sends `project_id: null`. Other derived ids include a secret or random part (issue connection ids, rule ids, agent token ids, the idempotency salt).

## D3. Data written before

Duplicates can exist from an earlier squat or from two accounts importing the same export. `homeScope` handles several holders:

- the entity belongs to the visible holder with the earliest op (`firstSeqs`: the lowest `seq` per scope through `op_scopes`), ties by rank;
- a write is refused when an older hidden holder shares a member with that visible holder (a squat on that member's data);
- disjoint copies (two personal scopes) keep working for each owner.

`Get`, `List` and the trash's `locate` use the same choice among the scopes the reader sees, so a reader is shown the copy their writes go to. This is computed only when an id has more than one holder, which no new data produces.

No migration rewrites duplicates. A squat cannot be told apart from a legitimate duplicate in every case, and removing ops from a shared scope would leave devices with rows the server no longer serves. After the upgrade the victim's edits stay private (D3), the squatter cannot write the copy, and a purge of the squatted copy leaves the victim's reminders alone (the reminder cascade skips reminders in a scope that holds its own task with that id). The operator can list duplicates with the query in the upgrade notes.

## D4. CalDAV resource names per account (L9)

`caldav_resources` becomes `(user_id, task_id) → name, uid` with `ON DELETE CASCADE` on the account. The migration copies each row to every account that sees its task (personal owner, or every member of the project scope). Reads and writes filter by the DAV user; purges still delete every account's row once the task is gone. CalDAV create already retried under a fresh id when its UID was refused; with D1 a UID that names another account's task is refused and gets a fresh id.

## D5. Workspace of a project (L10)

A `project.workspace_id` op is refused with `forbidden` unless the value is null, the author's default workspace, or a workspace with a `workspace_members` row for the author. `projectWorkspace` and `workspaceProjectIDs` read only the project's own record: the project scope of a shared project, or a personal copy whose account belongs to the named workspace.

## Data model, size

No op field changes. One migration replaces `caldav_resources`. No dependency; no effect on image size or memory.
