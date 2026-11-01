# Routines: data flows, not hand-picked tasks

## Why

The owner tried the routines editor and wrote: "I want to set some filters to pick a list of tasks. Then I want to add a comment to 1 or more of the tasks, based on another filter (first, last, all of them, etc). Why do you want me to pick a specific task? Picking specific tasks in a routine isn't useful, because routines are dynamic, not static. If this mistake has been applied to the whole feature, you need to rethink it." (DECISIONS.md, "Routines are dynamic, not static", 2026-11-01, high priority.)

Two screens showed the problem:

1. **Only when I run it** → *Find tasks where due: earlier* (4 tasks) → *Get the task [choose a task]*, which the editor inserted to feed a comment step, in an error state ("Get a task needs a value here") → *Comment on …*. The page also said "A routine needs at least one step", although it had steps.
2. *Find tasks* → *Repeat for each item of the tasks* ("Would run 4 times") → inside it, *Comment on [choose a task]: [write a text]*, in an error state ("Add a comment needs a value here").

The audit (design, "Audit") found two kinds of cause:

- **(a) The engine already does it, but the editor hides it or leads away from it.** A step that takes one task and gets a list already runs once for each task (`routines-engine` D3, in both checkers and the run). Inside Repeat for each, the current item is already a value steps can read (`item`). *Take* already gives the first or last N. *Filter* already uses the condition rows of Find tasks. But the editor wires a new step to the step above only when the types are exactly equal, never to the loop's item or to the trigger. It names every task input "choose a task", opens a picker of single tasks first, inserts a static *Get the task* card as its only way to fill an empty input, leaves *Add a comment* out of the suggestions after a list, and keeps a save error on screen after the problem is gone.
- **(b) Real gaps in the model.** Some routines a reasonable user would expect can't be built at all: pick all of a list; read a project's note without looking the project up by name; today's date in a text; the project of a task; subtasks of a task; finding completed tasks with a filter query; tasks nobody has changed for 30 days; a monthly schedule.

This change makes data flow the default everywhere and closes those gaps. The test for it is a matrix of 33 realistic routines written as sentences. All 30 that are in scope must run as engine tests, and the important ones must also be built in the editor without a hand-picked task.

## What Changes

- **Task steps take lists, and that is the contract.** Every step that acts on tasks accepts the trigger's task, a list of tasks, or the loop's item. It runs once for each task (*Comment on the tasks* comments on each), and one task counts as a list of one. Nothing stored changes: the input names stay the same (`task`, `of`), and the engine already behaves this way. The catalogue, the editor, the CLI and MCP descriptions and the docs now say so. **(a)**
- **Pick.** *Take* becomes **Pick** in the interface: *Pick the first / the last / the first N / the last N / all of …*. Its mode menu also offers *… where <condition>*, which turns the card into a Filter step with the same condition rows as Find tasks, and back again. Sort stays its own card and comes before Pick. In the engine, `take` gains `from: "all"` and `n` becomes optional (default 1). **(b), small**; the rest is **(a)**.
- **The editor wires the flowing data.** A new step's main input is filled with the nearest value that fits: the loop's item inside Repeat for each ("↳ each task"), else the output of the step above or the nearest earlier one, else the trigger's task or tasks. A "fits" here includes a list for a one-task input. Pickers list the loop's item first, then earlier outputs, then the trigger. An empty input's fix is "Use *the tasks*" whenever a fitting value exists. Otherwise it's "Find tasks…", which inserts a Find tasks step above. **(a)**
- **Hand-picked tasks are secondary.** A specific task can still be chosen, but only through "A specific task…", folded at the end of a picker, and through *Get a specific task*, found by search alone. Neither is ever a default, a suggestion or an automatic fix. Saved routines that hold a specific task keep working unchanged. Fixed targets that are natural stay first-class: a project, section, label, saved view, webhook or template, and the user's own email address. **(a)**
- **Repeat for each needs no picking.** Steps added inside the loop read "each task" or "each line" by default. Repeat is offered for advanced cases, never as the fix for a list reaching a one-task input. **(a)**
- **The false "A routine needs at least one step" goes.** A save error clears on the next edit, and the editor only says a routine has no steps when it has none. **(a)**
- **Model gaps closed (b), each one small and additive:**
  - Get note text, Add to a note and Clear a note take a **project chosen in the picker**, as well as a task or a project from an earlier step.
  - **Get the date**: today, tomorrow, in N days or a date, for texts and comparisons.
  - **Get the project of a task**.
  - Create tasks can make **subtasks of a task**.
  - **Find tasks** with a filter query or a saved view follows the filter rule: open tasks unless the query names `completed` or `open`, so `completed = this week` finds what was finished.
  - A condition predicate **"not changed for N days"** (`unchanged`), shared by rules, Find tasks and Filter.
  - A schedule can run on **days of the month** (`month_days`, 1 to 31 or `last`) instead of weekdays.
