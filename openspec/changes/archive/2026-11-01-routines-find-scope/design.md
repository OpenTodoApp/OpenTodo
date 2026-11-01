# Design: routines-find-scope

## Context

A run loads the user's live task and project rows (`Sync.List(..., false)`: rows in the Trash are left out). `findTasks` kept the tasks without `deleted_at` and matched them; the query form handed the same rows to `internal/filter`. Nothing looked at the task's project. Two kinds of tasks slipped through:

- tasks of an **archived** project (`archived: true`): the Filter view and saved views (`compileView`), Today, Upcoming and the calendar leave them out (`withoutArchived`);
- tasks of a project **in the Trash**: deleting a project tombstones only the project; its tasks keep `project_id` and every list hides them (`isTaskVisible`, `trash-and-history` D2).

Evidence (a run of `find_tasks` against a live, an archived and a deleted project with one task each, plus a deleted task): the condition `{}` and the query `p4` both returned the live, the archived and the deleted project's task; only the task in the Trash was left out. The editor preview (`preview.ts`) reads `useOpenTasks()` (the Trash's projects already hidden) and so disagreed with the run on archived projects only.

## Decisions

**D1. One scope rule, the app's own.** A routine finds a task when:

1. the task's row is not in the Trash (`deleted_at` null), and
2. it has no project, or its project is one of the user's live project rows (not in the Trash), and
3. that project is not archived, unless the step asks for archived projects.

Only the task's own project counts. Archiving a project archives its sub-projects (`archiveProject`), and the app shows a non-archived child of an archived parent at the top level, so an archived ancestor alone does not hide a task (as `withoutArchived` and agenttools `visible`). A project id with no live row (in the Trash, or not visible to the user) is out, as agenttools `visible` treats it. A subtask whose parent is in the Trash but which is not itself (deleting a task in the app moves its subtasks too) follows the app: it is shown, so it is found. A task in a deleted section is a task with no section (`effectiveSection`), found as such.

Go: `ruleval.InFindScope(deleted bool, projectID string, projects map[string]bool, archived bool) bool`, `projects` mapping each live project id to its `archived` flag. TypeScript: `inFindScope(task, projects, archived)` in `web/src/lib/rules/stepData.ts`, with the same map. Shared vectors: a `find_scope` function in the `data` list of `steps.vectors.json`.

**D2. Where it applies.** Every place a routine gathers tasks from the whole account:

- `find_tasks` by a condition, a query and a view (`internal/rules/routine_steps.go`), using the run's view of projects (an Update project step that archived a project earlier in the run is seen);
- the matching tasks of a `schedule` trigger with a condition (`triggerValue`) and the one-card scheduled rule's sweep (`sweep`), with the world's projects;
- the editor: `findTasks` of the preview (and so the schedule trigger's sample list) and `useMatchCount` (the When card's count).

Steps that act on a list they receive (Pick, Sort, Filter, Repeat, Count, Set focus) never add tasks, so they need nothing. An AI step's project context lists that project's own open tasks: the project was chosen, so its archived flag does not matter (like an archived project's own list). Event and date triggers fire for one task and are unchanged.

**D3. Archived projects on purpose: an input, not a filter keyword.** `find_tasks` gains `archived` (literal bool, optional, additive in `internal/ruleval/steps.go` and `web/src/lib/rules/steps.ts`). It applies to all three forms. The filter language has no archived keyword, and the Filter view and saved views hide archived projects whatever the query; a keyword would either change those screens or mean something only inside routines, so a query or view in a routine lists what it lists on its own page, and the input widens it. The card offers it from its menu (the existing optional-input mechanism) labelled **Archived projects** (an existing string in all six catalogues), shown as yes or no. Deleted tasks get no option: the Trash is restorable, and a routine acting on it would act on tasks the user removed.

**D4. Completed tasks are unchanged.** A condition finds open tasks; a query or view follows the filter rule. The scope applies on top.

## Data model

None: no op field, no schema change. `archived` is an additive input of the step catalogue; the web app ships inside the server binary, so both checkers accept it together. A device still on an older cached app that syncs a routine using it shows the step as having an unknown input until it updates, the same as every input added before.

## Interface budget

One optional word on the Find tasks card, only when added from its menu. No new chrome, shortcut or scroll region.

## Size

A few hundred bytes of web code; no dependency.
