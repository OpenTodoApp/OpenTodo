# Design

## Context

- **Rules are personal:** `rule` resolves to the author's personal scope (`internal/sync/scope.go`, `uniqueIDs`), fires only on its author's own batches (`automation-rules` "Event triggers"), and the REST check refuses a move into or out of a shared project.
- **Sharing** (`project-sharing`, `internal/sync/scope.go`, `members.go`): entities with a `project_id` are "project children" (`task`, `section`, `field`, `note`) that live in their project's scope once it is shared; `CanWrite` decides per role (viewer reads; editor writes tasks, sections, fields, notes and the project's note; admin also project fields; owner everything). The first share relabels the children (`share`). There is no "unshare". Encrypted accounts cannot share a project, but they can be members of other accounts' shared projects, which are plaintext (`end-to-end-encryption`).
- **Routines as they shipped:** `routines-engine` (steps, availability, run records with `run_as`, device `rule:<id>`, `ApplyStrict` as the run-as user), `routines-editor` and `routines-editor-page` (the page, History, all runs, the Inbox card), `routines-dynamic-data` (data flows from the trigger and earlier steps; task-acting steps take lists; no hand-picked task by default), `routines-find-scope` (#736: Find tasks and schedule conditions leave out the Trash and archived projects unless `archived` is on), `routines-starters` (#738), `routines-ai-step` part 1 (AI steps, proposals, Apply without asking which an agent can never turn on).
- **Owner decisions** (DECISIONS.md "Routines"): shared routines belong to a project, are created and edited by editors and admins, run with the permissions of whoever last turned them on, count AI tokens to that person, and the run log names them; routines are dynamic, not static; selectors are anchored pickers, never centred modals; agents can never turn on Apply without asking.

## Decisions

**D1. `rule.project_id`.** Additive, nullable string. `null` is a personal routine, exactly as today. A project id makes the routine a project child (`projectChild` in `scope.go`): it lives in that project's scope once the project is shared, syncs to every member and converges by last-writer-wins per field like a task. A routine of an unshared personal project stays in the author's personal scope and behaves as a personal routine until the project is shared; the first share relabels it with the project's tasks (`share`, seq kept). Moving a routine across scopes (changing `project_id` from or to a shared project) is refused with `scope_change`, as for tasks. Entity id ownership is unchanged: a rule id is still unique on the server (the generic project child path looks in every scope).

**D2. Who writes it.** `CanWrite` adds `rule` for editors and admins (owners write everything): they create, edit, reorder, turn on and off and delete a shared routine. A viewer reads it and its runs; the server refuses a viewer's ops (`forbidden`) and returns the winning values so the device drops its change. A shared project holds at most 50 live routines (REST and MCP create check); the per-account limit of 50 counts personal routines only.

**D3. It acts only in its project.** A shared routine's run reads a world bounded to its project: only the project's tasks, sections and the project itself. So Find tasks, filter queries, the schedule condition's matching tasks, due and overdue triggers, Get one task and the trigger's task can only be the project's (the find scope of `routines-find-scope` applies inside it; an archived project's routine finds nothing unless `archived` is on). Before anything is written or proposed, every planned change is checked: a task (stored or created) must stay in the project, a section must be the project's, a note or comment must belong to the project or one of its tasks, and the project itself only through its note; anything else fails the run with "A shared routine acts only in its project <name>". At save, REST and MCP refuse a shared routine whose trigger, condition or steps name another project, a label, or a move out of the project.

Not available in a shared routine (availability reason `not_in_shared`, "Not available in a shared routine"): Favourite, Set today's focus, Start and Stop timer, Tracked time, Create project, Update project, Create a project from a template, Create labels, Email me, Send a webhook. Labels are personal to each member, so label triggers, label conditions and label changes are refused at save. Email project members is not offered yet (reason `not_yet`, follow-up change `routines-shared-email`, #741, see D8).

Event triggers of a shared routine fire on batches of **any** member that touch the project's tasks, not only the run-as person's (the point of a shared routine: "when anyone adds a task to Releases"). Imports, undos, the routine's own batches and the chain depth limit are excluded as for every routine. `assigned.to_me` means assigned to the run-as person. The observer enqueues one event per run-as person of the project's enabled routines, marked with the project (`rule_events.for_project`), so the worker runs only that project's routines for it; the person's personal rules still fire for their own batches only.

**D4. Run-as person.** When the server materialises a winning `enabled: true` for a shared routine (observed after commit), it records that op's author as the run-as person (`rule_state.run_as`, `run_as_since`) and clears any pause. Every event, schedule, due and overdue run:

- happens only while the run-as person is still the project's owner, admin or editor (checked before each run; see D9), and the world is that person's view of the project;
- writes through `ApplyStrict` as the run-as person with device `rule:<rule-id>`, so the role is checked again at writing and the run can never do more than that person can do now, and never more than an editor (D3);
- is recorded with `run_as`; the routine's row and every run name them ("Runs as Alice", "Ran as Alice").

**Run now** and **Test** by a member run as the person who asked (they chose to run it now, with their own role and their own AI allowance); viewers cannot run a shared routine (403 `forbidden`). A shared routine that nobody has turned on yet does not run on its own.

Personal routines keep `run_as` = the author.

**D5. Edits by another member pause it.** When a winning change to `trigger`, `condition`, `steps`, `actions`, `ai_apply` or `ai_budget` of a shared routine is authored by someone other than the run-as person, the server pauses it (`rule_state.paused_reason = edited_by_other`, `paused_by` = the editor) unless the same batch also turns it on (then the editor becomes the run-as person). Runs stop until someone turns it off and on again, and that person becomes the run-as person. Renaming, reordering and switching on or off do not pause. The editor says so before saving such an edit: "Saving pauses this routine: it runs as Alice. Turn it on again afterwards to run it as you." The pause is server state decided by the winning ops the server observed, so every device reads the same answer from `GET /api/v1/me/rules`.

