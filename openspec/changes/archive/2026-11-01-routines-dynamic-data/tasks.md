# Tasks

Prerequisites: `routines-engine` and `routines-editor` are archived. The editor tasks (group 2) start once `routines-ai-step` part 2 (#720) is merged or closed.

## 1. Engine and vectors (PR 1)

- [x] 1.1 Step tables (`internal/ruleval/steps.go`, `web/src/lib/rules/steps.ts`): `take.from` adds `all`, `take.n` optional (default 1); a project literal on `of` of `note_text`, `append_to_note` and `clear_note`; kinds `date` (input `date`, output Date) and `project_of` (input `task`, output Project); `create_tasks.parent` (Task, reference only; an error next to `project`); `split_lines.only: open_checkboxes`; verify `go test ./internal/ruleval/...` and `npm test -- steps`
- [x] 1.2 Step vectors (`steps.vectors.json`): Add a comment, Start a timer and Notify me over Tasks; Take into Add a comment; Repeat with `item` into Add a comment; Pick all; take without n; `of` with a project literal; `date`; `project_of` and its for-each refusal; `parent` and `parent` with `project`; the two-lists for-each error; verify both checkers pass the same vectors (`go test ./internal/ruleval/...`, `npm test -- steps`)
- [x] 1.3 The run (`internal/rules`): `take` with `all`; `of` literal; `split_lines.only`; `date` resolved in the user's zone and day start; `project_of` with the Inbox value and `not_found` for project-only steps; `parent` through the registry's `parent_id`; Find tasks with a query or view reading completed tasks when `filter.MentionsState`; verify `go test ./internal/rules/...` (the scenarios "Waiting since today", "Meeting notes into the task's project", "Subtasks from a note", "What I finished this week", "Completed tasks")
- [x] 1.4 Device preview (`web/src/lib/rules/preview.ts`): Pick all and the default n, `date`, `project_of`, open checkboxes, per-task previews ("Would add 4 comments", "Would add to 3 notes", note text of each task); names of the new kinds in `sentence.ts` and the six catalogs; verify `npm test -- rules`
- [x] 1.5 Use-case suite, engine part: `web/src/lib/rules/usecases.json` with the rows of design D12 that need only group 1 (1–13, 15, 17–29), seeded data and expected writes; `internal/rules/usecases_test.go` runs each through a real run and compares writes exactly; `web/src/lib/rules/usecases.test.ts` type-checks each with the TypeScript checker; verify `go test ./internal/rules -run TestUseCases` and `npm test -- usecases`

## 2. Editor (PR 2)

- [x] 2.1 Wiring (`web/src/lib/rules/draft.ts`): `nearestFlowing(draft, place, input)` (item, step above, earlier outputs, trigger; `fits` includes per-task); `newStep` fills the main input with it, inside blocks too; verify `npm test -- editor` (the scenarios "Find, Pick the first, comment", "Find, Repeat for each, comment", "The trigger's task", "Inside a Repeat")
- [x] 2.2 Pickers (`web/src/app/routines/words.tsx`): chip order item → outputs → trigger, the manual trigger shown as "the task you run it on", "Find tasks…" for task inputs, "A specific task…" folded last for one-task inputs, `InsertAbove` without Get a task, placeholder "choose which tasks"; verify a happy-dom test ("Picker order", "A list fits a one-task input")
- [x] 2.3 Fixes (`web/src/lib/rules/fixes.ts`): "Use <nearest>" for missing and removed references, "Find tasks…" with nothing flowing, Repeat only for `for_each`, never Get a task; verify `npm test -- fixes` ("Empty task input", "Nothing flowing", "Removed step")
- [x] 2.4 Pick card: the mode menu (first, last, first N, last N, all, the ones where), switching `take` ⇄ `filter` with the same id, "In list order · Sort first", output names; Add step shows Pick and drops Filter from the groups, search "filter" finds Pick; verify a happy-dom test ("Where", "Sort first", "Last or all of them")
- [x] 2.5 Add step suggestions (`AddStep.tsx`): after Tasks (Change tasks, Add a comment, Pick, Sort, Count, Repeat), after Task (Change tasks, Add a comment, Get note text, Start a timer, Get the project of a task), after Lines (Create tasks, Pick, Count, Join, Sort, Add to a note), inside a Repeat by the item's type, first step by the trigger's output; Get a specific task never suggested; verify `npm test -- AddStep` ("Suggestions after tasks", "Suggestions after lines", "Not in suggestions")
- [x] 2.6 Save error (`RoutineEditor.tsx`): cleared on every edit, "needs at least one step" only on Save without steps; verify a happy-dom test ("No stale error")
- [x] 2.7 Sentences and names (`sentence.ts`): Pick, Get the date, Get the project of a task, Create subtasks, Get a specific task with "Always this task", "each task", "the task that triggered", "the task you run it on", "Parent task"; the six catalogs (`web/src/locales/*.json`); verify `npm test` and `make i18n-check`
- [x] 2.8 Stories and baselines: "Editor, pick then comment" (Find → Pick the first → Comment on the picked task), "Editor, repeat with each task", Groceries from a project note, Add step after lines; verify `make ui-check` and `make ui-lint`
- [x] 2.9 Use-case suite, editor part: `web/src/app/routines/usecases.test.tsx` builds rows 1, 2, 3, 4, 5, 6, 10, 20, 22 and 25 from their source step (Find tasks with its condition, or nothing; rows 15 and 28 use the same wiring, covered by `web/src/lib/rules/flow.test.ts`) and asserts the saved steps equal the case, no `get_task`, no `{task}` literal, no "choose which tasks"; verify `npm test -- usecases`

## 3. Conditions and schedules (with PR 2: the catalogs are shared)

- [x] 3.1 Condition predicate `unchanged` (`internal/ruleval` match, `web/src/lib/rules/match.ts`): the server's last-changed time from `fields.ts` per task, the device's from `clocks`; `match.vectors.json` with a last-changed time per task; verify `go test ./internal/ruleval/... ./internal/rules/...` and `npm test -- match` ("Not changed for 30 days", "A change resets it")
- [x] 3.2 Condition rows (`ConditionFields`): "Not changed for days", its live count on the device (field clocks, `lastChangedDay`), the condition summary; six catalogs; verify `npm test -- flow` and `make ui-lint`
- [x] 3.3 Trigger member `schedule.month_days` (Go and TypeScript validation, exactly one of `weekdays` and `month_days`), the scheduler's next firing (`internal/rules/schedule.go`) with the existing watermark; verify `go test ./internal/ruleval/... ./internal/rules/...` with a stepped clock ("Days of the month", "First and last of the month", "A day the month lacks")
- [x] 3.4 When card: "Every week" / "Every month", days 1 to 31 and "Last day", the trigger summary "every month on 1, 15 and the last day at 09:00"; verify `npm test -- flow`
- [x] 3.5 Use-case rows 14, 16 and 30 in `usecases.json` (engine; row 16 seeds tasks last changed weeks ago); verify `go test ./internal/rules -run TestUseCases` and `npm test -- usecases`

## 5. Pickers next to the word (PR 3, design D13)

- [x] 5.1 `pickers.tsx`: ChoicePopover (anchored Popover with the Combobox list, groups, search, keys, focus back), InlineText (auto-growing, "/" and "+ value", «name» chips, Enter/blur/Escape), Inspector (in the card from 1024 px, `Dialog placement="bottom"` below); verify `npm test -- usecases`
- [x] 5.2 `wordPicker.tsx`: the word's mode (choice, text, inspector), the choices (flowing values, conversions, fixed targets, Find tasks…, A specific task…, Remove) and the small fields; StepCard's inspector slot; `WordButton` `haspopup`/`expanded`; verify `npm test -- routines` and `make ui-lint`
- [x] 5.3 `Dialog` `placement="bottom"` and its story (Dialog/Bottom); verify `make ui-check`
- [x] 5.4 Stories "Word list, open" and "Text in place", baselines; the layout check's `routine-word-list` on the routine page (seed without a hand-picked task) at 360/768/1280 px; verify `node scripts/e2e-layout.mjs` (ONLY=routine-page, WIDTHS=360,768,1280)
- [x] 5.5 Six catalogs; docs (`docs/routines.md`, the editor); verify `make i18n-check` and `make docs-check`

## 4. CLI, MCP, docs, starters, archive (PR 4)

- [x] 4.1 `ot routine show` sentences for Pick (`pick first`, `pick last 3`, `pick all`, `pick where`; other kinds by name and inputs) (`internal/cli/routine_pick_test.go`); verify `go test ./internal/cli/...`
- [x] 4.2 MCP descriptions of `create_routine`, `update_routine` and `run_routine.task_id` (D9); verify `go test ./internal/agenttools/... ./internal/mcp/...` (description golden)
- [x] 4.3 Docs: `docs/routines.md` (Steps and values, Pick, examples without a specific task), `docs/api.md` (kinds, inputs, `from: all`, `unchanged`, `month_days`), `docs/mcp.md`, `docs/automations.md`; verify `make docs-check`
- [x] 4.4 `routines-starters` design D3 table corrected per D11 (in the design PR), its check refusing `{task}` literals and `get_task` in starters (D2), and its dependency on this change; verify `make openspec-validate`
- [x] 4.5 CHANGELOG entry under Unreleased, ROADMAP row, archive the change (`npx -y @fission-ai/openspec@1.13.2 archive routines-dynamic-data --yes`); verify `make openspec-validate` and `make check`