- **Starters follow suit.** The planned starters of `routines-starters` are corrected to flow data and use the new steps (design D11).
- CLI (`ot routine show` sentences), MCP descriptions (`create_routine`, `update_routine`, `run_routine`), `docs/routines.md`, `docs/api.md`, `docs/mcp.md`. Strings in the six languages. Editor stories and visual baselines for the changed cards.

Not **BREAKING**: there are no new op fields, and no renamed or removed inputs or kinds. There are additive step kinds (`date`, `project_of`), additive inputs and enum values (`take.from: "all"`, `create_tasks.parent`, a project literal on `of`), one additive condition predicate and one additive schedule member. The op log format doesn't change, and there's no new environment variable. A device that predates this change shows a routine that uses a new kind, value or member as "Made with a newer version" (`automation-rules` "Rule entity"), as for any newer rule.

## Out of scope

- **Lists of projects** (for example "archive every project without open tasks"). Routines act on tasks; projects are fixed targets or come from a task. A Projects list type is a later change.
- **Relative changes to fields** ("raise the priority by one", "push the due date by a week"). They aren't idempotent: a re-run or a retry after Undo would compound them. A routine sets a priority or a date. Design D10 has the full reasoning.
- **A selection as the manual trigger** ("run this routine on the 5 tasks I selected"). A manual run reads one task, as today; a later change can let it read a selection.
- Fetching URLs or feeds, email to other addresses, scripts (`routines-engine`, "Out of scope", AGENTS.md rule 5).
- The AI steps and device runs (`routines-ai-step`), shared routines (`routines-shared`), the starter chooser and Describe it (`routines-starters`, which keeps its own scope; this change only corrects the starter table it plans).

## Roadmap

Advances milestone **1.1 "Routines"** as a correction of `routines-engine` and `routines-editor`, both shipped. It is inserted before `routines-starters` in the routines order, because the starters depend on it. GitHub issue: [#722](https://github.com/OpenTodoApp/OpenTodo/issues/722).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `routines`: MODIFIED "Step types" (one task is a list of one; the declared per-task contract), "Step catalogue" (Pick, Get the date, Get the project of a task, subtasks, project notes, completed tasks), "Sentence-card editor" (the Groceries example without a hand-picked task), "Pickers and output chips" (order, the loop's item, "A specific task…" folded), "Type errors with fixes" (fixes wire flowing data and never insert a picker), "Add step" (wiring and suggestions), "Test and save" (no stale save error); ADDED "Data flows by default", "Pick", "Use cases".
- `automation-rules`: MODIFIED "Rule validation" (`schedule.month_days`), "Conditions" (`unchanged`), "Time triggers" (days of the month).
- `filter-queries`: MODIFIED "Evaluation on the server for routines" (completed tasks for a query that names them).

## Impact

- **Server:** `internal/ruleval` (step table: `take`, `of`, `date`, `project_of`, `create_tasks.parent`; the condition predicate `unchanged`; the trigger member `month_days`), `internal/rules` (Pick all, the new steps, Find tasks over completed tasks, the scheduler's days of the month, a last-changed time per task from `fields.ts`), `internal/agenttools` (MCP descriptions), `internal/cli` (sentences).
- **Web:** `web/src/lib/rules/` (`steps.ts`, `match.ts`, the trigger check, `draft.ts` wiring, `fixes.ts`, `preview.ts`, `sentence.ts`), `web/src/app/routines/` (the Pick card, pickers, Add step, the save error, the When card's days of the month), the condition rows (`ConditionFields`), the device's last-changed time from the `clocks` table, six catalogs, stories and baselines.
- **Vectors:** `web/src/lib/rules/steps.vectors.json` (new kinds, inputs and per-task cases), `match.vectors.json` (`unchanged`), the trigger vectors, and a new use-case suite (design D12) run by Go against seeded data.
- **Docs:** `docs/routines.md`, `docs/api.md`, `docs/mcp.md`, `docs/automations.md` (days of the month, "not changed for").
- **Size:** no dependency. Web: about 1.5 KB gzip in the lazy routines chunk; first load unchanged. Server: a few KB of code; computing a task's last-changed time reads `fields` rows already indexed by entity, only for a condition that uses `unchanged`.