Alternative considered: keep running Bob's edit with Alice's permissions until she notices. Rejected: Bob could spend Alice's AI tokens or act with her role through steps she never approved.

**D6. AI in shared routines.** AI steps run with the run-as person's assistant, routines consent, monthly allowance and the routine's daily budget, and usage is recorded for that person (the run's world is theirs). Apply without asking counts only when the winning `ai_apply = "auto"` op was authored by the run-as person (otherwise the AI mode reads as fallback `not_run_as` and runs are proposals); D5 already pauses the routine when someone else changes it. Agents can never turn it on (unchanged). Proposals belong to the run-as person: they appear in that person's Inbox card and are applied with their role; other members see the run in History as "Waiting for Alice's review".

**D7. Runs for members.** A shared routine's runs carry the project (`rule_runs.project_id`). Every member, viewers included, sees them in the routine's History, the all-runs page (`GET /api/v1/me/rules/runs`) and the run detail; all touched items are the project's, so no per-item filter is needed (an item since moved away renders as "Task you cannot see" from local data). Undo run is offered to editors and above and writes as the person undoing (their role is checked by `ApplyStrict`); a viewer's undo is refused with 403. A non-member gets 404 `not_found`. The Inbox card and the bell for failures stay with the run-as person, who is responsible for the routine; the other members are told only when it pauses (D9).

**D8. Email project members and Notify members: later.** The catalogue's Email project members step and a Notify me recipient "the project's members" need a per-member stop link and per-member delivery limits; they move to the follow-up change `routines-shared-email`. Until then Email project members is unavailable with reason `not_yet` and Notify me reaches the run-as person.

**D9. When the run-as person loses access.** After a membership change through the member routes (role change, removal, leaving) the server checks the project's routines; and before every run it checks again (this covers group and workspace changes and deleted or disabled accounts). A routine whose run-as person is no longer a member pauses with `run_as_left`; one whose run-as person is now a viewer pauses with `run_as_viewer`. The project's owner, admins and editors (the run-as person excluded) get an in-app notification `routine_paused_shared`: "Weekly chores paused: Alice no longer edits Household. Turn it on to run it as you." A routine of a project in the Trash does not run; purging the project removes its routines with its other children.

**D10. Encryption degrades explicitly.** Shared projects are plaintext, so a shared routine runs on the server even when the run-as person's account is end-to-end encrypted: its world is the plaintext project, its comments are plaintext, and its own name and steps are written in plaintext by every client (the web app's encryption follows the routine's scope, like a task's). If a shared routine still carries an encrypted text (written by an older client), its run fails with reason `encrypted` ("This routine's text is encrypted: open it and save it again"). The run-as person's encrypted personal data is never read: the run's world holds only the project.

**D11. CLI and MCP.** `ot routine list` gains PROJECT and RUNS AS columns; `ot routine create --project <name|id>` (or a `project` key in the file) creates a routine of a project; `ot routine show` names the project and the run-as person. MCP `create_routine` takes `project` (id or name) and `list_routines`/`get_routine` include `project_id` and `run_as`; every write goes through `ApplyStrict` as the token's user, so a viewer's agent is refused like the viewer. Agents still cannot turn on Apply without asking.

**D12. Web.** "New routine" on the Routines page opens an anchored menu **Where**: "Just me" or each shared project where the user is editor or above (no centred modal); without such a project it opens the editor directly. A routine of a project shows the project as a chip in its row and in the editor's header with "Runs as Alice" (or "Not turned on yet"), the pause reasons of D5 and D9 as one line, and for a viewer the editor is read-only ("Only editors can change this routine"). Saving an edit of a routine that runs as someone else shows the D5 notice inline above Save. Add step marks the D3 steps "Not available in a shared routine". The project's menu gains **Routines**, opening the Routines page filtered to the project (`/routines?project=<id>`, a removable filter chip). Six languages. The word pickers and the condition editor are not touched.

## Data model impact

- `rule.project_id` (`kNullableString`, default `null`), additive; regenerated `opSchema.ts`, contract fixture.
- Server state, added by a Go column step (`store.migrateRoutinesShared`, because `ALTER TABLE ADD COLUMN` cannot be repeated): `rule_state.run_as`, `run_as_since`, `paused_by`; `rule_runs.project_id`; `rule_events.for_project`. Pause reasons `edited_by_other`, `run_as_left`, `run_as_viewer`; AI fallback `not_run_as`; availability reasons `not_in_shared`, `not_yet`; notification kind `routine_paused_shared`.
- Existing personal rules are untouched (`project_id` null).

## Size and memory

No new dependency. Server: one indexed query per batch that touches a shared project's tasks, a bounded copy of the world per shared routine run, one membership check per run. Web: well under 2 KB gzip in the lazy routines chunk; the project menu item is in the main bundle (a few dozen bytes).

## Interface budget

- **Chrome rows:** unchanged (the editor header gains one meta line inside the header).
- **Sidebar destinations:** none; the project's menu gains one item.
- **Scroll regions and shortcuts:** unchanged.

## Open questions

- **Pause on another member's edit.** Default chosen: an edit of trigger, condition, steps or AI settings by someone else pauses the routine until someone turns it on again (and becomes the run-as person).
- **Run now by another editor.** Default chosen: runs as the person who pressed it.
- **Inbox card for members.** Default chosen: failures and proposals stay with the run-as person; members see History and get the pause notification.
- **Labels in shared routines.** Default chosen: not available (labels are personal to each member).
- **Email project members and Notify members.** Moved to `routines-shared-email`.
