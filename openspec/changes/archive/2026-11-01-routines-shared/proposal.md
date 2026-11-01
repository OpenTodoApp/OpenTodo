# Routines: routines that belong to a shared project

## Why

Rules are personal today, and they refuse to act on shared projects (`automation-rules` "Rule validation"). Households and small teams share projects (`project-sharing`) and want the project itself to carry its routines: "every Monday, the chores of the week go to whoever has the fewest", "when anyone adds a task to Releases, give it a date in three days", "every Friday, comment on the overdue tasks". The owner decided (DECISIONS.md, "Routines", 2026-10-31): shared routines belong to a project, are created and edited by editors and admins, run with the permissions of whoever last turned them on, count AI tokens to that person, and the run log names them.

## What Changes

- **A routine can belong to a project.** The `rule` entity gains an additive `project_id`; a routine of a shared project lives in its project's sharing scope (like a task), syncs to every member, and is created and edited by the owner, admins and editors; viewers see it and its runs, read-only. Personal routines (no `project_id`) are unchanged. At most 50 routines per shared project.
- **It acts only inside its project.** A shared routine's run sees only its project's tasks and sections; every write must stay in the project; label triggers, label conditions and steps that act on personal things are not available (favourite, today's focus, timers, tracked time, create or update a project, a project from a template, create labels, Email me, Send a webhook). Its event triggers fire on any member's changes in the project.
- **It runs as whoever last turned it on, never more.** The server records the author of the winning `enabled: true` as the routine's **run-as person**; every scheduled or event run checks that person's current role and writes as them with device `rule:<id>`. The routine's row and every run name them ("Runs as Alice"). Run now and Test run as the member who asks; viewers cannot run it.
- **Edits by another member pause it** until someone turns it on again, so nobody's permissions or AI tokens are used for steps they did not approve.
- **AI:** AI steps use the run-as person's assistant, consent and allowance; Apply without asking counts only when the run-as person turned it on; agents still never can.
- **Runs for members:** every member sees a shared routine's runs in History and on the all-runs page; editors and above can undo a run; the run-as person keeps the Inbox card and the bell.
- **When the run-as person loses edit access** (leaves, is removed, becomes a viewer, the account goes), the routine pauses and the project's owner, admins and editors are notified.
- **Encryption degrades explicitly:** shared projects are plaintext, so shared routines run on the server even for an encrypted run-as person and never read their personal data; a shared routine with encrypted text fails with a clear reason.
- **CLI and MCP:** `ot routine create --project`, PROJECT and RUNS AS columns; MCP `create_routine` takes `project`, list and get include the project and the run-as person.
- **Web:** "New routine" asks Where (Just me or a shared project) in an anchored menu, the editor shows the project and "Runs as", the pause notice before saving, `not_in_shared` marks in Add step; the project's menu gains **Routines**. Six languages.
- Email project members and a "members" recipient for Notify me move to the follow-up change `routines-shared-email`.

Not **BREAKING**: one additive field; additive server state; new reasons; no new route; no new environment variable.

## Out of scope

- Routines that act across several shared projects, or a shared project and someone's personal projects.
- Workspace-level routines; running as a service account or a bot user.
- Email project members and Notify members (`routines-shared-email`).
- Fetch-URL and RSS steps (AGENTS.md rule 5).

## Roadmap

Advances milestone **1.1 "Routines"**, item `routines-shared`. **Depends on** `routines-engine`, `routines-editor`, `routines-dynamic-data`, `routines-find-scope` and `routines-ai-step`. GitHub issue: [#662](https://github.com/OpenTodoApp/OpenTodo/issues/662).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `routines`: ADDED "Routines of a shared project", "A shared routine acts only in its project", "Runs as whoever last turned it on", "Edits by another member pause the routine", "AI in shared routines", "Shared routine runs for members", "When the run-as person loses access", "Shared routines and encryption", "Shared routines in the CLI and MCP", "Shared routines in the editor".
- `project-sharing`: ADDED "Routines in shared projects".

## Impact

- **Op schema and sync:** `rule.project_id` in `internal/sync/ops.go`; `scope.go` (`rule` as a project child, `CanWrite`), `members.go` (first share relabels routines), `trash.go` (purge with the project); regenerated `opSchema.ts`, `contentfields.go`, contract fixture.
- **Server:** `internal/rules` (run-as person, the bounded world and the write check, events from any member, pauses, AI mode), `internal/ruleval` (availability in shared routines), `internal/notify` (`routine_paused_shared`), `internal/store` (column step), `internal/httpapi` (checks, runs for members, undo by role, membership hook), `internal/agenttools`, `internal/cli`.
- **Web:** Routines page and editor, Add step, the project menu, `lib/rules`, e2ee scope of a rule, six catalogs.
- **Size:** no new dependency; under 2 KB gzip in the routines chunk.
