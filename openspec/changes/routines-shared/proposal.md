# Routines: routines that belong to a shared project

## Why

Rules are personal today, and they refuse to act on shared projects (`automation-rules` "Rule validation": "rules act only on personal projects"). Households and small teams share projects (`project-sharing`) and want the project itself to carry its routines: "every Monday, the chores of the week go to whoever has the fewest", "when a task in Releases gets the label blocked, notify the editors", "on Friday, email the members what was finished". The owner decided (DECISIONS.md, "Routines", 2026-10-31): shared routines belong to a project, are created and edited by editors and admins, run with the permissions of whoever last enabled it, count AI tokens to that person, and the run log names them.

## What Changes

- **A routine can belong to a shared project.** The `rule` entity gains an additive `project_id`; a routine with one lives in its project's sharing scope (like a task), syncs to every member, and is created and edited by the owner, admins and editors; viewers see it and its runs, read-only. Personal routines (no `project_id`) are unchanged.
- **It acts only inside its project.** Every target of a shared routine (tasks, sections, the project's note) must be in its project; Find tasks and filter queries are limited to it; steps that act on personal things are not available in a shared routine (favourite, today's focus, timers, create or update a project, a project from a template, labels, Email me, Send a webhook). Notify me gains a recipient (the person it runs as, or the project's members), and **Email project members** becomes available (members with a verified address, each able to stop them for that routine).
- **It runs as whoever last turned it on, never more.** The server records the author of the winning `enabled: true` as the routine's **run-as person**; every run uses that person's current role in the project and stops at what an editor may do (no member, sharing or project settings changes, as for every routine). The run log and the routine's row name them ("Runs as Alice").
- **Edits by another member pause it.** When someone other than the run-as person changes the routine's trigger, condition, steps or AI settings, the routine pauses ("Edited by Bob: turn it on to run it as you"), so nobody's permissions or AI tokens are used for steps they did not approve; whoever turns it on becomes the run-as person.
- **AI in shared routines:** AI steps use the run-as person's assistant, consent, allowance and the routine's daily budget; tokens count to that person. "Apply without asking" counts only when the run-as person turned it on.
- **Runs for members:** members see a shared routine's runs in its History, the all-runs page and the Inbox card, limited to runs whose touched items they can see; every member's card shows failures, the editors' bells receive them.
- **When the run-as person loses access** (leaves, is removed, becomes a viewer, the project is unshared, the account is disabled or deleted), the routine **pauses** with the reason, and the project's owner, admins and editors are told (bell and Inbox card). Deleting the project tombstones its routines.
- Six languages; the project's menu gains **Routines** (the project's routines on the Routines page, filtered).

Not **BREAKING**: one additive field; additive server state; new reasons; no new route except member-facing filters on existing ones; no new environment variable.

## Out of scope

- Routines that act across several shared projects, or a shared project and someone's personal projects.
- Workspace-level routines.
- Running as a service account or a bot user.
- Shared routines on encrypted accounts' personal data (shared projects are plaintext; `end-to-end-encryption`).
- Fetch-URL and RSS steps (AGENTS.md rule 5).

## Roadmap

Advances milestone **1.1 "Routines"**, item `routines-shared`, the last of five. **Depends on** `routines-engine`, `routines-editor` and `routines-ai-step`. GitHub issue: [#662](https://github.com/OpenTodoApp/OpenTodo/issues/662).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `routines` (new with `routines-engine`): ADDED "Routines of a shared project", "A shared routine acts only in its project", "Runs as whoever last turned it on", "Edits by another member pause the routine", "AI in shared routines", "Shared routine runs for members", "When the run-as person loses access", "Email project members".
- `project-sharing`: ADDED "Routines in shared projects".

## Impact

- **Op schema and sync:** `rule.project_id` (nullable string) in `internal/sync/ops.go`; `scope.go` (`rule` with a `project_id` as a project child; `CanWrite` for owner, admin and editor; `scope_change` refused); `members.go` (first share relabels the project's routines, leaving, removal and role changes pause routines run as that person, deleting a shared project tombstones them); regenerated `opSchema.ts`, contract fixture.
- **Server:** `internal/rules` (run-as person, the project bound, pause reasons `run_as_left`, `run_as_viewer`, `edited_by_other`), `internal/ruleval` (availability in shared routines), `internal/notify` (`routine_paused_shared`), `internal/mail` (members' messages and per-routine stop), `internal/httpapi` (runs filtered by visibility), the runs migration column `run_as` from `routines-engine`.
- **Web:** the editor (project picker for a new routine, "Runs as" line, the pause notice), the project's menu, runs and the Inbox card for members, six catalogs.
- **Size:** no new dependency; a few hundred bytes in the routines chunk. Server: one row of state per shared routine.
