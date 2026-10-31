# Design

## Context

- **Rules are personal:** `rule` resolves to the author's personal scope (`internal/sync/ops.go` comment), fires only on its author's own batches (`automation-rules` "Event triggers": "rules fire for their author's own batches only"), and the API refuses a project action on a shared project.
- **Sharing** (`project-sharing`, `internal/sync/scope.go`, `members.go`): entities with a `project_id` are "project children" living in their project's scope once shared; `CanWrite` decides per role (viewer reads; editor writes tasks and the project's note; admin also renames and manages members; owner deletes and transfers); first share relabels the children; leaving, removal and project deletion have defined effects. Shared projects are never encrypted.
- **Routines:** `routines-engine` (steps, availability, run records with `run_as`, the routine caller), `routines-editor` (editor, History, all runs, Inbox card with "shared routines show only runs touching what the member can see"), `routines-ai-step` (AI steps, proposals, auto mode whose effective state compares server state with the time of `ai_apply`'s winning op, daily budget).

## Decisions

**D1. `rule.project_id`.** Additive, nullable. `null`: a personal routine, exactly as today. A project id: the routine is a project child of that project (`scope.go`), so it lives in the project's scope, syncs to every member, and converges by last-writer-wins per field like any task. A routine may be created in a personal project too; it then behaves as personal until the project is shared, when the first-share relabel moves it into the shared scope with the project's tasks. Changing `project_id` to another scope is refused with `scope_change` (the editor offers "Copy to another project" instead: a new routine, paused).

**D2. Who writes it.** `CanWrite` for a routine of a shared project: owner, admin and editor create, edit, reorder, enable, disable and delete; a viewer reads it and its runs. The 50-routines limit counts a shared routine for the project (at most 50 per project), not for each member.

**D3. Acts only in its project.** For a routine with a `project_id`, the planner binds every step to that project:

- Find tasks searches only the project's tasks (a condition's `project` predicate is replaced by the project; a filter query is evaluated within the project); Get one task and the trigger's task must be in it.
- Writes may target only the project's tasks, its sections and its note: Create tasks always creates in it (a `project` input may name only it or be omitted), Change tasks may not move tasks out (`section` only within the project), Get note text and Append or Clear note may read or write the project's note and its tasks' notes.
- **Not available in a shared routine** (reason `not_in_shared`): Favourite, Set today's focus, Start and Stop timer, Tracked time, Create project, Update project (admin powers would mix with editor edits), Create a project from a template, Create labels and label changes or conditions (labels are personal to each member), Email me, Send a webhook (webhooks are personal targets the other editors cannot see).
- **Notify me** gains `to`: `run_as` (default) or `members` (every member of the project, the run-as person included); a notification to members is a kind members can mute per routine.
- **Email project members** (D8) becomes available.
- Event triggers of a shared routine fire on batches of **any** member that touch the project's tasks (not only the run-as person's), except batches written by routines of the same project at depth limits, imports and undo, as usual. This is the point of a shared routine ("when anyone labels a task blocked"); loop protection applies unchanged.

**D4. Run-as person.** The server keeps `rule_state.run_as` (a user id) and `run_as_since` (the server time): when it materialises a winning `enabled = true` for a shared routine, it records that batch's author as the run-as person. Every run of the routine:

- acts with the run-as person's **current** role in the project, checked at planning and at writing (`ApplyStrict` checks the author's role as for any member's batch), so it can never do more than that person can do now, and never more than an editor (D3);
- writes with device `rule:<rule-id>` and the run-as person as author; history reads "Routine (<name>), running as Alice";
- is recorded with `run_as`; the routine's row and every run name them ("Runs as Alice").

Personal routines keep `run_as` = the author (`routines-engine`).

