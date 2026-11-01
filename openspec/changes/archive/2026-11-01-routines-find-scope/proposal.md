# Routines: what Find tasks finds

## Why

The owner reported that a routine's Find tasks "is also finding deleted or archived tasks". It is: a run's Find tasks (by a condition, a filter query or a saved view) reads every task row that is not itself in the Trash, so it finds the tasks of **archived projects** and the tasks of **projects in the Trash** (deleting a project keeps its tasks' rows and hides them with the project, `trash-and-history` D2). The app never shows either in a cross-project list: the Filter view, saved views, Today and Upcoming leave archived projects out, and every list hides the tasks of a project in the Trash. A saved view therefore lists different tasks in a routine than on its own page, and a "Sunday overdue sweep" comments on tasks the user archived away. The editor's live preview leaves out the Trash's projects but not archived ones, so it disagrees with the run as well. A scheduled trigger with a condition ("the matching tasks") gathers tasks the same way.

## What Changes

- **One scope for the tasks a routine gathers.** Find tasks (all three forms), the matching tasks of a scheduled trigger with a condition (and the one-card scheduled rule's sweep), the editor's preview and the When card's count find a task only when the task is not in the Trash, its project (if any) is a project the user has that is not in the Trash, and that project is not archived. The rule is the app's own (`isTaskVisible` and `withoutArchived`), shared by the Go engine and the editor through `ruleval.InFindScope` / `inFindScope` and shared vectors.
- **Include archived projects, on purpose.** Find tasks gains an optional `archived` input (a yes/no literal, additive in both step catalogues). With it on, tasks of archived projects are found too. The card offers it as **Archived projects** in its menu; the CLI and MCP take it in the step JSON like every input, and the MCP steps description names it.
- **Deleted tasks are never found.** A task in the Trash, or in a project in the Trash, is out of reach of every routine step that gathers tasks; there is no option for it. Completed tasks keep their rule (a condition finds open tasks; a query or view follows the filter rule).
- Docs (routines, filters, API), strings in the six languages (the one label reuses an existing string), CHANGELOG.

Not **BREAKING**: no op or schema change, no route, no environment variable. The behaviour change (fewer tasks found by default) is the fix.

## Out of scope

- A filter keyword for archived projects (`archived`): the filter language has none, and the Filter view and saved views leave archived projects out everywhere; adding one would change those screens. The step's `archived` input covers the query and view forms (design D3).
- Event and date triggers (task created, due reached, overdue, …): they fire for one task, not a gathered list; unchanged.
- Steps that read a list they are given (Pick, Sort, Filter, Repeat) or one project's own tasks (an AI step's project context): they never widen the scope.

## Roadmap

A fix inside milestone **1.1 "Routines"**, after `routines-dynamic-data`; listed in the routines table of ROADMAP.md. GitHub issue: [#734](https://github.com/OpenTodoApp/OpenTodo/issues/734).

## Capabilities

### Modified Capabilities

- `routines`: a requirement for the scope of the tasks a routine gathers, and the `archived` input of Find tasks.

## Impact

- `internal/ruleval` (`InFindScope`, the `archived` input), `internal/rules` (find, trigger list, sweep), `internal/agenttools` (steps description and goldens), `web/src/lib/rules` (`inFindScope`, the input, the preview), `web/src/app/routines` (the label, the When count), vectors, use cases, docs.
- Bundle: a few hundred bytes. Binary: none measurable.