**D5. Edits by another member pause it.** When a winning change to `trigger`, `condition`, `steps`, `ai_apply` or `ai_budget` is authored by someone other than the run-as person, the server pauses the routine (`rule_state.paused_reason = edited_by_other`, with the editor's id), and runs stop until someone turns it on: that person becomes the run-as person (D4). Renaming, reordering and `enabled` itself do not pause. The editor shows, before saving such an edit, "Saving pauses this routine: it runs as Alice. Turn it on after saving to run it as you." The pause is server state compared with op times, like the AI fallback, so devices converge.

Alternative considered: run edits by Bob with Alice's permissions until Alice notices. Rejected: Bob could spend Alice's AI tokens or act with her role through steps she never approved.

**D6. AI in shared routines.** AI steps use the run-as person's assistant: provider (the owner's or their own key), routines consent (`routines-ai-step` D10), monthly allowance, and the routine's daily budget; usage is recorded for that person. If the run-as person has no usable assistant or consent, AI steps are unavailable (`ai_no_consent`, shown to every editor with "Alice has not allowed AI in routines"). Shared projects are plaintext, so shared routines run on the server even when members have encrypted accounts. Auto mode counts only if the winning `ai_apply = "auto"` op was authored by the run-as person; otherwise runs are proposals, which any editor may review and apply (with their own role; items they may not write are skipped).

**D7. Runs for members.** `GET /api/v1/rules/{id}/runs`, `…/runs/{run}`, `GET /api/v1/me/rules/runs` and the Inbox card include a shared routine's runs for every member of its project, viewers included, filtered to runs whose touched ids the member can see (in practice all of them, since the routine acts only in the project; a task moved into a project the member cannot see later is shown by id as "Task you cannot see"). Undo run and proposals: editors and above. The Inbox card shows a shared routine's failures and waiting proposals to editors and above and its successes to everyone, under each member's own seen marker and settings; the bell's `routine_failed` goes to editors and above.

**D8. Email project members.** A step available only in a shared routine (and with outgoing email configured, not a demo): one plain-text `routine` message (`outgoing-email` "Routine email") to each member of the project with a verified address, in each member's language, with a line to stop these emails; a member who stops them is recorded (server state, `routine_mail_optout (rule_id, user_id)`) and receives no more from that routine. It counts one per recipient toward the routine's 10 per day and the account's 20 per day of the run-as person, and the mail service's limits.

**D9. When the run-as person loses access.** On leaving the project, removal, a role change to viewer, the project being unshared (the scope returns to the owner's personal scope; then the routine is the owner's and runs as the owner only after the owner turns it on), the account being disabled or deleted: the server pauses every routine of that project running as that person (`run_as_left`, `run_as_viewer`, `unshared`), and notifies the project's owner, admins and editors in app (`routine_paused_shared`, "Weekly chores paused: Alice no longer edits Household. Turn it on to run it as you.") and in their Inbox cards. Deleting the project tombstones its routines with the project's other children (`trash.go` cascade).

**D10. Editor.** "New routine" asks **Where**: "Just me" or a shared project where the user is editor or above (Combobox). A shared routine's editor shows "Runs as Alice" under the name, the pause notice of D5 before saving, and marks unavailable steps `not_in_shared`. The project's menu gains **Routines**, opening the Routines page filtered to the project. Six languages.

## Data model impact

- `rule.project_id` (kNullableString, default `null`), additive. A routine with a project id is a project child; first share relabels it; no field renamed.
- Server: `rule_state.run_as`, `run_as_since`, `paused_by`; `routine_mail_optout`; pause reasons `edited_by_other`, `run_as_left`, `run_as_viewer`, `unshared`; notification kind `routine_paused_shared`. Additive migration `NNNN_routines_shared.sql`.
- Existing personal rules are untouched (`project_id` null).

## Size and memory

No new dependency. Server: one more check per run (the run-as role) and per-project filtering of runs. Web: a few hundred bytes in the routines chunk.

## Interface budget

- **Chrome rows:** unchanged (the editor's header gains one line of text, "Runs as Alice", inside the header).
- **Sidebar destinations:** none; the project's menu gains an item.
- **Scroll regions and shortcuts:** unchanged.

## Open questions

- **Pause on another member's edit.** Default chosen: an edit of trigger, condition, steps or AI settings by someone else pauses the routine until someone turns it on (and becomes the run-as person). The owner may prefer runs to continue as the last enabler.
- **Labels in shared routines.** Default chosen: not available (labels are personal to each member).
- **Webhooks and Email me in shared routines.** Default chosen: not available; Email project members and Notify members instead.
- **Limit per project.** Default chosen: at most 50 routines per shared project.
- **Event triggers by any member.** Default chosen: a shared routine's event triggers fire on any member's changes in the project.
